# API documentation

## Status and boundary

This is the Phase 1 contract for the future Express REST API. **No endpoints,
authentication middleware, payment calls, webhooks, or database migrations are
implemented by this foundation.** Examples describe proposed shapes, not observed
responses. Build and test each contract in the phase identified in
[the development plan](DEVELOPMENT_PLAN.md).

The browser will use Supabase Auth for sign-in and the backend for application
data, financial calculations, PayPal operations, and AI requests. The API base
path is `/api/v1`. A deployment may expose that path through the frontend's
origin; otherwise allow only configured frontend origins through CORS. CORS is
not authorization. Use HTTPS outside local development.

## Authentication and ownership

1. The React client initializes Supabase Auth using `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`. These public configuration values do not grant
   privileged database access. `VITE_API_BASE_URL` selects the application API.
2. Protected requests send `Authorization: Bearer <Supabase access token>`.
   The server validates the signature through the project's trusted JWKS,
   configured issuer, audience, allowed algorithm, and expiration. It must never
   accept unsigned tokens, trust decoded claims without verification, or derive
   a JWKS URL from an untrusted token. Configure the Supabase project for signing
   keys compatible with JWKS; legacy symmetric signing requires a separately
   reviewed server-only verification configuration.
3. The verified `sub` identifies the user. No ordinary request may select an
   effective user through a body field, URL query, or PayPal metadata. Strict
   schemas reject unexpected ownership fields rather than silently trusting them.
4. Ordinary reads and editable CRUD use the project's publishable key and the
   caller's token so Supabase RLS applies, together with server-side owner filters.
   Never reuse a mutable authenticated database client between concurrent users.
   Derived ingestion/intelligence writes use narrowly scoped privileged backend
   adapters after authentication. They propagate the verified principal, repeat
   ownership checks inside database operations, and do not expose generic
   privileged CRUD to users or allow direct client writes to derived evidence.
5. Payment operations that access `private.paypal_orders` use an isolated payment
   adapter. It authenticates first and explicitly constrains every lookup/update
   by verified user ID, environment, and operation. Background webhook/outbox
   workers use similarly narrow access. The nonexposed private schema is reached
   through service-only gateway RPCs in an exposed schema: revoke `EXECUTE` from
   public, `anon`, and `authenticated`; grant it only to the service role. Pin
   each gateway function's `search_path`, fully qualify referenced objects, and
   enforce principal/resource checks within the function. No privileged key
   reaches the browser or general request database client; private tables have no
   grants to `anon` or `authenticated` and are not exposed through the Data API.
6. For an absent or another user's object, return `404` without revealing its
   existence. Routes explicitly requiring an unavailable role may return `403`.

Authentication routes such as sign-up, sign-in, token refresh, and password reset
belong to Supabase Auth; do not implement a parallel password database. Configure
redirect allowlists and verify auth flows in Phase 3. Apply token-aware rate limits
and request timeouts independently of RLS.

## Shared data contracts

| Field | Contract |
| --- | --- |
| IDs | Opaque UUID strings for internal resources; provider IDs are distinct opaque strings. |
| `amountMinor` | Nonnegative decimal integer **string**, backed by PostgreSQL `bigint`; for example `"1299"` with USD means USD 12.99. Validate upper bounds. Never pass money through JavaScript floating-point arithmetic. |
| `currency` | Supported ISO 4217 uppercase code. Use the configured currency exponent; not all currencies have two decimal places. Reject unsupported currencies. |
| `direction` | `debit` or `credit`; amount is never signed. Refunds/credits remain distinct records linked to the original where known. |
| `status` | Resource-specific allowlisted state. Analytics use eligible settled transactions and reconcile refunds; pending/failed transactions do not become confirmed spend. |
| Time | RFC 3339 UTC instants, e.g. `2026-11-09T12:00:00Z`. User-selected renewal calendar dates use `YYYY-MM-DD` plus IANA time zone. Preserve original ingestion precision. |
| Provenance | Source type, source reference, detection rule version, and supporting transaction IDs where applicable; source ownership is checked server-side. |
| Confidence | A bounded `0..1` heuristic score and explanation/evidence, not a calibrated probability or guarantee. Low confidence candidates require user review. |
| Totals | Group by currency; no cross-currency total without an explicit exchange-rate source and valuation timestamp, deferred from the MVP. |

The API uses camelCase JSON; database columns use snake_case. Response DTOs allowlist
fields so tokens, private event bodies, and other users' data cannot leak through
serialized database rows. Collections return `{ "data": [], "nextCursor": null }`.
Object responses use `{ "data": { ... } }`. Cursor pagination uses stable ordering
such as `(original_local_date, id)` for transactions (including date-only imports),
applies ownership before pagination, defaults to 25,
and caps `limit` at 100. A cursor must be validated and cannot bypass filters.

