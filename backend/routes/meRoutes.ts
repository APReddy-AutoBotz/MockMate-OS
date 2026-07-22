import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { getUsageSummary } from '../services/usageService';
import { supabaseAdmin } from '../supabaseAdmin';
import { AccountDeletionResponseSchema } from 'mockmate-shared';

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
  const requestId = `del_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  try {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!supabaseAdmin) {
      return res.status(503).json({
        success: false,
        operation: 'app_data_deleted',
        deletedTables: [],
        failedTables: ['all'],
        authIdentityDeleted: false,
        authIdentityRetainedReason: 'Server data deletion service unavailable. Supabase service role is unconfigured.',
        requestId,
      });
    }

    const deletedTables: string[] = [];
    const failedTables: string[] = [];

    // Delete turns first for sessions
    const { data: sessions, error: sessionErr } = await supabaseAdmin
      .from('interview_sessions')
      .select('id')
      .eq('user_id', userId);

    if (sessionErr) {
      failedTables.push('interview_turns');
    } else if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const { error: turnErr } = await supabaseAdmin
        .from('interview_turns')
        .delete()
        .in('session_id', sessionIds);
      if (turnErr) failedTables.push('interview_turns');
      else deletedTables.push('interview_turns');
    } else {
      deletedTables.push('interview_turns');
    }

    const userOwnedTables = [
      'resume_reviews',
      'interview_sessions',
      'clearspeak_sessions',
      'clearspeak_progress',
      'clearspeak_profiles',
      'clearspeak_ledgers',
      'clearspeak_beta_feedback',
      'usage_ledger',
      'profiles',
    ];

    for (const table of userOwnedTables) {
      const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
      if (error) {
        console.error(`[Me] Error deleting table ${table}:`, error.message);
        failedTables.push(table);
      } else {
        deletedTables.push(table);
      }
    }

    const success = failedTables.length === 0;

    const responsePayload = {
      success,
      operation: 'app_data_deleted' as const,
      deletedTables,
      failedTables,
      authIdentityDeleted: false,
      authIdentityRetainedReason: 'Supabase Auth identity is retained for authentication. App data deleted.',
      requestId,
    };

    if (!success) {
      return res.status(500).json(responsePayload);
    }

    return res.json(AccountDeletionResponseSchema.parse(responsePayload));
  } catch (err: any) {
    console.error('[Me] delete data error:', err);
    return res.status(500).json({
      success: false,
      operation: 'app_data_deleted',
      deletedTables: [],
      failedTables: ['all'],
      authIdentityDeleted: false,
      authIdentityRetainedReason: 'Server error during data deletion',
      requestId,
    });
  }
});

export default router;
