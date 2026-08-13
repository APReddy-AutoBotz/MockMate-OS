# Dependency and license policy

## Policy

Every model, model weight, dataset-derived checkpoint, library and binary must be reviewed separately. A permissive code license does not automatically grant commercial rights to model weights or training data.

## Initial candidates

- FFmpeg: composition baseline; retain notices and review enabled codecs.
- Chatterbox: voice-adapter candidate; verify current code and model terms immediately before pinning.
- MuseTalk: avatar/lip-sync candidate; verify upstream code, model weights and every bundled dependency immediately before pinning.
- Supabase and Next.js SDKs: pin versions and scan lockfiles.

## Explicit exclusion

Do not add Remotion to the baseline. Its licensing depends on the user/entity and product use. A separate written decision is required before adoption.

## CI requirements

- Lockfiles committed
- Dependency review on PRs
- Secret scanning
- Software composition analysis
- No unpinned Git dependencies
- Model checksums and provenance manifests stored outside Git alongside deployment evidence
