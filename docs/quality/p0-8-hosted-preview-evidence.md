# P0-8 Hosted Preview Evidence and Rollback Ledger

## Controller state

- Accepted parent baseline: `main` `38520a682d1ac6bd9e82724e753f03f67c87cb5f`.
- P0-7 post-merge Production Readiness: run #316 / `31941312775` — `SUCCESS`.
- P0-8 delivery: Draft PR #18, branch `codex/p0-8-hosted-preview-acceptance`.
- Authorization: dedicated preview/test environment only. Public production, uncontrolled/public users, customer data, native store publication, and purchase/selection of a new paid ClearSpeak scorer remain outside this milestone.
- Dedicated Supabase preview target: `MockMate-P0-8-Preview`, project ref `cysnsoeonyhcshjjpezk`, region `ap-south-1`, `ACTIVE_HEALTHY` at controller activation.
- Current hosted state: `DEDICATED_SUPABASE_ACTIVE__VERCEL_PREVIEW_NOT_BOUND`.

A dedicated MockMate Supabase project now exists. No existing application database was repurposed as the MockMate target. The complete repository migration chain was applied in order, followed by the P0-8 advisor-hardening migration. Hosted migration history contains the same ordered migration names as the P0-8 branch. Supabase security and performance advisors report **zero WARN-level findings** after hardening. Remaining advisor notices are INFO-level only: two deliberately client-inaccessible RLS tables without client policies, optional unindexed foreign keys, and unused-index notices expected on a new empty preview database.

The connected Vercel `Autobotz` team still contains no projects. No deployment has been created as a workaround and no production deployment has been promoted.

## Source-side preview authority

P0-8 preview runtime must fail closed unless all of these agree:

1. `MOCKMATE_RUNTIME_MODE=preview`;
2. `ENABLE_DEV_AUTH=false` and browser dev auth disabled;
3. exactly one HTTPS `ALLOWED_ORIGINS` entry;
4. `PREVIEW_ORIGIN` exactly equals that allowed origin;
5. `MOCKMATE_PREVIEW_TARGET_ID` is explicitly configured;
6. `MOCKMATE_SUPABASE_PROJECT_REF` is a 20-character Supabase project reference;
7. both server and browser Supabase URLs resolve to that exact project reference;
8. Vercel's system-provided `VERCEL_GIT_COMMIT_SHA` is present and is a 40-character Git SHA;
9. service-role authority is server-only and cannot equal the browser public/anon key;
10. at least one already-authorized AI provider is configured where production-like startup requires provider authority.

The preview health response may expose only non-secret target binding metadata (`mode`, authority state, preview target ID, Supabase project reference, deployed Git head SHA). It must never expose credentials, tokens, test-user identifiers, provider keys, raw resumes, raw audio, interview content, or recovery payloads.

## Supabase activation evidence

The dedicated project was created only after the approved free-tier slot was made available. The initial project migration ledger was empty. The controller then applied every repository migration in exact branch order, with no skipped or failed migration, and applied the forward-only P0-8 advisor-hardening migration.

The advisor-hardening migration:

- pins `search_path` for internal `SECURITY DEFINER` trigger/helper functions;
- removes `anon` and `authenticated` EXECUTE authority from those internal functions;
- preserves owner-only RLS semantics while changing owner checks to `(select auth.uid())` so PostgreSQL initializes identity once per statement;
- deliberately does not add client policies to `ai_cache` or `interview_plan_generation_reservations`, because both are server-only/service-role-only boundaries.

After the migration, Supabase security advisor WARN count is `0` and performance advisor WARN count is `0`. INFO-level performance notices are recorded but are not represented as production-load proof; P0-8 is a bounded preview acceptance milestone, not a scale benchmark.

The server service-role credential remains a server-only deployment secret. Browser configuration may use only the dedicated project's publishable/anon credential. Neither credential value is recorded in this evidence ledger.

## Hosted acceptance authority

`npm run acceptance:hosted` is controller-only and is intentionally excluded from ordinary PR CI and ordinary release commands. A run is refused unless the controller supplies all required authorization and binding values, including:

- `AUTHORIZE_HOSTED_PREVIEW_ACCEPTANCE=true`;
- `BOUNDED_TEST_DATA_CONFIRMED=true`;
- exact HTTPS Vercel preview origin;
- exact preview target ID;
- exact Supabase project reference;
- exact 40-character expected Git head;
- two bounded controller-owned test-user tokens;
- a controller-reviewed scenario manifest containing every required acceptance family.

Before any bearer token is attached, each scenario path must be a single-slash relative path that resolves back to the exact authorized Vercel origin. Protocol-relative (`//...`), backslash-ambiguous, malformed, or cross-origin paths are rejected. Hosted preflight must also prove that `/api/health` reports the same deployed Git SHA as `EXPECTED_HEAD_SHA`; recording an expected SHA without verifying the deployed SHA is not acceptable evidence.

