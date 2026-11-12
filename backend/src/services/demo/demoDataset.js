import { addDays, calendar } from '../finance.js';
import { analyzeTransactions } from '../intelligence/index.js';
import { recurringSummary } from '../intelligence/spending.js';
import { validDate } from '../intelligence/utils.js';
import { ApiError } from '../../utils/errors.js';

export const DEMO_OWNER_ID = 'd0000000-0000-4000-8000-000000000001';
export const DEMO_AS_OF = '2026-11-11';

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const DEMO_DATASET = freeze({
  id: 'subguard-synthetic-financial-demo-v1',
  label: 'Synthetic Demo Data',
  asOf: DEMO_AS_OF,
  description: 'Fixed fictional subscription records and transaction history. No accounts, banks or payment providers are connected. Confirmed means tracked in this fictional example; it is not provider verification. Local browser edits do not change this backend example.',
});

const plan = (id, name, category, amountMinor, currency, frequency, nextRenewal, unused = false, status = 'Active') => ({
  id, name, category, amountMinor, currency, frequency, nextRenewal, unused,
  status, reminder: true, color: '#9279ff', initials: name.slice(0, 2).toUpperCase(),
});

const subscriptions = [
  plan('d1000000-0000-4000-8000-000000000001', 'Aurora Stream', 'Entertainment', '79900', 'INR', 'Monthly', '2026-11-15'),
  plan('d1000000-0000-4000-8000-000000000002', 'ClearNote Workspace', 'Productivity', '49900', 'INR', 'Monthly', '2026-11-18', true),
  plan('d1000000-0000-4000-8000-000000000003', 'FrameForge Design', 'Design', '99900', 'INR', 'Monthly', '2026-11-24'),
  plan('d1000000-0000-4000-8000-000000000004', 'CloudNest Annual', 'Cloud storage', '239900', 'INR', 'Yearly', '2026-11-20'),
  plan('d1000000-0000-4000-8000-000000000005', 'BuildBench Tools', 'Productivity', '90000', 'INR', 'Quarterly', '2026-12-05'),
  plan('d1000000-0000-4000-8000-000000000006', 'Orbit Research', 'Education', '2000', 'USD', 'Monthly', '2026-11-16'),
  plan('d1000000-0000-4000-8000-000000000007', 'QuietPath Wellness', 'Health & fitness', '19900', 'INR', 'Monthly', '2026-11-22', false, 'Paused'),
];

const charge = (subscription, date, amountMinor = subscription.amountMinor, suffix = '') => ({
  id: `synthetic-${subscription.id}-${date}${suffix}`,
  merchant: subscription.name, category: subscription.category, amountMinor,
  currency: subscription.currency, date, source: 'User CSV import',
  status: 'Completed', direction: 'debit', synthetic: true,
});

const transactions = [];
for (const subscription of subscriptions.filter(p => p.frequency === 'Monthly' && p.status === 'Active')) {
  const day = subscription.nextRenewal.slice(-2);
  for (const month of ['07', '08', '09', '10']) {
    const amountMinor = subscription.name === 'Aurora Stream' && month !== '10' ? '64900' : subscription.amountMinor;
    transactions.push(charge(subscription, `2026-${month}-${day}`, amountMinor));
  }
}
transactions.push(charge(subscriptions[3], '2025-11-20'));
transactions.push(charge(subscriptions[4], '2026-06-05'), charge(subscriptions[4], '2026-09-05'));
transactions.push(charge(subscriptions[2], '2026-10-24', undefined, '-possible-duplicate'));

// Derive advisory findings with the existing deterministic Phase 5 engine.
// Distinct fictional receipts are retained; no duplicate or billing error is confirmed.
const analysis = analyzeTransactions(transactions, { userId: DEMO_OWNER_ID, asOf: DEMO_AS_OF });
const findings = analysis.findings.map((finding, index) => ({
  id: `synthetic-finding-${index + 1}`,
  dedupe_key: finding.dedupe_key,
  type: finding.type,
  currency: finding.currency,
  active: true,
  review_status: 'unreviewed',
  payload: finding,
}));

const tables = freeze({
  subscriptions,
  transactions,
  transaction_anomalies: findings,
  // Every plan above is already tracked in the fictional example. No suggestion
  // is silently promoted to confirmed tracking or included in confirmed totals.
  recurring_detection_suggestions: [],
  ai_recommendation_dismissals: [],
});
const readableTables = new Set(Object.keys(tables));

/** Read-only adapter for the existing financial context builder; no database client. */
export function createDemoRepository() {
  return Object.freeze({
    async all(table, filters = {}) {
      if (!readableTables.has(table)) throw new ApiError(400, 'VALIDATION_ERROR', 'Unsupported synthetic dataset resource.');
      if (!filters || typeof filters !== 'object' || Array.isArray(filters) || Object.keys(filters).some(key => !['from', 'to'].includes(key))) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Unsupported synthetic dataset filter.');
      }
      const { from, to } = filters;
      if ((from !== undefined && !validDate(from)) || (to !== undefined && !validDate(to)) || (from && to && from > to)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid synthetic dataset date range.');
      }
      const rows = table === 'transactions'
        ? tables[table].filter(row => (!from || row.date >= from) && (!to || row.date <= to))
        : tables[table];
      return structuredClone(rows);
    },
  });
}

/** Confirmed-plan estimates only; never combine currencies or model-generated totals. */
export function demoFinancialSummary() {
  return recurringSummary(tables.subscriptions).map(row => ({
    currency: row.currency,
    activeCount: row.subscriptionCount,
    monthlyMinor: row.monthlyMinor,
    yearlyMinor: row.yearlyMinor,
    upcomingMinor: calendar(tables.subscriptions, {
      currency: row.currency, from: DEMO_AS_OF, to: addDays(DEMO_AS_OF, 30),
    }).reduce((sum, payment) => sum + BigInt(payment.amountMinor), 0n).toString(),
  }));
}

/** Illustrative removal scenarios, not a cancellation, recommendation to cancel or guaranteed savings. */
export function demoSavingsScenarios() {
  const summaries = new Map(recurringSummary(tables.subscriptions).map(row => [row.currency, row]));
  return tables.subscriptions.filter(row => row.status === 'Active').map(subscription => {
    const baseline = summaries.get(subscription.currency);
    const remaining = recurringSummary(tables.subscriptions.filter(row => row.id !== subscription.id))
      .find(row => row.currency === subscription.currency);
    const before = { monthlyMinor: baseline.monthlyMinor, yearlyMinor: baseline.yearlyMinor };
    const after = { monthlyMinor: remaining?.monthlyMinor || '0', yearlyMinor: remaining?.yearlyMinor || '0' };
    return {
      subscriptionId: subscription.id,
      merchant: subscription.name,
      currency: subscription.currency,
      unused: subscription.unused === true,
      state: 'potential',
      requiresUserConfirmation: true,
      before,
      after,
      potentialReduction: {
        monthlyMinor: (BigInt(before.monthlyMinor) - BigInt(after.monthlyMinor)).toString(),
        yearlyMinor: (BigInt(before.yearlyMinor) - BigInt(after.yearlyMinor)).toString(),
      },
      assumptions: [
        'Illustrative change only if you choose to stop this fictional plan through its merchant; no cancellation, blocked payment or refund has occurred.',
        'Assumes its current price and cadence continue, no replacement plan or cancellation fee, and all other same-currency plans remain unchanged.',
        'Potential reduction is not confirmed or guaranteed savings. An expensive plan is not assumed unwanted or unused.',
      ],
    };
  });
}
