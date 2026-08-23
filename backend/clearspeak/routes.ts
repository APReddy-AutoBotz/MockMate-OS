/**
 * backend/clearspeak/routes.ts
 * Mockmate ClearSpeak — Express route boundaries for /api/clearspeak/*.
 *
 * Routes:
 *   POST /api/clearspeak/profile    — Save/update onboarding profile (Supabase)
 *   GET  /api/clearspeak/profile    — Read onboarding profile (Supabase)
 *   POST /api/clearspeak/generate   — Generate session content (Gemini)
 *   POST /api/clearspeak/score      — Score audio (multipart/form-data → gpt-4o-mini-transcribe)
 *   GET  /api/clearspeak/progress   — Read user progress (Supabase)
 *
 * Audio: Accepted as multipart/form-data. Raw buffer is destroyed after scoring.
 * Source of truth: implementation_plan.md §14
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { consumeUsage } from '../services/usageService';
import { supabaseAdmin } from '../supabaseAdmin';
import { generateSession } from './generateService';
import {
  CLEAR_SPEAK_SCORING_UNAVAILABLE_MESSAGE,
  ClearSpeakScoringUnavailableError,
  isGovernedClearSpeakScoringAvailable,
  scoreSession,
} from './scoringService';
import {
  recordSessionResult,
  evaluateBridgeTrigger,
  getProgress,
  getOrCreateLedger,
} from './progressService';
import {
  ClearSpeakPersistenceUnavailableError,
  saveProfileToStore,
  getProfileFromStore,
} from './supabaseStoreService';
import {
  ClearSpeakGenerateRequestSchema,
  ClearSpeakSessionContentSchema,
  ClearSpeakSessionScoreSchema,
  type ClearSpeakProfile,
} from 'mockmate-shared';
import { getModuleBridgeById } from '../services/moduleBridgeService';
import { getSnapshotById } from '../services/groundingSnapshotService';
import crypto from 'crypto';
import { canonicalJsonValue, hashArtifactContent } from './artifactAuthority';
import { ACCENT_PROFILES } from './accentProfiles';
import { accentAdapterDescriptorForScore, accentCatalog, cancelAccentAttempt, deleteAccentAttempt, getAccentAttemptStatus, issueAccentAttemptAuthority, projectAccentHistoryAttempt, promptFor, rejectClientAuthority, submitAccentAttempt } from './accentV1Service';
import { getAccentProfile } from './accentProfiles';

const router = Router();

// Catalog metadata contains no user data. Keeping the immutable supported
// profiles server-owned prevents clients from inventing privileged policies.
router.get('/accent-profiles', (_req: Request, res: Response) => {
  res.json({ contractVersion: 'accent-profile-catalog.v1', profiles: ACCENT_PROFILES });
});

// ─── Rate Limiters ────────────────────────────────────────────────────────────
// Re-uses the same in-memory token-bucket pattern as server.ts.
// Per-IP, per-window. Intentionally lightweight — no Redis dependency.
// These limits are deliberately generous (beta has ≤15 testers): the goal is
// abuse protection, not throttling legitimate testers.

type RLBucket = { tokens: number; ts: number };
const _rlBuckets = new Map<string, RLBucket>();

function csRateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const owner = (req as any).user?.uid ?? 'anon';
    const key = `${owner}:${req.ip ?? req.headers['x-forwarded-for']?.toString() ?? 'anon'}:${req.route?.path ?? req.path}`;
    const now = Date.now();
    const b = _rlBuckets.get(key) ?? { tokens: max, ts: now };
    if (now - b.ts > windowMs) { b.tokens = max; b.ts = now; }
    if (b.tokens <= 0) {
      res.status(429).json({ error: 'Too many requests. Please wait before retrying.' });
      return;
    }
    b.tokens -= 1;
    _rlBuckets.set(key, b);
    next();
  };
}

// /beta/event  — fire-and-forget events; generous limit
const betaEventLimiter    = csRateLimit(120, 60_000);  // 120 events / min / IP
// /beta/feedback — one submission per session; very tight
const betaFeedbackLimiter = csRateLimit(10,  60_000);  // 10 / min / IP
// /beta/access  — checked once on login; generous
const betaAccessLimiter   = csRateLimit(30,  60_000);  // 30 / min / IP
const accentLifecycleLimiter = csRateLimit(30, 60_000);
const scoreLimiter = csRateLimit(10, 60_000);
const generateLimiter = csRateLimit(12, 60_000);


// ─── Multer — memory storage only ────────────────────────────────────────────
//
// PRIVACY GUARANTEE (implementation_plan.md §14):
//   Raw audio NEVER touches disk. multer.memoryStorage() keeps it in RAM only.
//   req.file.buffer is the only copy. It is explicitly nulled after scoreSession()
//   returns. The resulting ClearSpeakSessionScore JSON is stored in Supabase.
//   The raw audio buffer is NOT stored in Supabase, S3, or any persistent store.
//
// SUPABASE STORAGE DECISION:
//   Only the following data is persisted per session:
//     ✓ ClearSpeakSessionScore (clarity, pacing, rhythm, composite, feedbackTip)
//     ✓ ClearSpeakProgress (streak, trend, topic scores)
//     ✓ HardWordsLedger (failed/resolved words)
//   Never stored: raw audio binary, audio metadata, Whisper transcript text.

const memoryStorage = multer.memoryStorage();
const ephemeralMemoryStorage: multer.StorageEngine = {
  _handleFile: memoryStorage._handleFile.bind(memoryStorage),
  _removeFile(req, file, cb) {
    const buffer = (file as Express.Multer.File).buffer;
    if (Buffer.isBuffer(buffer)) buffer.fill(0);
    memoryStorage._removeFile(req, file, cb);
  },
};

function wipeUploadedAudio(req: Request): void {
  if (Buffer.isBuffer(req.file?.buffer)) req.file.buffer.fill(0);
  const files = req.files;
  if (Array.isArray(files)) files.forEach(file => file.buffer?.fill(0));
  else if (files) Object.values(files).flat().forEach(file => file.buffer?.fill(0));
}

const upload = multer({
  storage: ephemeralMemoryStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB — max ~5 min WebM/Opus
    fieldSize: 64 * 1024,
    fields: 8,
    files: 1,
    parts: 10,
  },
  fileFilter: (_req, file, cb) => {
    //
    // STRICT ALLOWLIST — no audio/* wildcard.
    // Only formats explicitly tested with gpt-4o-mini-transcribe are permitted.
    //
    // audio/webm          — Chrome, Firefox, Edge (WebM/Opus, primary format)
    // audio/ogg           — Firefox fallback (OGG/Opus)
    // audio/mp4           — Safari (AAC in MPEG-4 container)
    // audio/mpeg          — Some Android browsers / legacy WebAudio export
    // audio/wav           — MIME registered form
    // audio/x-wav         — Legacy unregistered MIME (same format, different header)
    //
    // To add a new format: test it end-to-end with gpt-4o-mini-transcribe first,
    // then add to ALLOWED. Do NOT restore the wildcard.
    //
    const ALLOWED = new Set([
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
    ]);
    if (ALLOWED.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(
        `Unsupported audio format: ${file.mimetype}. ` +
        `Accepted formats: WebM, OGG, MP4/AAC, WAV, MP3.`,
      ));
    }
  },
});

/**
 * Multer error middleware — converts MulterError into clean JSON 4xx responses.
 * Must be registered AFTER the upload middleware in the route chain.
 */
