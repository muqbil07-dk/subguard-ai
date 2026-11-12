import { expect, test } from '@playwright/test';

const storageKey = 'subguard-demo-v2';
const snapshot = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);

async function openWorkspace(page, path = '') {
  await page.goto(`/app${path}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('Display currency').first()).toHaveValue('INR');
}

test('landing navigation and authentication make connection limitations explicit', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your Subscriptions. Under Control.' })).toBeVisible();
  await page.getByRole('link', { name: 'See how it works' }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await page.getByRole('link', { name: 'Log in', exact: true }).first().click();
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Email address').fill('demo@example.com');
  await page.getByLabel('Password', { exact: true }).fill('sample-password-123');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('not connected');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('sample-password-123');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email address').fill('demo@example.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('alert')).toContainText('no email was sent');
  await page.getByRole('link', { name: 'Explore the local demo' }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity. A lot of control.' })).toBeVisible();
  await expect(page.getByText('Simulated data · As of 9 Nov 2026 · No accounts connected')).toBeVisible();
});

test('subscription add, edit, reload and delete preserve exact local state and history', async ({ page }) => {
  await openWorkspace(page);
  const original = await snapshot(page);
  await page.getByRole('link', { name: 'Add subscription', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a subscription' });
  await dialog.getByLabel('Subscription name').fill('E2E Research Tools');
  await dialog.getByLabel('Amount per billing cycle').fill('1299.01');
  await dialog.getByLabel('Billing frequency').selectOption('Quarterly');
  await dialog.getByLabel('Category').selectOption('Productivity');
  await dialog.getByRole('button', { name: 'Add subscription', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Search subscriptions').fill('E2E Research');
  await expect(page.getByRole('heading', { name: 'E2E Research Tools', exact: true })).toBeVisible();
  expect((await snapshot(page)).subscriptions.find(plan => plan.name === 'E2E Research Tools').amountMinor).toBe('129901');
  await page.getByRole('button', { name: 'Edit E2E Research Tools', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Amount per billing cycle').fill('1499.99');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await page.getByLabel('Search subscriptions').fill('E2E Research');
  await expect(page.getByText('₹1,499.99', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Delete E2E Research Tools', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('does not cancel');
  await page.getByRole('button', { name: 'Delete subscription', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No subscriptions found' })).toBeVisible();
  const saved = await snapshot(page);
  expect(saved.subscriptions).toHaveLength(original.subscriptions.length);
  expect(saved.transactions).toEqual(original.transactions);
});

test('subscription search, status and billing filters work in both views', async ({ page }) => {
  await openWorkspace(page, '/subscriptions');
  await page.getByLabel('Filter billing frequency').selectOption('Yearly');
  await expect(page.getByRole('heading', { name: 'Amazon Prime', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Netflix', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Table view', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Amazon Prime' })).toBeVisible();
  await page.getByLabel('Filter billing frequency').selectOption('All frequencies');
  await page.getByLabel('Filter status', { exact: true }).selectOption('Paused');
  await expect(page.getByRole('row').filter({ hasText: 'Headspace' })).toBeVisible();
  await page.getByLabel('Search subscriptions').fill('not-a-real-merchant');
  await expect(page.getByRole('heading', { name: 'No subscriptions found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Netflix' })).toBeVisible();
});

test('CSV validation is atomic, valid imports persist and exact replay does not duplicate', async ({ page }) => {
  await openWorkspace(page, '/transactions');
  const initialCount = (await snapshot(page)).transactions.length;
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await page.getByLabel('Transaction CSV file').setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('merchant,amount,currency,date\nValid Row,10,INR,2026-11-08\nInvalid Row,10,INR,2026-02-31') });
  await expect(page.getByRole('alert')).toContainText('No rows were imported');
  await expect(page.getByRole('button', { name: 'Import into demo' })).toBeDisabled();
  expect((await snapshot(page)).transactions).toHaveLength(initialCount);
  const validFile = { name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from('merchant,amount,currency,date,category\n"E2E Tools, Inc.",299.01,INR,2026-11-08,Productivity') };
  await page.getByLabel('Transaction CSV file').setInputFiles(validFile);
  await expect(page.getByText('1 valid rows ready.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Import into demo' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Search transactions').fill('E2E Tools');
  await expect(page.getByRole('row').filter({ hasText: 'E2E Tools, Inc.' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'E2E Tools, Inc.' })).toContainText('Simulated');
  expect((await snapshot(page)).transactions).toHaveLength(initialCount + 1);
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await page.getByLabel('Transaction CSV file').setInputFiles(validFile);
  await expect(page.getByRole('button', { name: 'Import into demo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Import into demo' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect((await snapshot(page)).transactions).toHaveLength(initialCount + 1);
  await page.getByRole('button', { name: 'PayPal merchant payments', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'PayPal integration comes later' })).toBeVisible();
  await expect(page.getByText('No PayPal events have been created or verified', { exact: false })).toBeVisible();
});

test('payment calendar changes months, selects dates and persists local reminder indicators', async ({ page }) => {
  await openWorkspace(page, '/calendar');
  await expect(page.getByRole('heading', { name: 'November 2026', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'December 2026', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: '12 Nov, Netflix', exact: true }).click();
  await expect(page.locator('.calendar-timeline .timeline-card')).toHaveCount(1);
  const timeline = page.locator('.calendar-timeline');
  await timeline.getByRole('button', { name: 'Reminder indicator on', exact: true }).click();
  await expect(timeline.getByRole('button', { name: 'Set reminder indicator', exact: true })).toBeVisible();
  expect((await snapshot(page)).subscriptions.find(plan => plan.id === 'netflix').reminder).toBe(false);
  await page.reload();
  await page.getByRole('button', { name: '12 Nov, Netflix', exact: true }).click();
  await expect(page.locator('.calendar-timeline').getByRole('button', { name: 'Set reminder indicator', exact: true })).toBeVisible();
});

test('synthetic assistant sends only the question and supports honest unavailable/retry states', async ({ page }) => {
  // Explicit API test fixture, not evidence of a live Gemini response.
  const requests = [];
  await page.route('**/api/demo/assistant', async route => {
    requests.push(route.request().postDataJSON());
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({
      error: { code: 'AI_DISABLED', message: 'AI assistance is disabled. No AI answer was generated.' },
      data: { mode: 'synthetic_demo', synthetic: true, label: 'Synthetic Demo Data',
        dataset: { id: 'browser-test-synthetic', asOf: '2026-11-11' },
        context: { asOf: '2026-11-11', facts: [], summary: [], recommendations: [], warnings: [] },
        ai: { provider: 'gemini', generated: false } },
    }) });
  });
  await openWorkspace(page, '/assistant');
  const question = 'How much am I spending on subscriptions every month?';
  await page.getByRole('button', { name: question, exact: true }).click();
  await expect(page.getByLabel('Ask about your subscriptions')).toHaveValue(question);
  await page.getByRole('button', { name: 'Send question', exact: true }).click();
  const conversation = page.getByRole('log', { name: 'Conversation' });
  await expect(conversation).toContainText(question);
  await expect(conversation).toContainText('AI unavailable · no generated reply');
  await expect(conversation).toContainText('No AI answer was generated');
  await page.getByRole('button', { name: 'Retry question', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests).toEqual([{ message: question }, { message: question }]);
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Understand the numbers/ })).toBeVisible();
});

test('settings persist currency filtering without relabeling or converting INR records', async ({ page }) => {
  await openWorkspace(page, '/settings');
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  await page.locator('.settings-content').getByLabel('Display currency').selectOption('USD');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByLabel('Display currency').first()).toHaveValue('USD');
  const saved = await snapshot(page);
  expect(saved.preferences.currency).toBe('USD');
  expect(saved.subscriptions.every(plan => plan.currency === 'INR')).toBe(true);
  await page.goto('/app/subscriptions');
  await expect(page.getByRole('heading', { name: 'No subscriptions found' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Display currency').first()).toHaveValue('USD');
  await page.getByLabel('Display currency').first().selectOption('INR');
  await expect(page.getByRole('heading', { name: 'Netflix', exact: true })).toBeVisible();
});

test('saved-data errors remain visible and require an explicit demo reset', async ({ page }) => {
  await openWorkspace(page);
  await page.evaluate(key => localStorage.setItem(key, '{broken json'), storageKey);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'We couldn’t load the demo' })).toBeVisible();
  await expect(page.getByText('Saved demo data could not be read.', { exact: false })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe('{broken json');
  await page.getByRole('button', { name: 'Reset local demo' }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity. A lot of control.' })).toBeVisible();
});

test('mobile navigation reaches every workspace page without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  const routes = [
    ['Subscriptions', '/app/subscriptions'], ['Transactions', '/app/transactions'],
    ['Payment Calendar', '/app/calendar'], ['AI Insights', '/app/insights'],
    ['AI Assistant', '/app/assistant'], ['Reports', '/app/reports'], ['Settings', '/app/settings'],
  ];
  for (const [label, path] of routes) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('dialog', { name: 'Navigation', exact: true }).getByRole('link', { name: label, exact: label !== 'AI Insights' }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).not.toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label} should fit the mobile viewport`).toBe(true);
  }
});