Generated acceptance evidence contains non-secret target metadata, scenario IDs/families/statuses, a manifest SHA-256, and an artifact SHA-256. Response bodies and bearer tokens are never written to the evidence file. `artifacts/` remains Git-ignored.

## Required hosted acceptance families

The governed manifest must cover: runtime binding, PWA/installability truth, Auth/session rejection and authenticated identity, Resume integrity, ClearSpeak evidence semantics, Interview server authority/replay, Career Context version/lineage authority, account-data deletion, admin/privacy, concurrency, response-loss/idempotent replay, and cross-user isolation.

Before a mutation-capable hosted run, replace every `__CONTROLLER_REPLACE__` placeholder in the example manifest with bounded cases derived from the exact deployed API contracts. Do not persist raw resume files or raw ClearSpeak audio as evidence.

## Dedicated Supabase activation gate

## Frozen hosted-acceptance closure matrix

- **Functional:** every schema-v3 operation is structurally bound to its registered method, path, authentication selector, request-body kind, expected status set, and semantic oracle before exact-target preflight → authenticated execution → family-specific semantic/state proof → bounded evidence. A manifest-controlled label cannot substitute an unrelated request.
- **Authority/RLS:** exact origin, preview target, Supabase ref and deployed head remain bound; owner, non-admin and cross-user outcomes use semantic oracles rather than status proxies.
- **Concurrency:** two-to-five parallel duplicate requests retain one stable idempotency identity, canonical responses and exactly one authoritative effect.
- **Response-loss replay:** two-to-five sequential retries retain the same identity and prove canonical response/effect equality after a simulated lost response.
- **Lifecycle:** the required set includes Resume parse/score/suggest; ClearSpeak prompt/upload/status/result/cancel/history/replay/delete; Interview create/answer/report/version/stale/interrupted; Career Context create/update/delete/snapshot/bridge/stale/cross-user; and genuine account deletion plus owner, cross-user, and partial-failure aftermath.
- **Partial failure:** missing operations/oracles, unresolved controller placeholders, unregistered contracts, malformed or oversized responses, unauthorized access, provider unavailability, divergence and duplicate effects fail closed before useful mutation.
- **Bounds/privacy:** at most 64 scenarios, 5 MiB synthetic uploads, streaming cancellation above 256 KiB, 24 assertions and 12 canonical paths; multipart and streamed response buffers are wiped and bodies/tokens are excluded from evidence.
- **Fallback/retention:** no localhost or family-label proxy represents hosted proof; all P0-1–P0-8 security, RLS, replay, privacy and mobile gates remain authoritative.

The dedicated database portion of this gate is now satisfied through schema/advisor activation. Before hosted functional mutation, the remaining controls are:

1. exact-head source CI must remain green after every source/evidence update;
2. configure only the dedicated project URL/ref and browser-safe publishable credential in the preview browser environment;
3. configure the service-role credential only in the Vercel server environment;
4. configure only an already-authorized AI provider credential required for production-like startup;
5. bind the exact preview Auth redirect/origin settings;
6. create only bounded controller-owned test identities;
7. prove two-user isolation and authoritative app-data deletion;
8. remove bounded test data through authoritative deletion paths after evidence is captured.

## Vercel preview gate

Use the existing `vercel.json` + Vite + Express serverless architecture. Preview only; never production promotion in P0-8. The exact Vercel preview origin must be bound into both runtime configuration and the hosted acceptance command. Vercel system environment variables must be exposed so runtime can receive `VERCEL_GIT_COMMIT_SHA`; the acceptance harness must compare that deployed SHA with the exact expected PR head. No deployment may proceed against an unrelated Supabase project.

A Vercel project/origin is not yet bound. The connected `Autobotz` team currently reports no projects. Until a project can be created with server-only environment secrets and an exact preview origin, hosted acceptance remains correctly closed.

## Immediate rollback / stop conditions

Stop or roll back the preview if any of the following occurs:

- preview origin, target ID, deployed Git head or Supabase project binding mismatch;
- a scenario path can escape the exact authorized origin;
- secret, bearer token, raw resume/audio, interview content, or private recovery state appears in logs/evidence;
- cross-user access is observed;
- RLS/RPC/grant or migration/advisor regression appears;
- dev/mock auth or placeholder provider success becomes reachable in preview;
- stale/duplicate requests create duplicate authoritative effects instead of replay/conflict behavior;
- app-data deletion can report success after partial authoritative failure;
- any P1/P2 security, privacy, authority or integrity finding remains unresolved.

## Closure evidence still required

P0-8 stays Draft until the dedicated Supabase target and a Vercel preview are explicitly bound, exact-head Production Readiness is green, bounded hosted identities are established, the authorized hosted acceptance matrix is green, all review threads are resolved, and a fresh independent exact-head Codex P1/P2 review is clean.
