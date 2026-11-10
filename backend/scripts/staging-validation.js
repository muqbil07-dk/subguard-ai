import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createAuthenticator } from '../src/middleware/auth.js';
import { createGeminiProvider } from '../src/services/ai/geminiClient.js';
import { buildFinancialContext } from '../src/services/ai/financialContextBuilder.js';
import { validateResponse } from '../src/services/ai/responseValidator.js';
import { narratives } from '../src/services/ai/narratives.js';

class ValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const verify = (condition, code = 'STAGING_ASSERTION_FAILED') => { if (!condition) throw new ValidationError(code); };
const required = (env, name) => { verify(typeof env[name] === 'string' && env[name].trim().length > 0, 'STAGING_CONFIGURATION_REQUIRED'); return env[name]; };
const rejectForeign = async operation => {
  try { await operation(); } catch (error) { verify(error.status === 404, 'STAGING_ISOLATION_FAILED'); return; }
  throw new ValidationError('STAGING_ISOLATION_FAILED');
};
export function requireLiveOptIn(env) {
  verify(env.ALLOW_LIVE_VALIDATION === 'true', 'LIVE_VALIDATION_NOT_AUTHORIZED');
}
export function supabaseStagingConfig(env) {
  requireLiveOptIn(env);
  verify(env.DEPLOYMENT_ENVIRONMENT === 'staging' && env.STAGING_TEST_ACCOUNTS_CONFIRMED === 'true', 'ISOLATED_STAGING_REQUIRED');
  const reference = required(env, 'STAGING_PROJECT_REF');
  verify(/^[a-z0-9]{20}$/.test(reference), 'ISOLATED_STAGING_REQUIRED');
  const url = required(env, 'SUPABASE_URL');
  verify(url === `https://${reference}.supabase.co`, 'STAGING_PROJECT_MISMATCH');
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
  verify(typeof key === 'string' && key.length > 0, 'STAGING_CONFIGURATION_REQUIRED');
  const accounts = ['A', 'B'].map(suffix => ({ email: required(env, `STAGING_TEST_USER_${suffix}_EMAIL`), password: required(env, `STAGING_TEST_USER_${suffix}_PASSWORD`) }));
  verify(accounts[0].email.toLowerCase() !== accounts[1].email.toLowerCase(), 'DISTINCT_TEST_ACCOUNTS_REQUIRED');
  return { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key, SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY'), accounts };
}

export async function runGeminiValidation(env, { providerFactory = createGeminiProvider, now = () => '2026-11-10T12:00:00Z', deadlineSignal = AbortSignal.timeout(120000) } = {}) {
  requireLiveOptIn(env);
  const config = { AI_ENABLED: true, GEMINI_API_KEY: required(env, 'GEMINI_API_KEY'), GEMINI_MODEL: required(env, 'GEMINI_MODEL') };
  verify(!deadlineSignal.aborted, 'STAGING_TIMEOUT');
  const provider = providerFactory(config);
  const base = { id: 'synthetic-inr', name: 'Synthetic streaming fixture', category: 'Tools', amountMinor: '79900', currency: 'INR', frequency: 'Monthly', nextRenewal: '2026-11-12', status: 'Active', unused: true };
  const plans = [base, { ...base, id: 'synthetic-usd', name: 'Synthetic research fixture', currency: 'USD', amountMinor: '1200', unused: false }];
  const repository = rows => ({ async all(table) { return table === 'subscriptions' ? structuredClone(rows) : []; } });
  const cases = [
    { name: 'currency_and_potential_savings', rows: plans, question: 'Explain monthly spending in INR and USD and recommend a review of plans marked unused.' },
    { name: 'predicted_payment_status', rows: [base], question: 'What payment is expected next week?' },
    { name: 'missing_income', rows: [], question: 'What is my income and income-minus-expenses savings?' },
  ];
  await provider.verify();
  verify(!deadlineSignal.aborted, 'STAGING_TIMEOUT');
  const results = [];
  for (const scenario of cases) {
    verify(!deadlineSignal.aborted, 'STAGING_TIMEOUT');
    const context = await buildFinancialContext(repository(scenario.rows), { question: scenario.question, asOf: now().slice(0, 10) });
    if (scenario.name === 'currency_and_potential_savings') {
      const monthly = context.facts.filter(fact => fact.kind === 'monthly_estimate');
      verify(monthly.find(f => f.currency === 'INR')?.amountMinor === '79900');
      verify(monthly.find(f => f.currency === 'USD')?.amountMinor === '1200');
      verify(context.recommendations.find(r => r.category === 'marked_unused')?.estimatedSavings.yearlyMinor === '958800');
    }
    const generated = await provider.generate({ question: scenario.question, context, signal: deadlineSignal });
    const authorized = { ...context, facts: context.facts.filter(f => generated.allowedFactIds.includes(f.id)) };
    const response = validateResponse(generated.text, authorized, now());
    const evidence = [...response.keyFacts, ...response.evidence];
    if (scenario.name === 'currency_and_potential_savings') {
      verify(evidence.some(f => f.kind === 'monthly_estimate' && f.currency === 'INR' && f.amountMinor === '79900'), 'LIVE_EVIDENCE_DISCREPANCY');
      verify(evidence.some(f => f.kind === 'monthly_estimate' && f.currency === 'USD' && f.amountMinor === '1200'), 'LIVE_EVIDENCE_DISCREPANCY');
      verify(response.recommendations.some(r => r.category === 'marked_unused' && r.estimatedSavings?.monthlyMinor === '79900'), 'LIVE_EVIDENCE_DISCREPANCY');
    }
    if (scenario.name === 'predicted_payment_status') verify(evidence.some(f => f.predicted === true && f.date === '2026-11-12' && f.amountMinor === '79900'), 'LIVE_EVIDENCE_DISCREPANCY');
    if (scenario.name === 'missing_income') {
      verify(response.confidence === 'limited' && evidence.length === 0, 'LIVE_EVIDENCE_DISCREPANCY');
      verify(response.warnings.some(w => w.includes('Income and income-minus-expenses savings are not recorded')), 'LIVE_EVIDENCE_DISCREPANCY');
    }
    results.push({ scenario: scenario.name, status: 'passed' });
  }
  return { service: 'gemini', syntheticOnly: true, scenarios: results, maximumGenerationRequests: 6 };
}

// Login and caller-scoped repositories are the application's real SDK/Auth/data
// adapters. The server-only writer is used exclusively by the existing chat RPC.
export async function runSupabaseValidation(env, { clientFactory = createClient, authenticateFactory = createAuthenticator, idFactory = randomUUID, deadlineSignal = AbortSignal.timeout(180000) } = {}) {
  const config = supabaseStagingConfig(env);
  const runId = idFactory();
  const clients = [], contexts = [], fixtures = [];
  let primaryError, cleanupFailures = 0;
  verify(!deadlineSignal.aborted, 'STAGING_TIMEOUT');
  let requestBudget = deadlineSignal;
  const validationFetch = (url, init = {}) => {
    verify(!requestBudget.aborted, 'STAGING_TIMEOUT');
    return fetch(url, { ...init, signal: AbortSignal.any([requestBudget, AbortSignal.timeout(10000), ...(init.signal ? [init.signal] : [])]) });
  };
  const scopedFactory = (url, key, options = {}) => clientFactory(url, key, { ...options, global: { ...options.global, fetch: validationFetch } });
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  try {
    const authenticate = authenticateFactory(config, scopedFactory);
    for (const account of config.accounts) {
      verify(!deadlineSignal.aborted, 'STAGING_TIMEOUT');
      const client = scopedFactory(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, options);
      clients.push(client);
      const login = await client.auth.signInWithPassword(account);
      verify(!login.error && login.data?.session?.access_token, 'STAGING_AUTH_FAILED');
      const session = await client.auth.getSession();
      verify(!session.error && session.data?.session?.access_token === login.data.session.access_token, 'STAGING_SESSION_FAILED');
      const context = await authenticate(login.data.session.access_token);
      contexts.push(context);
      const profile = await client.from('profiles').select('id').eq('user_id', context.user.id);
      verify(!profile.error && profile.data?.length === 1, 'STAGING_PROFILE_FAILED');
    }
    verify(contexts[0].user.id !== contexts[1].user.id, 'DISTINCT_TEST_ACCOUNTS_REQUIRED');
    for (const [index, context] of contexts.entries()) {
      verify(!deadlineSignal.aborted, 'STAGING_TIMEOUT');
      const repository = context.repository;
      const prefix = `Staging validation ${runId.slice(0, 8)} ${index}`;
      const plan = await repository.create('subscriptions', { name: prefix, category: 'Staging fixture', amountMinor: '101', currency: 'INR', frequency: 'Monthly', nextRenewal: '2026-11-12', status: 'Active', unused: false });
      fixtures.push({ table: 'subscriptions', id: plan.id });
      verify((await repository.update('subscriptions', plan.id, { amountMinor: '202' })).amountMinor === '202');
      verify((await repository.update('subscriptions', plan.id, { amountMinor: '101' })).amountMinor === '101');
      const transaction = await repository.create('transactions', { merchant: prefix, category: 'Staging fixture', amountMinor: '101', currency: 'INR', date: '2026-11-10', source: 'User CSV import', status: 'Completed', direction: 'debit', batchKey: `staging-${runId}`, rowIndex: index });
      fixtures.push({ table: 'transactions', id: transaction.id });
      const conversation = await repository.aiCreateConversation(prefix);
      fixtures.push({ table: 'ai_conversations', id: conversation.id });
      const response = validateResponse(JSON.stringify({ answer: narratives[6], summary: narratives[6], keyFacts: [], evidence: [], recommendations: [], warnings: [], confidence: 'limited' }), { facts: [], recommendations: [], warnings: ['Synthetic staging persistence fixture; no Gemini request was made.'] }, '2026-11-10T12:00:00Z');
      await repository.aiAppendTurn(conversation.id, 'Synthetic staging persistence fixture', response, runId);
      await repository.aiAppendTurn(conversation.id, 'Synthetic staging persistence fixture', response, runId);
      const history = await repository.aiMessages(conversation.id, { page: 1, limit: 10 });
      verify(history.rows.length === 2 && history.rows[0].role === 'user' && history.rows[1].role === 'assistant', 'STAGING_HISTORY_FAILED');
      verify((await repository.get('subscriptions', plan.id)).amountMinor === '101');
      verify((await repository.get('transactions', transaction.id)).amountMinor === '101');
      const other = contexts[1 - index].repository;
      for (const record of [{ table: 'subscriptions', id: plan.id }, { table: 'transactions', id: transaction.id }]) {
        await rejectForeign(() => other.get(record.table, record.id));
        await rejectForeign(() => other.update(record.table, record.id, record.table === 'subscriptions' ? { name: 'Unauthorized synthetic change' } : { status: 'Pending' }));
        await rejectForeign(() => other.delete(record.table, record.id));
        // Direct caller SDK requests omit the repository owner filter, testing RLS.
        const foreignClient = clients[1 - index];
        for (const method of ['select', 'update', 'delete']) {
          let query = foreignClient.from(record.table);
          query = method === 'select' ? query.select('id') : method === 'update' ? query.update(record.table === 'subscriptions' ? { name: 'Unauthorized synthetic change' } : { status: 'Pending' }).select('id') : query.delete().select('id');
          const result = await query.eq('id', record.id);
          verify(!result.error && result.data?.length === 0, 'STAGING_ISOLATION_FAILED');
        }
      }
      await rejectForeign(() => other.aiConversation(conversation.id));
      await rejectForeign(() => other.aiMessages(conversation.id, { page: 1, limit: 10 }));
      await rejectForeign(() => other.aiDeleteConversation(conversation.id));
      const foreignMessages = await clients[1 - index].from('ai_messages').select('id').eq('conversation_id', conversation.id);
      verify(!foreignMessages.error && foreignMessages.data?.length === 0, 'STAGING_ISOLATION_FAILED');
      const invalid = await clients[index].from('subscriptions').update({ amount_minor: -1 }).select('id').eq('id', plan.id);
      verify(invalid.error?.code === '23514', 'STAGING_CONSTRAINT_FAILED');
      verify((await repository.get('subscriptions', plan.id)).amountMinor === '101');
      const reloaded = await repository.aiConversation(conversation.id);
      verify(reloaded.id === conversation.id, 'STAGING_HISTORY_FAILED');
    }
    // Exercise refresh only on these temporary dedicated-account sessions.
    for (const client of clients) {
      const refreshed = await client.auth.refreshSession();
      verify(!refreshed.error && refreshed.data?.session?.access_token, 'STAGING_SESSION_FAILED');
    }
  } catch (error) { primaryError = error instanceof Error ? error : new ValidationError('STAGING_VALIDATION_FAILED'); }
  finally {
    // Cleanup gets its own bounded budget even if the work budget expired.
    requestBudget = AbortSignal.timeout(30000);
    // Exact script-created IDs only. Try both owners if an isolation defect moved
    // a fixture; no bulk table cleanup and no user/account deletion is permitted.
    for (const fixture of fixtures.reverse()) {
      for (const context of contexts) {
        try {
          if (fixture.table === 'ai_conversations') await context.repository.aiDeleteConversation(fixture.id);
          else await context.repository.delete(fixture.table, fixture.id);
        } catch (error) { if (error.status !== 404) cleanupFailures++; }
      }
    }
    for (const client of clients) {
      try {
        const loggedOut = await client.auth.signOut({ scope: 'local' });
        const session = await client.auth.getSession();
        if (loggedOut.error || session.error || session.data?.session) cleanupFailures++;
      } catch { cleanupFailures++; }
    }
  }
  if (cleanupFailures || primaryError) {
    const failure = cleanupFailures ? new ValidationError('STAGING_CLEANUP_INCOMPLETE') : primaryError;
    failure.validationRunId = runId;
    throw failure;
  }
  return { service: 'supabase', runId, dedicatedAccounts: 2, status: 'passed', cleanup: 'completed', checks: ['login', 'profile_read', 'in_memory_session', 'refresh', 'logout', 'financial_crud', 'conversation_persistence', 'turn_replay', 'repository_ownership', 'direct_rls', 'constraints'] };
}
const safeCodes = new Set(['LIVE_VALIDATION_NOT_AUTHORIZED', 'STAGING_TIMEOUT', 'STAGING_CONFIGURATION_REQUIRED', 'ISOLATED_STAGING_REQUIRED', 'STAGING_PROJECT_MISMATCH', 'DISTINCT_TEST_ACCOUNTS_REQUIRED', 'STAGING_AUTH_FAILED', 'STAGING_SESSION_FAILED', 'STAGING_PROFILE_FAILED', 'STAGING_ASSERTION_FAILED', 'STAGING_HISTORY_FAILED', 'STAGING_ISOLATION_FAILED', 'STAGING_CONSTRAINT_FAILED', 'STAGING_CLEANUP_INCOMPLETE', 'LIVE_EVIDENCE_DISCREPANCY', 'AI_INVALID_RESPONSE', 'AI_UNGROUNDED', 'AI_TIMEOUT', 'AI_QUOTA', 'AI_CONFIGURATION', 'AI_MODEL_UNAVAILABLE', 'AI_UNAVAILABLE', 'AI_TOOL_REJECTED']);
export async function validationMain(service, env = process.env, dependencies = {}) {
  try {
    verify(['gemini', 'supabase'].includes(service), 'STAGING_CONFIGURATION_REQUIRED');
    const result = await (service === 'gemini' ? runGeminiValidation(env, dependencies) : runSupabaseValidation(env, dependencies));
    console.log(JSON.stringify(result));
    return 0;
  } catch (caught) {
    const error = caught && typeof caught === 'object' ? caught : {};
    console.error(JSON.stringify({ service: ['gemini', 'supabase'].includes(service) ? service : 'unknown', status: 'failed_or_blocked', code: safeCodes.has(error.code) ? error.code : 'STAGING_VALIDATION_FAILED', ...(/^[0-9a-f-]{36}$/.test(error.validationRunId || '') ? { runId: error.validationRunId } : {}) }));
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await validationMain(process.argv[2]);
