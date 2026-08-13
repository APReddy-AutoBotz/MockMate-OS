# Codex instructions for Avala Creator Studio

## Scope boundary

Work only inside `creator-studio/`. Do not edit, delete, reformat, import from, or depend on MockMate files outside this directory. This is an incubator that will be extracted to a dedicated repository.

## Product invariants

1. Publishing integrations are out of scope.
2. Every stage requires explicit human approval before the next stage can start.
3. Workers may create draft artifacts, but workers may never approve artifacts.
4. An approval must reference an immutable artifact ID, version, and SHA-256 digest.
5. Revisions to an upstream artifact invalidate all downstream artifacts, approvals, and active jobs.
6. No avatar, voice sample, access token, service-role key, model weight, or generated media may enter Git history.
7. Private storage and signed URLs are mandatory for all media.
8. Real generation must fail closed when a provider is unconfigured. Never silently fall back to fake output in production-like modes.
9. Mock mode must be obvious in the UI and artifact metadata.
10. Do not treat a ChatGPT or Codex subscription as an application API entitlement.

## Engineering rules

- Use strict TypeScript and Python type checking.
- Keep workflow rules in the shared contracts package and enforce the same rules server-side in PostgreSQL/RPCs.
- Validate all inputs at trust boundaries.
- Use idempotency keys for jobs and transitions.
- Use row-level security for user data.
- Log event codes, not secrets or sensitive media URLs.
- Prefer small, auditable dependencies.
- FFmpeg is the composition baseline. Do not add Remotion without a separate license decision.
- Keep providers behind interfaces. The application must run with mock providers and without a GPU.

## Required checks

Before completing a task, run the relevant subset and report exact results:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
python -m pip install -e 'services/render-worker[dev]'
pytest services/render-worker
```

If a check cannot run, state the exact blocker. Do not claim runtime provider validation unless actual model inference ran.

## PR discipline

- Keep PRs draft until all declared checks are green.
- Include changed-file scope, migrations, security impact, provider cost impact, and evidence.
- Never merge this incubator PR into MockMate main.
