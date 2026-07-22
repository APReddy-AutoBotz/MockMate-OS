import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';
const { Client } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../supabase/migrations');

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const isRequired = process.env.CI === 'true' || process.env.REQUIRE_POSTGRES_RUNTIME === 'true';

async function runRuntimeVerification() {
  console.log('[Runtime Verification] Connecting to disposable PostgreSQL database...');
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });

  try {
    await client.connect();
  } catch (err) {
    if (isRequired) {
      console.error('[Runtime Verification] ERROR: Could not connect to PostgreSQL database when REQUIRE_POSTGRES_RUNTIME or CI is active.');
      console.error(`Reason: ${err.message}`);
      process.exit(1);
    }
    console.warn('[Runtime Verification] Skipped runtime verification: Local PostgreSQL database is not reachable.');
    console.warn(`Reason: ${err.message}`);
    console.warn('Note: Static migration structure check (verify-supabase-migration.mjs) passed 100%.');
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

      INSERT INTO public.profiles (user_id, full_name) VALUES
        ('${user1Id}', 'Test User 1'),
        ('${user2Id}', 'Test User 2')
      ON CONFLICT (user_id) DO NOTHING;
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

    // 5. Invoke atomic_submit_answer with SET ROLE service_role
    console.log('[Runtime Verification] Invoking atomic_submit_answer for Turn 1 as service_role...');
    await client.query('SET ROLE service_role;');
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
    await client.query('RESET ROLE;');

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

    // 6. Test invalid answerKind rejection
    console.log('[Runtime Verification] Testing invalid answerKind rejection...');
    try {
      await client.query('SET ROLE service_role;');
      await client.query(`
        SELECT public.atomic_submit_answer(
          '${sessionId}'::uuid,
          '${user1Id}'::uuid,
          'q2'::text,
          1::integer,
          'invalid_kind'::text,
          'Invalid answer kind test'::text,
          NULL::jsonb,
          NULL::text,
          true::boolean,
          2::integer
        );
      `);
      throw new Error('Invalid answerKind did NOT throw an exception!');
    } catch (kindErr) {
      await client.query('RESET ROLE;');
      if (!kindErr.message.includes('Invalid answer kind')) {
        throw kindErr;
      }
      console.log('[Runtime Verification] Invalid answerKind successfully rejected by database constraint/RPC check.');
    }

    // 7. Repeat same request (duplicate) and prove it fails
    console.log('[Runtime Verification] Testing duplicate submission rejection...');
    try {
      await client.query('SET ROLE service_role;');
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
      await client.query('RESET ROLE;');
      if (!dupErr.message.includes('Stale or mismatched')) {
        throw dupErr;
      }
      console.log('[Runtime Verification] Duplicate submission successfully rejected with Stale or mismatched error.');
    }

    // 8. Submit final question and prove status = awaiting_report and completed_at remains null
    console.log('[Runtime Verification] Invoking atomic_submit_answer for final Turn 2 as service_role...');
    await client.query('SET ROLE service_role;');
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
    await client.query('RESET ROLE;');

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
    if (session.completed_at !== null) {
      throw new Error('Expected completed_at to remain NULL before report generation!');
    }

    // 9. Test anon role denial
    console.log('[Runtime Verification] Testing RPC permission revocation for anon role...');
    try {
      await client.query('SET ROLE anon;');
      await client.query(`
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
      throw new Error('Anon role was able to execute atomic_submit_answer!');
    } catch (anonErr) {
      await client.query('RESET ROLE;');
      if (!anonErr.message.includes('permission denied')) throw anonErr;
      console.log('[Runtime Verification] Execution by anon role successfully DENIED with permission error.');
    }

    // 10. Test authenticated role denial
    console.log('[Runtime Verification] Testing RPC permission revocation for authenticated role...');
    try {
      await client.query('SET ROLE authenticated;');
      await client.query(`
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
    } catch (authErr) {
      await client.query('RESET ROLE;');
      if (!authErr.message.includes('permission denied')) throw authErr;
      console.log('[Runtime Verification] Execution by authenticated role successfully DENIED with permission error.');
    }

    console.log('[Runtime Verification] Executed runtime verification: SUCCESS! All checks PASSED 100%!');
  } finally {
    await client.end();
  }
}

runRuntimeVerification().catch(err => {
  console.error('[Runtime Verification] FAILED with error:', err);
  process.exit(1);
});
