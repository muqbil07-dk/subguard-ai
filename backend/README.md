# SubGuard AI REST API

Node 24 LTS, Express, Zod and a request-scoped Supabase SDK client. Run from this
directory:

```sh
npm ci --cache .npm
# Configure an ignored .env using .env.example, then:
npm run dev
npm test
npm run lint
npm run build
npm start
```

`build` performs JavaScript entry-point syntax checks; no transpilation is needed.
Tests execute actual Express HTTP requests with Supertest, mocked authentication
and repositories, plus direct tests of the real Supabase query adapter and Auth
verification adapter. They do not establish live Supabase connectivity.

Required settings: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or public
`SUPABASE_ANON_KEY`), exact `FRONTEND_ORIGIN`, optional `PORT` (3000).
The service-role credential is neither required nor used by ordinary API routes.
Never put it in frontend configuration. Requests require a Supabase bearer token;
Supabase Auth verifies it via `getUser(token)`. Each caller gets an isolated client
carrying that token so database RLS applies in addition to owner filters.

Apply database migrations 001, 002 and 003 before using the API. The third migration
adds owner-only notification deletion. See
[BACKEND_IMPLEMENTATION.md](../docs/BACKEND_IMPLEMENTATION.md) for the current API,
frontend wiring, limits and remaining live verification. Do not execute destructive
schema resets at application startup.

## Gemini assistance (Phase 6)

AI defaults to disabled. Backend-only key/model configuration, migration 005,
quotas, live smoke commands and failure behavior are documented in
[AI_FINANCIAL_INTELLIGENCE.md](../docs/AI_FINANCIAL_INTELLIGENCE.md).
Remote provider failure does not stop the deterministic API.

## Reliability and security regression

Run `npm run test:coverage` for measured Node/V8 backend coverage and
`npm run check:syntax` to check every backend source, script and test.
[Phase 7 QA](../docs/PHASE_7_QUALITY_ASSURANCE.md) documents the full local/CI
workflow, real test counts, verified fixes, audit findings and unverified services.

## Staging validation and operations (Phase 8)

See [Phase 8 readiness](../docs/PHASE_8_STAGING_READINESS.md) for actual results,
remote CI evidence and remaining live-service gates. `npm run check:concurrency`
is bounded loopback-only validation with synthetic adapters. `staging:gemini`,
`staging:supabase` and `ai:smoke` require explicit live opt-in; they refuse execution
by default. Follow [the live-validation runbook](../docs/STAGING_LIVE_VALIDATION.md)
before supplying isolated-project credentials. Public health is liveness;
authenticated `/api/readiness` performs only a bounded owned-profile probe.
Production/staging configuration requires HTTPS. No deployment is performed.
