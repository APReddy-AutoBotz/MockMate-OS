# P0-8 Hosted Preview Evidence and Rollback Ledger

## Controller state

- Accepted parent baseline: `main` `38520a682d1ac6bd9e82724e753f03f67c87cb5f`.
- P0-7 post-merge Production Readiness: run #316 / `31941312775` — `SUCCESS`.
- P0-8 delivery: Draft PR #18, branch `codex/p0-8-hosted-preview-acceptance`.
- Authorization: dedicated preview/test environment only. Public production, uncontrolled/public users, customer data, native store publication, and purchase/selection of a new paid ClearSpeak scorer remain outside this milestone.
- Current hosted state: `DEDICATED_MOCKMATE_SUPABASE_TARGET_MISSING`.

The connected Supabase inventory contained no project dedicated to MockMate. The connected Vercel `Autobotz` team contained no projects. No unrelated Supabase project was reused and no hosted deployment was created as a workaround.

## Source-side preview authority

P0-8 preview runtime must fail closed unless all of these agree:

1. `MOCKMATE_RUNTIME_MODE=preview`;
2. `ENABLE_DEV_AUTH=false` and browser dev auth disabled;
3. exactly one HTTPS `ALLOWED_ORIGINS` entry;
4. `PREVIEW_ORIGIN` exactly equals that allowed origin;
5. `MOCKMATE_PREVIEW_TARGET_ID` is explicitly configured;
6. `MOCKMATE_SUPABASE_PROJECT_REF` is a 20-character Supabase project reference;
7. both server and browser Supabase URLs resolve to that exact project reference;
8. service-role authority is server-only and cannot equal the browser public/anon key;
9. at least one already-authorized AI provider is configured where production-like startup requires provider authority.

The preview health response may expose only non-secret target binding metadata (`mode`, authority state, preview target ID, Supabase project reference). It must never expose credentials, tokens, test-user identifiers, provider keys, raw resumes, raw audio, interview content, or recovery payloads.

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

Generated acceptance evidence contains non-secret target metadata, scenario IDs/families/statuses, a manifest SHA-256, and an artifact SHA-256. Response bodies and bearer tokens are never written to the evidence file. `artifacts/` remains Git-ignored.

## Required hosted acceptance families

The governed manifest must cover: runtime binding, PWA/installability truth, Auth/session rejection and authenticated identity, Resume integrity, ClearSpeak evidence semantics, Interview server authority/replay, Career Context version/lineage authority, account-data deletion, admin/privacy, concurrency, response-loss/idempotent replay, and cross-user isolation.

Before a mutation-capable hosted run, replace every `__CONTROLLER_REPLACE__` placeholder in the example manifest with bounded cases derived from the exact deployed API contracts. Do not persist raw resume files or raw ClearSpeak audio as evidence.

## Dedicated Supabase activation gate

Only a newly created or explicitly identified **MockMate preview/test** project may be used. Before mutation:

1. record the project reference and current migration state without secrets;
2. verify P0-8 exact-head source CI is green;
3. apply the complete ordered migration chain;
4. verify RLS, grants, RPC authority and migration history;
5. configure only the exact preview Auth redirect/origin settings;
6. run security and performance advisors after DDL;
7. create only bounded controller-owned test identities;
8. prove two-user isolation and authoritative app-data deletion;
9. remove bounded test data through authoritative deletion paths after evidence is captured.

## Vercel preview gate

Use the existing `vercel.json` + Vite + Express serverless architecture. Preview only; never production promotion in P0-8. The exact Vercel preview origin must be bound into both runtime configuration and the hosted acceptance command. No deployment may proceed against an unrelated Supabase project.

## Immediate rollback / stop conditions

Stop or roll back the preview if any of the following occurs:

- preview origin, target ID, Git head or Supabase project binding mismatch;
- secret, bearer token, raw resume/audio, interview content, or private recovery state appears in logs/evidence;
- cross-user access is observed;
- RLS/RPC/grant or migration/advisor regression appears;
- dev/mock auth or placeholder provider success becomes reachable in preview;
- stale/duplicate requests create duplicate authoritative effects instead of replay/conflict behavior;
- app-data deletion can report success after partial authoritative failure;
- any P1/P2 security, privacy, authority or integrity finding remains unresolved.

## Closure evidence still required

P0-8 stays Draft until a dedicated MockMate Supabase target and a Vercel preview are explicitly bound, exact-head Production Readiness is green, the authorized hosted acceptance matrix is green, all review threads are resolved, and a fresh independent exact-head Codex P1/P2 review is clean.
