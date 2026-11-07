import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pkg from 'pg';
const { Pool } = pkg;

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || (process.env.NODE_ENV === 'test' ? 'postgresql://postgres:postgres@localhost:5432/postgres' : '');

export const isSupabaseConfigured = Boolean((supabaseUrl && serviceRoleKey) || postgresUrl);

function createPgAdapter(connectionString: string): any {
  const pool = new Pool({ connectionString });

  return {
    rpc: async (fnName: string, args: Record<string, any> = {}) => {
      try {
        const keys = Object.keys(args);
        const params = Object.values(args).map(v => {
          if (Array.isArray(v)) {
            if (v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
              return JSON.stringify(v);
            }
            return v;
          }
          if (typeof v === 'object' && v !== null) return JSON.stringify(v);
          return v;
        });
        const namedPlaceholders = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
        const sql = `SELECT public.${fnName}(${namedPlaceholders}) AS result;`;
        const res = await pool.query(sql, params);
        const rawResult = res.rows[0]?.result;
        return { data: rawResult, error: null };
      } catch (err: any) {
        return { data: null, error: err };
      }
    },
    from: (tableName: string) => {
      let selectCols = '*';
      let whereClauses: string[] = [];
      let queryParams: any[] = [];
      let orderByClause = '';
      let limitClause = '';
      let isSingle = false;
      let isMaybeSingle = false;
      let action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
      let payloadData: any = null;

      const builder: any = {
        select: (cols = '*') => {
          selectCols = cols;
          return builder;
        },
        eq: (col: string, val: any) => {
          queryParams.push(val);
          whereClauses.push(`${col} = $${queryParams.length}`);
          return builder;
        },
        in: (col: string, vals: any[]) => {
          queryParams.push(vals);
          whereClauses.push(`${col} = ANY($${queryParams.length})`);
          return builder;
        },
        order: (col: string, options: { ascending?: boolean } = {}) => {
          const dir = options.ascending === false ? 'DESC' : 'ASC';
          orderByClause = ` ORDER BY ${col} ${dir}`;
          return builder;
        },
        limit: (n: number) => {
          limitClause = ` LIMIT ${n}`;
          return builder;
        },
        single: () => {
          isSingle = true;
          return builder;
        },
        maybeSingle: () => {
          isMaybeSingle = true;
          return builder;
        },
        insert: (data: any) => {
          action = 'insert';
          payloadData = data;
          return builder;
        },
        update: (data: any) => {
          action = 'update';
          payloadData = data;
          return builder;
        },
        upsert: (data: any) => {
          action = 'upsert';
          payloadData = data;
          return builder;
        },
        delete: () => {
          action = 'delete';
          return builder;
        },
        then: (onfulfilled?: any, onrejected?: any) => {
          const promise = (async () => {
            try {
              let sql = '';
              let res: any;

              if (action === 'select') {
                const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
                sql = `SELECT ${selectCols} FROM public.${tableName}${where}${orderByClause}${limitClause}`;
                res = await pool.query(sql, queryParams);
                let rows = res.rows;
                if (isSingle) {
                  if (rows.length === 0) return { data: null, error: { message: 'Row not found', status: 404 } };
                  return { data: rows[0], error: null };
                }
                if (isMaybeSingle) {
                  return { data: rows[0] || null, error: null };
                }
                return { data: rows, error: null };
              }

              if (action === 'insert') {
                const rows = Array.isArray(payloadData) ? payloadData : [payloadData];
                if (rows.length === 0) return { data: [], error: null };
                const cols = Object.keys(rows[0]);
                const vals: any[] = [];
                const valueRows: string[] = [];

                rows.forEach(r => {
                  const rowValues = cols.map(c => {
                    vals.push(r[c]);
                    return `$${vals.length}`;
                  });
                  valueRows.push(`(${rowValues.join(', ')})`);
                });

                sql = `INSERT INTO public.${tableName} (${cols.join(', ')}) VALUES ${valueRows.join(', ')} RETURNING *`;
                res = await pool.query(sql, vals);
                if (isSingle) return { data: res.rows[0] || null, error: null };
                return { data: Array.isArray(payloadData) ? res.rows : res.rows[0], error: null };
              }

              if (action === 'update') {
                const cols = Object.keys(payloadData);
                const setClauses: string[] = [];
                cols.forEach(c => {
                  queryParams.push(payloadData[c]);
                  setClauses.push(`${c} = $${queryParams.length}`);
                });
                const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
                sql = `UPDATE public.${tableName} SET ${setClauses.join(', ')}${where} RETURNING *`;
                res = await pool.query(sql, queryParams);
                if (isSingle) return { data: res.rows[0] || null, error: null };
                return { data: res.rows, error: null };
              }

              if (action === 'upsert') {
                const rows = Array.isArray(payloadData) ? payloadData : [payloadData];
                if (rows.length === 0) return { data: [], error: null };
                const cols = Object.keys(rows[0]);
                const vals: any[] = [];
                const valueRows: string[] = [];

                rows.forEach(r => {
                  const rowValues = cols.map(c => {
                    vals.push(r[c]);
                    return `$${vals.length}`;
                  });
                  valueRows.push(`(${rowValues.join(', ')})`);
                });

                const updateSet = cols.filter(c => c !== 'id' && c !== 'user_id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
                sql = `INSERT INTO public.${tableName} (${cols.join(', ')}) VALUES ${valueRows.join(', ')} ON CONFLICT (id) DO UPDATE SET ${updateSet} RETURNING *`;
                res = await pool.query(sql, vals);
                if (isSingle) return { data: res.rows[0] || null, error: null };
                return { data: Array.isArray(payloadData) ? res.rows : res.rows[0], error: null };
              }

              if (action === 'delete') {
                const where = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
                sql = `DELETE FROM public.${tableName}${where} RETURNING *`;
                res = await pool.query(sql, queryParams);
                return { data: res.rows, error: null };
              }

              return { data: null, error: null };
            } catch (err: any) {
              return { data: null, error: err };
            }
          })();
          return promise.then(onfulfilled, onrejected);
        }
      };

      return builder;
    },
    auth: {
      getUser: async (token: string) => {
        if (!token) return { data: { user: null }, error: new Error('No token provided') };
        const userId = token.startsWith('Bearer ') ? token.slice(7) : token;
        const normUserId = userId.startsWith('dev_user_') ? (userId === 'dev_user_a' ? '11111111-1111-1111-1111-111111111111' : '22222222-2222-2222-2222-222222222222') : userId;
        return { data: { user: { id: normUserId, email: `${normUserId}@example.com` } }, error: null };
      }
    }
  };
}

export const supabaseAdmin: SupabaseClient | null = (supabaseUrl && serviceRoleKey && !supabaseUrl.includes('localhost') && !supabaseUrl.includes('127.0.0.1'))
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : (postgresUrl ? (createPgAdapter(postgresUrl) as unknown as SupabaseClient) : null);

export function requireSupabase(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new Error('Supabase service role is not configured');
  }
  return supabaseAdmin;
}
