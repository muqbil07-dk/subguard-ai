import { describe, expect, it } from 'vitest';
import { parseTransactionCsv } from './csv.js';

describe('local demo CSV import', () => {
  it('preserves quoted merchants, exact amounts, refunds and date precision', () => {
    expect(parseTransactionCsv('merchant,amount,currency,date,direction\r\n"Tools, Inc.",1299.01,INR,2026-11-09,credit\r\n')).toEqual([{ merchant: 'Tools, Inc.', amountMinor: '129901', currency: 'INR', date: '2026-11-09', direction: 'credit', category: 'Other', status: 'Completed' }]);
  });
  it('rejects an entire file if any row has an impossible calendar date', () => {
    expect(() => parseTransactionCsv('merchant,amount,currency,date\nGood,299,INR,2026-11-09\nBad,299,INR,2026-02-31')).toThrow('Row 3: Use a real date');
  });
  it('rejects malformed quotes and unsupported ownership columns', () => {
    expect(() => parseTransactionCsv('merchant,amount,currency,date\n"bad,299,INR,2026-11-09')).toThrow('unclosed quoted field');
    expect(() => parseTransactionCsv('merchant,amount,currency,date,user_id\nTool,299,INR,2026-11-09,other')).toThrow('Supported headers');
  });
  it('keeps legitimate identical purchases as separate rows', () => {
    expect(parseTransactionCsv('merchant,amount,currency,date\nTool,299,INR,2026-11-09\nTool,299,INR,2026-11-09')).toHaveLength(2);
  });
  it('rejects unsupported precision and unknown transaction statuses', () => {
    expect(() => parseTransactionCsv('merchant,amount,currency,date\nTool,1.001,INR,2026-11-09')).toThrow('Row 2');
    expect(() => parseTransactionCsv('merchant,amount,currency,date,status\nTool,1,INR,2026-11-09,Verified PayPal')).toThrow('Status must be');
  });
});
