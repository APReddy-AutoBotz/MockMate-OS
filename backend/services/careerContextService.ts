import {
  CareerContextItem,
  CareerContextItemDraft,
  CareerContextState,
  CareerContextItemSchema,
  CareerContextStateSchema
} from 'mockmate-shared';
import { supabaseAdmin } from '../supabaseAdmin';
import crypto from 'crypto';

export async function getCareerContextState(userId: string): Promise<CareerContextState> {
  const now = new Date().toISOString();
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('career_context_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (data) {
      return CareerContextStateSchema.parse({
        userId: data.user_id,
        contextVersion: Number(data.context_version),
        personalizationEnabled: Boolean(data.personalization_enabled),
        updatedAt: data.updated_at || now,
      });
    }

    // Initialize default state if first time
    const { data: inserted } = await supabaseAdmin
      .from('career_context_state')
      .insert({
        user_id: userId,
        context_version: 1,
        personalization_enabled: false,
        updated_at: now,
      })
      .select('*')
      .single();

    if (inserted) {
      return CareerContextStateSchema.parse({
        userId: inserted.user_id,
        contextVersion: Number(inserted.context_version),
        personalizationEnabled: Boolean(inserted.personalization_enabled),
        updatedAt: inserted.updated_at,
      });
    }
  }

  return CareerContextStateSchema.parse({
    userId,
    contextVersion: 1,
    personalizationEnabled: false,
    updatedAt: now,
  });
}

export async function incrementContextVersion(userId: string): Promise<number> {
  const now = new Date().toISOString();
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('career_context_state')
      .select('context_version, personalization_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    const currentVer = data ? Number(data.context_version) : 0;
    const newVer = currentVer + 1;

    const { data: updated } = await supabaseAdmin
      .from('career_context_state')
      .upsert({
        user_id: userId,
        context_version: newVer,
        personalization_enabled: data ? Boolean(data.personalization_enabled) : false,
        updated_at: now,
      })
      .select('context_version')
      .single();

    if (updated) return Number(updated.context_version);
  }

  const state = await getCareerContextState(userId);
  return state.contextVersion;
}

export async function setPersonalizationPreference(
  userId: string,
  enabled: boolean,
  expectedContextVersion?: number
): Promise<CareerContextState> {
  const now = new Date().toISOString();
  const currentState = await getCareerContextState(userId);

  if (expectedContextVersion !== undefined && expectedContextVersion !== currentState.contextVersion) {
    const err: any = new Error(`Stale or mismatched context version: expected ${expectedContextVersion}, current is ${currentState.contextVersion}`);
    err.status = 409;
    throw err;
  }

  if (supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from('career_context_state')
      .upsert({
        user_id: userId,
        context_version: currentState.contextVersion,
        personalization_enabled: enabled,
        updated_at: now,
      });

    if (error) {
      throw new Error(`Failed to update personalization preference: ${error.message}`);
    }
  }

  return CareerContextStateSchema.parse({
    userId,
    contextVersion: currentState.contextVersion,
    personalizationEnabled: enabled,
    updatedAt: now,
  });
}

