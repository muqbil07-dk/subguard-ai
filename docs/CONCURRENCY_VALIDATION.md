# Phase 8 — bounded concurrency validation

## Scope and safety limits

The executable `backend/scripts/concurrency-check.js` creates the real Express
application and opens an ephemeral server on **127.0.0.1 only**. It accepts no
command-line arguments or target URL and never reads live-service credentials.
Authentication, owner-scoped storage and the delayed Gemini provider are explicitly
synthetic test adapters. The real routing, validation, financial calculations,
context builder, assistant response validation and HTTP stack execute.

Limits are fixed: **79 requests**, maximum **8 concurrent HTTP requests**, a
**25-second** overall cancellation signal and a **5-second** timeout per request.
The CLI does not provide a hosted load-test option. This is not a production
capacity test, hosted Supabase contention test, or distributed-instance test.
No actual financial data is involved. Endpoint limits are raised only on this
fixture application to accommodate the finite scenario. Persistent paid-attempt
quota behavior remains covered by the separate PostgreSQL regression tests;
this fixture's quota adapter is intentionally a no-op.

## Scenarios

| Scenario | Requests | Expected result |
| --- | ---: | --- |
| Create independent owners' conversations | 2 | 201 |
| Concurrent per-user financial summaries | 48 | 200; exact known INR totals and completed spending |
| Simultaneous distinct chat turns | 8 | 200; canonical backend amounts for the correct owner |
| Simultaneous identical request-key retries | 8 | 200; one persisted canonical user/assistant pair |
| Replay already persisted requests | 2 | 200; no additional provider generation |
| Reuse a request key with changed content | 1 | 409 |
| Cross-owner history retrieval and deletion | 4 | 404; original conversation retained |
| Invalid/expired fixture sessions | 4 | 401 |
| Verify persisted histories | 2 | 200; chronological adjacent pairs and correct ownership |
| **Total** | **79** | **0 unexpected responses** |

The mock provider waits 40 ms, and mock storage operations wait briefly so actual
asynchronous requests overlap. Both users receive distinct financial facts;
assertions check the values rather than only response codes. The fixture models
an atomic check/insert boundary; it does **not** exercise PostgreSQL row locks,
network database latency or real transaction isolation. Concurrent retries may
still generate multiple model responses before the persisted result is discovered;
the test verifies canonical persisted history, not distributed single-flight.

An expired-token rejection is simulated at authentication entry. Token expiration
or revocation while a hosted database request is already running is unverified.

## Executed local measurement

Executed on 2026-11-10 in the managed development environment with Node 24.
The standalone CLI run produced:

| Measure | Actual result |
| --- | ---: |
| Total requests | 79 |
| Observed maximum simultaneous HTTP requests | 8 |
| Observed maximum simultaneous mock generations | 8 |
| Median latency | 17.90 ms |
| 95th-percentile latency | 87.26 ms |
| Maximum latency | 145.30 ms |
| Scenario duration | 511.12 ms |
| Throughput over this short scenario | 154.56 requests/second |
| Unexpected responses/error rate | 0 / 0% |
| Process CPU user/system | 530.33 / 71.83 ms |
| RSS before / maximum sampled after requests | 72,679,424 / 100,282,368 bytes |

These measurements include a cold first HTTP request and the test process/client
in the same process as the API. They describe a short synthetic burst, not
sustained throughput. CPU includes the client and fixture. RSS is sampled after
responses rather than continuously, and is affected by imports, JIT compilation,
garbage collection and concurrent environment activity. Values vary between runs;
no latency threshold is hardcoded as a passing test or presented as an SLO.
Nearest-rank percentiles use measured per-request durations. The denominator for
throughput is the complete scenario elapsed time. Expected 401/404/409 responses
are successful security checks and are not counted as unexpected failures.

The two Node regression tests passed, with zero failed or skipped. One runs the
bounded scenario and asserts exact financial facts, isolation and history
invariants; the other rejects invalid concurrency limits before server creation.

## Repeat the local check

From the repository root:

```sh
node backend/scripts/concurrency-check.js
node --test backend/test/concurrency.test.js
```

The ordinary backend test command also includes the two regression tests. The CLI
prints aggregate JSON only: no bearer values, account names, financial records,
conversation identifiers, prompts or generated answers. A failed scenario returns
a safe failure identifier and nonzero status. It closes its listener and test
connections after completion or failure.

## Gate for later staging tests

Hosted concurrency/load verification remains blocked until an isolated project,
authorized staging API endpoint, dedicated synthetic test users and explicit
operator limits are available. Start with two users, one API instance, concurrency
2 and at most 20 requests; confirm quotas/error monitoring before increasing to
4–8. Schedule the run, cap paid Gemini calls independently of HTTP volume and stop
on unexpected authorization failures, quota exhaustion or repeated timeouts. Do not
run the local mock quota adapter against a real service.

For a true distributed exercise, use separate API processes and independent
PostgreSQL connections, verify `append_ai_turn`/quota row contention and canonical
retry behavior, and measure database query latency/connection saturation. Include
a deliberate mid-request session expiry/revocation and controlled upstream delays.
No such hosted/distributed test was executed by this local harness. Production
capacity and cost limits require a separate, explicitly approved load plan.
