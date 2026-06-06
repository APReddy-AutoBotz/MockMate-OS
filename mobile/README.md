# MockMate Android App

This Expo app is the Android-first native client for MockMate. The browser/PWA app remains the first production launch target; this app is prepared for Play Store internal testing after the deployed API is stable.

## Required Environment

Copy `.env.example` to `.env` and set:

```env
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=https://your-vercel-domain.app
EXPO_PUBLIC_ENABLE_MOCK_AUTH=false
```

Use mock auth only for local development against a dev backend. Store builds must keep `EXPO_PUBLIC_ENABLE_MOCK_AUTH=false`.

## Local Checks

```bash
npm install
npx tsc --noEmit
npm run lint
npx expo start
```

## Android Builds

```bash
eas build --platform android --profile preview
eas build --platform android --profile production
```

The production profile builds an Android App Bundle for Play Console. Before public release, complete Play Console privacy forms, upload screenshots, verify account deletion, and run internal testing with real Supabase users.
