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

The dedicated Supabase preview target is now active: `MockMate-P0-8-Preview` / `cysnsoeonyhcshjjpezk` in `ap-south-1`. The complete ordered repository migration chain plus the P0-8 advisor-hardening migration is applied. Post-DDL Supabase security and performance advisors have **zero WARN-level findings**; remaining notices are INFO-level only. The connected Vercel `Autobotz` team currently has no project, so the active hosted gate is `DEDICATED_SUPABASE_ACTIVE__VERCEL_PREVIEW_NOT_BOUND`.

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

The API listens on port 3001 by default.

## Production-like preview authority

A hosted preview must be configured fail closed with:

```env
MOCKMATE_RUNTIME_MODE=preview
ENABLE_DEV_AUTH=false
VITE_ENABLE_DEV_AUTH=false
ALLOWED_ORIGINS=https://<exact-preview-origin>
PREVIEW_ORIGIN=https://<exact-preview-origin>
MOCKMATE_PREVIEW_TARGET_ID=<explicit-preview-target-id>
MOCKMATE_SUPABASE_PROJECT_REF=cysnsoeonyhcshjjpezk
SUPABASE_URL=https://cysnsoeonyhcshjjpezk.supabase.co
VITE_SUPABASE_URL=https://cysnsoeonyhcshjjpezk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-secret>
VITE_SUPABASE_ANON_KEY=<browser-publishable-or-anon-key>
```

Vercel must expose its system `VERCEL_GIT_COMMIT_SHA` to runtime. At least one already-authorized AI provider key (`GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `GROQ_API_KEY`) is also required for production-like startup. Never put the service-role credential or provider credential in Git, a browser-prefixed variable, hosted acceptance evidence, or client logs.

Run source checks:

```bash
npm run check:production
npm run check:mobile
npm run test:hosted-acceptance-contract
```

Actual hosted mutation/acceptance is a separate controller-only action and is intentionally excluded from ordinary CI:

```bash
npm run acceptance:hosted
```

See `docs/quality/p0-8-hosted-preview-evidence.md` and `docs/launch-runbook.md` for the governed hosted path and stop/rollback conditions.
