# Phase 8 — staging integration and release readiness

Review date: 2026-11-10. Starting commit:
`0b52a8882bf6f745e09d508beeae09198f7580de`, clean branch
`feature/ai-financial-intelligence`. No deployment, main merge, schema change,
customer-data operation or Phase 9 work is part of this milestone.

## Release decision

**PARTIALLY READY.** Local integration safeguards, regression, observability,
concurrency checks and snapshot recovery are verified. Live Gemini, hosted
Supabase and hosted recovery remain unverified because no service credentials or
isolated project are configured. Documenting these limits does not make those
integrations successful. Controlled staging should remain a gated operator action.
No production-readiness claim is made.

## Inspection and preserved boundaries

The checkpoint, clean tree, tracked repository structure, Phase 7 report, workflow,
configuration, frontend Supabase SDK, backend Auth/repository/routes, five SQL
migrations/RLS, Gemini SDK, deterministic finance/intelligence/recommendation/chat
services and existing logging were inspected before changes. React demo/account
separation, verified owner identity, caller-token RLS, private RPCs, minor-unit
BigInt math, currency boundaries, constrained model output and canonical atomic
chat persistence remain intact. No financial calculations were replaced.

The initial environment status showed no configured Gemini/Supabase secret or
runtime-variable bindings; named process-variable presence checks also found
none. No real key was requested in chat or printed. Public configuration examples
continue to contain empty secret placeholders.

## A — Gemini integration

Added guarded, reproducible synthetic financial scenarios using the existing
context builder, official SDK and response validator: separate INR/USD recurring
figures and deterministic potential savings, predicted-payment status/date, and
missing income/net savings. Amounts and dates are asserted against known backend
fixtures; the model is never mathematical ground truth. Evidence discrepancies
fail validation rather than weakening the response schema.

Live execution requires explicit `ALLOW_LIVE_VALIDATION=true` plus a valid backend
key and selected model. The default refuses execution before constructing a
provider. At most three scenarios (six generation requests plus metadata) are
permitted. No invalid-key/quota flooding or intentional live outage is induced;
those failure cases remain deterministic mocks. See
[STAGING_LIVE_VALIDATION.md](STAGING_LIVE_VALIDATION.md) for exact guards, bounds
and commands. **No actual Google request was made in this phase.**

Fixed a cancellation gap: the existing provider previously checked the caller
signal only after metadata verification. Caller cancellation now reaches metadata
and both generation requests; pre-aborted calls perform no SDK work, and cancelled
responses are discarded. The 22-second deadline includes verification, metadata
retains its 10-second bound, and automatic HTTP attempts remain one. Mock tests
verify cancellation boundaries and safe error mapping. SDK cancellation is
client-side: already submitted provider work may continue and incur charges.
No end-to-end hosted/browser-disconnect cancellation guarantee is claimed.

## B — hosted Supabase integration

Added an opt-in runner restricted to an explicitly confirmed isolated hosted
project reference and two distinct dedicated test accounts. It uses the existing
Supabase Auth and owner-scoped repository adapters; direct caller-token queries
also omit repository filters to test actual RLS when run. The runner creates only
uniquely identified synthetic fixtures and cleans up those exact IDs. It does not
create/delete Auth users, reset schema, disable RLS, use customer records or run
bulk cleanup. Chat persistence uses the existing restricted service-role RPC.

The guarded workflow covers login/session/refresh/logout, profiles, subscription
and transaction access, conversation pairs/history, canonical replay, foreign
read/update/delete attempts and database constraint rejection. Unit tests mock
SDKs and exercise failure/cleanup/guard paths. They do not establish hosted Auth,
PostgREST, email, browser PKCE persistence or hosted RLS correctness. Registration
and email delivery remain a separate manual dedicated-account check.
**No hosted project was contacted.**

## C — actual remote CI evidence

