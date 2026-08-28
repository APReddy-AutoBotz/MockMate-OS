# P0-8 Hosted Preview Evidence and Rollback Ledger

## Controller status

- Primary delivery: Draft PR #18, branch `codex/p0-8-hosted-preview-acceptance`.
- QA-only preview carrier: Draft PR #21, branch `netlify-preview`. It must be closed without merge after final acceptance.
- Accepted parent baseline: `main` at `38520a682d1ac6bd9e82724e753f03f67c87cb5f`.
- Runtime-changing acceptance head: `880ee675d22b7f37d9496efe728b54b38b3b1eac`.
- Controller state: `HOSTED_ACCEPTANCE_GREEN__SYNTHETIC_DATA_REMOVED__FINAL_DOC_HEAD_REPLAY_REQUIRED`.
- Authorization is preview/test only. Public production promotion, public users, customer data, paid-plan changes, and paid scorer selection remain outside P0-8.

## Exact preview authority

- Supabase project: `MockMate-P0-8-Preview`, ref `cysnsoeonyhcshjjpezk`, region `ap-south-1`.
- Netlify site: `mockmate-os-preview`, site id `e3945eb0-8312-4850-9f33-e483673bb795`.
- Protected origin: `https://deploy-preview-21--mockmate-os-preview.netlify.app`.
- Netlify deploy id for the accepted runtime head: `6a914e323af620000893bcef`.
- Runtime health reported preview mode, configured authority, the exact preview target/project, and deployed Git SHA `880ee675d22b7f37d9496efe728b54b38b3b1eac`.
- PR #18 and PR #21 both pointed to that exact SHA and reported green Production Readiness and Netlify checks before mutation acceptance.
- No production deployment or promotion was performed.

The preview fails closed unless runtime mode, exact HTTPS origin, preview target id, Supabase project ref, browser/server Supabase URLs, and a 40-character deployed Git SHA agree. The Supabase service-role credential remains server-only and cannot equal the browser credential.

## Database and provenance closure

The dedicated preview project contains the complete repository migration chain, including:

- `20260823101541_p0_8_clearspeak_score_provenance.sql`;
- `20260828110000_p0_8_resume_score_provenance.sql`.

The Resume provenance migration was applied and verified on `cysnsoeonyhcshjjpezk` before hosted acceptance. Verification proved:

- required provenance columns and both constraints exist;
- owner-scoped SELECT policy exists;
- service-role grants exist;
- client INSERT/UPDATE/DELETE grants remain closed;
- no ownerless cache rows exist;
- the migration ledger contains exactly one applied record.

The accepted source patch binds Resume scoring to the exact request hash, isolates cache entries per user, persists identical provenance on cache hit and miss, fails closed on persistence errors, and removes user cache material during account deletion.

## Hosted acceptance result

The controller ran the schema-v4 browser acceptance manifest through the protected external browser against the exact deployed runtime head.

| Evidence | Result |
| --- | --- |
| Governed scenarios | `51 / 51` passed |
| Transport transactions | `62` |
| Runtime Git SHA | `880ee675d22b7f37d9496efe728b54b38b3b1eac` |
| Manifest SHA-256 | `a5140b753f741d3fb5131a722fe528fa6c2b9d300db05ced1fe04ef7b2ebda44` |
| Evidence SHA-256 | `1ee19fb5b6753cdf8bcdb193a965ecbdf3099109e37fe50d29b8a8ea19fb8c74` |
| Evidence schema | `4` |
| Evidence size | `9,530` bytes |

The retained matrix covered:

- runtime health, PWA manifest/offline behavior, and authenticated identity;
- Resume parse, score, suggestion, exact provenance, replay, and validation paths;
- ClearSpeak prompt/authority/create/submit/result/replay/cancel/history/delete paths;
- Interview quota, create/version/answer/stale/concurrency/response-loss/interrupted/complete/report paths;
- Career Context rebuild/state/update/stale/create/snapshot/bridge/cross-user/delete/decision paths;
- admin denial, malformed and oversized partial failures, account deletion, and cross-user aftermath.

The controller independently proved the hostile-origin boundary before running the matrix:

- authenticated hostile-origin `GET` reached the application rejection contract and returned the exact generic `500` JSON without `Access-Control-Allow-Origin` or credential allowance;
- authenticated hostile-origin `OPTIONS` returned the same application rejection contract without CORS allowance;
- a separate credential-free browser preflight was rejected by the Netlify edge with `401` and no CORS allowance;
- all probes used no redirects, bounded headers/body retention, a 32 KiB streamed response limit, an absolute wall-clock deadline, and buffer clearing.

## Disposable Auth and entitlement proof

