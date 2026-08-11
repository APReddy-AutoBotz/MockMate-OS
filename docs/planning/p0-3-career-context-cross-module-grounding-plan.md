# P0-3: Career Context and Cross-Module Grounding — Architecture & Execution Plan

## 1. Existing Module Boundaries

Currently, MockMate has three primary modules:
- **Resume Builder**: Manages resume parsing, diagnostic scoring, bullet rewrites, ATS alignment, and export.
- **ClearSpeak**: Manages pronunciation, fluently spoken answers, vocabulary targets, audio recording (in-memory only), and practice scoring.
- **Interview Practice**: Manages role setup, session planning, real-time audio/text interview turns, adaptive evaluation, evidence aggregation, and report generation.

Each module was built with its own local or backend persistence layer:
- Resume state stored in `resume_reviews`
- ClearSpeak state stored in `clearspeak_sessions`, `clearspeak_profiles`, `clearspeak_progress`
- Interview state stored in `interview_sessions`, `interview_turns`

## 2. Existing Temporary Bridge Behavior & Tech Debt to Remove

Previously, cross-module transitions used loose payload objects or temporary hacks in `App.tsx`:
1. `App.tsx` initializes pre-plan interview setup using `interviewPlan: undefined as any` on `SessionContext`.
2. ClearSpeak → Interview bridge constructs `const bridgeContext: any` with un-validated fields.
3. Resume → Interview bridge accepts `resumeData: any` and constructs `const bridgeContext: any`.
4. Resume → Speak receives a summary but discards it and only switches screens.
5. Resume → Interview calculates `targetStarBullets` but does not carry them into an authoritative Interview grounding contract.
6. Resume → Interview derives `candidateRole` as `"Candidate: " + name` instead of the actual target role.
7. Reports read `sessionId` through `(sessionContext as any)?.sessionId`.

P0-3 replaces all of these shortcuts with typed `InterviewSetupDraft`, server-authoritative Career Context, immutable `CareerContextSnapshot`, and server-managed `ModuleBridgeSession`.

## 3. Proposed Career Context Domain Model

The Career Context domain model represents a single user-owned context layer composed of granular, typed items with full provenance tracking:

- **`CareerContextModule`**: `'user_profile' | 'resume' | 'clearspeak' | 'interview' | 'manual'`
- **`CareerContextItemKind`**:
  - `'target_role' | 'career_goal' | 'skill' | 'experience_claim' | 'achievement' | 'project' | 'education' | 'certification'`
  - `'audience_context' | 'communication_goal' | 'speaking_challenge' | 'practiced_vocabulary' | 'practice_metric'`
  - `'interview_practice_signal' | 'development_priority'`
- **`CareerContextProvenance`**: `'direct_source' | 'user_confirmed' | 'user_edited' | 'system_observed' | 'inferred_pending'`
- **`CareerContextItemStatus`**: `'active' | 'pending_confirmation' | 'superseded' | 'revoked' | 'disputed'`
- **`CareerContextSensitivity`**: `'standard' | 'private' | 'personal_contact'`
- **`CareerContextValue`** (Discriminated Union):
  - `TextContextValue`: `{ type: 'text', text: string }`
  - `StringListContextValue`: `{ type: 'string_list', values: string[] }`
  - `MetricContextValue`: `{ type: 'metric', metric: string, value: number, scale: string | null, measuredAt: string }`
  - `EvidenceContextValue`: `{ type: 'evidence', summary: string, evidenceReferenceIds: string[] }`
- **`CareerContextSource`**: `{ module: CareerContextModule, recordId: string, fieldPath: string, sourceRevision: string, sourceHash: string, capturedAt: string }`
- **`CareerContextItem`**: Complete record containing `id`, `kind`, `canonicalKey`, `label`, `value`, `source`, `exactExcerpt`, `provenance`, `status`, `sensitivity`, `createdAt`, `updatedAt`, `supersededBy`, `userConfirmedAt`.

## 4. Source-Provenance Rules

1. Every fact stored in Career Context must trace back to its origin (`module`, `recordId`, `fieldPath`, `sourceRevision`, `sourceHash`).
2. Resume claims must preserve exact source excerpts and field paths.
3. Interview practice signals must reference exact session and report evidence IDs.
4. ClearSpeak metrics must reference exact persisted session IDs.
5. Inferred items enter with `provenance = 'inferred_pending'` and `status = 'pending_confirmation'`. They cannot be used in grounding snapshots until explicitly confirmed by the user.

## 5. User-Consent Model

1. Grounding is strictly explicit and user-controlled.
2. `GroundingConsentSchema` records user intent (`scope: 'one_time' | 'future_sessions'`, `purpose`, `includedItemIds`, `excludedItemIds`, `sourceModules`, `acknowledgedAt`).
3. Personal contact details (email, phone, home address) are assigned `sensitivity = 'personal_contact'` and are strictly non-eligible for grounding snapshots.
4. Future personalization (e.g. using completed practice evidence for future sessions) requires explicit user consent, defaulting to `false`.

## 6. Context Versioning

1. `career_context_state.context_version` tracks active context changes.
2. The context version increments monotonically whenever an active item is created, confirmed, edited, superseded, revoked, or disputed.
3. Context version does NOT increment when reading historical snapshots.

## 7. Immutable Grounding Snapshots

1. A `CareerContextSnapshot` is an immutable, purpose-specific projection created when a module session or bridge is initiated.
2. Fields: `id`, `purpose`, `contextVersion`, `itemIds`, `projection`, `conflicts`, `consent`, `createdAt`, `sourceModules`.
3. Once created, a snapshot never changes. Active module sessions remain bound to their original snapshot regardless of subsequent context edits.

## 8. Conflict and Staleness Behavior

