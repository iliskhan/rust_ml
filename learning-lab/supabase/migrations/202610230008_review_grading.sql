-- Legacy editions keep their original digest. Resolve missing positional input
-- names from their immutable published exercise, never the learner's source.
begin;
create function private.practice_execution_contract(p_attempt uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('language',v.language,'entrypoint',v.entrypoint,
    'input_language',p.language,'input_starter',p.starter_code)
  from public.practice_attempts a
  join public.practice_variants v on v.id=a.variant_id and v.release_id=a.release_id
  join public.practice_variants p on p.exercise_id=v.exercise_id
    and p.release_id=v.release_id and p.language='python'
  join public.practice_releases r on r.id=v.release_id and r.status='published'
  where a.id=p_attempt
$$;
revoke all on function private.practice_execution_contract(uuid)
  from public,anon,authenticated,service_role,practice_api,practice_worker;
grant execute on function private.practice_execution_contract(uuid) to practice_worker;
commit;
