import {
  CareerContextItem,
  CareerContextItemDraft,
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
        updatedAt: data.updated_at instanceof Date ? data.updated_at.toISOString() : String(data.updated_at || now),
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
        updatedAt: inserted.updated_at instanceof Date ? inserted.updated_at.toISOString() : String(inserted.updated_at),
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

function toIsoDateString(v: any): string {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  if (!isNaN(d.getTime())) return d.toISOString();
  return String(v);
}

export async function setPersonalizationPreference(
  userId: string,
  enabled: boolean,
  expectedContextVersion?: number
): Promise<CareerContextState> {
  if (!supabaseAdmin) {
    const err: any = new Error('Authoritative persistence unavailable');
    err.status = 503;
    throw err;
  }

  const { data, error } = await supabaseAdmin.rpc('update_personalization_preference_tx', {
    p_user_id: userId,
    p_enabled: enabled,
    p_expected_version: expectedContextVersion || null,
  });

  if (error || !data) {
    const err: any = new Error(`Failed to update preference: ${error?.message || 'Unknown error'}`);
    if (error?.message?.includes('Stale or mismatched context version')) err.status = 409;
    throw err;
  }

  const stateData = (data as any).state;
  return CareerContextStateSchema.parse({
    userId: stateData.user_id,
    contextVersion: Number(stateData.context_version),
    personalizationEnabled: Boolean(stateData.personalization_enabled),
    updatedAt: toIsoDateString(stateData.updated_at),
  });
}

export async function getUserCareerContextItems(userId: string): Promise<CareerContextItem[]> {
  if (!supabaseAdmin) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('career_context_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data.map(mapDbToItem);
}

export async function saveCareerContextItemDrafts(
  userId: string,
  sourceModule: string,
  recordId: string,
  revision: string,
  drafts: CareerContextItemDraft[]
): Promise<{ addedCount: number; supersededCount: number; unchangedCount: number; contextVersion: number }> {
  if (!supabaseAdmin) {
    const err: any = new Error('Authoritative persistence unavailable');
    err.status = 503;
    throw err;
  }

  const { data, error } = await supabaseAdmin.rpc('rebuild_career_context_batch_tx', {
    p_user_id: userId,
    p_source_module: sourceModule,
    p_record_id: recordId,
    p_revision: revision,
    p_items: drafts,
  });

  if (error || !data) {
    const err: any = new Error(`Failed to rebuild career context batch: ${error?.message || 'Unknown error'}`);
    err.status = 500;
    throw err;
  }

  const res = data as any;
  return {
    addedCount: Number(res.addedCount || 0),
    supersededCount: Number(res.supersededCount || 0),
    unchangedCount: Number(res.unchangedCount || 0),
    contextVersion: Number(res.contextVersion || 1),
  };
}

export async function handleItemDecision(
  userId: string,
  itemId: string,
  decision: 'confirm' | 'reject' | 'revoke' | 'dispute' | 'edit' | 'replace',
  newValue?: string,
  expectedContextVersion?: number
): Promise<CareerContextItem | null> {
  if (!supabaseAdmin) {
    const err: any = new Error('Authoritative persistence unavailable');
    err.status = 503;
    throw err;
  }

  const { data, error } = await supabaseAdmin.rpc('mutate_career_context_item', {
    p_user_id: userId,
    p_item_id: itemId,
    p_decision: decision,
    p_new_value: newValue || null,
    p_expected_context_version: expectedContextVersion || null,
  });

  if (error) {
    const err: any = new Error(error.message);
    if (error.message.includes('not found')) err.status = 404;
    else if (error.message.includes('Stale or mismatched context version')) err.status = 409;
    else err.status = 400;
    throw err;
  }

  const resultItem = (data as any)?.item;
  return resultItem ? mapDbToItem(resultItem) : null;
}

function mapDbToItem(r: any): CareerContextItem {
  const toIso = (v: any) => v ? (v instanceof Date ? v.toISOString() : String(v)) : undefined;
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
      capturedAt: toIso(r.created_at) || new Date().toISOString(),
    },
    exactExcerpt: r.exact_excerpt || undefined,
    provenance: r.provenance,
    status: r.item_status,
    sensitivity: r.sensitivity,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    supersededBy: r.superseded_by || undefined,
    userConfirmedAt: toIso(r.user_confirmed_at),
  });
}
