# P0-1 Platform Integrity, Auth, and Contracts Plan

## 1. Baseline Commit SHA
`6d47dd8`

## 2. Current authentication architecture
Currently, the browser implementation attempts to reconstruct cached Supabase metadata as a "mock user" that returns a `test-token` rather than actually checking the current session. The backend often blindly accepts this or is configured insecurely. We will migrate to canonical, real tokens from `supabase.auth.getSession()` (and equivalent for mobile) and strictly reject mock tokens in production.

## 3. Current API route inventory
- Legacy routes: `/api/ai/*`
- New (intended) canonical routes: `/api/interview/sessions`, `/api/interview/sessions/:id/answers`, `/api/interview/sessions/:id/report`, `/api/interview/plan`, `/api/interview/calibrate`

## 4. Current duplicated contract inventory
Interfaces were historically duplicated between `backend/types.ts`, `shared/types.ts`, and `mobile/src/types`. They were static TypeScript interfaces without runtime validation. We will consolidate these into one Zod-based runtime validated contract in `shared/contracts`.

## 5. Current score-fallback inventory
`InterviewReport.tsx`, `MockSession.tsx`, and mobile equivalents rely on fallbacks like `|| 88`, `|| 85`, `score ?? 80`. These hallucinated defaults must be replaced with `N/A`, `INCOMPLETE`, or valid `0` values.

## 6. Files retained
Most components and services are retained but heavily modified (e.g., `InterviewReport.tsx`, `MockSession.tsx`, `mobile/src/app/(app)/interview.tsx`, `backend/server.ts`).

## 7. Files replaced
- `shared/types.ts` is replaced by Zod runtime schemas in `shared/contracts/index.ts`.
- `services/mockGeminiService.ts` and `mobile/src/services/mockGeminiService.ts` will strictly call new REST endpoints.

## 8. Files deleted
- `backend/routes/aiRoutes.ts`
- Duplicated type definitions in `backend/types.ts`.

## 9. Database changes
We will add `current_question_index`, `pending_question_id`, `pending_question`, `evaluation_status`, `evaluation_error_code`, `completed_at` to `interview_sessions`. We will NOT add `auth_user_id`; we will use the existing `user_id` for RLS.

## 10. Compatibility risks
Old versions of the mobile app or browser cache expecting legacy routes (`/api/ai`) or local scoring fallbacks will break. Force updates or cache invalidation is required.

## 11. Test strategy
- Auth Tests: Ensure production rejects `test-token`.
- Contract Tests: Verify Zod payload validation for valid, malformed, and legacy shapes.
- Interview Tests: Ensure `401` on unauthenticated, `409` on wrong `questionId`, and that only persisted server questions are returned.
- Truthfulness Tests: Ensure missing score data results in `N/A` or `INCOMPLETE`.
- Smoke Tests: Extend `production-smoke.mjs` to ensure the new API rejects unauthenticated access.

## 12. Rollback strategy
If the migration fails, the codebase can be reverted to `6d47dd8`. Database schema additions are strictly additive (`current_question_index`, etc.) and thus backward-compatible with legacy logic if rolled back.

## 13. Explicit non-goals
- Do not redesign the visual product.
- Do not rebuild the ATS scoring engine.
- Do not expand ClearSpeak content.
- Do not add future adaptive interview features yet.