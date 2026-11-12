import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
import { createDemoAssistant } from '../src/services/demo/demoAssistant.js';
import { createGeminiProvider } from '../src/services/ai/geminiClient.js';
import { narratives } from '../src/services/ai/narratives.js';

// Provider responses below are deterministic test doubles, never live-AI evidence.
const demoEnvironment = { APP_MODE: 'demo', FRONTEND_ORIGIN: 'http://localhost:5173' };
const liveEnvironment = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'synthetic-public-setting',
  FRONTEND_ORIGIN: 'http://localhost:5173',
};
const question = 'How much am I spending on subscriptions every month?';

function providerFixture(overrides = {}) {
  const calls = [];
  return {
    calls,
    enabled: true,
    async generate(input) {
      calls.push(input);
      const references = input.context.facts.slice(0, 2).map(fact => fact.id);
      return {
        text: JSON.stringify({
          answer: narratives[0], summary: narratives[1], keyFacts: references,
          evidence: references, recommendations: [], warnings: [], confidence: 'grounded',
        }),
        allowedFactIds: input.context.facts.map(fact => fact.id),
      };
    },
    ...overrides,
  };
}

function demoApp(provider = providerFixture(), demoOptions = {}) {
  return createApp({
    appMode: 'demo', demoAssistant: createDemoAssistant(provider), rateLimitMax: 500,
    demoOptions: { limit: 100, globalLimit: 100, ...demoOptions },
  });
}

test('explicit demo configuration needs no Supabase and keeps AI disabled by default', () => {
  const config = loadConfig(demoEnvironment);
  assert.equal(config.APP_MODE, 'demo');
  assert.equal(config.AI_ENABLED, false);
  assert.equal(config.SUPABASE_URL, undefined);
  assert.equal(config.SUPABASE_PUBLISHABLE_KEY, undefined);
  assert.equal(config.SUPABASE_SERVICE_ROLE_KEY, undefined);
});

test('normal startup still requires all original account configuration', () => {
  assert.equal(loadConfig(liveEnvironment).APP_MODE, 'account');
  for (const field of Object.keys(liveEnvironment)) {
    const incomplete = { ...liveEnvironment };
    delete incomplete[field];
    assert.throws(() => loadConfig(incomplete));
  }
  assert.throws(() => loadConfig({ FRONTEND_ORIGIN: demoEnvironment.FRONTEND_ORIGIN }));
});

test('demo configuration rejects contradictory Supabase settings and invalid mode flags', () => {
  for (const field of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    assert.throws(() => loadConfig({ ...demoEnvironment, [field]: 'synthetic-account-setting' }));
  }
  assert.throws(() => loadConfig({ ...demoEnvironment, APP_MODE: 'automatic' }));
  assert.throws(() => loadConfig({ ...demoEnvironment, ALLOW_PUBLIC_DEMO: 'yes' }));
});

test('staging/production demos require a second explicit opt-in and HTTPS', () => {
  for (const NODE_ENV of ['staging', 'production']) {
    const hosted = { ...demoEnvironment, NODE_ENV, FRONTEND_ORIGIN: 'https://demo.example' };
    assert.throws(() => loadConfig(hosted));
    assert.throws(() => loadConfig({ ...hosted, ALLOW_PUBLIC_DEMO: 'false' }));
    assert.throws(() => loadConfig({ ...hosted, ALLOW_PUBLIC_DEMO: 'true', FRONTEND_ORIGIN: 'http://demo.example' }));
    assert.equal(loadConfig({ ...hosted, ALLOW_PUBLIC_DEMO: 'true' }).APP_MODE, 'demo');
  }
});

test('enabling demo AI still requires an explicit provider key and model', () => {
  assert.throws(() => loadConfig({ ...demoEnvironment, AI_ENABLED: 'true' }));
  assert.throws(() => loadConfig({ ...demoEnvironment, AI_ENABLED: 'true', GEMINI_API_KEY: 'synthetic-test-setting' }));
  assert.throws(() => loadConfig({ ...demoEnvironment, AI_ENABLED: 'true', GEMINI_MODEL: 'fixture-model' }));
  assert.throws(() => loadConfig({ ...demoEnvironment, AI_ENABLED: 'true', AI_PROVIDER: 'disabled', GEMINI_API_KEY: 'synthetic-test-setting', GEMINI_MODEL: 'fixture-model' }));
  assert.equal(loadConfig({ ...demoEnvironment, AI_ENABLED: 'true', GEMINI_API_KEY: 'synthetic-test-setting', GEMINI_MODEL: 'fixture-model' }).AI_ENABLED, true);
});

