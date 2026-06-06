# MockMate Mobile Production Plan

MockMate should ship as a real browser app first, then Android with the same product quality and privacy defaults. The current `mobile/` folder is an Android-first Expo client prepared for internal testing, not a public Play Store release.

## Mobile Strategy

Use React Native with Expo for the first production mobile app.

Why Expo:

- Fast Android/iOS builds with EAS
- Good Supabase Auth support with secure token storage
- Mature audio recording APIs for ClearSpeak
- Easier app-store release workflow than maintaining native projects manually
- Still allows native modules later if ClearSpeak needs deeper audio controls

Do not ship a simple WebView wrapper as the primary mobile app. MockMate depends on uploads, microphone practice, auth, reminders, and offline-friendly progress states; these should feel native.

## Shared Product Contract

Mobile must use the same backend APIs as the browser app:

- `POST /api/resume/parse`
- `POST /api/resume/score`
- `POST /api/resume/suggest`
- `POST /api/resume/rewrite`
- `POST /api/interview/plan`
- `POST /api/interview/answer`
- `POST /api/interview/report`
- `GET /api/interview/history`
- `GET/POST /api/clearspeak/profile`
- `POST /api/clearspeak/generate`
- `POST /api/clearspeak/score`
- `GET /api/clearspeak/progress`
- `GET /api/me/usage`
- `DELETE /api/me/data`

Every protected request must send:

```http
Authorization: Bearer <supabase_access_token>
```

## Mobile Build Phases

### Phase 1: App Foundation

- Keep the Expo app identity as MockMate with Android package `com.mockmate.app`.
- Use Supabase Auth with secure Expo token storage.
- Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and `EXPO_PUBLIC_API_URL`.
- Keep mock auth disabled for every store or internal testing build.
- Build the same first-run flow as the browser app: onboarding to "Your practice home".

### Phase 2: Core User Journeys

- Resume:
  - Pick PDF/DOC/DOCX from the device.
  - Send auth-protected multipart upload to `/api/resume/parse`.
  - Show ATS review and friendly suggestions.
- Speaking:
  - Record up to 60 seconds.
  - Upload audio as multipart form data.
  - Show score, clear feedback, and progress.
- Interview:
  - Quick setup.
  - Practice question flow.
  - Report and history.

### Phase 3: Premium Mobile Polish

- Native-feeling navigation, loading states, empty states, and error recovery.
- Brand-consistent navy/gold theme with readable blue-gray secondary text.
- Haptics only for meaningful actions.
- No technical jargon in copy.
- Accessible touch targets and visible focus/pressed states.

### Phase 4: Release

- EAS build for Android and iOS.
- TestFlight and internal Play testing.
- Privacy policy and account deletion flow verified.
- Store screenshots for landing, practice home, resume review, speaking practice, interview report, and settings.

## Current Gap

The mobile app is not yet ready for public Play Store release. Before claiming native Android support in marketing or docs, verify:

```bash
cd mobile
npm install
npx tsc --noEmit
npm run lint
npx expo start
eas build --platform android --profile preview
```