export async function getUserCareerContextItems(userId: string): Promise<CareerContextItem[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from('career_context_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map(mapDbToItem);
}

export interface RebuildResult {
  addedCount: number;
  supersededCount: number;
  unchangedCount: number;
}

export async function saveCareerContextItemDrafts(
  userId: string,
  drafts: CareerContextItemDraft[]
): Promise<RebuildResult> {
  if (!supabaseAdmin || drafts.length === 0) {
    return { addedCount: 0, supersededCount: 0, unchangedCount: 0 };
  }

  const now = new Date().toISOString();
  let addedCount = 0;
  let supersededCount = 0;
  let unchangedCount = 0;

  // Load existing items for user
  const existingItems = await getUserCareerContextItems(userId);
  const rowsToInsert: any[] = [];

  for (const draft of drafts) {
    // Exclude personal contact items
    if (draft.sensitivity === 'personal_contact') continue;

    // Check if matching source identity already exists
    const existing = existingItems.find(
      i =>
        i.source.module === draft.source.module &&
        i.source.recordId === draft.source.recordId &&
        i.source.fieldPath === draft.source.fieldPath &&
        i.source.sourceRevision === draft.source.sourceRevision &&
        i.source.sourceHash === draft.source.sourceHash
    );

    if (existing) {
      unchangedCount++;
      continue;
    }

    // Check if user edited or revoked this canonical key previously
    const editedOrRevoked = existingItems.find(
      i => i.canonicalKey === draft.canonicalKey && (i.status === 'revoked' || i.provenance === 'user_edited')
    );

    if (editedOrRevoked) {
      // Do not silently reactivate user-edited or revoked items
      unchangedCount++;
      continue;
    }

    const newItemId = crypto.randomUUID();
    rowsToInsert.push({
      id: newItemId,
      user_id: userId,
      item_kind: draft.kind,
      canonical_key: draft.canonicalKey,
      label: draft.label,
      value: draft.value,
      source_module: draft.source.module,
      source_record_id: draft.source.recordId,
      source_path: draft.source.fieldPath,
      source_revision: draft.source.sourceRevision,
      source_hash: draft.source.sourceHash,
      exact_excerpt: draft.exactExcerpt || null,
      provenance: draft.provenance,
      item_status: draft.status,
      sensitivity: draft.sensitivity,
      user_confirmed_at: draft.provenance === 'user_confirmed' ? now : null,
      superseded_by: null,
      created_at: now,
      updated_at: now,
    });
    addedCount++;
  }

  if (rowsToInsert.length > 0) {
    const { error } = await supabaseAdmin.from('career_context_items').insert(rowsToInsert);
    if (error) {
      throw new Error(`Failed to insert career context items: ${error.message}`);
    }
    await incrementContextVersion(userId);
  }

  return { addedCount, supersededCount, unchangedCount };
}

export type DecisionType = 'confirm' | 'reject' | 'revoke' | 'dispute' | 'replace' | 'edit';

export async function handleItemDecision(
  userId: string,
  itemId: string,
  decision: DecisionType,
  newValue?: string,
  expectedContextVersion?: number
): Promise<CareerContextItem | null> {
  if (!supabaseAdmin) return null;
  const now = new Date().toISOString();

  const currentState = await getCareerContextState(userId);
  if (expectedContextVersion !== undefined && expectedContextVersion !== currentState.contextVersion) {
    const err: any = new Error(`Stale or mismatched context version: expected ${expectedContextVersion}, current is ${currentState.contextVersion}`);
    err.status = 409;
    throw err;
  }

  const { data: rawItem } = await supabaseAdmin
    .from('career_context_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (!rawItem) {
    const err: any = new Error(`Career Context item '${itemId}' not found.`);
    err.status = 404;
    throw err;
  }

  let resultItem: any = null;

  if (decision === 'confirm') {
    const { data: updated, error } = await supabaseAdmin
      .from('career_context_items')
      .update({
        item_status: 'active',
        provenance: 'user_confirmed',
        user_confirmed_at: now,
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to confirm item: ${error.message}`);
    resultItem = updated;
  } else if (decision === 'reject' || decision === 'revoke') {
    const { data: updated, error } = await supabaseAdmin
      .from('career_context_items')
      .update({
        item_status: 'revoked',
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to revoke item: ${error.message}`);
    resultItem = updated;
  } else if (decision === 'dispute') {
    const { data: updated, error } = await supabaseAdmin
      .from('career_context_items')
      .update({
        item_status: 'disputed',
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to dispute item: ${error.message}`);
    resultItem = updated;
  } else if ((decision === 'edit' || decision === 'replace') && newValue !== undefined) {
    const newId = crypto.randomUUID();
    const cleanValue = newValue.trim();
    const sourceHash = crypto.createHash('sha256').update(cleanValue).digest('hex').substring(0, 16);
    const newRev = `${rawItem.source_revision}_revised`;

    // 1. Mark previous as superseded
    const { error: superErr } = await supabaseAdmin
      .from('career_context_items')
      .update({
        item_status: 'superseded',
        superseded_by: newId,
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId);

    if (superErr) throw new Error(`Failed to supersede original item: ${superErr.message}`);

    // 2. Insert new edited item with preserved value type
    const newValueObj = rawItem.value?.type === 'string_list'
      ? { type: 'string_list', values: [cleanValue] }
      : { type: 'text', text: cleanValue };

    const newItem = {
      id: newId,
      user_id: userId,
      item_kind: rawItem.item_kind,
      canonical_key: rawItem.canonical_key,
      label: `${rawItem.label} (Edited)`,
      value: newValueObj,
      source_module: rawItem.source_module,
      source_record_id: rawItem.source_record_id,
      source_path: rawItem.source_path,
      source_revision: newRev,
      source_hash: sourceHash,
      exact_excerpt: cleanValue,
      provenance: 'user_edited',
      item_status: 'active',
      sensitivity: rawItem.sensitivity,
      user_confirmed_at: now,
      created_at: now,
      updated_at: now,
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('career_context_items')
      .insert(newItem)
      .select('*')
      .single();

    if (insertErr || !inserted) throw new Error(`Failed to insert edited item: ${insertErr?.message}`);
    resultItem = inserted;
  }

  await incrementContextVersion(userId);

  return resultItem ? mapDbToItem(resultItem) : null;
}

function mapDbToItem(r: any): CareerContextItem {
  return CareerContextItemSchema.parse({
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
    exactExcerpt: r.exact_excerpt || undefined,
    provenance: r.provenance,
    status: r.item_status,
    sensitivity: r.sensitivity,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    supersededBy: r.superseded_by || undefined,
    userConfirmedAt: r.user_confirmed_at || undefined,
  });
}
