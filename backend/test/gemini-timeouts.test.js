import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { GoogleGenAI } from '@google/genai';
import request from 'supertest';
import { createGeminiProvider } from '../src/services/ai/geminiClient.js';
import { createDemoAssistant } from '../src/services/demo/demoAssistant.js';
import { createApp } from '../src/app.js';
import { narratives } from '../src/services/ai/narratives.js';
import { AI_TIMEOUTS } from '../src/services/ai/timeouts.js';
import { AI_REQUEST_TIMEOUT_MS } from '../../frontend/src/utils/aiTimeouts.js';

const config = { AI_ENABLED: true, GEMINI_API_KEY: 'synthetic-local-sdk-key', GEMINI_MODEL: 'synthetic-latency-model' };
const context = { operations: ['getFinancialSummary'], facts: [{ id: 'fact', operation: 'getFinancialSummary' }], model: { facts: [{ id: 'fact' }], recommendations: [] } };
const selection = { functionCalls: [{ name: 'getFinancialSummary', args: {} }] };

test('AI deadlines allow two generation requests while keeping every layer bounded', () => {
  assert.equal(AI_TIMEOUTS.metadataMs, 10_000);
  assert.equal(AI_TIMEOUTS.generationRequestMs, 30_000);
  assert.ok(AI_TIMEOUTS.providerTotalMs >= AI_TIMEOUTS.metadataMs + 2 * AI_TIMEOUTS.generationRequestMs);
  assert.ok(AI_TIMEOUTS.assistantTotalMs > AI_TIMEOUTS.providerTotalMs);
  assert.ok(AI_REQUEST_TIMEOUT_MS > AI_TIMEOUTS.assistantTotalMs);
  assert.ok(AI_REQUEST_TIMEOUT_MS <= 90_000);
});

test('metadata keeps its short HTTP timeout and both generation calls override it without retries', async () => {
  const calls = [];
  const provider = createGeminiProvider(config, { clientFactory: options => {
    assert.equal(options.httpOptions.timeout, 10_000);
    return { models: {
      async get(params) { calls.push(params); return { supportedActions: ['generateContent'] }; },
      async generateContent(params) { calls.push(params); return calls.length === 2 ? selection : { text: 'validated separately' }; },
    } };
  } });
  await provider.generate({ question: 'Review synthetic subscriptions', context });
  assert.deepEqual(calls.map(call => call.config.httpOptions.timeout), [10_000, 30_000, 30_000]);
  assert.ok(calls.every(call => call.config.httpOptions.retryOptions.attempts === 1));
});

for (const stage of ['model verification', 'tool selection', 'structured response generation']) {
  test(`timeout identifies ${stage} without exposing provider details`, async () => {
    let generations = 0;
    const fail = () => { throw Object.assign(new Error('private-upstream-credential-detail'), { name: 'TimeoutError' }); };
    const provider = createGeminiProvider(config, { clientFactory: () => ({ models: {
      async get() { if (stage === 'model verification') fail(); return { supportedActions: ['generateContent'] }; },
      async generateContent() { generations++; if (stage === 'tool selection' || generations === 2) fail(); return selection; },
    } }) });
    await assert.rejects(provider.generate({ question: 'Review synthetic subscriptions', context }), error => {
      assert.equal(error.status, 504);
      assert.equal(error.code, 'AI_TIMEOUT');
      assert.equal(error.message, `Gemini ${stage} timed out. Please retry later.`);
      assert.ok(!error.message.includes('private-upstream'));
      return true;
    });
    assert.equal(generations, stage === 'model verification' ? 0 : stage === 'tool selection' ? 1 : 2);
  });
}

test('whole-provider deadline aborts a stuck SDK and prevents final generation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(AbortSignal, 'timeout', ms => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  t.after(() => { t.mock.timers.reset(); t.mock.restoreAll(); });
  let started, receivedSignal, generations = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const provider = createGeminiProvider(config, { clientFactory: () => ({ models: {
    async get() { return { supportedActions: ['generateContent'] }; },
    async generateContent(params) {
      generations++; receivedSignal = params.config.abortSignal; started();
      return new Promise((_resolve, reject) => receivedSignal.addEventListener('abort', () => reject(receivedSignal.reason), { once: true }));
    },
  } }) });
  const rejected = assert.rejects(provider.generate({ question: 'Review synthetic subscriptions', context }), error => error.code === 'AI_TIMEOUT' && error.status === 504);
  await ready;
  t.mock.timers.tick(40_001);
  assert.equal(receivedSignal.aborted, false);
  t.mock.timers.tick(30_000);
  await rejected;
  assert.equal(receivedSignal.aborted, true);
  assert.equal(generations, 1);
});

test('official SDK and demo endpoint accept a response delayed beyond the old ten-second cap', { timeout: 22_000 }, async t => {
  // Loopback Gemini HTTP fixture, NOT a genuine Google API success claim.
  // The actual SDK enforces its HTTP timer; the first generation takes 11 seconds.
  let metadata = 0, generations = 0;
  const timers = new Set();
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      metadata++;
      res.end(JSON.stringify({ name: 'models/synthetic-latency-model', supportedGenerationMethods: ['generateContent'] }));
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    generations++;
    if (generations === 1) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'getFinancialSummary', args: {} } }] } }] }));
      }, 11_000);
      timers.add(timer);
      return;
    }
    const refs = body.contents.flatMap(turn => turn.parts.flatMap(part => (part.functionResponse?.response?.facts || []).map(fact => fact.id))).slice(0, 2);
    const text = JSON.stringify({ answer: narratives[0], summary: narratives[1], keyFacts: refs, recommendations: [], evidence: refs, warnings: [], confidence: 'grounded' });
    res.end(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const provider = createGeminiProvider(config, { clientFactory: options => new GoogleGenAI({ ...options, httpOptions: { ...options.httpOptions, baseUrl, apiVersion: 'v1beta' } }) });
  const app = createApp({ appMode: 'demo', demoAssistant: createDemoAssistant(provider) });
  const started = performance.now();
  const result = await request(app).post('/api/demo/assistant').send({ message: 'How much do these synthetic subscriptions cost each month?' }).timeout({ response: 18_000, deadline: 20_000 });
  assert.equal(result.status, 200);
  assert.ok(performance.now() - started >= 10_000);
  assert.equal(metadata, 1);
  assert.equal(generations, 2);
  assert.equal(result.body.data.synthetic, true);
  assert.equal(result.body.data.ai.generated, true);
  assert.equal(result.body.data.response.answer, narratives[0]);
  assert.ok(result.body.data.response.evidence.length > 0);
  assert.equal(result.body.data.context.summary.find(row => row.currency === 'INR').monthlyMinor, '279692');
  assert.equal(result.body.data.context.summary.find(row => row.currency === 'USD').monthlyMinor, '2000');
});
