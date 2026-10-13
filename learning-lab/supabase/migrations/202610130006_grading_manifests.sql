-- Provider-independent admission and immutable grading editions. No runtime or
-- manifest is installed, no login/password is created, and grading stays OFF.
begin;

create table private.practice_grading_manifests (
  variant_id uuid not null references public.practice_variants(id),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  edition integer not null check (edition > 0),
  runtime_digest text not null check (runtime_digest ~ '^sha256:[0-9a-f]{64}$'),
  expected_tests integer not null check (expected_tests between 1 and 4),
  grading_tests jsonb not null check (jsonb_typeof(grading_tests) = 'array'),
  runner_spec jsonb not null check (jsonb_typeof(runner_spec) = 'object'),
  primary key (variant_id, manifest_sha256),
  unique (variant_id, edition),
  check (jsonb_array_length(grading_tests) = expected_tests),
  check (octet_length(grading_tests::text) <= 262144),
  check (octet_length(runner_spec::text) <= 16384),
  check ((runner_spec -> 'runtime_digest' = to_jsonb(runtime_digest)) is true),
  check ((runner_spec -> 'enabled' = 'true'::jsonb) is true),
  check ((runner_spec -> 'protocol' = '1'::jsonb) is true),
  check ((runner_spec ->> 'adapter' = 'rustml-public-values-v1') is true),
  check ((runner_spec -> 'result_bytes' = '65536'::jsonb) is true),
  check ((runner_spec -> 'source_bytes' = '65536'::jsonb) is true),
  check ((runner_spec -> 'max_depth' = '16'::jsonb) is true)
);

create function private.guard_practice_grading_manifest() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then raise exception 'grading_manifest_is_immutable'; end if;
  if not exists (
    select 1 from public.practice_variants v join public.practice_releases r on r.id = v.release_id
    where v.id = new.variant_id and r.status = 'published'
      and (new.runner_spec ->> 'language') = v.language
      and (new.runner_spec ->> 'entrypoint') = v.entrypoint
  ) then raise exception 'grading_manifest_variant_mismatch'; end if;
  -- Publication and supervisor validate the canonical hash. PostgreSQL jsonb::text
  -- is not the canonical serialization used by grader/bundles.mjs.
  return new;
end $$;
create trigger practice_grading_manifest_frozen before insert or update or delete
on private.practice_grading_manifests for each row execute function private.guard_practice_grading_manifest();

-- These are conservative per-project reservations, not a provider billing meter.
-- Owner configures the actual provider billing window after hosted acceptance.
-- No automatic calendar reset or refund on ambiguous execution is permitted.
create table private.practice_grading_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  cpu_ms_limit bigint not null default 3600000 check (cpu_ms_limit between 1 and 3600000),
  creations_limit integer not null default 1000 check (creations_limit between 1 and 1000),
  reserved_cpu_ms bigint not null default 0 check (reserved_cpu_ms between 0 and cpu_ms_limit),
  reserved_creations integer not null default 0 check (reserved_creations between 0 and creations_limit),
  -- One vCPU, at most two GiB per sandbox; each case uses a fresh VM sequentially.
  case_timeout_ms integer not null default 30000 check (case_timeout_ms between 1000 and 45000),
  check (not enabled or (billing_period_start is not null and billing_period_end is not null
    and billing_period_end > billing_period_start
    and billing_period_end <= billing_period_start + interval '31 days'))
);
insert into private.practice_grading_settings(singleton) values (true);

alter table private.practice_jobs add column claim_deadline_at timestamptz;

create function private.guard_practice_attempt_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.id,new.user_id,new.session_id,new.variant_id,new.release_id,new.idempotency_key,
    new.draft_revision,new.source,new.source_sha256,new.runtime_digest,new.bundle_sha256,
    new.assistance,new.expected_tests,new.submitted_at)
    is distinct from row(old.id,old.user_id,old.session_id,old.variant_id,old.release_id,old.idempotency_key,
    old.draft_revision,old.source,old.source_sha256,old.runtime_digest,old.bundle_sha256,
    old.assistance,old.expected_tests,old.submitted_at)
    or (old.status in ('graded','error') and new is distinct from old) then
    raise exception 'attempt_snapshot_is_immutable';
  end if;
  return new;
