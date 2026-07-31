import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import {
  getCareerContextState,
  getUserCareerContextItems,
  handleItemDecision,
  setPersonalizationPreference,
  upsertCareerContextItems
} from '../services/careerContextService';
import { createGroundingSnapshot, getSnapshotById } from '../services/groundingSnapshotService';
import { createModuleBridgeSession, consumeModuleBridgeSession } from '../services/moduleBridgeService';
import { projectCareerContext } from '../services/careerContextProjectionService';
import { buildResumeContextItems } from '../services/careerContextAdapters/resumeContextAdapter';
import { buildClearSpeakContextItems } from '../services/careerContextAdapters/clearSpeakContextAdapter';
import { buildInterviewContextItems } from '../services/careerContextAdapters/interviewContextAdapter';
import { supabaseAdmin } from '../supabaseAdmin';

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
      state,
      activeItems,
      pendingItems,
      conflicts,
      projection,
    });
  } catch (err: any) {
    console.error('[CareerContextRoutes] GET / error:', err);
    return res.status(500).json({ error: 'Could not load career context' });
  }
});

// POST /api/career-context/rebuild
router.post('/rebuild', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase admin service unavailable' });
    }

    const newItems: any[] = [];

    // 1. Rebuild from resume_reviews
    const { data: resumes } = await supabaseAdmin
      .from('resume_reviews')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

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
          newItems.push(...items);
        }
      });
    }

    // 2. Rebuild from clearspeak_profiles & clearspeak_sessions
    const { data: csProfiles } = await supabaseAdmin
      .from('clearspeak_profiles')
      .select('*')
      .eq('user_id', userId);

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
        newItems.push(...items);
      });
    }

    const { data: csSessions } = await supabaseAdmin
      .from('clearspeak_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (csSessions && csSessions.length > 0) {
      csSessions.forEach(s => {
        if (s.score) {
          const items = buildClearSpeakContextItems({
            sessionRecordId: s.id,
            sessionScore: s.score,
            practicedWords: s.key_vocab || [],
            topicTag: s.topic_tag,
          });
          newItems.push(...items);
        }
      });
    }

    // 3. Rebuild from interview_sessions & reports
    const { data: intSessions } = await supabaseAdmin
      .from('interview_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (intSessions && intSessions.length > 0) {
      intSessions.forEach(s => {
        if (s.final_report) {
          const items = buildInterviewContextItems({
            sessionId: s.id,
            report: s.final_report,
          });
          newItems.push(...items);
        }
      });
    }

    await upsertCareerContextItems(userId, newItems);
    const updatedState = await getCareerContextState(userId);

    return res.json({
      success: true,
      rebuiltItemsCount: newItems.length,
      state: updatedState,
    });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /rebuild error:', err);
    return res.status(500).json({ error: 'Failed to rebuild career context' });
  }
});

// POST /api/career-context/preference
router.post('/preference', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { personalizationEnabled } = req.body;
    if (typeof personalizationEnabled !== 'boolean') {
      return res.status(400).json({ error: 'personalizationEnabled must be a boolean' });
    }

    const state = await setPersonalizationPreference(userId, personalizationEnabled);
    return res.json({ success: true, state });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /preference error:', err);
    return res.status(500).json({ error: 'Failed to update preference' });
  }
});

// POST /api/career-context/items/:itemId/decision
router.post('/items/:itemId/decision', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { itemId } = req.params;
    const { decision, newValue } = req.body;

    if (!['confirm', 'reject', 'revoke', 'dispute', 'edit'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision type' });
    }

    const item = await handleItemDecision(userId, itemId, decision, newValue);
    const state = await getCareerContextState(userId);

    return res.json({ success: true, item, state });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /items/decision error:', err);
    return res.status(500).json({ error: err.message || 'Failed to apply decision' });
  }
});

// POST /api/career-context/snapshots
router.post('/snapshots', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { purpose, includedItemIds, excludedItemIds, scope, sourceModules, expectedContextVersion } = req.body;

    if (!purpose || !Array.isArray(includedItemIds) || !scope || !Array.isArray(sourceModules)) {
      return res.status(400).json({ error: 'Invalid snapshot request parameters' });
    }

    const snapshot = await createGroundingSnapshot({
      userId,
      purpose,
      includedItemIds,
      excludedItemIds: excludedItemIds || [],
      scope,
      sourceModules,
      expectedContextVersion,
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

    return res.json({ snapshot });
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

    const { sourceModule, targetModule, purpose, snapshotId, sourceRecordId, clientRequestId } = req.body;

    if (!sourceModule || !targetModule || !purpose || !snapshotId || !clientRequestId) {
      return res.status(400).json({ error: 'Missing required bridge parameters' });
    }

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
    const { targetSessionId } = req.body;

    if (!targetSessionId) {
      return res.status(400).json({ error: 'targetSessionId is required' });
    }

    const bridge = await consumeModuleBridgeSession(userId, bridgeId, targetSessionId);
    return res.json({ success: true, bridge });
  } catch (err: any) {
    console.error('[CareerContextRoutes] POST /bridges/consume error:', err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to consume bridge' });
  }
});

export default router;
