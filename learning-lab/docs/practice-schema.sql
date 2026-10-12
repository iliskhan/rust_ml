-- PROPOSAL ONLY. Not an applied migration; no production project was changed.
-- Target: a fresh Supabase PostgreSQL 15+ database. Execute as migration owner.
-- Read practice-data-model.md before promoting this file into migrations.
-- private must NOT be an exposed Data API schema. Backend connects through a
-- dedicated login granted practice_api; trusted supervisor uses practice_worker.
-- The untrusted process running learner code gets neither database credentials
-- nor Supabase keys. Do not grant these roles to authenticated or anon.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create role practice_api nologin nobypassrls;
create role practice_worker nologin nobypassrls;
grant usage on schema private, public to practice_api, practice_worker;

create table public.practice_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_language text not null default 'python'
    check (preferred_language in ('python', 'javascript', 'rust')),
  created_at timestamptz not null default now()
);

create table public.practice_releases (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version > 0),
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  check ((status = 'published') = (published_at is not null))
);

create table public.practice_topics (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.practice_releases(id),
  topic_key text not null,
  title text not null,
  lesson_anchor text not null,
  position integer not null check (position >= 0),
  unique (id, release_id),
  unique (release_id, topic_key),
  unique (release_id, position)
);

-- A requirement is one denominator item. Equivalent exercises inside it are OR;
-- all required requirements in a topic are AND.
create table public.practice_requirements (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null,
  release_id uuid not null,
  requirement_key text not null,
  position integer not null check (position >= 0),
  required boolean not null default true,
  completion_rule text not null check (completion_rule in ('pass', 'independent')),
  foreign key (topic_id, release_id) references public.practice_topics(id, release_id),
  unique (id, topic_id, release_id),
  unique (topic_id, requirement_key),
  unique (topic_id, position)
);

create table public.practice_exercises (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null,
  release_id uuid not null,
  requirement_id uuid not null,
  exercise_key text not null,
  position integer not null check (position >= 0),
  objective text not null,
  prompt_markdown text not null,
  foreign key (requirement_id, topic_id, release_id)
    references public.practice_requirements(id, topic_id, release_id),
  unique (id, release_id),
  unique (release_id, exercise_key),
  unique (topic_id, position)
);

create table public.practice_variants (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null,
  release_id uuid not null,
  language text not null check (language in ('python', 'javascript', 'rust')),
  starter_code text not null check (octet_length(starter_code) <= 65536),
  entrypoint text not null,
  public_tests jsonb not null check (jsonb_typeof(public_tests) = 'array'),
  runtime_digest text not null check (runtime_digest ~ '^sha256:[0-9a-f]{64}$'),
  foreign key (exercise_id, release_id)
    references public.practice_exercises(id, release_id),
  unique (id, release_id),
  unique (exercise_id, language)
);

-- Never place hidden tests or solutions in public rows, views, HTML, source maps,
-- Vite assets, browser worker bundles, or publicly readable Storage objects.
create table private.practice_bundles (
  variant_id uuid primary key,
  release_id uuid not null,
  bundle_sha256 text not null check (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  grading_tests jsonb not null check (jsonb_typeof(grading_tests) = 'array'),
  expected_tests integer not null check (expected_tests > 0),
  runner_spec jsonb not null check (jsonb_typeof(runner_spec) = 'object'),
  hints text[] not null default '{}',
  reference_solution text not null,
  foreign key (variant_id, release_id)
    references public.practice_variants(id, release_id),
  check (jsonb_array_length(grading_tests) = expected_tests)
);

create table public.practice_enrollments (
  user_id uuid not null references public.practice_profiles(user_id) on delete cascade,
  release_id uuid not null references public.practice_releases(id),
  primary_language text not null check (primary_language in ('python', 'javascript', 'rust')),
  created_at timestamptz not null default now(),
  primary key (user_id, release_id)
);

-- One persistent session per user + variant. Opening a fresh browser tab cannot
-- erase the assistance history or create a second parallel draft for this variant.
create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  variant_id uuid not null,
  release_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (user_id, release_id)
    references public.practice_enrollments(user_id, release_id) on delete cascade,
  foreign key (variant_id, release_id)
    references public.practice_variants(id, release_id),
  unique (user_id, variant_id),
  unique (id, user_id),
  unique (id, user_id, variant_id, release_id)
);

