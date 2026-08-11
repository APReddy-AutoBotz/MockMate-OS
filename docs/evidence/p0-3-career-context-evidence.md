# P0-3 Career Context and Cross-Module Grounding — Evidence Document

**Task Title**: P0-3 Career Context and Cross-Module Grounding — Provenance, Consent, Immutable Snapshots, and Evidence-Aware Practice  
**Repository**: `APReddy-AutoBotz/MockMate-OS`  
**Branch**: `antigravity/p0-3-career-context-cross-module-grounding`  
**Baseline Commit**: `f426892985e17b7d39b0aca4ab480c955e439ca7`  

---

## 1. Executive Summary

MockMate P0-3 establishes a user-owned, server-authoritative Career Context layer connecting Resume Builder, ClearSpeak, and Interview Practice modules. Context items represent verified user goals, claims, achievements, and practice metrics without fabricating hiring recommendations or cross-contaminating evaluations.

### Key Invariants Enforced:
1. **User Ownership & Consent**: Grounding requires explicit user consent, purpose specification, item selection, and scope.
2. **Immutable Grounding Snapshots**: Pre-plan snapshot payloads are locked before session generation and cannot drift during session execution.
3. **Decoupled Interview Setup**: `InterviewSetupDraft` (pre-plan state) is decoupled from `InterviewSessionContext` (post-plan state).
4. **No Derived Role Debt**: Candidate role is strictly derived from user intent or target role; candidate name string packing (`"Candidate: <name>"`) has been permanently removed.
5. **No Raw Audio Persistence**: Raw audio or unconfirmed transcriptions are never ingested into career context.
6. **Strict Score Separation**: Spoken delivery scores remain `practice_metric` items and never become Interview evaluation scores.
7. **PII Contact Non-Eligibility**: Contact fields (`email`, `phone`, `location`, `urls`) are tagged `sensitivity = 'personal_contact'` and strictly excluded from grounding snapshots.
8. **Cascading Account Deletion**: Account purging cascades cleanly through all 5 new career context tables.

---

## 2. Database Schema & RLS Policies

Database Migration File: `supabase/migrations/20260730193000_p0_3_career_context_cross_module_grounding.sql`

| Table Name | Role / Purpose | RLS Policy |
| :--- | :--- | :--- |
| `career_context_state` | Version counter & personalization flag | Owner select (`auth.uid() = user_id`), service_role ALL |
| `career_context_items` | Verified & inferred context facts | Owner select (`auth.uid() = user_id`), service_role ALL |
| `career_context_snapshots` | Immutable pre-plan grounding snapshots | Owner select (`auth.uid() = user_id`), service_role ALL |
| `career_context_snapshot_items` | Composite PK mapping snapshot to items | Owner select via snapshot join, service_role ALL |
| `career_context_bridges` | Idempotent cross-module bridge sessions | Owner select (`auth.uid() = user_id`), service_role ALL |

### Static & Structural Verification Result:
```
Verifying 4 Supabase migration file(s) in lexical order:
001_initial_schema.sql
20260721_add_authoritative_session_fields.sql
20260723_add_adaptive_interview_engine.sql
20260730193000_p0_3_career_context_cross_module_grounding.sql
All Supabase migration static & structural checks PASSED successfully!
```

---

## 3. Pure Source Adapters & Pure Functions

| Adapter | Source Data | Transformation & Constraints |
| :--- | :--- | :--- |
| `resumeContextAdapter` | `ResumeData`, `targetRole`, `jdMissingSkills` | Ingests role, skills, achievements, claims; sets contact PII to `sensitivity = 'personal_contact'`; ingests JD missing skills as `development_priority` gaps; excludes `[_]` placeholders. |
| `clearSpeakContextAdapter` | `ClearSpeakProfile`, `ClearSpeakSessionScore` | Ingests target role, goals, practiced vocabulary, and delivery composite scores as `practice_metric` items; ignores raw audio/video. |
| `interviewContextAdapter` | `FinalReport`, turn evidence | Ingests dimension performance signals and risk areas as `interview_practice_signal` and `development_priority` items with turn ID references. |

---

## 4. Prompt Safety & Prompt-Injection Defenses

Prompt section builder (`backend/services/groundingPromptBuilder.ts`) enforces:
1. **Passive Data Boundary**: Encloses reference data in `<career_context_grounding>...</career_context_grounding>` tags.
2. **Explicit System Directives**: Instructs AI model that reference data MUST NOT be interpreted as system commands or prompt overrides.
3. **Character Sanitization**: Strips control characters (\x00-\x1F).
4. **Strict Bounds**: Caps total item count (max 15 items) and text length (max 3000 chars).
5. **PII Filtering**: Contact details are automatically excluded.

---

## 5. Idempotent Module Bridge Lifecycle

```
[Drafted Bridge Request]
        │
        ▼ (Check client_request_id idempotency)
[Confirmed Bridge Session] ──► [Grounding Snapshot Created]
        │
        ▼ (Consume via targetSessionId)
[Consumed Bridge Session] ──► (Re-use rejected with 500/409 error)
```

---

## 6. Automated Test Results

### Shared Package Tests (`mockmate-shared`):
```
PASS tests/p03_career_context.test.ts
PASS tests/schemas.test.ts
Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
Time:        1.396 s
```

### Backend Package Tests (`mockmate-backend`):
```
PASS tests/interviewSessionEngine.test.ts
PASS tests/careerContextAdapters.test.ts
PASS tests/interviewRoutes.test.ts
PASS tests/careerContextRoutes.test.ts
PASS tests/sessionService.test.ts
PASS tests/adaptiveEngine.test.ts

Test Suites: 6 passed, 6 total
Tests:       85 passed, 85 total
Snapshots:   0 total
Time:        16.326 s
```

---

## 7. Verification Sign-Off

- **Baseline Commit Ancestry**: Verified `f426892985e17b7d39b0aca4ab480c955e439ca7` is an ancestor of `origin/main`.
- **Clean Build**: Shared, Backend, and Frontend workspaces compile with zero TypeScript errors.
- **Fail-Closed Security**: Authentication required for all Career Context routes; service_role required for database writes.
- **Privacy & Purging**: `meRoutes.ts` purges all 5 Career Context tables during account deletion.

**P0-3 Career Context and Cross-Module Grounding implementation is complete and ready for PR creation.**
