-- ClearSpeak V1 persists derived interpretation data only. There is deliberately
-- no raw audio, transcript, voiceprint, provider payload, blob URL or storage key.
create table if not exists public.clearspeak_accent_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  prompt_id uuid not null,
  prompt_version integer not null check (prompt_version > 0),
  prompt_content_hash text not null check (prompt_content_hash ~ '^[a-f0-9]{64}$'),
  profile_id text not null check (profile_id in ('en-GB-general-v1', 'en-US-general-v1')),
  profile_version integer not null check (profile_version = 1),
  reference_set_version text not null,
  scoring_policy_version text not null,
  scoring_contract_version text not null check (scoring_contract_version = 'accent-score.v1'),
  fixture boolean not null check (fixture = true),
  dimensions jsonb not null,
  coaching jsonb not null,
  duration_ms integer not null check (duration_ms between 1 and 120000),
  mime_type text not null check (mime_type in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg')),
  created_at timestamptz not null default now(),
  unique (user_id, attempt_id)
);

alter table public.clearspeak_accent_attempts enable row level security;
create policy "accent attempts owner read" on public.clearspeak_accent_attempts for select to authenticated using (auth.uid() = user_id);
create policy "accent attempts owner delete" on public.clearspeak_accent_attempts for delete to authenticated using (auth.uid() = user_id);
-- Inserts remain server/service-role owned; immutable results have no UPDATE policy.
revoke insert, update on public.clearspeak_accent_attempts from authenticated;
