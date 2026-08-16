# MockMate

MockMate is a premium job-prep app for individual job seekers who need help with three hard moments: building an ATS-friendly resume, improving spoken English, and practicing modern interviews.

The production direction is Vercel + Supabase:

- Vite/React browser app
- Express API mounted as Vercel serverless functions
- Supabase Auth, Postgres, and RLS
- Free-first AI usage with daily quotas and cache-by-hash
- No raw resume files or raw ClearSpeak audio stored by default

## Current App Status

P0-7 Mobile Career Context & Account Authority Parity is merged on `main` at `38520a682d1ac6bd9e82724e753f03f67c87cb5f`. Post-merge MockMate Production Readiness run #316 / `31941312775` is fully green across retained contracts, browser/adaptive/Career Context journeys, PostgreSQL/RLS assertions, account deletion, mobile typecheck/lint/governed parity, security checks, secret scans and source-only readiness evidence.

P0-8 Authorized Hosted Preview & Production-Like Acceptance is active in Draft PR #18. AP has authorized a **dedicated preview/test environment only**. P0-8 adds exact preview/Supabase target binding, fail-closed hosted acceptance, non-secret evidence/rollback authority and the path to production-like browser/API proof. It does not authorize public production promotion, uncontrolled/public users, customer data, native store publication, or purchase/selection of a new paid ClearSpeak provider.

The current infrastructure blocker is `DEDICATED_MOCKMATE_SUPABASE_TARGET_MISSING`: the connected Supabase account has no dedicated MockMate project, and unrelated projects must not be reused. The connected Vercel `Autobotz` team currently has no projects, so there is also no legacy deployment to reconcile.

The browser app remains the primary working product.

The `mobile/` folder is an Android-first Expo app prepared for internal source validation. It is not ready for public store release until separately authorized hosted integration, EAS builds, Play Console/App Store metadata, privacy declarations, signing, and physical-device/real-user QA are completed. See `docs/mobile-production-plan.md` for the production mobile path.

## Prerequisites

- Node.js 20+
- npm
- Dedicated MockMate Supabase preview/test project for hosted P0-8 work
- Already-authorized Gemini and/or Groq API keys for AI features
- Vercel account for preview deployment
- Expo/EAS account for later Android internal testing

## Local Setup

Install frontend dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
cd backend
npm install
cd ..
```

Copy `.env.example` to `.env` and fill the Supabase and AI keys for local development:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GOOGLE_API_KEY=...
GROQ_API_KEY=...
ADMIN_EMAILS=...
ENABLE_DEV_AUTH=true
```

For the Android app, copy `mobile/.env.example` to `mobile/.env` and fill `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_API_URL`.

Create the Supabase tables and RLS policies by applying the complete ordered migration chain in `supabase/migrations/`. Do not apply only the initial migration to an existing environment.

Run the browser app:

```bash
npm run dev
```

Run the local API in another terminal:

```bash
cd backend
npm run dev
```

## Build Checks

Run these before deploying:

```bash
npm run typecheck
npm run verify:supabase
npm run build
cd backend && npm run build
```

Or run the combined source gates from the repo root:

```bash
npm run check:production
npm run audit:production
npm run check:mobile
npm run check:preview-readiness
npm run test:hosted-acceptance-contract
```

The deployed smoke contract defaults to a disposable/local target. Remote smoke remains separately opt-in:

```bash
npm run smoke:deployed -- https://your-preview.vercel.app
```

The P0-8 hosted acceptance runner is **not** part of ordinary PR/release CI. It refuses execution unless all controller authorization, bounded-test-data and exact-target variables are deliberately supplied. Start from `config/hosted-acceptance-scenarios.example.json`, create a non-committed reviewed manifest, and follow `docs/quality/p0-8-hosted-preview-evidence.md`.

## P0-8 Preview Deployment

P0-8 preview/test deployment is authorized, but only after a dedicated MockMate Supabase target is explicitly created or identified. Do not reuse Boundaryless RUT, WorkOS, Kootha, AvalaOS, Creator Studio or any other unrelated project.

For preview runtime, the server must use:

```env
MOCKMATE_RUNTIME_MODE=preview
ENABLE_DEV_AUTH=false
VITE_ENABLE_DEV_AUTH=false
ALLOWED_ORIGINS=https://your-exact-preview.vercel.app
PREVIEW_ORIGIN=https://your-exact-preview.vercel.app
MOCKMATE_PREVIEW_TARGET_ID=mockmate-p0-8-preview
MOCKMATE_SUPABASE_PROJECT_REF=<20-character-project-ref>
```

`SUPABASE_URL` and `VITE_SUPABASE_URL` must both resolve to that exact project reference. `SUPABASE_SERVICE_ROLE_KEY` remains server-only and must never equal or be exposed as the browser public/anon key. `vercel.json` continues to build the frontend, build the backend, and route `/api/*` through the Express app in `api/[...path].ts`.

`/api/health` exposes only non-secret preview binding identity so the controller can prove it reached the exact authorized Vercel/Supabase pair.

## Production Launch Checklist

P0-8 is preview acceptance, not public launch. Before inviting real users in a later milestone:

- Complete a dedicated MockMate Supabase preview and exact Vercel preview deployment.
- Prove `/api/health` target binding and protected API `401` rejection without a Supabase token.
- Run the governed hosted acceptance matrix with two bounded controller-owned identities.
- Prove signup/session, Resume, ClearSpeak, Interview, Career Context/grounding, report, account-data deletion, admin/privacy, PWA/offline truth, concurrency/replay and cross-user isolation.
- Confirm no raw resume/audio evidence, credentials or private response bodies are retained in artifacts/logs.
- Run a fresh exact-head independent Codex P1/P2 review.
- Keep native internal builds and all public/store promotion in their separately authorized milestones.

## Documentation

- `docs/free-first-production.md`: Supabase/Vercel setup, quotas, privacy, and launch checks
- `docs/launch-runbook.md`: exact production preview and launch checklist
- `docs/mobile-production-plan.md`: Android/iOS production path
- `docs/planning/p0-8-hosted-preview-acceptance-plan.md`: frozen P0-8 controller plan
- `docs/quality/p0-8-hosted-preview-evidence.md`: hosted target authority, evidence and rollback ledger
