-- Forward-only correction: learner recordings are real recordings whose derived
-- result is unscored, not synthetic fixtures. Existing rows predate that path
-- and are therefore backfilled as the only provenance they could contain.
alter table public.clearspeak_accent_attempts
  add column if not exists evidence_provenance text;

update public.clearspeak_accent_attempts
set evidence_provenance = case
  when fixture then 'synthetic_fixture_scored'
  else 'user_recording_unscored'
end
where evidence_provenance is null;

-- Older synthetic rows were valid under the deployed contract but their JSON
-- predates the explicit provenance member. Preserve them without reclassifying
-- their evidence or rewriting the original migration.
update public.clearspeak_accent_attempts
set result = jsonb_set(result, '{evidenceProvenance}', '"synthetic_fixture_scored"'::jsonb, true)
where fixture = true and not (result ? 'evidenceProvenance');

alter table public.clearspeak_accent_attempts
  alter column evidence_provenance set not null;

alter table public.clearspeak_accent_attempts
  drop constraint if exists clearspeak_accent_attempts_fixture_check;

alter table public.clearspeak_accent_attempts
  add constraint clearspeak_accent_attempts_provenance_check check (
    (fixture = true
      and evidence_provenance = 'synthetic_fixture_scored'
      and scoring_policy_version = 'synthetic-policy.v1'
      and result ->> 'evidenceProvenance' = 'synthetic_fixture_scored'
      and result ->> 'scoringPolicyVersion' = 'synthetic-policy.v1'
      and (result ->> 'fixture')::boolean = true)
    or
    (fixture = false
      and evidence_provenance = 'user_recording_unscored'
      and scoring_policy_version = 'scoring-unavailable.v1'
      and result ->> 'evidenceProvenance' = 'user_recording_unscored'
      and result ->> 'scoringPolicyVersion' = 'scoring-unavailable.v1'
      and (result ->> 'fixture')::boolean = false
      and result #> '{dimensions,intelligibility,score}' = 'null'::jsonb
      and result #> '{dimensions,pronunciation,score}' = 'null'::jsonb
      and result #> '{dimensions,prosody,score}' = 'null'::jsonb
      and result #> '{dimensions,fluency,score}' = 'null'::jsonb
      and result #> '{dimensions,targetStyle,score}' = 'null'::jsonb)
  );

-- Preserve immutable server-owned writes and owner-only reads/deletes.
revoke insert, update on public.clearspeak_accent_attempts from authenticated;
