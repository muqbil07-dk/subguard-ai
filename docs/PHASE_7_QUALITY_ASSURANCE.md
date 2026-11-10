# Phase 7 — reliability and security validation

Validation date: 2026-11-10. Starting checkpoint:
`f71b29e40a4bb10d6ea50fcd43580c1aeb4931ff`, clean branch
`feature/ai-financial-intelligence`. This milestone follows the user's Phase 7
QA scope; it supersedes the original roadmap's Phase 7 PayPal ordering. It does
not implement PayPal, deploy, merge main, or start Phase 8.

## Inspected architecture and dependency map

| Component | Dependencies and responsibility |
| --- | --- |
| React `/app` | Local demo adapter, explicitly simulated fixtures, exact currency helpers; never populates a real user's account |
| React `/account` | Supabase SDK session subscription → protected workspace keyed by user → account/API adapters; no Gemini access |
| Express `/api` and `/api/v1` | CORS, Helmet, body limits, IP/user limits, Supabase `getUser(token)`, strict Zod schemas, safe response/logging middleware |
| Scoped repository | Caller JWT + explicit verified-owner filters + PostgreSQL RLS; bounded paginated reads; narrow service-role RPCs for generated records |
| Financial/intelligence services | BigInt minor units, currency boundaries, cadence normalization, calendar anchors, observed spend, recurring detection, anomalies and reviewable suggestions |
| AI assistant | Context builder → approved read operations → official Gemini SDK → schema/evidence/narrative validation → atomic chat RPC |
| Recommendations/score | Deterministic confirmed-plan evidence and explicit unused marks; Gemini explains without changing financial records |
| PostgreSQL | Five existing migrations, owned/composite foreign keys, constraints/grants/RLS, atomic imports/turns, idempotency and persistent paid-attempt quota |

Read the existing architecture, API, database, authentication, frontend,
intelligence and AI documentation alongside source code, route handlers, schema,
SDK adapter, UI and tests. Phase 6 functionality was verified from code, not
assumed from the checkpoint. Existing Node test/Supertest, Vitest/Testing Library,
PGlite and Playwright infrastructure was reused. No dependency was installed or
upgraded; no migration, authentication architecture or API endpoint was replaced.

## Modules A–J

**A — financial correctness.** Added exact cadence/rounding fixtures; zero and
empty states; per-currency totals and categories; partial monthly trends; settled
debits less credits; negative net expenditure; excluded pending/reversed/out-of-
range data; explicit unused-plan potential savings; original-cadence annual totals;
month-end/leap anchors; replayed detection evidence versus distinct identical
charges; supported money limits and totals exceeding JavaScript safe integers.
Missing/null/non-numeric/decimal/exponent/negative minor units are rejected at the
request boundary, not silently converted to zero. Corrected demo report annual
rounding, preserving the backend's established calculation contract.

Income, salary, income-minus-expenses savings and savings percentages are **not
implemented in the existing model**. Their arithmetic tests are not applicable;
no new income model or fictitious income was introduced. Tests verify credits do
not become income, and every AI context now explicitly discloses the missing
income/net-savings information. Potential cancellation savings remain separate
from actual savings. A zero recorded spend does not imply financial completeness.

**B — Gemini reliability.** Mocked broad financial/ambiguous/irrelevant/malicious
questions, insufficient information, missing/empty/malformed/oversized response
structures, unknown/excessive calls, SQL/owner tool arguments, invented amounts,
dates, income and unsupported semantic claims; authentication/quota/service errors;
SDK timeout errors and the assistant's total deadline using virtual timers.
Verified serialized question/system separation, imported-name exclusion, secret
redaction, allowed evidence, prediction status, deterministic savings, cache owner
isolation/invalidation and AI-disabled operation. No real Google call was made.

**C — authentication/authorization.** Mocked SDK registration/login/rejection,
confirmation-required registration, logout, session retrieval, session failures,
auth-state updates and stale snapshots. Backend tests verify remote token
verification, malformed/missing/expired/rejected tokens versus service outages,
protected endpoints, caller ownership and rejected owner-forgery fields. Two
independent owners exercise API and actual SQL/RLS access checks; security does
not depend on UI controls. Real email, refresh tokens and hosted Auth remain
unverified.

**D — conversations.** Covered creation, empty conversations, accepted chat,
ordered persisted message pairs, multiple conversations, user-session changes,
chronological paginated repository retrieval, frontend remount/history retrieval,
switching while a load is pending, invalid/foreign IDs, deletion cascade, retries,
canonical request replay and mismatched-content conflict. Provider/save failures
leave no partial turn. A test-only failing PostgreSQL trigger verifies actual
assistant-insert rollback. Queued identical SQL calls retain one canonical pair.

