# Phase 2 frontend handoff

## Implemented scope

The approved Phase 1 architecture is retained. The React/Vite JavaScript SPA uses
Tailwind CSS 4, React Router, Recharts, Lucide React and Framer Motion with pinned
dependencies. Route-level code splitting and separate chart/motion chunks keep
the marketing and application entry points manageable. The build uses Vite 8's
Rolldown-compatible configuration. No backend source or SQL is added in Phase 2.

| Route | Working frontend behavior |
| --- | --- |
| `/` | Marketing, shared-seed product preview, feature/how/security sections and real navigation |
| `/login`, `/register`, `/forgot-password` | Validated forms, password visibility, submitting/error states; explicit unavailable Auth adapter |
| `/app` | Currency-scoped metrics, spending/category charts, next known renewals, recent activity, illustrative protection score and sample insights |
| `/app/subscriptions` | Persistent local add/edit/delete, cards/table, search, category/status/frequency filters, confirmation dialogs and unused/reminder preferences |
| `/app/transactions` | Search/filter table, validated local CSV import and exact-file replay protection; separate unavailable PayPal merchant view |
| `/app/calendar` | Month navigation, date selection, next known renewal countdowns and local reminder indicators |
| `/app/insights` | Sample price/duplicate/overlap/recurring/savings signals, filtering, explanations, dismiss and restore |
| `/app/assistant` | Suggested prompts, local-session chat composer and explicit provider-unavailable responses |
| `/app/reports` | Monthly/year-to-date views, currency-scoped history/category charts, savings review and CSV export |
| `/app/settings` | Editable demo profile, currency preferences, local notification preferences, connection status, JSON export and confirmed reset |

The responsive shell includes real navigation, search-to-page results,
notification/help dialogs, native-modal focus containment, keyboard support, skip
link, reduced-motion behavior, toasts and loading/empty/error states. A missing
route has a recovery link. All illustrations, sample scores, transaction history
and insights are explicitly identified as demo content.

## Data and service boundaries

`src/data/demoData.js` creates the shared synthetic dataset. The marketing
preview derives its totals and upcoming merchants from that seed rather than a
second independent dataset. The demo has a fixed date of **2026-11-09**, historical
coverage June–November 2026, and partial November spending. Known renewal dates
are displayed as estimates; the calendar does not invent later cycles.

`src/services/demoService.js` owns local CRUD/persistence. `DemoProvider` invokes
its async methods and updates page state. The storage key is `subguard-demo-v2`;
it does not overlap a future authenticated API cache. Stored shapes and mutations
are validated; corrupted storage returns an actionable error without silently
destroying user-entered demo changes. Reset restores the seed on explicit action.
Storage denial or failed writes surface an error instead of an invented success.

`src/utils/finance.js` is a **demo-only** deterministic adapter. Money remains
integer minor-unit strings, with exact `BigInt` sums and half-up per-plan monthly
normalization (weekly ×52/12, quarterly /3, yearly /12). Formatting preserves
fractional precision. Chart values convert only within the safe numeric range;
individual demo amounts and cumulative chart values are bounded. The UI never
aggregates currencies together or changes a record's currency when preferences
change. Real financial calculations must migrate to backend services, with the
frontend consuming their DTOs; this does not implement Phase 5's production engine.

The CSV flow accepts UTF-8, up to 1 MB/500 rows, with exact
`merchant,amount,currency,date` headers and optional `category,status,direction`.
It supports quoted CSV cells, validates all rows before saving, requires explicit
ISO dates and supported currency precision, and rejects an invalid batch
atomically. The same file's SHA-256 batch key replays safely. Different files can
overlap and remain separate for review; source-less imports cannot guarantee
perfect automatic deduplication. All imported rows are forcibly marked simulated
and stay in the browser. No URL fetch, network upload or provider event is created.

`authService` and `assistantService` are explicit unavailable interfaces. Auth
does not persist passwords, create a fake session, or claim to email a reset link.
Assistant chat stays in memory and returns an unavailable-provider message, with
local numerical facts separately labeled. No AI request is made. Sample insights
derive from demo records and the user's explicit unused flag, not inferred usage.

## Verification

Commands and prerequisites are documented in [frontend/README.md](../frontend/README.md).
Vitest/Testing Library tests cover exact money/currency/date behavior, validated
CRUD/persistence, import atomicity/replay, malformed storage recovery, oversized
value rejection, CSV parsing, form validation, unavailable Auth and insights/settings
navigation. Playwright exercises the production build in system Chromium with
independent browser storage: navigation, unavailable Auth/AI, CRUD/reload/history,
CSV imports, calendar/reminders, currency isolation, corruption recovery and mobile
route/overflow checks. Screenshots were inspected separately for desktop/mobile
layout and real chart rendering. Current passing counts are recorded in the
delivery report, not asserted by this document for future edits.

## Next integration tasks

1. Implement Phase 3 Supabase Auth and migrations/RLS with two-user tests. Keep
   the demo an explicit separate entry point, never an auth-error fallback.
2. Replace the local service with an authenticated REST adapter in Phase 4,
   using the documented DTOs and owner enforcement. Move authoritative ingestion
   and all money/rule calculations to backend services.
3. Add versioned intelligence, provider-backed AI, verified own-merchant PayPal
   Sandbox processing and durable notifications in their planned phases.
4. Validate data privacy, retention, security controls and deployment settings
   before accepting real financial data. The demo is open without authentication.

No Supabase project, bank connection, AI model, PayPal credentials, webhook,
scheduled delivery or deployed service is claimed to work by this frontend.
