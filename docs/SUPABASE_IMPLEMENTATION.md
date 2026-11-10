# Phase 3: Supabase persistence and Auth

Phase 4 now routes financial and notification operations through Express; see
[backend handoff](BACKEND_IMPLEMENTATION.md). The account behavior described below
records the Phase 3 implementation and database security contract.

This change adds executable migrations and SDK integration, not a provisioned
Supabase project. No credentials are bundled. The original `/app` remains the
isolated local demo. `/account` is a protected, database-backed workspace using
existing UI components and SubscriptionForm, with no seed fallback or local
financial storage. Authentication screens redirect successful sessions there.
The focused account workspace deliberately has no protection score or fabricated
AI insights. The full dashboard will consume authoritative backend DTOs in Phase 4.

## Configure and apply

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in ignored
`frontend/.env.local`. The existing publishable-key name is supported as an alias.
Restart Vite after configuration changes. Only the public key belongs here.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` remain backend-only requirements in
`backend/.env.example`; the frontend never reads them.

Apply the two files in `database/migrations/` in timestamp order with a trusted
Postgres migration runner or the Supabase SQL editor on an isolated project.
They are transactional and must be applied once, with migration history retained.
Back up existing project data before deployment. Configure Supabase Auth site URL
and redirect allowlist for `/account` and `/reset-password` on the chosen frontend
origin. Enable email confirmation and a production email provider as appropriate;
configure password strength, abuse/rate limits and project signing keys.

The SDK uses PKCE, refreshes sessions, detects auth return links, and persists its
session using Supabase's browser storage. This exposes bearer credentials to XSS:
avoid unsafe HTML, deploy a restrictive CSP and HTTPS, and never log tokens.
Logout propagates through the auth subscription; each account mount is keyed by
user ID. Database services call `getUser()` and scope every ordinary query to that
verified owner, in addition to database RLS. A failed session never opens demo data
as a substitute. Registration may return no session pending email confirmation.
Password reset requests show a generic success only after Supabase accepts the
request; actual email delivery still requires provider validation. The recovery
page uses `updateUser` and requires a valid SDK session; missing/expired links error.

## Schema and security

`202611090001_core.sql` creates profiles, user_preferences, subscriptions,
transactions, notifications, ai_insights and private.paypal_webhook_events.
UUID keys, ownership FKs, exact minor-unit amounts, currency/status/cadence checks,
indexes and timestamp triggers are included. Auth insertion creates profile and
preferences transactionally; existing users are backfilled. Profile email is an
Auth-derived display snapshot, not a separately editable identity. Account date
comes from created_at. Email-change synchronization is future work.

RLS covers all public owned tables. Subscriptions and manually imported
transactions have owner SELECT/INSERT/UPDATE/DELETE policies with WITH CHECK;
ownership cannot be reassigned to another user. Profiles/preferences are read and
narrowly updated; notifications and insights are read-only except read_at/dismissed
column grants. Browser clients cannot manufacture notification/insight evidence.
Private webhook receipts have no browser grants or policies; no webhook processor
or unverifiable sample events are added. Service-role bypass is never used in UI.

`202611090002_atomic_import.sql` adds private-to-clients import receipt storage
and a bounded transactional import RPC. It derives owner from auth.uid(), pins
search_path, qualifies tables, locks batch replays, rejects changed payloads and
rolls back the entire invalid batch. The UI hashes exact CSV bytes for the batch
key. Distinct overlapping files remain separate; no claim of perfect deduplication
without stable provider IDs. Source is constrained to user CSV imports; own-merchant
PayPal receipts never enter spending. Direct transaction CRUD is deliberately
allowed for user-supplied records in this phase. This is a documented bounded
exception to Phase 1's server-only ingestion plan until Phase 4 adds the REST API.
No derived intelligence or provider evidence is client-writable.

The frontend DTO uses existing camelCase subscription fields and minor-unit strings;
typed database columns are snake_case. Demo helpers remain separate. Date-only
imports remain SQL dates. Quarterly maps directly to a validated cadence rather
than silently treating it as monthly. Production detection-run/source/outbox tables
from the broader design are deferred; the user-requested seven core tables and
one import receipt table are implemented now.

## Validation and remaining live checks

Vitest executes the migrations in PGlite PostgreSQL with a stubbed auth schema and
anon/authenticated roles. This exercises actual SQL constraints, grants, RLS,
cross-owner read/write/ownership-forgery denial, private evidence access denial,
profile provisioning and atomic import/replay rollback. This is not hosted
Supabase: its PostgREST, JWT gateway, email service, storage and auth servers are
not represented by that harness. Mockable SDK adapter tests cover credential
absence, registration, login, logout, session retrieval, reset errors, scoped
queries and ownership stripping. Existing frontend/component and production
browser regression suites must continue passing.

Before claiming live readiness, supply public project settings securely and run:
registration with actual email confirmation; login, refresh/reload and sign-out;
password recovery with a real link; subscription and transaction CRUD; two-user
PostgREST isolation and anonymous denial; import replay and invalid batch rollback;
notification/insight read-only evidence checks. Verify migrations against the actual
Supabase version and grants. No live project or email delivery is claimed by the
current credential-free tests.
