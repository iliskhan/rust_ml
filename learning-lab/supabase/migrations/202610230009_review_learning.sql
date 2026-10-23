-- Review #10: the 47 known shared banks are repetition, not independent transfer.
-- B06/R02/U06. Keep immutable content, all attempts, assistance receipts and drafts.
-- Only recompute independent evidence for this release; raw pass counts stay visible.
-- Existing clients retain the view contract and cannot announce false topic mastery.
-- New content/releases require genuinely distinct instances; no evidence is copied.
begin;

create or replace view public.practice_topic_progress with (security_invoker = true) as
with repeat_topics(topic_key) as (values
  ('unit.advanced.full-transformer'),
  ('unit.advanced.bpe'),
  ('unit.advanced.swiglu'),
  ('unit.advanced.lora'),
  ('unit.advanced.vit'),
  ('unit.advanced.moe'),
  ('unit.advanced.mla'),
  ('unit.advanced.online-attention'),
  ('unit.advanced.ssm'),
  ('unit.advanced.denoisers'),
  ('unit.frontier.clip'),
  ('unit.frontier.flow'),
  ('unit.frontier.interpretability'),
  ('unit.frontier.egnn'),
  ('unit.frontier.neural-fields'),
  ('unit.frontier.dpo'),
  ('unit.frontier.quantization'),
  ('unit.frontier.speculative'),
  ('unit.frontier.long-context'),
  ('unit.frontier.jepa'),
  ('unit.frontier.masked-text'),
  ('unit.frontier.kan'),
  ('unit.frontier.vit-training'),
  ('unit.frontier.moe-training'),
  ('unit.frontier.ssm-training'),
  ('unit.frontier.denoiser-training'),
  ('concept.gaussian'),
  ('concept.kl-divergence'),
  ('concept.latent-variable'),
  ('concept.likelihood'),
  ('concept.bayes-rule'),
  ('concept.elbo'),
  ('concept.reparameterization'),
  ('concept.monte-carlo'),
  ('concept.adversarial-game'),
  ('concept.conditional-expectation'),
  ('concept.noise-schedule'),
  ('concept.score-function'),
  ('concept.graph'),
  ('concept.adjacency-matrix'),
  ('concept.message-passing'),
  ('concept.markov-chain'),
  ('concept.discounted-return'),
  ('concept.policy'),
  ('concept.q-value'),
  ('concept.bellman-equation'),
  ('concept.policy-gradient')
), evidence as (
  select user_id, variant_id,
    bool_or(status = 'graded' and verdict = 'pass') as passed,
    bool_or(status = 'graded' and verdict = 'pass' and assistance = 'none') as independent
  from public.practice_attempts group by user_id, variant_id
), requirement_evidence as (
  select en.user_id, en.release_id, t.id as topic_id, v.language,
    (v.language = en.primary_language) as is_primary_language,
    q.id as requirement_id, q.required, q.completion_rule,
    bool_or(coalesce(a.passed, false)) as passed,
    bool_or(coalesce(a.independent, false)
      and not (r.release_key = '2026-10-v1' and rt.topic_key is not null)) as independent
  from public.practice_enrollments en
  join public.practice_releases r on r.id = en.release_id
  join public.practice_topics t on t.release_id = en.release_id
  left join repeat_topics rt on rt.topic_key = t.topic_key
  join public.practice_requirements q on q.topic_id = t.id
  join public.practice_exercises e on e.requirement_id = q.id
  join public.practice_variants v on v.exercise_id = e.id
  left join evidence a on a.user_id = en.user_id and a.variant_id = v.id
  group by en.user_id, en.release_id, en.primary_language, t.id, v.language,
    q.id, q.required, q.completion_rule
)
select user_id, release_id, topic_id, language, is_primary_language,
  count(*) filter (where required) as required_total,
  count(*) filter (where required and passed) as required_passed,
  count(*) filter (where required and passed
    and (completion_rule = 'pass' or independent)) as required_completed,
  count(*) filter (where required and completion_rule = 'independent') as independent_required_total,
  count(*) filter (where required and completion_rule = 'independent' and independent) as independent_required_passed,
  count(*) filter (where not required) as optional_total,
  count(*) filter (where not required and passed) as optional_passed
from requirement_evidence
group by user_id, release_id, topic_id, language, is_primary_language;
revoke all on public.practice_topic_progress from public, anon, authenticated, service_role;
grant select on public.practice_topic_progress to authenticated;

commit;
