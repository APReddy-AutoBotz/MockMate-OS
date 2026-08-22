# P0-8 Hosted Preview Evidence and Rollback Ledger

## Controller state

- Accepted parent baseline: `main` `38520a682d1ac6bd9e82724e753f03f67c87cb5f`.
- P0-7 post-merge Production Readiness: run #316 / `31941312775` — `SUCCESS`.
- P0-8 delivery remains Draft PR #18, branch `codex/p0-8-hosted-preview-acceptance`.
- Temporary QA/deploy-preview branch: `netlify-preview`, Draft PR #21. PR #21 is evidence-only and must never be merged.
- Authorization remains preview/test only. Public production, uncontrolled/public users, customer data, native-store publication, and selection/purchase/activation of a new paid ClearSpeak scorer remain outside P0-8.
- Dedicated Supabase target: `MockMate-P0-8-Preview`, ref `cysnsoeonyhcshjjpezk`, region `ap-south-1`, healthy.
- Dedicated Netlify target: `mockmate-os-preview`, protected by Netlify team login.
- Governed Deploy Preview origin: `https://deploy-preview-21--mockmate-os-preview.netlify.app`.
- Current controller state: `NETLIFY_PREVIEW_BOUND__EMAIL_AND_GOOGLE_AUTH_VERIFIED__SOURCE_GATES_GREEN__HOSTED_MUTATION_ACCEPTANCE_PENDING`.

No existing application database was repurposed. The complete repository migration chain plus the P0-8 advisor-hardening migration is applied to the dedicated Supabase project. Security and performance advisors have zero WARN-level findings. Remaining notices are INFO-only and do not represent production-load proof.

## Exact hosted target evidence

The source-hardening head `1e3156533c357fbbdf0936a3f4111e493d3efe8e` was deployed by Netlify as Deploy Preview id `6a896bf1d13bce00089664c2` and reported `ready` with:

- exact `commit_ref` matching the source head;
- Node.js 22 runtime;
- one Express API function and three redirects;
- zero Netlify secret-scan matches;
- no production publication.

Production Readiness run #390 / `32565075294` completed `SUCCESS` on that exact source-hardening head. The retained matrix passed frontend/shared/backend tests, static and disposable PostgreSQL migrations, Resume validation, rendered Interview and ClearSpeak UK/US browser journeys, Career Context and cross-module grounding/deletion journeys, backend tests, mobile typecheck/lint/parity, dependency audit, both secret scans, preview security, runtime authority, the hardened hosted-acceptance contract, disposable smoke, and exact-head readiness evidence.

This evidence-document update intentionally creates a later documentation-only head. That later head must receive its own exact-head Production Readiness and Netlify Deploy Preview before branch synchronization or review closure.

## Runtime and deployment authority

Preview runtime is production-like and fails closed unless the deployment authority is coherent:

1. `MOCKMATE_RUNTIME_MODE=preview` and browser runtime mode is `preview`;
2. development/mock auth is disabled;
3. exactly one HTTPS `ALLOWED_ORIGINS` origin is configured;
4. `PREVIEW_ORIGIN` equals that exact origin;
5. the preview target ID and dedicated Supabase project ref are configured;
6. server and browser Supabase URLs resolve to that exact project;
7. the deployed Git SHA is a valid 40-character SHA from the supported hosting authority (`COMMIT_REF`, Vercel SHA, or explicit governed override);
8. the Supabase administrative key remains server-only and cannot equal the browser credential.

An AI-provider key is not a global server-startup prerequisite. Non-AI auth/account/database routes can operate without an AI provider. AI-backed operations fail visibly and truthfully when no authorized provider is configured.

The preview health endpoint may expose only non-secret binding metadata: runtime mode, authority state, preview target ID, Supabase project ref, and deployed Git SHA. It must never expose credentials, bearer tokens, user identifiers, raw resume/audio, interview content, or recovery payloads.

## Supabase and Auth evidence

The Netlify Deploy Preview contains the dedicated Supabase browser configuration and a masked `SUPABASE_SERVICE_ROLE_KEY` scoped to Deploy Previews/functions/runtime. No privileged secret value is recorded in Git, PR comments, or this ledger.

Supabase Auth URL configuration is bound to the protected Netlify Deploy Preview. Hosted authentication is independently verified from Supabase logs:

- email authentication produced an authenticated `/auth/v1/user` `200` from the exact Netlify preview origin and a clean logout `204`;
- Google provider configuration reloaded successfully;
- Google authorization completed, the callback returned successfully, Supabase recorded an OAuth login with provider `google`, and authenticated `/auth/v1/user` returned `200` from the exact Netlify preview origin;
- the dedicated project now contains two confirmed Auth users with two distinct provider identities, satisfying the identity-count prerequisite for cross-user acceptance.

A read-only privacy check after login found no rows in the inspected application-domain tables (`profiles`, `career_context_state`, `clearspeak_profiles`, `clearspeak_accent_attempts`, `interview_sessions`, `resume_reviews`). Login alone therefore did not silently create domain data.