function handleMulterError(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  wipeUploadedAudio(req);
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Audio file exceeds the 10 MB limit. Please record a shorter clip.' });
      return;
    }
    if (['LIMIT_FIELD_VALUE', 'LIMIT_FIELD_COUNT', 'LIMIT_FILE_COUNT', 'LIMIT_PART_COUNT'].includes(err.code)) {
      res.status(413).json({ error: 'Upload fields exceed the ClearSpeak request limits.' });
      return;
    }
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }
  if (err?.message?.startsWith('Unsupported audio format')) {
    res.status(415).json({ error: err.message });
    return;
  }
  next(err);
}

// All ClearSpeak routes require auth
router.use(verifyAuthToken);

async function userHasClearSpeakBetaAccess(userId: string | undefined): Promise<boolean> {
  if (!userId || !supabaseAdmin) return false;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('clearspeak_beta_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  return !error && data?.clearspeak_beta_enabled === true;
}

async function getAuthoritativeGenerationHistory(userId: string): Promise<{
  recentTopics: string[];
  sessionAttemptLength: number;
}> {
  // Without database authority, keep the generator on its static fast path.
  if (!supabaseAdmin) return { recentTopics: [], sessionAttemptLength: 0 };

  const { data, error, count } = await supabaseAdmin
    .from('clearspeak_sessions')
    .select('topic_tag', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new ClearSpeakPersistenceUnavailableError(error);

  const recentTopics = (data || [])
    .map(row => row.topic_tag)
    .filter((topic): topic is string => typeof topic === 'string' && topic.length > 0)
    .slice(0, 20);
  return {
    recentTopics,
    // generateSession only distinguishes the first five completed sessions.
    sessionAttemptLength: Math.min(Math.max(count ?? data?.length ?? 0, 0), 5),
  };
}

// All product routes are allowlist-only in controlled previews. The access
// probe itself must remain reachable so the UI can hide the module. There is no
// environment-based bypass: authorization remains fail-closed in every runtime.
router.use(async (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/beta/access') return next();
  try {
    const enabled = await userHasClearSpeakBetaAccess((req as any).user?.uid);
    if (!enabled) return res.status(403).json({ error: 'feature_not_available' });
    return next();
  } catch {
    return res.status(403).json({ error: 'feature_not_available' });
  }
});

// The client checks this before offering standard scored practice. Availability
// is server-authoritative so missing provider configuration cannot fall through
// to quota consumption, persistence, or a fabricated score.
router.get('/capabilities', (_req: Request, res: Response) => {
  const standardSessionScoringAvailable = isGovernedClearSpeakScoringAvailable();
  return res.json({
    standardSessionScoringAvailable,
    scoreEvidenceBasis: standardSessionScoringAvailable ? 'transcript_timing_heuristic' : null,
    pronunciationAssessmentAvailable: false,
  });
});

// Accent Practice V1 is deliberately separate from legacy /score. Its policy,
// references and deterministic adapter are selected exclusively by the server.
router.get('/v1/accent/catalog', (_req, res) => res.json(accentCatalog()));

router.post('/v1/accent/prompts', (req, res) => {
  try {
    rejectClientAuthority(req.body);
    const profile = getAccentProfile(req.body?.profileId);
    if (!profile || (req.body?.profileVersion != null && req.body.profileVersion !== profile.profileVersion)) return res.status(409).json({ error: 'stale_or_unknown_profile' });
    if (!['word', 'phrase', 'sentence_reading', 'free_response'].includes(req.body?.mode)) return res.status(422).json({ error: 'unsupported_practice_mode' });
    return res.json({ prompt: promptFor(profile, req.body.mode), scoringPolicyVersion: profile.scoringPolicyVersion, fixture: true });
  } catch (error: any) { return res.status(422).json({ error: error.message }); }
});

router.post('/v1/accent/attempt-authority', accentLifecycleLimiter, async (req, res) => {
  try {
    return res.status(201).json(await issueAccentAttemptAuthority((req as any).user?.uid, req.body));
  } catch (error: any) {
    const status = error.message === 'lifecycle_limit_reached' ? 429 : error.message === 'idempotency_conflict' ? 409 : 422;
    const allowed = new Set(['lifecycle_limit_reached','idempotency_conflict','invalid_attempt_id','stale_or_unknown_profile','unsupported_practice_mode','stale_or_mismatched_server_selector','client_authority_rejected']);
    return res.status(status).json({ error: allowed.has(error.message) ? error.message : 'submission_authority_rejected' });
  }
});

router.post('/v1/accent/attempts', upload.single('audio'), handleMulterError, async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!req.file || req.file.size > 5 * 1024 * 1024) return res.status(413).json({ error: 'Audio must be non-empty and no larger than 5 MB' });
    let metadata: any;
    try { metadata = JSON.parse(String(req.body.metadata || '')); } catch { return res.status(400).json({ error: 'Malformed attempt metadata' }); }
    const result = await submitAccentAttempt(userId, metadata, req.file.buffer, req.file.mimetype);
    return res.status(result.replayed ? 200 : 201).json({
      ...result,
      adapter: accentAdapterDescriptorForScore(result.score),
      retention: 'derived-results-only',
    });
  } catch (error: any) {
    const retryable = error.message === 'authoritative_persistence_unavailable' || error.message === 'real_speech_evidence_unavailable';
    const status = error.message === 'idempotency_conflict' ? 409 : retryable ? 503 : 422;
    const publicErrors = new Set(['idempotency_conflict', 'submission_canceled', 'authoritative_persistence_unavailable', 'real_speech_evidence_unavailable', 'unsupported_audio_type', 'invalid_audio_evidence', 'invalid_attempt_id', 'stale_or_unknown_profile', 'unsupported_practice_mode', 'stale_or_mismatched_server_selector', 'client_authority_rejected', 'real_speech_provider_not_authorized']);
    return res.status(status).json({ error: publicErrors.has(error.message) ? error.message : 'accent_attempt_rejected' });
  } finally {
    // Memory-storage buffers are ephemeral evidence. Wipe them for every exit,
    // including malformed metadata, validation returns, success and exceptions.
    wipeUploadedAudio(req);
  }
});

