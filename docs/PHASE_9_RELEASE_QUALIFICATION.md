# Phase 9 — authorized staging validation and release qualification

Review date: 2026-11-10. Starting checkpoint:
`d3f3e7bd10ba29cdfa4b0759d5b17bfe648a2a1a` on
`feature/ai-financial-intelligence`; the working tree was clean.

## Executive outcome

**BLOCKED. Phase 9 is not complete.** All 299 available automated regressions
passed again, but none of the mandatory hosted-service categories obtained live
staging evidence. The task authorizes staging validation; the blocker is missing
identified infrastructure and securely configured access, not a refusal of that
authorization. Successful local tests and remote CI do not qualify production.

No deployment, main merge, production operation, hosted account creation,
application rewrite, dependency change or Phase 10 work occurred. No verified
application defect warranted a runtime-code change. This delivery records the
inspection, executed offline evidence, security review and precise resume gates.

## Inspection and access evidence

Inspected the Phase 8 report, existing guarded live runners, official Gemini
adapter/response validation, Supabase Auth/repository adapters, frontend Auth and
protected account/session flow, five migrations and RLS/RPC grants, structured
monitoring, backup/recovery runbooks and GitHub Actions workflow.

The managed environment reported current observations, enforced network policy,
and no configured secret/runtime-variable bindings. Presence-only process checks
found none of the Gemini key/model, Supabase URL/public/server keys, isolated
project reference, test-account credentials, live opt-in or staging frontend/API
URLs. There was no root, backend or frontend `.env` file. No credential value was
printed. Non-secret staging targets were requested; secrets must be supplied
through secure environment settings, never chat, source or Git.

The existing runtime boundaries remain intact: verified identity from Supabase,
owner-scoped caller-token queries plus RLS, narrow privileged RPCs, deterministic
minor-unit calculations and currency boundaries, constrained evidence-backed AI
responses, atomic chat pairs/idempotency and isolated local demo data.

## Qualification matrix — actual status

| Module | Status | Actual evidence and missing requirement |
| --- | --- | --- |
| A — real Gemini | **BLOCKED** | No Google request executed; missing key/model and explicit configured opt-in. Mock provider safeguards passed. Existing smoke covers three scenarios, not all ten Phase 9 cases. |
| B — hosted Supabase | **BLOCKED** | No hosted project contacted; missing isolated project, public/server keys and dedicated accounts. Local SQL/RLS/recovery and mock adapters passed. |
| C — staging browser authentication | **BLOCKED** | No hosted frontend/API URLs or credentials. Nine browser regressions ran against local production preview/demo only. |
| D — distributed contention | **BLOCKED** | No existing authorized API instances/independent hosted DB connections. Local mock-backed concurrency regression passed; it proves no hosted lock behavior. |
| E — sustained staging load | **BLOCKED** | No staging target/resource telemetry or agreed run configuration. No hosted latency, throughput, errors, timeout rate, p99 or capacity measured. |
| F — hosted backup/recovery | **BLOCKED** | No project backup-management access, verified recovery point or disposable restore target. Local PGlite snapshot tests passed; hosted frequency, retention, PITR, RTO/RPO unknown. |
| G — durable monitoring/alerts | **BLOCKED** | Local privacy/failure-monitoring tests passed. No collector, retention/access record, alert destination or delivered alert verified. stdout alone is insufficient. |
| H — staging security | **BLOCKED for hosted configuration** | Source/local security review and fresh audits completed. Deployed HTTPS/CORS/Auth redirects/session behavior/grants/RLS remain unverified. |
| I — full automated regression | **PASS, offline scope** | 299/299 passed; lint/syntax/build/security checks passed. Actual remote CI for the Phase 8 checkpoint verified separately below. |

No blocked module is counted as passed. A runner's refusal to execute is neither
successful provider authentication nor an observed upstream failure.

## Live runner execution boundary

Executed both existing commands with live opt-in explicitly disabled:

```sh
ALLOW_LIVE_VALIDATION=false npm --prefix backend run staging:gemini
ALLOW_LIVE_VALIDATION=false npm --prefix backend run staging:supabase
```

Each runner returned exit 1 with fixed code `LIVE_VALIDATION_NOT_AUTHORIZED`.
This was an expected safety refusal before live client work; it does not mean
configured staging credentials were tried and rejected. No API key, password,
provider response or financial record was logged. There are no live financial
accuracy observations/discrepancies to report because no model was contacted.

