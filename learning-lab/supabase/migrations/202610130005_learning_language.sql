-- The latest immutable language event also selects the server's learning route.
begin;
create index practice_learning_language_latest on public.practice_learning_events(user_id,occurred_at desc,event_id desc)
  where kind='language';

create function private.reconcile_practice_learning_language() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Same owner lock as sync: profile and every release follow committed event order.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 130004));
  insert into public.practice_profiles(user_id,preferred_language)
    select e.user_id,e.language from public.practice_learning_events e
    where e.user_id=new.user_id and e.kind='language'
    order by e.occurred_at desc,e.event_id desc limit 1
    on conflict(user_id) do update set preferred_language=excluded.preferred_language;
  insert into public.practice_enrollments(user_id,release_id,primary_language)
    select e.user_id,e.release_id,e.language from public.practice_learning_events e
    where e.user_id=new.user_id and e.release_id=new.release_id and e.kind='language'
    order by e.occurred_at desc,e.event_id desc limit 1
    on conflict(user_id,release_id) do update set primary_language=excluded.primary_language;
  return new;
end $$;
revoke all on function private.reconcile_practice_learning_language() from public,anon,authenticated,service_role;
create trigger practice_learning_language_reconcile after insert on public.practice_learning_events
  for each row when (new.kind='language') execute function private.reconcile_practice_learning_language();

-- Existing receipts are authoritative too; create only profiles/enrollments, never grading evidence.
insert into public.practice_profiles(user_id,preferred_language)
  select distinct on (user_id) user_id,language from public.practice_learning_events
  where kind='language' order by user_id,occurred_at desc,event_id desc
  on conflict(user_id) do update set preferred_language=excluded.preferred_language;
insert into public.practice_enrollments(user_id,release_id,primary_language)
  select distinct on (user_id,release_id) user_id,release_id,language from public.practice_learning_events
  where kind='language' order by user_id,release_id,occurred_at desc,event_id desc
  on conflict(user_id,release_id) do update set primary_language=excluded.primary_language;

-- Older clients use the same event authority instead of overwriting its result.
create or replace function public.practice_choose_language(p_release uuid,p_language text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  perform public.practice_sync_learning(p_release,jsonb_build_array(jsonb_build_object(
    'event_id',gen_random_uuid(),'exercise_key',null,'language',p_language,
    'kind','language','occurred_at',clock_timestamp(),'payload','{}'::jsonb)),0);
end $$;
revoke all on function public.practice_choose_language(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.practice_choose_language(uuid,text) to authenticated;
commit;