router.get('/v1/accent/attempts/:attemptId/status', async (req, res) => {
  try {
    const outcome = await getAccentAttemptStatus((req as any).user?.uid, req.params.attemptId);
    return res.json(outcome);
  } catch (error: any) {
    return res.status(error.message === 'invalid_attempt_id' ? 422 : 503).json({ error: error.message === 'invalid_attempt_id' ? error.message : 'authoritative_persistence_unavailable' });
  }
});

router.post('/v1/accent/attempts/:attemptId/cancel', accentLifecycleLimiter, async (req, res) => {
  try {
    const outcome = await cancelAccentAttempt((req as any).user?.uid, req.params.attemptId, req.body?.submissionCapability);
    return res.json(outcome);
  } catch (error: any) {
    return res.status(error.message === 'invalid_attempt_id' ? 422 : 503).json({ error: error.message === 'invalid_attempt_id' ? error.message : 'authoritative_persistence_unavailable' });
  }
});

router.get('/v1/accent/attempts', async (req, res) => {
  const userId = (req as any).user?.uid;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Authoritative persistence unavailable' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const { data, error } = await supabaseAdmin.from('clearspeak_accent_attempts').select('attempt_id,prompt_id,result,fixture,evidence_provenance,duration_ms,mime_type,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) return res.status(500).json({ error: 'History unavailable' });
  const attempts = (data || []).map(projectAccentHistoryAttempt);
  return res.json({ attempts, retention: 'derived-results-only' });
});

