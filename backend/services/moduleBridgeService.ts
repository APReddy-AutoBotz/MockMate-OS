import {
  ModuleBridgeSession,
  CareerContextModule,
  GroundingPurpose,
  ModuleBridgeSessionSchema
} from 'mockmate-shared';
import { supabaseAdmin } from '../supabaseAdmin';

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
  const { userId, sourceModule, targetModule, purpose, snapshotId, sourceRecordId, clientRequestId } = input;
  const now = new Date().toISOString();

  if (supabaseAdmin) {
    // 1. Idempotency Check
    const { data: existing } = await supabaseAdmin
      .from('career_context_bridges')
      .select('*')
      .eq('user_id', userId)
      .eq('client_request_id', clientRequestId)
      .maybeSingle();

    if (existing) {
      if (
        existing.source_module === sourceModule &&
        existing.target_module === targetModule &&
        existing.purpose === purpose &&
        existing.snapshot_id === snapshotId
      ) {
        return mapDbToBridge(existing);
      }
      throw new Error(`Client request ID '${clientRequestId}' already used for a different bridge payload.`);
    }

    // 2. Insert New Bridge
    const newBridgeId = `br_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const bridgeRow = {
      id: newBridgeId,
      user_id: userId,
      source_module: sourceModule,
      target_module: targetModule,
      purpose,
      snapshot_id: snapshotId,
      source_record_id: sourceRecordId || null,
      target_session_id: null,
      status: 'confirmed',
      client_request_id: clientRequestId,
      confirmed_at: now,
      consumed_at: null,
      created_at: now,
      updated_at: now,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from('career_context_bridges')
      .insert(bridgeRow)
      .select('*')
      .single();

    if (error || !inserted) {
      throw new Error(`Failed to create module bridge: ${error?.message || 'Database insert error'}`);
    }

    return mapDbToBridge(inserted);
  }

  // Fallback in-memory object if Supabase is unconfigured (for local unit testing)
  const mockBridge: ModuleBridgeSession = {
    id: `br_mock_${Date.now()}`,
    userId,
    sourceModule,
    targetModule,
    purpose,
    snapshotId,
    sourceRecordId,
    status: 'confirmed',
    clientRequestId,
    createdAt: now,
    confirmedAt: now,
  };
  return ModuleBridgeSessionSchema.parse(mockBridge);
}

export async function consumeModuleBridgeSession(userId: string, bridgeId: string, targetSessionId: string): Promise<ModuleBridgeSession> {
  const now = new Date().toISOString();

  if (supabaseAdmin) {
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('career_context_bridges')
      .select('*')
      .eq('id', bridgeId)
      .eq('user_id', userId)
      .single();

    if (findErr || !existing) {
      throw new Error(`Bridge '${bridgeId}' not found or access denied.`);
    }

    if (existing.status === 'consumed') {
      throw new Error(`Bridge '${bridgeId}' has already been consumed.`);
    }

    if (existing.status === 'cancelled' || existing.status === 'expired') {
      throw new Error(`Bridge '${bridgeId}' is ${existing.status} and cannot be consumed.`);
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('career_context_bridges')
      .update({
        status: 'consumed',
        target_session_id: targetSessionId,
        consumed_at: now,
        updated_at: now,
      })
      .eq('id', bridgeId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (updateErr || !updated) {
      throw new Error(`Failed to consume bridge '${bridgeId}': ${updateErr?.message || 'Update error'}`);
    }

    return mapDbToBridge(updated);
  }

  // In-memory fallback
  return ModuleBridgeSessionSchema.parse({
    id: bridgeId,
    userId,
    sourceModule: 'resume',
    targetModule: 'interview',
    purpose: 'resume_to_interview',
    snapshotId: 'snap_mock',
    targetSessionId,
    status: 'consumed',
    clientRequestId: 'mock_req',
    createdAt: now,
    consumedAt: now,
  });
}

export async function getModuleBridgeById(userId: string, bridgeId: string): Promise<ModuleBridgeSession | null> {
  if (!supabaseAdmin) return null;
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
    confirmedAt: row.confirmed_at || undefined,
    consumedAt: row.consumed_at || undefined,
  });
}
