import {
  ModuleBridgeSession,
  CareerContextModule,
  GroundingPurpose,
  ModuleBridgeSessionSchema
} from 'mockmate-shared';
import { supabaseAdmin } from '../supabaseAdmin';
import crypto from 'crypto';

export interface CreateBridgeInput {
  userId: string;
  sourceModule: CareerContextModule;
  targetModule: CareerContextModule;
  purpose: GroundingPurpose;
  snapshotId: string;
  sourceRecordId?: string;
  clientRequestId: string;
}

export async function createModuleBridgeSession(input: CreateBridgeInput): Promise<ModuleBridgeSession> {
  if (!supabaseAdmin) {
    const err: any = new Error('Authoritative persistence unavailable');
    err.status = 503;
    throw err;
  }

  const { userId, sourceModule, targetModule, purpose, snapshotId, sourceRecordId, clientRequestId } = input;

  // 1. Canonical request hash for exact replay
  const rawHashPayload = JSON.stringify({
    userId,
    sourceModule,
    targetModule,
    purpose,
    snapshotId,
    sourceRecordId: sourceRecordId || null,
  });
  const requestHash = crypto.createHash('sha256').update(rawHashPayload).digest('hex');

  // 2. Invoke transactional RPC create_module_bridge_tx
  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('create_module_bridge_tx', {
    p_user_id: userId,
    p_source_module: sourceModule,
    p_target_module: targetModule,
    p_purpose: purpose,
    p_snapshot_id: snapshotId,
    p_source_record_id: sourceRecordId || null,
    p_client_request_id: clientRequestId,
    p_request_hash: requestHash,
  });

  if (rpcErr) {
    const err: any = new Error(rpcErr.message);
    if (rpcErr.message.includes('Bridge snapshot ownership mismatch')) err.status = 404;
    else if (rpcErr.message.includes('unique_user_bridge_client_req') || rpcErr.message.includes('one_time_snapshot_already_reserved')) err.status = 409;
    else if (rpcErr.message.includes('source record does not belong')) err.status = 422;
    else err.status = 400;
    throw err;
  }

  const createdBridgeId = (rpcRes as any)?.bridgeId;
  if (!createdBridgeId) {
    throw new Error('RPC create_module_bridge_tx failed to return bridgeId');
  }

  const bridge = await getModuleBridgeById(userId, createdBridgeId);
  if (!bridge) {
    throw new Error(`Failed to load created bridge session ${createdBridgeId}`);
  }

  return bridge;
}

export async function consumeModuleBridgeSession(userId: string, bridgeId: string, targetSessionId: string): Promise<ModuleBridgeSession> {
  if (!supabaseAdmin) {
    const err: any = new Error('Authoritative persistence unavailable');
    err.status = 503;
    throw err;
  }

  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('consume_module_bridge_tx', {
    p_user_id: userId,
    p_bridge_id: bridgeId,
    p_target_session_id: targetSessionId,
  });

  if (rpcErr) {
    const err: any = new Error(rpcErr.message);
    if (rpcErr.message.includes('not found')) err.status = 404;
    else if (rpcErr.message.includes('not owned') || rpcErr.message.includes('access denied')) err.status = 403;
    else if (rpcErr.message.includes('already been consumed') || rpcErr.message.includes('cancelled') || rpcErr.message.includes('expired')) err.status = 409;
    else err.status = 400;
    throw err;
  }

  const bridge = await getModuleBridgeById(userId, bridgeId);
  if (!bridge) {
    throw new Error(`Failed to load consumed bridge ${bridgeId}`);
  }

  return bridge;
}

export async function getModuleBridgeById(userId: string, bridgeId: string): Promise<ModuleBridgeSession | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('career_context_bridges')
    .select('*')
    .eq('id', bridgeId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return mapDbToBridge(data);
}

function mapDbToBridge(row: any): ModuleBridgeSession {
  return ModuleBridgeSessionSchema.parse({
    id: row.id,
    userId: row.user_id,
    sourceModule: row.source_module,
    targetModule: row.target_module,
    purpose: row.purpose,
    snapshotId: row.snapshot_id,
    sourceRecordId: row.source_record_id || undefined,
    targetSessionId: row.target_session_id || undefined,
    status: row.status,
    clientRequestId: row.client_request_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
    confirmedAt: row.confirmed_at || undefined,
    consumedAt: row.consumed_at || undefined,
  });
}
