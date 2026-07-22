# Platform Auth & Canonical Contract Boundaries

## Overview
This document details the architectural boundaries, authentication mechanisms, canonical data schemas, and server-authoritative session lifecycle for MockMate P0-1.

---

## 1. Authentication Model
- **Web Client**: All requests from the web frontend go through `services/apiClient.ts`, attaching standard Bearer tokens (`Authorization: Bearer <token>`).
- **Mobile Client**: All requests from Expo mobile client go through `mobile/src/services/apiClient.ts`, attaching Bearer tokens.
- **Backend Middleware**: `backend/middleware/authMiddleware.ts` verifies incoming Supabase JWT tokens via `supabaseAdmin` service role client.
- **Production Guard**: In production (`NODE_ENV=production`), `ENABLE_DEV_AUTH` must be `false` or startup halts. Test tokens and cached dev users are rejected with `401 Unauthorized`.

---

## 2. Canonical Shared Contracts (`mockmate-shared`)
All API request and response payloads across browser, backend, and mobile strictly enforce Zod schemas exported by `mockmate-shared`:

### Key Schemas:
- **`ApiErrorCodeSchema`**: 11 explicit error codes (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `CONTRACT_RESPONSE_INVALID`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`).
- **`InterviewSessionStartRequestSchema` / `ResponseSchema`**: Server-authoritative session initialization.
- **`AnswerSubmissionRequestSchema` / `ResponseSchema`**: Atomic turn submission via `atomic_submit_answer` database RPC.
- **`FinalReportSchema`**: Structured multi-dimensional evaluation report, with `EvaluationStatus` ('scored' | 'insufficient_evidence' | 'not_tested') and `ReportGenerationState` ('pending' | 'processing' | 'completed' | 'failed') cleanly separated. Zero (`0`) scores and `null` scores are preserved without dummy score fallback.
- **No `z.any()`**: All schemas specify strict fields or explicit object shapes.

---

## 3. Server-Authoritative Session Progression
1. **Creation**: `POST /api/interview/sessions` initializes `status = 'active'`, `current_question_index = 0`, `pending_question_id`, and `pending_question`.
2. **Answer Submission**: `POST /api/interview/sessions/:id/answers` calls `atomic_submit_answer` database function. It validates `expectedQuestionIndex` against the database state (returning `409 CONFLICT` on stale question or index mismatch), inserts the turn into `interview_turns`, advances `current_question_index`, and sets `status = 'awaiting_report'` upon receiving the final answer.
3. **Database Integrity**: Turn history is stored exclusively in `interview_turns`. The obsolete `interview_sessions.history` column reference has been removed from all RPC functions and queries.

---

## 4. Environment & Security Controls
- Standardized `SUPABASE_SERVICE_ROLE_KEY` (renamed from `SUPABASE_SERVICE_KEY`).
- CORS origin restriction enforced in production backend startup guards (`ALLOWED_ORIGINS`).
- Zero `@ts-nocheck` directives across the entire product codebase.
