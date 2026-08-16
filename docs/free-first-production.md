# MockMate Free-First Production Setup

> Current authority (2026-08-16): P0-7 Mobile Career Context & Account Authority Parity is merged on `main` at `38520a682d1ac6bd9e82724e753f03f67c87cb5f`, and post-merge Production Readiness run #316 / `31941312775` is fully green. P0-8 Authorized Hosted Preview & Production-Like Acceptance is active in Draft PR #18 and AP has authorized a **dedicated preview/test environment only**. The current hosted stop is `DEDICATED_MOCKMATE_SUPABASE_TARGET_MISSING`; unrelated Supabase projects must not be reused.

## Runtime authority contract

`MOCKMATE_RUNTIME_MODE` is the server authority and `VITE_RUNTIME_MODE` / `EXPO_PUBLIC_RUNTIME_MODE` are its build-surface counterparts. The only values are `development`, `test`, `preview`, and `production`. Preview and production require valid HTTPS Supabase/API/origin configuration, server-only service-role/provider configuration, explicit non-wildcard origins, and disabled dev/mock auth. Invalid production-like configuration fails with bounded `CONFIGURATION_INVALID` responses and cannot fall back to in-memory usage or persistence.

P0-8 further binds preview startup to exactly one HTTPS `ALLOWED_ORIGINS` entry, matching `PREVIEW_ORIGIN`, explicit `MOCKMATE_PREVIEW_TARGET_ID`, and an exact `MOCKMATE_SUPABASE_PROJECT_REF` that must match both server and browser Supabase URLs.

Only anon keys are public. Service-role keys, provider keys, admin allowlists, persistence, quota, Career Context lineage, scoring adapters and deletion authority are server-only and cannot be selected by request fields or client environment values.

MockMate is wired for Vercel + Supabase with a free-first launch posture: user-owned data in Postgres/RLS, Supabase Auth tokens on every protected API call, and friendly daily limits for AI-heavy features.

## 1. Supabase

P0-8 authorizes a dedicated MockMate preview/test project only. The connected account currently has no such project, so hosted database work remains fail-closed until one is explicitly created or identified.

When the dedicated target is available:

1. Record its non-secret project reference and pre-mutation migration state.
2. Confirm exact-head P0-8 Production Readiness is green.
3. Apply the complete ordered SQL chain in `supabase/migrations/`.
4. Enable only approved Auth settings/providers and exact preview redirects.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
6. Verify migrations, grants, RLS and RPC authority, including Career Context, ClearSpeak attempt and account-data-deletion authority.
7. Run Supabase security/performance advisors after DDL.
8. Use only bounded controller-owned test identities and remove their app data through authoritative deletion paths after evidence capture.

Never reuse Boundaryless RUT, WorkOS, Kootha, AvalaOS, Creator Studio or another unrelated project for MockMate.

## 2. Local Environment

