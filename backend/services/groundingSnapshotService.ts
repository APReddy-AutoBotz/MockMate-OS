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

const inMemorySnapshots = new Map<string, CareerContextSnapshot>();

export async function createGroundingSnapshot(input: CreateSnapshotInput): Promise<CareerContextSnapshot> {
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

  // 1. Load active state version for user
  let contextVersion = 1;
  let personalizationEnabled = false;
  if (supabaseAdmin) {
    const { data: stateData } = await supabaseAdmin
      .from('career_context_state')
      .select('context_version, personalization_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    if (stateData) {
      contextVersion = Number(stateData.context_version);
      personalizationEnabled = Boolean(stateData.personalization_enabled);
    }
  }

  if (expectedContextVersion !== undefined && expectedContextVersion !== contextVersion) {
    const err: any = new Error(`Stale or mismatched context version: expected ${expectedContextVersion}, current is ${contextVersion}`);
    err.status = 409;
    throw err;
  }

  // 2. Canonical request hash for idempotency
  const sortedInc = [...includedItemIds].sort();
  const sortedExc = [...excludedItemIds].sort();
  const sortedMods = [...sourceModules].sort();
  const rawHashPayload = JSON.stringify({
    userId,
    purpose,
    contextVersion,
    includedItemIds: sortedInc,
    excludedItemIds: sortedExc,
    conflictSelections,
    scope,
    sourceModules: sortedMods,
  });
  const requestHash = crypto.createHash('sha256').update(rawHashPayload).digest('hex');

  // Idempotency replay check
  if (supabaseAdmin && clientRequestId) {
    const { data: existing } = await supabaseAdmin
      .from('career_context_snapshots')
      .select('*')
      .eq('user_id', userId)
      .eq('client_request_id', clientRequestId)
      .maybeSingle();

    if (existing) {
      if (existing.request_hash === requestHash) {
        return getSnapshotFromDbRow(existing);
      }
      const err: any = new Error(`Idempotency conflict: client_request_id '${clientRequestId}' already used with different payload.`);
      err.status = 409;
      throw err;
    }
  }

  // 3. Load specified items (verifying ownership, active status, and sensitivity)
  let items: CareerContextItem[] = [];
  if (supabaseAdmin && includedItemIds.length > 0) {
    const { data: rawItems, error } = await supabaseAdmin
      .from('career_context_items')
      .select('*')
      .eq('user_id', userId)
      .in('id', includedItemIds);

    if (error) {
      throw new Error(`Failed to load requested career context items: ${error.message}`);
    }

    if (rawItems) {
      // Reject if any requested item is missing, cross-user, or non-active
      if (rawItems.length !== includedItemIds.length) {
        const err: any = new Error('One or more requested career context items were missing or not owned by user.');
        err.status = 422;
        throw err;
      }

      for (const r of rawItems) {
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

  // 4. Project context & compute conflicts
  const { projection, conflicts } = projectCareerContext(items, purpose, conflictSelections, personalizationEnabled);

  // Reject unresolved conflicts
  const unresolved = conflicts.find(c => c.requiresUserChoice && !conflictSelections[c.canonicalKey]);
  if (unresolved) {
    const err: any = new Error(`Unresolved conflict for key '${unresolved.canonicalKey}'. Explicit selection required.`);
    err.status = 422;
    throw err;
  }

  const snapshotId = crypto.randomUUID();
  const snapshotPayload = {
    id: snapshotId,
    userId,
    purpose,
    contextVersion,
    itemIds: items.map(i => i.id),
    projection,
    conflicts,
    consent: {
      scope,
      purpose,
      includedItemIds: items.map(i => i.id),
      excludedItemIds,
      sourceModules,
      acknowledgedAt,
    },
    createdAt: acknowledgedAt,
    sourceModules,
  };

  const snapshot = CareerContextSnapshotSchema.parse(snapshotPayload);

  // 5. Transactional insert if Supabase available
  if (supabaseAdmin) {
    const { error: snapErr } = await supabaseAdmin
      .from('career_context_snapshots')
      .insert({
        id: snapshot.id,
        user_id: userId,
        purpose: snapshot.purpose,
        context_version: snapshot.contextVersion,
        projection: snapshot.projection,
        conflicts: snapshot.conflicts,
        consent: snapshot.consent,
        source_modules: snapshot.sourceModules,
        client_request_id: clientRequestId,
        request_hash: requestHash,
        created_at: snapshot.createdAt,
      });

    if (snapErr) {
      throw new Error(`Failed to persist grounding snapshot: ${snapErr.message}`);
    }

    if (items.length > 0) {
      const itemRows = items.map((item, idx) => ({
        snapshot_id: snapshot.id,
        item_id: item.id,
        position: idx,
      }));

      const { error: itemsErr } = await supabaseAdmin
        .from('career_context_snapshot_items')
        .insert(itemRows);

      if (itemsErr) {
        throw new Error(`Failed to persist grounding snapshot items: ${itemsErr.message}`);
      }
    }
    inMemorySnapshots.set(snapshot.id, snapshot);
  } else {
    inMemorySnapshots.set(snapshot.id, snapshot);
  }

  return snapshot;
}

export async function getSnapshotById(userId: string, snapshotId: string): Promise<CareerContextSnapshot | null> {
  if (!supabaseAdmin) {
    const mock = inMemorySnapshots.get(snapshotId);
    if (!mock || mock.userId !== userId) return null;
    return mock;
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
