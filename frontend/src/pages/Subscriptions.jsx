import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, CalendarDays, CreditCard, LayoutGrid, List, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Badge, Button, EmptyState, MerchantIcon, Modal, PageHeader } from '../components/ui.jsx';
import { useDemo } from '../hooks/useDemo.js';
import { formatDate, formatMoney } from '../utils/finance.js';
import SubscriptionForm, { frequencies } from '../features/subscriptions/SubscriptionForm.jsx';
import './management.css';

export default function Subscriptions() {
  const { data, currency, addSubscription, updateSubscription, deleteSubscription, toast } = useDemo();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('All statuses');
  const [frequency, setFrequency] = useState('All frequencies');
  const [view, setView] = useState('cards');
  const [editing, setEditing] = useState(() => searchParams.get('add') === 'true' ? null : undefined);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const subscriptions = data?.subscriptions || [];
  const categories = [...new Set(subscriptions.map(subscription => subscription.category))].sort();
  const visible = subscriptions.filter(subscription => subscription.currency === currency && subscription.name.toLowerCase().includes(query.toLowerCase()) && (category === 'All categories' || subscription.category === category) && (status === 'All statuses' || subscription.status === status) && (frequency === 'All frequencies' || subscription.frequency === frequency));
  const reset = () => { setQuery(''); setCategory('All categories'); setStatus('All statuses'); setFrequency('All frequencies'); };
  function closeEditor() {
    setEditing(undefined);
    if (searchParams.has('add')) {
      const remaining = new URLSearchParams(searchParams);
      remaining.delete('add');
      setSearchParams(remaining, { replace: true });
    }
  }
  async function save(input) {
    if (editing) await updateSubscription(editing.id, input);
    else await addSubscription(input);
    toast(editing ? 'Subscription updated in your demo.' : 'Subscription added to your demo.');
    closeEditor();
  }
  async function remove() {
    setBusy(true); setDeleteError('');
    try { await deleteSubscription(deleting.id); toast('Subscription removed from your demo.'); setDeleting(null); }
    catch (error) { setDeleteError(error.message || 'Could not delete. Try again.'); }
    finally { setBusy(false); }
  }
  const actions = subscription => <div className="row-actions"><Button variant="ghost" onClick={() => setEditing(subscription)} aria-label={`Edit ${subscription.name}`}><Pencil size={15} /></Button><Button variant="ghost" onClick={() => { setDeleteError(''); setDeleting(subscription); }} aria-label={`Delete ${subscription.name}`}><Trash2 size={15} /></Button></div>;
  return <div className="page-stack">
    <PageHeader eyebrow="YOUR SUBSCRIPTION SPACE" title="Subscriptions" description="A little less forgotten. A lot more in control." actions={<Button onClick={() => setEditing(null)}><Plus size={17} /> Add subscription</Button>} />
    <div className="management-summary"><span><CreditCard size={17} /> {subscriptions.filter(subscription => subscription.status === 'Active' && subscription.currency === currency).length} active subscriptions</span><span className="muted">Local demo · {currency} only · no live connections</span></div>
    <section className="panel">
      <div className="toolbar management-toolbar">
        <label className="search-field"><Search size={17} /><input aria-label="Search subscriptions" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search subscriptions…" /></label>
        <div className="filter-group"><SlidersHorizontal size={16} aria-hidden="true" /><select className="select" aria-label="Filter category" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select className="select" aria-label="Filter status" value={status} onChange={event => setStatus(event.target.value)}><option>All statuses</option>{['Active', 'Paused', 'Cancelled'].map(item => <option key={item}>{item}</option>)}</select><select className="select" aria-label="Filter billing frequency" value={frequency} onChange={event => setFrequency(event.target.value)}><option>All frequencies</option>{frequencies.map(item => <option key={item}>{item}</option>)}</select></div>
        <div className="view-switch" aria-label="Subscription view"><button type="button" className={view === 'cards' ? 'selected' : ''} aria-label="Card view" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><LayoutGrid size={17} /></button><button type="button" className={view === 'table' ? 'selected' : ''} aria-label="Table view" aria-pressed={view === 'table'} onClick={() => setView('table')}><List size={17} /></button></div>
      </div>
      {!visible.length ? <EmptyState icon={Search} title="No subscriptions found" description={`Try another filter or add your first ${currency} subscription.`} action={<Button variant="secondary" onClick={reset}>Clear filters</Button>} /> : view === 'cards' ? <div className="subscription-grid">{visible.map(subscription => <article className="subscription-card" key={subscription.id}>
        <div className="subscription-card-top"><MerchantIcon {...subscription} /><Badge tone={subscription.status === 'Active' ? 'green' : subscription.status === 'Paused' ? 'amber' : 'neutral'}>{subscription.status}</Badge></div>
        <h3>{subscription.name}</h3><p className="muted subscription-category">{subscription.category}</p>
        <div className="subscription-price">{formatMoney(subscription.amountMinor, subscription.currency)}<span> / {subscription.frequency.toLowerCase()}</span></div>
        <div className="subscription-renewal"><CalendarDays size={14} /><span>{subscription.status === 'Active' ? 'Renews' : 'Last planned renewal'} {formatDate(subscription.nextRenewal)}</span>{subscription.reminder && <Bell size={13} aria-label="Reminder enabled" />}</div>
        <div className="subscription-card-bottom"><span className="muted">{subscription.unused ? 'Marked unused by you' : 'Demo subscription'}</span>{actions(subscription)}</div>
      </article>)}</div> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Subscription</th><th>Category</th><th>Amount</th><th>Billing cycle</th><th>Next renewal</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map(subscription => <tr key={subscription.id}><td><div className="merchant-cell"><MerchantIcon {...subscription} /><span>{subscription.name}</span></div></td><td>{subscription.category}</td><td className="amount-cell">{formatMoney(subscription.amountMinor, subscription.currency)}</td><td>{subscription.frequency}</td><td>{formatDate(subscription.nextRenewal)}</td><td><Badge tone={subscription.status === 'Active' ? 'green' : subscription.status === 'Paused' ? 'amber' : 'neutral'}>{subscription.status}</Badge></td><td>{actions(subscription)}</td></tr>)}</tbody></table></div>}
      <div className="table-footer"><span>Showing {visible.length} of {subscriptions.filter(subscription => subscription.currency === currency).length} subscriptions in {currency}</span><span>All data stays in this browser</span></div>
    </section>
    {editing !== undefined && <Modal title={editing ? 'Edit subscription' : 'Add a subscription'} description="Keep your recurring expenses in view." onClose={closeEditor}><SubscriptionForm subscription={editing} currency={currency} onSubmit={save} onCancel={closeEditor} /></Modal>}
    {deleting && <Modal title={`Delete ${deleting.name}?`} description="This removes local demo tracking only. It does not cancel the subscription with the merchant, and past transactions are retained." onClose={() => { if (!busy) setDeleting(null); }}>{deleteError && <p className="form-error" role="alert">{deleteError}</p>}<div className="modal-actions"><Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>Keep subscription</Button><Button variant="danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete subscription'}</Button></div></Modal>}
  </div>;
}
