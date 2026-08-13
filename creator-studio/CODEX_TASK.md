# Codex Cloud Task: M0-M1 Foundation and Human-Gated Thin Slice

Implement a production-quality first vertical slice entirely inside `creator-studio/`.

## Goal

A signed-in user can create a project, attest that they own or are authorized to use the content, edit the source content, approve it, edit a script, approve it, and observe that the voice stage becomes available. The UI must make every gate and every invalidation visible. Real voice/avatar inference is not part of this task.

## Required implementation

1. Complete the Next.js application shell with Supabase SSR authentication abstractions and a deterministic demo mode for tests.
2. Implement project creation and the full stage timeline.
3. Implement content and script editors with version creation, review notes, approve, and request-revision actions.
4. Implement server-authoritative transition APIs/RPC calls. Never trust a client-supplied owner or stage.
5. Implement the SQL migration, RLS, transition RPC, immutable artifact versions, reviews, audit events, and idempotent jobs.
6. Implement private upload preparation for future avatar/voice files, but do not accept real biometric samples until consent UI and deletion are complete.
7. Implement the mock render-worker contract and health endpoint. Mock outputs must be labelled `synthetic_mock`.
8. Add unit, integration, RLS/static migration, and Playwright tests covering all stage-skip and invalidation cases.
9. Add a repository extraction note and ensure no file outside `creator-studio/` changes.

## Mandatory acceptance cases

- A worker cannot approve an artifact.
- A user cannot approve another user's artifact.
- A user cannot start script generation before content approval.
- Approving version 1 does not approve version 2.
- Revising content after script approval marks the script and every later artifact stale and cancels queued/running downstream jobs.
- Replaying the same idempotency key has no duplicate effect.
- Missing Supabase/provider configuration fails closed outside explicit demo/test mode.
- No private object has a public URL.
- No social publishing code or OAuth scope exists.
- `git diff --name-only <base>...HEAD` contains only `creator-studio/` paths.

## Evidence expected in the Codex result

- Exact head SHA
- Changed-file list
- Test/build commands and results
- Migration/RLS evidence
- Screenshots of desktop and mobile workflow views
- Known limitations, especially that real voice/avatar inference has not yet been proven
