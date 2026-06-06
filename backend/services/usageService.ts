import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../supabaseAdmin';

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

  if (!supabaseAdmin) {
    const key = memoryKey(userId, feature);
    const current = memoryUsage.get(key) || { used: 0, limit };
    if (current.used >= limit) return { allowed: false, used: current.used, limit };
    const next = { used: current.used + 1, limit };
    memoryUsage.set(key, next);
    return { allowed: true, ...next };
  }

  const { data, error } = await supabaseAdmin
    .from('usage_ledger')
    .select('used, limit_value')
    .eq('user_id', userId)
    .eq('usage_date', usageDate)
    .eq('feature', feature)
    .maybeSingle();

  if (error) throw error;

  const used = Number(data?.used || 0);
  if (used >= limit) return { allowed: false, used, limit };

  const nextUsed = used + 1;
  const { error: upsertError } = await supabaseAdmin
    .from('usage_ledger')
    .upsert({
      user_id: userId,
      usage_date: usageDate,
      feature,
      used: nextUsed,
      limit_value: limit,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,usage_date,feature' });

  if (upsertError) throw upsertError;
  return { allowed: true, used: nextUsed, limit };
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
