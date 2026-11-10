# Development plan

## Goal, scope and current state

Phase 6 adds backend-only Gemini assistance, grounded responses, chat persistence
and optional AI mode; see [AI_FINANCIAL_INTELLIGENCE.md](AI_FINANCIAL_INTELLIGENCE.md).
Live provider and hosted Supabase validation remain outstanding; Phase 7 is not started.


Phase 5 now implements the deterministic engine, persisted review workflow and
account UI described in [SUBSCRIPTION_INTELLIGENCE.md](SUBSCRIPTION_INTELLIGENCE.md).
Live Supabase validation remains pending configuration; Phase 6 is not started.


Build a complete, honest MVP for the PayPal AI Hackathon 2026: a user signs in,
imports consented spending history, reviews detected subscriptions, sees likely
renewals and possible billing anomalies, and asks for a grounded explanation.
A separate real PayPal Sandbox checkout demonstrates the authorized payment and
verified webhook lifecycle. Its merchant receipts do not masquerade as the user's
external subscription expenses.

**Phase 2 frontend implementation has now been authorized and delivered** after
the Phase 1 foundation. See [FRONTEND_IMPLEMENTATION.md](FRONTEND_IMPLEMENTATION.md)
for its scope and handoff. Backend, database, AI and payment integrations remain
future work; the gates below still define their implementation sequence. No
account provisioning, provider setup, environment publication or deployment is
implied by the frontend implementation.

MVP excludes external bank aggregation, universal PayPal customer history,
automatic merchant cancellation, moving customer funds, currency conversion,
automatic disputes/refunds, usage-based claims of unused subscriptions and shared
households. These require separate permissions, reliable data and product review.

## Phase 1 — Project foundation

Deliverables: reserved frontend/backend/database folders, component READMEs,
public/private environment templates, Node 24 LTS baseline, formatting conventions,
and the four design documents. Keep original README, LICENSE and `.gitignore`
unchanged and retain repository history. Feature branch:
`feature/project-foundation`. No dependencies are necessary for documents and
scaffolding, so no package install or speculative lockfile is part of this phase.

Gate: inspect the actual checkout; check expected files, local Markdown references,
environment template coverage/ignore behavior, whitespace and preserved-file
hashes; review financial/security contracts for consistency; commit only the
foundation. No runtime build/test can be claimed without application code.

## Phase 2 — Premium frontend (requires approval)

Initialize a Vite React JavaScript project **inside the existing `frontend/`**
without replacing its files or the repository README/license. Add only React,
Vite and its React integration, Tailwind CSS's supported Vite integration, React
Router, Recharts, Lucide React and Framer Motion, plus tooling required to build
and validate that implementation. Choose compatible current versions, record
Node compatibility and commit the manifest and lockfile. Use `npm ci` thereafter.

Build responsive public and dashboard layouts, subscription/renewal/alert views,
import flow and payment/assistant availability views. Provide clear hierarchy,
currency-aware formatting, accessible charts, semantic controls, keyboard/focus
support, reduced motion and loading/empty/error states. Sample data is visibly
labeled and isolated from connected accounts. Centralize REST and session service
interfaces; do not implement a pretend backend or populate real ledgers with demos.

Gate: production frontend build, lint if configured, responsive/keyboard checks
and a browser smoke through planned navigation. A working UI does not establish
working authentication, financial calculations or integrations.

## Phase 3 — Authentication and database

Provision isolated development/test Supabase projects and configure sign-up,
sign-in, sign-out, refresh, reset and allowed redirects. Adopt supported signing
keys, choose browser session persistence and document its XSS tradeoff. Validate
JWTs using trusted project configuration.

Write versioned SQL migrations under `database/migrations/` for the schema in
[DATABASE_DESIGN.md](DATABASE_DESIGN.md), with constraints, indexes, grants, RLS
and service-only transactional functions. Introduce private tables without
exposing their schema. Public generated fields need restricted grants in addition
to row ownership. Do not use production for tests or store credentials in SQL.

