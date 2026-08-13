# Architecture

## Components

1. **Next.js web application** on Netlify: authentication, editors, review screens, signed download links and server actions.
2. **Supabase**: Auth, PostgreSQL, private Storage, RLS, immutable metadata, approvals, audit events and job queue.
3. **Render worker**: isolated FastAPI service. It claims jobs, downloads private inputs through short-lived URLs, invokes a provider adapter, uploads results privately and records completion.
4. **Provider adapters**: manual/mock script provider, optional BYOK LLM provider, Chatterbox-compatible voice adapter, MuseTalk-compatible avatar adapter, and FFmpeg composer.

## Why no Redis in V1

PostgreSQL can provide durable queued jobs, idempotency, leases and `FOR UPDATE SKIP LOCKED`. This removes another paid service and keeps authority next to the workflow transaction.

## Trust boundaries

- Browser is untrusted and never receives a service-role key.
- Human transitions use authenticated RPCs and compare an expected stage.
- Worker transitions require a separate service authority and cannot create approvals.
- Media remains in private buckets. Only short-lived signed URLs are issued.
- Provider secrets exist only in the worker environment.

## Runtime modes

- `development`: explicit demo mode allowed.
- `test`: deterministic mocks allowed.
- `preview`: real authority required; mock output must be visually labelled and cannot be mistaken for production.
- `production`: fail closed if Supabase, consent, private storage, or provider authority is missing.

## Rendering path

The composition baseline is FFmpeg with generated ASS subtitles, image/video overlays, loudness normalization, aspect-ratio presets and deterministic manifests. Remotion is intentionally excluded from the baseline because its licensing must be assessed separately for a public commercial product.
