import request from 'supertest';
import express from 'express';
import * as supabaseAdminModule from '../supabaseAdmin';
import careerContextRoutes from '../routes/careerContextRoutes';

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_ROLE_ID = '10000000-0000-0000-0000-000000000001';
const ITEM_EMAIL_ID = '10000000-0000-0000-0000-000000000002';
const ITEM_INFERRED_ID = '10000000-0000-0000-0000-000000000003';
const SNAPSHOT_ID = '20000000-0000-0000-0000-000000000001';
const BRIDGE_ID = '30000000-0000-0000-0000-000000000001';
const POSTGREST_DB_TIMESTAMP = '2026-08-28T10:20:30.123456+00:00';
const CANONICAL_DB_TIMESTAMP = '2026-08-28T10:20:30.123Z';
const CLIENT_TIMESTAMP = '2026-08-28T10:20:30.123Z';

// Mock Auth Middleware
jest.mock('../middleware/authMiddleware', () => ({
  verifyAuthToken: (req: any, _res: any, next: any) => {
    req.user = { uid: TEST_USER_ID, id: TEST_USER_ID, email: 'test@example.com' };
    next();
  },
}));

const mockItems: any[] = [];
const mockSnapshots: any[] = [];
const mockBridges: any[] = [];
const mockSnapshotMemberships = new Map<string, string[]>();
let mockStateTimestamp: unknown = POSTGREST_DB_TIMESTAMP;