test('demo app boots without an authenticator and exposes safe liveness', async () => {
  const response = await request(createApp({ appMode: 'demo' })).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, 'ok');
  assert.ok(!JSON.stringify(response.body).includes('SUPABASE'));
});

test('application construction fails closed on mixed modes or missing account authentication', () => {
  assert.throws(() => createApp({ appMode: 'demo', authenticate: async () => ({}) }), /Demo mode/);
  assert.throws(() => createApp({ appMode: 'automatic' }), /Invalid application mode/);
  assert.throws(() => createApp(), /authenticator/);
});

test('valid demo question uses real financial context/response validation with a mocked provider', async () => {
  const provider = providerFixture();
  const response = await request(demoApp(provider)).post('/api/demo/assistant').send({ message: `  ${question}  ` });
  assert.equal(response.status, 200);
  const { data } = response.body;
  assert.equal(data.mode, 'synthetic_demo');
  assert.equal(data.synthetic, true);
  assert.equal(data.label, 'Synthetic Demo Data');
  assert.equal(data.dataset.asOf, '2026-11-11');
  assert.deepEqual(data.ai, { provider: 'gemini', generated: true });
  assert.equal(data.response.answer, narratives[0]);
  assert.ok(data.response.evidence.length > 0);
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].question, question);
  const inr = data.context.summary.find(summary => summary.currency === 'INR');
  const usd = data.context.summary.find(summary => summary.currency === 'USD');
  assert.equal(inr.monthlyMinor, '279692');
  assert.equal(inr.yearlyMinor, '3356300');
  assert.equal(usd.monthlyMinor, '2000');
  assert.equal(usd.yearlyMinor, '24000');
  assert.ok(data.context.facts.every(fact => fact.asOf === '2026-11-11'));
});

test('invalid questions are rejected before any provider work', async () => {
  const provider = providerFixture();
  const app = demoApp(provider);
  for (const input of [{}, { message: '' }, { message: '  ' }, { message: 'ab' }, { message: 10 }, { message: null }, { message: 'x'.repeat(1001) }]) {
    const response = await request(app).post('/api/demo/assistant').send(input);
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    assert.ok(response.body.error.requestId);
  }
  assert.equal(provider.calls.length, 0);
});

test('browser-supplied owner/context/financial facts cannot enter the synthetic dataset', async () => {
  const provider = providerFixture();
  const app = demoApp(provider);
  for (const extra of [{ userId: 'other-user' }, { context: { monthlyMinor: '1' } }, { subscriptions: [] }, { conversationId: 'other-conversation' }]) {
    const response = await request(app).post('/api/demo/assistant').send({ message: question, ...extra });
    assert.equal(response.status, 400);
  }
  assert.equal(provider.calls.length, 0);
});

test('malformed JSON, oversized bodies and wrong media types are safely rejected', async () => {
  const app = demoApp();
  const malformed = await request(app).post('/api/demo/assistant').set('Content-Type', 'application/json').send('{broken');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  const oversized = await request(app).post('/api/demo/assistant').send({ message: 'x'.repeat(5000) });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE');
  const media = await request(app).post('/api/demo/assistant').set('Content-Type', 'text/plain').send(question);
  assert.equal(media.status, 415);
});

test('disabled demo AI returns an honest unavailable result with deterministic context', async () => {
  const response = await request(createApp({ appMode: 'demo' })).post('/api/demo/assistant').send({ message: question });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'AI_DISABLED');
  assert.equal(response.body.data.synthetic, true);
  assert.equal(response.body.data.ai.generated, false);
  assert.ok(response.body.data.context.summary.length > 0);
  assert.equal(response.body.data.response, undefined);
});

test('missing Gemini configuration is handled without constructing or calling a real client', async () => {
  let created = 0;
  const provider = createGeminiProvider({ AI_ENABLED: true, GEMINI_MODEL: 'fixture-model' }, {
    clientFactory() { created++; throw new Error('Client must not be initialized'); },
  });
  const response = await request(demoApp(provider)).post('/api/demo/assistant').send({ message: question });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'AI_CONFIGURATION');
  assert.equal(response.body.data.ai.generated, false);
  assert.equal(created, 0);
});

