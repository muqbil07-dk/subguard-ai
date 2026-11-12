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

## Isolated synthetic AI demo (no Supabase)

The demo uses the existing Gemini provider, deterministic financial/context
services and evidence validator with a fixed fictional backend dataset dated
11 November 2026. It is separate from browser-local dashboard edits and real
accounts. No database client, conversation persistence or database quota RPC is
initialized in this mode. Existing account mode remains the default and still
requires its original Supabase settings.

From the repository root, start an honest AI-unavailable demo without any keys:

```sh
cd backend
APP_MODE=demo AI_ENABLED=false FRONTEND_ORIGIN=http://localhost:5173 npm start
```

Only process-scoped non-secret options are set here; no env file is required.
Leave Supabase settings unset/blank. Demo startup rejects nonblank Supabase
configuration rather than accidentally connecting to an account project.
`POST /api/demo/assistant` accepts only `{ "message": "your question" }` with
3-1000 characters and a 4 KB JSON body limit. The response always labels its
synthetic dataset. Disabled/unavailable AI returns an error and deterministic
context with `ai.generated=false`, never a successful model reply.

For genuine Gemini responses, have the backend operator configure
`GEMINI_API_KEY` and an available `GEMINI_MODEL` through secure server settings,
then use the same command with `AI_ENABLED=true`. Never place server secrets in
browser variables, source, shell history or reports. The provider checks model
capability, uses bounded calls, and validates structured output and citations.
Narrative choices are deliberately constrained: Gemini selects grounded evidence
and cautious guidance; backend facts/scenarios supply all financial figures.
No live model result is established merely by successful startup or mocked tests.

Local smoke, after starting the backend (no database operations):

```sh
curl -i http://localhost:3000/api/health
curl -i -H 'Content-Type: application/json' --data '{"message":"What renewals are coming up?"}' http://localhost:3000/api/demo/assistant
```

With AI disabled expect HTTP 503 / `AI_DISABLED` and synthetic context. With a
working provider expect HTTP 200 / `ai.generated=true`, validated response and
supporting facts. Invalid fields are rejected, account paths return 401 even
with a supplied bearer token, and no messages are stored by the backend. Every
question is independent; the UI transcript lives only in the current tab.

Limits are five requests/minute/IP, two in flight and 50 attempts/day/process,
plus the shared HTTP limiter. Process-local budgets reset on restart and are not
a distributed quota system. Proxy trust remains disabled; behind a proxy the
shared IP can make limits stricter. Exact-origin CORS, safe logs and request
timeouts remain enabled. Hosted demo mode additionally requires
`ALLOW_PUBLIC_DEMO=true`, `NODE_ENV=staging` or `production`, and an HTTPS
`FRONTEND_ORIGIN`. This documentation does not deploy anything.

Metadata verification has a 10-second deadline. Each of the two sequential
generation requests has a 30-second HTTP deadline, within a 70-second provider
budget and 75-second total assistant deadline. Demo and account browser clients
wait up to 85 seconds. Retries remain disabled beyond the initial attempt;
timeouts identify model verification, tool selection or structured response
generation without exposing provider details. A slow answer still fails closed.

No official PayPal hackathon brief is present in this repository, so mandatory
PayPal usage remains unverified. Payment APIs and webhook verification remain
unimplemented; the synthetic AI demo never manufactures payment events.

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
