import { createContext, useCallback, useEffect, useRef, useState } from 'react'
import { demoService } from '../services/demoService.js'

export const DemoContext = createContext(null)

export function DemoProvider({ children }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toasts, setToasts] = useState([])
  const timers = useRef([])
  const toast = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID()
    setToasts(current => [...current.slice(-2), { id, message, type }])
    timers.current.push(setTimeout(() => setToasts(current => current.filter(item => item.id !== id)), 5000))
  }, [])
  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setData(await demoService.getSnapshot()) } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    let active = true
    const currentTimers = timers.current
    demoService.getSnapshot().then(snapshot => { if (active) { setData(snapshot); setLoading(false) } }).catch(e => { if (active) { setError(e.message); setLoading(false) } })
    return () => { active = false; currentTimers.forEach(clearTimeout) }
  }, [])
  const mutate = async (method, ...args) => {
    const snapshot = await demoService[method](...args)
    setData(snapshot)
    setError('')
    return snapshot
  }
  const value = {
    data, loading, error, reload, toast, currency: data?.preferences.currency || 'INR',
    addSubscription: input => mutate('addSubscription', input),
    updateSubscription: (id, input) => mutate('updateSubscription', id, input),
    deleteSubscription: id => mutate('deleteSubscription', id),
    importTransactions: (rows, batchKey) => mutate('importTransactions', rows, batchKey),
    updateSettings: input => mutate('updateSettings', input),
    dismissInsight: id => mutate('dismissInsight', id),
    restoreInsights: () => mutate('restoreInsights'),
    resetDemo: () => mutate('resetDemo'),
  }
  return <DemoContext.Provider value={value}>{children}<div className="toast-stack" role="status" aria-live="polite">{toasts.map(item => <div className={`toast toast-${item.type}`} key={item.id}><span>{item.message}</span><button aria-label="Dismiss notification" onClick={() => setToasts(current => current.filter(t => t.id !== item.id))}>×</button></div>)}</div></DemoContext.Provider>
}