create table public.practice_drafts (
  session_id uuid primary key,
  user_id uuid not null,
  source text not null check (octet_length(source) <= 65536),
  origin text not null default 'starter' check (origin in ('starter', 'editor', 'guest_import')),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  foreign key (session_id, user_id)
    references public.practice_sessions(id, user_id) on delete cascade
);

create table public.practice_help_receipts (
  session_id uuid not null,
  user_id uuid not null,
  help_key text not null check (help_key = 'solution' or help_key ~ '^hint:[1-9][0-9]*$'),
  first_opened_at timestamptz not null default now(),
  foreign key (session_id, user_id)
    references public.practice_sessions(id, user_id) on delete cascade,
  primary key (session_id, help_key)
);

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null,
  variant_id uuid not null,
  release_id uuid not null,
  idempotency_key uuid not null,
  draft_revision bigint not null check (draft_revision >= 0),
  source text not null check (octet_length(source) <= 65536),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  runtime_digest text not null check (runtime_digest ~ '^sha256:[0-9a-f]{64}$'),
  bundle_sha256 text not null check (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  assistance text not null check (assistance in ('none', 'hint', 'solution')),
  status text not null default 'queued' check (status in ('queued', 'running', 'graded', 'error')),
  verdict text check (verdict in ('pass', 'fail')),
  error_kind text check (error_kind in ('compile_error', 'runtime_error', 'time_limit',
    'memory_limit', 'output_limit', 'infrastructure', 'cancelled')),
  expected_tests integer not null check (expected_tests > 0),
  passed_tests integer check (passed_tests between 0 and expected_tests),
  -- Only supervisor-sanitized feedback, never raw hidden test values or traces.
  feedback text check (octet_length(feedback) <= 8000),
  submitted_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (session_id, user_id, variant_id, release_id)
    references public.practice_sessions(id, user_id, variant_id, release_id) on delete cascade,
  unique (user_id, idempotency_key),
  check (
    (status in ('queued', 'running') and verdict is null and error_kind is null
      and passed_tests is null and finished_at is null)
    or (status = 'error' and verdict is null and error_kind is not null and error_kind in ('infrastructure', 'cancelled')
      and passed_tests is null and finished_at is not null)
    or (status = 'graded' and verdict is not null and passed_tests is not null
      and finished_at is not null
      and (error_kind is null or error_kind not in ('infrastructure', 'cancelled'))
      and ((verdict = 'pass' and passed_tests = expected_tests and error_kind is null)
        or (verdict = 'fail' and (passed_tests < expected_tests or error_kind is not null))))
  )
);
create index practice_attempts_history on public.practice_attempts(user_id, submitted_at desc);
create index practice_attempts_progress on public.practice_attempts(user_id, variant_id, status, verdict);
create index practice_drafts_owner on public.practice_drafts(user_id);
create index practice_help_owner on public.practice_help_receipts(user_id);

-- This IS the durable queue for MVP; do not also create a second queue authority.
create table private.practice_jobs (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.practice_attempts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'leased', 'finished')),
  available_at timestamptz not null default now(),
  lease_generation integer not null default 0 check (lease_generation >= 0),
  lease_token uuid,
  lease_until timestamptz,
  result_sha256 text check (result_sha256 ~ '^[0-9a-f]{64}$'),
  check (status <> 'leased' or (lease_token is not null and lease_until is not null))
);
create index practice_jobs_available on private.practice_jobs(available_at, id) where status = 'queued';
create index practice_jobs_expired on private.practice_jobs(lease_until, id) where status = 'leased';