## Hosted acceptance authority

`npm run acceptance:hosted` remains controller-only and is excluded from ordinary PR/release CI. It requires explicit controller authorization, bounded data confirmation, the exact hosted origin/target/ref/head, two bounded test-user bearer tokens, and a controller-reviewed schema-v3 manifest.

The hardened network authority now:

- permits only exact HTTPS hosted origins whose host ends in `.vercel.app` or `.netlify.app`;
- rejects bare provider domains, near-miss/arbitrary domains, credentials, explicit ports, path/query/hash origins, protocol-relative and ambiguous paths, and cross-origin resolution;
- applies a bounded `HOSTED_ACCEPTANCE_TIMEOUT_MS` deadline across connection establishment and complete response-body streaming;
- cancels timed-out, drip-fed, failed, or oversized response streams where possible;
- caps response bodies at 256 KiB and synthetic uploads at 5 MiB;
- wipes copied response chunks plus bounded JSON/multipart request material after use;
- routes health, unauthenticated-auth, hostile CORS, hostile CORS preflight, scenario, concurrency, replay, and post-state verification requests through the bounded request authority;
- keeps bearer tokens and response bodies out of generated evidence.

The offline P0-8 guard proves allowed/rejected origin cases, hanging connections, drip-feed cancellation and wiping, response bounds, CORS preflight, semantic assertions, concurrency/replay post-state proof, privacy-bounded evidence, and that ordinary CI never contacts the hosted preview.

## Functional matrix retained by source CI

The governed schema-v3 matrix retains:

- Resume parse, score, suggest and file validation;
- ClearSpeak UK/US profile selection, Word/Phrase/Sentence/Free Response modes, microphone consent/record/stop/preview/discard, permission-denied recovery, lifecycle/history/delete contracts, and cross-module grounding;
- Interview create/answer/report/version/stale/interrupted and rendered adaptive UI journeys;
- Career Context create/update/delete/snapshot/bridge/stale/cross-user plus account-deletion and grounding journeys;
- admin/privacy denial, cross-user isolation, malformed/oversized partial-failure behavior, concurrency exactly-once semantics, and response-loss replay.

### ClearSpeak scoring truth

UK/US practice and microphone workflows are implemented and browser-tested. Real user recordings are **not yet pronunciation/accent scored** because no real speech scorer has been authorized for P0-8. The scoring adapter fails closed and returns scorer-unavailable/null scoring authority rather than fabricating a pronunciation score. Synthetic fixtures are used only for deterministic contract testing. Selecting or activating a real paid scorer is a later explicit decision, not silently part of this preview milestone.

## Remaining hosted closure gates

The database, hosting, service-role, Auth URL, email-login, Google-login, two-identity prerequisite, source CI, Netlify binding, and hosted network-hardening gates are satisfied.

P0-8 remains Draft because these controls are still open:

1. acquire two bounded controller test-user bearer tokens through a secure channel without placing tokens in chat, Git, PR comments, or evidence;
2. prepare the noncommitted controller-reviewed real scenario manifest and bounded synthetic Resume/ClearSpeak fixtures;
3. configure an already-authorized AI provider key if live hosted acceptance is expected to exercise AI-backed Resume/Interview generation endpoints successfully; no provider purchase/activation is authorized by this ledger;
4. execute the controller-only hosted mutation matrix, prove two-user isolation/concurrency/replay/account deletion, retain only non-secret evidence, and remove bounded test data through authoritative deletion paths;
5. update this ledger with actual hosted acceptance result/digest, then rerun exact-head Production Readiness and exact-head Netlify deployment;
6. obtain a fresh independent exact-head Codex P1/P2 review and resolve all review threads;
7. only after those gates, fast-forward the real P0-8 delivery branch from the tested QA lineage. PR #21 itself must remain unmerged/closeable as QA-only evidence.

## Immediate rollback / stop conditions

Stop or roll back the preview if any of the following occurs:

- preview origin, target ID, deployed Git head, or Supabase binding mismatch;
- any request can escape the authorized origin or bypass bounded timeout/body controls;
- a secret, bearer token, raw resume/audio, interview content, or private recovery state appears in logs/evidence;
- cross-user access is observed;
- RLS/RPC/grant/migration/advisor regression appears;
- development/mock auth or fabricated provider/scorer success becomes reachable in preview;
- stale/duplicate requests create duplicate authoritative effects instead of replay/conflict behavior;
- app-data deletion can report success after partial authoritative failure;
- any P1/P2 security, privacy, authority, or integrity finding remains unresolved.

## Closure rule

P0-8 stays Draft until controller-only hosted acceptance is green on the exact protected preview, cleanup is proven, the resulting exact head is green in Production Readiness and Netlify, and a fresh independent exact-head P1/P2 review is clean with no unresolved threads. Public production promotion is explicitly outside this milestone.