Exactly two auto-confirmed disposable Auth users were created through the visible Supabase Auth Admin UI. Their credentials were generated locally with a shared run identifier for recovery matching and independent 256-bit password entropy. The acceptance result, committed ledger, PR evidence, and generated evidence artifact contain no raw synthetic email, password, UUID, cookie, bearer token, or recovery payload.

Before acceptance, recovery-hash-bound SQL proved:

- exactly one User A and one User B matched the recovery manifest;
- both users were confirmed;
- no Auth sessions existed;
- ClearSpeak beta entitlement was disabled for both users;
- no additional synthetic identity existed in the bounded run window.

After both browser sessions appeared, a guarded transaction re-proved the exact recovery hashes and two-session cardinality, enabled only hash-bound User A, and proved User B remained disabled. No prefix-only or time-only selector was used for entitlement.

## Cleanup and privacy proof

The browser runner completed its terminal deletion sequence before evidence download. It then:

- administratively proved User B application data empty;
- globally signed out both sessions;
- cleared MockMate/Supabase browser storage and reloaded to prove absence;
- zeroed in-memory credential and token copies;
- closed every exact preview-origin page before the controller emitted its buffered result, disposing Playwright's captured request history.

The controller then proved:

- `0` sessions for the exact recovery pair;
- `0` rows across all `21` public base tables carrying a `user_id` column;
- the one-use credential file was unlinked while recovery authority was retained;
- exactly the two recovery-hash-bound Auth users were deleted;
- `0` matching Auth users, `0` matching Auth identities, and `0` bounded-run synthetic users remained;
- the recovery file was unlinked and its fixed, empty handoff directory removed.

The evidence artifact's SHA-256 matched the runner result. A bounded privacy scan found no synthetic email, JWT-shaped value, bearer credential, or generated password. On NTFS/SSD, file cleanup is recorded accurately as verified unlink/removal, not guaranteed physical-media erasure.

Supabase global sign-out removes sessions and refresh-token authority, but already-issued access JWTs can remain cryptographically valid until expiry. P0-8 therefore does not represent `sessions = 0` as immediate JWT invalidation; tracing-off, token zeroing, storage clearing, and exact-origin page closure are part of the required boundary.

## Independent review

Three independent sub-agent reviews examined the CORS transport, hosted controller, browser runner, credential/recovery handoff, entitlement authority, and cleanup sequence. All reported no remaining P1/P2 findings before disposable-user creation. The final reviewed controls include:

- absolute transport deadlines and credential-free preflight proof;
- tracing-off enforcement before credentials or tokens are handled;
- identity-bound last-chance cleanup-token capture;
- recovery/credential equality and independent password entropy;
- exact recovery-hash entitlement and reconciliation;
- buffered output plus page-marker/origin re-proof and atomic page closure;
- fixed-path, nonrecursive, two-phase handoff unlinking.

## Known preview limitations

- Supabase leaked-password protection remains unavailable on the current free preview tier. This is a plan-gated future public-production blocker, not authorization to purchase or upgrade a plan.
- ClearSpeak microphone and UK/US practice flows are implemented, but real user recordings are not pronunciation/accent scored because no production speech scorer was authorized. The adapter fails closed instead of fabricating a score.
- Hosted acceptance used bounded synthetic data only and is not production-load, penetration-test, or public-user evidence.

Supabase password-security reference: https://supabase.com/docs/guides/auth/password-security

## Final-head evidence sequencing

Committing this ledger creates a documentation-only SHA after the accepted runtime-changing head. To avoid an impossible self-referential commit loop:

1. the final ledger commit must pass exact-head Production Readiness;
2. PR #21 must be fast-forwarded to that exact commit and Netlify must report the same `commit_ref`;
3. the controller must rerun the hosted acceptance and full cleanup on that final SHA without any further repository edits;
4. the final SHA, deploy id, acceptance/evidence hashes, cleanup proof, and independent-review result must be posted to PR #18 as the immutable final-head record;
5. PR #21 must then be closed without merge, PR #18 marked ready, and PR #18 merged only with expected-head protection.

## Immediate stop conditions

Stop the preview workflow if any of the following occurs:

- preview origin, target id, deployed Git SHA, or Supabase binding mismatch;
- a request escapes the authorized origin or bypasses response/deadline bounds;
- any credential, bearer token, raw resume/audio/interview content, or recovery payload appears in logs/evidence;
- cross-user access or wrong-user entitlement is observed;
- migration, RLS, RPC, grant, replay, or deletion authority regresses;
- app-data deletion reports success after a partial authoritative failure;
- any P1/P2 security, privacy, integrity, or authority finding remains unresolved.

Public production promotion remains explicitly outside P0-8.
