import { DEMO_TODAY } from '../data/demoData';

export { DEMO_TODAY };
export const supportedCurrencies = ['INR', 'USD', 'EUR', 'GBP', 'JPY'];
const colors = ['#9279ff', '#56b6e8', '#45cfab', '#f0ad65', '#da7bb6', '#7f9af4', '#a2b3ca'];
const maxMinor = 9007199254740991n;
const maxDatabaseMinor = 9223372036854775807n;

export function currencyDigits(currency) {
  if (!supportedCurrencies.includes(currency)) throw new Error('Select a supported currency.');
  return currency === 'JPY' ? 0 : 2;
}

function moneyInteger(amount) {
  if (!/^\d+$/.test(String(amount))) throw new Error('Amount must be a nonnegative integer in minor units.');
  const value = BigInt(amount);
  if (value > maxDatabaseMinor) throw new Error('Amount exceeds the supported limit.');
  return value;
}

export function parseAmount(decimal, currency = 'INR') {
  const digits = currencyDigits(currency);
  const text = String(decimal).trim();
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(text)) throw new Error(`Enter a positive amount with at most ${digits} decimal places.`);
  const [whole, fraction = ''] = text.split('.');
  return moneyInteger(`${whole}${fraction.padEnd(digits, '0')}`).toString();
}

export function formatMoney(amountMinor, currency = 'INR') {
  const signed = String(amountMinor);
  const negative = signed.startsWith('-');
  const value = moneyInteger(negative ? signed.slice(1) : signed);
  const digits = currencyDigits(currency);
  // Format integer and fractional parts separately; no binary floating-point money conversion.
  const scale = 10n ** BigInt(digits);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(digits, '0');
  const formatter = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-GB', {
    style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
  const formatted = formatter.formatToParts(whole).map((part) => part.type === 'fraction' ? fraction : part.value).join('');
  return negative && value !== 0n ? `-${formatted}` : formatted;
}

function roundDivide(value, divisor) {
  return (value + divisor / 2n) / divisor;
}

export function monthlyMinor(subscription) {
  const amount = moneyInteger(subscription.amountMinor);
  switch (subscription.frequency) {
    case 'Weekly': return roundDivide(amount * 52n, 12n);
    case 'Half-yearly': return roundDivide(amount, 6n);
    case 'Quarterly': return roundDivide(amount, 3n);
    case 'Yearly': return roundDivide(amount, 12n);
    case 'Monthly': return amount;
    default: throw new Error('Choose a supported billing frequency.');
  }
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function daysUntil(date) {
  if (!validDate(date)) throw new Error('Choose a valid calendar date.');
  return Math.round((new Date(`${date}T12:00:00Z`) - new Date(`${DEMO_TODAY}T12:00:00Z`)) / 86400000);
}

export function addMonths(date, count) {
  if (!validDate(date) || !Number.isInteger(count)) throw new Error('Invalid calendar date or month offset.');
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1 + count, 1, 12));
  const end = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, end));
  return next.toISOString().slice(0, 10);
}

export function formatDate(date, options = {}) {
  if (!validDate(date)) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC', ...options }).format(new Date(`${date}T12:00:00Z`));
}

export function getUpcoming(subscriptions, currency = 'INR', days = 30) {
  return subscriptions.filter((plan) => plan.status === 'Active' && plan.currency === currency && daysUntil(plan.nextRenewal) >= 0 && daysUntil(plan.nextRenewal) <= days)
    .sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal) || a.name.localeCompare(b.name));
}

export function getSummary(snapshot, currency = 'INR') {
  const active = snapshot.subscriptions.filter((plan) => plan.status === 'Active' && plan.currency === currency);
  const insights = getInsights(snapshot, currency);
  return {
    activeCount: active.length,
    monthlyMinor: active.reduce((sum, plan) => sum + monthlyMinor(plan), 0n).toString(),
    upcomingMinor: getUpcoming(active, currency, 30).reduce((sum, plan) => sum + moneyInteger(plan.amountMinor), 0n).toString(),
    savingsMinor: active.filter((plan) => plan.unused).reduce((sum, plan) => sum + monthlyMinor(plan), 0n).toString(),
    unusualCount: insights.filter((insight) => ['price', 'duplicate'].includes(insight.type)).length,
  };
}

function chartAmount(minor, currency) {
  const value = BigInt(minor);
  if (value > maxMinor) throw new Error('This amount is too large for a chart. View the exact amount instead.');
  return Number(value) / (10 ** currencyDigits(currency));
}

export function getMonthlySpending(transactions, currency = 'INR', months = 6) {
  const thisMonth = `${DEMO_TODAY.slice(0, 7)}-01`;
  return Array.from({ length: months }, (_, index) => {
    const date = addMonths(thisMonth, index - months + 1);
    const key = date.slice(0, 7);
    const total = transactions.filter((row) => row.currency === currency && row.type === 'imported' && row.status === 'Completed' && row.date.startsWith(key) && row.date <= DEMO_TODAY)
      .reduce((sum, row) => sum + (row.direction === 'credit' ? -1n : 1n) * moneyInteger(row.amountMinor), 0n);
    return { month: formatDate(date, { day: undefined, month: 'short' }), key, amount: total < 0n ? -chartAmount(-total, currency) : chartAmount(total, currency) };
  });
}

