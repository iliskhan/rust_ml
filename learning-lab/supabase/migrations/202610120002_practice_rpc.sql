-- Browser RPC boundary: PostgREST verifies JWT; owner is never a request argument.
begin;
create function public.practice_start(p_variant uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return private.start_practice(auth.uid(), p_variant);
end $$;
create function public.practice_save_draft(p_session uuid, p_revision bigint, p_source text, p_origin text default 'editor') returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return private.save_practice_draft(auth.uid(), p_session, p_revision, p_source, p_origin);
end $$;
create function public.practice_open_help(p_session uuid, p_key text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  return private.open_practice_help(auth.uid(), p_session, p_key);
end $$;
create function public.practice_choose_language(p_release uuid, p_language text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  perform private.choose_practice_language(auth.uid(), p_release, p_language);
end $$;
create function public.practice_submit(p_session uuid, p_key uuid, p_revision bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  raise exception 'grading_unavailable';
end $$;
revoke all on function public.practice_start(uuid), public.practice_save_draft(uuid,bigint,text,text),
  public.practice_open_help(uuid,text), public.practice_choose_language(uuid,text), public.practice_submit(uuid,uuid,bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.practice_start(uuid), public.practice_save_draft(uuid,bigint,text,text),
  public.practice_open_help(uuid,text), public.practice_choose_language(uuid,text), public.practice_submit(uuid,uuid,bigint)
  to authenticated;
commit;
