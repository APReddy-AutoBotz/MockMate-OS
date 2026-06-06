# MockMate Production Launch Runbook

Use this before every production preview, public web launch, and Android internal test build.

## 1. Secret Safety

The repository must not commit local environment files.

```bash
git ls-files .env backend/.env backend/service-account.json
```

If `.env` or `backend/.env` appear, remove them from Git tracking before committing:

```bash
git rm --cached .env backend/.env
```

Keep real values only in local files, Vercel, Supabase, and EAS dashboards.

## 2. Required Checks

From the repo root:

```bash
npm ci --dry-run
cd backend && npm ci --dry-run && cd ..
npm run check:production
npm run audit:production
npm run check:mobile
```

All commands must pass before deploying.

## 3. Supabase

1. Run `supabase/migrations/001_initial_schema.sql` in the target Supabase project.
2. Enable email/password auth.
3. Add Google auth only after OAuth redirect URLs are configured.
4. Add deployed Vercel preview and production domains to Auth redirect URLs.
5. Confirm RLS by testing two users cannot read each other's rows.

## 4. Vercel

Set these environment variables:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
GOOGLE_API_KEY=...
GROQ_API_KEY=...
ADMIN_EMAILS=...
ALLOWED_ORIGINS=https://your-domain.vercel.app
ENABLE_DEV_AUTH=false
```

Deploy a preview first. Do not promote to production until the preview smoke test passes.

```bash
npm run smoke:deployed -- https://your-preview.vercel.app
```

## 5. Preview Smoke Test

On the deployed preview:

- `GET /api/health` returns `200`.
- `GET /api/me/usage` without auth returns `401`.
- `POST /api/resume/score` without auth returns `401`.
- `GET /api/admin/usage` without auth returns `401`.
- Signup, onboarding, resume review, speaking practice, interview practice, and report views work with a real Supabase user.
- Data controls on the practice home can delete app data.
- Chrome can install the app as a PWA.
- Mobile landing and footer do not overflow.

## 6. Android Internal Testing

Set these EAS or local env vars before building:

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=https://your-domain.vercel.app
EXPO_PUBLIC_ENABLE_MOCK_AUTH=false
```

Then run:

```bash
cd mobile
npm install
npx tsc --noEmit
npm run lint
eas build --platform android --profile preview
```

Upload the preview build to Play Console internal testing only after the deployed web/API smoke test passes.

## 7. First 24 Hours

Watch:

- Vercel function errors.
- Supabase Auth errors.
- AI provider failures and quota errors.
- Resume parse failures.
- ClearSpeak scoring failures.
- Android install or auth failures.
- User reports about confusing copy or getting stuck.

Keep free quotas conservative until real usage patterns are clear.
