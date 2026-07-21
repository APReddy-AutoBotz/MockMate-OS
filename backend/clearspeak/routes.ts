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
import { enforceUsageLimit } from '../services/usageService';
import { supabaseAdmin } from '../supabaseAdmin';
import { generateSession } from './generateService';
import { scoreSession } from './scoringService';
import {
  recordSessionResult,
  evaluateBridgeTrigger,
  getProgress,
  getOrCreateLedger,
} from './progressService';
import {
  saveProfileToStore,
  getProfileFromStore,
} from './supabaseStoreService';
import type { ClearSpeakProfile } from 'mockmate-shared';

const router = Router();

// ─── Rate Limiters ────────────────────────────────────────────────────────────
// Re-uses the same in-memory token-bucket pattern as server.ts.
// Per-IP, per-window. Intentionally lightweight — no Redis dependency.
// These limits are deliberately generous (beta has ≤15 testers): the goal is
// abuse protection, not throttling legitimate testers.

type RLBucket = { tokens: number; ts: number };
const _rlBuckets = new Map<string, RLBucket>();

function csRateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = (req.ip ?? req.headers['x-forwarded-for']?.toString() ?? 'anon');
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — max ~5 min WebM/Opus
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
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err instanceof MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Audio file exceeds the 10 MB limit. Please record a shorter clip.' });
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
    return res.status(500).json({ error: err.message || 'Failed to save profile' });
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
    return res.status(500).json({ error: err.message || 'Failed to load profile' });
  }
});

// ─── POST /api/clearspeak/generate ────────────────────────────────────────────

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const profile = await getProfileFromStore(userId);
    if (!profile) {
      return res.status(400).json({
        error: 'ClearSpeak profile not found. Complete onboarding first.',
      });
    }

    const { recentTopics = [], sessionAttemptLength = 0 } = req.body as { recentTopics?: string[], sessionAttemptLength?: number };
    const content = await generateSession(profile, recentTopics, sessionAttemptLength);

    return res.json({ content });
  } catch (err: any) {
    console.error('[ClearSpeak] POST /generate error:', err);
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

// ─── POST /api/clearspeak/score ───────────────────────────────────────────────
// Accepts multipart/form-data with:
//   audio          (binary file, required)
//   content        (JSON string of ClearSpeakSessionContent, required)
//   retryAttempted (JSON boolean string, optional, default false)

router.post('/score', enforceUsageLimit('clearspeak_session'), upload.single('audio'), async (req: Request, res: Response) => {
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

    const profile = await getProfileFromStore(userId);
    if (!profile) return res.status(400).json({ error: 'Profile not found. Complete onboarding.' });

    // Parse JSON fields from multipart body
    let content: any;
    try {
      content = JSON.parse(req.body.content);
    } catch {
      return res.status(400).json({ error: 'content must be valid JSON' });
    }

    const retryAttempted = req.body.retryAttempted === 'true' || req.body.retryAttempted === true;

    // Audio buffer lives in req.file.buffer (in-memory only)
    let audioBuffer: Buffer = req.file.buffer;

    const ledger = await getOrCreateLedger(userId);

    const score = await scoreSession({
      audioBuffer,
      content,
      userLevel: profile.level,
      hardWords: ledger.entries.filter(e => !e.resolved),
      retryAttempted,
    });

    // Explicitly clear buffer reference — privacy policy (raw audio never persisted)
    audioBuffer = Buffer.alloc(0);
    (req.file as any).buffer = null;

    // Route-level low-confidence guard.
    // If both clarity AND composite are near zero, transcription almost certainly
    // failed (inaudible audio, mic disconnect, etc.). Return a 422 with a
    // user-readable message so the frontend can surface a retry prompt.
    if (score.composite <= 15 && score.clarity === 0) {
      return res.status(422).json({
        error: 'low_confidence_transcription',
        message: "We couldn't clearly hear your recording. Please check your microphone and try again.",
        score,
      });
    }

    if (supabaseAdmin) {
      await supabaseAdmin.from('clearspeak_sessions').insert({
        user_id: userId,
        topic_tag: content.topicTag,
        score,
        practiced_words: Array.isArray(content.keyVocab) ? content.keyVocab : [],
        created_at: new Date().toISOString(),
      });
    }

    // Update Supabase progress. Only score JSON is stored; raw audio is never persisted.
    const updatedProgress = await recordSessionResult(userId, score, content.topicTag);

    // Evaluate bridge trigger against persisted data
    const bridgeTrigger = await evaluateBridgeTrigger(userId, score, content.bridgeReady);

    return res.json({ score, progress: updatedProgress, bridgeTrigger });
  } catch (err: any) {
    console.error('[ClearSpeak] POST /score error:', err);
    return res.status(500).json({ error: err.message || 'Scoring failed' });
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
    return res.status(500).json({ error: err.message || 'Failed to load progress' });
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
    if (!userId) return res.json({ enabled: false });

    if (!supabaseAdmin) return res.json({ enabled: false });

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('clearspeak_beta_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return res.json({ enabled: false });
    return res.json({ enabled: data.clearspeak_beta_enabled === true });
  } catch (err: any) {
    console.error('[ClearSpeak] GET /beta/access error:', err);
    // Fail-closed — beta hidden on any error
    return res.json({ enabled: false });
  }
});

export default router;