router.delete('/v1/accent/attempts/:attemptId', async (req, res) => {
  const userId = (req as any).user?.uid;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Authoritative persistence unavailable' });
  // Owner predicate is intentionally non-disclosing: absent and foreign IDs are identical.
  try {
    await deleteAccentAttempt(userId, req.params.attemptId);
    return res.status(204).send();
  } catch { return res.status(503).json({ error: 'Delete unavailable' }); }
});

// ─── POST /api/clearspeak/profile ─────────────────────────────────────────────

router.post('/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as Partial<ClearSpeakProfile>;

    if (!body.role || !body.level || !body.goal || !body.mainStruggle) {
      return res.status(400).json({
        error: 'Missing required profile fields: role, level, goal, mainStruggle',
      });
    }

    const now = new Date().toISOString();
    const existing = await getProfileFromStore(userId);

    const profile: ClearSpeakProfile = {
      userId,
      role: body.role,
      level: body.level,
      goal: body.goal,
      audienceContext: body.audienceContext ?? '',
      mainStruggle: body.mainStruggle,
      comfortLanguage: body.comfortLanguage ?? 'en',
      practiceDuration: body.practiceDuration ?? 5,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await saveProfileToStore(profile);
    return res.status(201).json({ profile });
  } catch (err: any) {
    console.error('[ClearSpeak] POST /profile error:', err);
    if (err instanceof ClearSpeakPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Failed to save profile' });
  }
});

// ─── GET /api/clearspeak/profile ──────────────────────────────────────────────

router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const profile = await getProfileFromStore(userId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found. Complete onboarding first.' });
    }

    return res.json({ profile });
  } catch (err: any) {
    console.error('[ClearSpeak] GET /profile error:', err);
    if (err instanceof ClearSpeakPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Failed to load profile' });
  }
});

// ─── POST /api/clearspeak/generate ────────────────────────────────────────────

