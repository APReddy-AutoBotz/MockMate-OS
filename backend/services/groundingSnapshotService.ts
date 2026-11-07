import {
  CareerContextSnapshot,
  GroundingPurpose,
  CareerContextModule,
  CareerContextSnapshotSchema,
  CareerContextItem
} from 'mockmate-shared';
import { supabaseAdmin } from '../supabaseAdmin';
import { projectCareerContext } from './careerContextProjectionService';
import crypto from 'crypto';

export interface CreateSnapshotInput {
  userId: string;
  purpose: GroundingPurpose;
  includedItemIds: string[];
  excludedItemIds: string[];
  conflictSelections?: Record<string, string>;
  scope: 'one_time' | 'future_sessions';
  sourceModules: CareerContextModule[];
  expectedContextVersion?: number;
  clientRequestId?: string;
}

export async function createGroundingSnapshot(input: CreateSnapshotInput): Promise<CareerContextSnapshot> {
  if (!supabaseAdmin) {
    const err: any = new Error('Authoritative persistence unavailable');
    err.status = 503;
    throw err;
  }

  const {
    userId,
    purpose,
    includedItemIds,
    excludedItemIds,
    conflictSelections = {},
    scope,
    sourceModules,
    expectedContextVersion,
    clientRequestId = crypto.randomUUID()
  } = input;
  const acknowledgedAt = new Date().toISOString();

  const consent = {
    scope,
    purpose,
    includedItemIds,
    excludedItemIds,
    sourceModules,
    acknowledgedAt,
  };

  const rawHashPayload = JSON.stringify({
    userId,
    purpose,
    includedItemIds: [...includedItemIds].sort(),
    excludedItemIds: [...excludedItemIds].sort(),
    conflictSelections,
    scope,
    sourceModules: [...sourceModules].sort(),
  });
  const requestHash = crypto.createHash('sha256').update(rawHashPayload).digest('hex');

  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('create_grounding_snapshot_tx', {
    p_user_id: userId,
    p_purpose: purpose,
    p_expected_context_version: expectedContextVersion || null,
    p_included_item_ids: includedItemIds,
    p_excluded_item_ids: excludedItemIds,
    p_conflict_selections: conflictSelections,
    p_consent: consent,
    p_source_modules: sourceModules,
    p_client_request_id: clientRequestId,
    p_request_hash: requestHash,
  });

  if (rpcErr) {
    const err: any = new Error(rpcErr.message);
    if (rpcErr.message.includes('unique_user_snapshot_client_req') || rpcErr.message.includes('Stale context version')) {
      err.status = 409;
    } else {
      err.status = 422;
    }
    throw err;
  }

  const createdSnapshotId = (rpcRes as any)?.snapshotId;
  if (!createdSnapshotId) {
    throw new Error('RPC create_grounding_snapshot_tx failed to return snapshotId');
  }

  const created = await getSnapshotById(userId, createdSnapshotId);
  if (!created) {
    throw new Error(`Failed to load created snapshot ${createdSnapshotId}`);
  }

  return created;
}

export async function getSnapshotById(userId: string, snapshotId: string): Promise<CareerContextSnapshot | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('career_context_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  return getSnapshotFromDbRow(data);
}

function getSnapshotFromDbRow(data: any): CareerContextSnapshot {
  const parseJson = (v: any) => typeof v === 'string' ? JSON.parse(v) : v;
  const consent = parseJson(data.consent);
  const rawConflicts = parseJson(data.conflicts);
  const conflicts = Array.isArray(rawConflicts) ? rawConflicts : [];
  return CareerContextSnapshotSchema.parse({
    id: data.id,
    userId: data.user_id,
    purpose: data.purpose,
    contextVersion: Number(data.context_version),
    projection: parseJson(data.projection),
    conflicts,
    consent,
    createdAt: data.created_at instanceof Date ? data.created_at.toISOString() : String(data.created_at),
    sourceModules: data.source_modules,
    itemIds: consent?.includedItemIds || [],
  });
}

function mapDbToCareerContextItem(r: any): CareerContextItem {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.item_kind,
    canonicalKey: r.canonical_key,
    label: r.label,
    value: r.value,
    source: {
      module: r.source_module,
      recordId: r.source_record_id,
      fieldPath: r.source_path,
      sourceRevision: r.source_revision,
      sourceHash: r.source_hash,
      capturedAt: r.created_at,
    },
    exactExcerpt: r.exact_excerpt,
    provenance: r.provenance,
    status: r.item_status,
    sensitivity: r.sensitivity,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    supersededBy: r.superseded_by,
    userConfirmedAt: r.user_confirmed_at,
  };
}
