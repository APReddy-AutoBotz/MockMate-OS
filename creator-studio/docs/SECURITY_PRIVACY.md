# Security and privacy

Voice samples and facial/avatar media are sensitive identity data. Treat them as high-impact private assets even where a jurisdiction does not classify every sample as biometric data.

## Required controls

- Explicit voice consent and avatar consent are separate records.
- Only the profile owner may activate, use, revoke or delete a profile.
- No public buckets or permanent media URLs.
- Short-lived signed URLs, least-privilege worker access and server-side validation.
- Encryption in transit and provider secrets only in managed secret stores.
- No secrets, samples, generated media or model weights in Git.
- Content rights attestation before script generation.
- Clear mock/synthetic labels and optional disclosure slate/metadata.
- Download and deletion audit events.
- Revoking a consent profile blocks new jobs immediately.
- Account deletion removes or irreversibly schedules deletion of source media, voice samples, avatar samples and generated outputs.

## Abuse prevention

V1 supports only self-owned profiles. It must not offer a marketplace of public voices/faces, URL-based ingestion of other people, or bypasses for consent. Add liveness or identity verification only after a separate privacy and threat-model review.

## Logging

Log event codes, job IDs and timing. Do not log scripts marked confidential, signed URLs, tokens, raw provider responses, voice embeddings or image paths beyond opaque object IDs.
