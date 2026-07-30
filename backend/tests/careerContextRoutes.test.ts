import request from 'supertest';
import express from 'express';
import careerContextRoutes from '../routes/careerContextRoutes';

// Mock Auth Middleware
jest.mock('../middleware/authMiddleware', () => ({
  verifyAuthToken: (req: any, _res: any, next: any) => {
    req.user = { uid: 'test_user_p03' };
    next();
  },
}));

// Mock Supabase Admin
const mockItems: any[] = [];
const mockSnapshots: any[] = [];
const mockBridges: any[] = [];

jest.mock('../supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'career_context_state') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { user_id: 'test_user_p03', context_version: 1, personalization_enabled: true } }),
              maybeSingle: async () => ({ data: { user_id: 'test_user_p03', context_version: 1, personalization_enabled: true } }),
            }),
          }),
          upsert: async (row: any) => ({ data: row, error: null }),
          insert: async (row: any) => ({ data: row, error: null }),
        };
      }
      if (table === 'career_context_items') {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              order: () => ({ data: mockItems }),
              single: async () => {
                const found = mockItems.find(i => i.id === val || i.user_id === val);
                return { data: found || null, error: found ? null : new Error('Not found') };
              },
              in: (_col2: string, vals: string[]) => ({
                data: mockItems.filter(i => vals.includes(i.id)),
                error: null,
              }),
            }),
          }),
          upsert: async (rows: any) => {
            const arr = Array.isArray(rows) ? rows : [rows];
            arr.forEach(r => {
              const idx = mockItems.findIndex(i => i.id === r.id);
              if (idx >= 0) mockItems[idx] = r;
              else mockItems.push(r);
            });
            return { error: null };
          },
          update: (fields: any) => ({
            eq: (col1: string, val1: string) => ({
              eq: (_col2: string, _val2: string) => {
                const item = mockItems.find(i => i[col1] === val1);
                if (item) Object.assign(item, fields);
                return { error: null };
              },
            }),
          }),
          insert: async (rows: any) => {
            const arr = Array.isArray(rows) ? rows : [rows];
            mockItems.push(...arr);
            return { error: null };
          },
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
                  const snap = mockSnapshots.find(s => s[col1] === val1);
                  return { data: snap || null, error: snap ? null : new Error('Not found') };
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
                  const b = mockBridges.find(x => x[col1] === val1 && x[col2] === val2);
                  return { data: b || null };
                },
                single: async () => {
                  const b = mockBridges.find(x => x[col1] === val1 && x[col2] === val2);
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
                    const b = mockBridges.find(x => x[col1] === val1);
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
        select: () => ({ eq: () => ({ order: () => ({ data: [] }), single: async () => ({ data: null }) }) }),
      };
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/api/career-context', careerContextRoutes);

describe('Career Context API Routes (P0-3)', () => {
  beforeEach(() => {
    mockItems.length = 0;
    mockSnapshots.length = 0;
    mockBridges.length = 0;

    // Seed mock active item & contact item & inferred item
    mockItems.push({
      id: 'item_role_1',
      user_id: 'test_user_p03',
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
      id: 'item_email_1',
      user_id: 'test_user_p03',
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
      id: 'item_inferred_1',
      user_id: 'test_user_p03',
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
      .post('/api/career-context/items/item_inferred_1/decision')
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
        includedItemIds: ['item_role_1', 'item_email_1'],
        excludedItemIds: [],
        scope: 'one_time',
        sourceModules: ['resume'],
      });

    expect(res.status).toBe(200);
    expect(res.body.snapshot).toBeDefined();
    // Verify item_email_1 was stripped because sensitivity is personal_contact
    expect(res.body.snapshot.itemIds).toEqual(['item_role_1']);
  });

  it('5. POST /api/career-context/bridges creates idempotent bridge session', async () => {
    const reqBody = {
      sourceModule: 'resume',
      targetModule: 'interview',
      purpose: 'resume_to_interview',
      snapshotId: 'snap_001',
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
      id: 'br_test_consume',
      user_id: 'test_user_p03',
      source_module: 'resume',
      target_module: 'interview',
      purpose: 'resume_to_interview',
      snapshot_id: 'snap_001',
      status: 'confirmed',
      client_request_id: 'req_to_consume',
      created_at: new Date().toISOString(),
    });

    const res1 = await request(app)
      .post('/api/career-context/bridges/br_test_consume/consume')
      .send({ targetSessionId: 'int_sess_999' });

    expect(res1.status).toBe(200);
    expect(res1.body.bridge.status).toBe('consumed');

    // Second consumption attempt must fail
    const res2 = await request(app)
      .post('/api/career-context/bridges/br_test_consume/consume')
      .send({ targetSessionId: 'int_sess_1000' });

    expect(res2.status).toBe(500);
    expect(res2.body.error).toContain('already been consumed');
  });
});
