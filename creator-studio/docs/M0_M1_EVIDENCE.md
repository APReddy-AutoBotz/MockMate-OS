# M0-M1 implementation evidence

## Scope

The first slice establishes the controlled content-to-script path and the authority model required for later voice, avatar and rendering work.

## Implemented authority

- The authenticated owner is derived from `auth.uid()` in security-definer RPCs.
- Browser clients cannot update the authoritative workflow stage directly.
- Content and script edits create immutable artifact versions.
- Approval binds to the latest active artifact ID, version and SHA-256 digest.
- Content approval also requires a matching rights attestation.
- Command request IDs and transition idempotency keys prevent duplicate effects.
- A revision invalidates downstream approvals and artifacts while retaining the audit evidence.
- Active downstream jobs are cancelled with `UPSTREAM_REVISED`.
- Voice and avatar upload preparation remains fail-closed with `BIOMETRIC_UPLOADS_NOT_ENABLED`.

## Current validation boundary

Static database tests, shared workflow tests, worker tests, TypeScript checks, lint and the Next.js build are required before this slice can be considered merge-ready. A live Supabase RLS run and browser screenshots remain separate gates. Real voice, avatar and video inference are not enabled or claimed.
