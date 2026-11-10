# Phase 4 backend implementation

## Current implementation versus earlier design

The API now implements Phase 4 against the actual Phase 3 schema. The requested
`/api/...` routes and equivalent `/api/v1/...` aliases are supported. Earlier
architecture documents describe the broader target; no PayPal or AI provider is
connected by this phase. Existing demo routes and storage are preserved.

`backend/src/app.js` is an injectable Express factory; `server.js` validates
configuration and starts the production process. Routes orchestrate strict Zod
schemas, owner-scoped repositories and pure financial/date services. Central
middleware supplies authentication, size limits, safe errors, request IDs, exact
origin CORS, security headers and per-IP/per-user rate limits. Logs contain only
request ID, method, status and duration, without tokens, bodies, financial details,
user identities or raw provider errors. Proxy trust is disabled; configure a
reviewed trusted-proxy policy before deploying behind a forwarding proxy.

## Authentication and deployment configuration

Supabase Auth's `getUser(token)` endpoint verifies tokens remotely, including
signature/project validity and expiry. This is an intentional alternative to local
JWKS verification from the initial design: it supports the project's signing
configuration without decoding or trusting unverified JWT claims. It adds an Auth
network dependency; verification failure rejects access and service outages return
503 rather than successful authentication. SDK requests have a 10-second timeout.
Authenticated database calls use the public project key and the caller's bearer
token; a fresh client is created for each request. The service-role key is unused.

Set backend `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`),
`FRONTEND_ORIGIN` and optionally `PORT` using secret/environment settings or an
ignored `.env`. Frontend `VITE_API_BASE_URL` should point at `/api` or `/api/v1` on
the deployed API. Its absent-value development default is `http://localhost:3000/api`.
Require HTTPS for remote deployments, register Auth redirects, and configure CORS
for the exact frontend origin. No live credentials were available for this phase.

## Implemented routes

All data routes require bearer authentication. Public liveness is `GET /api/health`.

| Routes | Behavior |
| --- | --- |
| `GET, POST /api/subscriptions` | Owner list and validated create |
| `GET, PATCH, DELETE /api/subscriptions/:id` | Owner get/update/delete; absent and foreign IDs return 404 |
| `GET, POST /api/transactions` | Owner list and manually imported transaction create |
| `GET, DELETE /api/transactions/:id` | Owner get/delete |
| `PATCH /api/transactions/:id` | Status-only update retained for the Phase 3 UI |
| `POST /api/transactions/imports` | Atomic bounded JSON import using existing database RPC; requires `Idempotency-Key` |
| `GET /api/dashboard/summary` | Active plan count, normalized monthly recurring expense, explicit-unused savings estimate, completed net spending and count |
| `GET /api/dashboard/spending` | Completed net spending grouped by calendar month |
| `GET /api/dashboard/upcoming-payments` | Recurring estimated renewals in a bounded window |
| `GET /api/dashboard/category-breakdown` | Active monthly recurring estimates grouped by category |
| `GET /api/calendar` | Calendar-aware renewal occurrences in requested range |
| `GET /api/notifications` | Owner-paginated real stored notifications |
| `PATCH /api/notifications/:id/read` | Server timestamp; clients cannot change notification content |
| `DELETE /api/notifications/:id` | Owner-only delete, enabled by migration 003 |

List query: `page` (default 1), `limit` (default 25, max 100), optional `currency`,
`from`, `to`, `merchant`, `category`, `status`. Dates are ISO local calendar dates;
transaction date filters use the stored date, subscription filters use next renewal.
List responses are `{data:[], pagination:{page,limit,total}}`; this phase uses
bounded offset pagination instead of the initially proposed cursor protocol.
Stable `(created_at,id)` ordering prevents tied-timestamp ambiguity for static data.
Concurrent writes may shift offsets; a future cursor protocol can improve this.
Notification lists accept page/limit only. Unknown filters and ownership fields
are rejected rather than silently trusted.

