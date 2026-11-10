import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, CheckCheck, ChevronDown, CircleHelp, Copy, Layers3, RefreshCw, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, StatCard } from '../components/ui.jsx'
import { useDemo } from '../hooks/useDemo.js'
import { formatMoney, getInsights, getSummary } from '../utils/finance.js'
import './intelligence.css'

const insightTypes = [
  { value: 'all', label: 'All insights' },
  { value: 'price', label: 'Price changes' },
  { value: 'duplicate', label: 'Possible duplicates' },
  { value: 'overlap', label: 'Overlapping services' },
  { value: 'recurring', label: 'Recurring expenses' },
  { value: 'savings', label: 'Savings opportunities' },
]

function matchesType(insight, filter) {
  const value = `${insight.type} ${insight.category} ${insight.title}`.toLowerCase()
  if (filter === 'all') return true
  if (filter === 'price') return /price|increase/.test(value)
  if (filter === 'duplicate') return /duplicate/.test(value)
  if (filter === 'overlap') return /overlap/.test(value)
  if (filter === 'recurring') return /recurr/.test(value)
  return /unused|saving|recommendation/.test(value)
}

function insightStyle(insight) {
  const value = `${insight.type} ${insight.title}`.toLowerCase()
  if (/price|increase/.test(value)) return { Icon: TrendingUp, tone: 'amber', label: 'Price change' }
  if (/duplicate/.test(value)) return { Icon: Copy, tone: 'amber', label: 'Possible duplicate' }
  if (/overlap/.test(value)) return { Icon: Layers3, tone: 'blue', label: 'Subscription overlap' }
  if (/recurr/.test(value)) return { Icon: RefreshCw, tone: 'violet', label: 'Recurring expense' }
  return { Icon: ArrowDownRight, tone: 'green', label: 'Savings opportunity' }
}

function InsightCard({ insight, currency, dismissInsight, toast }) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const { Icon, tone, label } = insightStyle(insight)

  async function dismiss() {
    setBusy(true)
    try {
      await dismissInsight(insight.id)
      toast('Insight dismissed in this demo workspace.')
    } catch (error) {
      toast(error.message || 'Could not dismiss insight. Try again.', 'error')
      setBusy(false)
    }
  }

  return (
    <article className="panel insight-card">
      <div className="insight-card-top">
        <div className={`insight-icon ${tone}`}><Icon size={20} aria-hidden="true" /></div>
        <div className="insight-labels"><Badge tone={tone}>{label}</Badge><span className="tiny muted">Demo insight</span></div>
        {insight.amountMinor && <span className="insight-amount">{formatMoney(insight.amountMinor, currency)}</span>}
      </div>
      <h2>{insight.title}</h2>
      <p className="muted insight-description">{insight.description}</p>
      <div className="insight-card-actions">
        <button className="explanation-button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={`explanation-${insight.id}`}>
          <CircleHelp size={15} aria-hidden="true" /> Why am I seeing this?
          <ChevronDown className={expanded ? 'rotate-180' : ''} size={15} aria-hidden="true" />
        </button>
        <Button variant="ghost" disabled={busy} onClick={dismiss}>{busy ? 'Dismissing…' : 'Dismiss'}</Button>
      </div>
      {expanded && <div className="insight-explanation" id={`explanation-${insight.id}`}>
        <strong>A suggestion to review, never an automatic action.</strong>
        <p>This sample is calculated from this browser’s simulated subscriptions and imported demo transactions. No bank account, PayPal history, or AI model is connected.</p>
        <p>{/unused/i.test(`${insight.type} ${insight.title} ${insight.description}`) ? '“Unused” comes from an explicit demo preference, not observed product usage. Potential savings depend on your decision and the merchant’s cancellation terms.' : 'Similar charges and overlapping categories can be legitimate. Review the source records and billing terms before taking action.'}</p>
        <Link to={/duplicate/i.test(insight.type) ? '/app/transactions' : '/app/subscriptions'} className="text-link">Review source records <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>}
    </article>
  )
}

export default function Insights() {
  const { data, currency, dismissInsight, restoreInsights, toast } = useDemo()
  const [filter, setFilter] = useState('all')
  const insights = getInsights(data, currency).filter((item) => !data.dismissedInsights.includes(item.id))
  const filtered = insights.filter((item) => matchesType(item, filter))
  const summary = getSummary(data, currency)

  return (
    <div className="page-stack">
      <PageHeader eyebrow="YOUR FINANCIAL SECOND OPINION" title="A little insight. A lot more control." description="Make room for the subscriptions that actually matter to you." actions={<Badge tone="violet"><Sparkles size={13} aria-hidden="true" /> Demo intelligence</Badge>} />
      <div className="intelligence-banner panel">
        <div className="intelligence-orb"><Sparkles size={27} aria-hidden="true" /></div>
        <div><span className="eyebrow">LOOKING OUT FOR YOUR MONEY</span><h2>Your subscriptions, with a fresh perspective.</h2><p className="muted">Rule-based sample insights help you spot changes, review overlaps, and consider savings. All content here is demo content; no AI model is connected.</p></div>
      </div>
      <div className="stat-grid insight-stat-grid">
        <StatCard label="Insights to review" value={String(insights.length)} detail="Based on simulated records" icon={Sparkles} tone="violet" />
        <StatCard label="Potential monthly savings" value={formatMoney(summary.savingsMinor, currency)} detail="Estimate from marked-unused services" icon={ArrowDownRight} tone="green" />
        <StatCard label="Unusual charges" value={String(summary.unusualCount)} detail="Possible changes, not confirmed fraud" icon={ShieldCheck} tone="amber" />
      </div>
      <div className="insight-section-heading"><div><h2>Your protection feed</h2><p className="muted">A clearer view of what deserves a closer look.</p></div>{data.dismissedInsights.length ? <Button variant="secondary" onClick={async () => { try { await restoreInsights(); toast('Dismissed demo insights restored.') } catch (error) { toast(error.message || 'Could not restore insights.', 'error') } }}>Restore dismissed</Button> : <span className="tiny muted">Simulated data · no live analysis</span>}</div>
      <div className="segmented-tabs insight-filters" role="group" aria-label="Filter insights">
        {insightTypes.map((item) => <button key={item.value} className={filter === item.value ? 'active' : ''} onClick={() => setFilter(item.value)} aria-pressed={filter === item.value}>{item.label}</button>)}
      </div>
      {filtered.length ? <div className="insights-grid">{filtered.map((insight) => <InsightCard key={insight.id} insight={insight} currency={currency} dismissInsight={dismissInsight} toast={toast} />)}</div> : <EmptyState icon={CheckCheck} title={filter === 'all' ? 'You’re all caught up' : 'No insights in this category'} description={filter === 'all' ? 'No remaining sample insights for this currency. Reset the demo in Settings to restore dismissed items.' : 'Try another category, or review your subscriptions to find your next opportunity.'} action={<Button variant="secondary" onClick={() => setFilter('all')}>View all insights</Button>} />}
      <div className="insight-footnote"><ShieldCheck size={16} aria-hidden="true" /><p>Always your call. SubGuard never cancels a subscription or moves money on your behalf.</p></div>
    </div>
  )
}
