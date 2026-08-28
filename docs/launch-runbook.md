# MockMate Production Launch Runbook

## 0. Current authority boundary

P0-7 Mobile Career Context & Account Authority Parity is merged on `main` at `38520a682d1ac6bd9e82724e753f03f67c87cb5f`; post-merge Production Readiness run #316 / `31941312775` is fully green.

P0-8 Authorized Hosted Preview & Production-Like Acceptance is the PR #18 delivery. AP authorized a **dedicated preview/test environment only** on 2026-08-16. That authorization covers bounded preview infrastructure and controller-owned test identities; it does not authorize public production promotion, uncontrolled/public users, customer/job-candidate data, native store publication, or purchase/selection of a new paid ClearSpeak provider.

Current hosted state is **`NETLIFY_PREVIEW_BOUND__PREVIEW_ONLY`**. The isolated `MockMate-P0-8-Preview` project (`cysnsoeonyhcshjjpezk`, `ap-south-1`) is active, its ordered migrations are applied, and schema/RLS/grant authority has been verified. Supabase leaked-password protection remains unavailable on the free preview tier and is a recorded future public-production gate. The protected Netlify deploy-preview for QA-only PR #21 is bound to this target; every new delivery head must be redeployed and reaccepted before merge.

Use this runbook for P0-8 preview acceptance and for future launch milestones. A later public/native release still requires its own gate.

## 1. Secret Safety

The repository must not commit local environment files.

```bash
git ls-files .env backend/.env backend/service-account.json mobile/.env
```

If a local secret file appears, remove it from Git tracking before committing. Keep real values only in approved hosted secret stores such as Netlify, Supabase and EAS. Never write bearer tokens, test-user passwords, service-role keys or provider keys into repository files or acceptance artifacts.

## 2. Required Source Checks

From the repo root:

```bash
npm ci --dry-run
cd backend && npm ci --dry-run && cd ..
npm run check:production
npm run audit:production
npm run check:mobile
npm run test:mobile-governed-parity
npm run test:preview-security
npm run test:hosted-acceptance-contract
npm run manifest:readiness
```

The full GitHub MockMate Production Readiness workflow is the retained merge authority. All exact-head gates must pass before a source PR can merge.

`npm run acceptance:hosted` is intentionally excluded from ordinary source/release CI. It is controller-only and must remain fail-closed unless the exact hosted target and bounded test identities have been deliberately supplied.

## 3. Dedicated Supabase Preview

The dedicated **MockMate preview/test** project is already active. Do not recreate, repurpose, or mutate it during source-only work.

Before mutation:

1. Record the dedicated project reference and current migration state without secrets.
2. Confirm exact-head P0-8 Production Readiness is green.
3. Apply the complete ordered SQL chain in `supabase/migrations/`; never cherry-pick only the initial migration.
4. Configure only the exact approved preview Auth redirects/origins.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
6. Verify extensions, grants, RLS, RPC authority and migration history.
7. Run Supabase security and performance advisors after DDL.
8. Create only bounded controller-owned test identities.
9. Prove two-user RLS isolation, Career Context authority, ClearSpeak attempt lifecycle authority and account-data deletion.
10. Remove bounded test data through authoritative deletion paths after evidence capture.

The preview is already bound. Preserve the exact Supabase project, protected origin, preview target id, and Git-head agreement; do not recreate or repurpose the environment during source-only work.

## 4. Netlify Preview

Use the repository's committed `netlify.toml`, Vite browser build, and Express Netlify Function adapter. Preview only; do not promote to production in P0-8.

