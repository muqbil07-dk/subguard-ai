// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_STORAGE_KEY, demoService } from './demoService';
import { authService } from './authService';
import { createAssistantService } from './assistantService';

const input = { name: 'Test plan', category: 'Productivity', amountMinor: '99900', currency: 'INR', frequency: 'Quarterly', nextRenewal: '2026-12-01', status: 'Active', unused: false, reminder: true };
const row = { merchant: 'Imported sample', date: '2026-11-08', amountMinor: '12000', currency: 'INR', category: 'Other' };

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('persistent, isolated local demo adapter', () => {
  it('creates, updates and deletes subscriptions without erasing historical transactions', async () => {
    const original = await demoService.getSnapshot();
    const created = await demoService.addSubscription(input);
    const plan = created.subscriptions.find((item) => item.name === input.name);
    expect(plan.id).toBeTruthy();
    expect((await demoService.getSnapshot()).subscriptions).toHaveLength(original.subscriptions.length + 1);
    const updated = await demoService.updateSubscription(plan.id, { name: 'Renamed plan', status: 'Paused' });
    expect(updated.subscriptions.find((item) => item.id === plan.id).status).toBe('Paused');
    const removed = await demoService.deleteSubscription(plan.id);
    expect(removed.subscriptions).toHaveLength(original.subscriptions.length);
    expect(removed.transactions).toEqual(original.transactions);
  });

  it('rejects invalid amounts, currencies, dates and missing records', async () => {
    await expect(demoService.addSubscription({ ...input, amountMinor: '-1' })).rejects.toThrow();
    await expect(demoService.addSubscription({ ...input, currency: 'NOPE' })).rejects.toThrow();
    await expect(demoService.addSubscription({ ...input, nextRenewal: '2026-02-31' })).rejects.toThrow();
    await expect(demoService.updateSubscription('absent', input)).rejects.toThrow();
    expect((await demoService.getSnapshot()).subscriptions).toHaveLength(12);
  });

  it('rejects amounts that could crash the demo chart before saving any change', async () => {
    const before = await demoService.getSnapshot();
    await expect(demoService.addSubscription({ ...input, amountMinor: '9007199254740992' })).rejects.toThrow('demo amount');
    await expect(demoService.importTransactions([{ ...row, amountMinor: '9007199254740992' }], 'oversize')).rejects.toThrow('demo amount');
    expect(await demoService.getSnapshot()).toEqual(before);
  });

  it('refuses stored aggregates that exceed safe chart bounds even when each amount is valid', async () => {
    const snapshot = await demoService.getSnapshot();
    const example = snapshot.subscriptions[0];
    snapshot.subscriptions = Array.from({ length: 1800 }, (_, index) => ({ ...example, id: `large-${index}`, amountMinor: '100000000000', frequency: 'Weekly' }));
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(snapshot));
    await expect(demoService.getSnapshot()).rejects.toThrow('Reset demo');
    expect((await demoService.resetDemo()).subscriptions).toHaveLength(12);
  });

  it('validates an entire import before saving and deduplicates exact batch replays', async () => {
    const before = await demoService.getSnapshot();
    await expect(demoService.importTransactions([row, { ...row, date: 'invalid' }], 'batch-1')).rejects.toThrow();
    expect((await demoService.getSnapshot()).transactions).toHaveLength(before.transactions.length);
    const once = await demoService.importTransactions([row], 'batch-1');
    const twice = await demoService.importTransactions([row], 'batch-1');
    expect(twice.transactions).toHaveLength(once.transactions.length);
    await expect(demoService.importTransactions([{ ...row, amountMinor: '13000' }], 'batch-1')).rejects.toThrow('different CSV');
    const differentBatch = await demoService.importTransactions([row], 'batch-2');
    expect(differentBatch.transactions).toHaveLength(once.transactions.length + 1);
    expect(differentBatch.transactions[0].simulated).toBe(true);
  });

  it('reports corrupt storage without destroying it and permits an explicit reset', async () => {
    localStorage.setItem(DEMO_STORAGE_KEY, '{broken');
    await expect(demoService.getSnapshot()).rejects.toThrow('Reset demo');
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBe('{broken');
    expect((await demoService.resetDemo()).subscriptions).toHaveLength(12);
  });

  it.each([
    (snapshot) => { snapshot.profile.name = 42; },
    (snapshot) => { snapshot.preferences.renewalReminders = 'yes'; },
    (snapshot) => { snapshot.transactions[0].merchant = null; },
    (snapshot) => { snapshot.transactions[0].direction = 'unknown'; },
    (snapshot) => { snapshot.subscriptions[0].id = snapshot.subscriptions[1].id; },
    (snapshot) => { snapshot.importBatches = [{ key: 'bad', signature: 3, rowCount: 1 }]; },
  ])('rejects a parseable but invalid stored snapshot and permits reset', async (corrupt) => {
    const snapshot = await demoService.getSnapshot();
    corrupt(snapshot);
    const raw = JSON.stringify(snapshot);
    localStorage.setItem(DEMO_STORAGE_KEY, raw);
    await expect(demoService.getSnapshot()).rejects.toThrow('Reset demo');
    expect(localStorage.getItem(DEMO_STORAGE_KEY)).toBe(raw);
    expect((await demoService.resetDemo()).profile.name).toBe('Alex Morgan');
  });

  it('rejects storage failure rather than pretending a change was saved', async () => {
    await demoService.getSnapshot();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    await expect(demoService.addSubscription(input)).rejects.toThrow('could not save');
  });

  it('stores only validated local settings and restores dismissed insights', async () => {
    await demoService.updateSettings({ profile: { name: 'Sam', email: 'sam@example.com' }, preferences: { currency: 'JPY', weeklyDigest: true } });
    const snapshot = await demoService.getSnapshot();
    expect(snapshot.preferences.currency).toBe('JPY');
    expect(snapshot.profile.name).toBe('Sam');
    await expect(demoService.updateSettings({ profile: { email: 'invalid' } })).rejects.toThrow();
    await demoService.dismissInsight('price-netflix');
    expect((await demoService.restoreInsights()).dismissedInsights).toEqual([]);
  });
});

describe('honest unavailable integration boundaries', () => {
  it('does not create sessions or persist passwords', async () => {
    await expect(authService.login({ email: 'test@example.com', password: 'never-save-me' })).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' });
    expect(localStorage.length).toBe(0);
  });

  it('does not manufacture an AI answer', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false, status: 503,
      json: async () => ({ error: { code: 'AI_DISABLED', message: 'AI assistance is disabled.' } }),
    });
    const assistant = createAssistantService({ fetcher, baseUrl: 'http://localhost:3000/api' });
    await expect(assistant.sendMessage({ message: 'What do I spend?' })).rejects.toMatchObject({ code: 'AI_DISABLED', status: 503 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ message: 'What do I spend?' });
    expect(localStorage.length).toBe(0);
  });
});