1. **Conflicts**: When competing values exist for a single canonical key (e.g. target role as "Business Analyst" vs "Product Manager"), the system stores both items, flags a `GroundingConflict`, and presents them to the user in the Grounding Preview UI to require an explicit choice.
2. **Staleness**: If the active `context_version` advances past the snapshot's `contextVersion`, the snapshot is flagged as stale in UI views, but active sessions continue safely using their frozen snapshot.

## 9. Resume Ingestion

- **Adapter**: `resumeContextAdapter` extracts target role, skills, experience bullets, achievements, education, projects, and certifications from `ResumeData` and `resume_reviews`.
- Contact information (email, phone, address, personal URLs) is stripped or marked `personal_contact`.
- Bullet rewrites accepted by the user produce `user_confirmed` items that supersede original bullets.
- Missing JD skills remain target gaps, not candidate skills.

## 10. ClearSpeak Ingestion

- **Adapter**: `clearSpeakContextAdapter` extracts target role, speaking goals, audience context, main struggles, comfort language, practiced vocabulary, and practice metrics from `clearspeak_profiles` and `clearspeak_sessions`.
- Audio streams, raw audio blobs, and hidden audio transcriptions are NEVER ingested or stored.
- ClearSpeak delivery scores remain speech practice metrics and cannot affect Interview competency scoring.

## 11. Interview Evidence Ingestion

- **Adapter**: `interviewContextAdapter` extracts practice signals (strengths, gaps, development priorities) from completed interview reports.
- Signals reference exact candidate evidence IDs.
- Practice signals can personalize future interview practice (if consent is given), but can NEVER be converted into hiring decisions or Resume achievement claims.

## 12. Resume → Interview Grounding

- User selects "Practice Interview from this Resume".
- Grounding Preview allows the user to select target role, relevant bullets, achievements, and target gaps.
- Backend creates an immutable `resume_to_interview` snapshot and bridge session.
- Frontend receives `InterviewSetupDraft` with `snapshotId` and `bridgeId`.
- Interview plan generator attaches `groundingReferences` to blueprint questions.

## 13. Resume → ClearSpeak Grounding

- User selects Resume material (summary, project description, role vocabulary) to practice in ClearSpeak.
- Backend creates a `resume_to_clearspeak` snapshot.
- ClearSpeak uses the selected excerpt to generate practice passages. ClearSpeak evaluates speech delivery only.

## 14. ClearSpeak → Interview Grounding

- User chooses to practice a ClearSpeak scenario/question in Interview.
- Backend creates a `clearspeak_to_interview` snapshot and bridge.
- Interview receives delivery support guidance (e.g. pacing tips, target vocabulary) without altering interview evaluation metrics.

## 15. Interview → Future-Practice Personalization

- Completed practice evidence feeds `interview_practice_signal` items into Career Context.
- When enabled by user consent, future interview sessions incorporate these practice signals to focus on prior development priorities.

## 16. Privacy and PII Exclusions

- Personal contact information (email, phone, address, personal URLs) is assigned `sensitivity = 'personal_contact'` and blocked from entering grounding snapshots.
- Candidate name is never used as `candidateRole`.

## 17. Database & RLS Design

Forward-only migration creating:
1. `career_context_state` (user_id PK, context_version, personalization_enabled)
2. `career_context_items` (id PK, user_id, kind, canonical_key, label, value, source_*, provenance, status, sensitivity, etc.)
3. `career_context_snapshots` (id PK, user_id, purpose, context_version, projection, conflicts, consent, created_at)
4. `career_context_snapshot_items` (snapshot_id, item_id PK)
5. `career_context_bridges` (id PK, user_id, source_module, target_module, purpose, snapshot_id, status, client_request_id, etc.)

RLS Policies:
- Authenticated users: SELECT own records only. Direct INSERT/UPDATE/DELETE denied.
- Service Role: Full access for backend services.
- Anon: Access denied.

## 18. Account-Deletion Impact

`backend/routes/meRoutes.ts` updated to include deletion of all 5 new tables in cascading order (`career_context_snapshot_items`, `career_context_bridges`, `career_context_snapshots`, `career_context_items`, `career_context_state`).

## 19. Browser UX

- **Career Context Management Panel**: Accessible from Hub/Account to view, confirm, edit, or revoke context items.
- **Grounding Preview Modal**: Appears during cross-module launches to let users preview, include/exclude items, resolve conflicts, or proceed without grounding.
- **Grounded Session Indicator**: Displays compact badge in active sessions (e.g., "Grounded with 5 Resume facts").
- **Report Audit Section**: Shows context audit in interview final reports without generating global scores.

## 20. Compatibility & Rollout

- `InterviewSetupDraftSchema` and `InterviewSessionContextSchema` strictly separated.
- Compatibility adapters maintain support for existing API contracts while enforcing P0-3 strictness.

## 21. Test Strategy

- Shared contract unit tests for schemas and domain validation.
- Pure adapter tests for Resume, ClearSpeak, and Interview ingestion.
- Snapshot & Bridge service tests (idempotency, RLS, immutability, consent).
- Prompt safety tests verifying injection prevention.
- Disposable PostgreSQL runtime verification for migrations and RLS.
- API & UI End-to-End integration journeys (Resume → Interview, ClearSpeak → Interview).

## 22. Rollback Approach

Forward-only database migrations. Schema changes are strictly additive, allowing safe rollback by reverting backend application code without breaking existing tables.

## 23. Explicit Non-Goals

- No vector DB, embeddings, or external RAG services.
- No hiring recommendations or candidate ranking.
- No global career score.
- No auto-writing Resume claims from interview answers.
- No native mobile Career Context implementation (mobile interview remains disabled).
