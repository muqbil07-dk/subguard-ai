# Database foundation

Supabase PostgreSQL and Supabase Auth are the planned persistence and identity
services. [`migrations/`](migrations/) is intentionally empty except for its Git
placeholder: this phase does not provision a database or execute SQL.

Implement versioned, reviewable SQL migrations in Phase 3 using the Supabase CLI
and commit them here. The first migration must include constraints, indexes,
least-privilege grants and RLS together; do not deploy tables first and secure
them later. Keep provider inbox/outbox tables in a non-exposed private schema.
Choose and document a single migration runner before applying to any environment.

Follow [DATABASE_DESIGN.md](../docs/DATABASE_DESIGN.md) for ownership and
idempotency constraints. Validate on an isolated local/test Supabase project,
including anonymous access and two-user cross-tenant attempts, before deploying.
Use deterministic, explicitly labeled fixtures only in test environments; never
seed fabricated PayPal events into a production or Sandbox payment ledger.