Copy `.env.example` to `.env` and fill only local/development values:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GOOGLE_API_KEY=...
GROQ_API_KEY=...
ADMIN_EMAILS=founder@example.com
ENABLE_DEV_AUTH=true
```

Use `ENABLE_DEV_AUTH=true` only for local development. Production-like modes must fail closed with dev/mock auth disabled.

Install dependencies in both workspaces:

```bash
npm install
cd backend && npm install
```

## 3. Vercel Preview

The connected `Autobotz` Vercel team currently contains no projects, so P0-8 has no legacy deployment to reconcile. Once the dedicated Supabase preview target is available, use the existing `vercel.json` architecture to create a **preview deployment only**.

Keep all service-role/provider/admin values server-only and bind the deployment with:

```env
MOCKMATE_RUNTIME_MODE=preview
VITE_RUNTIME_MODE=preview
ENABLE_DEV_AUTH=false
VITE_ENABLE_DEV_AUTH=false
ALLOWED_ORIGINS=https://your-exact-preview.vercel.app
PREVIEW_ORIGIN=https://your-exact-preview.vercel.app
MOCKMATE_PREVIEW_TARGET_ID=mockmate-p0-8-preview
MOCKMATE_SUPABASE_PROJECT_REF=<20-character-project-ref>
```

`SUPABASE_URL` and `VITE_SUPABASE_URL` must resolve to that exact project reference. P0-8 does not authorize promotion to public production.

## 4. Source Build Gates

Run these before merging source changes:

```bash
npm run typecheck
npm run verify:supabase
npm run build
cd backend && npm run build
cd ..
npm run smoke:production
npm run audit:production
npm run mobile:typecheck
npm run mobile:lint
npm run test:mobile-governed-parity
npm run test:hosted-acceptance-contract
```

The GitHub MockMate Production Readiness workflow remains the retained exact-head merge authority.

Remote hosted acceptance is deliberately **not** part of ordinary PR or release CI. `npm run acceptance:hosted` requires explicit controller authorization, bounded test-data confirmation, exact Vercel/Supabase target binding, exact expected Git head, two controller-owned identities and a reviewed governed scenario manifest. See `docs/quality/p0-8-hosted-preview-evidence.md`.

## 5. Free-First Limits

Server-enforced daily limits are in `backend/services/usageService.ts`:

- Resume reviews: 3/day
- Resume suggestions: 10/day
- Interview practice questions: 20/day
- ClearSpeak sessions: 5/day

When a user reaches a limit, the API returns bounded product copy without exposing provider/token internals.

## 6. Privacy Defaults

- Resume files are parsed in memory; uploaded files are not persisted.
- raw ClearSpeak audio stays ephemeral and only derived governed results are retained.
- Career Context reuses server-derived/user-confirmed facts only through explicit immutable snapshots/bridges.
- `personal_contact` Career Context facts are not groundable; mobile explicit selection is further limited to standard-sensitivity Resume/ClearSpeak facts.
- stored product data includes only authorized parsed/derived records, interview history/reports, Career Context lineage, ClearSpeak derived results/progress, and usage records.
- `DELETE /api/me/data` deletes app data through server authority and returns `AccountDeletionResponseSchema`.
- current app-data deletion retains the Supabase Auth identity; clients must not claim the identity/account itself was deleted.
- hosted evidence must never retain raw resume files, raw audio, bearer tokens, secrets or private response bodies.

## 7. Browser and Mobile Product Path

The browser app remains the primary working product and the reference for Supabase Auth, protected APIs, quotas, privacy copy, Career Context and adaptive Interview authority.

P0-6 brought native Resume, ClearSpeak Accent and adaptive Interview onto the governed backend. P0-7 merged native Career Context controls, explicit one-time grounded Interview setup, and governed app-data deletion.

P0-8 is the hosted browser/API acceptance milestone. Native source parity is retained, but public Android/iOS availability still requires later physical-device QA, EAS output, signing and store review.

## 8. PWA Preview Path

The installable web app remains the first mobile launch path.

- `/api/*` and `/ephemeral-token` stay network-only.
- offline UX must not pretend Resume, ClearSpeak, Career Context or Interview network operations succeeded.
- P0-8 hosted acceptance must verify manifest/installability behavior and truthful offline/unavailable behavior on the exact preview.

## 9. Operations

- CI runs retained contracts, builds, disposable database/RLS assertions, browser/adaptive/Career Context journeys, mobile typecheck/lint/parity, secret scans, adversarial checks, the offline P0-8 guard and source-only readiness evidence.
- `/api/admin/usage` is admin-only and must not expose resume text, raw audio, interview answers or report content.
- `/api/health` may expose only non-secret preview target identity required to verify the exact authorized target.
- source-only evidence must never be represented as hosted/security/compliance/store proof.

## 10. Evidence boundary and launch checks

Locally/disposably proven by exact-head gates: builds/types/tests, migration/RLS/RPC journeys, authentication rejection, quotas/replay paths, app-data deletion contracts, Career Context grounding, browser/PWA network authority, mobile source parity, secret rejection and disposable smoke.

P0-8 still requires target-specific proof: a dedicated Supabase preview, exact Vercel preview, bounded test identities, governed hosted acceptance, target security/advisor checks and a fresh exact-head independent Codex review.

Not authorized/proven by P0-8: public production promotion, uncontrolled users, real customer/job-candidate data, paid speech-provider selection/activation, EAS/store distribution, or physical-device/public-native readiness.

Use `docs/launch-runbook.md` and `docs/quality/p0-8-hosted-preview-evidence.md` for the exact next gates.