**E — API boundaries.** Tested valid CRUD, filters, pagination, currencies, dates,
IDs, missing/wrong/extra fields, malformed JSON, unsupported media, oversized
bodies, anonymous requests, database permission denial, structured errors, safe
logs and request IDs. Retained existing error contracts, including strict JSON
parser rejection of a top-level `null` as `INVALID_JSON`. Invalid money now yields
400 rather than throwing a BigInt conversion error and returning 500.

**F — database reliability.** Actual migration replay, SQL grants/constraints,
RLS and cross-owner denial, atomic batch/turn rollback, idempotency and quota
limits run against disposable in-memory PGlite databases. SDK query and transport
failures, incomplete pages, missing counts, unsupported dataset sizes and missing
records use mocks; financial totals refuse incomplete datasets. PGlite's one
connection serializes queued work; this is not a multi-connection or distributed
PostgreSQL concurrency/load test. No hosted or production database was touched.

**G — frontend workflows.** Added successful/rejected/pending Auth UI tests,
account loading/error/retry/empty states, logout, owner-session changes, resource
tab isolation, unmounted cleanup, chat history/remount/races and retry states.
Existing dashboard, forms, CSV, demo persistence, evidence and canonical financial
rendering tests remain green. All nine production Chromium regressions passed,
including mobile navigation and explicit unavailable integrations. Browser tests
use the disconnected/demo application; live account workflows are component/API
mocks plus SQL tests, not a hosted end-to-end login.

**H — reliability/performance.** Removed a redundant subscription-list request on
dashboard mount and prevented obsolete tab loads from replacing current records
or clearing current loading state. Checked existing 10,000-record aggregate caps,
paginated queries/indexes, context/history caps, deadlines, bounded SDK attempts,
rate limits, paid-attempt quota and cache invalidation. No architecture or
speculative optimization was introduced. Simultaneous identical HTTP retries can
still generate twice before persistence; the SQL turn key prevents duplicate
history and the persistent quota bounds attempts. There is no distributed
single-flight guarantee or production capacity benchmark.

**I — automated regression.** Added Node-native `test:coverage` and all-file
`check:syntax` scripts, plus `.github/workflows/quality.yml`. CI uses Node 24,
lockfile installation, read-only repository permissions, pinned action revisions,
lint/syntax/tests/coverage/builds, audits and production browser regressions.
It requires no application credentials. Workflow YAML parsed successfully locally;
the workflow's GitHub execution is not claimed here.

**J — security review.** Reviewed credential boundaries, JWT verification, caller
filters, RLS/RPC privileges, request schemas, output evidence validation, prompt
injection boundaries, quotas, CORS/body limits, no-store responses and sanitized
logs/errors. Automated source checks prevent frontend Gemini/service-role config,
provider imports and unsafe HTML/eval sinks; example secrets must be empty.
A heuristic credential-pattern scan found no matching tracked/candidate files,
no actual `.env` file was tracked, and compiled browser JavaScript contained no
server-secret/provider markers. These checks are not a full historical secret
scan, penetration test or proof of absence of every credential format.

## Verified defects and focused corrections

| Finding | Reproduction and correction |
| --- | --- |
| Invalid money produced 500 | Zod runs refinements after regex failures; BigInt on `1.1`, `NaN`, `Infinity` or `1e3` threw. Guard syntax before both BigInt refinements; unit and HTTP regressions now expect 400. |
| Database transport rejection produced 500 | Rejected SDK query bypassed database error translation. Translate that boundary to safe 503 without copying connection/error details. |
| Annual demo estimate accumulated rounding error | A yearly 150-minor-unit plan plus quarterly 101 yielded 564 instead of 554 via rounded monthly ×12. Sum original cadence annual factors, matching the backend. Seed report now correctly shows 7,535,900 minor units. |
| Shared resource rows raced across tabs | Slow subscription responses replaced transaction rows, exposing incorrect controls for those IDs. Clear on switch and ignore superseded/unmounted loads; backend ownership already prevented cross-user access. |
| Session lookup rejection stayed loading | Catch failed session retrieval and require sign-in. Newer auth events take precedence over stale session snapshots. |
| Non-JSON responses leaked parsing failures | Guard parsing/envelope shape and return retryable `INVALID_API_RESPONSE` with HTTP status; do not render raw upstream bodies. |
| Missing income could be ambiguous | Explicit context warning states that income/net savings are unavailable and credits are adjustments, not verified income. |

## Executed results

All counts below are actual final runs. Categories are disjoint by suite grouping;
a test may assert several related cases. Baseline was 49 backend, 73 Vitest and 9
browser tests. Final is **255 passed, 0 failed, 0 skipped**.

