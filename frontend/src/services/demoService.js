import { createSeedSnapshot } from '../data/demoData';
import { currencyDigits, monthlyMinor, supportedCurrencies, validDate } from '../utils/finance';

export const DEMO_STORAGE_KEY = 'subguard-demo-v2';
const frequencies = ['Weekly', 'Monthly', 'Quarterly', 'Yearly'];
const statuses = ['Active', 'Paused', 'Cancelled'];
const transactionStatuses = ['Completed', 'Pending', 'Reversed'];
// The frontend demo is a bounded preview, not a full BIGINT financial ledger.
// Keep all accepted values and their chart aggregates safely representable.
export const MAX_DEMO_AMOUNT_MINOR = 100000000000n;
const maxChartMinor = BigInt(Number.MAX_SAFE_INTEGER);
const copy = (value) => structuredClone(value);
let fallbackId = 0;
const newId = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${++fallbackId}`;

function storage() {
  try {
    if (!globalThis.localStorage) throw new Error('Unavailable');
    return globalThis.localStorage;
  } catch {
    throw new Error('Local demo storage is unavailable. Allow browser storage and reload. No data was saved.');
  }
}

function assertAmount(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || BigInt(value) > MAX_DEMO_AMOUNT_MINOR) throw new Error('Enter a valid demo amount no greater than 100,000,000,000 minor units.');
  return BigInt(value).toString();
}

function text(value, label, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} must contain 1–${max} characters.`);
  return value.trim();
}

function validateSubscription(input) {
  const id = text(input.id, 'Subscription ID', 200);
  const name = text(input.name, 'Subscription name');
  const category = text(input.category || 'Other', 'Category', 40);
  const amountMinor = assertAmount(input.amountMinor);
  if (BigInt(amountMinor) === 0n) throw new Error('Subscription amount must be greater than zero.');
  currencyDigits(input.currency);
  if (!frequencies.includes(input.frequency)) throw new Error('Select a valid billing frequency.');
  if (!validDate(input.nextRenewal)) throw new Error('Select a valid renewal date.');
  const status = input.status || 'Active';
  if (!statuses.includes(status)) throw new Error('Select a valid subscription status.');
  if (input.unused !== undefined && typeof input.unused !== 'boolean') throw new Error('Unused preference must be true or false.');
  if (input.reminder !== undefined && typeof input.reminder !== 'boolean') throw new Error('Reminder preference must be true or false.');
  const color = /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#9279ff';
  const previousAmountMinor = input.previousAmountMinor === undefined ? undefined : assertAmount(input.previousAmountMinor);
  return {
    id, name, category, amountMinor, currency: input.currency,
    frequency: input.frequency, nextRenewal: input.nextRenewal, status, color,
    initials: input.initials ? text(input.initials, 'Merchant initials', 3) : name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(),
    unused: input.unused ?? false, reminder: input.reminder ?? true, previousAmountMinor,
  };
}

function assertAggregateBounds(snapshot) {
  const subscriptionTotal = snapshot.subscriptions.reduce((sum, plan) => sum + monthlyMinor(plan), 0n);
  const transactionTotal = snapshot.transactions.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
  if (subscriptionTotal * 12n > maxChartMinor || transactionTotal > maxChartMinor) {
    throw new Error('This demo workspace exceeds its safe chart limit. Remove some local records or reset the demo before adding more.');
  }
}

