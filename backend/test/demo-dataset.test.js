import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_AS_OF, DEMO_DATASET, DEMO_OWNER_ID, createDemoRepository, demoFinancialSummary, demoSavingsScenarios } from '../src/services/demo/demoDataset.js';
import { buildFinancialContext } from '../src/services/ai/financialContextBuilder.js';
import { summarize } from '../src/services/finance.js';
import { validDate } from '../src/services/intelligence/utils.js';

test('fixed synthetic dataset has explicit provenance and a read-only, bounded adapter', async () => {
  const repository = createDemoRepository();
  assert.deepEqual(Object.keys(repository), ['all']);
  assert.equal(Object.isFrozen(repository), true);
  assert.equal(Object.isFrozen(DEMO_DATASET), true);
  assert.equal(DEMO_AS_OF, '2026-11-11');
  assert.match(DEMO_OWNER_ID, /^[0-9a-f-]{36}$/);
  assert.equal(DEMO_DATASET.label, 'Synthetic Demo Data');
  assert.match(DEMO_DATASET.description, /fictional/);
  assert.match(DEMO_DATASET.description, /Local browser edits do not change/);
  assert.equal((await repository.all('subscriptions')).length, 7);
  assert.equal((await repository.all('transactions')).length, 20);
  assert.equal(repository.reserveAiRequest, undefined);
  assert.equal(repository.aiAppendTurn, undefined);
  assert.equal(repository.create, undefined);
});

test('demo summaries use exact existing calculations and preserve currency boundaries', () => {
  assert.deepEqual(demoFinancialSummary(), [
    { currency: 'INR', activeCount: 5, monthlyMinor: '279692', yearlyMinor: '3356300', upcomingMinor: '559600' },
    { currency: 'USD', activeCount: 1, monthlyMinor: '2000', yearlyMinor: '24000', upcomingMinor: '2000' },
  ]);
  // Annual totals follow original cadence amounts, not rounded monthly estimates.
  assert.notEqual(BigInt(demoFinancialSummary()[0].monthlyMinor) * 12n, BigInt(demoFinancialSummary()[0].yearlyMinor));
});