router.post('/generate', generateLimiter, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const requestResult = ClearSpeakGenerateRequestSchema.safeParse(req.body ?? {});
    if (!requestResult.success) {
      return res.status(422).json({ error: 'generation request does not match the ClearSpeak contract' });
    }

    const profile = await getProfileFromStore(userId);
    if (!profile) {
      return res.status(400).json({
        error: 'ClearSpeak profile not found. Complete onboarding first.',
      });
    }

    const { grounding } = requestResult.data;
    let snapshot: Awaited<ReturnType<typeof getSnapshotById>> = null;
    let existingArtifact: any = null;
    if (grounding) {
      if (!grounding.snapshotId || !grounding.bridgeSessionId) return res.status(422).json({ error: 'Grounded ClearSpeak generation requires snapshotId and bridgeSessionId' });
      const bridge = await getModuleBridgeById(userId, grounding.bridgeSessionId);
      snapshot = await getSnapshotById(userId, grounding.snapshotId);
      if (!bridge || !snapshot || bridge.status !== 'confirmed' || bridge.targetModule !== 'clearspeak' || bridge.purpose !== 'resume_to_clearspeak' || bridge.snapshotId !== snapshot.id) {
        return res.status(409).json({ error: 'Grounded ClearSpeak authority is missing, mismatched, or already consumed' });
      }
      if (!supabaseAdmin) return res.status(503).json({ error: 'Authoritative persistence unavailable for grounded ClearSpeak practice' });
      const artifactRead = await supabaseAdmin.from('clearspeak_generated_artifacts').select('*').eq('user_id', userId).eq('bridge_id', grounding.bridgeSessionId).maybeSingle();
      if (artifactRead.error) throw artifactRead.error;
      existingArtifact = artifactRead.data;
      if (existingArtifact) return res.json({ content: { ...existingArtifact.content, generationArtifactId: existingArtifact.id, generationArtifactHash: existingArtifact.content_hash } });
    }
    const references = snapshot?.groundingReferences || [];
    const groundingInput = snapshot ? {
      summary: references.map((r: any) => `${r.label}: ${r.exactExcerpt || ''}`).join('\n'),
      vocabulary: references.flatMap((r: any) => String(r.label || '').split(/\s+/)).filter(Boolean).slice(0, 3),
    } : undefined;
    const generationHistory = await getAuthoritativeGenerationHistory(userId);
    const content = await generateSession(
      profile,
      generationHistory.recentTopics,
      // Static governed content remains usable for provider-free grounding,
      // but paid generation stays off wherever paired scoring is unavailable.
      isGovernedClearSpeakScoringAvailable() ? generationHistory.sessionAttemptLength : 0,
      groundingInput,
    );

    if (grounding && snapshot && supabaseAdmin) {
      const canonical = canonicalJsonValue(content);
      const contentHash = hashArtifactContent(canonical);
      const artifactId = crypto.randomUUID();
      const inserted = await supabaseAdmin.from('clearspeak_generated_artifacts').insert({
        id: artifactId, user_id: userId, bridge_id: grounding.bridgeSessionId,
        snapshot_id: grounding.snapshotId, content: canonical, content_hash: contentHash,
        grounding_references: references,
      }).select('*').single();
      if (inserted.error) {
        const replay = await supabaseAdmin.from('clearspeak_generated_artifacts').select('*').eq('user_id', userId).eq('bridge_id', grounding.bridgeSessionId).maybeSingle();
        if (!replay.data) throw inserted.error;
        return res.json({ content: { ...replay.data.content, generationArtifactId: replay.data.id, generationArtifactHash: replay.data.content_hash } });
      }
      return res.json({ content: { ...canonical, generationArtifactId: artifactId, generationArtifactHash: contentHash } });
    }

    return res.json({ content });
  } catch (err: any) {
    console.error('[ClearSpeak] POST /generate error:', err);
    if (err instanceof ClearSpeakPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Generation failed' });
  }
});

// ─── POST /api/clearspeak/score ───────────────────────────────────────────────
// Accepts multipart/form-data with:
//   audio          (binary file, required)
//   content        (JSON string of ClearSpeakSessionContent, required)
//   retryAttempted (JSON boolean string, optional, default false)

