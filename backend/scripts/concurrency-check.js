// This executable never accepts a target URL or uses configured live services.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { createConcurrencyFixture } from '../test/fixtures/concurrency.js';

const rounded = value => Math.round(value * 100) / 100;
const percentile = (values, fraction) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)] || 0;

export async function runConcurrencyCheck({ concurrency = 8 } = {}) {
  assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 8, 'Local concurrency must be between 1 and 8.');
  const fixture = createConcurrencyFixture();
  const server = await new Promise(resolve => {
    const listening = fixture.app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const deadline = AbortSignal.timeout(25000);
  const samples = [], statusCounts = {}, groups = {};
  const started = performance.now(), cpuStarted = process.cpuUsage(), rssStarted = process.memoryUsage().rss;
  let unexpected = 0, active = 0, maxActive = 0, rssPeak = rssStarted;
  async function call(group, method, path, owner, body, expected = 200) {
    assert.ok(samples.length < 100, 'Local request budget exceeded.');
    const before = performance.now(); active++; maxActive = Math.max(maxActive, active);
    try {
      const response = await fetch(baseUrl + path, {
        method, headers: { Authorization: `Bearer fixture-${owner}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]),
      });
      const result = await response.json();
      statusCounts[response.status] = (statusCounts[response.status] || 0) + 1;
      if (response.status !== expected) unexpected++;
      assert.equal(response.status, expected, `Unexpected ${group} HTTP status`);
      return result;
    } finally {
      active--; const elapsed = performance.now() - before; samples.push(elapsed);
      (groups[group] ||= []).push(elapsed);
      rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
    }
  }
  async function parallel(jobs) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (next < jobs.length) { const job = jobs[next++]; await job(); }
    }));
  }
  try {
    const conversations = {};
    for (const owner of ['a', 'b']) conversations[owner] = (await call('conversation_creation', 'POST', '/ai/conversations', owner, { title: 'Synthetic concurrency fixture' }, 201)).data.id;
    await parallel(Array.from({ length: 48 }, (_, i) => async () => {
      const owner = i % 2 ? 'a' : 'b';
      const response = await call('financial_summary', 'GET', '/dashboard/summary?currency=INR', owner);
      assert.equal(response.data.monthlyMinor, owner === 'a' ? '79900' : '129900');
      assert.equal(response.data.spentMinor, owner === 'a' ? '200' : '300');
      assert.equal(response.data.currency, 'INR');
    }));
    await parallel(Array.from({ length: 8 }, (_, i) => async () => {
      const owner = i % 2 ? 'a' : 'b';
      const response = await call('concurrent_chat', 'POST', '/ai/chat', owner, { conversationId: conversations[owner], requestId: randomUUID(), message: `Explain my monthly spending ${i}` });
      assert.equal(response.data.response.keyFacts[0].amountMinor, owner === 'a' ? '79900' : '129900');
    }));
    const replayId = randomUUID();
    const replay = { conversationId: conversations.a, requestId: replayId, message: 'Explain the monthly amount' };
    const replayAnswers = [];
    await parallel(Array.from({ length: 8 }, () => async () => replayAnswers.push((await call('concurrent_retries', 'POST', '/ai/chat', 'a', replay)).data.response)));
    for (const response of replayAnswers) assert.deepEqual(response, replayAnswers[0]);
    const beforeReplay = fixture.stats().generations;
    await parallel(Array.from({ length: 2 }, () => () => call('persisted_retries', 'POST', '/ai/chat', 'a', replay)));
    assert.equal(fixture.stats().generations, beforeReplay);
    await call('request_key_conflict', 'POST', '/ai/chat', 'a', { ...replay, message: 'Different request content' }, 409);
    await parallel(Array.from({ length: 4 }, (_, i) => () => call('foreign_conversation', i % 2 ? 'DELETE' : 'GET', `/ai/conversations/${conversations.a}`, 'b', undefined, 404)));
    await parallel(Array.from({ length: 4 }, () => () => call('expired_session', 'GET', '/dashboard/summary', 'expired', undefined, 401)));
    for (const owner of ['a', 'b']) {
      const history = (await call('history_integrity', 'GET', `/ai/conversations/${conversations[owner]}?limit=25`, owner)).data.messages;
      assert.equal(history.length, owner === 'a' ? 10 : 8);
      assert.ok(history.every(message => message.user_id === owner));
      assert.ok(history.every((message, index) => index === 0 || message.sequence > history[index - 1].sequence));
      for (let i = 0; i < history.length; i += 2) {
        assert.equal(history[i].role, 'user'); assert.equal(history[i + 1].role, 'assistant');
        assert.equal(history[i].turn_id, history[i + 1].turn_id);
      }
    }
    const elapsedMs = performance.now() - started, cpu = process.cpuUsage(cpuStarted);
    const summarize = values => {
      const sorted = values.toSorted((a, b) => a - b);
      return { requests: values.length, p50Ms: rounded(percentile(sorted, 0.5)), p95Ms: rounded(percentile(sorted, 0.95)), maxMs: rounded(sorted.at(-1) || 0) };
    };
    return {
      scope: 'local_loopback_mock_adapters_only',
      limits: { maxConcurrency: 8, maxRequests: 100, overallDeadlineMs: 25000, requestTimeoutMs: 5000 },
      concurrency: { configured: concurrency, observedMax: maxActive, observedMockGenerationsMax: fixture.stats().maxActiveGenerations },
      ...summarize(samples), elapsedMs: rounded(elapsedMs), throughputRequestsPerSecond: rounded(samples.length / (elapsedMs / 1000)),
      unexpectedResponses: unexpected, unexpectedErrorRate: unexpected / samples.length,
      expectedStatuses: statusCounts, groups: Object.fromEntries(Object.entries(groups).map(([name, values]) => [name, summarize(values)])),
      resources: { cpuUserMs: rounded(cpu.user / 1000), cpuSystemMs: rounded(cpu.system / 1000), rssBeforeBytes: rssStarted, rssPeakSampledBytes: rssPeak },
      assertions: { exactFinancialTotals: true, userIsolation: true, canonicalRetryHistory: true, chronologicalAtomicPairs: true, sessionExpiryRejected: true },
      limitations: ['Authentication, storage and Gemini are synthetic adapters.', 'Not a hosted PostgreSQL contention test, live Gemini benchmark, distributed test or production capacity estimate.', 'In-flight duplicate generations may occur; only persisted history is idempotent.', 'RSS is sampled after requests; it is not a continuous peak measurement.'],
    };
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    console.error('CONCURRENCY_ARGUMENTS_REJECTED: This local-only check accepts no target or arguments.');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await runConcurrencyCheck(), null, 2)); }
    catch { console.error('LOCAL_CONCURRENCY_CHECK_FAILED'); process.exitCode = 1; }
  }
}
