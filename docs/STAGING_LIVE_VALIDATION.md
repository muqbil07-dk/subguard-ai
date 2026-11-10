# Controlled live-service validation

Phase 8 adds opt-in validation runners, not a deployment or evidence that external
services work. No Gemini or hosted Supabase request was executed while implementing
these tools: their credentials were absent. Automated runner tests use mocks and
synthetic data only. Actual results belong in the Phase 8 release report.

## Authorization and safety boundaries

Obtain approval for the intended staging project, test accounts, provider key and
small request budget. Configure secrets through secret storage or ignored local
files. Never paste credentials into chat, commands, screenshots or Git. The tools
print fixed status/error codes, check names and a random run identifier; never
credentials, raw prompts, responses, financial records or provider errors.

Every runner requires `ALLOW_LIVE_VALIDATION=true`. Configuring a real key does not
make CI or `ai:smoke` call Google. Default/absent opt-in refuses before constructing
clients. Hosted database validation additionally requires:

```dotenv
ALLOW_LIVE_VALIDATION=false
DEPLOYMENT_ENVIRONMENT=staging
STAGING_TEST_ACCOUNTS_CONFIRMED=false
STAGING_PROJECT_REF=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STAGING_TEST_USER_A_EMAIL=
STAGING_TEST_USER_A_PASSWORD=
STAGING_TEST_USER_B_EMAIL=
STAGING_TEST_USER_B_PASSWORD=
```

These are empty placeholders. The existing public-key alias `SUPABASE_ANON_KEY` is
accepted. Confirm both flags only for an approved isolated project and two existing
confirmed-email test accounts. `SUPABASE_URL` must exactly equal
`https://<STAGING_PROJECT_REF>.supabase.co`, where the reference is 20 lowercase
letters/digits. Custom domains are intentionally not accepted. This guard is
operator confirmation, not automatic proof that a project contains no production
data. Never target production. The server-only key is used solely by the existing
atomic chat gateway; ordinary data operations still use caller JWTs and RLS.

Provision accounts, grants and migrations separately. The runner never creates
users, changes project configuration, disables RLS, resets schemas, applies
migrations or deletes accounts. It creates at most two subscriptions, two imported
transactions, two conversations and four messages, all labeled synthetic fixtures.
Cleanup uses only exact IDs returned by that run, through caller-scoped adapters;
there are no table-wide deletes or privileged cleanup functions.

## Gemini authentication, functions and financial grounding

Configure backend-only `GEMINI_API_KEY` and an explicitly available `GEMINI_MODEL`.
Use `ai:models` deliberately to select an accessible model: discovery is itself a
real metadata request. The runner uses the existing official Gemini provider,
financial context builder and response validator. From the repository root:

```sh
npm --prefix backend run staging:gemini
# ai:smoke invokes the same guarded validation:
npm --prefix backend run ai:smoke
```

The maximum request budget per run is **one metadata request plus six
`generateContent` requests**: three provider workflows, each with tool selection
and final structured output. It stops at the first failure. There is no retry loop
or paid-request database reservation, because provider-only fixtures have no user
database. A 120-second caller abort deadline is passed to generation; the existing
SDK per-request metadata/generation timeouts remain. SDK cancellation/timeout
behavior is separately covered by mocks; this does not prove live cancellation.

All fixtures use a fixed 2026-11-10 analysis date and contain no customer data:

| Scenario | Backend ground truth and required model evidence |
| --- | --- |
| Currency and potential savings | Monthly INR 79,900 minor units and USD 1,200 minor units remain separate. Only the INR plan is explicitly unused. Potential reduction is 79,900 monthly and 958,800 yearly, with conditional assumptions. The model must cite both currency totals and the unused-plan recommendation. |
| Predicted payment | INR 79,900 minor units expected on 2026-11-12, retaining `predicted=true`. It must not become a completed charge. |
| Missing income | Empty financial dataset, limited confidence, no financial facts, explicit backend missing-income/net-savings warning. |

Literal fixture expectations are checked against deterministic backend context
before generation. Model output is never the mathematical ground truth. Restricted
read functions, finite narrative vocabulary, structured schema and citation checks
remain active. Unsupported figures/dates, HTML, SQL tools, ownership arguments and
unknown evidence are rejected. Incomplete evidence selection produces
`LIVE_EVIDENCE_DISCREPANCY`; never weaken validation to make a smoke pass.

