# MockMate Mobile Production Plan

> P0-7 Mobile Career Context & Account Authority Parity is merged on `main` at `38520a682d1ac6bd9e82724e753f03f67c87cb5f`, with post-merge Production Readiness run #316 / `31941312775` fully green. P0-8 Authorized Hosted Preview & Production-Like Acceptance is active in Draft PR #18 and authorizes a dedicated browser/API preview/test environment only. It does **not** authorize EAS builds, TestFlight/Play/App Store publication, public native claims, uncontrolled users, customer data, or purchase/activation of a new paid speech provider.

MockMate remains browser-first for public release. The `mobile/` app is an Android-first Expo client that already carries the governed P0-6/P0-7 source journeys and must later prove the same auth, privacy, contract, replay and fail-closed behavior against the accepted hosted backend on physical devices before any store rollout.

## Mobile Strategy

Use React Native with Expo for the first production mobile app.

Why Expo:

- native document upload and microphone flows;
- Supabase Auth with secure token storage;
- one shared backend and contract package with the browser;
- Android/iOS release paths through EAS when separately authorized;
- room for deeper native audio controls later without using a WebView wrapper.

## Governed Shared Product Contract

Core mobile screens use `mobile/src/services/apiClient.ts` with authenticated requests and shared Zod response schemas. The client never owns provider, model, scoring policy, service-role, retention, Career Context truth, bridge/snapshot authority, quota or privileged adapter authority.

### Resume — governed path

- `POST /api/resume/parse` validates `ResumeParseResponseSchema`; PDF/DOCX only and raw extracted text remains transient.
- `POST /api/resume/score` validates `GovernedResumeScoreResponseSchema` and renders ATS/JD status truthfully.
- future mobile rewrite UX may use `POST /api/resume/suggest` with `GovernedResumeSuggestionResponseSchema` and per-suggestion approval.

Legacy bulk rewrite endpoints are not part of the mobile contract.

### ClearSpeak Accent — governed path

Mobile uses:

- `GET /api/clearspeak/v1/accent/catalog`
- `POST /api/clearspeak/v1/accent/prompts`
- `POST /api/clearspeak/v1/accent/attempt-authority`
- `POST /api/clearspeak/v1/accent/attempts`
- `GET /api/clearspeak/v1/accent/attempts/:attemptId/status`
- `POST /api/clearspeak/v1/accent/attempts/:attemptId/cancel`
- `GET /api/clearspeak/v1/accent/attempts`
- `DELETE /api/clearspeak/v1/accent/attempts/:attemptId`

The legacy `/api/clearspeak/score` route is **not** a mobile Accent Practice API.

Mobile preserves P0-5 semantics: explicit microphone consent, server-issued attempt authority, exact response-loss retry, V1/V2 provenance, independent evidence-backed dimensions, no native-ness/nationality/employability/composite score, and ephemeral raw audio.

Until a real speech scorer is separately authorized, ordinary user recordings may complete as truthful V1 null-score results rather than synthetic estimates.

### Career Context — merged P0-7 governed path

Native Career Context uses shared schemas and server-owned state only:

- `GET /api/career-context` with `CareerContextGetResponseSchema`;
- `POST /api/career-context/rebuild` with `CareerContextRebuildResponseSchema`;
- `POST /api/career-context/preference` using exact `expectedContextVersion`;
- `POST /api/career-context/items/:itemId/decision` for bounded confirm/reject/revoke decisions using exact context version.

Mobile must reload on stale-version conflict rather than overwrite newer state. Conflicts remain visible and are not auto-resolved by the client.

### Interview — adaptive + optional one-time grounding

Ungrounded Interview remains available:

- `POST /api/interview/plan` → `InterviewPlanSchema`;
- `POST /api/interview/sessions` → `InterviewSessionStartResponseSchema`;
- `POST /api/interview/sessions/:sessionId/answers` with UUID `clientSubmissionId` + exact `expectedSessionVersion` → `AdaptiveAnswerSubmissionResponseSchema`;
- `POST /api/interview/sessions/:sessionId/report` → `FinalReportSchema`.

Merged P0-7 adds an explicit optional grounded path:

