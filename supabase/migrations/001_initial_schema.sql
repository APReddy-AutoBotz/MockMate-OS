create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  target_role text,
  primary_goal text,
  experience_level text,
  onboarding_complete boolean not null default false,
  clearspeak_beta_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resume_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_data jsonb not null default '{}'::jsonb,
  ats_diagnostics jsonb,
  jd_match jsonb,
  raw_text_hash text,
  jd_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text,
  setup jsonb not null default '{}'::jsonb,
  status text not null default 'created',
  report_summary jsonb,
  readiness_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  question text,
  answer_text text,
  code text,
  feedback jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.clearspeak_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  level int not null,
  goal text not null,
  audience_context text not null default '',
  main_struggle text not null,
  comfort_language text not null default 'en',
  practice_duration int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clearspeak_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_tag text,
  score jsonb not null default '{}'::jsonb,
  practiced_words text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.clearspeak_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  streak int not null default 0,
  last_practice_date date,
  clarity_trend jsonb not null default '[]'::jsonb,
  topic_best_scores jsonb not null default '{}'::jsonb,
  best_performing_topic text not null default '',
  hard_word_count int not null default 0,
  total_sessions_completed int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.clearspeak_ledgers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  entries jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.clearspeak_beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null,
  score_fair boolean,
  feedback_helpful boolean,
  confident_after_retry boolean,
  submitted_at timestamptz not null default now(),
  unique (user_id, session_id)
);

create table if not exists public.usage_ledger (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  feature text not null,
  used int not null default 0,
  limit_value int not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date, feature)
);

create table if not exists public.ai_cache (
  cache_key text primary key,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.resume_reviews enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_turns enable row level security;
alter table public.clearspeak_profiles enable row level security;
alter table public.clearspeak_sessions enable row level security;
alter table public.clearspeak_progress enable row level security;
alter table public.clearspeak_ledgers enable row level security;
alter table public.clearspeak_beta_feedback enable row level security;
alter table public.usage_ledger enable row level security;
alter table public.ai_cache enable row level security;

create policy "profiles owner access" on public.profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "resume reviews owner access" on public.resume_reviews
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "interview sessions owner access" on public.interview_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "interview turns owner access" on public.interview_turns
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clearspeak profiles owner access" on public.clearspeak_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clearspeak sessions owner access" on public.clearspeak_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clearspeak progress owner access" on public.clearspeak_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clearspeak ledgers owner access" on public.clearspeak_ledgers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clearspeak feedback owner access" on public.clearspeak_beta_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "usage owner read" on public.usage_ledger
  for select using (user_id = auth.uid());

-- No anon/authenticated policy is created for ai_cache; it is server-only.
