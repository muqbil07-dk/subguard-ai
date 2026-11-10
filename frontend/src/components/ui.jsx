import { Component, useEffect, useId, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Inbox, LoaderCircle, ShieldCheck, X } from 'lucide-react'

export function Logo({ compact = false }) {
  return <Link to="/" className="brand" aria-label="SubGuard AI home"><span className="brand-mark"><ShieldCheck size={23} strokeWidth={2} /></span>{!compact && <span>SubGuard<span className="brand-ai">AI</span></span>}</Link>
}
export function Button({ variant = 'primary', children, className = '', type = 'button', loading = false, disabled = false, ...props }) {
  return <button type={type} className={`button button-${variant} ${className}`} disabled={loading || disabled} {...props}>{loading && <LoaderCircle className="spin" size={16} />}{children}</button>
}
export function Badge({ tone = 'neutral', children, className = '' }) { return <span className={`badge badge-${tone} ${className}`}>{children}</span> }
export function PageHeader({ eyebrow, title, description, actions }) {
  return <div className="page-header"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{actions && <div className="header-actions">{actions}</div>}</div>
}
export function Field({ label, error, hint, children }) {
  return <div className={`field ${error ? 'field-error' : ''}`}><label><span>{label}</span>{children}</label>{error ? <small role="alert">{error}</small> : hint ? <small className="muted">{hint}</small> : null}</div>
}
export function MerchantIcon({ name = '', initials, color = '#8b5cf6', size = 40 }) {
  return <span className="merchant-icon" aria-hidden="true" style={{ '--merchant-color': color, width: size, height: size, fontSize: size * .4 }}>{initials || name.slice(0, 2)}</span>
}
export function StatCard({ label, value, detail, icon: Icon = ArrowUpRight, tone = 'violet' }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon text-${tone}`}><Icon size={17} /></span></div><strong>{value}</strong>{detail && <div className="stat-detail">{detail}</div>}</div>
}
export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={27} /></span><h3>{title}</h3><p>{description}</p>{action}</div>
}
export function LoadingState() { return <div className="loading-state" role="status"><LoaderCircle className="spin" size={28} /><h2>Preparing your workspace</h2><p>Loading your local demo data…</p></div> }
export function Modal({ title, description, children, onClose }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose() }} onClick={e => { if (e.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose() } }}><div className="modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p className="muted">{description}</p>}</div><Button variant="ghost" aria-label="Close dialog" onClick={onClose}><X size={20} /></Button></div>{children}</dialog>
}
export function CheckItem({ children }) { return <span className="check-item"><Check size={15} />{children}</span> }
export class ErrorBoundary extends Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return <main className="fatal-error"><ShieldCheck size={40} /><h1>Something needs a fresh start.</h1><p>The local demo could not be displayed. Reload to try again.</p><Button onClick={() => window.location.reload()}>Reload workspace</Button></main>
    return this.props.children
  }
}