-- Freeze the complete release, including private grading content. Row locks also
-- serialize publication against concurrent edits, avoiding a check-then-write race.
create function private.guard_practice_release() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' then
    raise exception 'published_release_is_immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger practice_release_frozen before update or delete on public.practice_releases
for each row execute function private.guard_practice_release();

create function private.guard_practice_content() returns trigger
language plpgsql set search_path = '' as $$
declare r uuid;
begin
  if tg_op <> 'INSERT' then
    r := old.release_id;
    perform 1 from public.practice_releases where id = r and status = 'draft' for update;
    if not found then raise exception 'published_release_is_immutable'; end if;
  end if;
  if tg_op <> 'DELETE' then
    r := new.release_id;
    perform 1 from public.practice_releases where id = r and status = 'draft' for update;
    if not found then raise exception 'published_release_is_immutable'; end if;
    return new;
  end if;
  return old;
end $$;
create trigger practice_topics_frozen before insert or update or delete on public.practice_topics
for each row execute function private.guard_practice_content();
create trigger practice_requirements_frozen before insert or update or delete on public.practice_requirements
for each row execute function private.guard_practice_content();
create trigger practice_exercises_frozen before insert or update or delete on public.practice_exercises
for each row execute function private.guard_practice_content();
create trigger practice_variants_frozen before insert or update or delete on public.practice_variants
for each row execute function private.guard_practice_content();
create trigger practice_bundles_frozen before insert or update or delete on private.practice_bundles
for each row execute function private.guard_practice_content();

