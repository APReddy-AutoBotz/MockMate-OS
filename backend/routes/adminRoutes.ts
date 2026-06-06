import { Router } from 'express';
import { verifyAuthToken } from '../middleware/authMiddleware';
import { supabaseAdmin } from '../supabaseAdmin';

const router = Router();

router.use(verifyAuthToken);

const getAdminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);

router.use((req, res, next) => {
  const email = String((req as any).user?.email || '').toLowerCase();
  const admins = getAdminEmails();

  if (!email || !admins.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
});

router.get('/usage', async (_req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Data service is not configured' });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin
      .from('usage_ledger')
      .select('usage_date, feature, used, limit_value')
      .gte('usage_date', since)
      .order('usage_date', { ascending: false });

    if (error) throw error;

    const byDateAndFeature = new Map<string, { date: string; feature: string; used: number; limit: number }>();
    for (const row of data || []) {
      const key = `${row.usage_date}:${row.feature}`;
      const current = byDateAndFeature.get(key) || {
        date: row.usage_date,
        feature: row.feature,
        used: 0,
        limit: 0,
      };
      current.used += Number(row.used || 0);
      current.limit += Number(row.limit_value || 0);
      byDateAndFeature.set(key, current);
    }

    const { count: cacheEntries } = await supabaseAdmin
      .from('ai_cache')
      .select('*', { count: 'exact', head: true });

    return res.json({
      window: '7d',
      usage: Array.from(byDateAndFeature.values()),
      aiCacheEntries: cacheEntries || 0,
    });
  } catch (err) {
    console.error('[Admin] usage summary error:', err);
    return res.status(500).json({ error: 'Could not load admin usage summary' });
  }
});

export default router;
