import {
  CareerContextSnapshot,
  GroundingPurpose,
  CareerContextModule,
  CareerContextSnapshotSchema,
  CareerContextItem
} from 'mockmate-shared';
import { supabaseAdmin } from '../supabaseAdmin';
import { projectCareerContext, resolveSnapshotConflictItems } from './careerContextProjectionService';
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
  if (includedItemIds.length === 0) {
    throw Object.assign(new Error('Grounded snapshots require at least one authoritative included fact'), { status: 422 });
  }
  const acknowledgedAt = new Date().toISOString();

  const requestHashForVersion = (contextVersion: number) => crypto.createHash('sha256').update(JSON.stringify({
    userId,
    purpose,
    contextVersion,
    includedItemIds: [...includedItemIds].sort(),
    excludedItemIds: [...excludedItemIds].sort(),
    conflictSelections: Object.fromEntries(Object.entries(conflictSelections).sort(([a], [b]) => a.localeCompare(b))),
    scope,
    sourceModules: [...sourceModules].sort(),
  })).digest('hex');

  // Response-loss recovery precedes every check against mutable live state.
  // The committed snapshot is immutable, so its original context version is
  // the only version with which the original request can be authenticated.
  const { data: existingRequest, error: existingRequestError } = await supabaseAdmin
    .from('career_context_snapshots')
    .select('id, context_version, request_hash')
    .eq('user_id', userId)
    .eq('client_request_id', clientRequestId)
    .maybeSingle();
  if (existingRequestError) {
    throw Object.assign(new Error(`Failed to resolve snapshot request replay: ${existingRequestError.message}`), { status: 503 });
  }
  if (existingRequest) {
    const originalVersion = Number(existingRequest.context_version);
    const replayVersion = expectedContextVersion ?? originalVersion;
    if (replayVersion !== originalVersion || requestHashForVersion(originalVersion) !== existingRequest.request_hash) {
      throw Object.assign(new Error('Snapshot clientRequestId replay has materially different original request inputs'), { status: 409 });
    }
    const replayed = await getSnapshotById(userId, existingRequest.id);
    if (!replayed) throw Object.assign(new Error('Canonical snapshot replay could not be loaded'), { status: 503 });
    return replayed;
  }

  // 1. Load active state version for user
  let contextVersion = 1;
  let personalizationEnabled = false;
  const { data: stateData, error: stateError } = await supabaseAdmin
    .from('career_context_state')
    .select('context_version, personalization_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (stateError) {
    throw Object.assign(new Error(`Failed to load authoritative context version: ${stateError.message}`), { status: 503 });
  }

  if (stateData) {
    contextVersion = Number(stateData.context_version);
    personalizationEnabled = Boolean(stateData.personalization_enabled);
  }

  if (expectedContextVersion !== undefined && expectedContextVersion !== contextVersion) {
    const err: any = new Error(`Stale or mismatched context version: expected ${expectedContextVersion}, current is ${contextVersion}`);
    err.status = 409;
    throw err;
  }

  // 2. Canonical request hash for idempotency
  const requestHash = requestHashForVersion(contextVersion);

  // 3. Load specified items (verifying ownership, active status, and sensitivity)
  let items: CareerContextItem[] = [];
  if (includedItemIds.length > 0) {
    const { data: rawItems, error } = await supabaseAdmin
      .from('career_context_items')
      .select('*')
      .eq('user_id', userId)
      .in('id', includedItemIds);

    if (error) {
      throw new Error(`Failed to load requested career context items: ${error.message}`);
    }

    if (rawItems) {
      if (rawItems.length !== includedItemIds.length) {
        const err: any = new Error('One or more requested career context items were missing or not owned by user.');
        err.status = 422;
        throw err;
      }

      for (const r of rawItems) {
        if (!sourceModules.includes(r.source_module)) {
          const err: any = new Error(`Item ${r.id} belongs to undeclared source module ${r.source_module}.`);
          err.status = 422;
          throw err;
        }
        if (r.item_status !== 'active') {
          const err: any = new Error(`Item ${r.id} is not active (status: ${r.item_status}).`);
          err.status = 422;
          throw err;
        }
        if (r.provenance === 'inferred_pending') {
          const err: any = new Error(`Item ${r.id} is inferred_pending and cannot be grounded until user confirmed.`);
          err.status = 422;
          throw err;
        }
        if (r.sensitivity === 'personal_contact') {
          const err: any = new Error(`Item ${r.id} has personal_contact sensitivity and cannot be grounded.`);
          err.status = 422;
          throw err;
        }
      }

      items = rawItems.map(mapDbToCareerContextItem);
    }
  }

  // 4. Resolve conflicts before projection and persistence. The same exact
  // winner-only set is authoritative for consent, immutable membership,
  // references, and every downstream grounded module.
  const resolvedItems = resolveSnapshotConflictItems(items, conflictSelections);
  const { projection, conflicts } = projectCareerContext(resolvedItems, purpose, {}, personalizationEnabled);

  const consent = {
    scope,
    purpose,
    includedItemIds: resolvedItems.map(i => i.id),
    excludedItemIds,
    sourceModules,
    acknowledgedAt,
  };

  // 5. Invoke transactional RPC create_grounding_snapshot_tx
  const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc('create_grounding_snapshot_tx', {
    p_user_id: userId,
    p_purpose: purpose,
    p_projection: projection,
    p_conflicts: conflicts,
    p_consent: consent,
    p_source_modules: sourceModules,
    p_item_ids: resolvedItems.map(i => i.id),
    p_expected_context_version: expectedContextVersion ?? contextVersion,
    p_client_request_id: clientRequestId,
    p_request_hash: requestHash,
  });

  if (rpcErr) {
    const err: any = new Error(rpcErr.message);
    if (rpcErr.message.includes('unique_user_snapshot_client_req')) err.status = 409;
    else err.status = 400;
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

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('career_context_snapshot_items')
    .select('position, career_context_items!inner(id,user_id,label,source_module,source_record_id,source_path,exact_excerpt)')
    .eq('snapshot_id', snapshotId)
    .order('position', { ascending: true });
  if (membershipError) throw Object.assign(new Error(`Failed to load authoritative snapshot membership: ${membershipError.message}`), { status: 503 });

  const snapshot = getSnapshotFromDbRow(data);
  const refs = (memberships || []).map((membership: any) => {
    const item = membership.career_context_items;
    if (!item || item.user_id !== userId) throw Object.assign(new Error('Snapshot membership ownership mismatch'), { status: 403 });
    return {
      contextItemId: item.id,
      sourceModule: item.source_module,
      sourceRecordId: item.source_record_id || item.id,
      sourcePath: item.source_path || 'value',
      label: item.label,
      exactExcerpt: item.exact_excerpt || null,
      purpose: snapshot.purpose,
    };
  });
  return CareerContextSnapshotSchema.parse({ ...snapshot, groundingReferences: refs });
}

function getSnapshotFromDbRow(data: any): CareerContextSnapshot {
  return CareerContextSnapshotSchema.parse({
    id: data.id,
    userId: data.user_id,
    purpose: data.purpose,
    contextVersion: Number(data.context_version),
    projection: data.projection,
    conflicts: data.conflicts || [],
    consent: data.consent,
    createdAt: data.created_at,
    sourceModules: data.source_modules,
    itemIds: data.consent?.includedItemIds || [],
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
