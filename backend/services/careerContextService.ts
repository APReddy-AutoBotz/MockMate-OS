import {
  CareerContextItem,
  CareerContextState,
  CareerContextItemSchema,
  CareerContextStateSchema
} from 'mockmate-shared';
import { supabaseAdmin } from '../supabaseAdmin';

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
  const currentState = await getCareerContextState(userId);
  const newVersion = currentState.contextVersion + 1;

  if (supabaseAdmin) {
    await supabaseAdmin
      .from('career_context_state')
      .upsert({
        user_id: userId,
        context_version: newVersion,
        personalization_enabled: currentState.personalizationEnabled,
        updated_at: now,
      });
  }

  return newVersion;
}

export async function setPersonalizationPreference(userId: string, enabled: boolean): Promise<CareerContextState> {
  const now = new Date().toISOString();
  const currentState = await getCareerContextState(userId);

  if (supabaseAdmin) {
    await supabaseAdmin
      .from('career_context_state')
      .upsert({
        user_id: userId,
        context_version: currentState.contextVersion,
        personalization_enabled: enabled,
        updated_at: now,
      });
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

export async function upsertCareerContextItems(userId: string, items: CareerContextItem[]): Promise<void> {
  if (!supabaseAdmin || items.length === 0) return;

  const rows = items.map(item => ({
    id: item.id,
    user_id: userId,
    item_kind: item.kind,
    canonical_key: item.canonicalKey,
    label: item.label,
    value: item.value,
    source_module: item.source.module,
    source_record_id: item.source.recordId,
    source_path: item.source.fieldPath,
    source_revision: item.source.sourceRevision,
    source_hash: item.source.sourceHash,
    exact_excerpt: item.exactExcerpt || null,
    provenance: item.provenance,
    item_status: item.status,
    sensitivity: item.sensitivity,
    user_confirmed_at: item.userConfirmedAt || null,
    superseded_by: item.supersededBy || null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  }));

  const { error } = await supabaseAdmin.from('career_context_items').upsert(rows);
  if (error) {
    console.error('[CareerContextService] Error upserting items:', error.message);
  } else {
    await incrementContextVersion(userId);
  }
}

export type DecisionType = 'confirm' | 'reject' | 'revoke' | 'dispute' | 'edit';

export async function handleItemDecision(
  userId: string,
  itemId: string,
  decision: DecisionType,
  newValue?: string
): Promise<CareerContextItem | null> {
  if (!supabaseAdmin) return null;
  const now = new Date().toISOString();

  const { data: rawItem } = await supabaseAdmin
    .from('career_context_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  if (!rawItem) throw new Error(`Career Context item '${itemId}' not found.`);

  let updatedStatus = rawItem.item_status;
  let updatedProvenance = rawItem.provenance;
  let userConfirmedAt = rawItem.user_confirmed_at;

  if (decision === 'confirm') {
    updatedStatus = 'active';
    updatedProvenance = 'user_confirmed';
    userConfirmedAt = now;

    await supabaseAdmin
      .from('career_context_items')
      .update({
        item_status: updatedStatus,
        provenance: updatedProvenance,
        user_confirmed_at: userConfirmedAt,
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId);
  } else if (decision === 'reject' || decision === 'revoke') {
    updatedStatus = 'revoked';
    await supabaseAdmin
      .from('career_context_items')
      .update({
        item_status: updatedStatus,
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId);
  } else if (decision === 'dispute') {
    updatedStatus = 'disputed';
    await supabaseAdmin
      .from('career_context_items')
      .update({
        item_status: updatedStatus,
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId);
  } else if (decision === 'edit' && newValue) {
    const newId = `item_edited_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    // Mark previous as superseded
    await supabaseAdmin
      .from('career_context_items')
      .update({
        item_status: 'superseded',
        superseded_by: newId,
        updated_at: now,
      })
      .eq('id', itemId)
      .eq('user_id', userId);

    // Create new edited item
    const newItem = {
      id: newId,
      user_id: userId,
      item_kind: rawItem.item_kind,
      canonical_key: rawItem.canonical_key,
      label: `${rawItem.label} (Edited)`,
      value: { type: 'text', text: newValue },
      source_module: rawItem.source_module,
      source_record_id: rawItem.source_record_id,
      source_path: rawItem.source_path,
      source_revision: 'edited_v1',
      source_hash: 'hash_edited',
      exact_excerpt: newValue,
      provenance: 'user_edited',
      item_status: 'active',
      sensitivity: rawItem.sensitivity,
      user_confirmed_at: now,
      created_at: now,
      updated_at: now,
    };
    await supabaseAdmin.from('career_context_items').insert(newItem);
  }

  await incrementContextVersion(userId);

  const { data: fresh } = await supabaseAdmin
    .from('career_context_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .single();

  return fresh ? mapDbToItem(fresh) : null;
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
