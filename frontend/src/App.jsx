import { lazy, Suspense, useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import AppLayout from './layouts/AppLayout.jsx'
import { EmptyState, LoadingState } from './components/ui.jsx'

const Account = lazy(() => import('./pages/Account.jsx'))
const ResetPassword = lazy(() => import('./pages/Account.jsx').then(m => ({default:m.ResetPassword})))
const Landing = lazy(() => import('./pages/Landing.jsx'))
const Auth = lazy(() => import('./pages/Auth.jsx'))
const Overview = lazy(() => import('./pages/Overview.jsx'))
const Subscriptions = lazy(() => import('./pages/Subscriptions.jsx'))
const Transactions = lazy(() => import('./pages/Transactions.jsx'))
const Calendar = lazy(() => import('./pages/Calendar.jsx'))
const Insights = lazy(() => import('./pages/Insights.jsx'))
const Assistant = lazy(() => import('./pages/Assistant.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))

export default function App() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return <Suspense fallback={<LoadingState />}><Routes><Route path="/" element={<Landing />} /><Route path="/login" element={<Auth mode="login" />} /><Route path="/register" element={<Auth mode="register" />} /><Route path="/forgot-password" element={<Auth mode="forgot" />} /><Route path="/account" element={<Account />} /><Route path="/reset-password" element={<ResetPassword />} /><Route path="/app" element={<AppLayout />}><Route index element={<Overview />} /><Route path="subscriptions" element={<Subscriptions />} /><Route path="transactions" element={<Transactions />} /><Route path="calendar" element={<Calendar />} /><Route path="insights" element={<Insights />} /><Route path="assistant" element={<Assistant />} /><Route path="reports" element={<Reports />} /><Route path="settings" element={<Settings />} /></Route><Route path="*" element={<main className="not-found"><EmptyState title="This page wandered off." description="Let’s get you back to your subscription picture." action={<Link className="button button-primary" to="/app">Back to overview</Link>} /></main>} /></Routes></Suspense>
}