router.post('/score', scoreLimiter, upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.file) {
      return res.status(400).json({ error: 'audio field is required (multipart/form-data)' });
    }
    if (req.file.size > 4 * 1024 * 1024) {
      return res.status(413).json({ error: 'Please keep free speaking practice under 60 seconds.' });
    }
    if (!req.body.content) {
      return res.status(400).json({ error: 'content field is required' });
    }

    if (!isGovernedClearSpeakScoringAvailable()) {
      return res.status(503).json({
        error: CLEAR_SPEAK_SCORING_UNAVAILABLE_MESSAGE,
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    // Parse and validate all client-controlled fields before consuming quota.
    let submittedContent: unknown;
    try {
      submittedContent = JSON.parse(req.body.content);
    } catch {
      return res.status(400).json({ error: 'content must be valid JSON' });
    }
    const contentResult = ClearSpeakSessionContentSchema.safeParse(submittedContent);
    if (!contentResult.success) {
      return res.status(422).json({ error: 'content does not match the ClearSpeak session contract' });
    }
    let content = contentResult.data;

    const bridgeSessionId = req.body.bridgeSessionId as string | undefined;
    const snapshotId = req.body.snapshotId as string | undefined;
    if ((bridgeSessionId && !snapshotId) || (!bridgeSessionId && snapshotId)) {
      return res.status(422).json({ error: 'Grounded ClearSpeak scoring requires both snapshotId and bridgeSessionId' });
    }

    const profile = await getProfileFromStore(userId);
    if (!profile) return res.status(400).json({ error: 'Profile not found. Complete onboarding.' });

    if (!bridgeSessionId) {
      const usage = await consumeUsage(userId, 'clearspeak_session');
      if (!usage.allowed) return res.status(429).json({ error: "You have used today's free practice. Come back tomorrow or continue with saved work.", code: 'daily_limit_reached' });
    }

    let reservedArtifact: any = null;
    if (bridgeSessionId && snapshotId) {
      if (!supabaseAdmin) return res.status(503).json({ error: 'Authoritative persistence unavailable for grounded ClearSpeak practice' });
      const artifactId = content.generationArtifactId;
      const artifactHash = content.generationArtifactHash;
      if (!artifactId || !artifactHash) return res.status(422).json({ error: 'Grounded scoring requires the authoritative generated-content selector' });
      const canonicalContent = { ...content };
      delete canonicalContent.generationArtifactId;
      delete canonicalContent.generationArtifactHash;
      const submittedHash = hashArtifactContent(canonicalContent);
      const reservation = await supabaseAdmin.rpc('reserve_clearspeak_grounded_score_tx', {
        p_user_id: userId, p_bridge_id: bridgeSessionId, p_snapshot_id: snapshotId,
        p_artifact_id: artifactId, p_content_hash: artifactHash, p_submitted_hash: submittedHash,
      });
      if (reservation.error || !reservation.data) return res.status(409).json({ error: reservation.error?.message || 'Grounded ClearSpeak authority could not be reserved' });
      reservedArtifact = reservation.data;
      if (reservedArtifact.replayed) {
        return res.json({ ...reservedArtifact.response, groundingReplayed: true });
      }
      content = reservedArtifact.content;
    }

    // Audio buffer lives in req.file.buffer (in-memory only)
    const audioBuffer: Buffer = req.file.buffer;

    const ledger = await getOrCreateLedger(userId);

    let score;
    try {
      score = ClearSpeakSessionScoreSchema.parse(await scoreSession({
        audioBuffer,
        content,
        userLevel: profile.level,
        hardWords: ledger.entries.filter(e => !e.resolved),
      }));
    } catch (error) {
      if (reservedArtifact && supabaseAdmin) {
        await supabaseAdmin.from('clearspeak_generated_artifacts').update({ status: 'generated', reservation_token: null, scoring_lease_expires_at: null, updated_at: new Date().toISOString() })
          .eq('id', reservedArtifact.artifactId).eq('user_id', userId).eq('status', 'scoring')
          .eq('reservation_token', reservedArtifact.reservationToken);
      }
      throw error;
    }

    // Route-level low-confidence guard.
    // If both clarity AND composite are near zero, transcription almost certainly
    // failed (inaudible audio, mic disconnect, etc.). Return a 422 with a
    // user-readable message so the frontend can surface a retry prompt.
    if (score.composite <= 15 && score.clarity === 0) {
      if (reservedArtifact && supabaseAdmin) {
        await supabaseAdmin.from('clearspeak_generated_artifacts').update({ status: 'generated', reservation_token: null, scoring_lease_expires_at: null, updated_at: new Date().toISOString() })
          .eq('id', reservedArtifact.artifactId).eq('user_id', userId).eq('status', 'scoring')
          .eq('reservation_token', reservedArtifact.reservationToken);
      }
      return res.status(422).json({
        error: "We couldn't clearly hear your recording. Please check your microphone and try again.",
        code: 'low_confidence_transcription',
        score,
      });
    }

    let persistedSessionId: string | undefined;
    let groundingReplayed = false;
    let canonicalGroundedTrigger: any = null;
    let canonicalGroundedProgress: any = null;
    if (bridgeSessionId && snapshotId) {
      if (!supabaseAdmin) return res.status(503).json({ error: 'Authoritative persistence unavailable for grounded ClearSpeak practice' });
      const { data, error } = await supabaseAdmin.rpc('finalize_clearspeak_grounded_score_tx', {
        p_user_id: userId, p_bridge_id: bridgeSessionId, p_snapshot_id: snapshotId,
        p_artifact_id: reservedArtifact.artifactId, p_score: score,
        p_bridge_trigger: { bridgeReadyFlag: Boolean(content.bridgeReady) },
        p_reservation_token: reservedArtifact.reservationToken,
        p_topic_tag: content.topicTag,
        p_practiced_words: Array.isArray(content.keyVocab) ? content.keyVocab : [],
      });
      if (error || !data) {
        const alreadyConsumed = error?.message?.includes('already') === true;
        return res.status(alreadyConsumed ? 409 : 503).json({
          error: alreadyConsumed
            ? 'Grounded ClearSpeak authority is missing, mismatched, or already consumed'
            : 'Grounded ClearSpeak session could not be created',
        });
      }
      persistedSessionId = (data as any).sessionId;
      groundingReplayed = Boolean((data as any).replayed);
      canonicalGroundedTrigger = (data as any).response?.bridgeTrigger;
      canonicalGroundedProgress = (data as any).response?.progress;
      if (groundingReplayed) {
        return res.json({ ...(data as any).response, groundingReplayed: true });
      }
    } else if (supabaseAdmin) {
      const { data, error } = await supabaseAdmin.from('clearspeak_sessions').insert({
        user_id: userId,
        topic_tag: content.topicTag,
        score,
        practiced_words: Array.isArray(content.keyVocab) ? content.keyVocab : [],
        created_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      persistedSessionId = data?.id;
    }

    // Update Supabase progress. Only score JSON is stored; raw audio is never persisted.
    const updatedProgress = bridgeSessionId && snapshotId
      ? canonicalGroundedProgress
      : await recordSessionResult(userId, score, content.topicTag);

    // Evaluate bridge trigger against persisted data
    // Ungrounded content is client-submitted and cannot authorize bridge
    // readiness. Grounded readiness comes only from the canonical DB result.
    const bridgeTrigger = canonicalGroundedTrigger ?? await evaluateBridgeTrigger(userId, score, false);

    return res.json({ score, progress: updatedProgress, bridgeTrigger, sessionId: persistedSessionId, groundingReplayed });
  } catch (err: any) {
    console.error('[ClearSpeak] POST /score error:', err);
    if (err instanceof ClearSpeakScoringUnavailableError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
      });
    }
    if (err instanceof ClearSpeakPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Scoring failed' });
  } finally {
    wipeUploadedAudio(req);
    if (req.file) (req.file as any).buffer = null;
  }
}, handleMulterError);

// ─── GET /api/clearspeak/progress ─────────────────────────────────────────────

router.get('/progress', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const progress = await getProgress(userId);
    return res.json({ progress });
  } catch (err: any) {
    console.error('[ClearSpeak] GET /progress error:', err);
    if (err instanceof ClearSpeakPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Failed to load progress' });
  }
});

