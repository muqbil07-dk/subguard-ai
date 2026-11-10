import { useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Download, FileSpreadsheet, Landmark, Search, ShieldCheck, Upload, Wallet } from 'lucide-react';
import { Badge, Button, EmptyState, MerchantIcon, Modal, PageHeader } from '../components/ui.jsx';
import { useDemo } from '../hooks/useDemo.js';
import { formatDate, formatMoney } from '../utils/finance.js';
import { downloadSampleCsv, parseTransactionCsv } from '../utils/csv.js';
import './management.css';

export default function Transactions() {
  const { data, currency, importTransactions, toast } = useDemo();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [status, setStatus] = useState('All statuses');
  const [tab, setTab] = useState('spending');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [batchKey, setBatchKey] = useState('');
  const fileRef = useRef(null);
  const transactions = data?.transactions || [];
  const categories = [...new Set(transactions.map(transaction => transaction.category))].sort();
  const filtered = transactions.filter(transaction => transaction.currency === currency && transaction.type === 'imported' && transaction.merchant.toLowerCase().includes(query.toLowerCase()) && (category === 'All categories' || transaction.category === category) && (status === 'All statuses' || transaction.status === status)).sort((a, b) => b.date.localeCompare(a.date));
  function openUpload() { setSelectedFile(null); setRows([]); setUploadError(''); setBatchKey(''); setUploadOpen(true); }
  async function selectFile(file) {
    setRows([]); setUploadError(''); setSelectedFile(file || null);
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a CSV smaller than 1 MB.');
      if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Choose a .csv file.');
      const text = await file.text();
      const parsed = parseTransactionCsv(text);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      setBatchKey(`csv-${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`);
      setRows(parsed);
    } catch (error) { setUploadError(error.message || 'Could not read this file. Try the sample format.'); }
  }
  async function importCsv() {
    setBusy(true); setUploadError('');
    try { await importTransactions(rows, batchKey); toast(`${rows.length} demo CSV rows processed. Exact file replays are skipped.`); setUploadOpen(false); }
    catch (error) { setUploadError(error.message || 'Could not import. No rows were saved.'); }
    finally { setBusy(false); }
  }
  return <div className="page-stack">
    <PageHeader eyebrow="FOLLOW THE MONEY" title="Transactions" description="Every recurring expense. A clearer picture." actions={<Button onClick={openUpload}><Upload size={17} /> Import CSV</Button>} />
    <div className="demo-notice management-notice"><FileSpreadsheet size={18} /><div><strong>Simulated transactions, transparent by design.</strong><p>Sample statement data and local CSV imports only. No bank account or PayPal wallet is connected.</p></div></div>
    <section className="panel">
      <div className="transaction-tabs"><button className={tab === 'spending' ? 'active' : ''} type="button" onClick={() => setTab('spending')}><Wallet size={16} /> Imported spending <span>{transactions.filter(transaction => transaction.currency === currency && transaction.type === 'imported').length}</span></button><button className={tab === 'paypal' ? 'active' : ''} type="button" onClick={() => setTab('paypal')}><Landmark size={16} /> PayPal merchant payments <Badge tone="neutral">Not connected</Badge></button></div>
      {tab === 'paypal' ? <EmptyState icon={ShieldCheck} title="PayPal integration comes later" description="Merchant checkout payments will appear separately from imported subscription expenses. No PayPal events have been created or verified in this frontend demo." action={<Button variant="secondary" onClick={() => setTab('spending')}>View imported spending</Button>} /> : <>
        <div className="toolbar management-toolbar"><label className="search-field"><Search size={17} /><input aria-label="Search transactions" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search merchants…" /></label><div className="filter-group"><select className="select" aria-label="Filter transaction category" value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select><select className="select" aria-label="Filter transaction status" value={status} onChange={event => setStatus(event.target.value)}><option>All statuses</option>{['Completed', 'Pending', 'Reversed'].map(item => <option key={item}>{item}</option>)}</select></div><Button variant="ghost" onClick={downloadSampleCsv}><Download size={15} /> Sample CSV</Button></div>
        {!filtered.length ? <EmptyState icon={Search} title="No matching transactions" description={`Try different filters or import a ${currency} CSV into the demo.`} action={<Button variant="secondary" onClick={() => { setQuery(''); setCategory('All categories'); setStatus('All statuses'); }}>Clear filters</Button>} /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Merchant</th><th>Amount</th><th>Date</th><th>Category</th><th>Payment source</th><th>Status</th></tr></thead><tbody>{filtered.map(transaction => <tr key={transaction.id}><td><div className="merchant-cell"><MerchantIcon name={transaction.merchant} initials={transaction.initials} color={transaction.color} /><span>{transaction.merchant}<small>Simulated · statement import</small></span></div></td><td className={`amount-cell ${transaction.direction === 'credit' ? 'credit-amount' : ''}`}><span className="transaction-amount">{transaction.direction === 'credit' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}{transaction.direction === 'credit' ? '+' : '−'}{formatMoney(transaction.amountMinor, transaction.currency)}</span></td><td>{formatDate(transaction.date)}</td><td>{transaction.category}</td><td><span className="source-label"><FileSpreadsheet size={13} />{transaction.source || 'Demo CSV import'}</span></td><td><Badge tone={transaction.status === 'Completed' ? 'green' : transaction.status === 'Pending' ? 'amber' : 'neutral'}>{transaction.status === 'Completed' && <Check size={11} />}{transaction.status}</Badge></td></tr>)}</tbody></table></div>}
        <div className="table-footer"><span>{filtered.length} transactions · {currency}</span><span>Demo spending ledger · no live payment events</span></div>
      </>}
    </section>
    {uploadOpen && <Modal title="Import demo transactions" description="Try a statement import locally. Nothing is uploaded to a server, and no payment events are generated." onClose={() => { if (!busy) setUploadOpen(false); }}><div className="csv-import">
      <p className="form-note">Use UTF-8 CSV with <code>merchant,amount,currency,date</code> headers. Dates must use YYYY-MM-DD. Optional: category, status, direction. Up to 500 rows, 1 MB. All rows must be valid.</p>
      <button className="upload-zone" type="button" disabled={busy} onClick={() => fileRef.current?.click()}><span className="upload-icon"><Upload size={24} /></span><strong>{selectedFile ? selectedFile.name : 'Choose your CSV file'}</strong><span>Local demo import · click to browse</span></button>
      <input ref={fileRef} className="sr-only" type="file" accept=".csv,text/csv" aria-label="Transaction CSV file" disabled={busy} onChange={event => selectFile(event.target.files?.[0])} />
      <Button variant="ghost" onClick={downloadSampleCsv}><Download size={15} /> Download sample format</Button>
      {uploadError && <div className="form-error" role="alert">{uploadError} No rows were imported.</div>}
      {rows.length > 0 && <div className="csv-ready"><Check size={16} /><span>{rows.length} valid rows ready. Exact file replays will be skipped.</span></div>}
      <p className="form-note">Different files may contain overlapping charges. They are preserved for review, not silently deleted. All imported data is labeled simulated.</p>
      <div className="modal-actions"><Button variant="secondary" onClick={() => setUploadOpen(false)} disabled={busy}>Cancel</Button><Button onClick={importCsv} disabled={!rows.length || !batchKey || busy}>{busy ? 'Importing…' : 'Import into demo'}</Button></div>
    </div></Modal>}
  </div>;
}
