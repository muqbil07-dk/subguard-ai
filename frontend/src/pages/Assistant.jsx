import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUp, Bot, Check, CircleHelp, LockKeyhole, MessageSquare, Plus, ShieldCheck, Sparkles, Wallet } from 'lucide-react'
import { Badge, Button, PageHeader } from '../components/ui.jsx'
import { useDemo } from '../hooks/useDemo.js'
import { assistantService } from '../services/assistantService.js'
import { formatMoney, getSummary } from '../utils/finance.js'
import './intelligence.css'

const prompts = [
  'How much do I spend monthly?',
  'What payments are coming next week?',
  'Which subscription increased in price?',
  'Find subscriptions marked unused.',
  'How can I reduce my expenses?',
]

export default function Assistant() {
  const { data, currency } = useDemo()
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const summary = getSummary(data, currency)

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }) }, [messages, busy])

  async function submit(event) {
    event.preventDefault()
    const text = message.trim()
    if (text.length < 3) { setError('Enter a question with at least 3 characters.'); inputRef.current?.focus(); return }
    if (text.length > 500) { setError('Keep your question to 500 characters.'); return }
    setError('')
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text }])
    setMessage('')
    setBusy(true)
    try {
      const result = await assistantService.sendMessage({ message: text })
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'status', text: result.message || 'The AI assistant is not connected. Your question was not sent to an AI provider.' }])
    } catch (failure) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'status', text: failure.message || 'The assistant is unavailable. No AI response was generated.' }])
    } finally { setBusy(false); inputRef.current?.focus() }
  }

  function choosePrompt(value) { setMessage(value); setError(''); inputRef.current?.focus() }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="YOUR MONEY, MADE CLEARER" title="Meet your financial co-pilot." description="A dedicated space for the questions behind your subscriptions." actions={<Button variant="secondary" onClick={() => { setMessages([]); setMessage(''); setError(''); inputRef.current?.focus() }} disabled={busy}><Plus size={16} aria-hidden="true" /> New conversation</Button>} />
      <div className="assistant-layout">
        <section className="panel assistant-chat" aria-label="Financial assistant conversation">
          <div className="assistant-chat-header"><div className="assistant-avatar"><Sparkles size={20} aria-hidden="true" /></div><div><strong>SubGuard Assistant</strong><span>Ready for a future AI connection</span></div><Badge tone="neutral">Not connected</Badge></div>
          <div className="chat-scroll" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
            {!messages.length ? <div className="assistant-welcome"><div className="welcome-orb"><Sparkles size={35} aria-hidden="true" /></div><span className="eyebrow">LET’S TALK ABOUT YOUR SUBSCRIPTIONS</span><h2>A clearer answer starts<br />with a good question.</h2><p className="muted">Explore the interface with a question below. The AI provider is not connected, so this demo does not generate financial advice.</p><div className="prompt-grid">{prompts.slice(0, 4).map((prompt) => <button key={prompt} onClick={() => choosePrompt(prompt)}><MessageSquare size={17} aria-hidden="true" /><span>{prompt}</span><ArrowRight size={15} aria-hidden="true" /></button>)}</div></div> : <div className="chat-messages">{messages.map((item) => <div key={item.id} className={`chat-message ${item.role}`}><span className="message-avatar">{item.role === 'user' ? 'You' : <CircleHelp size={17} aria-hidden="true" />}</span><div><span className="message-author">{item.role === 'user' ? 'You' : 'Connection status · not an AI reply'}</span><p>{item.text}</p></div></div>)}{busy && <div className="chat-message status"><span className="message-avatar"><Bot size={17} aria-hidden="true" /></span><p className="muted">Checking assistant availability…</p></div>}<div ref={endRef} /></div>}
          </div>
          <div className="chat-composer-wrap"><form onSubmit={submit} className="chat-composer"><label className="sr-only" htmlFor="assistant-question">Ask about your subscriptions</label><textarea id="assistant-question" ref={inputRef} rows={2} placeholder="Ask a question about your subscriptions…" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} disabled={busy} aria-describedby={error ? 'assistant-error' : 'assistant-privacy'} aria-invalid={Boolean(error)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!busy) submit(event) } }} /><button type="submit" className="send-message" disabled={busy || !message.trim()} aria-label={busy ? 'Checking availability' : 'Send question'}><ArrowUp size={19} aria-hidden="true" /></button></form>{error && <p id="assistant-error" className="form-error" role="alert">{error}</p>}<p id="assistant-privacy" className="composer-note"><LockKeyhole size={12} aria-hidden="true" /> Demo only. No questions leave this browser. Enter to send · Shift + Enter for a new line.</p></div>
        </section>
        <aside className="assistant-aside"><div className="panel fact-panel"><div className="panel-header"><Wallet size={18} aria-hidden="true" /><h2>Your demo at a glance</h2></div><p className="tiny muted">Local calculations · not AI-generated</p><div className="demo-fact"><span>Monthly recurring estimate</span><strong>{formatMoney(summary.monthlyMinor, currency)}</strong></div><div className="demo-fact"><span>Active subscriptions</span><strong>{summary.activeCount}</strong></div><div className="demo-fact"><span>Upcoming in 30 days</span><strong>{formatMoney(summary.upcomingMinor, currency)}</strong></div><Badge tone="violet">Simulated records · {currency}</Badge></div><div className="panel assistant-guide"><h2>Make your money make sense.</h2><p className="muted">When connected, the assistant will explain evidence-backed insights. Your decisions stay yours.</p><ul><li><Check size={15} aria-hidden="true" /> Authorized data only</li><li><Check size={15} aria-hidden="true" /> Backend-calculated amounts</li><li><Check size={15} aria-hidden="true" /> No payment or cancellation tools</li></ul><ShieldCheck size={30} className="guide-shield" aria-hidden="true" /></div><button className="fifth-prompt" onClick={() => choosePrompt(prompts[4])}><Sparkles size={17} aria-hidden="true" /><span>{prompts[4]}</span><ArrowRight size={15} aria-hidden="true" /></button></aside>
      </div>
    </div>
  )
}