export function getCategorySpending(subscriptions, currency = 'INR') {
  const totals = new Map();
  for (const plan of subscriptions.filter((item) => item.status === 'Active' && item.currency === currency)) {
    totals.set(plan.category, (totals.get(plan.category) || 0n) + monthlyMinor(plan));
  }
  return [...totals].map(([name, value], index) => ({ name, value: chartAmount(value, currency), amountMinor: value.toString(), color: colors[index % colors.length] })).sort((a, b) => b.value - a.value);
}

export function getNetSpend(transactions, currency = 'INR', { from, to = DEMO_TODAY } = {}) {
  currencyDigits(currency);
  return transactions.filter((row) => row.currency === currency && row.type === 'imported' && row.status === 'Completed' && (!from || row.date >= from) && (!to || row.date <= to))
    .reduce((sum, row) => sum + (row.direction === 'credit' ? -1n : 1n) * moneyInteger(row.amountMinor), 0n).toString();
}

export function getReportSummary(snapshot, currency = 'INR', period = 'monthly') {
  if (!['monthly', 'yearly'].includes(period)) throw new Error('Select a monthly or yearly report.');
  const from = period === 'yearly' ? `${DEMO_TODAY.slice(0, 4)}-01-01` : `${DEMO_TODAY.slice(0, 7)}-01`;
  const summary = getSummary(snapshot, currency);
  return {
    spentMinor: getNetSpend(snapshot.transactions, currency, { from, to: DEMO_TODAY }),
    annualizedMinor: snapshot.subscriptions.filter(plan => plan.status === 'Active' && plan.currency === currency).reduce((sum, plan) => sum + moneyInteger(plan.amountMinor) * BigInt({ Weekly: 52, Monthly: 12, Quarterly: 4, 'Half-yearly': 2, Yearly: 1 }[plan.frequency]), 0n).toString(),
    savingsMinor: summary.savingsMinor, monthlyMinor: summary.monthlyMinor,
    transactionCount: snapshot.transactions.filter((row) => row.currency === currency && row.type === 'imported' && row.status === 'Completed' && row.date >= from && row.date <= DEMO_TODAY).length,
    from, to: DEMO_TODAY, period,
  };
}

export function getInsights(snapshot, currency = 'INR') {
  const active = snapshot.subscriptions.filter((plan) => plan.status === 'Active' && plan.currency === currency);
  const insights = [];
  for (const plan of active) {
    if (plan.previousAmountMinor && moneyInteger(plan.amountMinor) * 100n > moneyInteger(plan.previousAmountMinor) * 105n && moneyInteger(plan.amountMinor) - moneyInteger(plan.previousAmountMinor) >= 10n ** BigInt(currencyDigits(currency))) {
      insights.push({ id: `price-${plan.id}`, type: 'price', title: `${plan.name} price increased`, description: `The demo plan changed from ${formatMoney(plan.previousAmountMinor, currency)} to ${formatMoney(plan.amountMinor, currency)} per billing period. Review the plan before its next renewal.`, amountMinor: (moneyInteger(plan.amountMinor) - moneyInteger(plan.previousAmountMinor)).toString(), subscriptionId: plan.id, severity: 'warning', category: plan.category });
    }
    if (plan.unused) insights.push({ id: `unused-${plan.id}`, type: 'savings', title: `Revisit ${plan.name}`, description: 'You marked this demo subscription as unused. Pausing or cancelling with the merchant could reduce future costs; no cancellation has been made.', amountMinor: monthlyMinor(plan).toString(), subscriptionId: plan.id, severity: 'success', category: plan.category });
  }
  const transactions = snapshot.transactions.filter((row) => row.currency === currency && row.status === 'Completed' && row.direction === 'debit' && row.type === 'imported');
  const duplicateKeys = new Set();
  for (let i = 0; i < transactions.length; i += 1) {
    const first = transactions[i];
    const second = transactions.slice(i + 1).find((row) => row.merchant === first.merchant && row.amountMinor === first.amountMinor && Math.abs(daysUntil(row.date) - daysUntil(first.date)) <= 1);
    if (second && !duplicateKeys.has(first.merchant)) {
      duplicateKeys.add(first.merchant);
      insights.push({ id: `duplicate-${[first.id, second.id].sort().join('-')}`, type: 'duplicate', title: `Possible duplicate: ${first.merchant}`, description: `Two separate simulated imports of ${formatMoney(first.amountMinor, currency)} appear on matching or adjacent dates. Date-only evidence is uncertain; compare the records before taking action.`, amountMinor: first.amountMinor, subscriptionId: first.subscriptionId, severity: 'warning', category: first.category });
    }
  }
  const categories = new Map();
  for (const plan of active) categories.set(plan.category, [...(categories.get(plan.category) || []), plan]);
  for (const [category, plans] of categories) {
    if (plans.length > 1) insights.push({ id: `overlap-${category}`, type: 'overlap', title: `${category} subscriptions overlap`, description: `${plans.map((plan) => plan.name).join(', ')} share a category. This is a review prompt, not proof that their features duplicate one another or that you do not use them.`, severity: 'info', category });
  }
  if (active.length) insights.push({ id: `recurring-${currency}`, type: 'recurring', title: `${active.length} recurring plans in your demo workspace`, description: 'Calendar-aware renewal dates and per-currency amounts power this preview. All observations are derived from local sample records; no bank, AI or PayPal account is connected.', severity: 'info', category: 'Overview' });
  return insights.filter((insight) => !snapshot.dismissedInsights?.includes(insight.id));
}