| Category | Total | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Backend financial arithmetic/validation (`finance.test.js`) | 32 | 32 | 0 | 0 |
| Backend Phase 5 engine and HTTP regressions | 13 | 13 | 0 | 0 |
| Backend Gemini/context/recommendation safeguards | 47 | 47 | 0 | 0 |
| Backend AI chat/history API | 11 | 11 | 0 | 0 |
| Backend core API/auth/repository reliability | 44 | 44 | 0 | 0 |
| Backend frontend-secret/config boundary checks | 2 | 2 | 0 | 0 |
| React/component/service/financial tests (excluding SQL) | 77 | 77 | 0 | 0 |
| Local PostgreSQL migration/RLS/atomicity tests | 20 | 20 | 0 | 0 |
| Production Chromium browser regressions | 9 | 9 | 0 | 0 |
| **Total** | **255** | **255** | **0** | **0** |

Backend total: **149**. Vitest total: **97 across 16 files**, including 20 PGlite
tests. No automated tests were skipped. Live Gemini, hosted Supabase and unsupported
income calculations were **not executed**; they are limitations, not passing tests
or zero-count successful integrations.

Both ESLint checks, backend build and all-source/script/test syntax checks,
frontend production build, workflow YAML parse and Git whitespace checks passed.
The production browser command also rebuilt and served the production bundle.
No dependency installation or upgrade was needed in this phase.

### Actual measured coverage

Node 24's built-in experimental V8 test coverage (`src/**` include filter):

| Measure | Measured result |
| --- | ---: |
| Lines | 99.83% |
| Branches | 88.95% |
| Functions | 87.35% |

This measures **loaded backend source files**, not the whole repository. In
particular `server.js` startup and real SDK network paths are not represented.
Many existing source functions occupy one line; high line coverage does not mean
all branches or financial scenarios are covered. No frontend/browser/SQL coverage
percentage was measured; Vitest's optional coverage plugin is not installed.

### Dependency audit

`npm audit --json` including development dependencies found **4 moderate, 0 high,
0 critical** advisories in each package. These are the ESLint → config-array →
minimatch chain for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249),
a glob-processing denial-of-service advisory. The four entries represent affected
packages in a chain, not four independent flaws. The lint configuration/globs are
repository-controlled; this tooling is not shipped as a runtime dependency.
`npm audit --omit=dev --json` returned **0 vulnerabilities** in both packages.
No broad/forced dependency changes were made: npm proposes a major ESLint downgrade.
Track an upstream compatible fix. CI fails on high/critical advisories; moderate
findings remain visible. Audits are point-in-time, registry-reported checks.

## Repeatable commands

Use Node 24 and npm from the repository root. For a fresh checkout:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm --prefix backend run lint
npm --prefix backend run check:syntax
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:coverage
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

In the managed environment, use `--cache /tmp/subguard-npm-cache` if the default
npm cache is unwritable. Local browser tests use `/usr/bin/chromium`; set
`CHROMIUM_PATH` for a different installed Chromium. CI installs Playwright Chromium
and supplies its executable path explicitly. All fixtures are synthetic. PGlite
creates/disposes its own database; do not point destructive tests at a real project.
`AI_ENABLED=false` is the default and CI setting. Existing tests prove disabled
chat is explicit while deterministic recommendations, score, health and Phase 5
remain available. For intentional live verification, follow the existing AI and
Supabase documents with an isolated project and securely configured credentials.

## Important files changed

- Added `.github/workflows/quality.yml` and backend coverage/syntax scripts in
  `backend/package.json`.
- Added backend suites `test/finance.test.js`, `test/ai-reliability.test.js`,
  `test/reliability.test.js` and `test/security.test.js`; extended `test/ai.test.js`
  and `test/ai-api.test.js`.
- Fixed backend `src/services/schemas.js`, `src/services/repository.js` and
  `src/services/ai/financialContextBuilder.js`.
- Fixed frontend `src/pages/Account.jsx`, `src/services/apiService.js` and
  `src/utils/finance.js`; added `src/pages/Account.reliability.test.jsx`.
- Extended frontend Auth, LiveAssistant, API adapter, financial helper and both
  PostgreSQL migration/RLS test files.
- Added this report; updated architecture, development plan, AI implementation
  documentation and backend README with current status and repeatable checks.

## Remaining limits and decision

**COMPLETE for the requested Phase 7 QA scope**, with the unverified external
integrations and moderate development-tool advisories above explicitly retained.
No unresolved critical defect was identified by this review. This is not a claim
of complete production readiness or a comprehensive independent security audit.

Before production: verify actual Supabase Auth/email/session refresh/PostgREST and
two-user isolation, migration deployment/version compatibility, live Gemini model
function calling/structured output/quota behavior, multi-connection concurrency,
reverse-proxy rate-limit topology, retention/privacy/CSP and operational recovery.
The existing SDK browser-session/XSS tradeoff remains. Financial data coverage is
bounded/import-based, with no income ledger, usage telemetry, FX conversion or
universal PayPal/bank transaction access. Gemini retains Phase 6's deliberately
bounded narrative vocabulary; open-ended financial claims are not accepted.
Phase 8 is not started. Main is not merged or modified; deployment is not performed.
The commit hash and push verification belong in the final Git report, since a
commit cannot contain its own hash.
