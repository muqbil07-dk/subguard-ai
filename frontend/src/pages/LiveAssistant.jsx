import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowUp, Bot, ChevronLeft, ChevronRight, CircleAlert, Clock3, FileText, History, Info, LoaderCircle, MessageSquare, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Modal, PageHeader } from '../components/ui.jsx'
import { apiService } from '../services/apiService.js'
import { formatMoney } from '../utils/finance.js'
import './intelligence.css'
import './live-assistant.css'

const prompts = [
  'How much do I spend monthly?',
  'What payments are coming next week?',
  'Which subscription increased in price?',
  'Find subscriptions marked unused.',
  'How can I reduce my expenses?',
]

function timestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function Evidence({ facts = [], title = 'Supporting evidence' }) {
  if (!facts.length) return <p className="muted live-evidence-empty">No supporting financial facts were supplied.</p>
  return <details className="live-evidence"><summary><FileText size={14} aria-hidden="true" />{title} <span>{facts.length}</span></summary><ul>{facts.map((fact, index) => <li key={`${fact.id || fact.kind}-${index}`}>
    <div><strong>{fact.label || fact.kind || 'Account fact'}</strong>{fact.merchant && <span>{fact.merchant}</span>}</div>
    {fact.amountMinor != null && fact.currency && <b>{formatMoney(String(fact.amountMinor), fact.currency)}</b>}
    {fact.previousAmountMinor != null && fact.currency && <span>Previous amount: {formatMoney(String(fact.previousAmountMinor), fact.currency)}</span>}
    {fact.differenceMinor != null && fact.currency && <span>Change: {formatMoney(String(fact.differenceMinor), fact.currency)}</span>}
    {fact.percentageDifference != null && <span>Percentage change: {fact.percentageDifference}%</span>}
    {fact.frequency && <span>Billing frequency: {fact.frequency}</span>}
    {typeof fact.unused === 'boolean' && <span>{fact.unused ? 'Marked unused (user preference)' : 'Not marked unused (user preference)'}</span>}
    {fact.date && <span>Date: {fact.date}</span>}{fact.value != null && typeof fact.value !== 'object' && <span>{String(fact.value)}</span>}{fact.predicted && <Badge tone="amber">Estimated</Badge>}{fact.basis && <span>Basis: {fact.basis}</span>}{fact.source && <span>Source: {fact.source}</span>}{fact.asOf && <span>As of: {fact.asOf}</span>}<small>Reference: {fact.id || 'Not supplied'}</small>
  </li>)}</ul></details>
}

function Warnings({ warnings = [] }) {
  return warnings.length ? <div className="live-warnings" aria-label="Response limitations">{warnings.map((warning, index) => <p key={index}><CircleAlert size={14} aria-hidden="true" />{typeof warning === 'string' ? warning : warning.message || 'Additional limitations apply.'}</p>)}</div> : null
}

function ResponseContent({ response }) {
  if (!response) return null
  return <div className="live-response-content"><p className="live-answer">{response.answer || response.summary || 'No explanation was returned.'}</p>{response.summary && response.answer && response.summary !== response.answer && <p className="muted">{response.summary}</p>}<div className="live-response-meta"><Badge tone={response.confidence === 'grounded' ? 'green' : 'amber'}>{response.confidence === 'grounded' ? 'Grounded in account facts' : 'Limited evidence'}</Badge>{response.generatedAt && <time dateTime={response.generatedAt}>{timestamp(response.generatedAt)}</time>}</div><Warnings warnings={response.warnings} />{response.keyFacts?.length > 0 && <Evidence facts={response.keyFacts} title="Key facts" />}{response.evidence?.length > 0 && <Evidence facts={response.evidence} />}{response.recommendations?.length > 0 && <div className="live-inline-recommendations"><h4>Suggested next steps</h4>{response.recommendations.map((item) => <div key={item.id || item.title}><strong>{item.title}</strong><p>{item.explanation}</p>{item.estimatedSavings && <p>Potential savings: {formatMoney(String(item.estimatedSavings.monthlyMinor), item.estimatedSavings.currency || item.currency)} / month · {formatMoney(String(item.estimatedSavings.yearlyMinor), item.estimatedSavings.currency || item.currency)} / year</p>}{item.estimatedSavings?.assumptions && <p className="muted">{Array.isArray(item.estimatedSavings.assumptions) ? item.estimatedSavings.assumptions.join(' ') : item.estimatedSavings.assumptions}</p>}<Evidence facts={item.evidence} />{item.suggestedNextAction && <p className="muted">Suggested action: {item.suggestedNextAction}</p>}</div>)}</div>}</div>
}