Verified the public GitHub run summary:
[Quality and security regression, run 42811299308](https://github.com/muqbil07-dk/subguard-ai/actions/runs/42811299308).
It identifies Phase 7 commit `0b52a88`, branch `feature/ai-financial-intelligence`,
**Status: Success**, total duration **1m 23s**, regression job **1m 18s**.
This is remote execution evidence, not an inference from local tests.

The GitHub REST Actions/check-run API is blocked by this environment's outbound
proxy (`CONNECT` 403); the allowed public GitHub website supplied the actual run
summary. Detailed logs require GitHub sign-in and were not retrieved. No repository
permission, credential or network policy was changed to bypass the restriction.

The existing workflow already installs lockfile dependencies, runs tests/builds,
produces terminal coverage and browser failures, and keeps AI disabled. Phase 8
adds the bounded local concurrency command and an always-run job outcome summary.
Pinned actions and read-only repository permission remain. The final delivery
report separately records the new commit's run status after push; the earlier
successful run is not represented as execution of unpushed changes.

## D — bounded concurrency and measured performance

The real Express routing, financial context and response validation execute over
actual loopback HTTP with synthetic authentication/storage/Gemini adapters.
Hard limits: 79 requests, concurrency at most 8, overall signal 25 seconds and
per-request timeout 5 seconds; no remote URL can be supplied. Tests check exact
per-owner financial facts, simultaneous chat, paired history ordering, canonical
request replay, changed-content conflicts, foreign access and expired sessions.

Latest standalone local measurement after integration:

| Measure | Actual result |
| --- | ---: |
| Requests / observed maximum concurrency | 79 / 8 |
| Median / p95 / maximum latency | 14.93 / 79.42 / 94.57 ms |
| Whole-scenario elapsed time | 429.13 ms |
| Throughput over this short burst | 184.09 requests/second |
| Unexpected responses | 0 (0%) |
| CPU user / system time, including local client | 480.11 / 48.34 ms |
| RSS before / sampled maximum | 72,572,928 / 100,478,976 bytes |

Expected statuses were 68×200, 2×201, 4×401, 4×404 and 1×409. Security rejection
checks are not unexpected errors. Percentiles use actual request samples; no
latency threshold was hardcoded as a test result. RSS is sampled, not a continuous
peak. This short, same-process mock-backed burst is not sustained throughput,
SQL query latency, hosted contention, distributed quota validation or a production
capacity estimate. See [CONCURRENCY_VALIDATION.md](CONCURRENCY_VALIDATION.md).

True multi-process/independent-connection PostgreSQL contention, real-token expiry
mid-query, hosted upstream delays and production load remain blocked. The later
staging runbook starts with two users, concurrency 2 and at most 20 requests;
paid Gemini calls need their own small cap. Do not point the fixture harness at
hosted infrastructure or replace real quota enforcement with its mock adapter.

## E — observability and configuration

Added dependency-free structured monitoring with finite route templates, safe
error identifiers/categories, status, outcome, request ID and request latency.
No raw URL/query, merchant, user/conversation ID, request/response body, prompt,
credential, financial record, token, email or arbitrary provider message is
included. Unknown codes/routes become fixed generic labels. Request IDs are
server-generated and correlate API and AI operation events through async context.

AI failures are recorded even when recommendation/score endpoints return a safe
deterministic fallback. Auth and database failures have distinct categories.
Startup, configuration rejection, provider metadata failure and shutdown produce
structured lifecycle events. Client connection aborts produce internal `499`
metrics; that number is not a response delivered to the disconnected client.
Synchronous and asynchronous logging-sink failures cannot break API requests.
Existing injectable legacy logger record shape remains compatible.

`GET /api/health` remains public liveness, independent of external dependencies.
New `GET /api/readiness` (also `/api/v1/readiness`) requires verified Auth and makes
one bounded, owner-scoped profile query. It returns only readiness metadata; missing
profile/schema or query failure returns a safe 503. It does not prove Gemini,
all migrations or hosted performance are healthy. Unknown query fields are rejected.
Do not put a real user's token in a public monitoring URL or logs. Use a dedicated
operator-controlled fixture account or an internal secure probe workflow.

`NODE_ENV=staging` or `production` now requires HTTPS frontend and Supabase origins.
Supabase configuration rejects URL credentials, non-HTTP schemes, paths, queries
and fragments. Development still supports local HTTP. Reverse-proxy trust remains
disabled; a reviewed topology and shared rate-limit design are prerequisites for
horizontal scaling. Do not blindly enable proxy trust.

Monitoring currently writes structured stdout. No durable collector, retention,
external alert delivery or production SLO has been configured. Proposed staging
alerts: repeated readiness/auth-service failures, increasing 5xx/AI timeout/quota
rates and p95 latency changes. Derive thresholds from a real staging baseline,
retain logs under a reviewed access/retention policy and test alert delivery before
relying on it. stdout events alone are not a managed monitoring service.

## F — dependencies and security

Fresh audits, including development tools: **4 moderate, 0 high, 0 critical** in
each package. Production-only audits: **0 vulnerabilities** in both packages.
The finding remains [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
in the ESLint/config-array/minimatch dependency chain. Installed minimatch is
10.2.6; current ESLint 10.14.0 requires `^10.2.6`, config-array 0.23.5 requires
`^10.2.4`, and published v10 versions end at 10.2.6. The advisory's fix begins at
11.0.1, outside those dependency ranges. npm's audit remedy proposes an ESLint
major downgrade. Registry metadata and dependency paths were inspected; no blind
major override/downgrade or unrelated upgrade was made. No dependency was added.

These moderate tool findings remain tracked; repository-controlled lint globs do
not establish risk-free tooling, but this dependency is not shipped as application
runtime code. Audits are registry-reported point-in-time evidence. Existing Auth,
RLS, safe logs, request size/rate limits, provider evidence/financial boundaries
and secret checks remain in the regression suite. No critical defect was
identified by this review; that is not an independent penetration-test guarantee.

## G — backup and recovery

Four new tests actually export a compressed PGlite snapshot and load it into a
separate instance. All five migrations, synthetic Auth mappings, exact INR/USD
amounts, RLS/grants/private denial, message ordering/sequences, chat/import replay,
constraints and quota state survive the local round trip. Snapshot bytes remain
in memory, never in Git or logs.

[BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) documents provider-plan-dependent backup
availability/retention/PITR, isolated restore authorization, forward corrective
migrations, Auth ID preservation, configuration/secret restoration and recovery
integrity checks. Hosted backup status, restore permissions and an actual hosted
restore remain unknown. Proposed RPO/RTO targets are not measured achievements.
No production backup was read, modified or deleted.

## H — regression and release gates

Final local regression: **299 passed, 0 failed, 0 skipped**.

| Category | Total | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Backend existing Phase 1–7 regressions | 149 | 149 | 0 | 0 |
| Backend Gemini cancellation | 7 | 7 | 0 | 0 |
| Backend monitoring/privacy/aborted-request handling | 9 | 9 | 0 | 0 |
| Backend readiness and secure configuration | 3 | 3 | 0 | 0 |
| Backend bounded concurrency | 2 | 2 | 0 | 0 |
| Backend live-runner guards/orchestration (mocks) | 19 | 19 | 0 | 0 |
| Frontend existing component/service/PostgreSQL tests | 97 | 97 | 0 | 0 |
| Local snapshot recovery | 4 | 4 | 0 | 0 |
| Production Chromium browser regressions | 9 | 9 | 0 | 0 |
| **Total** | **299** | **299** | **0** | **0** |

Backend: 189 tests. Vitest: 101 tests across 17 files, including 24 local
PostgreSQL/recovery tests. Production-browser regressions: 9 tests. No automated
test was skipped. Gemini/Supabase live checks were not executed; their explicit
opt-out refusal was exercised and returned `LIVE_VALIDATION_NOT_AUTHORIZED`.
A refused live command is not counted as a passing integration.

Both ESLint checks, backend all-file syntax checks/build, frontend production
build, workflow YAML parse and Git whitespace checks passed. The browser suite
also built and served the production bundle. Node native V8 coverage measured
**99.86% lines, 91.90% branches, 89.71% functions** for loaded `src/**` backend
files. Server startup and actual service networking are not covered by those
percentages. No frontend/SQL coverage percentage is claimed.

Live integration omissions are not marked as passing or folded into mock counts.
The final delivery report supplies the commit/push/new-commit remote-CI verification.

Before admitting controlled staging traffic, an operator must supply secure
isolated-project bindings and dedicated accounts; run both live validators and
manual browser Auth/recovery flows; verify exact deployed migration versions and
RLS; confirm a usable backup and rehearse isolated hosted recovery; configure
HTTPS/CSP, proxy topology, log retention and alerts; and execute a separately
bounded hosted concurrency plan. No deployment is performed by these instructions.

## Reproduce safe local checks

```sh
npm --prefix backend run lint
npm --prefix backend run check:syntax
npm --prefix backend run build
npm --prefix backend run test:coverage
npm --prefix backend run check:concurrency
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run test:e2e
npm audit --prefix backend --audit-level=high
npm audit --prefix frontend --audit-level=high
npm audit --prefix backend --omit=dev
npm audit --prefix frontend --omit=dev
git diff --check
```

Live commands are separately opt-in; see the live-validation runbook. Default
`ALLOW_LIVE_VALIDATION=false` refuses provider/project access, and ordinary API
AI defaults to disabled. Credentials belong in secure environment settings, not
commands, reports or Git. No Phase 9 work is authorized or started.


## Important files delivered

- Backend: `src/services/observability.js`, request/lifecycle instrumentation in
  `src/app.js` and `src/server.js`, strict staging config, authenticated readiness
  route/repository probe, and Gemini cancellation propagation.
- Tools: `scripts/staging-validation.js`, guarded `scripts/gemini-smoke.js`, bounded
  `scripts/concurrency-check.js` and synthetic fixture adapters.
- Tests: monitoring, readiness, cancellation, live-runner guards, concurrent HTTP
  workflows and `frontend/src/services/recovery.test.js`.
- Operations: workflow concurrency/outcome steps, backend scripts/env examples,
  live-validation/concurrency/backup runbooks and this report; architecture, API,
  AI implementation and roadmap links updated. No dependency or migration change.