const mockSupabaseClient: any = {
  from: (table: string) => {
    if (table === 'career_context_state') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { user_id: TEST_USER_ID, context_version: 1, personalization_enabled: true, updated_at: mockStateTimestamp } }),
            maybeSingle: async () => ({ data: { user_id: TEST_USER_ID, context_version: 1, personalization_enabled: true, updated_at: mockStateTimestamp } }),
          }),
        }),
        upsert: (row: any) => ({
          select: () => ({
            single: async () => ({ data: row, error: null }),
          }),
        }),
        insert: (row: any) => ({
          select: () => ({
            single: async () => ({ data: row, error: null }),
          }),
        }),
      };
    }
    if (table === 'career_context_items') {
      const getItemQuery = (targetVal?: string) => ({
        eq: (_col: string, val: string) => getItemQuery(val || targetVal),
        order: () => ({ data: mockItems }),
        single: async () => {
          const found = mockItems.find(i => i.id === targetVal || i.user_id === targetVal);
          return { data: found || null, error: found ? null : new Error('Not found') };
        },
        in: (col2: string, vals: string[]) => ({
          data: mockItems.filter(i => vals.includes(i[col2])),
          error: null,
        }),
      });
      return {
        select: () => getItemQuery(),
        upsert: (rows: any) => ({
          select: () => ({
            single: async () => {
              const arr = Array.isArray(rows) ? rows : [rows];
              arr.forEach(r => {
                const idx = mockItems.findIndex(i => i.id === r.id);
                if (idx >= 0) mockItems[idx] = r;
                else mockItems.push(r);
              });
              return { data: arr[0], error: null };
            },
          }),
        }),
        update: (fields: any) => {
          const makeUpdateChain = (targetId: string) => ({
            eq: (_col2: string, _val2: string) => ({
              select: () => ({
                single: async () => {
                  const item = mockItems.find(i => i.id === targetId || i.user_id === targetId);
                  if (item) Object.assign(item, fields);
                  return { data: item || null, error: item ? null : new Error('Not found') };
                },
              }),
            }),
            select: () => ({
              single: async () => {
                const item = mockItems.find(i => i.id === targetId || i.user_id === targetId);
                if (item) Object.assign(item, fields);
                return { data: item || null, error: item ? null : new Error('Not found') };
              },
            }),
          });
          return {
            eq: (col1: string, val1: string) => makeUpdateChain(val1),
          };
        },
        insert: (rows: any) => ({
          select: () => ({
            single: async () => {
              const arr = Array.isArray(rows) ? rows : [rows];
              mockItems.push(...arr);
              return { data: arr[0], error: null };
            },
          }),
        }),
      };
    }
    if (table === 'career_context_snapshots') {
      return {
        insert: async (row: any) => {
          mockSnapshots.push(row);
          return { error: null };
        },
        select: () => ({
          eq: (col1: string, val1: string) => ({
            eq: (_col2: string, _val2: string) => ({
              single: async () => {
                const snap = mockSnapshots.find(s => s[col1] === val1 || s.id === val1);
                return { data: snap || null, error: snap ? null : new Error('Not found') };
              },
              maybeSingle: async () => {
                const snap = mockSnapshots.find(s => s[col1] === val1 || s.id === val1);
                return { data: snap || null, error: null };
              },
            }),
          }),
        }),
      };
    }
    if (table === 'career_context_snapshot_items') {
      return {
        insert: async () => ({ error: null }),
        select: () => ({
          eq: (_column: string, snapshotId: string) => ({
            order: async () => ({
              data: mockItems
                .filter(item => (mockSnapshotMemberships.get(snapshotId) || []).includes(item.id))
                .map((item, position) => ({
                position,
                career_context_items: item,
              })),
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'career_context_bridges') {
      return {
        select: () => ({
          eq: (col1: string, val1: string) => ({
            eq: (col2: string, val2: string) => ({
              maybeSingle: async () => {
                const b = mockBridges.find(x => (x[col1] === val1 && x[col2] === val2) || x.id === val1 || x.client_request_id === val1);
                return { data: b || null };
              },
              single: async () => {
                const b = mockBridges.find(x => (x[col1] === val1 && x[col2] === val2) || x.id === val1 || x.client_request_id === val1);
                return { data: b || null, error: b ? null : new Error('Not found') };
              },
            }),
          }),
        }),
        insert: (row: any) => ({
          select: () => ({
            single: async () => {
              mockBridges.push(row);
              return { data: row, error: null };
            },
          }),
        }),
        update: (fields: any) => ({
          eq: (col1: string, val1: string) => ({
            eq: (_col2: string, _val2: string) => ({
              select: () => ({
                single: async () => {
                  const b = mockBridges.find(x => x.id === val1 || x[col1] === val1);
                  if (b) Object.assign(b, fields);
                  return { data: b || null, error: b ? null : new Error('Not found') };
                },
              }),
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({ eq: () => ({ order: () => ({ data: [] }), single: async () => ({ data: null }), maybeSingle: async () => ({ data: null }) }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    };
  },
  rpc: async (fnName: string, args: any) => {
    if (fnName === 'set_personalization_preference_tx') {
      return {
        data: {
          userId: args.p_user_id,
          contextVersion: (args.p_expected_context_version ?? 1) + 1,
          personalizationEnabled: args.p_enabled,
          updatedAt: POSTGREST_DB_TIMESTAMP,
        },
        error: null,
      };
    }
    if (fnName === 'mutate_career_context_item') {
      const item = mockItems.find(i => i.id === args.p_item_id && i.user_id === args.p_user_id);
      if (!item) return { data: null, error: new Error('Career Context item not found.') };
      if (args.p_decision === 'confirm') {
        item.item_status = 'active';
        item.provenance = 'user_confirmed';
        item.user_confirmed_at = POSTGREST_DB_TIMESTAMP;
        return { data: { item }, error: null };
      }
      if (args.p_decision === 'reject' || args.p_decision === 'revoke') {
        item.item_status = 'revoked';
        return { data: { item }, error: null };
      }
      if (args.p_decision === 'dispute') {
        item.item_status = 'disputed';
        return { data: { item }, error: null };
      }
      if (args.p_decision === 'edit' || args.p_decision === 'replace') {
        const newId = '90000000-0000-0000-0000-000000000001';
        item.item_status = 'superseded';
        item.superseded_by = newId;
        const newItem = {
          ...item,
          id: newId,
          exact_excerpt: args.p_new_value,
          value: { type: 'text', text: args.p_new_value },
          provenance: 'user_edited',
          item_status: 'active',
          user_confirmed_at: POSTGREST_DB_TIMESTAMP,
        };
        mockItems.push(newItem);
        return { data: { item: newItem }, error: null };
      }
    }
    if (fnName === 'create_grounding_snapshot_tx') {
      const snapId = SNAPSHOT_ID;
      const snapshotRow = {
        id: snapId,
        user_id: args.p_user_id,
        purpose: args.p_purpose,
        context_version: 1,
        projection: args.p_projection,
        conflicts: args.p_conflicts || [],
        consent: args.p_consent,
        source_modules: args.p_source_modules,
        client_request_id: args.p_client_request_id,
        request_hash: args.p_request_hash,
        created_at: POSTGREST_DB_TIMESTAMP,
      };
      mockSnapshots.push(snapshotRow);
      mockSnapshotMemberships.set(snapId, [...args.p_item_ids]);
      return { data: { snapshotId: snapId }, error: null };
    }
    if (fnName === 'create_module_bridge_tx') {
      const existing = mockBridges.find(b => b.client_request_id === args.p_client_request_id);
      if (existing) {
        return { data: { bridgeId: existing.id }, error: null };
      }
      const bridgeId = BRIDGE_ID;
      const bridgeRow = {
        id: bridgeId,
        user_id: args.p_user_id,
        source_module: args.p_source_module,
        target_module: args.p_target_module,
        purpose: args.p_purpose,
        snapshot_id: args.p_snapshot_id,
        source_record_id: args.p_source_record_id || null,
        target_session_id: null,
        status: 'confirmed',
        client_request_id: args.p_client_request_id,
        request_hash: args.p_request_hash,
        confirmed_at: POSTGREST_DB_TIMESTAMP,
        consumed_at: null,
        created_at: POSTGREST_DB_TIMESTAMP,
        updated_at: POSTGREST_DB_TIMESTAMP,
      };
      mockBridges.push(bridgeRow);
      return { data: { bridgeId }, error: null };
    }
    if (fnName === 'consume_module_bridge_tx') {
      const bridge = mockBridges.find(b => b.id === args.p_bridge_id && b.user_id === args.p_user_id);
      if (!bridge) return { data: null, error: new Error('Bridge not found') };
      if (bridge.status === 'consumed') {
        if (bridge.target_session_id === args.p_target_session_id) return { data: { success: true }, error: null };
        return { data: null, error: new Error(`Bridge '${args.p_bridge_id}' has already been consumed for session '${bridge.target_session_id}'.`) };
      }
      bridge.status = 'consumed';
      bridge.target_session_id = args.p_target_session_id;
      bridge.consumed_at = POSTGREST_DB_TIMESTAMP;
      return { data: { success: true }, error: null };
    }
    return { data: null, error: null };
  },
};

const app = express();
app.use(express.json());
app.use('/api/career-context', careerContextRoutes);

describe('Career Context API Routes (P0-3)', () => {
  let origSupabaseAdmin: any;

  beforeAll(() => {
    origSupabaseAdmin = (supabaseAdminModule as any).supabaseAdmin;
    (supabaseAdminModule as any).supabaseAdmin = mockSupabaseClient;
  });

  afterAll(() => {
    (supabaseAdminModule as any).supabaseAdmin = origSupabaseAdmin;
  });

  beforeEach(() => {
    mockItems.length = 0;
    mockSnapshots.length = 0;
    mockBridges.length = 0;
    mockSnapshotMemberships.clear();
    mockStateTimestamp = POSTGREST_DB_TIMESTAMP;

    // Seed mock active item & contact item & inferred item
    mockItems.push({
      id: ITEM_ROLE_ID,
      user_id: TEST_USER_ID,
      item_kind: 'target_role',
      canonical_key: 'resume.target_role',
      label: 'Target Role: Staff Engineer',
      value: { type: 'text', text: 'Staff Software Engineer' },
      source_module: 'resume',
      source_record_id: 'res_1',
      source_path: 'targetRole',
      source_revision: 'v1',
      source_hash: 'h1',
      exact_excerpt: 'Staff Engineer',
      provenance: 'user_confirmed',
      item_status: 'active',
      sensitivity: 'standard',
      created_at: POSTGREST_DB_TIMESTAMP,
      updated_at: POSTGREST_DB_TIMESTAMP,
      user_confirmed_at: POSTGREST_DB_TIMESTAMP,
    });

    mockItems.push({
      id: ITEM_EMAIL_ID,
      user_id: TEST_USER_ID,
      item_kind: 'experience_claim',
      canonical_key: 'resume.contact.email',
      label: 'Email',
      value: { type: 'text', text: 'test@example.com' },
      source_module: 'resume',
      source_record_id: 'res_1',
      source_path: 'basics.email',
      source_revision: 'v1',
      source_hash: 'h2',
      exact_excerpt: 'test@example.com',
      provenance: 'user_confirmed',
      item_status: 'active',
      sensitivity: 'personal_contact', // MUST BE EXCLUDED FROM SNAPSHOTS
      created_at: POSTGREST_DB_TIMESTAMP,
      updated_at: POSTGREST_DB_TIMESTAMP,
    });

    mockItems.push({
      id: ITEM_INFERRED_ID,
      user_id: TEST_USER_ID,
      item_kind: 'skill',
      canonical_key: 'resume.skill.rust',
      label: 'Skill: Rust',
      value: { type: 'text', text: 'Rust' },
      source_module: 'resume',
      source_record_id: 'res_1',
      source_path: 'skills',
      source_revision: 'v1',
      source_hash: 'h3',
      exact_excerpt: 'Rust',
      provenance: 'inferred_pending',
      item_status: 'pending_confirmation',
      sensitivity: 'standard',
      created_at: POSTGREST_DB_TIMESTAMP,
      updated_at: POSTGREST_DB_TIMESTAMP,
    });
  });

  it('1. GET /api/career-context returns state, activeItems, and pendingItems', async () => {
    const res = await request(app).get('/api/career-context');
    expect(res.status).toBe(200);
    expect(res.body.state).toBeDefined();
    expect(res.body.activeItems.length).toBe(2);
    expect(res.body.pendingItems.length).toBe(1);
    expect(res.body.state.updatedAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res.body.activeItems[0].createdAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res.body.activeItems[0].updatedAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res.body.activeItems[0].userConfirmedAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res.body.activeItems[0].source.capturedAt).toBe(CANONICAL_DB_TIMESTAMP);
  });

  it.each([null, 'malformed-database-timestamp'])(
    'fails closed when authoritative state has invalid updated_at %p',
    async (invalidTimestamp) => {
      mockStateTimestamp = invalidTimestamp;
      const res = await request(app).get('/api/career-context');
      expect(res.status).toBe(503);
      expect(res.body.error).toBe(
        'Authoritative persistence returned an invalid career_context_state.updated_at timestamp'
      );
      expect(JSON.stringify(res.body)).not.toContain(String(invalidTimestamp));
    }
  );

  it('does not silently erase a malformed optional persisted timestamp', async () => {
    mockItems[0].user_confirmed_at = '';
    const res = await request(app).get('/api/career-context');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(
      'Authoritative persistence returned an invalid career_context_items.user_confirmed_at timestamp'
    );
  });

  it('2. POST /api/career-context/preference toggles personalization', async () => {
    const res = await request(app)
      .post('/api/career-context/preference')
      .send({ personalizationEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.state.personalizationEnabled).toBe(false);
    expect(res.body.state.updatedAt).toBe(CANONICAL_DB_TIMESTAMP);
  });

  it('3. POST /api/career-context/items/:itemId/decision confirms pending item', async () => {
    const res = await request(app)
      .post(`/api/career-context/items/${ITEM_INFERRED_ID}/decision`)
      .send({ decision: 'confirm' });

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('active');
    expect(res.body.item.provenance).toBe('user_confirmed');
    expect(res.body.item.createdAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res.body.item.updatedAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res.body.item.userConfirmedAt).toBe(CANONICAL_DB_TIMESTAMP);
  });

  it('4. POST /api/career-context/snapshots creates immutable snapshot and excludes PII personal_contact', async () => {
    const res = await request(app)
      .post('/api/career-context/snapshots')
      .send({
        purpose: 'resume_to_interview',
        includedItemIds: [ITEM_ROLE_ID],
        excludedItemIds: [ITEM_EMAIL_ID],
        consent: {
          scope: 'one_time',
          purpose: 'resume_to_interview',
          includedItemIds: [ITEM_ROLE_ID],
          excludedItemIds: [ITEM_EMAIL_ID],
          sourceModules: ['resume'],
          acknowledgedAt: CLIENT_TIMESTAMP,
        },
        clientRequestId: 'snap_req_test_001',
      });

    expect(res.status).toBe(200);
    expect(res.body.snapshot).toBeDefined();
    expect(res.body.snapshot.itemIds).toEqual([ITEM_ROLE_ID]);
    expect(res.body.snapshot.createdAt).toBe(CANONICAL_DB_TIMESTAMP);
  });

  it('5. POST /api/career-context/bridges creates idempotent bridge session', async () => {
    mockSnapshots.push({
      id: SNAPSHOT_ID,
      user_id: TEST_USER_ID,
      purpose: 'resume_to_interview',
      context_version: 1,
      projection: {},
      conflicts: [],
      consent: { scope: 'one_time', sourceModules: ['resume'] },
      source_modules: ['resume'],
      created_at: POSTGREST_DB_TIMESTAMP,
    });

    const reqBody = {
      sourceModule: 'resume',
      targetModule: 'interview',
      purpose: 'resume_to_interview',
      snapshotId: SNAPSHOT_ID,
      clientRequestId: 'req_uniq_123',
    };

    const res1 = await request(app).post('/api/career-context/bridges').send(reqBody);
    expect(res1.status).toBe(200);
    expect(res1.body.bridge.id).toBeDefined();
    expect(res1.body.bridge.createdAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res1.body.bridge.updatedAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res1.body.bridge.confirmedAt).toBe(CANONICAL_DB_TIMESTAMP);
    expect(res1.body.bridge.consumedAt).toBeUndefined();

    // Re-sending same clientRequestId returns identical bridge
    const res2 = await request(app).post('/api/career-context/bridges').send(reqBody);
    expect(res2.status).toBe(200);
    expect(res2.body.bridge.id).toBe(res1.body.bridge.id);
  });

  it('keeps only the selected conflict winner in immutable membership and replay identity', async () => {
    const competingRoleId = '10000000-0000-0000-0000-000000000004';
    mockItems.push({
      ...mockItems[0],
      id: competingRoleId,
      label: 'Target Role: Security Engineer',
      value: { type: 'text', text: 'Security Engineer' },
      exact_excerpt: 'Security Engineer',
      source_hash: 'h4',
    });
    const requestBody = {
      purpose: 'resume_to_interview',
      includedItemIds: [ITEM_ROLE_ID],
      excludedItemIds: [competingRoleId],
      conflictSelections: { 'resume.target_role': ITEM_ROLE_ID },
      consent: {
        scope: 'one_time',
        purpose: 'resume_to_interview',
        includedItemIds: [ITEM_ROLE_ID],
        excludedItemIds: [competingRoleId],
        sourceModules: ['resume'],
        acknowledgedAt: CLIENT_TIMESTAMP,
      },
      clientRequestId: 'snap_conflict_replay_001',
    };

    const created = await request(app).post('/api/career-context/snapshots').send(requestBody);
    expect(created.status).toBe(200);
    expect(created.body.snapshot.itemIds).toEqual([ITEM_ROLE_ID]);
    expect(created.body.snapshot.groundingReferences.map((ref: any) => ref.contextItemId)).toEqual([ITEM_ROLE_ID]);
    expect(JSON.stringify(created.body.snapshot)).not.toContain('Security Engineer');

    const replay = await request(app).post('/api/career-context/snapshots').send(requestBody);
    expect(replay.status).toBe(200);
    expect(replay.body.snapshot.itemIds).toEqual([ITEM_ROLE_ID]);

    const changedWinner = await request(app).post('/api/career-context/snapshots').send({
      ...requestBody,
      conflictSelections: { 'resume.target_role': competingRoleId },
    });
    expect(changedWinner.status).toBe(409);
    expect(mockSnapshotMemberships.get(SNAPSHOT_ID)).toEqual([ITEM_ROLE_ID]);
  });

  it('6. denies browser-directed generic bridge consumption', async () => {
    const res1 = await request(app)
      .post(`/api/career-context/bridges/${BRIDGE_ID}/consume`)
      .send({ targetSessionId: '99999999-9999-9999-9999-999999999999' });
    expect(res1.status).toBe(404);
  });
});