No hosted test accounts or records were created, so hosted cleanup was not
required. The current Supabase runner expects existing dedicated accounts and
never provisions/deletes Auth users. Phase 9 account provisioning therefore still
needs the isolated project and an authorized mechanism. Exact-ID fixture cleanup
and ambiguous-write limits remain documented in
[STAGING_LIVE_VALIDATION.md](STAGING_LIVE_VALIDATION.md).

## Actual regression results

| Suite | Total | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Backend, including mock AI/Auth/API/concurrency tests | 189 | 189 | 0 | 0 |
| Frontend component/service tests | 77 | 77 | 0 | 0 |
| Local PostgreSQL migration/RLS/recovery tests | 24 | 24 | 0 | 0 |
| Local production Chromium browser regressions | 9 | 9 | 0 | 0 |
| **Total** | **299** | **299** | **0** | **0** |

Vitest total is 101 across 17 files. Its SQL group comprises 13 AI database,
7 core database and 4 snapshot recovery tests. Browser suite completed in 20.7s;
that is test-run duration, not hosted performance. There were no new failures
relative to the 299-test Phase 8 baseline and no tests were changed or skipped.
Blocked external checks were not run and are not represented as automated skips.

Executed successfully:

- Backend `npm run test:coverage`, `npm run lint`, `npm run check:syntax`,
  `npm run build`.
- Frontend `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`.
- Tracked-source credential-pattern scan, private-env tracking check, compiled
  browser server-secret/provider-marker scan and Git whitespace checks.

Current Node/V8 backend measurement for loaded `src/**` source:
**99.86% lines, 92.01% branches, 89.71% functions**. This is the actual current
measurement, not a copy of Phase 8's branch percentage. It does not cover hosted
networking or all server startup paths. No frontend/SQL coverage percentage is
claimed. Passing coverage does not close any live qualification gate.

## Security and dependency review

Fresh `npm audit --json` results: each package has **4 moderate, 0 high,
0 critical** findings. Each `npm audit --omit=dev --json` reports **zero runtime
vulnerabilities**. Full audits return a nonzero status because moderate findings
remain; they are not described as clean audits. The previously reviewed
ESLint/config-array/minimatch advisory remains
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
No forced major override, downgrade or dependency installation was performed.

Reviewed verified-token ownership, caller RLS, grants/private RPCs, frontend secret
boundaries, safe errors/logging, strict environment configuration and financial
response validation. Scans found no matching private-key/API-key patterns, no
tracked private `.env` files and no server-secret/provider markers in the browser
bundle. Pattern scanning is heuristic, not a comprehensive historical secret
scan or penetration test. No new critical defect was identified offline; actual
staging security cannot be cleared without testing its configuration and access.

## Remote CI evidence

