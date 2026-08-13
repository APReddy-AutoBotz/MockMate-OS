# Avala Creator Studio

A cloud-first, human-approved workflow for creating videos from authorized content using the owner's approved avatar and voice profile.

## Non-negotiable product rules

- A human reviews, edits, and explicitly approves every stage.
- No stage may be skipped.
- Publishing is out of scope. The product ends with an approved downloadable MP4.
- ChatGPT/Codex subscription access is for implementation, not a runtime API dependency.
- Voice and avatar media are private assets and must never be committed to Git.
- Real voice/avatar generation is performed by an isolated, on-demand worker. The browser and normal development flow remain lightweight.
- Mock providers are the default until a real GPU worker is separately configured and approved.

## Workflow

`Content review -> Script review -> Voice review -> Avatar review -> Edit review -> Final review -> Download`

Each approval is bound to an immutable artifact version and SHA-256 digest. Revising an earlier stage invalidates every downstream approval and artifact.

## Proposed production stack

- Web application: Next.js + TypeScript
- Contracts: Zod + a pure transition engine
- Identity, database and private storage: Supabase
- Web hosting: Netlify
- Rendering worker: Python + FastAPI + FFmpeg
- Voice adapter candidate: Chatterbox, deployed only after license/security verification
- Avatar adapter candidate: MuseTalk, deployed only after license/security verification
- Queue: PostgreSQL job table with idempotency and leases; no Redis required for V1
- Development: Codex Cloud + GitHub PRs

## Repository status

This is an isolated incubator under `creator-studio/` only. It must not be merged into MockMate `main`. The intended final repository is `APReddy-AutoBotz/Avala-Creator-Studio`, private initially. This staging location exists only because the connected GitHub tool cannot create a new repository.

## Commands

```bash
cd creator-studio
corepack enable
pnpm install
pnpm check
pnpm dev
```

The worker can be checked independently:

```bash
cd services/render-worker
python -m pip install -e '.[dev]'
pytest
uvicorn creator_worker.main:app --reload
```
