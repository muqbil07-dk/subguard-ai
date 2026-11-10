import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, Check, Download, Globe2, Info, LockKeyhole, RotateCcw, Save, Settings2, ShieldCheck, UserRound } from 'lucide-react'
import { Badge, Button, Field, Modal, PageHeader } from '../components/ui.jsx'
import { useDemo } from '../hooks/useDemo.js'
import { supportedCurrencies } from '../utils/finance.js'
import './intelligence.css'

const sections = [
  { id: 'profile', label: 'Profile', Icon: UserRound },
  { id: 'preferences', label: 'Preferences', Icon: Globe2 },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'security', label: 'Security', Icon: LockKeyhole },
  { id: 'account', label: 'Demo workspace', Icon: Settings2 },
]

function Toggle({ label, description, checked, onChange, id }) {
  return <div className="preference-row"><div><label htmlFor={id}>{label}</label><p className="muted">{description}</p></div><label className="toggle"><input id={id} type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span aria-hidden="true" /></label></div>
}

export default function Settings() {
  const { data, updateSettings, resetDemo, toast } = useDemo()
  const location = useLocation()
  const navigate = useNavigate()
  const requestedSection = location.hash.slice(1)
  const section = sections.some(({ id }) => id === requestedSection) ? requestedSection : 'profile'
  const [profile, setProfile] = useState({ ...data.profile })
  const [preferences, setPreferences] = useState({ ...data.preferences })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  function setSection(id) {
    navigate({ pathname: location.pathname, search: location.search, hash: `#${id}` }, { replace: true })
  }

  async function save(event) {
    event.preventDefault()
    const nextErrors = {}
    if (profile.name.trim().length < 2 || profile.name.trim().length > 70) nextErrors.name = 'Enter a name between 2 and 70 characters.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) nextErrors.email = 'Enter a valid email address.'
    if (!supportedCurrencies.includes(preferences.currency)) nextErrors.currency = 'Choose a supported currency.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) { setSection(nextErrors.name || nextErrors.email ? 'profile' : 'preferences'); return }
    setBusy(true)
    try {
      const savedPreferences = section === 'preferences'
        ? { ...data.preferences, currency: preferences.currency }
        : section === 'notifications'
          ? { ...data.preferences, renewalReminders: preferences.renewalReminders, unusualCharges: preferences.unusualCharges, weeklyDigest: preferences.weeklyDigest }
          : data.preferences
      const saved = await updateSettings({
        profile: section === 'profile' ? { ...profile, name: profile.name.trim(), email: profile.email.trim() } : data.profile,
        preferences: savedPreferences,
      })
      setPreferences({ ...saved.preferences })
      setProfile({ ...saved.profile })
      toast('Demo preferences saved on this browser.')
    } catch (error) { toast(error.message || 'Could not save preferences. Try again.', 'error') }
    finally { setBusy(false) }
  }

  async function reset() {
    setBusy(true)
    try {
      const restored = await resetDemo()
      setProfile({ ...restored.profile })
      setPreferences({ ...restored.preferences })
      setErrors({})
      setResetOpen(false)
      toast('Demo workspace restored to its original sample data.')
    } catch (error) { toast(error.message || 'Could not reset demo workspace.', 'error') }
    finally { setBusy(false) }
  }

  function exportData() {
    const payload = { provenance: 'SubGuard AI local demo. All transactions are simulated; this is not a bank statement.', exportedAt: new Date().toISOString(), ...data }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'subguard-demo-workspace.json'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast('Demo workspace exported as JSON.')
  }

  return (
    <div className="page-stack">
      <PageHeader eyebrow="MAKE IT YOURS" title="Your space. Your preferences." description="A few small details for a more personal financial overview." actions={<Badge tone="violet">Local demo settings</Badge>} />
      <div className="settings-layout"><nav className="settings-navigation" aria-label="Settings sections">{sections.map(({ id, label, Icon }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)} aria-current={section === id ? 'page' : undefined}><Icon size={17} aria-hidden="true" />{label}<ArrowRight size={14} aria-hidden="true" /></button>)}<div className="settings-local-note"><ShieldCheck size={20} aria-hidden="true" /><p>These preferences stay in this browser’s demo workspace. No real account is connected.</p></div></nav>
        <form className="settings-content" onSubmit={save} noValidate>
          {section === 'profile' && <section className="panel settings-panel"><div className="settings-panel-heading"><h2>Profile details</h2><p className="muted">A familiar face for your financial home.</p></div><div className="profile-preview"><div className="profile-avatar">{profile.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SG'}</div><div><strong>{data.profile.name}</strong><p className="muted">Demo member <span className="profile-dot">·</span> Personal workspace</p></div></div><div className="settings-fields"><Field label="Full name" error={errors.name}><input id="profile-name" className="input" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} autoComplete="name" maxLength={70} aria-invalid={Boolean(errors.name)} /></Field><Field label="Email address" error={errors.email} hint="For display only. Changing this does not update a Supabase account."><input id="profile-email" className="input" type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} autoComplete="email" aria-invalid={Boolean(errors.email)} /></Field></div></section>}
          {section === 'preferences' && <section className="panel settings-panel"><div className="settings-panel-heading"><h2>Regional preferences</h2><p className="muted">See the numbers that matter in the right currency.</p></div><Field label="Display currency" error={errors.currency} hint="Filters summaries and records to this currency. No foreign exchange conversion is performed."><select className="select" value={preferences.currency} onChange={(event) => setPreferences({ ...preferences, currency: event.target.value })}>{supportedCurrencies.map((code) => <option value={code} key={code}>{code} — {{ INR: 'Indian Rupee', USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen' }[code]}</option>)}</select></Field><div className="settings-notice"><Info size={18} aria-hidden="true" /><p>The initial sample data is in INR. Other currencies remain empty until you add matching demo subscriptions or transactions. Values are never relabeled as another currency.</p></div><div className="preference-row"><div><strong>Demo reference date</strong><p className="muted">Renewals and charts share a fixed date for consistent examples.</p></div><Badge tone="neutral">9 Nov 2026</Badge></div></section>}
          {section === 'notifications' && <section className="panel settings-panel"><div className="settings-panel-heading"><h2>A heads-up, on your terms.</h2><p className="muted">Choose which reminders you would like to receive.</p></div><Toggle id="renewal-reminders" label="Renewal reminders" description="Keep upcoming billing dates on your radar." checked={preferences.renewalReminders} onChange={(checked) => setPreferences({ ...preferences, renewalReminders: checked })} /><Toggle id="unusual-charges" label="Unusual charge alerts" description="Hear about possible price changes and duplicate payments." checked={preferences.unusualCharges} onChange={(checked) => setPreferences({ ...preferences, unusualCharges: checked })} /><Toggle id="weekly-digest" label="Weekly spending digest" description="A quieter, once-a-week look at your subscriptions." checked={preferences.weeklyDigest} onChange={(checked) => setPreferences({ ...preferences, weeklyDigest: checked })} /><div className="settings-notice"><Bell size={18} aria-hidden="true" /><p>These switches save demo preferences only. Email, push notifications, and scheduled delivery are not connected.</p></div></section>}
          {section === 'security' && <section className="panel settings-panel"><div className="settings-panel-heading"><h2>Security & connections</h2><p className="muted">A transparent view of what’s connected.</p></div><div className="security-connection"><div className="security-connection-icon"><LockKeyhole size={21} aria-hidden="true" /></div><div><strong>Supabase authentication</strong><p className="muted">Login and password recovery are prepared for a future integration.</p></div><Badge tone="neutral">Not connected</Badge></div><div className="security-connection"><div className="security-connection-icon"><ShieldCheck size={21} aria-hidden="true" /></div><div><strong>PayPal Sandbox</strong><p className="muted">No payment credentials, merchant events, or bank accounts are connected.</p></div><Badge tone="neutral">Not connected</Badge></div><div className="settings-notice"><Info size={18} aria-hidden="true" /><p>This demo is open without authentication. Store only sample data here. Passwords and API secrets are never saved in this workspace.</p></div><Link to="/login" className="text-link">Preview authentication <ArrowRight size={15} aria-hidden="true" /></Link></section>}
          {section === 'account' && <section className="panel settings-panel"><div className="settings-panel-heading"><h2>Demo workspace</h2><p className="muted">Your sample data, with a fresh start whenever you need it.</p></div><div className="preference-row"><div><strong>Export demo data</strong><p className="muted">Download subscriptions, simulated transactions, and local preferences as JSON.</p></div><Button variant="secondary" type="button" onClick={exportData}><Download size={15} aria-hidden="true" /> Export JSON</Button></div><div className="demo-reset-box"><div><strong>Reset this demo workspace</strong><p className="muted">Remove your local edits and uploads, restore the original sample data, and bring back dismissed insights. This does not delete any real account.</p></div><Button variant="danger" type="button" onClick={() => setResetOpen(true)}><RotateCcw size={15} aria-hidden="true" /> Reset demo</Button></div></section>}
          {['profile', 'preferences', 'notifications'].includes(section) && <div className="settings-save-bar"><span><Check size={15} aria-hidden="true" /> Saved locally, never sent to a server</span><Button type="submit" disabled={busy}><Save size={15} aria-hidden="true" />{busy ? 'Saving…' : 'Save changes'}</Button></div>}
        </form>
      </div>
      {resetOpen && <Modal title="Start fresh with the demo?" description="This removes your local subscription edits, imported demo transactions, and preferences, then restores the original sample workspace. This action cannot be undone." onClose={() => !busy && setResetOpen(false)}><div className="modal-actions"><Button variant="secondary" onClick={() => setResetOpen(false)} disabled={busy}>Keep my changes</Button><Button variant="danger" onClick={reset} disabled={busy}>{busy ? 'Resetting…' : 'Reset demo workspace'}</Button></div></Modal>}
    </div>
  )
}
