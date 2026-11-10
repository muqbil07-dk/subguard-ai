import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runConcurrencyCheck } from '../scripts/concurrency-check.js';

test('bounded loopback concurrency preserves financial facts, ownership and canonical chat history', { timeout: 15000 }, async () => {
  const result = await runConcurrencyCheck();
  assert.equal(result.scope, 'local_loopback_mock_adapters_only');
  assert.equal(result.requests, 79);
  assert.equal(result.unexpectedResponses, 0);
  assert.ok(result.concurrency.observedMax > 1 && result.concurrency.observedMax <= 8);
  assert.ok(result.concurrency.observedMockGenerationsMax > 1);
  assert.deepEqual(result.expectedStatuses, { 200: 68, 201: 2, 401: 4, 404: 4, 409: 1 });
  assert.ok(result.p50Ms >= 0 && result.p95Ms >= result.p50Ms);
  assert.ok(result.maxMs >= result.p95Ms);
  assert.ok(result.throughputRequestsPerSecond > 0);
  assert.ok(Object.values(result.assertions).every(Boolean));
});

test('local concurrency limit rejects unsupported request pressure before creating a server', async () => {
  for (const concurrency of [0, 9, 1.5, NaN]) await assert.rejects(runConcurrencyCheck({ concurrency }), /between 1 and 8/);
});
