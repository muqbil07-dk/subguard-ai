# Phase 5 — deterministic subscription intelligence

## Scope and modules

`backend/src/services/intelligence/` contains pure merchant/grouping, detection,
confidence, prediction, anomaly/duplicate, spending and orchestration modules.
Express and database adapters remain separate. No Gemini, LLM, PayPal connection,
bank connection or autonomous financial action is added. All source records are
user-supplied imports; confidence is a heuristic score, not a probability.

## Detection and evidence

Eligibility requires a valid dated, positive, completed debit, supported currency,
merchant and identifier. Pending/failed/cancelled/reversed entries, credits and
future records are excluded. Reliable transaction IDs or batch/row identities
suppress replayed records in analysis; they do not cause transaction deletion.
Reads use the authenticated owner and RLS. Grouping additionally checks an owner
field if provided; currencies and source identities never mix.

Merchant identity uses Unicode NFKC, case folding, whitespace/punctuation cleanup,
known URL wrappers, `.com` and the literal `subscription` suffix/token. Original
names remain in source records and evidence. There is no fuzzy similarity merge
or universal merchant resolution. Unknown descriptors remain separate. Amount
bands use a configurable 10% tolerance; materially different parallel streams
split only when both have repeated observations and overlapping date ranges.
Sequential price changes remain one history. Split identities include the first
observed transaction ID; moving the analysis window can change that identity.

Date-only matching/adjacent charges contribute duplicate evidence, rather than
inflating cadence observations. Frequencies use weekly 6–8, monthly 25–35,
quarterly 80–100, half-yearly 170–195 and yearly 350–380 days. Calendar anchor
alignment further contributes to interval consistency. A dominant frequency must
cover at least 60% of intervals, with at least half the amounts close to the lower
median baseline. One observation is insufficient. Two may suggest a plan, but
confidence is capped at 49. All detections require explicit user confirmation.

Confidence weights: observation count up to 35 points (two=5, three=25, four+=35),
calendar interval consistency up to 25, amount consistency 20, normalized merchant
confidence 10 and frequency stability 10. Classifications are very high 90+,
high 75+, moderate 50+, low below 50. Internal function options configure amount,
interval and classification thresholds; HTTP clients cannot override rules.
The score breakdown, explanation, evidence IDs and rule version are returned.

## Predictions and spending

Weekly dates advance by seven days; calendar cadences advance by one, three, six
or twelve months while preserving the original day anchor. January 31 clips in
February and returns to March 31; leap-year annual anchors clip appropriately.
A stale prediction remains overdue with a negative days-remaining count. Detected expected amounts use the historical lower median, so a flagged new price can differ from that estimate and should be reviewed before confirmation. No code
records an imaginary payment or silently rolls an overdue anchor forward.
Insufficient dates/cadence return an unknown prediction.

The upcoming endpoint combines suggested predictions and active user-maintained
subscription anchors without duplicating their confirmed suggestions. Confirmed
anchors take priority over inferred dates. Last observed completed debit is shown
when available, otherwise null. Stored detection analysis dates are retained, and
countdowns refresh as of the request date. Paused/cancelled tracking and rejected
or invalidated suggestions are omitted. These are estimates, never settled events.

Summary includes currency-specific subscription count, normalized monthly and
annual estimated spending, merchant/category breakdowns and five highest-cost
plans. Monthly calculations use exact BigInt minor units and half-up rounding;
annual totals use exact cadence factors (52/12/4/2/1) rather than multiplying rounded
monthly amounts. No foreign exchange is invented. Changes compare completed net
spending at tracked merchants in current versus prior partial calendar periods,
clipped at month ends. Coverage and period boundaries are explicit. This is not a
historical snapshot of plan prices, usage or contractual savings.

## Anomalies and duplicates

Each charge is compared with up to three prior charges; price-change alerts
require three prior observations, >5% deviation and at least one major currency
unit. Increases and decreases are separate. >50% deviations also create an
unexpected-amount finding. A cadence-established history can flag an out-of-range
interval, such as twelve days in a monthly series. Median baselines, signed
percentage differences, absolute minor-unit differences, evidence and severity
explain each flag. A single unusual charge does not prove a changed contract.

Possible duplicate flags require distinct charge identities, same merchant/source,
currency and amount, on matching/adjacent dates. Date-only evidence is uncertain;
legitimate monthly charges are not duplicates. No record is automatically deleted.
Exact CSV replay prevention remains the existing atomic import RPC and database
unique constraint. Different files without authoritative IDs can overlap; review
is required rather than pretending perfect automatic deduplication exists.

## Storage, idempotency and authorization