Required preview binding includes:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=... # optional; only an already-authorized provider
ADMIN_EMAILS=...
ALLOWED_ORIGINS=https://deploy-preview-21--mockmate-os-preview.netlify.app
PREVIEW_ORIGIN=https://deploy-preview-21--mockmate-os-preview.netlify.app
MOCKMATE_PREVIEW_TARGET_ID=mockmate-p0-8-preview
MOCKMATE_SUPABASE_PROJECT_REF=<project-ref>
MOCKMATE_DEPLOYED_GIT_SHA=<exact-40-char-pr-head> # required in the Functions/runtime scope
ENABLE_DEV_AUTH=false
VITE_ENABLE_DEV_AUTH=false
MOCKMATE_RUNTIME_MODE=preview
VITE_RUNTIME_MODE=preview
```

Before each preview deployment, set the Functions-scoped `MOCKMATE_DEPLOYED_GIT_SHA` assertion to the exact delivery head. Netlify exposes `COMMIT_REF` during the build but does not guarantee it as a Functions runtime variable, so runtime authority must not depend on `COMMIT_REF` being present. The controller must independently prove that the ready deploy's recorded `commit_ref`, `/api/health` Git SHA, and expected delivery head agree. If a hosting-provider SHA is present at runtime, it must agree with the operator assertion. Preview startup fails closed if the effective deployed Git SHA is absent, malformed, or conflicting.

Preview startup must also fail closed unless the server/browser Supabase URLs resolve to the exact `MOCKMATE_SUPABASE_PROJECT_REF`, exactly one HTTPS origin is allowed, and `PREVIEW_ORIGIN` matches it. AI provider credentials are optional feature-level authority: missing credentials must produce explicit provider-unavailable behavior and must not prevent authentication, persistence, deterministic scoring, or other provider-free routes from starting.

The remote smoke command remains explicitly opt-in:

```bash
AUTHORIZE_HOSTED_PREVIEW_SMOKE=true npm run smoke:deployed -- https://deploy-preview-21--mockmate-os-preview.netlify.app
```

## 5. Authorized Hosted Preview Acceptance

Create a non-committed controller-reviewed manifest from `config/hosted-acceptance-scenarios.example.json`. Replace every controller placeholder with bounded cases derived from the exact deployed API contracts.

Then run the controller-only command with exact bindings and controller-owned test tokens:

```bash
AUTHORIZE_HOSTED_PREVIEW_ACCEPTANCE=true \
BOUNDED_TEST_DATA_CONFIRMED=true \
MOCKMATE_PREVIEW_ORIGIN=https://deploy-preview-21--mockmate-os-preview.netlify.app \
MOCKMATE_PREVIEW_TARGET_ID=mockmate-p0-8-preview \
MOCKMATE_SUPABASE_PROJECT_REF=<project-ref> \
EXPECTED_HEAD_SHA=<exact-40-char-pr-head> \
HOSTED_ACCEPTANCE_SCENARIOS_FILE=/secure/path/mockmate-p0-8-cases.json \
MOCKMATE_TEST_USER_A_TOKEN=<token> \
MOCKMATE_TEST_USER_B_TOKEN=<token> \
npm run acceptance:hosted
```

If admin/privacy cases are included, also supply `MOCKMATE_TEST_ADMIN_TOKEN` for an allowlisted controller-owned identity.

Before any scenario bearer token is attached, the harness requires every scenario URL to resolve back to the exact authorized preview origin. Protocol-relative, backslash-ambiguous, malformed and cross-origin paths are refused. Preflight also requires `/api/health` to report the same Netlify-deployed Git SHA as `EXPECTED_HEAD_SHA`; merely recording an expected SHA is not sufficient.

Acceptance must prove:

- exact `/api/health` preview/Supabase/deployed-Git-head target identity;
- protected endpoint `401` without a bearer token;
- hostile-origin CORS rejection;
- signup/signin/session behavior for bounded identities;
- governed Resume parsing/scoring without raw-file persistence or invented hard facts;
- ClearSpeak prompt/attempt/replay/status/cancel/history/delete authority, raw-audio ephemerality and truthful scoring provenance;
- Interview plan/session/versioned answer replay/report authority;
- Career Context exact-version changes, stale conflicts, snapshot/bridge grounding and response-loss replay;
- authoritative app-data deletion and partial-failure truth;
- admin allowlisting/privacy;
- PWA/offline truth;
- duplicate/concurrent/stale request behavior;
- cross-user isolation.

Evidence must contain only non-secret target metadata, scenario IDs/families/statuses and SHA-256 digests. Never persist response bodies, tokens, raw resumes or raw audio in evidence.

If any scenario fails after a state-changing request may have started, the committed runner must make one bounded, no-retry compensating `DELETE /api/me/data` request for each disposable test identity and keep the original acceptance result failed. The controller must still reconcile application rows, sessions, Auth identities, credentials, and recovery material before the preview run can be closed.

## 6. Native Internal Testing

Native internal testing is a later gate after hosted browser/API acceptance is green. Source preparation may continue, but do not claim device/release readiness from browser proof alone.

When separately authorized, use only public mobile values:

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=https://deploy-preview-21--mockmate-os-preview.netlify.app
EXPO_PUBLIC_RUNTIME_MODE=preview
EXPO_PUBLIC_ENABLE_MOCK_AUTH=false
```

Before any EAS build:

```bash
cd mobile
npm ci
npx tsc --noEmit
npm run lint
```

TestFlight/Play/App Store publication remains outside P0-8.

## 7. Rollback / Stop Conditions

Stop or roll back immediately on any origin/target/Supabase/deployed-Git-head mismatch, scenario origin escape, secret leakage, cross-user access, migration/RLS/RPC/advisor regression, dev/mock auth in preview, placeholder provider success, duplicate authoritative effects, false deletion success, or unresolved P1/P2 security/privacy/authority finding.

The detailed evidence/rollback record is `docs/quality/p0-8-hosted-preview-evidence.md`.

## 8. First 24 Hours After a Future Authorized Public Launch

For a later public launch, watch:

- Netlify Function errors and latency;
- Supabase Auth/RLS/RPC failures;
- provider failures/quota behavior;
- Resume parse/integrity rejections;
- ClearSpeak attempt recovery/scoring evidence failures;
- Interview adaptive/replay/grounding failures;
- Career Context conflict/replay/stale-version failures;
- app-data deletion failures;
- native install/auth/audio/file/permission failures;
- user reports about confusing copy or dead ends.

Keep free quotas conservative until real usage patterns are proven.
