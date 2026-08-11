# Post-P0-3 — Production Preview Readiness & Launch Control

## Authority

This work package starts from merged P0-3 `main` at `b08250538b3efaf040f6fa6f33523bdf0164a7f7`.

It is derived from the repository's current production direction and launch runbook: browser first, Vercel + Supabase eventually, production-mode checks before deployment, then a separately controlled hosted preview and real-user validation.

## Objective

Make MockMate source/runtime/CI **ready to be safely configured for a future hosted production preview** without creating or mutating any hosted environment in this work package.

This is a source-only/non-live readiness package. It must fail closed at the hosted-preview boundary.

## In scope

- Production-mode runtime/config contracts and fail-closed validation.
- Eliminate successful dev/mock-auth fallback from production-mode paths.
- Secret/config hygiene and safe error/logging boundaries.
- Auth-negative, authorization/RLS, CORS/origin and account-deletion regression coverage using disposable/local test infrastructure.
- Server-enforced quota/usage/admin-usage privacy verification.
- PWA installability and truthful offline/network-required behavior.
- Browser Desktop + mobile-viewport launch journeys using disposable/local fixtures.
- Source-level mobile/API/auth parity checks without an EAS build or store upload.
- Compose existing `check:production`, `audit:production`, `check:mobile`, database/runtime and browser evidence into an exact-head production-preview-readiness gate.
- Target-agnostic deployed-smoke contract/harness that can be exercised locally/disposably; remote execution remains blocked.
- Machine-readable readiness manifest that distinguishes source/disposable proof from hosted/real-user proof.
- Current-state and launch-runbook updates.

## Hard stop / not authorized

Do not:

- create, configure, inspect or mutate a real Vercel/Supabase/EAS/Play Console project;
- set or use real credentials/secrets/API keys;
- call real AI providers as part of readiness evidence;
- create real users or perform real-user QA;
- deploy or promote a hosted preview/production release;
- run EAS/TestFlight/Play Store distribution;
- make production-ready, security-certified, compliance, or real-user validation claims.

The authoritative stop state is `HOSTED_PREVIEW_NOT_AUTHORIZED` (or an equivalent explicit fail-closed contract).

## Acceptance

A correcting exact head is acceptable only when repository-owned source/unit/integration/disposable database/browser/mobile-readiness gates are green, a machine-readable readiness manifest is bound to the exact head, and a fresh independent P1/P2 review is clean. Hosted preview activation remains a separate AP decision after this PR is merged.
