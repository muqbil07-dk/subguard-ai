import { useState } from 'react';
import { Button, Field } from '../../components/ui.jsx';
import { parseAmount, supportedCurrencies } from '../../utils/finance.js';

export const categories = ['Entertainment', 'Productivity', 'Design', 'Cloud storage', 'Education', 'Health & fitness', 'Shopping', 'Other'];
export const frequencies = ['Weekly', 'Monthly', 'Quarterly', 'Yearly'];

function decimalAmount(minor, currency) {
  const digits = currency === 'JPY' ? 0 : 2;
  const value = String(minor || '0').padStart(digits + 1, '0');
  return digits ? `${value.slice(0, -digits)}.${value.slice(-digits)}` : value;
}

export default function SubscriptionForm({ subscription, currency = 'INR', onSubmit, onCancel }) {
  const [values, setValues] = useState({
    name: subscription?.name || '',
    category: subscription?.category || 'Entertainment',
    amount: subscription ? decimalAmount(subscription.amountMinor, subscription.currency) : '',
    currency: subscription?.currency || currency,
    frequency: subscription?.frequency || 'Monthly',
    nextRenewal: subscription?.nextRenewal || '2026-11-15',
    status: subscription?.status || 'Active',
    reminder: subscription?.reminder ?? true,
    unused: subscription?.unused ?? false,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  function change(event) {
    const { name, value, type, checked } = event.target;
    setValues(previous => ({ ...previous, [name]: type === 'checkbox' ? checked : value }));
  }
  async function submit(event) {
    event.preventDefault();
    const nextErrors = {};
    if (!values.name.trim()) nextErrors.name = 'Enter a subscription name.';
    else if (values.name.trim().length > 80) nextErrors.name = 'Use 80 characters or fewer.';
    let amountMinor;
    try {
      amountMinor = parseAmount(values.amount, values.currency);
      if (BigInt(amountMinor) <= 0n) throw new Error();
    } catch {
      nextErrors.amount = values.currency === 'JPY' ? 'Enter a positive whole amount.' : 'Enter a positive amount with up to 2 decimal places.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.nextRenewal) || Number.isNaN(Date.parse(`${values.nextRenewal}T00:00:00Z`)) || new Date(`${values.nextRenewal}T00:00:00Z`).toISOString().slice(0, 10) !== values.nextRenewal) nextErrors.nextRenewal = 'Choose a valid renewal date.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const { amount: _amount, ...fields } = values;
      void _amount;
      await onSubmit({ ...fields, name: fields.name.trim(), amountMinor, color: subscription?.color || '#8b5cf6', initials: fields.name.trim().slice(0, 2).toUpperCase() });
    } catch (error) {
      setErrors({ form: error.message || 'Could not save. Please try again.' });
    } finally { setSaving(false); }
  }
  return <form onSubmit={submit} noValidate className="subscription-form">
    {errors.form && <div className="form-error" role="alert">{errors.form}</div>}
    <Field label="Subscription name" error={errors.name}><input className="input" name="name" value={values.name} onChange={change} placeholder="e.g. Spotify Premium" maxLength={80} autoFocus aria-invalid={Boolean(errors.name)} /></Field>
    <div className="form-columns">
      <Field label="Amount per billing cycle" error={errors.amount}><input className="input" name="amount" value={values.amount} onChange={change} inputMode="decimal" placeholder="0.00" aria-invalid={Boolean(errors.amount)} /></Field>
      <Field label="Currency"><select className="select" name="currency" value={values.currency} onChange={change}>{supportedCurrencies.map(code => <option key={code}>{code}</option>)}</select></Field>
    </div>
    <div className="form-columns">
      <Field label="Category"><select className="select" name="category" value={values.category} onChange={change}>{[...new Set([...categories, ...(subscription?.category ? [subscription.category] : [])])].map(category => <option key={category}>{category}</option>)}</select></Field>
      <Field label="Billing frequency"><select className="select" name="frequency" value={values.frequency} onChange={change}>{frequencies.map(frequency => <option key={frequency}>{frequency}</option>)}</select></Field>
    </div>
    <div className="form-columns">
      <Field label="Next renewal" error={errors.nextRenewal}><input className="input" type="date" name="nextRenewal" value={values.nextRenewal} onChange={change} aria-invalid={Boolean(errors.nextRenewal)} /></Field>
      <Field label="Tracking status"><select className="select" name="status" value={values.status} onChange={change}>{['Active', 'Paused', 'Cancelled'].map(status => <option key={status}>{status}</option>)}</select></Field>
    </div>
    <label className="checkbox-row"><input type="checkbox" name="reminder" checked={values.reminder} onChange={change} /><span>Show a renewal reminder in this demo</span></label>
    <label className="checkbox-row"><input type="checkbox" name="unused" checked={values.unused} onChange={change} /><span>I have marked this subscription as unused</span></label>
    <p className="form-note">Changes affect local demo tracking only. They never cancel a merchant subscription or stop a payment.</p>
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : subscription ? 'Save changes' : 'Add subscription'}</Button></div>
  </form>;
}
