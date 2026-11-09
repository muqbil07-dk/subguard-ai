import { parseAmount, supportedCurrencies } from './finance.js';

const allowedHeaders = ['merchant', 'amount', 'currency', 'date', 'category', 'status', 'direction'];

function readCells(text) {
  const rows = [];
  let row = [], cell = '', quoted = false, closedQuote = false;
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let index = 0; index <= source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else if (char === undefined) throw new Error('CSV contains an unclosed quoted field.');
      else cell += char;
    } else if (char === '"') {
      if (cell.length || closedQuote) throw new Error('Unexpected quote in CSV. Quote the entire field.');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === undefined) {
      row.push(cell.trim()); cell = ''; closedQuote = false;
      if (char !== ',') { if (row.some(value => value !== '')) rows.push(row); row = []; }
    } else {
      if (closedQuote && char.trim()) throw new Error('Unexpected text after a quoted CSV field.');
      cell += char;
    }
  }
  return rows;
}

export function parseTransactionCsv(text) {
  const rows = readCells(text);
  if (rows.length < 2) throw new Error('Add a header and at least one transaction row.');
  if (rows.length > 501) throw new Error('Import up to 500 transactions at a time.');
  const headers = rows.shift().map(header => header.toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique.');
  if (headers.some(header => !allowedHeaders.includes(header))) throw new Error(`Supported headers: ${allowedHeaders.join(', ')}.`);
  if (['merchant', 'amount', 'currency', 'date'].some(header => !headers.includes(header))) throw new Error('Required CSV headers: merchant, amount, currency, date.');
  return rows.map((cells, index) => {
    try {
      if (cells.length !== headers.length) throw new Error('Column count does not match the header.');
      const row = Object.fromEntries(headers.map((header, position) => [header, cells[position]]));
      if (!row.merchant || row.merchant.length > 80) throw new Error('Merchant must be 1–80 characters.');
      if (!supportedCurrencies.includes(row.currency)) throw new Error('Use a supported uppercase currency code.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date) throw new Error('Use a real date in YYYY-MM-DD format.');
      if (row.category?.length > 40) throw new Error('Category must be 40 characters or fewer.');
      const amountMinor = parseAmount(row.amount, row.currency);
      const status = row.status || 'Completed';
      const direction = row.direction || 'debit';
      if (!['Completed', 'Pending', 'Reversed'].includes(status)) throw new Error('Status must be Completed, Pending, or Reversed.');
      if (!['debit', 'credit'].includes(direction)) throw new Error('Direction must be debit or credit.');
      return { merchant: row.merchant, amountMinor, currency: row.currency, date: row.date, category: row.category || 'Other', status, direction };
    } catch (error) { throw new Error(`Row ${index + 2}: ${error.message}`, { cause: error }); }
  });
}

export const sampleCsv = 'merchant,amount,currency,date,category,status,direction\nSample service,299.00,INR,2026-11-08,Productivity,Completed,debit\n"Another, Inc.",149.00,INR,2026-11-07,Entertainment,Completed,debit\n';

export function downloadSampleCsv() {
  const url = URL.createObjectURL(new Blob([sampleCsv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'subguard-demo-transactions.csv'; link.click();
  URL.revokeObjectURL(url);
}
