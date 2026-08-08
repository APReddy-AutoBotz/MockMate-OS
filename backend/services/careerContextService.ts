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
    const { data, error } = await supabaseAdmin
      .from('career_context_state')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw persistenceError(`Failed to read Career Context state: ${error.message}`);

    if (data) {
      return CareerContextStateSchema.parse({
        userId: data.user_id,
        contextVersion: Number(data.context_version),
        personalizationEnabled: Boolean(data.personalization_enabled),
        updatedAt: data.updated_at || now,
      });
    }

    // Initialize default state if first time
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('career_context_state')
      .insert({
        user_id: userId,
        context_version: 1,
        personalization_enabled: false,
        updated_at: now,
      })
      .select('*')
      .single();

    if (insertError || !inserted) throw persistenceError(`Failed to initialize Career Context state: ${insertError?.message || 'no row returned'}`);

    if (inserted) {
      return CareerContextStateSchema.parse({
        userId: inserted.user_id,
        contextVersion: Number(inserted.context_version),
        personalizationEnabled: Boolean(inserted.personalization_enabled),
        updatedAt: inserted.updated_at,
      });
    }
  }

  throw persistenceError('Authoritative persistence unavailable');
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

  const now = new Date().toISOString();
  const currentState = await getCareerContextState(userId);

  if (expectedContextVersion !== undefined && expectedContextVersion !== currentState.contextVersion) {
    const err: any = new Error(`Stale or mismatched context version: expected ${expectedContextVersion}, current is ${currentState.contextVersion}`);
    err.status = 409;
    throw err;
  }

  const newVer = currentState.contextVersion + 1;
  const { data, error } = await supabaseAdmin
    .from('career_context_state')
    .upsert({
      user_id: userId,
      context_version: newVer,
      personalization_enabled: enabled,
      updated_at: now,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update preference: ${error?.message}`);
  }

  return CareerContextStateSchema.parse({
    userId: data.user_id,
    contextVersion: Number(data.context_version),
    personalizationEnabled: Boolean(data.personalization_enabled),
    updatedAt: data.updated_at,
  });
}

export async function getUserCareerContextItems(userId: string): Promise<CareerContextItem[]> {
  if (!supabaseAdmin) {
    throw persistenceError('Authoritative persistence unavailable');
  }

  const { data, error } = await supabaseAdmin
    .from('career_context_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) throw persistenceError(`Failed to read Career Context items: ${error?.message || 'no rows returned'}`);
  return data.map(mapDbToItem);
}

export async function saveCareerContextItemDrafts(
  userId: string,
  drafts: CareerContextItemDraft[]
): Promise<{ addedCount: number; updatedCount: number; unchangedCount: number }> {
  if (!supabaseAdmin) {
    const err: any = new Error('Authoritative persistence unavailable');
    err.status = 503;
    throw err;
  }

  const { data, error } = await supabaseAdmin.rpc('rebuild_career_context_tx', {
    p_user_id: userId,
    p_drafts: drafts,
  });
  if (error) throw persistenceError(`Career Context rebuild transaction failed: ${error.message}`);
  if (!data) throw persistenceError('Career Context rebuild transaction returned no result');
  return {
    addedCount: Number((data as any).addedCount || 0),
    updatedCount: Number((data as any).updatedCount || 0),
    unchangedCount: Number((data as any).unchangedCount || 0),
  };
}

function persistenceError(message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = 503;
  return error;
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