Output lists scenario names/status only. Fixed failure codes include
`AI_CONFIGURATION`, `AI_TIMEOUT`, `AI_QUOTA`, `AI_INVALID_RESPONSE`, `AI_UNGROUNDED`
and `LIVE_EVIDENCE_DISCREPANCY`. Save sanitized outcomes, not raw model responses.
Do not deliberately exhaust real quotas or use invalid keys for error tests.
Empty/malformed responses, timeouts, cancellation, authentication/quota/service
errors remain deterministic mocked tests. A future live failure must be recorded
honestly; synthetic live success does not establish reliability during outages.

## Hosted Supabase Auth, persistence and RLS

Apply migrations 001–005 using a reviewed migration runner on the isolated project.
Configure Auth site URLs, redirects, confirmations and dedicated test accounts.
Keep all production/customer data out. Then run:

```sh
npm --prefix backend run staging:supabase
```

This is a small sequential smoke, not a load test:

1. Sign in with the public SDK for two accounts, read in-memory sessions, remotely
   verify tokens using the application's `createAuthenticator`, and retrieve each
   owned profile. The two verified user IDs must differ.
2. Create a synthetic subscription and CSV spending transaction per account using
   the actual owner-scoped repository. Update the subscription to 202 minor units
   and restore 101, confirming accepted writes/readbacks.
3. Create a conversation; append a clearly labeled synthetic persistence fixture
   using the existing validator and atomic server-only RPC. Replay the turn key
   and verify exactly one ordered user/assistant pair. The structured fixture
   explicitly says no Gemini call was made; this is not an AI integration claim.
4. Attempt foreign financial reads, updates and deletes through the application
   repository; require 404. Repeat direct caller SDK reads/updates/deletes against
   the same known fixture IDs **without repository ownership filters**, requiring
   zero returned rows. This independently exercises hosted RLS.
5. Deny foreign conversation/history reads and deletion, including a direct
   message-table query. Reject a negative subscription value with actual PostgreSQL
   check-constraint code `23514`; permission/network errors do not count as success.
   Read back the unchanged 101-minor-unit value.
6. Refresh only these temporary test sessions. Cleanup exact created record IDs
   while caller tokens are valid, sign out with local scope and verify that the
   in-memory session is removed. Existing unrelated account sessions are not
   globally revoked.

The shared SDK fetch adapter has a 180-second work abort budget and a 10-second
per-request budget. Cleanup has a separate 30-second budget. After a budget abort,
new ordinary SDK requests are rejected before network I/O; cleanup remains a
bounded explicit exception. This limits external work and does not replace an
operator's overall process watchdog.

The script calls production SDK/Auth/repository/RPC paths directly. It does not
launch/deploy a server or verify hosted HTTP routing. In-memory session retrieval
is not browser reload persistence. Actual email delivery, registration, password
recovery, hour-long token expiry, all database constraints, multi-connection
contention and backup restoration need separate controlled validation. Registration
is manual; existing accounts are required. A logged-out JWT may remain valid until
expiry, so local session removal is not proof of immediate server JWT revocation.

On success, safe output contains status, check names, account count, random run ID
and cleanup status. On failure, fixed codes and the random run ID (where known)
are emitted. If cleanup fails, stop and investigate `STAGING_CLEANUP_INCOMPLETE` in
the disposable project. Labels begin `Staging validation <first eight run-ID
characters>`; transaction batch keys use `staging-<run ID>` for reviewed manual
investigation.

A network failure after insert can leave a committed fixture whose ID was never
received. The script cannot safely bulk-delete such records. Check failed runs for
residual synthetic fixtures using the run marker before retrying or discarding the
disposable project. Cleanup of known IDs cannot guarantee resolution of an
ambiguous external commit. No real user data or production backups may be touched.

## Manual staging evidence still required

After successful smokes, use authorized controlled infrastructure to verify actual
browser login/reload/refresh/logout/password recovery, dashboard amounts, Gemini
chat and supporting evidence, conversation history, account switching, HTTP/API
failures, cancellation/timeouts, CORS/TLS and origin configuration. Keep the request
budget low. Retain project identity privately, commit/model configuration,
timestamps, sanitized outcomes and discrepancies. A mocked counterpart passing
never establishes live success. These tools and tests neither deploy nor start
Phase 9.