Gate: clean migration replay; authenticated and anonymous access tests including
two-user read/write/link attacks and generated-field protection; verified auth
flows; direct Data API attempts against private tables/functions denied. A project
URL and publishable key alone do not establish authorization correctness.

## Phase 4 — Backend REST APIs

Initialize Node/Express JavaScript with a committed lockfile and scripts for
development, production startup and meaningful tests. Add validation, JWT
verification and security libraries deliberately; use built-in Node tooling when
adequate. Implement validated configuration, request IDs, structured errors,
size/rate limits, exact-origin CORS, health checks and request-scoped caller DB
access. Keep protected domain writes in narrow adapters with ownership checks.

Implement profile/preferences, sources, atomic bounded CSV import, transaction
reads and manual subscription CRUD. Map DTOs rather than returning raw rows.
Use exact money and calendar/date utilities from the start. No application secrets
may enter the frontend. Connect the real UI and show failures explicitly.

Gate: API integration tests with actual test database and user isolation;
invalid input, pagination, oversized uploads, repeated imports, malformed dates,
unsupported currency, missing configuration and duplicate legitimate purchases;
functional browser sign-in → import → subscription edit flow.

## Phase 5 — Subscription intelligence engine

Implement versioned, deterministic recurring detection, calendar-aware next
renewals, price-increase and possible-duplicate rules. Start with the heuristics
in [ARCHITECTURE.md](ARCHITECTURE.md); tune with labeled test cases rather than
claiming statistically validated accuracy. Require user review of candidates;
respect manual overrides and local tracking statuses. Add evidence-backed
recommendations, per-currency dashboard summaries, confidence and freshness.

Gate: exact arithmetic/overflow and currency tests; weekly/monthly/annual schedules,
month ends, leap days, date-only inputs and timezones; sparse/variable history,
refunds/reversals, reruns and alert deduplication. The same authorized input and
rule version must reproduce the same result. Inspect evidence in the integrated UI.

## Phase 6 — AI financial assistant

Choose one provider after checking credentials, privacy/consent, region and cost.
Define a provider-independent explanation interface, a disabled mode, fact-builder
allowlists and a stateless first interaction. Add SDK only for the chosen provider.
Restrict data retrieval to the verified owner; calculate all money on the backend.
Validate structured output/citations and render safe text with limitations.

Gate: owned fact retrieval, numeric claim grounding, prompt-injection handling,
timeout/rate-limit/budget enforcement and unavailable-provider behavior. Verify
that an AI failure leaves subscription management and deterministic insights
working. Keep live-provider acceptance evidence separate from adapter fixtures.

## Phase 7 — PayPal integration

Create a Sandbox business/buyer setup, developer REST app and a reachable public
HTTPS webhook receiver. Confirm actual Orders v2 capability and supported events
for that app/region. Implement server OAuth, server-priced allowlisted demo item,
create → buyer approval → capture, persisted per-operation idempotency and
reconciliation of ambiguous responses. Store own-merchant payment records apart
from the spending ledger. Do not enable live payments for the MVP.

Implement signature verification using PayPal's verification endpoint and the
configured webhook ID. Persist only verified receipts; deduplicate before worker
effects; enforce resource ownership, expected payee/amount/currency and allowed
state transitions. Commit state/inbox/outbox atomically and recover crashed leases.

Gate: real Sandbox buyer-approved capture and app-delivered verified webhook;
invalid signature, duplicate/concurrent deliveries, mismatched event IDs/bodies,
unknown resources, delayed/refund events and provider/database outages. Simulator
events and offline fixtures are not proof of an actual Sandbox payment. Do not
claim external-bank or unrelated-merchant visibility from this integration.

## Phase 8 — Notifications and analytics

