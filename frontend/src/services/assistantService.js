import { supportedCurrencies } from '../utils/finance.js'
import { AI_REQUEST_TIMEOUT_MS } from '../utils/aiTimeouts.js'

const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value, max = 6000) => typeof value === 'string' && value.length <= max
const money = value => typeof value === 'string' && /^-?\d{1,19}$/.test(value) && BigInt(value.replace('-', '')) <= 9223372036854775807n
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
function fact(value) {
  if (!object(value) || !text(value.id, 100) || !value.id || !text(value.kind, 100) || !value.kind) return false
  if (['label', 'merchant', 'basis', 'asOf', 'date', 'frequency'].some(key => value[key] !== undefined && !text(value[key], 2000))) return false
  const amounts = ['amountMinor', 'previousAmountMinor', 'differenceMinor'].filter(key => value[key] != null)
  return amounts.every(key => money(value[key])) && (!amounts.length || supportedCurrencies.includes(value.currency))
}
function demoData(value, generated) {
  if (!object(value) || value.mode !== 'synthetic_demo' || value.synthetic !== true || value.label !== 'Synthetic Demo Data') return false
  if (!object(value.dataset) || !text(value.dataset.id, 100) || !date(value.dataset.asOf)) return false
  if (!object(value.ai) || value.ai.provider !== 'gemini' || value.ai.generated !== generated) return false
  const context = value.context
  if (!object(context) || !date(context.asOf) || !Array.isArray(context.facts) || context.facts.length > 100 || !context.facts.every(fact)) return false
  if (!Array.isArray(context.summary) || context.summary.length > 5 || !context.summary.every(row => object(row) && supportedCurrencies.includes(row.currency) && Number.isInteger(row.activeCount) && row.activeCount >= 0 && ['monthlyMinor', 'yearlyMinor', 'upcomingMinor'].every(key => money(row[key]) && !row[key].startsWith('-')))) return false
  if (context.scenarios !== undefined && (!Array.isArray(context.scenarios) || context.scenarios.length > 30 || !context.scenarios.every(item => object(item) && text(item.subscriptionId, 100) && text(item.merchant, 200) && supportedCurrencies.includes(item.currency) && ['before', 'after', 'potentialReduction'].every(key => object(item[key]) && money(item[key].monthlyMinor) && !item[key].monthlyMinor.startsWith('-') && money(item[key].yearlyMinor) && !item[key].yearlyMinor.startsWith('-')) && Array.isArray(item.assumptions) && item.assumptions.length <= 10 && item.assumptions.every(value => text(value, 2000)) && item.requiresUserConfirmation === true && item.state === 'potential'))) return false
  return Array.isArray(context.warnings) && context.warnings.length <= 30 && context.warnings.every(value => text(value, 2000))
}
function validResponse(value) {
  if (!demoData(value, true) || !object(value.response) || !text(value.response.answer) || !value.response.answer.trim()) return false
  const response = value.response
  if (response.summary !== undefined && !text(response.summary)) return false
  if (response.generatedAt !== undefined && (!text(response.generatedAt, 100) || !Number.isFinite(new Date(response.generatedAt).getTime()))) return false
  const known = new Set(value.context.facts.map(item => item.id))
  if (!['keyFacts', 'evidence'].every(key => Array.isArray(response[key]) && response[key].length <= 30 && response[key].every(item => fact(item) && known.has(item.id)))) return false
  if (!Array.isArray(response.recommendations) || response.recommendations.length > 15 || !response.recommendations.every(item => object(item) && text(item.title, 200) && text(item.explanation) && (item.suggestedNextAction === undefined || text(item.suggestedNextAction, 2000)) && Array.isArray(item.evidence) && item.evidence.every(value => fact(value) && known.has(value.id)) && (!item.estimatedSavings || (object(item.estimatedSavings) && supportedCurrencies.includes(item.estimatedSavings.currency || item.currency) && money(item.estimatedSavings.monthlyMinor) && money(item.estimatedSavings.yearlyMinor) && (item.estimatedSavings.assumptions === undefined || text(item.estimatedSavings.assumptions, 2000) || (Array.isArray(item.estimatedSavings.assumptions) && item.estimatedSavings.assumptions.every(value => text(value, 2000)))))))) return false
  return Array.isArray(response.warnings) && response.warnings.length <= 30 && response.warnings.every(value => text(value, 2000))
}

/** Public synthetic-only API; never sends account tokens or browser financial data. */
export function createAssistantService({ fetcher = globalThis.fetch, baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api', timeoutMs = AI_REQUEST_TIMEOUT_MS } = {}) {
  const demoBase = baseUrl.replace(/\/$/, '').replace(/\/api\/v1$/, '/api')
  return {
    async sendMessage({ message }, { signal } = {}) {
      if (typeof message !== 'string' || message.trim().length < 3 || message.trim().length > 1000) throw new Error('Enter a question between 3 and 1000 characters.')
      const deadline = AbortSignal.timeout(timeoutMs)
      let response
      try {
        response = await fetcher(`${demoBase}/demo/assistant`, {
          method: 'POST', credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: message.trim() }),
          signal: signal ? AbortSignal.any([deadline, signal]) : deadline,
        })
      } catch {
        throw Object.assign(new Error(deadline.aborted ? 'The demo assistant timed out. No AI response was received. Retry your question.' : 'The demo assistant API is unavailable. No AI response was received. Start the backend in explicit demo mode and retry.'), { code: deadline.aborted ? 'AI_TIMEOUT' : 'DEMO_UNAVAILABLE' })
      }
      let result
      try { result = await response.json() } catch { throw Object.assign(new Error('The demo assistant returned an unreadable response. Please retry.'), { code: 'INVALID_API_RESPONSE' }) }
      if (!response.ok) {
        const failure = Object.assign(new Error(text(result?.error?.message, 500) ? result.error.message : 'The demo assistant is unavailable. No AI answer was generated.'), { code: result?.error?.code || 'DEMO_UNAVAILABLE', status: response.status })
        if (demoData(result?.data, false)) failure.demo = result.data
        throw failure
      }
      if (!validResponse(result?.data)) throw Object.assign(new Error('The demo assistant returned an invalid response. No AI answer was displayed.'), { code: 'INVALID_API_RESPONSE' })
      return result.data
    },
  }
}

export const assistantService = createAssistantService()
