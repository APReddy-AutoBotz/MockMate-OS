import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import {
  getCareerContextState,
  getUserCareerContextItems,
  handleItemDecision,
  setPersonalizationPreference,
  saveCareerContextItemDrafts
} from '../services/careerContextService';
import { createGroundingSnapshot, getSnapshotById } from '../services/groundingSnapshotService';
import { createModuleBridgeSession, consumeModuleBridgeSession } from '../services/moduleBridgeService';
import { projectCareerContext } from '../services/careerContextProjectionService';
import { buildResumeContextItems } from '../services/careerContextAdapters/resumeContextAdapter';
import { buildClearSpeakContextItems } from '../services/careerContextAdapters/clearSpeakContextAdapter';
import { buildInterviewContextItems } from '../services/careerContextAdapters/interviewContextAdapter';
import { supabaseAdmin } from '../supabaseAdmin';
import {
  CareerContextItemDraft,
  CareerContextItemDecisionRequestSchema,
  GroundingSnapshotCreateRequestSchema,
  ModuleBridgeCreateRequestSchema,
  ModuleBridgeConsumeRequestSchema,
  CareerContextPreferenceRequestSchema
} from 'mockmate-shared';

const router = Router();

router.use(verifyAuthToken);

// GET /api/career-context
router.get('/', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const state = await getCareerContextState(userId);
    const allItems = await getUserCareerContextItems(userId);

    const activeItems = allItems.filter(i => i.status === 'active');
    const pendingItems = allItems.filter(i => i.status === 'pending_confirmation');
    const { projection, conflicts } = projectCareerContext(allItems);

    return res.json({
      success: true,
      state,
      activeItems,
      pendingItems,
      conflicts,
      projection,
    });
  } catch (err: any) {
    console.error('[CareerContextRoutes] GET / error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Could not load career context' });
  }
});

// POST /api/career-context/rebuild
router.post('/rebuild', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Authoritative persistence unavailable' });
    }

    const drafts: CareerContextItemDraft[] = [];

    // 1. Rebuild from resume_reviews
    const { data: resumes, error: resumesError } = await supabaseAdmin
      .from('resume_reviews')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (resumesError) throw Object.assign(new Error(`Failed to read Resume sources: ${resumesError.message}`), { status: 503 });

    if (resumes && resumes.length > 0) {
      resumes.forEach(r => {
        const resumeData = r.resume_data || r.parsed_data;
        if (resumeData && typeof resumeData === 'object' && resumeData.basics) {
          const items = buildResumeContextItems({
            resumeData,
            recordId: r.id,
            targetRole: r.target_role,
            jdMissingSkills: r.missing_skills || [],
          });
          drafts.push(...items);
        }
      });
    }

    // 2. Rebuild from clearspeak_profiles & clearspeak_sessions
    const { data: csProfiles, error: csProfilesError } = await supabaseAdmin
      .from('clearspeak_profiles')
      .select('*')
      .eq('user_id', userId);

    if (csProfilesError) throw Object.assign(new Error(`Failed to read ClearSpeak profiles: ${csProfilesError.message}`), { status: 503 });

    if (csProfiles && csProfiles.length > 0) {
      csProfiles.forEach(p => {
        const items = buildClearSpeakContextItems({
          profile: {
            userId: p.user_id,
            role: p.role,
            level: p.level || 1,
            goal: p.goal,
            audienceContext: p.audience_context,
            mainStruggle: p.main_struggle,
            comfortLanguage: p.comfort_language,
            practiceDuration: p.practice_duration || 5,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          },
        });
        drafts.push(...items);
      });
    }

    const { data: csSessions, error: csSessionsError } = await supabaseAdmin
      .from('clearspeak_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (csSessionsError) throw Object.assign(new Error(`Failed to read ClearSpeak sessions: ${csSessionsError.message}`), { status: 503 });

    if (csSessions && csSessions.length > 0) {
      csSessions.forEach(s => {
        const practicedWords = Array.isArray(s.practiced_words) ? s.practiced_words : (Array.isArray(s.key_vocab) ? s.key_vocab : []);
        if (s.score || practicedWords.length > 0) {
          const items = buildClearSpeakContextItems({
            sessionRecordId: s.id,
            sessionScore: s.score || null,
            practicedWords,
            topicTag: s.topic_tag,
          });
          drafts.push(...items);
        }
      });
    }

    // 3. Rebuild from interview_sessions & reports
    const { data: intSessions, error: intSessionsError } = await supabaseAdmin
      .from('interview_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (intSessionsError) throw Object.assign(new Error(`Failed to read Interview sources: ${intSessionsError.message}`), { status: 503 });

    if (intSessions && intSessions.length > 0) {
      intSessions.forEach(s => {
        if (s.final_report) {
          const items = buildInterviewContextItems({
            sessionId: s.id,
            report: s.final_report,
          });
          drafts.push(...items);
        }
      });
    }

    const result = await saveCareerContextItemDrafts(userId, drafts);
    const updatedState = await getCareerContextState(userId);

    return res.json({
      success: true,
      state: updatedState,
      addedCount: result.addedCount,
      supersededCount: result.updatedCount,
      unchangedCount: result.unchangedCount,
    });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /rebuild error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to rebuild career context' });
  }
});