Complete the durable worker/scheduler delivery pipeline (the payment inbox worker
starts in Phase 7), in-app notification storage/read state, renewal reminders and
anomaly notifications. Use durable jobs, stable dedupe keys, quiet hours and
timezone-aware delivery. Add currency-specific spending/forecast views and data
freshness indicators. Defer email/push until a provider and opt-in requirements are
chosen; do not install delivery SDKs before then.

Gate: due reminders, canceled/paused suppression, concurrent workers, crash/retry
recovery, repeated delivery, read-state ownership and partial-data display. Show
actual completed spending separately from estimated upcoming renewals.

## Phase 9 — Testing and release hardening

Tests are added alongside each earlier implementation; this phase completes the
release regression rather than postponing security verification. Add CI for
locked dependency installation, frontend production build, backend tests, RLS
tests and browser MVP smoke. Keep secret-dependent Sandbox/provider checks in a
separately controlled job, not a requirement that forks expose credentials.

Gate: recorded test counts and outcomes; essential flows passing; threat-model
review, secret/dependency checks, accessibility review, failure recovery and
backups/restore checks. Investigate failures; keep skipped/unrun provider checks
explicit. No zero-test run or linter alone demonstrates a working application.

## Phase 10 — Deployment and hackathon presentation

Choose SPA/API/worker hosting and Supabase region with HTTPS, secrets, cron,
outbound provider access and logs. Apply reviewed migrations before compatible
app rollout; configure exact CORS/auth redirect/PayPal return URLs and real webhook
registration. Use SPA route fallback, separate environments and service readiness
checks. Never bake server keys into frontend build variables.

Prepare a repeatable demonstration: disclose sample/imported data provenance,
review a subscription and renewal, inspect an alert and grounded explanation,
then demonstrate the real Sandbox checkout/webhook separately. Document provider
permissions and unavailable features accurately. Verify the current competition's
submission requirements rather than assuming judging criteria or deadlines.

Gate: deployed end-to-end MVP smoke with actual test accounts, verified Sandbox
delivery, safe logs, queue/freshness monitoring, migration recovery procedure and
a presentation that clearly identifies estimates, simulated fixtures and Sandbox
payments. Obtain any deployment authorization required by the chosen platform.

## Dependency and implementation order

1. User approves Phase 2, then build the frontend shell with isolated sample data.
2. Supabase identity/schema and API/import enable real per-user functionality.
3. Deterministic intelligence makes the dashboard valuable without an LLM.
4. AI explanations and real Sandbox integration add independently testable value.
5. Durable reminders, regression, deployment and evidence complete the MVP.

If time is constrained, narrow the UI and supported import formats first. Keep
tenant isolation, exact money, reliable evidence, honest data coverage and webhook
verification as required gates. Defer additional AI providers, external connectors,
email/push, FX and speculative analytics. Never replace a blocked integration with
an invented success path to make a demonstration look complete.

## Phase 1 handoff and local review

This repository is already the project root: do not create a second nested
`subguard-ai/` directory. Future tasks should use the existing checkout; cloud
tasks are isolated, so do not create Git worktrees unless the user requests one.
The inspection started on local branch `work` at initial commit
`a75303d61bbe3ac1d8680436a3e0342367ae7a41`; `feature/project-foundation` was created
from that checkout. The managed execution environment provides Node 24.22.1 and
npm 11.9.0; `.nvmrc` requests the Node 24 LTS line rather than claiming a newly
installed toolchain.

Read [ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE_DESIGN.md](DATABASE_DESIGN.md)
and [API_DOCUMENTATION.md](API_DOCUMENTATION.md) before implementation. Frontend
and backend READMEs describe folder responsibilities and environment templates.
Templates contain empty provider values, not working credentials. Do not populate
them in Git. No database migration, local server, build or test runner exists yet.

Static checks for this phase include `git diff --check`, complete scaffold and
local document-link inspection, environment ignore checks, and verification that
the original three files have no diff against the initial commit. The actual
results and foundation commit hash belong in the delivery report; future test
gates above are not executed results.
