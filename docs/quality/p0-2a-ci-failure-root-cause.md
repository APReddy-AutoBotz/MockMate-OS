# CI Failure Analysis & Root Cause Report (Workflows 29975930536 & 29999855680)

## 1. Summary of Workflow Failures

### Workflow Run 29975930536
- **Branch**: `antigravity/p0-2-future-ready-interview-engine`
- **Commit SHA**: `f69e02a22ead6fce0045292687172cc0082d887e`
- **Failed Step**: `6. Frontend unit tests`
- **Status**: `FAILURE` (Fixed in P0-2A by aligning `MockSession.test.tsx` assertions to `submitAdaptiveTurn` and adding JSDOM `crypto.randomUUID` fallback).

---

### Workflow Run 29999855680
- **Branch**: `antigravity/p0-2-future-ready-interview-engine`
- **Commit SHA**: `2c0b401f52ce3081f86b260ffe1378e64724843e`
- **Failed Step**: `7. Disposable PostgreSQL runtime migration verification`
- **Status**: `FAILURE`
- **Gate Results**:
  - Frontend unit tests: `PASS`
  - Static migration verification: `PASS`
  - Disposable PostgreSQL runtime verification: `FAIL`
  - All subsequent quality gates: `SKIPPED`

---

## 2. Failed Step & Exact Database Failure (Workflow 29999855680)

### Failure Description
The PostgreSQL runtime verifier `scripts/verify-supabase-runtime.mjs` failed when calling `atomic_submit_adaptive_turn` on line 263 and line 301.

### Root Cause & Signature Mismatch
The committed PostgreSQL RPC signature in `supabase/migrations/20260723_add_adaptive_interview_engine.sql` defines parameters in the following exact order:

```sql
public.atomic_submit_adaptive_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_client_submission_id uuid,
  p_question_id text,
  p_expected_session_version integer,
  p_answer_kind text,
  p_answer_text text,
  p_turn_evaluation jsonb,
  p_controller_decision jsonb,
  p_challenge_event jsonb,
  p_dimension_state jsonb,
  p_next_question_json jsonb,
  p_next_question_id text,
  p_next_stage text,
  p_next_kind text,
  p_next_root_index integer,
  p_probe_count integer,
  p_challenge_count integer,
  p_is_complete boolean,
  p_max_turns integer,
  p_total_roots integer,
  p_turn_id uuid DEFAULT NULL,
  p_adaptive_response jsonb DEFAULT NULL
)
```

However, `scripts/verify-supabase-runtime.mjs` called `atomic_submit_adaptive_turn` using an obsolete long positional parameter list where:
- Position 3 passed `'${turnUuid}'::uuid` (a turn ID) instead of `p_client_submission_id` (`'${submissionUuid}'::uuid`).
- Position 6 passed `'${submissionUuid}'::uuid` instead of `p_answer_kind`.

Because PostgreSQL attempted to cast positional values to incompatible argument types (e.g. casting UUID to `answer_kind text`), the function invocation threw a PostgreSQL type signature error and aborted the verification run.

---

## 3. Corrective Action Plan (P0-2B)

1. **Rewrite Runtime RPC Verifier Invocation**:
   Replace all positional function calls in `scripts/verify-supabase-runtime.mjs` with PostgreSQL named parameter notation:
   ```sql
   SELECT public.atomic_submit_adaptive_turn(
     p_session_id => '${sessionId}'::uuid,
     p_user_id => '${userId}'::uuid,
     p_client_submission_id => '${submissionUuid}'::uuid,
     p_question_id => 'q1',
     p_expected_session_version => 1,
     ...
   );
   ```
2. **Add `adaptive_request_hash` Column & Immutability**:
   Add `adaptive_request_hash text` to `interview_turns` and include `p_adaptive_request_hash` parameter handling in `atomic_submit_adaptive_turn`.
3. **Comprehensive Verifier Tests**:
   Ensure all 18 PostgreSQL runtime assertions run using named arguments and pass 100%.

---

## 4. Failed Step & Mobile Failure (Workflow 30080018496)

### Failure Description
The exact-head workflow `30080018496` failed at step `15. Mobile typecheck` (`cd mobile && npm run mobile:typecheck`).

### Exact TypeScript Diagnostic Messages
1. `mobile/src/services/apiClient.ts(147,21)`: `error TS2314: Generic type 'ZodType<Output, Def, Input>' requires between 1 and 3 type arguments.`
2. `mobile/src/services/apiClient.ts(151,22)`: `error TS2314: Generic type 'ZodType<Output, Def, Input>' requires between 1 and 3 type arguments.`
3. `mobile/src/services/apiClient.ts(159,22)`: `error TS2314: Generic type 'ZodType<Output, Def, Input>' requires between 1 and 3 type arguments.`
4. `mobile/src/services/apiClient.ts(167,24)`: `error TS2314: Generic type 'ZodType<Output, Def, Input>' requires between 1 and 3 type arguments.`
5. `mobile/src/services/mockGeminiService.ts(45,71)`: `error TS2339: Property 'expectedQuestionIndex' does not exist on type 'AdaptiveAnswerSubmissionRequest'.`
6. `mobile/src/services/mockGeminiService.ts(61,42)`: `error TS2345: Argument of type '{ questionId: string; expectedQuestionIndex: number; answerKind: "answered"; answerText: string; }' is not assignable to parameter of type 'never'.`
7. `mobile/src/services/mockGeminiService.ts(68,17)`: `error TS2339: Property 'completedTurnId' does not exist on type 'AnswerSubmissionResponse'.`
8. `mobile/src/services/mockGeminiService.ts(108,3)`: `error TS2719: Two different types with this name exist, but they are unrelated.`

### Root Causes
- **Generic Type Parameter Mismatch**: `mobile/src/services/apiClient.ts` typed schemas using `schema: z.ZodType<T>`, which requires 3 type arguments in Zod (`z.ZodType<Output, Def, Input>`).
- **Obsolete V1 Session Parameters**: `mobile/src/services/mockGeminiService.ts` called `submitAdaptiveTurn` and `submitAnswerAndGetNext` passing obsolete `expectedQuestionIndex` and expecting `completedTurnId` from V1 schemas instead of mandatory V2 concurrency fields (`expectedSessionVersion: number`, `clientSubmissionId: string`).

### Corrective Action Plan (P0-2D)
1. Update `mobile/src/services/apiClient.ts` to use schema-first generic type constraints:
   ```ts
   async function request<TSchema extends z.ZodTypeAny>(
     endpoint: string,
     schema: TSchema,
     options?: RequestOptions
   ): Promise<z.output<TSchema>>
   ```
2. Update `mobile/src/services/mockGeminiService.ts` to align obsolete internal mobile service method signatures with V2 shared contracts (`expectedSessionVersion`, `clientSubmissionId`) while keeping native mobile Interview screen disabled.
3. Verify `cd mobile && npm ci && npx tsc --noEmit && npm run lint` passes 100%.