// POST /api/career-context/preference
router.post('/preference', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parseResult = CareerContextPreferenceRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ error: 'Invalid preference payload', details: parseResult.error.issues });
    }

    const state = await setPersonalizationPreference(
      userId,
      parseResult.data.personalizationEnabled,
      parseResult.data.expectedContextVersion
    );
    return res.json({ success: true, state });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /preference error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to update preference' });
  }
});

// POST /api/career-context/items/:itemId/decision
router.post('/items/:itemId/decision', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { itemId } = req.params;
    const parseResult = CareerContextItemDecisionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ error: 'Invalid decision payload', details: parseResult.error.issues });
    }

    const { decision, replacementValue, expectedContextVersion } = parseResult.data;

    const item = await handleItemDecision(
      userId,
      itemId,
      decision,
      replacementValue,
      expectedContextVersion
    );
    const state = await getCareerContextState(userId);

    return res.json({ success: true, item, state });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /items/decision error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to apply decision' });
  }
});

// POST /api/career-context/snapshots
router.post('/snapshots', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parseResult = GroundingSnapshotCreateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ error: 'Invalid snapshot creation payload', details: parseResult.error.issues });
    }

    const { purpose, includedItemIds, excludedItemIds, conflictSelections, consent, expectedContextVersion, clientRequestId } = parseResult.data;

    const snapshot = await createGroundingSnapshot({
      userId,
      purpose,
      includedItemIds,
      excludedItemIds: excludedItemIds || [],
      conflictSelections,
      scope: consent.scope,
      sourceModules: consent.sourceModules,
      expectedContextVersion,
      clientRequestId,
    });

    return res.json({ success: true, snapshot });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /snapshots error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to create snapshot' });
  }
});

// GET /api/career-context/snapshots/:snapshotId
router.get('/snapshots/:snapshotId', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const snapshot = await getSnapshotById(userId, req.params.snapshotId);
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

    return res.json({ success: true, snapshot });
  } catch (err: any) {
    console.error('[CareerContextRoutes] GET /snapshots/:snapshotId error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: 'Failed to fetch snapshot' });
  }
});

// POST /api/career-context/bridges
router.post('/bridges', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parseResult = ModuleBridgeCreateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ error: 'Invalid bridge creation payload', details: parseResult.error.issues });
    }

    const { sourceModule, targetModule, purpose, snapshotId, sourceRecordId, clientRequestId } = parseResult.data;

    const bridge = await createModuleBridgeSession({
      userId,
      sourceModule,
      targetModule,
      purpose,
      snapshotId,
      sourceRecordId,
      clientRequestId,
    });

    return res.json({ success: true, bridge });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /bridges error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to create bridge' });
  }
});

// POST /api/career-context/bridges/:bridgeId/consume
router.post('/bridges/:bridgeId/consume', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { bridgeId } = req.params;
    const parseResult = ModuleBridgeConsumeRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({ error: 'Invalid bridge consume payload', details: parseResult.error.issues });
    }

    const { targetSessionId } = parseResult.data;

    const bridge = await consumeModuleBridgeSession(userId, bridgeId, targetSessionId);
    const snapshot = await getSnapshotById(userId, bridge.snapshotId);
    const projection = snapshot ? snapshot.projection : null;
    return res.json({ success: true, bridge, projection });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /bridges/consume error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to consume bridge' });
  }
});

export default router;
