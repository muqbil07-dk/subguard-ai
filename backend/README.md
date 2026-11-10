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
