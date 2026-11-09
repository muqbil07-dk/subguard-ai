import { describe, expect, it } from 'vitest';
import { createSeedSnapshot } from '../data/demoData';
import { addMonths, daysUntil, formatMoney, getCategorySpending, getInsights, getMonthlySpending, getNetSpend, getReportSummary, getSummary, getUpcoming, monthlyMinor, parseAmount } from './finance';

describe('exact currency and cadence calculations', () => {
  it('parses supported minor-unit scales without rounding user input', () => {
    expect(parseAmount('1299.10', 'INR')).toBe('129910');
    expect(parseAmount('120', 'JPY')).toBe('120');
    expect(() => parseAmount('1.001', 'INR')).toThrow();
    expect(() => parseAmount('1.1', 'JPY')).toThrow();
    expect(() => parseAmount('-2', 'INR')).toThrow();
    expect(() => parseAmount('1e6', 'INR')).toThrow();
    expect(() => parseAmount('9223372036854775808', 'JPY')).toThrow();
  });

  it('formats beyond JS safe integer without losing minor units', () => {
    expect(formatMoney('9007199254740993', 'USD')).toContain('90,071,992,547,409.93');
    expect(formatMoney('1299', 'INR')).toBe('₹12.99');
    expect(formatMoney('1299', 'JPY')).toContain('1,299');
    expect(formatMoney('-1', 'INR')).toBe('-₹0.01');
  });

  it('normalizes weekly, quarterly and yearly costs using half-up minor-unit rounding', () => {
    expect(monthlyMinor({ amountMinor: '100', frequency: 'Weekly' })).toBe(433n);
    expect(monthlyMinor({ amountMinor: '100', frequency: 'Quarterly' })).toBe(33n);
    expect(monthlyMinor({ amountMinor: '150', frequency: 'Yearly' })).toBe(13n);
    expect(monthlyMinor({ amountMinor: '0', frequency: 'Monthly' })).toBe(0n);
  });

  it('clips calendar month ends and calculates dates against the explicit demo clock', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(daysUntil('2026-11-09')).toBe(0);
    expect(daysUntil('2026-11-10')).toBe(1);
    expect(() => daysUntil('2026-02-31')).toThrow();
  });
});

describe('local demo reporting', () => {
  it('keeps totals currency scoped and excludes paused and cancelled plans', () => {
    const snapshot = createSeedSnapshot();
    const summary = getSummary(snapshot, 'INR');
    expect(summary.activeCount).toBe(10);
    expect(summary.monthlyMinor).toBe('627992');
    expect(summary.savingsMinor).toBe('204500');
    expect(summary.unusualCount).toBe(2);
    expect(getSummary(snapshot, 'USD').monthlyMinor).toBe('0');
    expect(getUpcoming(snapshot.subscriptions, 'INR').every((plan) => plan.status === 'Active')).toBe(true);
    expect(getCategorySpending(snapshot.subscriptions, 'USD')).toEqual([]);
  });

  it('keeps pending and PayPal merchant receipts out of spending summaries', () => {
    const rows = [
      { amountMinor: '2000', currency: 'INR', date: '2026-11-01', status: 'Completed', direction: 'debit', type: 'imported' },
      { amountMinor: '500', currency: 'INR', date: '2026-11-02', status: 'Completed', direction: 'credit', type: 'imported' },
      { amountMinor: '9999', currency: 'INR', date: '2026-11-03', status: 'Pending', direction: 'debit', type: 'imported' },
      { amountMinor: '100000', currency: 'INR', date: '2026-11-03', status: 'Completed', direction: 'debit', type: 'paypal_merchant' },
    ];
    expect(getMonthlySpending(rows, 'INR', 1)).toEqual([{ month: 'Nov', key: '2026-11', amount: 15 }]);
  });

  it('derives inspectable price/duplicate insights and honors dismissals', () => {
    const snapshot = createSeedSnapshot();
    const insights = getInsights(snapshot, 'INR');
    expect(insights.find((item) => item.id === 'price-netflix').amountMinor).toBe('15000');
    expect(insights.filter((item) => item.type === 'duplicate')).toHaveLength(1);
    snapshot.dismissedInsights.push('price-netflix');
    expect(getInsights(snapshot, 'INR').some((item) => item.id === 'price-netflix')).toBe(false);
  });

  it('uses exact completed net spend and clearly bounded monthly/yearly report periods', () => {
    const snapshot = createSeedSnapshot();
    const report = getReportSummary(snapshot, 'INR', 'monthly');
    expect(report.spentMinor).toBe(getNetSpend(snapshot.transactions, 'INR', { from: '2026-11-01', to: '2026-11-09' }));
    expect(report.annualizedMinor).toBe((BigInt(report.monthlyMinor) * 12n).toString());
    expect(getReportSummary(snapshot, 'INR', 'yearly').from).toBe('2026-01-01');
    expect(getNetSpend([{ currency: 'INR', type: 'imported', status: 'Completed', direction: 'credit', amountMinor: '120', date: '2026-11-01' }], 'INR')).toBe('-120');
  });
});
