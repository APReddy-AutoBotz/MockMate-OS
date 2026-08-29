# P0-8 — Authorized Hosted Preview & Production-Like Acceptance

## Controller baseline

- Parent issue: #17
- Exact accepted baseline: `main` `38520a682d1ac6bd9e82724e753f03f67c87cb5f` (P0-7 squash merge)
- Post-merge authority gate: MockMate Production Readiness run #316 / `31941312775` must complete successfully before any hosted mutation.
- Execution branch: `codex/p0-8-hosted-preview-acceptance`
- Delivery mode: one substantial Draft PR, single writer, fail closed on unresolved target identity or credentials.

AP authorized the dedicated preview/test milestone on 2026-08-16. This authorization does **not** permit public production promotion, uncontrolled/public users, customer data, native store publication, or purchase/selection of a new paid ClearSpeak provider.

## Outcome

Move the merged P0-7 source baseline into a governed production-like hosted preview using the existing Vercel + Supabase architecture, then prove the critical browser/API authority paths with bounded controller-owned test identities. Preserve source-only CI as the default; hosted acceptance must require an explicit authorization switch and exact target binding.

## Work package

### 1. Authority and documentation rebaseline

Update README and current launch/mobile/free-first authority documents so they record P0-7 as merged and P0-8 as the authorized preview-only milestone. Remove stale claims that P0-7 remains Draft or P0-6 is current while preserving the distinction between preview evidence and public/native release evidence.

### 2. Preview runtime and secret boundary

Audit and harden preview configuration so it fails closed unless all required values are valid. In preview:

- `ENABLE_DEV_AUTH=false`;
- no mock identity or placeholder success;
- browser receives only approved public Supabase/runtime values;
- service-role, provider and admin authority stays server-only;
- allowed origin and Supabase redirect target are exact and bounded;
- no secret value is logged, committed or emitted in evidence;
- ClearSpeak remains truthful when a real scorer is not authorized/configured.

### 3. Explicit hosted-acceptance harness

Build or strengthen a reusable hosted acceptance command that ordinary PR CI cannot accidentally invoke. It must require an explicit authorization flag plus exact target identity/origin and refuse missing, malformed or mismatched targets.

Cover at minimum:

- Auth/session and unauthenticated 401 behavior;
- governed Resume parse/ATS/JD/integrity behavior and raw-input ephemerality;
- ClearSpeak UK/US prompt + attempt authority/replay/status/cancel/history/delete and truthful V1/V2 evidence states;
- Interview plan/session/versioned-answer replay/report authority;
- Career Context exact-version updates, stale conflicts, snapshot/bridge grounding and response-loss replay;
- account-data deletion, partial-failure truth and cross-user isolation;
- admin privacy/allowlisting;
- PWA/offline truth;
- concurrency, duplicate-request, stale-version and partial-failure fail-closed behavior.

Use bounded controller-owned fixtures/test identities only. Never persist raw resume files or raw audio as test evidence.

### 4. Dedicated Supabase preview

The controller inventory at plan creation found **no dedicated MockMate Supabase project**. Do not repurpose any existing unrelated project. Hosted database work must wait for an explicitly identified/created MockMate preview project and must then:

- capture pre-mutation state/rollback evidence;
- apply the complete ordered migration chain;
- verify extensions, grants, RLS, RPC authority and migration history;
- configure only approved Auth settings/redirects;
- prove two-user isolation and authoritative deletion;
- run security/performance advisors after DDL;
- record non-secret project identity and evidence.

### 5. Vercel preview

Use the repository's existing Vercel/browser/API architecture. Create preview only, never production promotion. Verify health, unauthenticated rejection, runtime mode, CORS/origin enforcement, browser secret hygiene and the hosted acceptance harness against the exact preview URL.

If Vercel tooling or a dedicated Supabase project cannot be safely resolved, finish all source/harness/evidence work and leave the Draft PR fail-closed with the exact external gate documented. Do not switch platforms or mutate another project's infrastructure.

### 6. Retained regression authority

All P0-1 through P0-7 gates remain mandatory. P0-8 may add gates but must not weaken RLS, contracts, idempotency/replay, privacy, Resume integrity, ClearSpeak evidence semantics, Career Context authority, account deletion, mobile governed parity, security scans or Production Readiness.

Run full exact-head Production Readiness, focused P0-8 tests, secret/config checks, an internal adversarial P1/P2 pass and then one independent exact-head Codex review.

## Hosted hard stops

Do not:

- promote a public production deployment;
- invite uncontrolled/public users or use real customer/job-candidate data;
- publish EAS/TestFlight/Play/App Store builds;
- purchase/select/activate a new paid ClearSpeak provider;
- commit or expose real credentials;
- create a parallel backend or mobile-owned source of truth;
- make a hosted run possible by default in ordinary PR CI.

## Merge gate

Keep the PR Draft until:

1. P0-7 post-merge `main` run #316 is green;
2. P0-8 exact-head source CI is green;
3. the dedicated hosted target is explicitly bound and the authorized hosted acceptance matrix is green, or the PR is deliberately held Draft at a precisely documented external infrastructure gate;
4. internal and independent exact-head P1/P2 review is clean;
5. all review threads are resolved;
6. merge uses a verified `expected_head_sha`;
7. post-merge `main` Production Readiness is green.
