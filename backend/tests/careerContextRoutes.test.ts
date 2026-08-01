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

const mockSupabaseClient: any = {
  from: (table: string) => {
    if (table === 'career_context_state') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { user_id: TEST_USER_ID, context_version: 1, personalization_enabled: true, updated_at: new Date().toISOString() } }),
            maybeSingle: async () => ({ data: { user_id: TEST_USER_ID, context_version: 1, personalization_enabled: true, updated_at: new Date().toISOString() } }),
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
        in: (_col2: string, vals: string[]) => ({
          data: mockItems.filter(i => vals.includes(i.id)),
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
    if (fnName === 'mutate_career_context_item') {
      const item = mockItems.find(i => i.id === args.p_item_id && i.user_id === args.p_user_id);
      if (!item) return { data: null, error: new Error('Career Context item not found.') };
      if (args.p_decision === 'confirm') {
        item.item_status = 'active';
        item.provenance = 'user_confirmed';
        item.user_confirmed_at = new Date().toISOString();
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
          user_confirmed_at: new Date().toISOString(),
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
        created_at: new Date().toISOString(),
      };
      mockSnapshots.push(snapshotRow);
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
        confirmed_at: new Date().toISOString(),
        consumed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
      bridge.consumed_at = new Date().toISOString();
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it('1. GET /api/career-context returns state, activeItems, and pendingItems', async () => {
    const res = await request(app).get('/api/career-context');
    expect(res.status).toBe(200);
    expect(res.body.state).toBeDefined();
    expect(res.body.activeItems.length).toBe(2);
    expect(res.body.pendingItems.length).toBe(1);
  });

  it('2. POST /api/career-context/preference toggles personalization', async () => {
    const res = await request(app)
      .post('/api/career-context/preference')
      .send({ personalizationEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.state.personalizationEnabled).toBe(false);
  });

  it('3. POST /api/career-context/items/:itemId/decision confirms pending item', async () => {
    const res = await request(app)
      .post(`/api/career-context/items/${ITEM_INFERRED_ID}/decision`)
      .send({ decision: 'confirm' });

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('active');
    expect(res.body.item.provenance).toBe('user_confirmed');
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
          acknowledgedAt: new Date().toISOString(),
        },
        clientRequestId: 'snap_req_test_001',
      });

    expect(res.status).toBe(200);
    expect(res.body.snapshot).toBeDefined();
    expect(res.body.snapshot.itemIds).toEqual([ITEM_ROLE_ID]);
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
      created_at: new Date().toISOString(),
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

    // Re-sending same clientRequestId returns identical bridge
    const res2 = await request(app).post('/api/career-context/bridges').send(reqBody);
    expect(res2.status).toBe(200);
    expect(res2.body.bridge.id).toBe(res1.body.bridge.id);
  });

  it('6. POST /api/career-context/bridges/:bridgeId/consume consumes bridge session and prevents re-use', async () => {
    mockBridges.push({
      id: BRIDGE_ID,
      user_id: TEST_USER_ID,
      source_module: 'resume',
      target_module: 'interview',
      purpose: 'resume_to_interview',
      snapshot_id: SNAPSHOT_ID,
      status: 'confirmed',
      client_request_id: 'req_to_consume',
      created_at: new Date().toISOString(),
    });

    const res1 = await request(app)
      .post(`/api/career-context/bridges/${BRIDGE_ID}/consume`)
      .send({ targetSessionId: '99999999-9999-9999-9999-999999999999' });

    expect(res1.status).toBe(200);
    expect(res1.body.bridge.status).toBe('consumed');

    // Second consumption attempt must fail
    const res2 = await request(app)
      .post(`/api/career-context/bridges/${BRIDGE_ID}/consume`)
      .send({ targetSessionId: '10001000-1000-1000-1000-100010001000' });

    expect(res2.status).toBe(409);
    expect(res2.body.error).toContain('already been consumed');
  });
});
