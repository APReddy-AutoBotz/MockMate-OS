# Workflow and approvals

## Stages

1. Content review and rights attestation
2. Script generation, edit and approval
3. Voice generation, listen and approval
4. Avatar generation, watch and approval
5. Edit generation, timeline/caption review and approval
6. Final render, final review and approval
7. Download

## Approval binding

Every approval stores the artifact ID, version number, SHA-256 digest, reviewer, decision, notes and timestamp. Editing creates a new version. Approval never carries forward to a new version.

## Revision semantics

A revision request targets a stage and records a reason. All artifacts after that stage become stale, all downstream approvals become non-authoritative, and queued or running downstream jobs are cancelled. Stale media may remain temporarily for audit and rollback but cannot be downloaded as current output.

## Concurrency

Every transition includes `expected_stage`. A stale browser receives a conflict and must reload. Jobs use unique idempotency keys and leases. Retried callbacks cannot create duplicate artifacts or move a stage twice.

## Authority

- Human: attest, edit, approve, request revision, start a generation job, download.
- Worker: report draft artifact ready or job failed.
- System: invalidate downstream records and expire assets.

No worker or administrator acting as a service may approve on behalf of the user.
