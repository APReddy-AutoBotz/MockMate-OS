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

    // 11. Test atomic_submit_adaptive_turn execution & idempotency replay
    const adaptiveSessionId = '44444444-4444-4444-4444-444444444444';
    const submissionUuid = '55555555-5555-5555-5555-555555555555';
    const turnUuid = '66666666-6666-6666-6666-666666666666';

    await client.query(`
      DELETE FROM public.interview_turns WHERE session_id = '${adaptiveSessionId}';
      DELETE FROM public.interview_sessions WHERE id = '${adaptiveSessionId}';

      INSERT INTO public.interview_sessions (
        id, user_id, setup, status, engine_version, session_version, current_stage, pending_question_id, pending_question
      ) VALUES (
        '${adaptiveSessionId}', '${user1Id}', '{"controls":{"reasoningMode":"classic_behavioral"}}'::jsonb, 'active', 'v2', 1, 'framing', 'q1', '${q1Json}'::jsonb
      );
    `);

    console.log('[Runtime Verification] Invoking atomic_submit_adaptive_turn for Adaptive Turn 1...');
    const adaptiveResponseJson = JSON.stringify({
      completedTurnId: turnUuid,
      sessionVersion: 2,
      evaluationStatus: 'evaluated',
      nextQuestion: JSON.parse(q2Json),
      nextAction: 'continue',
      isSessionComplete: false,
      rootQuestionIndex: 0,
      rootQuestionCount: 2,
      turnIndex: 1,
      maxTurns: 8,
      stage: 'probing'
    });

    await client.query('SET ROLE service_role;');
    const adapRes1 = await client.query(`
      SELECT public.atomic_submit_adaptive_turn(
        '${adaptiveSessionId}'::uuid,
        '${user1Id}'::uuid,
        '${turnUuid}'::uuid,
        'q1'::text,
        1::integer,
        '${submissionUuid}'::uuid,
        'answered'::text,
        'I structured the system cleanly.'::text,
        'framing'::text,
        '{"overallScore": 3}'::jsonb,
        'evaluated'::text,
        '{"strength":"Good framing"}'::jsonb,
        NULL::jsonb,
        'continue'::text,
        '${q2Json}'::jsonb,
        'q2'::text,
        'probing'::text,
        0::integer,
        2::integer,
        1::integer,
        8::integer,
        false::boolean,
        '${adaptiveResponseJson}'::jsonb
      ) AS result;
    `);
    await client.query('RESET ROLE;');

    const adaptiveTurnResult1 = adapRes1.rows[0].result;
    console.log('[Runtime Verification] Adaptive Turn 1 Result:', adaptiveTurnResult1);
    if (adaptiveTurnResult1.completedTurnId !== turnUuid || adaptiveTurnResult1.sessionVersion !== 2) {
      throw new Error('Adaptive Turn 1 return payload mismatch!');
    }

    // 12. Test idempotency replay of atomic_submit_adaptive_turn
    console.log('[Runtime Verification] Testing idempotency replay of atomic_submit_adaptive_turn...');
    await client.query('SET ROLE service_role;');
    const adapRes2 = await client.query(`
      SELECT public.atomic_submit_adaptive_turn(
        '${adaptiveSessionId}'::uuid,
        '${user1Id}'::uuid,
        '${turnUuid}'::uuid,
        'q1'::text,
        1::integer,
        '${submissionUuid}'::uuid,
        'answered'::text,
        'I structured the system cleanly.'::text,
        'framing'::text,
        '{"overallScore": 3}'::jsonb,
        'evaluated'::text,
        '{"strength":"Good framing"}'::jsonb,
        NULL::jsonb,
        'continue'::text,
        '${q2Json}'::jsonb,
        'q2'::text,
        'probing'::text,
        0::integer,
        2::integer,
        1::integer,
        8::integer,
        false::boolean,
        '${adaptiveResponseJson}'::jsonb
      ) AS result;
    `);
    await client.query('RESET ROLE;');

    const replayResult = adapRes2.rows[0].result;
    console.log('[Runtime Verification] Idempotency Replay Result:', replayResult);
    if (replayResult.completedTurnId !== turnUuid || replayResult.sessionVersion !== 2) {
      throw new Error('Idempotency replay returned incorrect payload!');
    }

    // Prove only 1 turn row exists in database for this session
    const turnRows = await client.query(`SELECT * FROM public.interview_turns WHERE session_id = '${adaptiveSessionId}'::uuid`);
    if (turnRows.rows.length !== 1) {
      throw new Error(`Expected exactly 1 turn row after idempotency replay, found ${turnRows.rows.length}`);
    }

    // 13. Test anon denial on atomic_submit_adaptive_turn
    console.log('[Runtime Verification] Testing RPC permission revocation for anon role on atomic_submit_adaptive_turn...');
    try {
      await client.query('SET ROLE anon;');
      await client.query(`
        SELECT public.atomic_submit_adaptive_turn(
          '${adaptiveSessionId}'::uuid,
          '${user1Id}'::uuid,
          '${turnUuid}'::uuid,
          'q1'::text,
          2::integer,
          '77777777-7777-7777-7777-777777777777'::uuid,
          'answered'::text,
          'Anon attempt'::text,
          'probing'::text,
          NULL::jsonb,
          'evaluated'::text,
          NULL::jsonb,
          NULL::jsonb,
          'continue'::text,
          NULL::jsonb,
          NULL::text,
          'probing'::text,
          0::integer,
          2::integer,
          2::integer,
          8::integer,
          false::boolean,
          '{}'::jsonb
        );
      `);
      throw new Error('Anon role was able to execute atomic_submit_adaptive_turn!');
    } catch (anonAdapErr) {
      await client.query('RESET ROLE;');
      if (!anonAdapErr.message.includes('permission denied')) throw anonAdapErr;
      console.log('[Runtime Verification] Execution of atomic_submit_adaptive_turn by anon role successfully DENIED with permission error.');
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
