# P0-1D Bypass Removal Inventory

## Inventory of Introduced Bypasses & Anti-Patterns

### 1. `@ts-nocheck` Directives
- `App.tsx:1`
- `components/InterviewReport.tsx:1`
- `components/SessionPrep.tsx:1`
- `components/SimplifiedReport.tsx:1`
- `components/clearspeak/ClearSpeakDashboard.tsx:1`
- `components/clearspeak/ClearSpeakOnboarding.tsx:1`
- `components/clearspeak/ClearSpeakSession.tsx:1`
- `mobile/src/app/(app)/interview.tsx:1`
- `services/storageService.ts:1`

### 2. `@ts-ignore` Directives
- None found.

### 3. `z.any()` Usage at API/Schema Boundaries
- `backend/services/aiService.ts:133`: `questionSet: z.array(z.any())`
- `shared/src/index.ts:107`: `expectedSignals: z.array(z.string()).default([]).or(z.any())`

### 4. Missing `types/ui` Imports
- `App.tsx:2`
- `components/Hub.tsx:1`
- `components/InterviewReport.tsx:2`
- `components/OnboardingQuestions.tsx:1`
- `components/PilotFeedbackCard.tsx:2`
- `components/ReportView.tsx:1`
- `components/RoleCapture.tsx:1`
- `services/storageService.ts:2`

---

## Action Plan for Removal
1. Remove all 9 `@ts-nocheck` headers.
2. Create `types/ui.ts` defining UserProfile, PilotFeedback, SessionHistoryRecord, QuestionHistoryItem, etc.
3. Replace all `z.any()` occurrences in `shared` and `backend` with explicit Zod schemas.
4. Eliminate blanket `any` and improper type casts across App, components, services, backend, shared, and mobile.
