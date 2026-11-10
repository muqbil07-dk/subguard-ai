import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { Button, Field, Logo } from '../components/ui'
import { authService } from '../services/authService'
import './marketing.css'

const copy = {
  login: { eyebrow: 'A LITTLE CLARITY STARTS HERE', title: 'Welcome back.', description: 'A clearer view of your subscriptions is waiting.', submit: 'Log in', loading: 'Checking connection…' },
  register: { eyebrow: 'YOUR MONEY. MORE INTENTION.', title: 'Make room for more.', description: 'Start a more considered relationship with your subscriptions.', submit: 'Create account', loading: 'Checking connection…' },
  forgot: { eyebrow: 'LET’S GET YOU BACK IN', title: 'Forgot your password?', description: 'Enter your email to request a password reset.', submit: 'Send reset link', loading: 'Checking connection…' },
}

export default function Auth({ mode = 'login' }) {
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [serviceError, setServiceError] = useState('')
  const [loading, setLoading] = useState(false)
  const content = copy[mode] || copy.login

  function update(event) {
    const { name, value } = event.target
    setValues(current => ({ ...current, [name]: value }))
    setErrors(current => ({ ...current, [name]: '' }))
    setServiceError('')
  }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (mode === 'register' && values.name.trim().length < 2) next.name = 'Enter a name with at least 2 characters.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) next.email = 'Enter a valid email address.'
    if (mode !== 'forgot' && values.password.length < 8) next.password = 'Use at least 8 characters.'
    if (mode === 'register' && values.confirm !== values.password) next.confirm = 'Your passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length) return
    setLoading(true)
    setServiceError('')
    try {
      const request = { name: values.name.trim(), email: values.email.trim(), password: values.password }
      if (mode === 'register') await authService.register(request)
      else if (mode === 'forgot') await authService.resetPassword({ email: values.email.trim() })
      else await authService.login(request)
    } catch (error) {
      setServiceError(error.message || 'Authentication is not connected yet. You can explore the local demo instead.')
    } finally {
      setValues(current => ({ ...current, password: '', confirm: '' }))
      setLoading(false)
    }
  }

  return <div className="auth-page"><aside className="auth-story"><Logo /><div className="auth-story-main"><span className="auth-story-mark"><ShieldCheck size={39} strokeWidth={1.4} /></span><span className="section-kicker">LESS NOISE. MORE POSSIBILITY.</span><h1>A little clarity.<br /><span>A lot more control.</span></h1><p>See your subscriptions differently. Keep what brings you value. Make space for what matters.</p><div className="auth-value-list"><span><Check size={16} /> Your recurring world, in one place</span><span><Check size={16} /> Renewal dates worth remembering</span><span><Check size={16} /> Insights that invite better decisions</span></div><div className="auth-story-insight"><Sparkles size={20} /><div><strong>One less thing on your mind.</strong><span>Never Lose Money on Forgotten Subscriptions.</span></div></div></div><small>SUBGUARD AI · BUILT WITH INTENTION</small></aside><main className="auth-main"><Link to="/" className="auth-back"><ArrowLeft size={16} /> Back to home</Link><div className="auth-form-wrap"><span className="section-kicker">{content.eyebrow}</span><h2>{content.title}</h2><p className="auth-description">{content.description}</p><div className="auth-demo-notice"><ShieldCheck size={17} /><span>Authentication preview. Supabase is not connected yet. No account will be created and no reset email will be sent.</span></div><form onSubmit={submit} noValidate>
      {mode === 'register' && <Field label="Full name" error={errors.name}><input id="auth-name" name="name" type="text" autoComplete="name" value={values.name} onChange={update} maxLength={80} placeholder="Your full name" aria-invalid={Boolean(errors.name)} /></Field>}
      <Field label="Email address" error={errors.email}><input id="auth-email" name="email" type="email" autoComplete="email" value={values.email} onChange={update} maxLength={254} placeholder="you@example.com" aria-invalid={Boolean(errors.email)} /></Field>
      {mode !== 'forgot' && <Field label="Password" error={errors.password}><div className="auth-password"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={values.password} onChange={update} maxLength={128} placeholder="At least 8 characters" aria-invalid={Boolean(errors.password)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(show => !show)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></Field>}
      {mode === 'register' && <Field label="Confirm password" error={errors.confirm}><input id="auth-confirm" name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={values.confirm} onChange={update} maxLength={128} placeholder="Enter your password again" aria-invalid={Boolean(errors.confirm)} /></Field>}
      {mode === 'login' && <div className="auth-forgot"><Link to="/forgot-password">Forgot password?</Link></div>}
      {serviceError && <div className="auth-service-error" role="alert">{serviceError}</div>}
      <Button type="submit" disabled={loading} className="auth-submit">{loading ? <LoaderCircle className="auth-spin" size={17} /> : null}{loading ? content.loading : content.submit}{!loading && <ArrowRight size={17} />}</Button>
    </form>{mode === 'login' ? <p className="auth-switch">New to SubGuard? <Link to="/register">Create an account</Link></p> : <p className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'Remember your password?'} <Link to="/login">Log in</Link></p>}<div className="auth-divider"><span>or take a look around</span></div><Link to="/app" className="marketing-button marketing-button-outline auth-demo-button">Explore the local demo <ArrowUpRightIcon /></Link><p className="auth-privacy">Demo records stay in this browser. Never enter a real financial account password in this preview.</p></div><div className="auth-bottom"><ShieldCheck size={13} /> Designed around privacy. Built for clarity.</div></main></div>
}

function ArrowUpRightIcon() {
  return <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 15 15 5M5 5h10v10" /></svg>
}
