# MockMate

MockMate is a production-grade job-prep platform for individual job seekers who need help with three hard moments: building an ATS-friendly resume, improving spoken English with real-speech evidence, and practicing adaptive AI-powered interviews.

**Stack**: Vite + React · Express API (Netlify Functions) · Supabase Auth + Postgres + RLS · Expo/React Native (Android-first mobile)

**AI Providers**: Gemini · Groq · provider-free deterministic fallback for all core flows

**Privacy-first**: No raw resume files or raw audio stored. Free-first with daily quotas and cache-by-hash.

---

## Features

| Module | What it does |
|--------|-------------|
| **Resume Builder** | Upload → AI-powered ATS diagnostics → governed bullet rewrites → PDF export |
| **ClearSpeak** | Accent practice, real-speech evidence recording, pronunciation scoring, session history |
| **Interview Practice** | Adaptive AI interviewer, challenge/recovery evaluation, final evidence-grounded reports |
| **Career Context** | Cross-module grounding — resume facts, ClearSpeak metrics, and interview signals flow into future sessions with explicit user consent |
| **Mobile (Android)** | Expo app with full Resume, Interview, and ClearSpeak parity; Career Context and account authority |

---

## Current Status — P0-8 Complete

| Phase | Delivery |
|-------|---------|
| P0-1 | Platform integrity, shared runtime contracts, auth middleware, RLS, disposable-DB verification |
| P0-2 | Adaptive interview engine — challenge/recovery, evidence aggregation, narrative reporting |
| P0-3 | Career Context domain model, cross-module grounding, immutable snapshots, 41 PostgreSQL runtime assertions |
| P0-4 | Resume integrity and governed ATS rewrites |
| P0-5 | ClearSpeak governed real-speech evidence |
| P0-6 | Mobile core journey parity |
| P0-7 | Mobile Career Context and account authority parity |
| P0-8 | Authorized hosted preview on Netlify, production-like acceptance gates |

The browser app is the **primary working product**. The `mobile/` folder is an Android-first Expo app validated to source contracts; it is not yet ready for public Play Store / App Store release (EAS builds, store metadata, privacy declarations, and real-user QA remain).

---

## Prerequisites

- Node.js 20+
- npm
- Supabase project (free tier works for development)
- Gemini and/or Groq API keys *(optional — provider-free startup is fully supported)*
- Netlify account for preview/production deployment
- Expo/EAS account for Android internal testing *(later)*

---

## Local Setup

### 1. Install dependencies

```bash
# Frontend
npm install

# Backend
cd backend && npm install && cd ..

# Shared contracts
cd shared && npm install && cd ..
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...        # optional
GOOGLE_API_KEY=...        # optional
GROQ_API_KEY=...          # optional
ADMIN_EMAILS=...
ENABLE_DEV_AUTH=true
```

For the Android app, copy `mobile/.env.example` to `mobile/.env` and fill `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_API_URL`.

### 3. Apply database migrations

Apply the **complete ordered migration chain** in `supabase/migrations/` to your Supabase project. Do not apply only the initial migration to an existing environment — the full 45-file chain is required.

### 4. Run locally

```bash
# Frontend (http://localhost:5173)
npm run dev

# Backend API (http://localhost:3001) in a separate terminal
cd backend && npm run dev
```

---

## Source Quality Gates

Run these before any deployment:

```bash
npm run typecheck          # TypeScript across frontend + backend + shared
npm run check:production   # Full production source gate
npm run check:mobile       # Mobile typecheck + lint
npm run verify:supabase    # Migration + RLS DDL verification
```

Run the full test suite:

```bash
npm test                   # Frontend + shared Jest tests
cd backend && npm test     # Backend Jest tests
```

---

## Hosted Preview (Netlify)

A hosted preview must be configured fail-closed:

```env
MOCKMATE_RUNTIME_MODE=preview
ENABLE_DEV_AUTH=false
VITE_ENABLE_DEV_AUTH=false
ALLOWED_ORIGINS=https://<exact-preview-origin>
PREVIEW_ORIGIN=https://<exact-preview-origin>
MOCKMATE_PREVIEW_TARGET_ID=<explicit-preview-target-id>
MOCKMATE_SUPABASE_PROJECT_REF=<supabase-project-ref>
MOCKMATE_DEPLOYED_GIT_SHA=<exact-40-char-commit-sha>
SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-secret>
VITE_SUPABASE_ANON_KEY=<browser-safe-anon-key>
```

> **Never** put the service-role key or any AI provider credential in Git, a `VITE_` variable, acceptance evidence, or client logs.

Run the hosted acceptance gate:

```bash
npm run acceptance:hosted
```

See [`docs/launch-runbook.md`](docs/launch-runbook.md) for the governed hosted path and stop/rollback conditions.

---

## Production Launch Checklist

Before opening to real users:

- [ ] Deploy Netlify preview with production Supabase environment variables
- [ ] `ENABLE_DEV_AUTH=false` and `MOCKMATE_RUNTIME_MODE=preview` confirmed
- [ ] `/api/health` returns 200; protected APIs return 401 without valid token
- [ ] Run full flow: signup → onboarding → resume → ClearSpeak → interview → report → delete account
- [ ] PWA install from Chrome; offline message visible
- [ ] Admin usage endpoint (`/api/admin/usage`) responds for `ADMIN_EMAILS` list
- [ ] Confirm privacy policy and terms copy in landing footer
- [ ] Run `npm run acceptance:hosted` against the live preview URL
- [ ] Supabase leaked-password protection enabled (requires paid tier)
- [ ] Configure custom domain + HTTPS
- [ ] Rate limiting and abuse controls verified

---

## Mobile (Android)

The `mobile/` Expo app mirrors all browser features. For the Play Store path:

1. Configure EAS Build (`eas.json`)
2. Create Play Console app listing with screenshots and descriptions
3. Submit privacy policy and data safety declarations
4. Run internal testing track with real Android devices
5. Graduate to production after QA sign-off

See [`docs/mobile-production-plan.md`](docs/mobile-production-plan.md) for the full governed path.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [`docs/launch-runbook.md`](docs/launch-runbook.md) | Exact production preview and launch checklist |
| [`docs/free-first-production.md`](docs/free-first-production.md) | Supabase/Netlify setup, quotas, and privacy |
| [`docs/mobile-production-plan.md`](docs/mobile-production-plan.md) | Android/iOS production path |
| [`docs/architecture/`](docs/architecture/) | Platform auth, adaptive interview engine, career context design |
| [`docs/quality/`](docs/quality/) | Per-phase evidence reports |
| [`docs/planning/`](docs/planning/) | Per-phase execution plans |

---

## Repository

**GitHub**: [APReddy-AutoBotz/MockMate-OS](https://github.com/APReddy-AutoBotz/MockMate-OS)
