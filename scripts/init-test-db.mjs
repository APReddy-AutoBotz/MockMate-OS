import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '../supabase/migrations');

export async function ensureTestDatabase(client) {
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  } catch (_) {}
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS auth;');
  } catch (_) {}
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS public;');
  } catch (_) {}

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY,
        email text,
        created_at timestamp with time zone DEFAULT now()
      );
    `);
  } catch (_) {}

  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
      $$ LANGUAGE sql STABLE;
    `);
  } catch (_) {}

  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOLOGIN BYPASSRLS;
        ELSE
          ALTER ROLE service_role BYPASSRLS;
        END IF;
        GRANT USAGE ON SCHEMA public TO anon;
        GRANT USAGE ON SCHEMA public TO authenticated;
        GRANT ALL ON SCHEMA public TO service_role;
      END $$;
    `);
  } catch (_) {}

  try {
    await client.query(`
      DROP TABLE IF EXISTS public.career_context_bridges CASCADE;
      DROP TABLE IF EXISTS public.career_context_snapshot_items CASCADE;
      DROP TABLE IF EXISTS public.career_context_snapshots CASCADE;
      DROP TABLE IF EXISTS public.career_context_items CASCADE;
      DROP TABLE IF EXISTS public.career_context_state CASCADE;
      DROP TABLE IF EXISTS public.interview_turns CASCADE;
      DROP TABLE IF EXISTS public.interview_sessions CASCADE;
      DROP TABLE IF EXISTS public.resume_reviews CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_beta_feedback CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_ledgers CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_progress CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_sessions CASCADE;
      DROP TABLE IF EXISTS public.clearspeak_profiles CASCADE;
      DROP TABLE IF EXISTS public.usage_ledger CASCADE;
      DROP TABLE IF EXISTS public.ai_cache CASCADE;
      DROP TABLE IF EXISTS public.profiles CASCADE;
    `);
  } catch (_) {}

  // Apply migrations in order
  const files = (await readdir(migrationsDir))
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    try {
      await client.query(sql);
    } catch (err) {
      if (!err.message?.includes('already exists')) {
        throw err;
      }
    }
  }
}
