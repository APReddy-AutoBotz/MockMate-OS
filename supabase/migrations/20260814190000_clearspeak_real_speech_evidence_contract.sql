-- P0-5 source-only forward migration.
--
-- This migration does NOT authorize any speech provider and stores no raw audio.
-- It only prepares the existing immutable derived-attempt table to accept a
-- separately governed accent-score.v2 result if/when a server-owned real-speech
-- adapter is explicitly authorized in a future source change.

-- V1 originally constrained this column inline to accent-score.v1. Expand the
-- storage vocabulary explicitly rather than relying on the provenance check to
-- contradict an older table-level constraint.
alter table public.clearspeak_accent_attempts
  drop constraint if exists clearspeak_accent_attempts_scoring_contract_version_check;

alter table public.clearspeak_accent_attempts
  add constraint clearspeak_accent_attempts_scoring_contract_version_check check (
    scoring_contract_version in ('accent-score.v1', 'accent-score.v2')
  );

alter table public.clearspeak_accent_attempts
  drop constraint if exists clearspeak_accent_attempts_provenance_check;

alter table public.clearspeak_accent_attempts
  add constraint clearspeak_accent_attempts_provenance_check check (
    -- Existing deterministic CI fixtures remain unchanged.
    (fixture = true
      and evidence_provenance = 'synthetic_fixture_scored'
      and scoring_policy_version = 'synthetic-policy.v1'
      and scoring_contract_version = 'accent-score.v1'
      and result ->> 'contractVersion' = 'accent-score.v1'
      and result ->> 'evidenceProvenance' = 'synthetic_fixture_scored'
      and result ->> 'scoringPolicyVersion' = 'synthetic-policy.v1'
      and (result ->> 'fixture')::boolean = true)
    or
    -- Existing ordinary learner recordings continue to persist truthful nulls
    -- when no authorized real-speech scorer exists.
    (fixture = false
      and evidence_provenance = 'user_recording_unscored'
      and scoring_policy_version = 'scoring-unavailable.v1'
      and scoring_contract_version = 'accent-score.v1'
      and result ->> 'contractVersion' = 'accent-score.v1'
      and result ->> 'evidenceProvenance' = 'user_recording_unscored'
      and result ->> 'scoringPolicyVersion' = 'scoring-unavailable.v1'
      and (result ->> 'fixture')::boolean = false
      and result #> '{dimensions,intelligibility,score}' = 'null'::jsonb
      and result #> '{dimensions,pronunciation,score}' = 'null'::jsonb
      and result #> '{dimensions,prosody,score}' = 'null'::jsonb
      and result #> '{dimensions,fluency,score}' = 'null'::jsonb
      and result #> '{dimensions,targetStyle,score}' = 'null'::jsonb)
    or
    -- P0-5 governed real-speech results: derived evidence only. A provider may
    -- either produce at least one policy-authorized dimension score or complete
    -- evaluation with every dimension left null because the evidence is not
    -- reliable enough. Those states have different provenance labels.
    (fixture = false
      and evidence_provenance in ('user_recording_scored', 'user_recording_evaluated_unscored')
      and scoring_policy_version = 'real-speech-policy.v1'
      and scoring_contract_version = 'accent-score.v2'
      and result ->> 'contractVersion' = 'accent-score.v2'
      and result ->> 'evidenceProvenance' = evidence_provenance
      and result ->> 'scoringPolicyVersion' = 'real-speech-policy.v1'
      and (result ->> 'fixture')::boolean = false
      and coalesce(result #>> '{evidenceLineage,evidenceContractVersion}', '') = 'accent-scorer-evidence.v1'
      and coalesce(result #>> '{evidenceLineage,adapterId}', '') <> ''
      and coalesce(result #>> '{evidenceLineage,adapterVersion}', '') <> ''
      and coalesce(result #>> '{evidenceLineage,audioSha256}', '') ~ '^[a-f0-9]{64}$'
      and coalesce(result #>> '{evidenceLineage,evidenceSha256}', '') ~ '^[a-f0-9]{64}$'
      and not (result ? 'overallScore')
      and not (result ? 'nativeAccentScore')
      and (
        (evidence_provenance = 'user_recording_scored' and (
          result #> '{dimensions,intelligibility,score}' <> 'null'::jsonb
          or result #> '{dimensions,pronunciation,score}' <> 'null'::jsonb
          or result #> '{dimensions,prosody,score}' <> 'null'::jsonb
          or result #> '{dimensions,fluency,score}' <> 'null'::jsonb
          or result #> '{dimensions,targetStyle,score}' <> 'null'::jsonb
        ))
        or
        (evidence_provenance = 'user_recording_evaluated_unscored'
          and result #> '{dimensions,intelligibility,score}' = 'null'::jsonb
          and result #> '{dimensions,pronunciation,score}' = 'null'::jsonb
          and result #> '{dimensions,prosody,score}' = 'null'::jsonb
          and result #> '{dimensions,fluency,score}' = 'null'::jsonb
          and result #> '{dimensions,targetStyle,score}' = 'null'::jsonb
          and jsonb_typeof(result->'coaching') = 'array'
          and jsonb_array_length(result->'coaching') = 0)
      ))
  );

comment on constraint clearspeak_accent_attempts_provenance_check on public.clearspeak_accent_attempts is
  'Allows only synthetic accent-score.v1 fixtures, truthful provider-unavailable V1 nulls, or governed derived-only accent-score.v2 scored/evaluated-unscored evidence. No provider is authorized by this constraint.';
