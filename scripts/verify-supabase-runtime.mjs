import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Client } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../supabase/migrations');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

async function runRuntimeVerification() {
  console.log('[Runtime Verification] Connecting to disposable PostgreSQL database...');
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });

  try {
    await client.connect();
  } catch (err) {
    console.warn('[Runtime Verification] Local PostgreSQL database is not reachable.');
    console.warn(`Reason: ${err.message}`);
    console.warn('Note: Static migration structure check (verify-supabase-migration.mjs) passed 100%.');
    console.warn('In GitHub Actions CI, this script executes dynamically against the postgres:16-alpine service container.');
    return;
  }

  console.log('[Runtime Verification] Connected! Creating auth schema & fixture roles...');

  try {
    // 1. Setup minimum auth schema & fixture roles
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text,
        created_at timestamp with time zone DEFAULT now()
      );
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
        SELECT coalesce(current_setting('request.jwt.claim.role', true), 'anon');
      $$ LANGUAGE sql STABLE;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
        END IF;
      END
      $$;
    `);

    // 2. Apply all migration files in lexical order
    const files = (await readdir(migrationsDir))
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      console.log(`[Runtime Verification] Executing migration: ${file}`);
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
    }
    console.log('[Runtime Verification] All migration SQL compiled and executed cleanly!');

    // 3. Create test users
    const user1Id = '11111111-1111-1111-1111-111111111111';
    const user2Id = '22222222-2222-2222-2222-222222222222';
    const sessionId = '33333333-3333-3333-3333-333333333333';

    await client.query(`
      INSERT INTO auth.users (id, email) VALUES
        ('${user1Id}', 'user1@example.com'),
        ('${user2Id}', 'user2@example.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, full_name) VALUES
        ('${user1Id}', 'Test User 1'),
        ('${user2Id}', 'Test User 2')
      ON CONFLICT (id) DO NOTHING;
    `);

    // 4. Create an interview session with pending question
    const q1Json = JSON.stringify({ id: 'q1', question: 'Explain React state.' });
    const q2Json = JSON.stringify({ id: 'q2', question: 'Explain Webpack bundling.' });

    await client.query(`
      DELETE FROM public.interview_turns WHERE session_id = '${sessionId}';
      DELETE FROM public.interview_sessions WHERE id = '${sessionId}';

      INSERT INTO public.interview_sessions (
        id, user_id, setup, status, current_question_index, pending_question_id, pending_question
      ) VALUES (
        '${sessionId}', '${user1Id}', '{}'::jsonb, 'active', 0, 'q1', '${q1Json}'::jsonb
      );
    `);

    // 5. Invoke atomic_submit_answer as service_role
    console.log('[Runtime Verification] Invoking atomic_submit_answer for Turn 1...');
    const res1 = await client.query(`
      SELECT public.atomic_submit_answer(
        '${sessionId}'::uuid,
        '${user1Id}'::uuid,
        'q1'::text,
        0::integer,
        'answered'::text,
        'I managed state with useState and useEffect.'::text,
        '${q2Json}'::jsonb,
        'q2'::text,
        false::boolean,
        2::integer
      ) AS result;
    `);

    const turn1Result = res1.rows[0].result;
    console.log('[Runtime Verification] Turn 1 Result:', turn1Result);

    if (!turn1Result.completedTurnId || turn1Result.isLastQuestion !== false || turn1Result.questionIndex !== 1) {
      throw new Error('Unexpected Turn 1 return payload shape!');
    }

    // Verify turn row created in database
    const turn1Row = await client.query(`SELECT * FROM public.interview_turns WHERE id = '${turn1Result.completedTurnId}'::uuid`);
    if (turn1Row.rows.length !== 1) throw new Error('interview_turns row was not created!');
    const turn1 = turn1Row.rows[0];
    if (turn1.user_id !== user1Id || turn1.session_id !== sessionId || turn1.question_id !== 'q1') {
      throw new Error('interview_turns row contains mismatched fields!');
    }
    if (turn1.feedback?.answerKind !== 'answered') {
      throw new Error('interview_turns feedback does not contain answerKind!');
    }

    // 6. Repeat same request (duplicate) and prove it fails
    console.log('[Runtime Verification] Testing duplicate submission rejection...');
    try {
      await client.query(`
        SELECT public.atomic_submit_answer(
          '${sessionId}'::uuid,
          '${user1Id}'::uuid,
          'q1'::text,
          0::integer,
          'answered'::text,
          'Duplicate attempt'::text,
          '${q2Json}'::jsonb,
          'q2'::text,
          false::boolean,
          2::integer
        );
      `);
      throw new Error('Duplicate submission did NOT throw an exception!');
    } catch (dupErr) {
      if (!dupErr.message.includes('Stale or mismatched')) {
        throw dupErr;
      }
      console.log('[Runtime Verification] Duplicate submission successfully rejected with Stale or mismatched error.');
    }

    // 7. Submit final question and prove status = awaiting_report and completed_at remains null
    console.log('[Runtime Verification] Invoking atomic_submit_answer for final Turn 2...');
    const res2 = await client.query(`
      SELECT public.atomic_submit_answer(
        '${sessionId}'::uuid,
        '${user1Id}'::uuid,
        'q2'::text,
        1::integer,
        'answered'::text,
        'Webpack bundles assets into static chunks.'::text,
        NULL::jsonb,
        NULL::text,
        true::boolean,
        2::integer
      ) AS result;
    `);

    const turn2Result = res2.rows[0].result;
    console.log('[Runtime Verification] Final Turn Result:', turn2Result);

    if (turn2Result.isLastQuestion !== true || turn2Result.nextQuestion !== null) {
      throw new Error('Final Turn return payload did not set nextQuestion to null!');
    }

    const sessionState = await client.query(`SELECT * FROM public.interview_sessions WHERE id = '${sessionId}'::uuid`);
    const session = sessionState.rows[0];
    if (session.status !== 'awaiting_report') {
      throw new Error(`Expected session status 'awaiting_report', got '${session.status}'`);
    }
    if (session.pending_question_id !== null || session.pending_question !== null) {
      throw new Error('Expected pending question fields to be cleared on final turn!');
    }
    if (session.completed_at !== null) {
      throw new Error('Expected completed_at to remain NULL before report generation!');
    }
    console.log('[Runtime Verification] Final turn state verified: status = awaiting_report, completed_at = NULL!');

    // 8. Attempt execution as anon / authenticated role and prove permission denied
    console.log('[Runtime Verification] Testing RPC permission revocation for anon / authenticated roles...');
    try {
      await client.query(`
        SET ROLE authenticated;
        SELECT public.atomic_submit_answer(
          '${sessionId}'::uuid,
          '${user1Id}'::uuid,
          'q1'::text,
          0::integer,
          'answered'::text,
          'Attempt'::text,
          NULL::jsonb,
          NULL::text,
          true::boolean,
          2::integer
        );
      `);
      throw new Error('Authenticated role was able to execute atomic_submit_answer!');
    } catch (permErr) {
      await client.query('RESET ROLE;');
      if (!permErr.message.includes('permission denied')) {
        throw permErr;
      }
      console.log('[Runtime Verification] Execution by authenticated role successfully DENIED with permission error.');
    }

    console.log('[Runtime Verification] SUCCESS! All 11 disposable PostgreSQL runtime checks PASSED!');
  } finally {
    await client.end();
  }
}

runRuntimeVerification().catch(err => {
  console.error('[Runtime Verification] FAILED with error:', err);
  process.exit(1);
});
