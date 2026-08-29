import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { getUsageSummary } from '../services/usageService';
import { supabaseAdmin } from '../supabaseAdmin';
import { AccountDeletionResponseSchema } from 'mockmate-shared';
import {
  ACCOUNT_DELETE_FAILURE_HEADER,
  accountDeleteFailureSeamDecision,
} from '../config/previewFailureSeams';

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

    // P0-8 controller-only deterministic failure seam. A request that names
    // this header is always intercepted before persistence. It can produce the
    // synthetic 409 only in preview with an explicit environment gate; an
    // unauthorized/malformed seam request fails closed and never falls through
    // to the real deletion path.
    const failureSeam = accountDeleteFailureSeamDecision(
      process.env,
      req.header(ACCOUNT_DELETE_FAILURE_HEADER),
    );
    if (failureSeam.requested) {
      if (!failureSeam.authorized) {
        return res.status(403).json({
          error: 'Preview failure seam is not authorized. No deletion attempted.',
          code: 'FORBIDDEN',
        });
      }
      return res.status(409).json(AccountDeletionResponseSchema.parse({
        success: false,
        operation: 'app_data_deleted',
        deletedTables: [],
        failedTables: ['preview_failure_seam'],
        authIdentityDeleted: false,
        authIdentityRetainedReason: 'Preview-only deterministic failure seam; no deletion attempted.',
        requestId,
      }));
    }

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

    // 1. Transactional deletion of P0-3 Career Context records via protected RPC
    let rpcErr: any = null;
    let rpcExecuted = false;

    if (typeof (supabaseAdmin as any).rpc === 'function') {
      try {
        const res = await supabaseAdmin.rpc('delete_user_career_context', {
          target_user_id: userId,
        });
        rpcErr = res.error;
        rpcExecuted = true;
      } catch (err: any) {
        rpcErr = err;
      }
    }

    if (!rpcExecuted || rpcErr) {
      console.error('[Me] Transactional Career Context deletion failed:', rpcErr?.message || rpcErr || 'RPC unavailable');
      return res.status(503).json({
        success: false, operation: 'app_data_deleted', deletedTables: [],
        failedTables: ['career_context'], authIdentityDeleted: false,
        authIdentityRetainedReason: 'Transactional Career Context deletion failed; no other account data was deleted.', requestId,
      });
    } else {
      deletedTables.push(
        'career_context_snapshot_items',
        'career_context_bridges',
        'career_context_snapshots',
        'career_context_items',
        'career_context_state',
        'clearspeak_accent_attempt_lifecycle',
        'clearspeak_accent_attempts'
      );
    }

    // 2. Delete turns for user sessions
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

    // 3. Delete remaining application data tables
    const applicationTables = [
      'resume_reviews',
      'ai_cache',
      'interview_sessions',
      'clearspeak_sessions',
      'clearspeak_progress',
      'clearspeak_profiles',
      'clearspeak_ledgers',
      'clearspeak_beta_feedback',
      'usage_ledger',
      'profiles',
    ];

    for (const table of applicationTables) {
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