1. reload authoritative Career Context;
2. require personalization enabled and no unresolved user-choice conflicts;
3. user selects standard-sensitivity active facts from **one** source module: Resume or ClearSpeak;
4. user explicitly acknowledges one-time consent;
5. create `GroundingSnapshotCreateRequestSchema` with exact context version and stable UUID `clientRequestId`;
6. create `ModuleBridgeCreateRequestSchema` with canonical Resume→Interview or ClearSpeak→Interview purpose and a stable bridge request ID;
7. generate the Interview plan with **both** `snapshotId` and `bridgeId` and require matching server `plan.authority`;
8. start the session with the returned authoritative plan, `groundingSnapshot`, and `bridgeSessionId` so the backend revalidates and binds lineage;
9. uncertain response retries preserve the same snapshot/bridge request IDs and input set;
10. P0-6 session-generation invalidation continues to ignore stale late results after Exit/reset/unmount.

The mobile client never invents a snapshot, bridge, projection, question, evaluation, next action or report.

### Account lifecycle — merged P0-7 governed deletion

- `GET /api/me/usage`
- `DELETE /api/me/data` with `AccountDeletionResponseSchema`

Mobile clears local history/profile and signs out **only** when the server confirms `success: true` with no failed tables. If deletion is partial/unconfirmed, the authenticated local state is kept for retry.

Current deletion removes MockMate app data but retains the Supabase Auth identity unless the server explicitly reports otherwise. Mobile copy must not claim “account deleted” when only app data was deleted.

Every protected request uses the Supabase bearer token through `apiClient`.

## Build Phases

### Phase 1 — Foundation

- Keep package identity `com.mockmate.app`.
- Use Supabase Auth with secure Expo token storage.
- Set only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`, and approved runtime-mode public values.
- Keep mock auth disabled for preview/release-like builds.
- Never expose service-role/provider/admin secrets to Expo public environment variables.

### Phase 2 — Governed Core Journeys — merged source baseline

P0-6 + P0-7 source scope now on `main` includes:

- Resume governed parse + ATS/JD diagnostics;
- ClearSpeak governed Accent Practice lifecycle and V1/V2 result rendering;
- Interview canonical plan → session → adaptive typed turns → report;
- native Career Context review/rebuild/preference/item-decision controls;
- explicit one-time Resume/ClearSpeak grounded Interview lineage;
- governed app-data deletion and truthful Auth-identity retention copy;
- retained mobile TypeScript/lint/governed-parity gates and stale-response protections.

### Phase 3 — Hosted Browser/API Acceptance — P0-8 current milestone

P0-8 first proves the shared backend and browser journeys in an exact, dedicated Vercel + Supabase preview before native device execution. The dedicated Supabase target is active; current blocker: `DEDICATED_SUPABASE_ACTIVE__VERCEL_PREVIEW_NOT_BOUND`.

Required hosted proof includes exact target binding, bounded auth identities, Resume, ClearSpeak, Interview, Career Context/grounding, account deletion, cross-user isolation, concurrency/replay, admin/privacy and PWA/offline truth. Mobile does not become release-ready merely because this browser/API gate passes.

### Phase 4 — Native Internal QA & Polish — later authorization

Only after P0-8 hosted acceptance is green and a mobile-internal-test milestone is separately opened:

- point preview builds only at the exact accepted hosted API/Supabase target;
- physical-device auth/token-refresh verification;
- real bounded document upload and microphone lifecycle testing;
- interruption/background/permission-revocation recovery;
- accessibility, touch targets, keyboard behavior and screen-reader review;
- Career Context conflict/replay and app-data deletion verification against the accepted target;
- native history/progress polish.

### Phase 5 — Release — separate approval

- EAS preview/internal build;
- TestFlight/internal Play testing;
- privacy policy and deletion verification;
- store assets/screenshots;
- production signing and store submission.

## Current Release Boundary

Passing source CI or P0-8 browser/API hosted acceptance does **not** prove a public mobile release. Before claiming native Android/iOS availability, separately authorize and verify hosted token exchange from native builds, real bounded file/audio behavior, Career Context replay/grounding, app-data deletion, approved provider boundaries, EAS output, physical-device QA, signing and store review.

Source-only checks retained in P0-8:

```bash
npm ci
npm run test:mobile-governed-parity
npm run mobile:typecheck
npm run mobile:lint
```

EAS/store execution remains outside P0-8:

```bash
cd mobile
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

Do not run or publish those builds as part of P0-8. The next mobile milestone may consume the accepted hosted API as its explicit dependency after the controller closes P0-8.