// ─── Beta Routes ──────────────────────────────────────────────────────────────
//
// Beta instrumentation routes. All require auth.
// Scope freeze: no new routes without product decision.
//
// POST /api/clearspeak/beta/event    — analytics event sink
// POST /api/clearspeak/beta/feedback — tester feedback capture
// GET  /api/clearspeak/beta/access   — beta feature flag check

/**
 * POST /api/clearspeak/beta/event
 * Receives client-emitted analytics events. Fire-and-forget from the client.
 * Always responds 204 (no content) so failures never block the session flow.
 *
 * PII POLICY: Only whitelisted numeric/boolean fields are logged.
 *   Any string fields in `properties` are truncated to 80 chars.
 *   Free-text, transcript content, and audio references are never logged.
 *
 * MVP storage: console.log only (queryable via Cloud Logging / server logs).
 * TODO(v1.1): Write to a Supabase clearspeak_beta_events table.
 */
router.post('/beta/event', betaEventLimiter, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid ?? 'anonymous';
    const { event, sessionId, timestamp, properties } = req.body ?? {};

    // Validate event name against known catalogue to reject noise
    const KNOWN_EVENTS = new Set([
      'session_started', 'session_completed', 'retry_used',
      'low_confidence_error', 'bridge_triggered', 'bridge_entered',
      'fallback_content_used', 'score_feedback_viewed',
    ]);

    if (!KNOWN_EVENTS.has(event)) {
      return res.status(204).end();
    }

    // ── PII Scrubber ──────────────────────────────────────────────────────────
    // Whitelisted property keys and their permitted types.
    // Any key NOT in this list is silently dropped before logging.
    // String values are capped at 80 chars to prevent accidental transcript leakage.
    // Audio references, transcript text, and free text are structurally excluded
    // because none of the known CsEventProperties use those types.
    const ALLOWED_NUMERIC: ReadonlySet<string> = new Set([
      'composite', 'clarity', 'pacing', 'rhythm', 'firstComposite', 'difficultyLevel',
    ]);
    const ALLOWED_BOOLEAN: ReadonlySet<string> = new Set([
      'retryUsed', 'bridgeAccepted', 'isFallback',
    ]);
    const ALLOWED_STRING: ReadonlySet<string> = new Set([
      'topicTag', 'errorSource', 'role', 'feedbackTipKey', 'fallbackTopic',
    ]);

    const safeProps: Record<string, unknown> = {};
    if (properties && typeof properties === 'object') {
      for (const [k, v] of Object.entries(properties as Record<string, unknown>)) {
        if (ALLOWED_NUMERIC.has(k) && typeof v === 'number') {
          safeProps[k] = v;
        } else if (ALLOWED_BOOLEAN.has(k) && typeof v === 'boolean') {
          safeProps[k] = v;
        } else if (ALLOWED_STRING.has(k) && typeof v === 'string') {
          // Cap string length — prevents any accidental free-text / transcript leakage
          safeProps[k] = v.slice(0, 80);
        }
        // All other keys are silently dropped.
      }
    }

    // Structured log — queryable in Cloud Logging with jsonPayload filters
    console.log(JSON.stringify({
      level: 'INFO',
      type: 'cs_beta_event',
      userId,
      event,
      sessionId: typeof sessionId === 'string' ? sessionId.slice(0, 64) : 'unknown',
      timestamp: typeof timestamp === 'string' ? timestamp.slice(0, 30) : new Date().toISOString(),
      properties: safeProps,
    }));

    return res.status(204).end();
  } catch {
    return res.status(204).end();
  }
});