test('real Gemini adapter timeout handling remains safe on the demo route with an injected SDK', async () => {
  const provider = createGeminiProvider({ AI_ENABLED: true, GEMINI_API_KEY: 'synthetic-test-setting', GEMINI_MODEL: 'fixture-model' }, {
    clientFactory: () => ({ models: { async get() { throw Object.assign(new Error('private provider details'), { name: 'TimeoutError' }); } } }),
  });
  const response = await request(demoApp(provider)).post('/api/demo/assistant').send({ message: question });
  assert.equal(response.status, 504);
  assert.equal(response.body.error.code, 'AI_TIMEOUT');
  assert.equal(response.body.data.ai.generated, false);
  assert.ok(!JSON.stringify(response.body).includes('private provider details'));
});

test('unsupported model financial claims are rejected while deterministic values stay authoritative', async () => {
  const provider = providerFixture({
    async generate({ context }) {
      return { text: JSON.stringify({ answer: 'Your monthly total is INR 1.', summary: narratives[0], keyFacts: [context.facts[0].id], evidence: [context.facts[0].id], recommendations: [], warnings: [], confidence: 'grounded' }), allowedFactIds: context.facts.map(fact => fact.id) };
    },
  });
  const response = await request(demoApp(provider)).post('/api/demo/assistant').send({ message: question });
  assert.equal(response.status, 502);
  assert.equal(response.body.data.ai.generated, false);
  assert.equal(response.body.data.response, undefined);
  assert.equal(response.body.data.context.summary.find(summary => summary.currency === 'INR').monthlyMinor, '279692');
});

test('CORS permits only the configured frontend origin and never contacts the provider for rejected origins', async () => {
  const provider = providerFixture();
  const app = demoApp(provider);
  const denied = await request(app).post('/api/demo/assistant').set('Origin', 'https://other.example').send({ message: question });
  assert.equal(denied.status, 403);
  assert.equal(provider.calls.length, 0);
  const allowed = await request(app).post('/api/demo/assistant').set('Origin', demoEnvironment.FRONTEND_ORIGIN).send({ message: question });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], demoEnvironment.FRONTEND_ORIGIN);
});

test('per-IP and global request budgets stop provider requests at their configured limits', async () => {
  for (const options of [{ limit: 1, globalLimit: 100 }, { limit: 100, globalLimit: 1 }]) {
    const provider = providerFixture();
    const app = demoApp(provider, options);
    assert.equal((await request(app).post('/api/demo/assistant').send({ message: question })).status, 200);
    const blocked = await request(app).post('/api/demo/assistant').send({ message: question });
    assert.equal(blocked.status, 429);
    assert.equal(provider.calls.length, 1);
  }
});

test('in-flight capacity rejects concurrent work and releases capacity after completion', { timeout: 3000 }, async () => {
  let release, signalStarted;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { signalStarted = resolve; });
  const provider = providerFixture();
  const generate = provider.generate.bind(provider);
  provider.generate = async input => { signalStarted(); await gate; return generate(input); };
  const app = demoApp(provider, { concurrency: 1 });
  const first = request(app).post('/api/demo/assistant').send({ message: question }).then(response => response);
  try {
    await started;
    const blocked = await request(app).post('/api/demo/assistant').send({ message: question });
    assert.equal(blocked.status, 429);
    assert.equal(provider.calls.length, 0);
    release();
    assert.equal((await first).status, 200);
    assert.equal((await request(app).post('/api/demo/assistant').send({ message: question })).status, 200);
    assert.equal(provider.calls.length, 2);
  } finally {
    release();
  }
});

test('demo operations never need outbound database access or expose private account routes', async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error('No outbound access permitted by this test'); };
  try {
    const app = demoApp();
    assert.equal((await request(app).post('/api/demo/assistant').send({ message: question })).status, 200);
    for (const path of ['/api/subscriptions', '/api/transactions', '/api/ai/conversations', '/api/v1/subscriptions']) {
      assert.equal((await request(app).get(path)).status, 401);
      assert.equal((await request(app).get(path).set('Authorization', 'Bearer synthetic-account-token')).status, 401);
    }
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('account mode still protects all APIs and does not expose the unauthenticated demo route', async () => {
  let authenticated = 0;
  const app = createApp({ authenticate: async () => { authenticated++; throw new Error('Must not run without a bearer token'); } });
  assert.equal((await request(app).get('/api/subscriptions')).status, 401);
  assert.equal((await request(app).post('/api/demo/assistant').send({ message: question })).status, 401);
  assert.equal(authenticated, 0);
});