Rechecked [GitHub run 42840050486](https://github.com/muqbil07-dk/subguard-ai/actions/runs/42840050486):
exact checkpoint `d3f3e7bd10ba29cdfa4b0759d5b17bfe648a2a1a`, expected feature branch,
**Success**, total duration **1m 8s**, regression job **1m 4s**. Evidence came from
the actual public run summary, not local execution. The workflow keeps AI disabled;
it does not test hosted services. This run validates the Phase 8 checkpoint, not
an unpushed Phase 9 commit. The final delivery report records the new commit's
push and remote CI status after they actually occur.

## Resume requirements and controlled validation sequence

Existing task authorization covers bounded, synthetic staging work. Before using
real credentials, identify the isolated target and confirm configured bindings
and scope. Never paste secret values into commands, reports or chat.

1. Provide the existing staging HTTPS frontend/API URLs and isolated Supabase
   project reference. No staging application will be deployed or infrastructure
   provisioned under this task. Configure required public browser settings and
   secure backend Gemini/Supabase bindings through environment settings. Confirm
   allowed egress to those actual hosts and Google without disabling TLS checks.
2. Supply the existing runner settings: `ALLOW_LIVE_VALIDATION=true`,
   `DEPLOYMENT_ENVIRONMENT=staging`, `STAGING_PROJECT_REF`,
   `STAGING_TEST_ACCOUNTS_CONFIRMED=true`, public project key, server-only service
   key and two distinct dedicated accounts. Provision synthetic accounts using an
   authorized isolated-project workflow. Verify migrations 001–005 and Auth
   redirects; never disable RLS or apply unreviewed resets.
3. Run the existing three-case Gemini smoke within its six-generation maximum,
   then complete the remaining Phase 9 question matrix below using authorized
   synthetic data. Agree the total paid-call budget before expanding beyond the
   existing smoke; respect persistent quotas. Record request/model/time metadata,
   accepted backend evidence references and discrepancy codes, not private prompts
   or raw model payloads. Do not intentionally exhaust quotas or flood the API.
4. Run the existing two-user hosted validator, then actual deployed REST/browser
   workflows with independent browser contexts. Validate own/foreign read/write/
   delete, account switching, reload/session persistence, logout/protected routes,
   failed login, expiry, chat/history and exact per-currency figures. In-memory
   SDK session checks do not substitute for browser testing. Remove only known
   synthetic fixtures and report account/record cleanup; review ambiguous writes.
5. For distributed tests, use two **existing** authorized API instances and
   independent DB connections. Begin with two users, concurrency 2 and at most
   20 requests. Observe atomic turn/import/quota behavior and exact history.
   Stop on any isolation error or repeated unexpected failures. Do not repurpose
   the local concurrency harness: it intentionally rejects remote targets.
6. Agree a sustained-load schedule and telemetry first. A conservative proposed
   starting envelope is two synthetic users, concurrency <=2, <=60 HTTP requests
   over <=5 minutes, <=4 paid chat turns, request timeout 10s (chat 60s), and stop
   after two consecutive unexpected errors or any data-integrity failure. These
   are proposed limits, **not an executed or approved target-specific run**.
   Report median/p95/max, actual duration/throughput/statuses/timeouts and resource
   observations. Do not report a meaningful p99 without enough samples or infer
   production capacity from a small test.
7. Obtain actual provider backup/PITR/retention/restore-permission evidence. Use an
   explicitly identified disposable restore target and selected checkpoint for
   any recovery exercise; do not restore over existing data without exact-target
   authorization. Preserve Auth owner IDs and verify restored RLS, constraints,
   exact financial totals, chat history and application connectivity. Measure
   recovery time/data-loss window only from actual evidence. Follow
   [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md).
8. Identify the durable collector, log access/retention and approved test-alert
   destination. Correlate controlled API/Auth/Gemini/database/readiness failures
   with stored sanitized events and actual delivered alerts. Verify privacy at
   the collector as well as stdout. No alert/message was sent during this review.
9. Re-run the full automated suite, review discrepancies, verify CI for the final
   revision, and update this report only with actual hosted evidence. No Phase 10
   or production deployment is authorized by this sequence.

## Required live financial question matrix — pending, not executed

| Scenario | Authoritative comparison / required behavior |
| --- | --- |
| Monthly spending | Confirmed-plan monthly estimates and settled spend remain distinct, exact and currency-scoped. |
| Savings | Explicit-unused-plan potential reductions use backend cadence figures/assumptions; no guaranteed or confirmed savings invented. |
| Spending categories | Compare with backend category breakdown; if category evidence is absent from assistant context, disclose that limitation rather than invent categories. |
| Recommendations | Every recommendation resolves to authorized evidence; no expensive-implies-unwanted or inferred-unused assertion. |
| Incomplete information | Limited evidence/confidence and clear unavailable-data warnings; no invented records. |
| Contradictory user claim | User-supplied figures cannot overwrite verified backend facts or stored records. |
| Unavailable income | Explicitly acknowledge the absence of an income ledger; refunds/credits are not income. |
| Unavailable net savings | Do not invent income-minus-expenses totals or a savings percentage. |
| Invented-transaction request | Reject unsupported narrative/amount/date references; no financial write operation is available to the model. |
| Prompt injection | Imported/question instructions remain untrusted data; approved reads only, no SQL, cross-user data, credentials or unrestricted tool execution. |

The existing adapter deliberately uses a bounded narrative vocabulary. Plausible
text alone is never a passing result. Preserve all financial/output checks when
recording a model discrepancy; do not relax them to obtain a green smoke.

## Delivery scope and final gate

Files changed for this attempt are the qualification report and navigation/status
links in existing architecture/development documentation. Runtime source, tests,
SQL migrations, workflow, dependency manifests/lockfiles and original README,
LICENSE and `.gitignore` remain unchanged. Temporary test logs stay outside Git.

Phase 9 mandatory live evidence is incomplete. **Final release decision: BLOCKED.**
The feature branch commit records blocked qualification and successful offline
regression; it does not assert completion. Main is not merged or modified by this
work. No deployment, customer-data access or Phase 10 work occurred.
