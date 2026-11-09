# Frontend foundation

SubGuard AI — **Never Lose Money on Forgotten Subscriptions.**

React, Vite and JavaScript with Tailwind CSS, React Router, Recharts, Lucide React
and Framer Motion. Phase 2 implements a responsive frontend and an isolated local
demo service. Supabase Auth, backend REST APIs, AI models and PayPal remain
disconnected. No credentials are required to explore the demo. Node 24 LTS is the
project baseline (see [`.nvmrc`](../.nvmrc)); exact dependencies are locked in
`package-lock.json`.

## Run and verify

From the existing repository root:

```sh
cd frontend
npm ci --cache .npm
npm run dev
```

Open the Vite URL printed by the development server. `/` is the marketing site;
`/app` opens the local demo without a sign-in. Login, registration and reset forms
validate input but explicitly report that authentication is not connected. They
never create fake sessions, save passwords or claim to send email.

```sh
npm run build
npm run preview
npm run lint
npm test
npm run test:e2e
```

Browser tests build the app and launch a production preview on port 4174. They use
`/usr/bin/chromium` by default; set `CHROMIUM_PATH` to your Chromium executable on
other systems. Install a trusted Chromium distribution if it is not available.
Playwright failure artifacts are written to `/tmp/subguard-playwright-results`.
SPA hosting must rewrite application routes to `index.html`.

## Demo boundaries

- All financial records are simulated. User-entered data and CSV imports remain
  local to this browser in the namespaced `subguard-demo-v2` storage entry.
- Charts, countdowns and renewals share the fixed demo date **9 November 2026**.
  Initial history covers June–November 2026; November is partial.
- INR is the initial currency. USD, EUR, GBP and JPY are selectable views that
  filter matching records; changing the preference never converts or relabels
  money. Add a plan in another currency to populate its view.
- Amounts are minor-unit strings. Exact local helpers exist to make this demo
  coherent; future real financial calculations must come from the backend.
- Subscription changes affect local tracking only. They do not cancel external
  merchant agreements. Reminder controls store preferences; no notifications send.
- AI Insights are deterministic sample explanations. The assistant interface
  reports that no provider is connected, rather than inventing model responses.
- PayPal merchant events have a separate unavailable view, with no generated
  payment events and no external bank or wallet history claim.
- Settings → Demo workspace can export or reset sample data. Malformed local
  storage has an explicit error/reset flow. Do not enter real financial data.

## Source organization

| Directory | Responsibility |
| --- | --- |
| `src/components` | Reusable accessible UI primitives; no provider credentials |
| `src/pages` | Route entry points and page composition |
| `src/layouts` | Navigation and authenticated application shell |
| `src/features` | Subscription, protection, payment and assistant workflows |
| `src/services` | REST client, Supabase Auth client; response/error normalization |
| `src/hooks` | Shared interaction, session and data-loading hooks |
| `src/utils` | Pure display helpers; currency-aware formatting, no financial decisions |
| `src/assets` | Local images, icons and fonts with known licensing |
| `src/data` | Shared synthetic dataset and fixed reference date |
| `src/context` | Demo state loading, mutations and toast lifecycle |
| `src/test` | Component-test environment setup |

The local demo does not use environment credentials. [`.env.example`](.env.example)
reserves public settings for future integration. All `VITE_*` values are public.
A publishable Supabase key is safe
only with correct database grants and Row Level Security. Never place a PayPal
secret, AI key or Supabase service-role key in this directory.

Use [architecture](../docs/ARCHITECTURE.md),
[API contracts](../docs/API_DOCUMENTATION.md) and the
[roadmap](../docs/DEVELOPMENT_PLAN.md) before implementing routes. UI fixtures
must be visibly labeled sample data and isolated from real user accounts.

See the [Phase 2 implementation handoff](../docs/FRONTEND_IMPLEMENTATION.md) for
routes, service boundaries, testing coverage and integration work remaining.

## Supabase account (Phase 3)

Login/registration now connect when public Supabase settings are provided.
`/account` is protected and uses database-backed subscription/transaction CRUD,
profile/preferences, notifications and stored insights. `/app` remains the
separate local demo and is never an authentication-error fallback. See
[Supabase setup and migration instructions](../docs/SUPABASE_IMPLEMENTATION.md).
No live project is configured in this environment; credential-free tests exercise
mocked SDK boundaries and PostgreSQL RLS through PGlite.
