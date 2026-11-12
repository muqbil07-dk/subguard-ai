import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUp, Bot, Check, CircleAlert, FileText, LockKeyhole, MessageSquare, Plus, RefreshCw, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { Badge, Button, PageHeader } from '../components/ui.jsx'
import { assistantService } from '../services/assistantService.js'
import { formatMoney } from '../utils/finance.js'
import './intelligence.css'
import './demo-assistant.css'

const prompts = [
  'How much am I spending on subscriptions every month?',
  'Which subscriptions could I review to save money?',
  'What renewals are coming up?',
  'Which subscriptions contribute most to my spending?',
  'What happens to my annual spending if I remove a subscription?',
]

function Facts({ facts = [], title = 'Supporting synthetic facts' }) {
  if (!facts.length) return <p className="muted tiny">No supporting facts were supplied for this answer.</p>
  return <details className="demo-ai-evidence"><summary><FileText size={14} aria-hidden="true" />{title}<span>{facts.length}</span></summary><ul>{facts.map(item => <li key={item.id}>
    <strong>{item.label || item.kind}</strong>{item.merchant && <span>{item.merchant}</span>}
    {item.amountMinor != null && item.currency && <b>{formatMoney(item.amountMinor, item.currency)}</b>}
    {item.previousAmountMinor != null && item.currency && <span>Previous amount: {formatMoney(item.previousAmountMinor, item.currency)}</span>}
    {item.differenceMinor != null && item.currency && <span>Change: {formatMoney(item.differenceMinor, item.currency)}</span>}
    {item.frequency && <span>Billing: {item.frequency}</span>}{item.date && <span>Date: {item.date}</span>}
    {item.predicted && <Badge tone="amber">Predicted · not paid</Badge>}{item.unused === true && <span>Explicitly marked unused in the synthetic fixture</span>}
    {item.basis && <span>{item.basis}</span>}{item.asOf && <small>Snapshot: {item.asOf}</small>}
  </li>)}</ul></details>
}

