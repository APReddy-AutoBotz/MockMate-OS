## Scope

Describe the creator milestone and the human-review boundary changed by this pull request.

## Authority checklist

- [ ] Browser input does not select or impersonate an owner.
- [ ] No stage advances without the required human approval or worker completion event.
- [ ] Approval is bound to an immutable artifact ID, version, and SHA-256 digest.
- [ ] Upstream revision invalidates downstream evidence without deleting audit history.
- [ ] Retries are idempotent and cannot duplicate an approval, job, or artifact effect.
- [ ] Voice/avatar media remains private and consent-bound.
- [ ] No social publishing integration or OAuth scope was introduced.
- [ ] No privileged key, voice sample, avatar media, model weight, or generated video is committed.

## Evidence

- [ ] `pnpm check`
- [ ] `python -m pytest services/render-worker/tests -q`
- [ ] `python -m compileall -q services/render-worker/src services/render-worker/tests`
- [ ] Live Supabase/RLS tests, when database behavior changed
- [ ] Browser review for visible UX changes
- [ ] Cost and provider-boundary review for inference changes
