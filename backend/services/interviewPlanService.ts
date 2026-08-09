import crypto from 'crypto';
import { InterviewPlan, InterviewPlanSchema } from 'mockmate-shared';
import { supabaseAdmin } from '../supabaseAdmin';

export type AuthoritativePlan = {
  id: string;
  hash: string;
  version: number;
  snapshotId: string;
  bridgeId: string;
  plan: InterviewPlan;
  sessionId?: string;
};

export type PlanGenerationReservation = { generate: boolean; artifact?: AuthoritativePlan };

const persistenceError = (message: string) => Object.assign(new Error(message), { status: 503 });

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Return the exact JSON representation accepted by PostgreSQL JSONB. */
export function jsonSafeInterviewPlan(plan: InterviewPlan): InterviewPlan {
  const parsed = InterviewPlanSchema.parse(plan);
  return InterviewPlanSchema.parse(JSON.parse(JSON.stringify(parsed)));
}

export function hashInterviewPlan(plan: InterviewPlan): string {
  return crypto.createHash('sha256').update(canonicalJson(jsonSafeInterviewPlan(plan))).digest('hex');
}

export async function persistAuthoritativePlan(userId: string, snapshotId: string, bridgeId: string, plan: InterviewPlan): Promise<AuthoritativePlan> {
  if (!supabaseAdmin) throw persistenceError('Authoritative plan persistence unavailable');
  const parsed = jsonSafeInterviewPlan(plan);
  const hash = hashInterviewPlan(parsed);
  const { data, error } = await supabaseAdmin.from('interview_generated_plans').insert({
    user_id: userId, snapshot_id: snapshotId, bridge_id: bridgeId, plan_hash: hash, plan_version: 1, plan_payload: parsed,
  }).select('*').single();
  if (error || !data) throw persistenceError(`Failed to persist authoritative interview plan: ${error?.message || 'missing result'}`);
  return { id: data.id, hash: data.plan_hash, version: data.plan_version, snapshotId: data.snapshot_id, bridgeId: data.bridge_id, plan: InterviewPlanSchema.parse(data.plan_payload), sessionId: data.session_id || undefined };
}

function mapPlanRow(data: any): AuthoritativePlan {
  const plan = InterviewPlanSchema.parse(data.plan_payload);
  if (hashInterviewPlan(plan) !== data.plan_hash) throw persistenceError('Authoritative interview plan integrity check failed');
  return { id: data.id, hash: data.plan_hash, version: data.plan_version, snapshotId: data.snapshot_id, bridgeId: data.bridge_id, plan, sessionId: data.session_id || undefined };
}

/** Atomically elect one provider worker and charge grounded plan usage exactly once. */
export async function reserveAuthoritativePlanGeneration(userId: string, snapshotId: string, bridgeId: string): Promise<PlanGenerationReservation> {
  if (!supabaseAdmin) throw persistenceError('Authoritative plan persistence unavailable');
  const { data, error } = await supabaseAdmin.rpc('reserve_interview_plan_generation_tx', {
    p_user_id: userId, p_snapshot_id: snapshotId, p_bridge_id: bridgeId,
  });
  if (error) {
    const status = /usage limit/i.test(error.message) ? 429 : /mismatch|confirmed|owned/i.test(error.message) ? 409 : 503;
    throw Object.assign(new Error(error.message), { status });
  }
  if (data?.plan) return { generate: false, artifact: mapPlanRow(data.plan) };
  return { generate: Boolean(data?.generate) };
}

export async function finalizeAuthoritativePlanGeneration(userId: string, snapshotId: string, bridgeId: string, plan: InterviewPlan): Promise<AuthoritativePlan> {
  if (!supabaseAdmin) throw persistenceError('Authoritative plan persistence unavailable');
  const parsed = jsonSafeInterviewPlan(plan);
  const { data, error } = await supabaseAdmin.rpc('finalize_interview_plan_generation_tx', {
    p_user_id: userId, p_snapshot_id: snapshotId, p_bridge_id: bridgeId,
    p_plan_hash: hashInterviewPlan(parsed), p_plan_payload: parsed,
  });
  if (error || !data) throw persistenceError(`Failed to finalize authoritative interview plan: ${error?.message || 'missing result'}`);
  return mapPlanRow(data);
}

export async function waitForAuthoritativePlan(userId: string, bridgeId: string, timeoutMs = 15000): Promise<AuthoritativePlan> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const plan = await getAuthoritativePlanForBridge(userId, bridgeId);
    if (plan) return plan;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw persistenceError('Canonical interview plan generation is still in progress; retry this request');
}

export async function getAuthoritativePlanForBridge(userId: string, bridgeId: string): Promise<AuthoritativePlan | null> {
  if (!supabaseAdmin) throw persistenceError('Authoritative plan persistence unavailable');
  const { data, error } = await supabaseAdmin.from('interview_generated_plans').select('*').eq('bridge_id', bridgeId).eq('user_id', userId).maybeSingle();
  if (error) throw persistenceError(`Failed to read authoritative interview plan: ${error.message}`);
  if (!data) return null;
  const plan = InterviewPlanSchema.parse(data.plan_payload);
  if (hashInterviewPlan(plan) !== data.plan_hash) throw persistenceError('Authoritative interview plan integrity check failed');
  return { id: data.id, hash: data.plan_hash, version: data.plan_version, snapshotId: data.snapshot_id, bridgeId: data.bridge_id, plan, sessionId: data.session_id || undefined };
}

export async function getAuthoritativePlan(userId: string, planId: string): Promise<AuthoritativePlan | null> {
  if (!supabaseAdmin) throw persistenceError('Authoritative plan persistence unavailable');
  const { data, error } = await supabaseAdmin.from('interview_generated_plans').select('*').eq('id', planId).eq('user_id', userId).maybeSingle();
  if (error) throw persistenceError(`Failed to read authoritative interview plan: ${error.message}`);
  if (!data) return null;
  const plan = InterviewPlanSchema.parse(data.plan_payload);
  if (hashInterviewPlan(plan) !== data.plan_hash) throw persistenceError('Authoritative interview plan integrity check failed');
  return { id: data.id, hash: data.plan_hash, version: data.plan_version, snapshotId: data.snapshot_id, bridgeId: data.bridge_id, plan, sessionId: data.session_id || undefined };
}

export async function bindAuthoritativePlan(userId: string, planId: string, planHash: string, bridgeId: string, sessionId: string): Promise<void> {
  if (!supabaseAdmin) throw persistenceError('Authoritative plan persistence unavailable');
  const { error } = await supabaseAdmin.rpc('bind_interview_plan_session_tx', {
    p_user_id: userId, p_plan_id: planId, p_plan_hash: planHash, p_bridge_id: bridgeId, p_session_id: sessionId,
  });
  if (error) throw Object.assign(new Error(error.message), { status: 409 });
}