function validateStoredSnapshot(value) {
  if (!value || value.version !== 2 || !Array.isArray(value.subscriptions) || !Array.isArray(value.transactions) || !Array.isArray(value.dismissedInsights) || !Array.isArray(value.importBatches)) throw new Error('Invalid schema');
  text(value.profile?.name, 'Display name');
  const email = text(value.profile?.email, 'Email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid saved email');
  if (!supportedCurrencies.includes(value.preferences?.currency)) throw new Error('Invalid saved currency');
  for (const key of ['renewalReminders', 'unusualCharges', 'weeklyDigest']) {
    if (typeof value.preferences[key] !== 'boolean') throw new Error('Invalid saved preference');
  }
  const subscriptionIds = new Set();
  value.subscriptions.forEach((plan) => {
    validateSubscription(plan);
    if (subscriptionIds.has(plan.id) || typeof plan.unused !== 'boolean' || typeof plan.reminder !== 'boolean' || !statuses.includes(plan.status) || typeof plan.initials !== 'string' || !/^#[0-9a-f]{6}$/i.test(plan.color || '')) throw new Error('Invalid saved subscription');
    text(plan.initials, 'Merchant initials', 3);
    subscriptionIds.add(plan.id);
  });
  const transactionIds = new Set();
  value.transactions.forEach((row) => {
    const id = text(row.id, 'Transaction ID', 240);
    text(row.merchant, 'Merchant');
    text(row.category, 'Category', 40);
    text(row.source, 'Source', 80);
    text(row.initials, 'Merchant initials', 3);
    assertAmount(row.amountMinor);
    currencyDigits(row.currency);
    if (transactionIds.has(id) || !validDate(row.date) || row.type !== 'imported' || !transactionStatuses.includes(row.status) || !['debit', 'credit'].includes(row.direction) || row.simulated !== true || !/^#[0-9a-f]{6}$/i.test(row.color || '')) throw new Error('Invalid saved transaction');
    if (row.subscriptionId !== undefined) text(row.subscriptionId, 'Subscription reference', 200);
    transactionIds.add(id);
  });
  value.dismissedInsights.forEach((id) => text(id, 'Insight ID', 240));
  const batchKeys = new Set();
  value.importBatches.forEach((batch) => {
    text(batch.key, 'Batch key', 200);
    if (batchKeys.has(batch.key) || typeof batch.signature !== 'string' || !batch.signature || !Number.isInteger(batch.rowCount) || batch.rowCount < 1 || batch.rowCount > 500) throw new Error('Invalid saved import batch');
    batchKeys.add(batch.key);
  });
  assertAggregateBounds(value);
}

function read() {
  let raw;
  try { raw = storage().getItem(DEMO_STORAGE_KEY); }
  catch (error) { throw new Error(`Cannot read the local demo. ${error.message}`, { cause: error }); }
  if (!raw) {
    const snapshot = createSeedSnapshot();
    save(snapshot);
    return snapshot;
  }
  try {
    const value = JSON.parse(raw);
    validateStoredSnapshot(value);
    return value;
  } catch {
    throw new Error('Saved demo data could not be read. Use Reset demo to restore sample records; this replaces only local demo data.');
  }
}

function save(snapshot) {
  validateStoredSnapshot(snapshot);
  try { storage().setItem(DEMO_STORAGE_KEY, JSON.stringify(snapshot)); }
  catch {
    throw new Error('The browser could not save this demo change. Check storage permissions or free space, then try again.');
  }
  return copy(snapshot);
}

function normalizeImport(row) {
  const merchant = text(row.merchant, 'Merchant');
  const amountMinor = assertAmount(row.amountMinor);
  currencyDigits(row.currency);
  if (!validDate(row.date)) throw new Error('Each CSV row needs a valid YYYY-MM-DD date.');
  const status = row.status || 'Completed';
  if (!transactionStatuses.includes(status)) throw new Error('Transaction status must be Completed, Pending or Reversed.');
  const direction = row.direction || 'debit';
  if (!['debit', 'credit'].includes(direction)) throw new Error('Transaction direction must be debit or credit.');
  return {
    merchant, amountMinor, currency: row.currency, date: row.date,
    category: text(row.category || 'Other', 'Category', 40), status, direction,
    source: 'Local demo CSV import', type: 'imported', simulated: true,
    initials: merchant.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(), color: '#9279ff',
  };
}

/** Local-only adapter. Its async interface can be replaced by an authenticated API adapter. */
export const demoService = {
  async getSnapshot() { return copy(read()); },

  async addSubscription(input) {
    const snapshot = read();
    const subscription = validateSubscription({ ...input, id: newId() });
    snapshot.subscriptions.push(subscription);
    return save(snapshot);
  },

  async updateSubscription(id, input) {
    const snapshot = read();
    const index = snapshot.subscriptions.findIndex((plan) => plan.id === id);
    if (index < 0) throw new Error('That demo subscription no longer exists. Reload and try again.');
    snapshot.subscriptions[index] = validateSubscription({ ...snapshot.subscriptions[index], ...input, id });
    return save(snapshot);
  },

  async deleteSubscription(id) {
    const snapshot = read();
    if (!snapshot.subscriptions.some((plan) => plan.id === id)) throw new Error('That demo subscription no longer exists.');
    // History is retained: removing a tracked plan does not erase prior transactions or cancel a merchant agreement.
    snapshot.subscriptions = snapshot.subscriptions.filter((plan) => plan.id !== id);
    return save(snapshot);
  },

  async importTransactions(rows, batchKey) {
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) throw new Error('Import between 1 and 500 rows per demo CSV.');
    const key = text(batchKey, 'Import batch key', 200);
    // Validate every row before a single write; same key and same rows replay safely.
    const normalized = rows.map(normalizeImport);
    const signature = JSON.stringify(normalized);
    const snapshot = read();
    const existing = snapshot.importBatches.find((batch) => batch.key === key);
    if (existing) {
      if (existing.signature !== signature) throw new Error('This batch key was already used for a different CSV. Choose a new import batch.');
      return copy(snapshot);
    }
    const batchId = newId();
    snapshot.transactions.push(...normalized.map((row, index) => ({ ...row, id: `${batchId}-${index + 1}`, importBatchId: batchId })));
    snapshot.transactions.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
    snapshot.importBatches.push({ key, signature, rowCount: rows.length });
    return save(snapshot);
  },

  async updateSettings({ profile, preferences }) {
    const snapshot = read();
    if (profile) {
      const name = text(profile.name ?? snapshot.profile.name, 'Display name');
      const email = text(profile.email ?? snapshot.profile.email, 'Email', 254);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
      snapshot.profile = { name, email };
    }
    if (preferences) {
      const currency = preferences.currency ?? snapshot.preferences.currency;
      currencyDigits(currency);
      const next = { ...snapshot.preferences, currency };
      for (const field of ['renewalReminders', 'unusualCharges', 'weeklyDigest']) {
        if (preferences[field] !== undefined) {
          if (typeof preferences[field] !== 'boolean') throw new Error('Notification preferences must be true or false.');
          next[field] = preferences[field];
        }
      }
      snapshot.preferences = next;
    }
    return save(snapshot);
  },

  async dismissInsight(id) {
    const snapshot = read();
    if (typeof id !== 'string' || !id || id.length > 240) throw new Error('Select a valid insight.');
    if (!snapshot.dismissedInsights.includes(id)) snapshot.dismissedInsights.push(id);
    return save(snapshot);
  },

  async restoreInsights() {
    const snapshot = read();
    snapshot.dismissedInsights = [];
    return save(snapshot);
  },

  async resetDemo() { return save(createSeedSnapshot()); },
};
