# Career Context and Cross-Module Grounding Architecture

**Module**: Career Context & Grounding Layer (P0-3)  
**Status**: Server-Authoritative / Implemented  
**Scope**: Resume Builder, ClearSpeak, Interview Practice  

---

## 1. Overview

The Career Context layer establishes a user-owned, server-authoritative context model that connects MockMate's three core practice modules. Context items represent verified user goals, claims, achievements, and practice metrics without fabricating hiring recommendations or cross-contaminating module evaluations.

---

## 2. Core Entities & Lifecycle

### A. `CareerContextItem`
Represents an individual unit of career context.
- **Kinds**: `target_role`, `career_goal`, `skill`, `experience_claim`, `achievement`, `project`, `education`, `certification`, `audience_context`, `communication_goal`, `speaking_challenge`, `practiced_vocabulary`, `practice_metric`, `interview_practice_signal`, `development_priority`.
- **Discriminated Value**: `text`, `string_list`, `metric`, `evidence`.
- **Provenance**: `direct_source`, `user_confirmed`, `user_edited`, `system_observed`, `inferred_pending`.
- **Status**: `active`, `pending_confirmation`, `superseded`, `revoked`, `disputed`.
- **Sensitivity**: `standard`, `private`, `personal_contact`.

### B. `CareerContextState`
Tracks user context version and personalization preference.
- `contextVersion`: Increments atomically whenever items are created, confirmed, edited, superseded, revoked, or disputed.
- `personalizationEnabled`: Controls whether practice evidence signals alter future practice sessions.

### C. `CareerContextSnapshot`
An immutable, purpose-bound projection of active context items locked before plan generation.
- **Immutability**: Database triggers block `UPDATE` operations on snapshots and `UPDATE`/`DELETE` on `career_context_snapshot_items`.

### D. `ModuleBridgeSession`
Manages cross-module transfers idempotently via `clientRequestId`.
- **Statuses**: `drafted`, `confirmed`, `consumed`, `cancelled`, `expired`.
- **Idempotency**: Requests with identical `clientRequestId` and payload return the existing bridge. Re-use of consumed bridges is rejected.

---

## 3. Decoupled Interview Setup

To ensure safety and clean separation of concerns:
- **`InterviewSetupDraft`**: Represents pre-plan state (`candidateRole`, `intentText`, `selectedPanelIDs`, `controls`, `groundingRequest`, `bridgeIntent`). Excludes `interviewPlan`.
- **`InterviewSessionContext`**: Represents post-plan state and requires a validated `interviewPlan`.

---

## 4. Privacy & Data Boundaries

1. **Personal Contact Exclusion**: Personal contact details (`email`, `phone`, `location`, `urls`) are strictly excluded from grounding snapshots and provider prompts.
2. **Fail-Closed Security**: Anonymous access is denied. Row Level Security policies enforce owner-only read access (`auth.uid() = user_id`) and service-role-only write access.
3. **Account Deletion Purging**: `DELETE /api/me/data` purges all 5 career context tables (`career_context_snapshot_items`, `career_context_bridges`, `career_context_snapshots`, `career_context_items`, `career_context_state`) in cascading order.