-- Publication is a trusted authoring operation. No API/worker grant is given.
create function private.publish_practice_release(p_release uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.practice_releases where id = p_release and status = 'draft' for update;
  if not found then raise exception 'draft_release_not_found'; end if;
  if not exists (select 1 from public.practice_topics where release_id = p_release)
    or exists (select 1 from public.practice_topics t where t.release_id = p_release
      and not exists (select 1 from public.practice_requirements q where q.topic_id = t.id and q.required))
    or exists (select 1 from public.practice_requirements q where q.release_id = p_release
      and (select count(*) from public.practice_exercises e where e.requirement_id = q.id)
        < case when q.completion_rule = 'independent' then 2 else 1 end)
    or exists (select 1 from public.practice_exercises e where e.release_id = p_release
      and (select count(*) from public.practice_variants v where v.exercise_id = e.id) <> 3)
    or exists (select 1 from public.practice_variants v where v.release_id = p_release
      and not exists (select 1 from private.practice_bundles b where b.variant_id = v.id)) then
    raise exception 'incomplete_release';
  end if;
  update public.practice_releases set status = 'published', published_at = clock_timestamp()
    where id = p_release;
end $$;

-- All p_user values below come from a VERIFIED access token in trusted backend
-- code, never from the JSON request body. These functions are not browser RPCs.
create function private.start_practice(p_user uuid, p_variant uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.practice_variants; s uuid;
begin
  select v0.* into v from public.practice_variants v0
    join public.practice_releases r on r.id = v0.release_id
    where v0.id = p_variant and r.status = 'published';
  if not found then raise exception 'published_variant_not_found'; end if;
  insert into public.practice_profiles(user_id, preferred_language)
    values (p_user, v.language) on conflict do nothing;
  insert into public.practice_enrollments(user_id, release_id, primary_language)
    select p_user, v.release_id, preferred_language from public.practice_profiles where user_id = p_user
    on conflict do nothing;
  insert into public.practice_sessions(user_id, variant_id, release_id)
    values (p_user, v.id, v.release_id) on conflict (user_id, variant_id) do nothing;
  select id into s from public.practice_sessions where user_id = p_user and variant_id = p_variant;
  insert into public.practice_drafts(session_id, user_id, source)
    values (s, p_user, v.starter_code) on conflict do nothing;
  return s;
end $$;

create function private.choose_practice_language(p_user uuid, p_release uuid, p_language text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.practice_profiles where user_id = p_user for update;
  update public.practice_enrollments set primary_language = p_language
    where user_id = p_user and release_id = p_release;
  if not found then raise exception 'enrollment_not_found'; end if;
  update public.practice_profiles set preferred_language = p_language where user_id = p_user;
end $$;

create function private.save_practice_draft(p_user uuid, p_session uuid, p_revision bigint,
  p_source text, p_origin text default 'editor')
returns bigint language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  if p_origin is null or p_origin not in ('editor', 'guest_import') then raise exception 'invalid_origin'; end if;
  update public.practice_drafts set source = p_source, origin = p_origin, revision = revision + 1, updated_at = clock_timestamp()
    where session_id = p_session and user_id = p_user and revision = p_revision returning revision into n;
  if not found then raise exception 'draft_conflict_or_not_found'; end if;
  return n;
end $$;

create function private.open_practice_help(p_user uuid, p_session uuid, p_key text) returns text
language plpgsql security definer set search_path = '' as $$
declare s public.practice_sessions; b private.practice_bundles; answer text; n integer;
begin
  select * into s from public.practice_sessions where id = p_session and user_id = p_user for update;
  if not found then raise exception 'session_not_found'; end if;
  select * into strict b from private.practice_bundles where variant_id = s.variant_id;
  if p_key = 'solution' then answer := b.reference_solution;
  elsif p_key ~ '^hint:[1-9][0-9]{0,3}$' then
    n := split_part(p_key, ':', 2)::integer; answer := b.hints[n];
  end if;
  if answer is null then raise exception 'help_not_found'; end if;
  insert into public.practice_help_receipts(session_id, user_id, help_key)
    values (s.id, p_user, p_key) on conflict do nothing;
  return answer;
end $$;

create function private.submit_practice(p_user uuid, p_session uuid, p_key uuid, p_revision bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.practice_sessions; d public.practice_drafts; v public.practice_variants;
  b private.practice_bundles; a public.practice_attempts; aid text;
begin
  -- Serialize submissions per account for idempotency and admission limits.
  perform 1 from public.practice_profiles where user_id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  select * into a from public.practice_attempts where user_id = p_user and idempotency_key = p_key;
  if found then
    if a.session_id is distinct from p_session or a.draft_revision is distinct from p_revision then
      raise exception 'idempotency_key_reused_with_different_request';
    end if;
    return a.id;
  end if;
  select * into s from public.practice_sessions where id = p_session and user_id = p_user for update;
  if not found then raise exception 'session_not_found'; end if;
  select * into strict d from public.practice_drafts where session_id = s.id for update;
  if d.revision is distinct from p_revision then raise exception 'draft_conflict'; end if;
  -- Proposed MVP limits; edge IP/account rate limits remain a separate boundary.
  if (select count(*) from public.practice_attempts where user_id = p_user and status in ('queued', 'running')) >= 2
    or (select count(*) from public.practice_attempts where user_id = p_user
      and submitted_at > clock_timestamp() - interval '1 minute') >= 10
    or (select count(*) from public.practice_attempts where user_id = p_user
      and submitted_at > clock_timestamp() - interval '24 hours'
      and (error_kind is distinct from 'infrastructure')) >= 200 then
    raise exception 'submission_limit';
  end if;
  select * into strict v from public.practice_variants where id = s.variant_id;
  select * into strict b from private.practice_bundles where variant_id = v.id;
  select case when bool_or(help_key = 'solution') then 'solution'
    when count(*) > 0 then 'hint' else 'none' end into aid
    from public.practice_help_receipts where session_id = s.id;
  insert into public.practice_attempts(user_id, session_id, variant_id, release_id,
    idempotency_key, draft_revision, source, source_sha256, runtime_digest, bundle_sha256,
    assistance, expected_tests)
    values (p_user, s.id, v.id, v.release_id, p_key, d.revision, d.source,
      encode(sha256(convert_to(d.source, 'UTF8')), 'hex'), v.runtime_digest, b.bundle_sha256, aid, b.expected_tests)
    returning * into a;
  insert into private.practice_jobs(attempt_id) values (a.id);
  return a.id;
end $$;

-- Each claim returns the pinned inputs to a trusted supervisor, not to a browser.
-- Reclaim expired work; processing may repeat, the accepted result cannot repeat.
create function private.claim_practice_job() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j private.practice_jobs; a public.practice_attempts; b private.practice_bundles;
begin
  loop
    select * into j from private.practice_jobs
      where (status = 'queued' and available_at <= clock_timestamp())
        or (status = 'leased' and lease_until <= clock_timestamp())
      order by available_at, id for update skip locked limit 1;
    if not found then return null; end if;
    if j.lease_generation >= 3 then
      update public.practice_attempts set status = 'error', error_kind = 'infrastructure',
        finished_at = clock_timestamp(), feedback = 'Проверка недоступна. Отправьте решение ещё раз.'
        where id = j.attempt_id;
      update private.practice_jobs set status = 'finished' where id = j.id;
      continue;
    end if;
    update private.practice_jobs set status = 'leased', lease_generation = lease_generation + 1,
      lease_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '60 seconds', result_sha256 = null
      where id = j.id returning * into j;
    update public.practice_attempts set status = 'running' where id = j.attempt_id returning * into a;
    select * into strict b from private.practice_bundles where variant_id = a.variant_id;
    return jsonb_build_object('job_id', j.id, 'attempt_id', a.id, 'lease_token', j.lease_token,
      'lease_generation', j.lease_generation, 'lease_until', j.lease_until,
      'source', a.source, 'source_sha256', a.source_sha256, 'runtime_digest', a.runtime_digest,
      'bundle_sha256', a.bundle_sha256, 'grading_tests', b.grading_tests, 'runner_spec', b.runner_spec);
  end loop;
end $$;

create function private.renew_practice_job(p_job uuid, p_token uuid, p_generation integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.practice_jobs set lease_until = clock_timestamp() + interval '60 seconds'
    where id = p_job and status = 'leased' and lease_token = p_token
      and lease_generation = p_generation and lease_until > clock_timestamp();
  return found;
end $$;

-- p_outcome: pass | fail | infrastructure. No raw process result is accepted as
-- authority: supervisor checks protocol, result limits, test IDs and sandbox exit.
create function private.finish_practice_job(p_job uuid, p_token uuid, p_generation integer,
  p_outcome text, p_passed integer, p_error text, p_feedback text)
returns text language plpgsql security definer set search_path = '' as $$
declare j private.practice_jobs; a public.practice_attempts; h text;
begin
  select * into j from private.practice_jobs where id = p_job for update;
  if not found then raise exception 'job_not_found'; end if;
  h := encode(sha256(convert_to(jsonb_build_array(p_outcome, p_passed, p_error, p_feedback)::text, 'UTF8')), 'hex');
  if j.lease_token is distinct from p_token or j.lease_generation is distinct from p_generation then
    raise exception 'stale_lease';
  end if;
  select * into strict a from public.practice_attempts where id = j.attempt_id for update;
  if j.status in ('finished', 'queued') and j.result_sha256 = h then return a.status; end if;
  if j.status <> 'leased' or j.lease_until <= clock_timestamp() then raise exception 'stale_lease'; end if;
  if p_outcome = 'infrastructure' then
    if p_passed is not null or p_error is distinct from 'infrastructure' then
      raise exception 'invalid_infrastructure_result';
    end if;
    if j.lease_generation < 3 then
      update public.practice_attempts set status = 'queued' where id = a.id;
      update private.practice_jobs set status = 'queued', available_at = clock_timestamp() + interval '5 seconds',
        result_sha256 = h where id = j.id;
      return 'queued';
    end if;
    update public.practice_attempts set status = 'error', error_kind = 'infrastructure',
      feedback = 'Проверка недоступна. Отправьте решение ещё раз.', finished_at = clock_timestamp() where id = a.id;
  elsif p_outcome in ('pass', 'fail') then
    update public.practice_attempts set status = 'graded', verdict = p_outcome,
      passed_tests = p_passed, error_kind = p_error, feedback = p_feedback,
      finished_at = clock_timestamp() where id = a.id;
    -- CHECK constraints reject inconsistent pass/fail counts and error categories.
  else raise exception 'invalid_outcome';
  end if;
  update private.practice_jobs set status = 'finished', result_sha256 = h where id = j.id;
  select status into a.status from public.practice_attempts where id = a.id;
  return a.status;
end $$;

-- Defense in depth: API roles have no direct writes to evidence or queue tables.
-- Existing Supabase public-schema default grants are explicitly revoked.
do $$ declare t text; begin
  foreach t in array array['practice_profiles', 'practice_releases', 'practice_topics',
    'practice_requirements', 'practice_exercises', 'practice_variants', 'practice_enrollments', 'practice_sessions',
    'practice_drafts', 'practice_help_receipts', 'practice_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;
alter table private.practice_bundles enable row level security;
alter table private.practice_jobs enable row level security;
revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on all functions in schema private from public, anon, authenticated, service_role;

grant select on public.practice_releases, public.practice_topics, public.practice_requirements, public.practice_exercises,
  public.practice_variants to anon, authenticated;
create policy published_releases on public.practice_releases for select to anon, authenticated
  using (status = 'published');
create policy published_topics on public.practice_topics for select to anon, authenticated
  using (exists (select 1 from public.practice_releases r where r.id = release_id and r.status = 'published'));
create policy published_exercises on public.practice_exercises for select to anon, authenticated
  using (exists (select 1 from public.practice_releases r where r.id = release_id and r.status = 'published'));
create policy published_requirements on public.practice_requirements for select to anon, authenticated
  using (exists (select 1 from public.practice_releases r where r.id = release_id and r.status = 'published'));
create policy published_variants on public.practice_variants for select to anon, authenticated
  using (exists (select 1 from public.practice_releases r where r.id = release_id and r.status = 'published'));

grant select on public.practice_profiles, public.practice_enrollments, public.practice_sessions,
  public.practice_drafts, public.practice_help_receipts, public.practice_attempts to authenticated;
grant update (preferred_language) on public.practice_profiles to authenticated;
do $$ declare t text; begin
  foreach t in array array['practice_profiles', 'practice_enrollments', 'practice_sessions',
    'practice_drafts', 'practice_help_receipts', 'practice_attempts'] loop
    execute format('create policy own_read on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;
create policy own_language on public.practice_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant execute on function private.start_practice(uuid, uuid),
  private.choose_practice_language(uuid, uuid, text),
  private.save_practice_draft(uuid, uuid, bigint, text, text),
  private.open_practice_help(uuid, uuid, text),
  private.submit_practice(uuid, uuid, uuid, bigint) to practice_api;
grant execute on function private.claim_practice_job(),
  private.renew_practice_job(uuid, uuid, integer),
  private.finish_practice_job(uuid, uuid, integer, text, integer, text, text) to practice_worker;

-- Live, recomputable evidence; no browser-writable completed flag or score cache.
-- Optional requirements are separate and do not enlarge the denominator.
create view public.practice_topic_progress with (security_invoker = true) as
with evidence as (
  select user_id, variant_id,
    bool_or(status = 'graded' and verdict = 'pass') as passed,
    bool_or(status = 'graded' and verdict = 'pass' and assistance = 'none') as independent
  from public.practice_attempts group by user_id, variant_id
), requirement_evidence as (
  select en.user_id, en.release_id, t.id as topic_id, v.language,
    (v.language = en.primary_language) as is_primary_language,
    q.id as requirement_id, q.required, q.completion_rule,
    bool_or(coalesce(a.passed, false)) as passed,
    bool_or(coalesce(a.independent, false)) as independent
  from public.practice_enrollments en
  join public.practice_topics t on t.release_id = en.release_id
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

-- No global ALTER DEFAULT PRIVILEGES: that would change unrelated project APIs.
-- Every later migration must explicitly revoke default EXECUTE and table grants.
commit;
