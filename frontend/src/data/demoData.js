// Synthetic, local-only fixtures. These are not bank records or PayPal events.
export const DEMO_TODAY = '2026-11-09';

const plans = [
  ['netflix', 'Netflix', 'Entertainment', '64900', 'Monthly', '2026-11-12', '#e50932', 'N', false, '49900'],
  ['spotify', 'Spotify', 'Music', '11900', 'Monthly', '2026-12-05', '#1ed760', 'S', false],
  ['adobe', 'Adobe Creative Cloud', 'Productivity', '79900', 'Monthly', '2026-12-07', '#fa4747', 'A', false],
  ['notion', 'Notion Plus', 'Productivity', '80000', 'Monthly', '2026-11-20', '#f0f0f4', 'N', true],
  ['figma', 'Figma Professional', 'Design', '124500', 'Monthly', '2026-12-06', '#b48aff', 'F', true],
  ['chatgpt', 'ChatGPT Plus', 'AI & tools', '199900', 'Monthly', '2026-12-03', '#32bfa2', 'G', false],
  ['icloud', 'iCloud+', 'Storage', '7500', 'Monthly', '2026-12-01', '#68a9ff', 'iC', false],
  ['youtube', 'YouTube Premium', 'Entertainment', '14900', 'Monthly', '2026-11-10', '#ff5454', 'Y', false],
  ['prime', 'Amazon Prime', 'Entertainment', '149900', 'Yearly', '2026-12-01', '#45b9ee', 'a', false],
  ['linear', 'Linear Standard', 'Productivity', '96000', 'Quarterly', '2026-12-03', '#9187ff', 'L', false],
  ['headspace', 'Headspace', 'Wellness', '12000', 'Weekly', '2026-11-13', '#ffad58', 'H', false],
  ['disney', 'Disney+ Hotstar', 'Entertainment', '29900', 'Monthly', '2026-11-18', '#76a4ff', 'D', false],
];

export const seedSubscriptions = plans.map(([id, name, category, amountMinor, frequency, nextRenewal, color, initials, unused, previousAmountMinor]) => ({
  id, name, category, amountMinor, currency: 'INR', frequency, nextRenewal,
  status: id === 'headspace' ? 'Paused' : id === 'disney' ? 'Cancelled' : 'Active',
  color, initials, unused, reminder: true, previousAmountMinor,
}));

function previousDate(date, frequency, anchorDay) {
  const value = new Date(`${date}T12:00:00Z`);
  if (frequency === 'Weekly') {
    value.setUTCDate(value.getUTCDate() - 7);
    return value.toISOString().slice(0, 10);
  }
  const months = frequency === 'Quarterly' ? 3 : frequency === 'Yearly' ? 12 : 1;
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() - months);
  const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(anchorDay, end));
  return value.toISOString().slice(0, 10);
}

export function createSeedSnapshot() {
  const subscriptions = structuredClone(seedSubscriptions);
  const transactions = [];
  for (const subscription of subscriptions.filter((plan) => plan.status === 'Active')) {
    let date = previousDate(subscription.nextRenewal, subscription.frequency, Number(subscription.nextRenewal.slice(-2)));
    while (date >= '2026-06-01') {
      if (date <= DEMO_TODAY) {
        transactions.push({
          id: `demo-${subscription.id}-${date}`, subscriptionId: subscription.id,
          merchant: subscription.name, amountMinor: subscription.id === 'netflix' && date < '2026-10-01' ? '49900' : subscription.amountMinor,
          currency: subscription.currency, date, category: subscription.category,
          source: 'Demo CSV import', status: 'Completed', type: 'imported', direction: 'debit',
          initials: subscription.initials, color: subscription.color, simulated: true,
        });
      }
      date = previousDate(date, subscription.frequency, Number(subscription.nextRenewal.slice(-2)));
    }
  }
  // Deliberately separate synthetic rows demonstrate a possible duplicate, not a verified charge.
  const spotify = transactions.find((transaction) => transaction.id === 'demo-spotify-2026-11-05');
  if (spotify) transactions.push({ ...spotify, id: 'demo-spotify-2026-11-05-second' });
  transactions.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return {
    version: 2, subscriptions, transactions,
    profile: { name: 'Alex Morgan', email: 'alex@example.com' },
    preferences: { currency: 'INR', renewalReminders: true, unusualCharges: true, weeklyDigest: false },
    dismissedInsights: [], importBatches: [],
  };
}