function Reply({ result }) {
  const response = result.response
  return <div className="demo-ai-reply"><Badge tone="green">Gemini interpretation</Badge><p>{response.answer}</p>
    {response.summary && response.summary !== response.answer && <p className="muted">{response.summary}</p>}
    {response.generatedAt && <time dateTime={response.generatedAt}>{new Date(response.generatedAt).toLocaleString('en-IN')}</time>}
    <Facts facts={response.keyFacts} title="Backend-calculated key facts" />
    {!!response.evidence?.length && <Facts facts={response.evidence} />}
    {!!response.recommendations?.length && <div className="demo-ai-recommendations"><h3>Recommendations to review</h3>{response.recommendations.map((item, index) => <article key={item.id || index}><strong>{item.title}</strong><p>{item.explanation}</p>
      {item.estimatedSavings && <p>Potential reduction: {formatMoney(item.estimatedSavings.monthlyMinor, item.estimatedSavings.currency || item.currency)} / month · {formatMoney(item.estimatedSavings.yearlyMinor, item.estimatedSavings.currency || item.currency)} / year</p>}
      {item.estimatedSavings?.assumptions && <p className="tiny muted">{Array.isArray(item.estimatedSavings.assumptions) ? item.estimatedSavings.assumptions.join(' ') : item.estimatedSavings.assumptions}</p>}
      <Facts facts={item.evidence} title="Recommendation evidence" />{item.suggestedNextAction && <p className="tiny muted">{item.suggestedNextAction}</p>}
    </article>)}</div>}
    {!!response.warnings?.length && <details className="demo-ai-limitations"><summary>Limitations and uncertainty</summary>{response.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
  </div>
}

function Scenarios({ scenarios = [] }) {
  if (!scenarios.length) return null
  return <details className="demo-ai-evidence"><summary><FileText size={14} aria-hidden="true" />Hypothetical spending scenarios</summary><ul>{scenarios.map(item => <li key={item.subscriptionId}>
    <strong>{item.merchant}</strong><span>Current annualized estimate: {formatMoney(item.before.yearlyMinor, item.currency)}</span>
    <span>Estimate if removed: {formatMoney(item.after.yearlyMinor, item.currency)}</span>
    <b>Potential annual reduction: {formatMoney(item.potentialReduction.yearlyMinor, item.currency)}</b>
    <span>User confirmation required · no cancellation performed</span>{item.assumptions.map((assumption, index) => <small key={index}>{assumption}</small>)}
  </li>)}</ul></details>
}

export default function Assistant() {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const endRef = useRef(null), inputRef = useRef(null), busyRef = useRef(false), activeRef = useRef(true), requestRef = useRef(null)

  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; requestRef.current?.abort() } }, [])
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }) }, [messages, busy])

  async function send(question, retryId) {
    if (busyRef.current) return
    const text = question.trim()
    if (text.length < 3 || text.length > 1000) { setError('Enter a question between 3 and 1000 characters.'); inputRef.current?.focus(); return }
    busyRef.current = true
    requestRef.current = new AbortController()
    setBusy(true); setError('')
    if (!retryId) { setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', text }]); setMessage('') }
    try {
      const result = await assistantService.sendMessage({ message: text }, { signal: requestRef.current.signal })
      if (!activeRef.current) return
      setSnapshot(result)
      const reply = { id: retryId || crypto.randomUUID(), role: 'assistant', result }
      setMessages(current => retryId ? current.map(item => item.id === retryId ? reply : item) : [...current, reply])
    } catch (failure) {
      if (!activeRef.current) return
      if (failure.demo) setSnapshot(failure.demo)
      const reply = { id: retryId || crypto.randomUUID(), role: 'error', text: failure.message || 'The demo assistant is unavailable.', question: text }
      setMessages(current => retryId ? current.map(item => item.id === retryId ? reply : item) : [...current, reply])
    } finally {
      busyRef.current = false
      if (activeRef.current) { setBusy(false); inputRef.current?.focus() }
    }
  }
  function submit(event) { event.preventDefault(); send(message) }
  function choosePrompt(value) { setMessage(value); setError(''); inputRef.current?.focus() }
  function reset() { setMessages([]); setMessage(''); setError(''); inputRef.current?.focus() }

  return <div className="page-stack demo-assistant-page">
    <PageHeader eyebrow="FINANCIAL INTELLIGENCE, EXPLAINED" title="Meet your financial co-pilot." description="Explore a fixed, fictional financial snapshot with evidence-backed AI assistance." actions={<Button variant="secondary" onClick={reset} disabled={busy}><Plus size={16} aria-hidden="true" /> New conversation</Button>} />
    <div className="demo-ai-notice"><ShieldCheck size={18} aria-hidden="true" /><p><strong>Synthetic Demo Data.</strong> The assistant uses a fixed backend dataset, separate from your browser-local dashboard. Local edits and account records are never sent. No real accounts are connected.</p></div>
    <div className="assistant-layout">
      <section className="panel assistant-chat" aria-label="Financial assistant conversation">
        <div className="assistant-chat-header"><div className="assistant-avatar"><Sparkles size={20} aria-hidden="true" /></div><div><strong>SubGuard Assistant</strong><span>Backend-calculated facts · Gemini explanations when configured</span></div><Badge tone="violet">Synthetic Demo Data</Badge></div>
        <div className="chat-scroll" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
          {!messages.length ? <div className="assistant-welcome"><div className="welcome-orb"><Sparkles size={35} aria-hidden="true" /></div><span className="eyebrow">EVERY ANSWER STARTS WITH EVIDENCE</span><h2>Understand the numbers.<br />Choose your next move.</h2><p className="muted">Ask about fictional subscriptions, upcoming renewals or potential spending reductions. Gemini interprets verified synthetic facts; it cannot move money or change a plan.</p><div className="prompt-grid">{prompts.map(prompt => <button key={prompt} onClick={() => choosePrompt(prompt)} disabled={busy}><MessageSquare size={17} aria-hidden="true" /><span>{prompt}</span><ArrowRight size={15} aria-hidden="true" /></button>)}</div></div> : <div className="chat-messages">{messages.map(item => <div key={item.id} className={`chat-message ${item.role === 'error' ? 'status' : item.role}`}><span className="message-avatar">{item.role === 'user' ? 'You' : item.role === 'error' ? <CircleAlert size={17} aria-hidden="true" /> : <Sparkles size={17} aria-hidden="true" />}</span><div className="demo-ai-message-body"><span className="message-author">{item.role === 'user' ? 'Your question' : item.role === 'error' ? 'AI unavailable · no generated reply' : 'SubGuard · Synthetic Demo Data'}</span>{item.role === 'assistant' ? <Reply result={item.result} /> : item.role === 'error' ? <div role="alert"><p>{item.text}</p><p className="tiny muted">No successful AI answer was generated. Any financial context below is deterministic synthetic data.</p><Button variant="secondary" disabled={busy} onClick={() => send(item.question, item.id)}><RefreshCw size={14} aria-hidden="true" /> Retry question</Button></div> : <p>{item.text}</p>}</div></div>)}{busy && <div className="chat-message status" role="status"><span className="message-avatar"><Bot size={17} aria-hidden="true" /></span><p className="muted">Preparing an evidence-grounded explanation…</p></div>}<div ref={endRef} /></div>}
        </div>
        <div className="chat-composer-wrap"><form onSubmit={submit} className="chat-composer"><label className="sr-only" htmlFor="assistant-question">Ask about your subscriptions</label><textarea id="assistant-question" ref={inputRef} rows={2} placeholder="Ask about the synthetic subscriptions…" value={message} onChange={event => setMessage(event.target.value)} maxLength={1000} disabled={busy} aria-describedby={error ? 'assistant-error' : 'assistant-privacy'} aria-invalid={Boolean(error)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(event) } }} /><button type="submit" className="send-message" disabled={busy || !message.trim()} aria-label={busy ? 'Preparing explanation' : 'Send question'}><ArrowUp size={19} aria-hidden="true" /></button></form>{error && <p id="assistant-error" className="form-error" role="alert">{error}</p>}<p id="assistant-privacy" className="composer-note"><LockKeyhole size={12} aria-hidden="true" /> Your question is sent to the demo backend and, when enabled, Gemini. Use fictional information only. This conversation is kept in this tab only.</p></div>
      </section>
      <aside className="assistant-aside">
        <div className="panel fact-panel"><div className="panel-header"><Wallet size={18} aria-hidden="true" /><h2>The evidence behind the answer</h2></div><p className="tiny muted">Deterministic backend calculations · never model totals</p>{snapshot ? <><p className="demo-ai-snapshot-date">Fixed snapshot · {snapshot.context.asOf}</p>{snapshot.context.summary.map(summary => <section className="demo-ai-currency" key={summary.currency}><Badge tone="violet">Synthetic · {summary.currency}</Badge><div className="demo-fact"><span>Monthly recurring estimate</span><strong>{formatMoney(summary.monthlyMinor, summary.currency)}</strong></div><div className="demo-fact"><span>Annualized recurring estimate</span><strong>{formatMoney(summary.yearlyMinor, summary.currency)}</strong></div><div className="demo-fact"><span>Active subscriptions</span><strong>{summary.activeCount}</strong></div><div className="demo-fact"><span>Upcoming in 30 days</span><strong>{formatMoney(summary.upcomingMinor, summary.currency)}</strong></div></section>)}<Facts facts={snapshot.context.facts} title="Available synthetic context" /><Scenarios scenarios={snapshot.context.scenarios} /></> : <p className="demo-ai-empty-context">Send a question to load the backend’s fixed synthetic snapshot. No browser-local financial data is submitted.</p>}</div>
        <div className="panel assistant-guide"><h2>Explanations you can inspect.</h2><p className="muted">Amounts and dates come from backend facts. AI guidance is a suggestion to review, never an automatic financial action.</p><ul><li><Check size={15} aria-hidden="true" /> Currencies stay separate</li><li><Check size={15} aria-hidden="true" /> No account or conversation database</li><li><Check size={15} aria-hidden="true" /> No payment or cancellation tools</li></ul><ShieldCheck size={30} className="guide-shield" aria-hidden="true" /></div>
      </aside>
    </div>
  </div>
}
