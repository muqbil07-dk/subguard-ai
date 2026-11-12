import { describe, expect, it, vi } from 'vitest'
import { createAssistantService } from './assistantService.js'

// Mocked HTTP responses verify the adapter; they are not live Gemini evidence.
function fixture() {
  const fact = { id: 'monthly-inr', kind: 'monthly_estimate', label: 'Synthetic monthly recurring estimate', amountMinor: '279692', currency: 'INR', asOf: '2026-11-11' }
  return { mode: 'synthetic_demo', synthetic: true, label: 'Synthetic Demo Data', dataset: { id: 'fixed-fixture', asOf: '2026-11-11' }, ai: { provider: 'gemini', generated: true }, context: { asOf: '2026-11-11', facts: [fact], summary: [{ currency: 'INR', activeCount: 5, monthlyMinor: '279692', yearlyMinor: '3356300', upcomingMinor: '559600' }], warnings: [] }, response: { answer: 'Consider reviewing the linked synthetic facts.', keyFacts: [fact], evidence: [], recommendations: [], warnings: [], confidence: 'grounded' } }
}
const reply = (data, ok = true, status = 200) => ({ ok, status, json: async () => data })

describe('synthetic assistant HTTP boundary', () => {
  it('sends only the trimmed question to the dedicated endpoint without account credentials', async () => {
    const data = fixture(), fetcher = vi.fn().mockResolvedValue(reply({ data }))
    const api = createAssistantService({ fetcher, baseUrl: 'https://api.example/api/' })
    expect(await api.sendMessage({ message: '  Review my spending  ', userId: 'forged', facts: [{ amountMinor: '1' }] })).toEqual(data)
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.example/api/demo/assistant')
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(options.body)).toEqual({ message: 'Review my spending' })
    expect(options.headers).not.toHaveProperty('Authorization')
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it.each(['', '  ', 'hi', 'x'.repeat(1001)])('rejects an invalid question before making a request', async message => {
    const fetcher = vi.fn(), api = createAssistantService({ fetcher })
    await expect(api.sendMessage({ message })).rejects.toThrow('between 3 and 1000')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('normalizes the existing versioned account API base for the isolated demo route', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply({ data: fixture() }))
    await createAssistantService({ fetcher, baseUrl: 'https://api.example/api/v1/' }).sendMessage({ message: 'Review my spending' })
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example/api/demo/assistant')
  })

  it('preserves honest provider errors and deterministic error context without inventing a response', async () => {
    const data = fixture(); data.ai.generated = false; delete data.response
    const fetcher = vi.fn().mockResolvedValue(reply({ error: { code: 'AI_DISABLED', message: 'AI assistance is disabled.' }, data }, false, 503))
    const error = await createAssistantService({ fetcher }).sendMessage({ message: 'Review my spending' }).catch(value => value)
    expect(error).toMatchObject({ code: 'AI_DISABLED', status: 503, demo: data })
    expect(error.demo).not.toHaveProperty('response')
  })

  it('handles an unreachable API without returning a canned model answer', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(createAssistantService({ fetcher }).sendMessage({ message: 'Review my spending' })).rejects.toMatchObject({ code: 'DEMO_UNAVAILABLE', message: expect.stringContaining('No AI response was received') })
  })

  it('handles a request deadline explicitly', async () => {
    const fetcher = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })))
    await expect(createAssistantService({ fetcher, timeoutMs: 5 }).sendMessage({ message: 'Review my spending' })).rejects.toMatchObject({ code: 'AI_TIMEOUT' })
  })

  it('rejects unreadable response JSON', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('bad JSON') } })
    await expect(createAssistantService({ fetcher }).sendMessage({ message: 'Review my spending' })).rejects.toMatchObject({ code: 'INVALID_API_RESPONSE' })
  })

  it.each([
    data => { data.ai.generated = false },
    data => { data.synthetic = false },
    data => { data.context.summary[0].monthlyMinor = 'not money' },
    data => { data.response.keyFacts[0] = { ...data.context.facts[0], id: 'invented-evidence' } },
    data => { data.response = null },
    data => { data.context.scenarios = [{ currency: 'INR' }] },
    data => { data.context.facts[0].merchant = { unexpected: 'object' } },
    data => { data.response.summary = { unexpected: 'object' } },
  ])('rejects successful-looking responses with invalid provenance, facts or shape', async change => {
    const data = fixture(); change(data)
    const fetcher = vi.fn().mockResolvedValue(reply({ data }))
    await expect(createAssistantService({ fetcher }).sendMessage({ message: 'Review my spending' })).rejects.toMatchObject({ code: 'INVALID_API_RESPONSE' })
  })

  it('does not attach unlabelled financial context from an error', async () => {
    const data = fixture(); data.ai.generated = false; data.synthetic = false
    const fetcher = vi.fn().mockResolvedValue(reply({ error: { message: 'Unavailable' }, data }, false, 503))
    const error = await createAssistantService({ fetcher }).sendMessage({ message: 'Review my spending' }).catch(value => value)
    expect(error).not.toHaveProperty('demo')
  })
})
