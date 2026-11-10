import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { authService } from '../services/authService.js'
import { accountService as store } from '../services/accountService.js'
import { apiService } from '../services/apiService.js'
import LiveAssistant from './LiveAssistant.jsx'
import IntelligencePanel from './IntelligencePanel.jsx'
import AccountAnalytics from './AccountAnalytics.jsx'
import { Button, Field, LoadingState, Modal } from '../components/ui.jsx'
import SubscriptionForm from '../features/subscriptions/SubscriptionForm.jsx'
import { formatMoney } from '../utils/finance.js'
export default function Account(){
 const [session,setSession]=useState(undefined)
 useEffect(()=>{
  let active=true,authChanged=false
  if(!supabase){Promise.resolve().then(()=>active&&setSession(null));return()=>{active=false}}
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{authChanged=true;if(active)setSession(s)})
  supabase.auth.getSession().then(({data,error})=>{if(active&&!authChanged)setSession(error?null:data.session)}).catch(()=>{if(active&&!authChanged)setSession(null)})
  return()=>{active=false;subscription.unsubscribe()}
 },[])
 if(session===undefined)return <LoadingState />
 if(!session)return <Navigate to="/login" replace />
 return <Workspace key={session.user.id} user={session.user}/>
}
function Workspace({user}){
 const [analyticsVersion,setAnalyticsVersion]=useState(0);
 const [tab,setTab]=useState('dashboard'),[rows,setRows]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[editing,setEditing]=useState(undefined)
 const loadVersion=useRef(0),currentTab=useRef('dashboard')
 useEffect(()=>()=>{loadVersion.current++},[])
 async function load(t=tab){
  if(t!==currentTab.current||!store[t])return
  const version=++loadVersion.current
  setBusy(true)
  try{const result=await store[t].list();if(version===loadVersion.current){setRows(result);setError('')}}
  catch(e){if(version===loadVersion.current)setError(e.message)}
  finally{if(version===loadVersion.current)setBusy(false)}
 }
 function selectTab(t){currentTab.current=t;loadVersion.current++;setRows([]);setError('');setBusy(false);setEditing(undefined);setTab(t);if(store[t])load(t)}
 async function action(fn){try{await fn();await load()}catch(e){setError(e.message)}}
 return <main className="workspace-content page-stack"><header className="page-header"><h1>Your account</h1><Button onClick={async()=>{try{await authService.logout()}catch(e){setError(e.message)}}}>Log out</Button></header><p>{user.email} · Persistent records · No demo data</p><nav className="inline-actions">{['dashboard','assistant',...Object.keys(store)].map(t=><Button key={t} onClick={()=>selectTab(t)}>{t}</Button>)}<Link to="/app">Separate demo workspace</Link></nav>{error&&<p role="alert">{error}{store[tab]?<Button onClick={()=>load()}>Retry</Button>:<Button onClick={()=>setError('')}>Dismiss</Button>}</p>}{busy&&<p role="status">Loading…</p>}{tab==='subscriptions'&&<Button onClick={()=>setEditing(null)}>Add subscription</Button>}{tab==='assistant'?<LiveAssistant/>:tab==='dashboard'?<><AccountAnalytics key={analyticsVersion}/><IntelligencePanel onChanged={()=>setAnalyticsVersion(v=>v+1)}/></>:rows.map(row=><article key={row.id} className="panel panel-padding"><h2>{row.name||row.merchant||row.title||row.currency||'Profile'}</h2>{row.amountMinor&&<p>{formatMoney(row.amountMinor,row.currency)} · {row.nextRenewal||row.date}</p>}{row.description||row.body}<p>{row.email||row.status||row.provenance}</p>{tab==='subscriptions'&&<><Button onClick={()=>setEditing(row)}>Edit</Button><Button variant="danger" onClick={()=>{if(window.confirm('Remove tracking only? This does not cancel a merchant agreement.'))action(()=>store.subscriptions.delete(row.id))}}>Delete</Button></>}{tab==='transactions'&&<><Button onClick={()=>action(()=>store.transactions.update(row.id,{status:row.status==='Pending'?'Completed':'Pending'}))}>Toggle pending/completed</Button><Button onClick={()=>{if(window.confirm('Delete imported record?'))action(()=>store.transactions.delete(row.id))}}>Delete</Button></>}{tab==='notifications'&&<><Button onClick={()=>action(()=>store.notifications.update(row.id,{read_at:new Date().toISOString()}))}>Mark read</Button><Button variant="danger" onClick={()=>{if(window.confirm('Delete notification?'))action(()=>store.notifications.delete(row.id))}}>Delete notification</Button></>}{tab==='insights'&&<Button onClick={()=>action(()=>store.insights.update(row.id,{dismissed:!row.dismissed}))}>{row.dismissed?'Restore':'Dismiss'}</Button>}{['profiles','preferences'].includes(tab)&&<ProfileEditor row={row} tab={tab} save={input=>action(()=>store[tab].update(row.id,input))}/>}</article>)}{!['dashboard','assistant'].includes(tab)&&!rows.length&&!busy&&<p>No records yet. Insights and notifications are never fabricated.</p>}{tab==='transactions'&&<Field label="Import CSV"><input type="file" accept=".csv" onChange={e=>action(async()=>{const f=e.target.files?.[0];if(!f)return;if(f.size>1048576)throw new Error('Maximum 1 MB');const {parseTransactionCsv}=await import('../utils/csv.js');const text=await f.text();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));const batch=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');await apiService.importTransactions(parseTransactionCsv(text),batch)})}/></Field>}{editing!==undefined&&<Modal title="Subscription" onClose={()=>setEditing(undefined)}><SubscriptionForm subscription={editing} currency="INR" onCancel={()=>setEditing(undefined)} onSubmit={async input=>{if(editing)await store.subscriptions.update(editing.id,input);else await store.subscriptions.create(input);setEditing(undefined);await load()}}/></Modal>}</main>
}
function ProfileEditor({row,tab,save}){const [value,setValue]=useState(row);return <form onSubmit={e=>{e.preventDefault();save(value)}}>{tab==='profiles'?<><Field label="Name"><input required maxLength={80} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></Field><p>Created {row.created_at}. Email is managed by Auth.</p></>:<><Field label="Currency"><select value={value.currency} onChange={e=>setValue({...value,currency:e.target.value})}>{['INR','USD','EUR','GBP','JPY'].map(c=><option key={c}>{c}</option>)}</select></Field>{['renewal_reminders','unusual_charges','weekly_digest'].map(k=><Field key={k} label={k}><input type="checkbox" checked={value[k]} onChange={e=>setValue({...value,[k]:e.target.checked})}/></Field>)}</>}<Button type="submit">Save</Button></form>}
export function ResetPassword(){const [password,setPassword]=useState(''),[message,setMessage]=useState('');return <main className="workspace-content"><h1>Choose a new password</h1><form onSubmit={async e=>{e.preventDefault();try{await authService.updatePassword(password);setPassword('');setMessage('Password updated.')}catch(e){setMessage(e.message)}}}><Field label="New password"><input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></Field><Button type="submit">Update password</Button><p role="status">{message}</p><Link to="/account">Open account</Link></form></main>}
