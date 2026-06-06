import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { getUsageSummary } from '../services/usageService';
import { supabaseAdmin } from '../supabaseAdmin';

const router = Router();

router.use(verifyAuthToken);

router.get('/usage', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    return res.json(await getUsageSummary(userId));
  } catch (err: any) {
    console.error('[Me] usage error:', err);
    return res.status(500).json({ error: 'Could not load today\'s free practice usage' });
  }
});

router.delete('/data', async (req, res) => {
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!supabaseAdmin) return res.status(503).json({ error: 'Data service is not configured' });

    const { data: sessions } = await supabaseAdmin
      .from('interview_sessions')
      .select('id')
      .eq('user_id', userId);

    const sessionIds = (sessions || []).map(s => s.id);
    if (sessionIds.length) {
      await supabaseAdmin.from('interview_turns').delete().in('session_id', sessionIds);
    }

    const tables = [
      'resume_reviews',
      'interview_turns',
      'interview_sessions',
      'clearspeak_sessions',
      'clearspeak_progress',
      'clearspeak_profiles',
      'clearspeak_ledgers',
      'clearspeak_beta_feedback',
      'usage_ledger',
      'profiles',
    ];

    for (const table of tables) {
      await supabaseAdmin.from(table).delete().eq('user_id', userId);
    }

    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[Me] delete data error:', err);
    return res.status(500).json({ error: 'Could not delete your data' });
  }
});

export default router;