function Pagination({ page, pagination, loading, onChange, label }) {
  const hasNext = pagination ? page * pagination.limit < pagination.total : false
  return <div className="live-pagination" aria-label={`${label} pagination`}><Button variant="ghost" aria-label={`Newer ${label}`} disabled={loading || page === 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} aria-hidden="true" /></Button><span>Page {page}{pagination ? ` · ${pagination.total} total` : ''}</span><Button variant="ghost" aria-label={`Older ${label}`} disabled={loading || !hasNext} onClick={() => onChange(page + 1)}><ChevronRight size={15} aria-hidden="true" /></Button></div>
}

export default function LiveAssistant() {
  const [history, setHistory] = useState([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPagination, setHistoryPagination] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [historyVersion, setHistoryVersion] = useState(0)
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [messagePage, setMessagePage] = useState(1)
  const [messagePagination, setMessagePagination] = useState(null)
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationError, setConversationError] = useState('')
  const [conversationVersion, setConversationVersion] = useState(0)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [lastResponse, setLastResponse] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [recommendations, setRecommendations] = useState(null)
  const [recommendationLoading, setRecommendationLoading] = useState(true)
  const [recommendationError, setRecommendationError] = useState('')
  const [recommendationVersion, setRecommendationVersion] = useState(0)
  const [recommendationBusy, setRecommendationBusy] = useState(null)
  const [score, setScore] = useState(null)
  const [scoreLoading, setScoreLoading] = useState(true)
  const [scoreError, setScoreError] = useState('')
  const [scoreVersion, setScoreVersion] = useState(0)
  const [explanation, setExplanation] = useState(null)
  const [explanationError, setExplanationError] = useState('')
  const inputRef = useRef(null)
  const endRef = useRef(null)
  const pendingChatRef = useRef(null)
  const conversationId = conversation?.id

  useEffect(() => {
    let active = true
    apiService.ai.listConversations(historyPage).then((result) => {
      if (!active) return
      setHistory(result.data)
      setHistoryPagination(result.pagination)
      setHistoryError('')
      setHistoryLoading(false)
    }).catch((error) => { if (active) { setHistoryError(error.message || 'Conversation history is unavailable.'); setHistoryLoading(false) } })
    return () => { active = false }
  }, [historyPage, historyVersion])

  useEffect(() => {
    if (!conversationId) return undefined
    let active = true
    apiService.ai.getConversation(conversationId, messagePage).then((result) => {
      if (!active) return
      setConversation(result.data.conversation)
      setMessages(result.data.messages)
      setMessagePagination(result.pagination)
      setConversationError('')
      setConversationLoading(false)
      setLastResponse(null)
    }).catch((error) => { if (active) { setConversationError(error.message || 'This conversation could not be loaded.'); setConversationLoading(false) } })
    return () => { active = false }
  }, [conversationId, messagePage, conversationVersion])

  useEffect(() => {
    let active = true
    apiService.ai.recommendations().then((result) => {
      if (active) { setRecommendations(result); setRecommendationLoading(false); setRecommendationError('') }
    }).catch((error) => { if (active) { setRecommendationError(error.message || 'Recommendations are unavailable.'); setRecommendationLoading(false) } })
    return () => { active = false }
  }, [recommendationVersion])

  useEffect(() => {
    let active = true
    apiService.ai.wasteScore().then((result) => {
      if (active) { setScore(result); setScoreLoading(false); setScoreError('') }
    }).catch((error) => { if (active) { setScoreError(error.message || 'The waste score is unavailable.'); setScoreLoading(false) } })
    return () => { active = false }
  }, [scoreVersion])

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: 'instant', block: 'nearest' }) }, [messages, sending, lastResponse])

  function reloadHistory() { setHistoryLoading(true); setHistoryVersion((value) => value + 1) }
  function selectConversation(item) {
    setConversation(item)
    setMessages([])
    setLastResponse(null)
    setMessage('')
    setSendError('')
    setConversationError('')
    setConversationLoading(true)
    setMessagePage(1)
    setConversationVersion((value) => value + 1)
  }

  function startConversation() {
    pendingChatRef.current = null
    setConversation(null)
    setMessages([])
    setMessagePagination(null)
    setMessagePage(1)
    setConversationLoading(false)
    setConversationError('')
    setSendError('')
    setLastResponse(null)
    setMessage('')
    inputRef.current?.focus()
  }

  async function send(event) {
    event.preventDefault()
    const text = message.trim()
    if (text.length < 3 || text.length > 1000) { setSendError('Enter a question between 3 and 1,000 characters.'); return }
    setSending(true)
    setSendError('')
    try {
      let current = conversation
      if (!current) {
        current = await apiService.ai.createConversation({ title: text.slice(0, 80) })
        setConversation(current)
        reloadHistory()
      }
      if (pendingChatRef.current?.conversationId !== current.id || pendingChatRef.current?.text !== text) {
        pendingChatRef.current = { conversationId: current.id, text, requestId: crypto.randomUUID() }
      }
      const accepted = await apiService.ai.chat({ conversationId: current.id, message: text, requestId: pendingChatRef.current.requestId })
      pendingChatRef.current = null
      setLastResponse(accepted.response)
      setMessage('')
      setConversationLoading(true)
      setMessagePage(1)
      setConversationVersion((value) => value + 1)
      reloadHistory()
    } catch (error) {
      setSendError(error.message || 'The assistant could not answer. Your question is still here; please try again.')
    } finally { setSending(false) }
  }

  async function deleteConversation() {
    setDeleting(true)
    setDeleteError('')
    try {
      await apiService.ai.deleteConversation(deleteTarget.id)
      if (pendingChatRef.current?.conversationId === deleteTarget.id) pendingChatRef.current = null
      if (conversationId === deleteTarget.id) startConversation()
      setDeleteTarget(null)
      setHistoryPage(1)
      reloadHistory()
    } catch (error) { setDeleteError(error.message || 'Conversation deletion failed. Nothing was removed from this view.') }
    finally { setDeleting(false) }
  }

  async function dismissRecommendation(item) {
    setRecommendationBusy(item.id)
    setRecommendationError('')
    try {
      await apiService.ai.dismissRecommendation(item.id)
      setRecommendations((current) => ({ ...current, recommendations: current.recommendations.filter((value) => value.id !== item.id) }))
    } catch (error) { setRecommendationError(error.message || 'The recommendation could not be dismissed.') }
    finally { setRecommendationBusy(null) }
  }

  async function explainRecommendation(item) {
    setRecommendationBusy(item.id)
    setExplanationError('')
    try { setExplanation({ title: item.title, response: await apiService.ai.explain({ insightId: item.insightId }) }) }
    catch (error) { setExplanationError(error.message || 'An explanation could not be generated.') }
    finally { setRecommendationBusy(null) }
  }

  return <section className="page-stack live-assistant">
    <PageHeader eyebrow="YOUR ACCOUNT · EVIDENCE FIRST" title="Financial questions. Grounded answers." description="Ask about your stored subscription records and inspect the facts behind every suggestion." actions={<Badge tone={recommendations?.aiAvailable ? 'green' : 'neutral'}><Sparkles size={13} aria-hidden="true" />{recommendations?.aiAvailable ? 'AI explanations available' : 'AI provider status from server'}</Badge>} />
    <div className="live-disclosure"><ShieldCheck size={19} aria-hidden="true" /><p>Your question and a limited set of authorized financial facts may be sent to Google for an AI explanation. Account credentials are excluded. Amounts and savings come from deterministic backend calculations; the assistant cannot move money or cancel subscriptions.</p></div>
    {recommendations?.aiAvailable === false && <div className="live-provider-warning" role="status"><Info size={17} aria-hidden="true" /><div><strong>AI explanations are unavailable.</strong><p>{recommendations.warning || 'The server has not connected an AI provider. Deterministic recommendations can still be reviewed below. No model-generated answer is substituted.'}</p></div><Button variant="secondary" disabled={recommendationLoading} onClick={() => { setRecommendationLoading(true); setRecommendationVersion((value) => value + 1) }}>Check availability</Button></div>}
    <div className="live-chat-layout">
      <aside className="panel live-history"><div className="live-history-header"><h2><History size={17} aria-hidden="true" /> Conversations</h2><Button variant="ghost" aria-label="Refresh conversation history" disabled={historyLoading || sending} onClick={reloadHistory}><RefreshCw size={15} aria-hidden="true" /></Button></div><Button variant="secondary" className="live-new-conversation" onClick={startConversation} disabled={sending || deleting}><Plus size={15} aria-hidden="true" />New conversation</Button>
        {historyLoading && <p role="status" className="muted live-small-status">Loading conversation history…</p>}
        {historyError && <div className="live-section-error" role="alert"><p>{historyError}</p><Button variant="secondary" onClick={reloadHistory}>Retry history</Button></div>}
        {!historyLoading && !historyError && !history.length && <p className="muted live-history-empty">No conversations yet. Your first accepted conversation will appear here.</p>}
        <ul className="live-history-list">{history.map((item) => <li key={item.id} className={conversationId === item.id ? 'selected' : ''}><button disabled={sending || deleting} onClick={() => selectConversation(item)} aria-current={conversationId === item.id ? 'true' : undefined}><MessageSquare size={15} aria-hidden="true" /><span><strong>{item.title || 'Untitled conversation'}</strong><time dateTime={item.updated_at || item.created_at}>{timestamp(item.updated_at || item.created_at)}</time></span></button><Button variant="ghost" aria-label={`Delete conversation ${item.title || 'Untitled conversation'}`} disabled={sending || deleting} onClick={() => { setDeleteTarget(item); setDeleteError('') }}><Trash2 size={14} aria-hidden="true" /></Button></li>)}</ul>
        <Pagination page={historyPage} pagination={historyPagination} loading={historyLoading || sending} label="conversations" onChange={(page) => { setHistoryLoading(true); setHistoryPage(page) }} />
      </aside>
      <section className="panel assistant-chat live-chat" aria-label="Account AI assistant">
        <div className="assistant-chat-header"><div className="assistant-avatar"><Sparkles size={20} aria-hidden="true" /></div><div><strong>{conversation?.title || 'SubGuard Assistant'}</strong><span>Account conversations · server-persisted history</span></div><Badge tone="violet">Evidence first</Badge></div>
        {conversation && <Pagination page={messagePage} pagination={messagePagination} loading={conversationLoading || sending} label="messages" onChange={(page) => { setConversationLoading(true); setMessagePage(page) }} />}
        <div className="chat-scroll live-chat-scroll" role="log" aria-label="Account conversation" aria-live="polite" aria-relevant="additions text">
          {conversationLoading && <p className="live-loading-line" role="status"><LoaderCircle size={17} className="spin" aria-hidden="true" />Loading saved messages…</p>}
          {conversationError && <div className="live-section-error" role="alert"><p>{conversationError}</p><Button variant="secondary" onClick={() => { setConversationLoading(true); setConversationVersion((value) => value + 1) }}>Retry messages</Button></div>}
          {!messages.length && !conversationLoading && !conversationError && !lastResponse && <div className="assistant-welcome live-assistant-welcome"><div className="welcome-orb"><Sparkles size={32} aria-hidden="true" /></div><span className="eyebrow">A CLEARER VIEW OF YOUR MONEY</span><h2>What would you like<br />to understand?</h2><p className="muted">Start with a question about your account. Answers depend on available evidence and the server’s AI configuration.</p><div className="prompt-grid">{prompts.map((prompt) => <button key={prompt} disabled={sending} onClick={() => { setMessage(prompt); setSendError(''); inputRef.current?.focus() }}><MessageSquare size={16} aria-hidden="true" /><span>{prompt}</span><ArrowRight size={14} aria-hidden="true" /></button>)}</div></div>}
          <div className="chat-messages">{messages.map((item) => <article key={item.id} className={`chat-message ${item.role === 'user' ? 'user' : 'assistant'}`}><span className="message-avatar">{item.role === 'user' ? 'You' : <Bot size={17} aria-hidden="true" />}</span><div className="live-message-body"><div className="live-message-meta"><strong>{item.role === 'user' ? 'You' : 'SubGuard Assistant'}</strong><time dateTime={item.created_at}>{timestamp(item.created_at)}</time></div>{item.structured_response ? <ResponseContent response={item.structured_response} /> : <p>{item.content}</p>}</div></article>)}{lastResponse && <article className="chat-message assistant"><span className="message-avatar"><Bot size={17} aria-hidden="true" /></span><div className="live-message-body"><span className="message-author">Accepted server response · refreshing saved history</span><ResponseContent response={lastResponse} /></div></article>}{sending && <div className="live-typing" role="status"><Bot size={18} aria-hidden="true" /><span>Preparing an evidence-grounded answer</span><i /><i /><i /></div>}<div ref={endRef} /></div>
        </div>
        <div className="chat-composer-wrap"><form onSubmit={send} className="chat-composer"><label className="sr-only" htmlFor="live-assistant-question">Ask about your account</label><textarea id="live-assistant-question" ref={inputRef} rows={2} placeholder="Ask about your subscriptions, billing changes, or savings…" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1000} disabled={sending || conversationLoading} aria-invalid={Boolean(sendError)} aria-describedby={sendError ? 'live-send-error' : 'live-composer-note'} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!sending && !conversationLoading) send(event) } }} /><button type="submit" className="send-message" aria-label="Send account question" disabled={sending || conversationLoading || !message.trim()}><ArrowUp size={19} aria-hidden="true" /></button></form>{sendError && <p id="live-send-error" className="live-send-error" role="alert">{sendError} Your question has been kept so you can retry.</p>}<p id="live-composer-note" className="composer-note">AI can make mistakes. Review the cited facts. Enter to send · Shift + Enter for a new line.</p></div>
      </section>
    </div>
    <div className="live-analysis-layout">
      <section className="panel live-score-panel"><div className="live-panel-title"><ShieldCheck size={18} aria-hidden="true" /><h2>Subscription waste score</h2><Badge tone="neutral">Backend-calculated</Badge></div>{scoreLoading && <p role="status" className="muted">Loading your score…</p>}{scoreError && <div className="live-section-error" role="alert"><p>{scoreError}</p><Button variant="secondary" onClick={() => { setScoreLoading(true); setScoreVersion((value) => value + 1) }}>Retry waste score</Button></div>}{score && !scoreLoading && !scoreError && <>{score.state === 'insufficient_data' ? <div className="live-score-empty"><ShieldCheck size={31} aria-hidden="true" /><h3>Not enough data yet</h3><p>Add more confirmed financial records before interpreting a waste score. Missing evidence is not a zero-risk result.</p></div> : <><div className="live-score-number"><strong>{score.score}</strong><span>/ 100</span><Badge tone="violet">{score.category}</Badge></div><p className="muted">A rule-based review indicator, not a credit score or a claim that charges are fraudulent.</p>{score.factors?.length > 0 && <ul className="live-score-factors">{score.factors.map((factor, index) => <li key={`${factor.evidenceId}-${index}`}><span>{factor.label}<small>Evidence: {factor.evidenceId}</small></span><b>{factor.points} points</b></li>)}</ul>}</>}{score.explanation && <p className="live-score-explanation">{typeof score.explanation === 'string' ? score.explanation : score.explanation.answer}</p>}{score.warning && <Warnings warnings={[score.warning]} />}<Evidence facts={score.evidence} />{score.calculatedAt && <p className="live-as-of"><Clock3 size={12} aria-hidden="true" />Calculated {timestamp(score.calculatedAt)}</p>}</>}</section>
      <section className="panel live-recommendation-panel"><div className="live-panel-title"><Sparkles size={18} aria-hidden="true" /><h2>Your savings opportunities</h2><Button variant="ghost" aria-label="Refresh recommendations" disabled={recommendationLoading || Boolean(recommendationBusy)} onClick={() => { setRecommendationLoading(true); setRecommendationVersion((value) => value + 1) }}><RefreshCw size={15} aria-hidden="true" /></Button></div><p className="muted live-recommendation-intro">Potential savings use backend calculations and stated assumptions. Your review is always required.</p>{recommendationLoading && <p role="status" className="muted">Loading recommendations…</p>}{recommendationError && <div className="live-section-error" role="alert"><p>{recommendationError}</p><Button variant="secondary" onClick={() => { setRecommendationLoading(true); setRecommendationVersion((value) => value + 1) }}>Retry recommendations</Button></div>}{explanationError && <p className="live-send-error" role="alert">{explanationError}</p>}{recommendations && !recommendationLoading && !recommendations.recommendations.length && <EmptyState icon={ShieldCheck} title="No recommendations to review" description="Suggestions will appear when supported by your account records. Nothing has been invented to fill this space." />}{!recommendationLoading && recommendations?.recommendations.map((item) => <article className="live-recommendation" key={item.id}><div className="live-recommendation-heading"><h3>{item.title}</h3><Badge tone={item.priority === 'high' ? 'amber' : 'violet'}>{item.priority || 'Review'}</Badge></div><p>{item.explanation}</p>{item.estimatedSavings ? <div className="live-savings"><span>Potential savings</span><strong>{formatMoney(String(item.estimatedSavings.monthlyMinor), item.estimatedSavings.currency || item.currency)}<small>/month</small></strong><span>{formatMoney(String(item.estimatedSavings.yearlyMinor), item.estimatedSavings.currency || item.currency)} / year</span>{item.estimatedSavings.assumptions && <p>{Array.isArray(item.estimatedSavings.assumptions) ? item.estimatedSavings.assumptions.join(' ') : item.estimatedSavings.assumptions}</p>}</div> : <p className="muted">Savings have not been estimated for this recommendation.</p>}<Evidence facts={item.evidence} />{item.suggestedNextAction && <p className="live-next-action">Suggested next step: {item.suggestedNextAction}</p>}<div className="live-recommendation-actions">{item.insightId && <Button variant="secondary" disabled={Boolean(recommendationBusy)} onClick={() => explainRecommendation(item)}>{recommendationBusy === item.id ? 'Working…' : 'Explain this insight'}</Button>}<Button variant="ghost" disabled={Boolean(recommendationBusy)} onClick={() => dismissRecommendation(item)}>Dismiss recommendation</Button></div></article>)}{recommendations?.generatedAt && <p className="live-as-of"><Clock3 size={12} aria-hidden="true" />Updated {timestamp(recommendations.generatedAt)}</p>}</section>
    </div>
    {deleteTarget && <Modal title="Delete this conversation?" description="The saved conversation and its messages will be removed from your account. This cannot be undone." onClose={() => !deleting && setDeleteTarget(null)}>{deleteError && <p className="live-send-error" role="alert">{deleteError}</p>}<div className="modal-actions"><Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Keep conversation</Button><Button variant="danger" onClick={deleteConversation} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete saved conversation'}</Button></div></Modal>}
    {explanation && <Modal title={explanation.title} description="Explanation returned by the account API, using authorized financial facts." onClose={() => setExplanation(null)}><ResponseContent response={explanation.response} /><div className="modal-actions"><Button variant="secondary" onClick={() => setExplanation(null)}>Close explanation</Button></div></Modal>}
  </section>
}
