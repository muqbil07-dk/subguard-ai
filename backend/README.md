# Backend foundation

Reserved for a Node.js 24 LTS / Express JavaScript REST API and a worker using
shared domain services. No runtime dependencies, application handlers or servers
have been installed or implemented in Phase 1. Add an npm manifest, lockfile and
verified scripts when backend implementation begins.

| Directory | Responsibility |
| --- | --- |
| `src/config` | Fail-fast validated configuration; separate public/private settings |
| `src/controllers` | Translate validated HTTP requests and domain results |
| `src/routes` | Versioned REST routing and middleware composition |
| `src/middleware` | JWT verification, schema validation, rate limits, request IDs, errors |
| `src/services` | Deterministic financial logic, persistence adapters, AI provider adapters |
| `src/utils` | Currency, date and identifier primitives with focused tests |
| `src/webhooks` | PayPal signature verification, durable receipt, dispatch and replay control |

As implementation grows, place `intelligence/`, `ai/`, `paypal/`, `ingestion/`
and `notifications/` beneath `services/`; keep HTTP and provider-specific code
outside pure financial functions. A worker entry point can reuse those services.

Copy [`.env.example`](.env.example) to `.env` when configuring a real server.
Blank values intentionally contain no credentials. Only enable features whose
required configuration passes validation. API processes must not silently fall
back to fake payment events or made-up AI responses.

Ordinary API reads and editable CRUD run as the authenticated caller so Supabase
RLS applies. Narrow privileged adapters handle generated ingestion/intelligence
writes, private payment tables and worker work with explicit owner checks;
do not use that privilege for generic user CRUD. Private tables are accessed
through reviewed service-only transactional RPCs, not by exposing the private
schema to the Data API. See [architecture](../docs/ARCHITECTURE.md),
[database design](../docs/DATABASE_DESIGN.md) and
[API contracts](../docs/API_DOCUMENTATION.md).
