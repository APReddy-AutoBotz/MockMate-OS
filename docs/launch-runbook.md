# MockMate Production Launch Runbook

## 0. Mandatory authorization stop

P0-6 Mobile Core Journey Parity is merged on `main` at `4a465aab6a412917780e9ac7a9a7ced778238388`; post-merge Production Readiness #273 is fully green. P0-7 Mobile Career Context & Account Authority Parity is source-only work in Draft PR #16.

Current terminal hosted state remains **`HOSTED_PREVIEW_NOT_AUTHORIZED`**.

The Vercel, Supabase, provider, real-user, EAS, TestFlight and store procedures below are **future procedures, not authorization**. AP must separately approve before anyone configures, inspects, or mutates a hosted project; sets/uses real credentials; calls a real provider; creates a real user; deploys/promotes; or starts store distribution.

Use this runbook before every future production preview, public web launch, and native internal-test build.

## 1. Secret Safety

The repository must not commit local environment files.

```bash
git ls-files .env backend/.env backend/service-account.json mobile/.env
```

If a local secret file appears, remove it from Git tracking before committing. Keep real values only in separately authorized secret stores such as Vercel, Supabase and EAS.

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
npm run manifest:readiness
```

The full GitHub MockMate Production Readiness workflow is the retained merge authority. All exact-head gates must pass before a source PR can merge.

Do **not** run remote/hosted smoke merely because source checks pass.

## 3. Supabase (future, separate AP approval required)

When hosted execution is explicitly authorized:

1. Apply the complete ordered SQL chain in `supabase/migrations/`; do not apply only `001_initial_schema.sql` to an existing environment.
2. Enable the approved Auth providers.
3. Add only approved preview/production domains to Auth redirect URLs.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
5. Verify two-user RLS isolation, Career Context RPC authority, ClearSpeak attempt lifecycle authority and account-data deletion in the authorized target.
6. Capture rollback/evidence before promotion.

## 4. Vercel (future, separate AP approval required)

Set only separately approved environment variables, including:

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
MOCKMATE_RUNTIME_MODE=preview
VITE_RUNTIME_MODE=preview
```

Deploy a preview first. Do not promote to production until hosted acceptance is separately authorized and passes.

The remote smoke command is intentionally fail-closed unless hosted inspection has been explicitly authorized:

```bash
AUTHORIZE_HOSTED_PREVIEW_SMOKE=true npm run smoke:deployed -- https://your-preview.vercel.app
```

## 5. Hosted Preview Acceptance (only after authorization)

On the approved preview:

- `GET /api/health` returns `200`.
- protected endpoints return `401` without a Supabase bearer token.
- signup/onboarding works for approved test identities.
- governed Resume parse/score works without persisting raw files.
- ClearSpeak raw audio remains ephemeral and result provenance is truthful.
- adaptive Interview uses server-owned questions/evaluation/report.
- Career Context rebuild, confirmation, personalization, snapshot/bridge lineage and conflict behavior match retained source contracts.
- app-data deletion returns the authoritative `AccountDeletionResponseSchema`; local/mobile UX must not claim Auth identity deletion when it is retained.
- PWA install/offline behavior is truthful.
- admin usage access remains allowlisted and does not disclose resume/audio/interview content.

## 6. Native Internal Testing (future, separate AP approval required)

Set only approved EAS/local public values:

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=https://your-domain.vercel.app
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

Only after hosted web/API/auth acceptance passes may a separately authorized internal build run:

```bash
eas build --platform android --profile preview
# or, when separately authorized
eas build --platform ios --profile preview
```

Uploading to Play Console/TestFlight also requires separate authorization.

## 7. First 24 Hours After an Authorized Launch

Watch:

- Vercel/serverless errors and latency.
- Supabase Auth/RLS/RPC failures.
- provider failures/quota behavior.
- Resume parse/integrity rejections.
- ClearSpeak attempt recovery/scoring evidence failures.
- Interview adaptive/replay/grounding failures.
- Career Context conflict/replay/stale-version failures.
- app-data deletion failures.
- native install/auth/audio/file/permission failures.
- user reports about confusing copy or dead ends.

Keep free quotas conservative until real usage patterns are proven.