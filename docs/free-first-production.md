# MockMate Free-First Production Setup

MockMate is wired for Vercel + Supabase with a free-first launch posture: user-owned data in Postgres/RLS, Supabase Auth tokens on every protected API call, and friendly daily limits for AI-heavy features.

## 1. Supabase

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/migrations/001_initial_schema.sql`.
3. Enable Auth providers:
   - Email/password for the first launch.
   - Google sign-in when the OAuth client is ready.
4. Add the production site URL to Supabase Auth redirect URLs.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. It must only be set in Vercel environment variables, never in frontend code.

## 2. Local Environment

Copy `.env.example` to `.env` and fill:

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

Use `ENABLE_DEV_AUTH=true` only for local practice mode. Vercel should use `ENABLE_DEV_AUTH=false`.

Install dependencies in both workspaces:

```bash
npm install
cd backend && npm install
```

## 3. Vercel

Use one Vercel project for the Vite app and API functions.

Set these environment variables in Vercel:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GOOGLE_API_KEY=...
GROQ_API_KEY=...
ADMIN_EMAILS=founder@example.com
ALLOWED_ORIGINS=https://your-domain.vercel.app
ENABLE_DEV_AUTH=false
```

The included `vercel.json` builds the frontend, installs/builds the backend, and falls frontend routes back to `index.html`. Vercel routes `/api/*` through the catch-all function in `api/[...path].ts`, which exports the Express app from `backend/server.ts`.

## 4. Build Gates

Run these before pushing:

```bash
npm run typecheck
npm run verify:supabase
npm run build
cd backend && npm run build
npm run smoke:production
npm run audit:production
```

After Vercel creates a preview URL:

```bash
npm run smoke:deployed -- https://your-preview.vercel.app
```

## 5. Free-First Limits

Server-enforced daily limits are in `backend/services/usageService.ts`:

- Resume reviews: 3/day
- Resume suggestions: 10/day
- Interview practice questions: 20/day
- ClearSpeak sessions: 5/day

When a user reaches a limit, the API returns friendly product copy without mentioning tokens, model limits, or inference.

## 6. Privacy Defaults

- Resume files are parsed in memory; uploaded files are not persisted.
- ClearSpeak raw audio stays in memory and is cleared after scoring.
- Stored data is limited to parsed resume/reports, interview history, ClearSpeak score JSON/progress, and usage counts.
- `DELETE /api/me/data` removes user-owned product data.

## 7. Browser And Mobile Product Path

The browser app is the current working product. It must remain the source of truth for Supabase Auth, protected API calls, quotas, privacy copy, and the premium visual system.

The existing `mobile/` folder is now an Android-first Expo client prepared for internal testing. It is not a public Play Store release until EAS preview builds, Play Console metadata, privacy declarations, and real-user QA pass.

## 8. PWA Launch Path

The first mobile launch is the installable web app, not the native app store release.

- `public/manifest.json` and the Vite PWA manifest use the MockMate navy/gold identity.
- `/api/*` and `/ephemeral-token` stay network-only so the app never pretends AI practice works offline.
- Offline UX should say plainly that saved pages may open, but resume, speaking, and interview practice need internet.
- Android Chrome installability is required for controlled beta; iOS is supported through Safari Add to Home Screen.

## 9. Operations

- CI runs typecheck, frontend build, backend build, production smoke checks, and production dependency audits.
- `/api/admin/usage` is admin-only and summarizes usage counts without exposing resume text, audio, interview answers, or report content.
- Set `ADMIN_EMAILS` in Vercel before production. Leave it empty only for local development.

## 10. Launch Checks

Before a public launch:

- Confirm `.env` and `backend/.env` are not tracked in Git. See `docs/launch-runbook.md`.
- Confirm every protected API returns `401` without `Authorization: Bearer <supabase_access_token>`.
- Confirm Supabase RLS blocks cross-user row access.
- Confirm no bearer tokens appear in server logs.
- Run desktop/mobile UI screenshots for landing, login, onboarding, practice home, resume setup, interview setup, speaking dashboard, and report.
