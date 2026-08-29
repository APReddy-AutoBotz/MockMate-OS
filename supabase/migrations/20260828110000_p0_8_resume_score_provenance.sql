-- P0-8 resume-score provenance and owned-cache closure.
--
-- A governed score response is useful to Career Context only when the same
-- authenticated user has one durable source review. Exact request identity
-- prevents retry/cache races from creating multiple source record lineages.

alter table public.resume_reviews
  add column if not exists request_hash text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.resume_reviews'::regclass
      and conname = 'resume_reviews_request_hash_format'
  ) then
    alter table public.resume_reviews
      add constraint resume_reviews_request_hash_format
      check (request_hash is null or request_hash ~ '^[a-f0-9]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.resume_reviews'::regclass
      and conname = 'resume_reviews_user_request_hash_key'
  ) then
    alter table public.resume_reviews
      add constraint resume_reviews_user_request_hash_key
      unique (user_id, request_hash);
  end if;
end
$$;

alter table public.ai_cache
  add column if not exists user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ai_cache'::regclass
      and conname = 'ai_cache_user_id_fkey'
  ) then
    alter table public.ai_cache
      add constraint ai_cache_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

create index if not exists ai_cache_user_id_idx
  on public.ai_cache (user_id)
  where user_id is not null;

-- Legacy resume-score/suggestion entries have no owner, can no longer prove
-- source persistence/deletion, and must not survive the change.
delete from public.ai_cache
where kind in ('resume_score_governed_v2', 'resume_suggest_governed_v1')
  and user_id is null;

-- Resume reviews are server-authored provenance. Browser users may read their
-- own rows but cannot pre-seed, replace, or delete score authority records.
drop policy if exists "resume reviews owner access" on public.resume_reviews;
drop policy if exists "resume reviews owner read" on public.resume_reviews;
create policy "resume reviews owner read" on public.resume_reviews
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.resume_reviews, public.ai_cache
  from public, anon, authenticated;
grant select on public.resume_reviews
  to authenticated;
grant select, insert, update, delete on public.resume_reviews, public.ai_cache
  to service_role;

comment on column public.resume_reviews.request_hash is
  'Exact canonical SHA-256 identity for one governed resume-score request.';

comment on column public.ai_cache.user_id is
  'Optional owner for derived cache data that must follow account-data deletion.';
