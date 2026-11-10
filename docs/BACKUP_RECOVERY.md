# Backup and recovery readiness

Phase 8 review, 2026-11-10. This runbook concerns existing SubGuard data and
configuration. No deployment, hosted restore or production data operation has
been performed. No Supabase project credentials or backup-management access were
available in this environment.

## Current evidence

| Area | Verified | Still unknown or required |
| --- | --- | --- |
| Schema recovery | All five checked-in migrations replay in disposable PGlite PostgreSQL | Hosted Supabase migration/version compatibility and actual migration ledger |
| Data recovery | Local PGlite database exported to a compressed snapshot and reopened in a separate instance | A real provider backup/export, its integrity and isolated hosted restore |
| Ownership after recovery | Local restored RLS, grants, Auth user mappings, private-table denial and RPC privileges tested | Hosted Auth/PostgREST/JWT path after a real restore |
| Application integrity | Exact INR/USD amounts stay separate; chat pairs/order, canonical replay, import deduplication and quota state survive local restore | Hosted point-in-time consistency across data and external services |
| Backup availability/retention | No claim of configured managed backups | Project plan, backup status, retention, PITR eligibility, oldest/newest recovery points and restore permissions |
| Operational recovery time | No hosted RPO/RTO measured | Timed isolated restore exercise, operator ownership and approved recovery objectives |
| Configuration recovery | Required public/server variables documented in component `.env.example` files | Secret-manager backup/versioning, secure retrieval, Auth redirects and provider project settings |

The local test is `frontend/src/services/recovery.test.js`. It uses PGlite's
`dumpDataDir('gzip')` and `loadDataDir` on synthetic fixtures only. It does not
exercise `pg_dump`, Supabase managed backups, PostgREST, real Auth sessions,
production volumes or a second PostgreSQL network connection. Its Auth schema and
roles are test stubs. The compressed snapshot is held in memory and never placed
in Git, application logs or external storage.

Run the local exercise from the repository root:

```sh
npm --prefix frontend test -- --run src/services/recovery.test.js
```

## Establish the staging backup policy before deployment

In the Supabase dashboard for the explicitly identified staging project, an
operator with appropriate access must verify current settings against
[Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).
Backup facilities, retention, PITR and restore behavior depend on the project's
current plan and configuration. A paid account or reachable database alone does
not establish that a usable backup exists.

Record the project reference, database version, backup type, completion time,
retention window, encryption/access policy, restore operator and last successful
restore drill in a restricted operational record. Record metadata, not passwords,
connection strings or exported financial records. Check failure alerts and review
backup completion at least daily while staging contains non-disposable data.

Proposed initial controlled-staging objectives are **RPO <= 24 hours** and
**RTO <= 4 hours**. These are planning targets, not an observed result, configured
SLA or production commitment. The owner must approve them and choose backup/PITR
settings that can meet them. A later production release requires objectives based
on actual data-loss tolerance, retention/privacy duties and measured recovery.

If independent logical exports are needed, use the provider-supported Supabase
CLI/`pg_dump` workflow for that project/version with securely supplied credentials
and an isolated destination. Test the documented treatment of roles, extensions,
managed schemas, Auth records, large objects and ownership; a dump of `public`
alone is insufficient for this application's Auth foreign keys and private
quota/payment/import state. A database export does not capture external secrets,
provider settings or Storage object bytes. This application currently has no
Storage-based document feature, but future files would need a separate policy.
Encrypt exports in transit and at rest, restrict access, retain an integrity
checksum and migration/version metadata, and apply an approved expiry policy.
Never place backups in the repository, a public bucket, test reports or monitoring.
Do not copy production financial records into an ordinary staging environment.

## Controlled isolated recovery exercise

1. Confirm the exercise targets an isolated project and dedicated fixture users;
   verify its reference against the approved record. A restore may replace data:
   obtain explicit authorization for the exact target and selected recovery point
   before any hosted destructive action. Do not delete or modify existing backups.
2. Choose a known synthetic checkpoint. Record per-currency integer totals, row
   counts, fixture ownership, conversation/turn IDs, message order and migration
   version outside the database in a restricted, non-sensitive manifest. Include
   import receipts, intelligence decisions, recommendation dismissals and quota
   records rather than restoring only visible dashboard tables.
3. Restore into the isolated target using the provider's supported process. Match
   database/extension versions and restore managed Auth/role state only through
   documented Supabase procedures. Preserve `auth.users` IDs referenced by profile,
   subscription, transaction and conversation rows. Do not recreate arbitrary Auth
   users with new IDs and assume the old ownership relationships remain valid.
4. Restore application configuration separately from approved secret storage.
   Validate project URL/public key pairing, server-only service-role binding,
   Gemini project/model/disabled flag, exact CORS origin, public frontend URL,
   Supabase Auth site URL and redirect allowlist. Keep AI disabled during initial
   checks. Never paste credentials into shell history, Git or a recovery report.
5. Verify database integrity before admitting application traffic: foreign keys,
   not-null/check/unique constraints, indexes, triggers/sequences, RLS enablement,
   policies, column grants and private schema restrictions. Confirm browser roles
   cannot execute generated-record RPCs or write AI messages/derived evidence.
6. Use the actual caller-token access path with two dedicated users. Check anonymous
   denial, own reads, foreign reads/updates/deletes, conversation/message isolation,
   exact deterministic amounts by currency and preserved ordered chat pairs. Re-run
   an existing import and turn key to confirm canonical idempotency; changed-content
   replay must fail. A restored snapshot must not accidentally reset quotas or
   remove receipt state that prevents duplicate processing.
7. Run the application's full regression suite, guarded hosted validation and a
   bounded operational smoke. Verify login/logout/session refresh and recovery
   links against hosted Auth. Review live session/token revocation behavior: the
   local snapshot test does not prove existing browser sessions remain valid or
   that revoked sessions cannot return after a database restore. Any credential or
   signing-key rotation requires a separate explicitly authorized procedure.
8. Compare against the checkpoint manifest, record discrepancies and actual start,
   backup timestamp, completion time, data-loss window and recovery duration.
   A health endpoint alone is insufficient. Retain a sanitized exercise report;
   remove only explicitly identified disposable fixture data through the approved
   workflow. Do not promote, switch traffic or deploy as part of this task.

## Migration recovery strategy

Existing SQL files are versioned forward migrations and must not be rewritten
after application. There are no production-safe automatic down migrations in the
repository. Do not undo migration history or run a schema reset on a populated
project. Before a future migration, retain a verified recovery point, review locks
and grants, rehearse on an isolated copy and record the expected integrity checks.

Prefer a reviewed forward corrective migration for a small compatible defect.
If a restore is required, separately assess lost writes, external side effects,
provider event/receipt reconciliation, chat replay and user-visible freshness.
Restoring the database does not reverse external actions. PayPal execution remains
unimplemented; no recovery procedure should manufacture payment events. Predictions
and advisory findings remain predictions/findings after recovery, not completed
charges. Choose an application revision compatible with the restored schema; do
not deploy a new revision automatically during a recovery drill.

## Release gate

Local restore tests provide evidence that the schema and fixture data can survive
a local snapshot round trip. They do not establish hosted backup availability,
retention, restore permissions, production recovery capacity or compliance.
Controlled hosted staging validation remains conditional on securely configured
access and the isolated project. A release owner must verify backup completion and
successfully rehearse a hosted restore before relying on a stated recovery target.