Mutation bodies use the existing frontend camelCase names: subscription `name`,
`category`, `amountMinor`, `currency`, `frequency`, `nextRenewal`, optional tracking
`status`, `unused`, `reminder`, `color`, `initials`; transaction `merchant`,
`amountMinor`, `currency`, `date`, `category`, `batchKey`, `rowIndex`, optional
`status`, `direction`, and fixed source `User CSV import`. Amounts are nonnegative
minor-unit strings capped to the current database range; subscriptions require a
positive amount. Weekly/monthly/quarterly/yearly and supported currency codes match
Phase 3 constraints. Import body is `{rows:[...]}` without per-row batch fields or
source; the RPC derives ownership and fixes source. Exact replay inserts zero;
changed payload under the same key returns 409. Identical merchant/amount/date
purchases in distinct batches remain separate. Private PayPal receipts are never
queried, fabricated or merged into this spending ledger.

Object responses use `{data:...}`. Errors use
`{error:{code,message,requestId}}` with safe 400/401/403/404/409/413/415/422/429/503
responses; unexpected errors become generic 500. JSON size limits are 32 KB for
ordinary requests and 1 MB for imports; imports are capped at 500 rows. Both rate
limiters default to 120 requests/minute. Their in-memory stores are per-process;
use a shared limiter store before horizontal scaling.

## Calculation contract

No sample data participates in live calculations. Money is summed using BigInt,
serialized as strings, separated by currency, with no fabricated FX rates. Active
plans normalize monthly with half-up rounding: weekly ×52/12, quarterly /3, yearly
/12. Potential savings uses only plans explicitly marked unused. Spending includes
completed debits less completed credits; pending and reversed entries are excluded.
Explicit credit records must represent refunds; the API does not invent reversal
links or infer which imported charge was refunded.

Dashboard defaults use the current UTC calendar month through today. Query
`currency` defaults to INR; optional `from`/`to` constrain spending. Category
breakdown and monthly recurring amounts describe current active plans, not past
spending. Empty data returns zero strings, zero counts or empty arrays. No AI
score or made-up unusual-charge metric is returned.

Calendar defaults to today through 30 days, inclusive; custom windows are limited
to 366 days. Monthly, quarterly and yearly recurrences preserve the original
anchor day, clipping month ends without drifting later anchors; weekly repeats
use seven calendar days. Paused/cancelled plans are excluded. These are estimates,
not evidence that future money moved. Analyses cap at 10,000 source records/table
and 10,000 generated renewals, returning an explicit limit error instead of partial
totals. Paginated database reads check exact counts, including lower configured
server page limits. Cross-request reads are not a transactionally consistent
snapshot during concurrent edits; accounting-grade snapshots are later work.

## Frontend integration

`apiService.js` supplies authenticated REST CRUD, imports, notification operations
and analytics. It fetches the current Supabase session, sends only the bearer token,
and surfaces errors without substituting demo data. `accountService.js` composes
REST financial/notification adapters with existing RLS-scoped profile/preferences
and stored-insight adapters. `/account` opens its live dashboard by default and
provides the subscription form, transaction import/status controls and notification
read/delete controls. Analytics uses all five dashboard/calendar endpoints; every
number shown is returned by the backend. `/app` remains an explicitly separate
local demo with all previous pages. Authentication is not bypassed for live pages.

## Verification and blockers

Backend tests exercise Express HTTP requests using mock principals/repositories,
including CRUD, pagination/filters, owner isolation, invalid inputs, safe errors,
request limits, CORS, rate limits and deterministic calculations. Additional tests
exercise the real repository query builder and mocked Supabase Auth adapter.
Frontend adapter tests cover bearer forwarding, paginated loading, replay headers,
notification paths, expired sessions and unavailable API behavior. PGlite executes
migration 003 with cross-user notification deletion tests. Existing component and
production-browser demo regressions remain required.

No hosted Supabase project or live tokens were available. Before claiming live
integration, apply migrations and verify Auth rejection/expiry, two-user API and
PostgREST isolation, actual CRUD, import replays, notification deletion and a full
signed-in browser flow against the configured project. Tests do not establish
PayPal, AI, webhook or outbound email functionality.
