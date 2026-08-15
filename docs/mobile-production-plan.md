# MockMate Mobile Production Plan

> P0-6 is the source-parity milestone for the existing Expo client. It brings native Resume, ClearSpeak Accent Practice, and Interview onto the same governed backend contracts as the browser. It does **not** authorize EAS builds, store submission, hosted infrastructure mutation, provider activation, or public mobile claims.

MockMate remains browser-first for public release. The `mobile/` app is an Android-first Expo client that must prove the same auth, privacy, contract, and fail-closed behavior before any store rollout.

## Mobile Strategy

Use React Native with Expo for the first production mobile app.

Why Expo:

- native document upload and microphone flows;
- Supabase Auth with secure token storage;
- one shared backend and contract package with the browser;
- Android/iOS release paths through EAS when separately authorized;
- room for deeper native audio controls later without using a WebView wrapper.

## Governed Shared Product Contract

Core mobile screens must use `mobile/src/services/apiClient.ts` with authenticated requests and shared Zod response schemas. The client never owns provider, model, scoring-policy, service-role, retention, or privileged adapter authority.

### Resume — P0-4 governed path

- `POST /api/resume/parse`
  - multipart PDF/DOCX only;
  - validate `ResumeParseResponseSchema`;
  - raw extracted text is transient and must not remain in component state after scoring.
- `POST /api/resume/score`
  - validate `GovernedResumeScoreResponseSchema`;
  - render `atsDiagnostics` and governed JD `scoreStatus` / nullable `jdMatchScore` truthfully.
- `POST /api/resume/suggest`
  - future mobile rewrite UX may consume `GovernedResumeSuggestionResponseSchema` with per-suggestion approval.

Legacy bulk rewrite endpoints are not part of the mobile contract.

### ClearSpeak Accent — P0-5 governed path

- `GET /api/clearspeak/v1/accent/catalog`
- `POST /api/clearspeak/v1/accent/prompts`
- `POST /api/clearspeak/v1/accent/attempt-authority`
- `POST /api/clearspeak/v1/accent/attempts`
- `GET /api/clearspeak/v1/accent/attempts/:attemptId/status`
- `POST /api/clearspeak/v1/accent/attempts/:attemptId/cancel`
- `GET /api/clearspeak/v1/accent/attempts`
- `DELETE /api/clearspeak/v1/accent/attempts/:attemptId`

The legacy `/api/clearspeak/score` route is **not** a mobile Accent Practice API.

Mobile must preserve P0-5 semantics:

- explicit microphone consent;
- server-issued attempt capability before upload;
- authoritative prompt/profile/reference/scoring selectors;
- same attempt ID + same audio/metadata for response-loss retry;
- V1 unscored and V2 evidence-scored results validated separately;
- no composite accent-quality, native-ness, nationality, identity, or employability score;
- each dimension independently shows score or `No score`, confidence/evidence status, and server-owned explanation;
- raw audio remains ephemeral and is never persisted by the app.

Until a real speech scorer is separately authorized, ordinary user recordings are expected to complete as truthful V1 null-score results rather than synthetic estimates.

### Interview — server-authoritative adaptive path

- `POST /api/interview/plan`
  - validate `InterviewPlanSchema`.
- `POST /api/interview/sessions`
  - validate `InterviewSessionStartResponseSchema`.
- `POST /api/interview/sessions/:sessionId/answers`
  - use `AdaptiveAnswerSubmissionRequestSchema` with UUID `clientSubmissionId` and exact `expectedSessionVersion`;
  - validate `AdaptiveAnswerSubmissionResponseSchema`;
  - preserve the same submission ID for exact retry after response loss.
- `POST /api/interview/sessions/:sessionId/report`
  - validate `FinalReportSchema`.

Mobile V1 may use typed answers and an ungrounded session. It must never invent a question, evaluation, next action, Career Context bridge, or report when the backend is unavailable.

### Account lifecycle

- `GET /api/me/usage`
- `DELETE /api/me/data`

Every protected request uses:

```http
Authorization: Bearer <supabase_access_token>
```

## Build Phases

### Phase 1 — Foundation

- Keep package identity `com.mockmate.app`.
- Use Supabase Auth with secure Expo token storage.
- Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_API_URL`.
- Keep mock auth disabled for preview/release-like builds.
- Public Expo environment values may contain only public API origin, Supabase URL, and anon key.

### Phase 2 — Governed Core Journeys

P0-6 source scope:

- Resume: governed parse + ATS/JD diagnostics.
- ClearSpeak: governed Accent Practice attempt lifecycle and V1/V2 result rendering.
- Interview: canonical plan → session → adaptive typed turns → report.
- CI: `test:mobile-governed-parity` plus mobile TypeScript/lint must prevent return of stale paths/shapes/placeholders.

### Phase 3 — Native QA & Polish

Only after source parity is merged:

- physical-device auth and token-refresh verification;
- real document upload and microphone lifecycle testing;
- interruption/background/permission-revocation recovery;
- accessibility, touch targets, keyboard behavior and screen-reader review;
- account deletion against an approved hosted test environment;
- native history/progress polish and optional governed Career Context selectors.

### Phase 4 — Release (separate approval)

- EAS preview build;
- TestFlight/internal Play testing;
- privacy policy and account deletion verification;
- store assets/screenshots;
- production signing and store submission.

## Current Release Boundary

Passing source CI does **not** prove a public mobile release. Before claiming native Android/iOS availability, separately authorize and verify hosted token exchange, real file/audio behavior, approved provider boundaries, EAS output, account deletion, physical-device QA, signing, and store review.

Source-only checks:

```bash
npm ci
npm run test:mobile-governed-parity
npm run mobile:typecheck
npm run mobile:lint
```

The following remain explicitly gated and must not be run as part of P0-6 without separate approval:

```bash
cd mobile
npx expo start
eas build --platform android --profile preview
eas build --platform ios --profile preview
```
