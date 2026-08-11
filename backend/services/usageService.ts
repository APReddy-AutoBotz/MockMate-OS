import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../supabaseAdmin';
import { runtimeMode } from '../config/runtimeConfig';

export const USAGE_LIMITS = {
  resume_review: 3,
  resume_suggestion: 10,
  interview_question: 20,
  clearspeak_session: 5,
} as const;

export type UsageFeature = keyof typeof USAGE_LIMITS;

const friendlyLimitMessage = "You have used today's free practice. Come back tomorrow or continue with saved work.";
const memoryUsage = new Map<string, { used: number; limit: number }>();

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function memoryKey(userId: string, feature: UsageFeature): string {
  return `${userId}:${todayISO()}:${feature}`;
}

export async function consumeUsage(userId: string, feature: UsageFeature): Promise<{ allowed: boolean; used: number; limit: number }> {
  const limit = USAGE_LIMITS[feature];
  const usageDate = todayISO();

  const mode = runtimeMode();
  if (mode === 'test') {
    return { allowed: true, used: 1, limit };
  }

  if (!supabaseAdmin) {
    if (mode !== 'development') throw new Error('USAGE_AUTHORITY_UNAVAILABLE');
    const key = memoryKey(userId, feature);
    const current = memoryUsage.get(key) || { used: 0, limit };
    if (current.used >= limit) return { allowed: false, used: current.used, limit };
    const next = { used: current.used + 1, limit };
    memoryUsage.set(key, next);
    return { allowed: true, ...next };
  }

  const { data, error } = await supabaseAdmin.rpc('consume_daily_usage_tx', {
    p_user_id: userId, p_feature: feature, p_limit: limit,
  });
  if (error || !data) throw error || new Error('USAGE_AUTHORITY_UNAVAILABLE');
  return { allowed: Boolean(data.allowed), used: Number(data.used), limit: Number(data.limit) };
}

export function enforceUsageLimit(feature: UsageFeature) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const result = await consumeUsage(userId, feature);
      if (!result.allowed) {
        return res.status(429).json({
          error: friendlyLimitMessage,
          code: 'daily_limit_reached',
          feature,
          used: result.used,
          limit: result.limit,
        });
      }
      (req as any).usage = { feature, used: result.used, limit: result.limit };
      next();
    } catch (err: any) {
      console.error('[Usage] limit check failed:', err);
      res.status(500).json({ error: 'Could not check free practice usage' });
    }
  };
}

export async function getUsageSummary(userId: string) {
  const usageDate = todayISO();
  const defaults: Record<string, { used: number; limit: number }> = Object.fromEntries(
    Object.entries(USAGE_LIMITS).map(([feature, limit]) => [feature, { used: 0, limit }]),
  );

  if (!supabaseAdmin) {
    if (runtimeMode() !== 'development') throw new Error('USAGE_AUTHORITY_UNAVAILABLE');
    for (const feature of Object.keys(USAGE_LIMITS) as UsageFeature[]) {
      const value = memoryUsage.get(memoryKey(userId, feature));
      if (value) defaults[feature] = value;
    }
    return { date: usageDate, usage: defaults };
  }

  const { data, error } = await supabaseAdmin
    .from('usage_ledger')
    .select('feature, used, limit_value')
    .eq('user_id', userId)
    .eq('usage_date', usageDate);

  if (error) throw error;
  for (const row of data || []) {
    defaults[row.feature] = { used: row.used || 0, limit: row.limit_value || USAGE_LIMITS[row.feature as UsageFeature] || 0 };
  }
  return { date: usageDate, usage: defaults };
}