test('read-only repository returns independent copies and only allowed, date-scoped resources', async () => {
  const repository = createDemoRepository();
  const rows = await repository.all('subscriptions');
  rows[0].name = 'Changed by caller';
  rows.push({ name: 'Injected' });
  assert.equal((await repository.all('subscriptions'))[0].name, 'Aurora Stream');
  assert.equal((await repository.all('subscriptions')).length, 7);
  for (const table of ['auth.users', 'profiles', '__proto__', 'paypal_webhook_events']) {
    await assert.rejects(repository.all(table), error => error.code === 'VALIDATION_ERROR');
  }
  for (const filters of [null, [], { userId: 'other-user' }, { from: 'invalid' }, { from: '2026-11-12', to: '2026-11-11' }]) {
    await assert.rejects(repository.all('transactions', filters), error => error.code === 'VALIDATION_ERROR');
  }
  const scoped = await repository.all('transactions', { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(scoped.length, 5);
  assert.ok(scoped.every(row => row.date >= '2026-10-01' && row.date <= '2026-10-31'));
  assert.deepEqual(await repository.all('ai_recommendation_dismissals'), []);
});

test('synthetic transactions are internally dated and price/duplicate findings derive from actual fixture evidence', async () => {
  const repository = createDemoRepository();
  const rows = await repository.all('transactions');
  assert.ok(rows.every(row => row.synthetic === true && validDate(row.date) && row.date <= DEMO_AS_OF));
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  const findings = await repository.all('transaction_anomalies');
  const price = findings.find(row => row.type === 'price_increase');
  assert.ok(price);
  assert.equal(price.payload.merchant, 'Aurora Stream');
  assert.equal(price.payload.previousAmountMinor, '64900');
  assert.equal(price.payload.newAmountMinor, '79900');
  assert.equal(price.payload.differenceMinor, '15000');
  assert.equal(price.payload.percentageDifference, 23.11);
  const duplicate = findings.find(row => row.type === 'possible_duplicate');
  assert.ok(duplicate);
  assert.equal(duplicate.payload.merchant, 'FrameForge Design');
  for (const finding of findings) {
    assert.equal(finding.active, true);
    assert.equal(finding.review_status, 'unreviewed');
    assert.ok(finding.payload.evidence.every(id => rows.some(row => row.id === id)));
  }
});

test('existing financial context creates grounded savings and upcoming predictions without persistence', async () => {
  const context = await buildFinancialContext(createDemoRepository(), {
    asOf: DEMO_AS_OF, question: 'What renewals are coming up and which unused subscriptions could I review to save money?',
  });
  const unused = context.recommendations.find(row => row.category === 'marked_unused');
  assert.ok(unused);
  assert.equal(unused.evidence[0].merchant, 'ClearNote Workspace');
  assert.deepEqual(unused.estimatedSavings, {
    monthlyMinor: '49900', yearlyMinor: '598800', currency: 'INR',
    assumptions: 'Potential reduction only if you choose to cancel this confirmed plan with its merchant; fees and timing can change the outcome. Not confirmed or guaranteed savings.',
  });
  assert.ok(context.recommendations.filter(row => row.category === 'cost_review').every(row => row.estimatedSavings === null));
  const predictions = context.facts.filter(fact => fact.kind === 'prediction');
  assert.equal(predictions.length, 6);
  assert.ok(predictions.every(row => row.predicted === true && row.date > DEMO_AS_OF));
  assert.equal(predictions.find(row => row.merchant === 'CloudNest Annual').date, '2026-11-20');
  assert.ok(!JSON.stringify(context.model).includes('Aurora Stream'));
  assert.match(context.warnings.join(' '), /Income.*not recorded/);
});

test('historical spending retains potential duplicate receipts rather than erasing spending', async () => {
  const repository = createDemoRepository();
  const transactions = await repository.all('transactions');
  const summary = summarize(await repository.all('subscriptions'), transactions, {
    currency: 'INR', from: '2026-10-01', to: '2026-10-31',
  });
  assert.equal(summary.spentMinor, '329600');
  assert.equal(summary.transactionCount, 4);
  assert.equal(summary.savingsMinor, '49900');
});

test('per-plan removal scenarios recompute same-currency totals without pretending to cancel or guarantee savings', () => {
  const scenarios = demoSavingsScenarios();
  assert.equal(scenarios.length, 6);
  const unused = scenarios.find(row => row.merchant === 'ClearNote Workspace');
  assert.equal(unused.unused, true);
  assert.equal(unused.currency, 'INR');
  assert.deepEqual(unused.before, { monthlyMinor: '279692', yearlyMinor: '3356300' });
  assert.deepEqual(unused.after, { monthlyMinor: '229792', yearlyMinor: '2757500' });
  assert.deepEqual(unused.potentialReduction, { monthlyMinor: '49900', yearlyMinor: '598800' });
  const expensive = scenarios.find(row => row.merchant === 'FrameForge Design');
  assert.equal(expensive.unused, false);
  const annual = scenarios.find(row => row.merchant === 'CloudNest Annual');
  assert.equal(annual.potentialReduction.yearlyMinor, '239900');
  const usd = scenarios.find(row => row.currency === 'USD');
  assert.deepEqual(usd.before, { monthlyMinor: '2000', yearlyMinor: '24000' });
  assert.deepEqual(usd.after, { monthlyMinor: '0', yearlyMinor: '0' });
  assert.ok(scenarios.every(row => row.requiresUserConfirmation && row.state === 'potential'));
  assert.ok(scenarios.every(row => /no cancellation, blocked payment or refund has occurred/.test(row.assumptions[0])));
  assert.ok(scenarios.every(row => /not confirmed or guaranteed/.test(row.assumptions[2])));
  scenarios[0].after.yearlyMinor = 'forged';
  assert.notEqual(demoSavingsScenarios()[0].after.yearlyMinor, 'forged');
});