/**
 * POST /api/clearspeak/beta/feedback
 * Stores beta tester yes/no feedback after session completion.
 * Writes to Supabase clearspeak_beta_feedback.
 *
 * Schema: { userId, sessionId, scoreFair, feedbackHelpful, confidentAfterRetry, submittedAt }
 */
router.post('/beta/feedback', betaFeedbackLimiter, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { sessionId, scoreFair, feedbackHelpful, confidentAfterRetry } = req.body ?? {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    if (!supabaseAdmin) {
      console.warn('[ClearSpeak] POST /beta/feedback: Supabase not available, dropping feedback silently');
      return res.json({ ok: true });
    }

    await supabaseAdmin.from('clearspeak_beta_feedback').upsert({
      user_id: userId,
      session_id: sessionId,
      score_fair: scoreFair ?? null,
      feedback_helpful: feedbackHelpful ?? null,
      confident_after_retry: confidentAfterRetry ?? null,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'user_id,session_id' });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[ClearSpeak] POST /beta/feedback error:', err);
    // Return ok:true anyway — feedback loss is acceptable; don't show users an error
    return res.json({ ok: true });
  }
});

/**
 * GET /api/clearspeak/beta/access
 * Checks whether the authenticated user is in the beta allowlist.
 *
 * A user is a beta tester if profiles.clearspeak_beta_enabled is true.
 *
 * To add a beta tester: set clearspeak_beta_enabled on the user's profile.
 *
 * Fail-closed: if the profile doesn't exist or the read fails, returns { enabled: false }.
 */
router.get('/beta/access', betaAccessLimiter, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid;
    return res.json({ enabled: await userHasClearSpeakBetaAccess(userId) });
  } catch (err: any) {
    console.error('[ClearSpeak] GET /beta/access error:', err);
    // Fail-closed — beta hidden on any error
    return res.json({ enabled: false });
  }
});

export default router;