end $$;
create trigger practice_attempt_snapshot_frozen before update on public.practice_attempts
for each row execute function private.guard_practice_attempt_snapshot();

create or replace function private.submit_practice(p_user uuid, p_session uuid, p_key uuid, p_revision bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.practice_sessions; d public.practice_drafts;
  m private.practice_grading_manifests; a public.practice_attempts;
  cfg private.practice_grading_settings; aid text;
begin
  if p_user is null or p_session is null or p_key is null or p_revision is null or p_revision < 0 then
    raise exception 'invalid_submission';
  end if;
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
  select * into strict cfg from private.practice_grading_settings where singleton for update;
  if not cfg.enabled or cfg.billing_period_start > clock_timestamp()
    or cfg.billing_period_end <= clock_timestamp() then raise exception 'grading_unavailable'; end if;
  select gm.* into m from private.practice_grading_manifests gm
    join public.practice_variants v on v.id = gm.variant_id
    join public.practice_releases r on r.id = v.release_id
    where gm.variant_id = s.variant_id and r.status = 'published'
    order by gm.edition desc limit 1;
  if not found then raise exception 'grading_unavailable'; end if;
  if exists (select 1 from public.practice_attempts where user_id = p_user and status in ('queued','running'))
    or (select count(*) from public.practice_attempts where user_id = p_user
      and submitted_at > clock_timestamp() - interval '1 minute') >= 2
    or (select count(*) from public.practice_attempts where user_id = p_user
      and submitted_at > clock_timestamp() - interval '24 hours') >= 10
    or (select count(*) from private.practice_jobs where status <> 'finished') >= 20 then
    raise exception 'submission_limit';
  end if;
  if cfg.reserved_creations + m.expected_tests > cfg.creations_limit
    or cfg.reserved_cpu_ms + m.expected_tests::bigint * cfg.case_timeout_ms > cfg.cpu_ms_limit then
    raise exception 'grading_budget_exhausted';
  end if;
  select case when bool_or(help_key = 'solution') then 'solution'
    when count(*) > 0 then 'hint' else 'none' end into aid
    from public.practice_help_receipts where session_id = s.id;
  insert into public.practice_attempts(user_id,session_id,variant_id,release_id,idempotency_key,
    draft_revision,source,source_sha256,runtime_digest,bundle_sha256,assistance,expected_tests)
    values(p_user,s.id,s.variant_id,s.release_id,p_key,d.revision,d.source,
      encode(sha256(convert_to(d.source,'UTF8')),'hex'),m.runtime_digest,m.manifest_sha256,aid,m.expected_tests)
    returning * into a;
  insert into private.practice_jobs(attempt_id) values(a.id);
  return a.id;
end $$;

-- The API may resume only a verified owner's existing attempt. This does not
-- expose source, tests or queue control to the browser or grant API worker powers.
create function private.practice_attempt_for_owner(p_user uuid, p_attempt uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object('id',id,'status',status) into result
    from public.practice_attempts where id=p_attempt and user_id=p_user;
  if not found then raise exception 'attempt_not_found'; end if;
  return result;
end $$;

-- Close the old unbudgeted path, including existing worker credentials.
create or replace function private.claim_practice_job() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin raise exception 'exact_attempt_required'; end $$;

create function private.claim_practice_job(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg private.practice_grading_settings; j private.practice_jobs;
  a public.practice_attempts; m private.practice_grading_manifests; cost bigint;
begin
  if p_attempt is null then raise exception 'invalid_attempt'; end if;
  -- Global lock serializes admission/reservation across accounts and deployments.
  select * into strict cfg from private.practice_grading_settings where singleton for update;
  if not cfg.enabled or cfg.billing_period_start > clock_timestamp()
    or cfg.billing_period_end <= clock_timestamp() then raise exception 'grading_unavailable'; end if;
  select * into j from private.practice_jobs where attempt_id=p_attempt
    and ((status='queued' and available_at<=clock_timestamp())
      or (status='leased' and lease_until<=clock_timestamp())) for update skip locked;
  if not found then return null; end if;
  select * into strict a from public.practice_attempts where id=j.attempt_id for update;
  select * into m from private.practice_grading_manifests
    where variant_id=a.variant_id and manifest_sha256=a.bundle_sha256;
  if j.lease_generation >= 3 or not found
    or m.runtime_digest is distinct from a.runtime_digest
    or m.expected_tests is distinct from a.expected_tests then
    update public.practice_attempts set status='error',error_kind='infrastructure',finished_at=clock_timestamp(),
      feedback='Проверка недоступна. Отправьте решение ещё раз.' where id=a.id;
    update private.practice_jobs set status='finished' where id=j.id;
    return null;
  end if;
  if (select count(*) from private.practice_jobs where status='leased' and lease_until>clock_timestamp()) >= 2 then
    return null;
  end if;
  cost := m.expected_tests::bigint * cfg.case_timeout_ms;
  if cfg.reserved_creations + m.expected_tests > cfg.creations_limit
    or cfg.reserved_cpu_ms + cost > cfg.cpu_ms_limit then raise exception 'grading_budget_exhausted'; end if;
  update private.practice_grading_settings set reserved_cpu_ms=reserved_cpu_ms+cost,
    reserved_creations=reserved_creations+m.expected_tests where singleton;
  update private.practice_jobs set status='leased',lease_generation=lease_generation+1,
    lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',
    claim_deadline_at=clock_timestamp()+interval '210 seconds',result_sha256=null
    where id=j.id returning * into j;
  update public.practice_attempts set status='running' where id=a.id;
  return jsonb_build_object('job_id',j.id,'attempt_id',a.id,'user_id',a.user_id,
    'variant_id',a.variant_id,'release_id',a.release_id,'lease_token',j.lease_token,
    'lease_generation',j.lease_generation,'lease_until',j.lease_until,'claim_deadline_at',j.claim_deadline_at,
    'source',a.source,'source_sha256',a.source_sha256,'runtime_digest',a.runtime_digest,
    'bundle_sha256',a.bundle_sha256,'expected_tests',a.expected_tests,
    'grading_tests',m.grading_tests,'runner_spec',m.runner_spec,
    'limits',jsonb_build_object('vcpus',1,'memory_mb',2048,'case_timeout_ms',cfg.case_timeout_ms,
      'stdout_bytes',16384,'result_bytes',65536));
end $$;

-- Read-only bounded discovery for a trusted reaper. Every run must still claim
-- the exact attempt above; discovery grants no unbudgeted execution path.
create function private.practice_due_attempts() returns table(attempt_id uuid)
language sql security definer set search_path = '' as $$
  select j.attempt_id from private.practice_jobs j
  where (j.status='queued' and j.available_at<=clock_timestamp())
    or (j.status='leased' and j.lease_until<=clock_timestamp())
  order by j.available_at,j.id limit 20
$$;

create or replace function private.renew_practice_job(p_job uuid,p_token uuid,p_generation integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.practice_jobs set lease_until=least(clock_timestamp()+interval '60 seconds',claim_deadline_at)
    where id=p_job and status='leased' and lease_token=p_token and lease_generation=p_generation
      and lease_until>clock_timestamp() and claim_deadline_at>clock_timestamp();
  return found;
end $$;

alter table private.practice_grading_manifests enable row level security;
alter table private.practice_grading_settings enable row level security;
revoke all on private.practice_grading_manifests,private.practice_grading_settings
  from public,anon,authenticated,service_role,practice_api,practice_worker;
revoke all on function private.guard_practice_grading_manifest(),private.guard_practice_attempt_snapshot(),
  private.submit_practice(uuid,uuid,uuid,bigint),private.practice_attempt_for_owner(uuid,uuid),
  private.claim_practice_job(),private.claim_practice_job(uuid),private.renew_practice_job(uuid,uuid,integer),
  private.practice_due_attempts()
  from public,anon,authenticated,service_role,practice_api,practice_worker;
grant execute on function private.submit_practice(uuid,uuid,uuid,bigint),
  private.practice_attempt_for_owner(uuid,uuid) to practice_api;
grant execute on function private.claim_practice_job(uuid),private.renew_practice_job(uuid,uuid,integer),
  private.practice_due_attempts() to practice_worker;
-- Existing finish function/role grants and public disabled submit are unchanged.
commit;
