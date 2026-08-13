# Implementation plan

## M0: Foundation

- Dedicated private repository and Codex environment
- Monorepo, contracts, CI and extraction from incubator
- Supabase schema, RLS and deterministic test harness
- Netlify preview with mock-only mode

## M1: Content and script gates

- Auth, projects, rights attestation, immutable content versions
- Script editor and optional provider adapter
- Review notes, approve/revise, audit timeline
- Responsive browser tests

## M2: Identity profiles

- Voice and avatar consent UX
- Private sample upload, validation, revocation and deletion
- No real inference until security gates pass

## M3: Voice worker

- Chatterbox-compatible adapter behind a provider interface
- Pronunciation dictionary, segments, retries and audio quality checks
- On-demand GPU deployment evidence and per-minute cost measurement

## M4: Avatar worker

- MuseTalk-compatible adapter
- Source-video/image preparation, lip-sync, visual quality checks and review player
- No full-length render until segment approval works

## M5: Composition

- FFmpeg timeline manifest, captions, B-roll, logo, music ducking and aspect-ratio presets
- Edit review and final render approval

## M6: Production pilot

- Retention/deletion jobs, backups, observability, rate limits and abuse controls
- Real-user pilot with the owner's own profile only
- Cost report and production go/no-go gate

No milestone is merged solely because code exists. Each requires tests, security evidence and a human product review.