Reject malformed JSON, invalid dates, oversized bodies/files, unknown fields,
unsupported content types, and values outside configured bounds. Use parameterized
database operations and allowlisted filters/sort fields. Standard JSON requests
should have a small explicit size limit; CSV ingestion has a separate bounded limit
and must not inherit an unlimited upload path.

Errors use this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "currency must be a supported ISO 4217 code",
    "requestId": "opaque-request-id"
  }
}
```

| HTTP status | Intended use |
| --- | --- |
| `200` / `201` | Completed read/update or resource creation. |
| `202` | Work is durably queued; not proof that ingestion, intelligence, or payment settlement completed. |
| `400` | Invalid input, malformed pagination, or invalid webhook signature. |
| `401` | Missing, expired, or invalid bearer token. |
| `403` | Authenticated actor lacks a required capability. |
| `404` | Resource unavailable to the caller. |
| `409` | Idempotency payload mismatch or invalid resource state transition. |
| `413` / `415` | Payload too large / unsupported content type. |
| `422` | CSV row validation failed; return safe row diagnostics and insert none of the batch. |
| `429` | Rate limited; return `Retry-After` where known. |
| `502` / `503` | External provider failure or temporary unavailable dependency; no invented success response. |

Log a safe request ID, route, latency, and error category. Never return stack
traces, raw provider bodies, financial uploads, prompts, or credential values.

## Planned route surface

All routes below are prefixed by `/api/v1`. “User” means verified Supabase JWT plus
ownership enforcement. Routes are deliberately limited to a complete MVP.

| Method and route | Access | Input and processing | Output |
| --- | --- | --- | --- |
| `GET /health` | Public, rate limited | Process liveness only; no provider calls or secret details. | `200` with minimal service status. |
| `GET /me` | User | Read own `profiles` record. | Profile, currency preference, time zone. |
| `PATCH /me` | User | Allowlisted display/preferences only; validate currency and time zone. | Updated own profile. |
| `GET /dashboard` | User | Optional bounded date range; aggregate authorized eligible transactions, active subscriptions, renewals, alerts by currency. | Totals plus freshness, provenance, uncertainty, and empty states. |
| `GET /data-sources` | User | List owned sources with origin and ingestion freshness. | Source IDs and safe metadata; no credentials. |
| `POST /data-sources` | User | Create a `manual_import` source with a display label. No other source types are enabled in the MVP. | `201` owned source ID for subsequent imports. |
| `GET /transactions` | User | Cursor, date bounds, supported currency/status, owned source. | Paginated normalized transactions with direction/provenance. |
| `POST /transactions/imports` | User, batch idempotency key | Bounded CSV multipart upload, owned `manual_import` dataSourceId, explicit column mapping/date convention; no remote URL fetching. Validate every row before an atomic normalized batch commit through the ingestion adapter. | `201` accepted/skipped-replay counts with rejected count `0`; `422` safe row diagnostics with no inserted rows if any row is invalid. |
| `GET /subscriptions` | User | Cursor, currency, allowlisted status. | Confirmed subscriptions and review candidates clearly distinguished. |
| `POST /subscriptions` | User | Manual merchant label, amount/currency, cadence, next local renewal date/time zone; no fabricated transaction record. | `201` manual subscription with manual provenance. |
| `GET /subscriptions/:id` | User | Owned subscription ID. | Subscription, linked evidence, latest prediction and uncertainty. |
| `PATCH /subscriptions/:id` | User | Editable label, reviewed cadence/amount/date, candidate confirmation/dismissal, or tracking status. Optimistic version check prevents lost updates. | Updated subscription; mark overrides separately from detected evidence. |
| `POST /intelligence/runs` | User, bounded | Optional owned source scope; run deterministic rules on eligible imported transactions. Persist run/version/evidence atomically through the intelligence adapter for the bounded MVP data size. | `201` completed `detectionRunId` and created/updated candidate, prediction, and alert counts. |
| `GET /renewals` | User | Local date range and currency. | Predicted dates/windows, amount/currency, evidence and confidence; never a promised future charge. |
| `GET /alerts` | User | Cursor and allowlisted alert/read status. | Price-change and duplicate-charge candidates with evidence and review status. |
| `PATCH /alerts/:id` | User | Mark read, dismissed, or reviewed; preserve original evidence. | Updated alert, without changing underlying transactions. |
| `GET /notifications` | User; Phase 8 | Cursor and read/unread filter; list owned in-app notifications. | Paginated notification summaries and read state. |
| `PATCH /notifications/:id` | User; Phase 8 | Update read state only; never accept new notification content from clients. | Updated owned notification read state. |
| `GET /recommendations` | User | Currency and cursor. | Deterministic savings opportunities with assumptions; optional separately labeled AI explanation. |
| `POST /assistant/messages` | User, stricter quota | Bounded message, stateless MVP with no saved conversation. Scope retrieval to caller, redact sensitive fields, use provider adapter; no payment tools. | Answer, authorized evidence references, provider/availability metadata; explicit unavailable response if no provider configured. |
| `POST /paypal/orders` | User, idempotency key | Server allowlists a sandbox demo item and computes its amount/currency; client chooses only item ID. Create an own-merchant PayPal order. | `201` local order ID, provider order ID, status and provider approval URL. |
| `POST /paypal/orders/:id/capture` | User, idempotency key | Local order ID; check ownership, sandbox environment, approved state and expected amount/payee; capture through server API. | Actual provider capture status, possibly pending, saved in private payment state; never added to the customer's spending ledger. |
| `POST /webhooks/paypal` | Public transport, provider verification | Provider headers and bounded event JSON; verify authenticity, then durable deduplicated inbox insertion. | `200` after accepted durable verification; background processing is separate. |

Import rules: a source must be an owned `manual_import` source. Require a batch
`Idempotency-Key` scoped to owner and source, with a payload digest. Exact replays
deduplicate by persisted batch identity plus row identity; a key reused with a
different payload returns `409`. Content fingerprints can identify overlapping
imports for review, but must not automatically deduplicate distinct purchases.
Merchant/date/amount alone is not a safe unique key. Keep the original source
reference and parsing choices. Uploads are not bank-verified data. Bound MVP
imports so validation and database commit complete within request limits; larger
async imports are a future contract. Reject ambiguous dates and unsupported currency
values. Imports are all-or-nothing: any invalid row returns `422` with safe row
diagnostics and no batch transaction inserts. A successful `201` reports accepted
and skipped exact-replay counts, with rejected count `0`; no partial import mode.

Editing a subscription changes SubGuard tracking only. It does not cancel an
external merchant subscription or stop charges. Deleting account data and erasure
workflows must be designed with retention obligations before real users are enabled.

For intelligence, the initial synchronous run is bounded by a configured dataset
limit. On exceeding it return an explicit limit error; do not return a successful
partial run. Repeated runs with unchanged inputs and rule versions must update or
reuse existing outputs without multiplying alerts. Computation and its output
commit complete before the synchronous response. Optional automated scheduling
can later use the same service adapter via an outbox worker; an asynchronous HTTP
contract needs a durable status resource before being offered.

## Mutation idempotency and PayPal order lifecycle

PayPal create/capture routes require `Idempotency-Key`. Scope it by verified user,
environment, and operation, and store a request digest plus outcome in
`private.paypal_orders` (separate create/capture fields for the bounded MVP). Enforce
uniqueness in the database, not an in-memory map. Reusing a key with a different
digest returns `409`. Replaying the same completed operation returns the recorded
result; concurrent/in-progress attempts cannot issue a second provider mutation.

Map each operation to a persisted `PayPal-Request-Id` where the specific PayPal
endpoint supports it. Confirm that endpoint's retention window and behavior during
implementation. Never assume provider deduplication is permanent. After a timeout,
reconcile the known order/capture through the provider before retrying; an ambiguous
response is not payment failure or success. Record state transitions, not browser
redirect assertions. Verify payee/merchant, environment, currency and amount against
the locally authorized intent before any payment-state transition. The worker and
capture response can describe the same capture: a provider capture identifier
deduplicates updates in `private.paypal_orders` across both paths. These own-merchant
sandbox checkout payments are not the customer's subscription expenses and never
create `transactions` spending-ledger rows or feed recurring-spend detection.

User approval uses the provider's real approval URL and sandbox buyer account.
Return/cancel URLs are server-configured allowlisted values; the browser cannot
supply arbitrary redirects. Neither the return URL nor an order-created event is
proof of payment. Never auto-capture because an LLM or client claims approval.

## Verified webhook protocol

1. Accept only the supported content type and bounded JSON. Keep the received
   event intact for verification; retain raw bytes transiently for diagnostics or
   any selected verification method. Do not apply business transformations first.
2. Require PayPal's transmission headers: `PAYPAL-AUTH-ALGO`,
   `PAYPAL-CERT-URL`, `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-SIG`, and
   `PAYPAL-TRANSMISSION-TIME`. Reject missing or malformed fields.
3. Use the sandbox app's server-only OAuth credentials and configured
   `PAYPAL_WEBHOOK_ID` with PayPal's
   `POST /v1/notifications/verify-webhook-signature`, sending the required header
   values and the received `webhook_event`. Accept only a successful HTTP response
   whose `verification_status` is `SUCCESS`. TLS verification stays enabled. Do
   not fetch a caller-supplied certificate URL as an arbitrary network request.
4. Invalid authenticity returns `400`; verification service unavailability returns
   retryable `503`. Neither path mutates financial data or marks an event processed.
   Apply request/rate limits without allowing unauthenticated claims to claim
   inbox event IDs and poison deduplication.
5. After verification, atomically insert `private.webhook_events` with unique
   `(provider, environment, provider_event_id)`, processing state and retry metadata. Record
   only minimally necessary protected payload, with a retention policy. A database
   failure returns retryable `503`. An already durably stored, verified duplicate
   can receive `200`; it must not rerun completed financial effects. A conflicting
   digest for an existing event ID is quarantined and investigated.
6. Return `200` once the verified event is durable, then have a worker claim it
   with a lease and process idempotently. Verification does not establish which
   SubGuard user owns the resource. Resolve ownership through the server's known
   PayPal order/capture mapping; never trust webhook-supplied `user_id`, payer
   email, or arbitrary custom metadata as authorization. Unknown resources are
   quarantined for reconciliation, not assigned to an arbitrary user.
7. Allowlist handled event types from the configured app registration. Reconcile
   necessary provider resources and validate merchant, currency, amount, and
   status. Delayed/out-of-order events must not regress settled state or erase
   refunds. Commit private order/capture state, inbox state, and any notification
   outbox records in one database transaction; do not create spending-ledger rows
   from own-merchant checkout events. Retry transient failures with backoff and bounded
   attempts; exhausted jobs remain visible for operator repair and safe replay.

PayPal's webhook simulator is not proof of an actual payment or of successful
verification for an app-generated event. Use actual sandbox payment events for the
end-to-end acceptance check. Local fixtures are isolated test inputs, explicitly
labeled synthetic, and never inserted as real provider payment evidence. No
production or demo path may bypass verification or manufacture payment events to
make the dashboard appear populated.

## External requirements and limitations

- Supabase project URL, publishable key, configured Auth/JWKS, database migrations,
  RLS/grants and allowed auth redirect URLs are required before user data works.
- PayPal Sandbox requires a developer app, merchant sandbox account, separate
  sandbox buyer account, client ID/secret, supported checkout capability, and
  webhook registration pointing to a publicly reachable HTTPS URL. Obtain the
  webhook ID and subscribe only to event types actually handled. Confirm current
  account/region/API eligibility and integration requirements before implementation.
- The planned integration uses Orders v2 for payments made through **SubGuard's
  own sandbox merchant app**. It does not provide universal access to a customer's
  PayPal wallet history, external merchants, bank accounts, or card transactions.
  Partner/merchant permissions and reporting capabilities are separate products,
  subject to approval; they are outside the MVP contract. Recurring detection uses
  explicitly imported data until a separately authorized connector exists.
- PayPal OAuth tokens, client secrets, webhook IDs, Supabase privileged credentials,
  and AI provider credentials stay server-side. `VITE_*` variables are public bundle
  contents. Do not log tokens or commit real `.env` values.
- An AI provider is optional until Phase 6. Its adapter must enforce timeout,
  cost/token limits, scoped retrieval, and privacy review. No model output may
  replace deterministic amounts, charge classification, or payment authorization.

## Acceptance checks to implement

These are planned checks, **not executed test results**:

- Contract validation rejects malformed values, unknown ownership fields, invalid
  currencies, unsafe totals, oversized uploads, and inconsistent idempotency keys.
- User A cannot read or mutate User B's records, including guessed IDs, pagination,
  foreign-key links, private PayPal routes, or assistant retrieval. Exercise direct
  Supabase Data API access separately to validate RLS and grants.
- Invalid JWTs, disallowed origins and rate-limited clients receive documented
  errors without secret-bearing logs. CORS never substitutes for authentication.
- Real sandbox create → buyer approval → capture → verified webhook persists one
  completed sandbox capture/order state, with zero spending-ledger inserts, even
  with duplicate delivery, concurrent capture, timeout, retries, unknown resource
  IDs, and out-of-order events. Signature failure causes no financial effects.
  Record provider IDs and timestamps as evidence safely.
- Database outages between inbox receipt, financial commit, and notification
  delivery produce safe retries without duplicate accounting effects. AI outages
  leave deterministic insights accessible and assistant availability explicit.

See [architecture](ARCHITECTURE.md) for service boundaries and
[database design](DATABASE_DESIGN.md) for proposed constraints and policies.
