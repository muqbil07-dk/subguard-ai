# Phase 6 — Gemini financial intelligence

## Implementation and boundaries

The backend uses the current official Google Gen AI JavaScript SDK,
`@google/genai` **3.0.0**, verified against npm and Google's maintained
[SDK README](https://github.com/googleapis/js-genai) and the installed TypeScript
interfaces. It supports Node 22+, compatible with this project's Node 24.
`@google/generative-ai` is not used. No model identifier is hardcoded: availability,
account access, region and model lifecycle differ, so an enabled deployment must
select `GEMINI_MODEL` explicitly and verify metadata through `models.get`.

Gemini selects relevant backend evidence and recommendation IDs through supported
function calling, then returns JSON using `responseMimeType` and
`responseJsonSchema`. Function-call thought signatures are retained in the next
turn. `services/ai/` separates provider access, context, assistant orchestration,
prompts, validation, recommendations, score calculation, safety and narratives.

Deterministic services own totals, dates, anomaly types, suggestions and financial
decisions. No AI response can write financial tables, execute SQL, initiate
payments or cancel a merchant agreement. AI writes are limited to validated chat
history and user-controlled dismissal records. The isolated `/app` demo and its
unavailable assistant remain unchanged; authenticated `/account` has a separate
AI Assistant view. Phase 7 reliability/security QA results and remaining live
validation limits are in [PHASE_7_QUALITY_ASSURANCE.md](PHASE_7_QUALITY_ASSURANCE.md).

## Configure and run

1. Create/select an appropriate Google project and obtain a Gemini API key from
   [Google AI Studio](https://aistudio.google.com/apikey). Review Google's current
   billing, regional availability, data retention and model terms before using
   real financial data. Restrict the key to the required Gemini service.
2. In ignored `backend/.env` or deployment secret storage, configure:

   ```dotenv
   AI_ENABLED=false
   AI_PROVIDER=gemini
   GEMINI_API_KEY=
   GEMINI_MODEL=
   ```

   Empty values are placeholders, not working credentials. Never use `VITE_`
   variables for Gemini or Supabase service-role secrets.
3. Keep the existing Supabase URL/public key and exact frontend origin configured.
   Apply migrations **001 through 005** on an isolated Supabase project. Chat
   persistence and paid-request quota RPCs also require the server-only
   `SUPABASE_SERVICE_ROLE_KEY`. Ordinary reads still use the caller's JWT and RLS.
4. List accessible models with `cd backend && npm run ai:models`, using the key
   securely from environment settings. Select an available model supporting content
   generation, function calling and JSON structured output. Set its exact name in
   `GEMINI_MODEL`, then set `AI_ENABLED=true`. Missing enabled configuration fails
   startup validation. Remote metadata is checked at startup; a provider outage or
   rejection logs only a safe code and leaves the deterministic API available.
5. Run `npm start` in `backend` and `npm run dev` in `frontend`. Frontend uses
   `VITE_API_BASE_URL`, never a Google URL or key. Login and open Account → assistant.
   The interface discloses that limited facts and questions are sent to Google.
6. Phase 8 guards `npm run ai:smoke` behind explicit `ALLOW_LIVE_VALIDATION=true`.
   It checks metadata/function calling/structured responses against three synthetic
   financial scenarios with deterministic expected facts (at most six generation
   requests plus metadata). It prints only scenario status or safe error codes;
   no Supabase or customer records are used. Follow
   [STAGING_LIVE_VALIDATION.md](STAGING_LIVE_VALIDATION.md) before opting in.

These two scripts require actual credentials and were **not run live** in this
phase. The environment had no Gemini or Supabase variables or usable bindings.
If egress is restricted, allow the configured Supabase project hostname and
`generativelanguage.googleapis.com` through environment settings, preserving other
rules and supplied TLS/proxy trust. Never disable certificate verification.

With AI disabled, no Google client requests occur. Chat returns `AI_DISABLED`;
recommendations and waste score still return deterministic evidence with an
unavailable-explanation warning. Auth, CRUD, dashboard and Phase 5 remain usable.

## Context and read-only operations

`financialContextBuilder` receives the authenticated request's owner-scoped
repository; no body or model argument chooses a user. It reuses Phase 4/5 recurring
summary, spending, upcoming prediction, monthly normalization and evidence rather
than asking Gemini to recalculate. Relevant reads follow the question/purpose and
recent user questions. Source tables use existing exact-count pagination and a
10,000-record/table ceiling; transaction context is restricted to the past year.
Over-limit datasets error instead of silently reporting partial totals.

Aggregates remain separated by currency. Individual projection is capped at
20 plans, 10 findings, 10 predictions and 5 suggestions, with a 24 KB serialized
provider-context ceiling. Original imported merchant/descriptive text, raw
transaction histories, user IDs, email, account numbers, credentials and tokens
are not sent. The provider receives aliases, backend-computed question-match indicators and hashed evidence IDs; real human
labels are rendered from backend facts after credential-like strings are redacted.
Per-row limitations and aggregation coverage are disclosed.

Approved function names include `getFinancialSummary`, `getSubscriptions`,
`getUpcomingPayments`, `getAnomalies`, `getDuplicateFlags`,
`getSubscriptionSuggestions` and `getSpendingTrends`, only when relevant data exists.
Functions accept empty objects, read only the preauthorized projection and have
no side effects. The model cannot add a user ID, SQL, query filter or new operation.
Unknown calls, nonempty arguments and more than four calls are rejected. There is
one tool-selection generation and one final structured generation, with no
unbounded autonomous loop. Only facts actually returned by approved calls may be
cited. Questions about the next week restrict predictions to today through seven
calendar days, inclusive; no overdue or later-month charges enter that window.

## Response accuracy: bounded narrative mode

Free-form financial prose cannot be proven correct with a regex blacklist. This
implementation therefore deliberately uses a **finite, vetted guidance vocabulary**
for answer, summary, warnings and recommendation explanations. Gemini chooses the
appropriate wording, relevant facts and supported next steps; it cannot compose
new factual claims. The vocabulary and JSON enum schema are in `narratives.js`.
This is more constrained than an unrestricted chatbot and is an explicit accuracy
tradeoff, not a claim of general financial reasoning.

The validator rejects malformed/oversized JSON, extra fields, unsupported prose,
unknown facts/recommendations, and recommendations without selected supporting
facts. Amounts, merchants, dates, usage flags, prediction status, currencies and
savings are attached by backend lookup, not accepted from model copies. Typed
React components format those immutable values. No HTML or executable content is
rendered. Confidence is a backend-derived `limited`/`grounded` reference label,
not a model probability or guarantee; absent evidence stays limited.

Returned structure: `answer`, `summary`, canonical `keyFacts`, canonical
`recommendations`, canonical `evidence`, backend/model-safe `warnings`, derived
`confidence`, and server `generatedAt`. Each fact identifies kind, basis, as-of
date, amount/currency/date where applicable, and whether it is predicted. A
predicted renewal is never printed as a completed transaction. Prior assistant
prose is not reused as financial truth; only the last four redacted user questions
are sent as conversational context.

## Recommendations and waste score

Backend candidates identify user-marked unused active plans, a limited set of
high-cost confirmed plans to review, and active Phase 5 billing/duplicate signals.
High cost does not imply disuse or unnecessary spending. Gemini can explain/select
these candidates but cannot invent a recommendation or savings amount.

Only explicitly marked unused **confirmed** plans receive potential savings:
monthly normalization uses exact BigInt/half-up arithmetic and annual amounts use
cadence factors. Assumptions explain that cancellation must be performed with the
merchant, fees/timing may differ, and savings are not confirmed or guaranteed.
Unverified price/duplicate signals have no invented refund/savings value. Dismissals
are owner-scoped and respected in recommendations and chat context.

Waste score is reproducible: `floor(80 × explicitly-unused-active / all-active)`
plus `min(20, 5 × active unreviewed findings)`, capped at 100. Factors and evidence
are returned. Categories are low known priority below 25, moderate below 60 and
high at 60+. No active plans yields `insufficient_data` and a null score. Cost
alone does not affect the score. Budgets, usage telemetry and user-verified feature
overlap do not exist in the current schema and are not invented. Zero means no
known signals, not proof of efficient spending. Optional Gemini guidance cannot
change the score. Raw findings remain advisory rather than confirmed billing errors.

## Persistence, ownership and retries

Migration `202611100005_ai_conversations.sql` adds `ai_conversations`,
`ai_messages`, `ai_recommendation_dismissals`, and private `ai_request_usage`.
Conversations have owner CRUD policies with limited column grants; messages are
owner-readable but browser clients cannot forge user/assistant writes. A composite
owner/conversation FK prevents cross-user links, and ordered identity sequences
keep atomic user/assistant pairs chronological. Limits bound titles, messages,
JSON metadata and structured responses. Conversation deletion cascades messages.

Service-only, pinned-search-path RPCs append a complete accepted turn and reserve
usage. They derive no permissions from the model. RPCs recheck owner/conversation
mapping and lock rows. A client request UUID plus unique turn/role keys make saved
turn retries idempotent; changed content under the same key conflicts. HTTP retries
return stored responses without another generation when the turn is already saved.
The browser retains its request UUID after a failure and never displays an
optimistically fabricated assistant answer. Truly concurrent identical in-flight
requests can still perform duplicate generation before the first commit; stored
history remains deduplicated and quotas bound the work.

Redaction removes common keys, bearer/JWT tokens, credential assignments, email
and long identifiers before provider use or chat storage. It is defense in depth,
not a universal secret detector. Users must not enter credentials or bank details.
Only sanitized questions and validated structured replies are stored, never system
prompts or SDK credentials. A production rollout needs a documented provider data
policy, user disclosure/consent, retention schedule, backup/deletion policy and
appropriate jurisdictional review. A scheduled history-retention job is not added
by this phase; users can delete conversations explicitly.

## Routes, quotas and failures

All routes inherit bearer verification, RLS scoping, JSON limits and safe errors;
`/api/v1` aliases are supported.

| Method | Path under `/api/ai` |
| --- | --- |
| POST | `/chat` — conversationId, message (3–1000 chars), optional requestId UUID |
| GET / POST | `/conversations` — owner list/create |
| GET / DELETE | `/conversations/:id` — paged messages/delete |
| POST | `/insights/explain` — owned active Phase 5 insightId |
| GET | `/recommendations` |
| GET | `/waste-score` |
| POST | `/recommendations/:id/dismiss` |

List/history use `page`/`limit`, max 100 and response `{data,pagination}`. Message
page one is the latest page, reversed into chronological order for display.
API operations return `{data:...}` and safe `{error:{code,message,requestId}}`.

The AI namespace has a per-user 20/minute in-memory HTTP limit. A PostgreSQL
row-locked reservation enforces **5 paid-work attempts/minute and 50/day per user**
across backend instances, resetting on UTC boundaries. Each attempt can generate
at most twice. Failed attempts count; cache hits and saved retries do not reserve
another paid attempt. No automatic SDK retries occur (attempts=1), avoiding
surprise paid duplication. Users can retry suitable transient failures. Unchanged
non-chat explanations cache for five minutes with a bounded 200-entry owner-scoped
cache. Model lookup is cached after success.

Model HTTP calls use 10-second timeouts, the generation chain has a 22-second
abort budget, and assistant explanation orchestration has a 40-second total
budget. Backend persistence calls time out at 10 seconds; the browser AI timeout
is 60 seconds rather than the ordinary API's 15 seconds. Cancellation cannot
promise cancellation of provider billing after an accepted request.

Useful errors include `AI_DISABLED`, `AI_CONFIGURATION`, `AI_MODEL_UNAVAILABLE`,
`AI_QUOTA`, `AI_TIMEOUT`, `AI_INVALID_RESPONSE`, `AI_UNGROUNDED` and
`AI_TOOL_REJECTED`. Keys, prompts, raw provider errors and financial payloads never
enter request logs. Check model access/configuration for 400/401/403/404,
Google billing/quota and local limits for 429, and network/model health for
503/504. Deterministic evidence is returned on optional explanation failure;
chat failure is an explicit error, never a canned answer passed off as Gemini.

## Validation status and remaining live checks

Tests use mocked SDK responses for provider/function/error behavior, actual Express
HTTP requests with mock principals/repositories, PGlite PostgreSQL for migration,
RLS/FK/quota/atomicity/retry behavior, and component/browser regressions. They cover
unsupported amounts/dates and semantic assertions, evidence ownership, currency
boundaries, prompt injection data, wrong tools/arguments, quota and timeout failures,
no expensive-means-unused inference, unavailable AI and saved-history rendering.
Passing counts belong in the delivery report.

**Live Gemini and hosted Supabase have not been verified.** Before production,
run the live synthetic Gemini smoke, migrate an isolated Supabase project, perform
real two-user Auth/API/RLS tests, verify conversation/recommendation workflows with
the configured model and keys, and review model terms and privacy disclosures.
Context truncation, incomplete imports, heuristic Phase 5 flags and limited
conversation context remain explicit limitations. No banking authority, guaranteed
savings, professional advice, autonomous payment or Phase 7 functionality is claimed.
