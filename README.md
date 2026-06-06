# MockMate

MockMate is a premium job-prep app for individual job seekers who need help with three hard moments: building an ATS-friendly resume, improving spoken English, and practicing modern interviews.

The production direction is Vercel + Supabase:

- Vite/React browser app
- Express API mounted as Vercel serverless functions
- Supabase Auth, Postgres, and RLS
- Free-first AI usage with daily quotas and cache-by-hash
- No raw resume files or raw ClearSpeak audio stored by default

## Current App Status

The browser app is the primary working product.

The `mobile/` folder is an Android-first Expo app prepared for internal Play Store testing. It is not ready for public store release until EAS builds, Play Console metadata, privacy declarations, and real-user QA are completed. See `docs/mobile-production-plan.md` for the production mobile path.

## Prerequisites

- Node.js 20+
- npm
- Supabase project
- Gemini and/or Groq API keys for AI features
- Vercel account for deployment
- Expo/EAS account for Android internal testing

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

Copy `.env.example` to `.env` and fill the Supabase and AI keys:

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

Create the Supabase tables and RLS policies by running:

```text
supabase/migrations/001_initial_schema.sql
```

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

Or run the combined production gate from the repo root:

```bash
npm run check:production
npm run audit:production
npm run check:mobile
```

After deploying a Vercel preview:

```bash
npm run smoke:deployed -- https://your-preview.vercel.app
```

## Production Deployment

Use one Vercel project for the browser app and API functions. Set the variables listed in `.env.example`, with:

```env
ENABLE_DEV_AUTH=false
ALLOWED_ORIGINS=https://your-domain.vercel.app
```

`vercel.json` builds the frontend, builds the backend, and lets Vercel route `/api/*` through the Express app in `api/[...path].ts`.

## Production Launch Checklist

Before inviting real users:

- Deploy a Vercel preview with Supabase production-like environment variables.
- Confirm `/api/health` works and protected APIs return `401` without a Supabase token.
- Run a real signup, onboarding, resume review, speaking practice, interview practice, report, and delete-data flow.
- Confirm the app can be installed from Chrome as a PWA and shows a clear offline message.
- Check `/api/admin/usage` using an email listed in `ADMIN_EMAILS`.
- Review privacy and terms copy from the landing footer.
- Run an Android preview build only after the deployed API and Supabase auth are working with real users.

## Documentation

- `docs/free-first-production.md`: Supabase/Vercel setup, quotas, privacy, and launch checks
- `docs/launch-runbook.md`: exact production preview and launch checklist
- `docs/mobile-production-plan.md`: Android/iOS production path
