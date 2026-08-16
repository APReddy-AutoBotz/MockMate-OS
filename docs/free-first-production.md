# MockMate Free-First Production Setup

> Current source authority (2026-08-15): P0-6 Mobile Core Journey Parity is merged at `4a465aab6a412917780e9ac7a9a7ced778238388` and post-merge Production Readiness #273 is fully green. P0-7 Mobile Career Context & Account Authority Parity is source-only work in Draft PR #16. `HOSTED_PREVIEW_NOT_AUTHORIZED` remains the controlling hosted stop state.

## Runtime authority contract

`MOCKMATE_RUNTIME_MODE` is the server authority and `VITE_RUNTIME_MODE` / `EXPO_PUBLIC_RUNTIME_MODE` are its build-surface counterparts. The only values are `development`, `test`, `preview`, and `production`. Preview and production require valid HTTPS Supabase/API/origin configuration, server-only service-role/provider configuration, explicit non-wildcard origins, and disabled dev/mock auth. Invalid production-like configuration fails with bounded `CONFIGURATION_INVALID` responses and cannot fall back to in-memory usage or persistence.

Only anon keys are public. Service-role keys, provider keys, admin allowlists, persistence, quota, Career Context lineage, scoring adapters and deletion authority are server-only and cannot be selected by request fields or client environment values.

MockMate is wired for Vercel + Supabase with a free-first launch posture: user-owned data in Postgres/RLS, Supabase Auth tokens on every protected API call, and friendly daily limits for AI-heavy features.

## 1. Supabase

Future hosted setup requires separate AP authorization. When authorized:

1. Create or select the approved Supabase project.
2. Apply the complete ordered SQL chain in `supabase/migrations/`.
3. Enable approved Auth providers.
4. Add only approved site URLs to Auth redirect URLs.
5. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
6. Verify RLS plus Career Context, ClearSpeak attempt and account-data-deletion RPC authority in the target.

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

## 3. Vercel

Vercel configuration/deployment is a future separately authorized action. When authorized, use one project for the Vite app and API functions and keep all service-role/provider/admin values server-only.

The included `vercel.json` builds the frontend/backend and routes `/api/*` through `api/[...path].ts` into the Express app.

## 4. Source Build Gates

Run these before merging source changes:

```bash
npm run typecheck
npm run verify:supabase
npm run build
cd backend && npm run build
npm run smoke:production
npm run audit:production
npm run mobile:typecheck
npm run mobile:lint
npm run test:mobile-governed-parity
```

The GitHub MockMate Production Readiness workflow remains the retained exact-head merge authority.

Remote hosted smoke is **not** implied by source checks. It remains fail-closed unless hosted inspection is separately authorized.

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
- `personal_contact` Career Context facts are not groundable; P0-7 mobile narrows explicit selection further to standard-sensitivity Resume/ClearSpeak facts.
- stored product data includes only authorized parsed/derived records, interview history/reports, Career Context lineage, ClearSpeak derived results/progress, and usage records.
- `DELETE /api/me/data` deletes app data through server authority and returns `AccountDeletionResponseSchema`.
- current app-data deletion retains the Supabase Auth identity; clients must not claim the identity/account itself was deleted.

## 7. Browser and Mobile Product Path

The browser app remains the primary working/public-path product. It is the reference for Supabase Auth, protected APIs, quotas, privacy copy, Career Context and adaptive Interview authority.

P0-6 brought native Resume, ClearSpeak Accent and adaptive Interview onto the governed backend. P0-7 adds native Career Context controls, explicit one-time grounded Interview setup, and governed app-data deletion.

The `mobile/` app remains source-validated only. Public Android/iOS availability requires separately authorized hosted integration, physical-device QA, EAS output, signing and store review.

## 8. PWA Launch Path

The installable web app remains the first mobile launch path unless a native release is separately authorized.

- `/api/*` and `/ephemeral-token` stay network-only.
- offline UX must not pretend Resume, ClearSpeak, Career Context or Interview network operations succeeded.
- Android Chrome installability and iOS Add to Home Screen remain controlled-beta acceptance targets after hosted authorization.

## 9. Operations

- CI runs retained contracts, builds, disposable database/RLS assertions, browser/adaptive/Career Context journeys, mobile typecheck/lint/parity, secret scans, adversarial checks and source-only readiness evidence.
- `/api/admin/usage` is admin-only and must not expose resume text, raw audio, interview answers or report content.
- source-only evidence must never be represented as hosted/security/compliance/store proof.

## 10. Evidence boundary and launch checks

Locally/disposably proven by exact-head gates: builds/types/tests, migration/RLS/RPC journeys, authentication rejection, quotas/replay paths, app-data deletion contracts, Career Context grounding, browser/PWA network authority, mobile source parity, secret rejection and disposable smoke.

Not proven by source CI: a hosted Vercel/Supabase preview, real credentials/providers/users, operational monitoring, EAS builds, store distribution, production/security/compliance readiness, or physical-device/real-user QA.

Before any public launch, obtain separate authorization and then verify the target-specific items in `docs/launch-runbook.md`.