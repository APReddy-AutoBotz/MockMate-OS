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

import crypto from 'crypto';

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
      const err: any = new Error(`Client request ID '${clientRequestId}' already used for a different bridge payload.`);
      err.status = 409;
      throw err;
    }

    // 2. Insert New Bridge with real UUID
    const newBridgeId = crypto.randomUUID();
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
    id: crypto.randomUUID(),
    userId,
    sourceModule,
    targetModule,
    purpose,
    snapshotId,
    sourceRecordId: sourceRecordId || null,
    status: 'confirmed',
    clientRequestId,
    createdAt: now,
    updatedAt: now,
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
      .maybeSingle();

    if (findErr || !existing) {
      const err: any = new Error(`Bridge '${bridgeId}' not found or access denied.`);
      err.status = 404;
      throw err;
    }

    if (existing.status === 'consumed') {
      if (existing.target_session_id === targetSessionId) {
        return mapDbToBridge(existing);
      }
      const err: any = new Error(`Bridge '${bridgeId}' has already been consumed for session '${existing.target_session_id}'.`);
      err.status = 409;
      throw err;
    }

    if (existing.status === 'cancelled' || existing.status === 'expired') {
      const err: any = new Error(`Bridge '${bridgeId}' is ${existing.status} and cannot be consumed.`);
      err.status = 409;
      throw err;
    }

    // Atomic update
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('career_context_bridges')
      .update({
        status: 'consumed',
        target_session_id: targetSessionId,
        consumed_at: now,
        updated_at: now,
      })
      .eq('id', bridgeId)
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
    updatedAt: now,
    consumedAt: now,
  });
}

export async function getModuleBridgeById(userId: string, bridgeId: string): Promise<ModuleBridgeSession | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('career_context_bridges')
    .select('*')
    .eq('id', bridgeId)
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
