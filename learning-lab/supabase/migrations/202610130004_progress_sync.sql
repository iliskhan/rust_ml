-- Formative activity is learner-authored; it never contributes to graded mastery.
begin;
create table public.practice_learning_events (
  sequence bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.practice_releases(id),
  event_id uuid not null,
  exercise_key text,
  language text not null check (language in ('python','javascript','rust')),
  kind text not null check (kind in ('quiz','help','activity','language')),
  occurred_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  unique (user_id, event_id),
  foreign key (release_id, exercise_key) references public.practice_exercises(release_id, exercise_key),
  check ((kind = 'language') = (exercise_key is null))
);
create index practice_learning_events_owner_release on public.practice_learning_events(user_id,release_id,sequence);
create index practice_learning_events_owner_received on public.practice_learning_events(user_id,received_at);
alter table public.practice_learning_events enable row level security;
revoke all on public.practice_learning_events from public,anon,authenticated;
grant select on public.practice_learning_events to authenticated;
create policy own_read on public.practice_learning_events for select to authenticated using (user_id = (select auth.uid()));

create function public.practice_sync_learning(p_release uuid, p_events jsonb, p_after bigint default 0)
returns setof public.practice_learning_events
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid(); item jsonb; prior public.practice_learning_events;
  id uuid; exercise text; lang text; event_kind text; stamp timestamptz; data jsonb;
  total_events bigint; recent_events bigint;
begin
  if owner is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not exists (select 1 from public.practice_releases r where r.id=p_release and r.status='published') then
    raise exception 'release_unavailable' using errcode='22023';
  end if;
  if p_after is null or p_after < 0 or p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'invalid_learning_events' using errcode='22023';
  end if;
  if jsonb_array_length(p_events) > 500 or octet_length(p_events::text) > 262144 then
    raise exception 'learning_batch_too_large' using errcode='22023';
  end if;
  -- Serialize the owner's inserts so identical concurrent retries compare the committed event.
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 130004));
  select count(*), count(*) filter (where received_at > now() - interval '1 minute')
    into total_events, recent_events from public.practice_learning_events where user_id=owner;
  for item in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(item) <> 'object' or not (item ?& array['event_id','exercise_key','language','kind','occurred_at','payload'])
      or (item - array['event_id','exercise_key','language','kind','occurred_at','payload']) <> '{}'::jsonb then
      raise exception 'invalid_learning_event' using errcode='22023';
    end if;
    id := (item->>'event_id')::uuid; exercise := item->>'exercise_key'; lang := item->>'language';
    event_kind := item->>'kind'; stamp := (item->>'occurred_at')::timestamptz; data := item->'payload';
    if id is null or lang is null or lang not in ('python','javascript','rust')
      or event_kind is null or event_kind not in ('quiz','help','activity','language')
      or stamp is null or not isfinite(stamp) or stamp < '2000-01-01'::timestamptz
      or stamp > now() + interval '1 day' or jsonb_typeof(data) <> 'object'
      or ((event_kind='language') <> (exercise is null)) then
      raise exception 'invalid_learning_event' using errcode='22023';
    end if;
    if exercise is not null and not exists (select 1 from public.practice_exercises e
      where e.release_id=p_release and e.exercise_key=exercise) then
      raise exception 'exercise_unavailable' using errcode='22023';
    end if;
    if event_kind='quiz' then
      if not (data ?& array['answer','correct','draftRevision']) or (data - array['answer','correct','draftRevision']) <> '{}'::jsonb
        or jsonb_typeof(data->'answer') <> 'number' or jsonb_typeof(data->'draftRevision') <> 'number'
        or jsonb_typeof(data->'correct') <> 'boolean' then raise exception 'invalid_quiz_event' using errcode='22023'; end if;
      if (data->>'answer')::numeric < 0 or (data->>'answer')::numeric > 9007199254740991
        or trunc((data->>'answer')::numeric) <> (data->>'answer')::numeric
        or (data->>'draftRevision')::numeric < 0 or (data->>'draftRevision')::numeric > 9007199254740991
        or trunc((data->>'draftRevision')::numeric) <> (data->>'draftRevision')::numeric then
        raise exception 'invalid_quiz_event' using errcode='22023'; end if;
    elsif event_kind='help' then
      if not (data ? 'kind') or (data - 'kind') <> '{}'::jsonb or jsonb_typeof(data->'kind') <> 'string'
        or length(data->>'kind') not between 1 and 100 then raise exception 'invalid_help_event' using errcode='22023'; end if;
    elsif data <> '{}'::jsonb then raise exception 'invalid_learning_payload' using errcode='22023';
    end if;
    select * into prior from public.practice_learning_events where user_id=owner and event_id=id;
    if found then
      if prior.release_id <> p_release or prior.exercise_key is distinct from exercise or prior.language <> lang
        or prior.kind <> event_kind or prior.occurred_at <> stamp or prior.payload <> data then
        raise exception 'learning_event_conflict' using errcode='23505';
      end if;
    else
      if total_events >= 100000 then raise exception 'learning_storage_limit' using errcode='54000'; end if;
      if recent_events >= 3000 then raise exception 'learning_rate_limit' using errcode='54000'; end if;
      insert into public.practice_learning_events(user_id,release_id,event_id,exercise_key,language,kind,occurred_at,payload)
        values(owner,p_release,id,exercise,lang,event_kind,stamp,data);
      total_events := total_events + 1; recent_events := recent_events + 1;
    end if;
  end loop;
  return query select * from public.practice_learning_events e
    where e.user_id=owner and e.release_id=p_release and e.sequence>p_after order by e.sequence limit 500;
end;
$$;
revoke all on function public.practice_sync_learning(uuid,jsonb,bigint) from public,anon;
grant execute on function public.practice_sync_learning(uuid,jsonb,bigint) to authenticated;
commit;