Apply `202611100004_intelligence.sql` after migrations 001–003. It extends
subscription cadence with Half-yearly and adds:

- `recurring_detection_suggestions`: typed identity/currency/amount/frequency,
  confidence, state, payload/evidence/prediction, rule version and an optional
  tenant-safe confirmed-subscription foreign key.
- `transaction_anomalies`: both anomaly and possible-duplicate flags, unique keys,
  review status, active flag, evidence payload and timestamps.

Both have UUID keys, owner FKs, unique `(user_id,dedupe_key)`, owner/time indexes,
constraints, timestamp triggers and owner SELECT RLS. Browser roles cannot insert,
update or delete generated evidence. No duplicate merchant-alias table is needed.

Only narrow `persist_intelligence` and `review_recurring` RPCs are executable by
the service role. Their pinned search paths and qualified objects, explicit owner
checks and per-owner transaction lock prevent cross-owner writes and duplicate
confirmation effects. The backend derives owner from verified auth, never a body
field. Ordinary reads/CRUD still use caller RLS. Server-only
`SUPABASE_SERVICE_ROLE_KEY` is optional for startup but required for analysis
persistence and review; absence returns 503, never fake success. Do not place it
in any frontend variable or log. The existing public-key/caller-token path is not
replaced with an unrestricted privileged repository.

Persistence is atomic and idempotent for stable inputs: upserts preserve Confirmed
and Rejected decisions; findings retain review state, and obsolete findings become
inactive rather than disappearing from history. Unsupported unreviewed suggestions
are marked insufficient. Confirmation uses the shared subscription creation
service's validation and an atomic SQL creation variant, so subscription creation
and suggestion linking commit together. Repeated confirmation returns the same
subscription. Rejection retains history. Deleting confirmed tracking clears its
link and does not resurrect it on replay. A similarly named manual subscription
is not silently overwritten; review existing plans before confirming another.

## API and frontend

All endpoints require the existing bearer-auth middleware and support both `/api`
and `/api/v1`. Unknown fields, client ownership and malformed IDs are rejected.

| Method | Path under `/api/intelligence` |
| --- | --- |
| POST | `/detect-recurring`, `/analyze-transactions` (empty JSON body) |
| GET | `/suggestions`, `/suggestions/:id` |
| POST | `/suggestions/:id/confirm`, `/suggestions/:id/reject` (empty JSON body) |
| GET | `/upcoming-payments` |
| GET | `/anomalies`, `/duplicates` |
| GET | `/summary` |

Lists use `page`/`limit` (25 default, 100 maximum) with `{data,pagination}`; upcoming
also accepts optional ISO `from`/`to` and currency. Analysis POST returns counts,
window/rule metadata and persistence status; large evidence is retrieved through
paginated lists. Suggestions return typed database fields plus the versioned
payload. Upcoming filters precede pagination. Summary returns one entry/currency.

The existing `/account` dashboard includes `IntelligencePanel`: explicit analysis,
paged suggestions and explanations, confirm/reject, anomalies, duplicate review,
confirmed spending estimates and predicted payments, with loading/empty/error
states. Mutation success refreshes the account summary. The separate `/app` local
demo is preserved and is never used as a live-data fallback. Half-yearly is
supported in the existing subscription form and monetary helpers.

## Validation and limitations

Backend tests cover the required Netflix/Spotify examples, low evidence, price
increase/decrease, unexpected amounts, irregular timing, duplicates/replay, owner
and currency separation, month-end/leap/annual/stale behavior and HTTP security.
PGlite executes all migrations and tests RLS/privilege denial, persistence replay,
confirmation, rejection history and deleted tracking. These are local PostgreSQL
semantics with a stub Auth schema, not hosted Supabase integration. SDK/HTTP mocks
and UI tests do not prove live tokens or database access. No credentials are
available; migrations and live two-user/end-to-end checks remain outstanding.

Analysis scans a database-filtered five-year window with exact-count pagination,
maximum 10,000 transactions; it errors rather than silently truncating. Prediction
and summary source tables are also bounded to 10,000 records each. Batch writes
avoid per-finding database round trips. Algorithms are advisory heuristics:
merchant normalization can be ambiguous, usage cannot be inferred, date-only data
cannot prove two charges happened within an exact 24-hour interval, and sparse
annual history remains uncertain. Import refunds lack reliable original-charge
links in the current schema, so linked reversal reconciliation is not invented.
Concurrent source edits across paginated reads are not an accounting snapshot;
rerun after imports/corrections. Disjoint cadence streams with identical merchant
and amount can remain ambiguous. No guaranteed accuracy, refunds, cancellation,
financial protection, live bank feed or Gemini feature is claimed. Phase 6 is not
started.
