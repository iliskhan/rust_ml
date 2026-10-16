-- Continuous conservative admission. This 31-day application window is not a
-- provider billing meter; the existing 1 CPU-hour / 1,000 creations caps remain.
-- Apply only after SQL001-006. No manifests, credentials, enable switch or
-- lifetime counters are reset. SQL006's grants and lease fencing are retained.
begin;

-- Exact SQL006 constraint names (including its three multi-column checks).
alter table private.practice_grading_settings
  drop constraint practice_grading_settings_check,
  drop constraint practice_grading_settings_check1,
  drop constraint practice_grading_settings_check2,
  add constraint practice_grading_lifetime_cpu_nonnegative check (reserved_cpu_ms >= 0),
  add constraint practice_grading_lifetime_creations_nonnegative check (reserved_creations >= 0),
  add constraint practice_grading_enabled_period check (not enabled or
    (billing_period_start is not null and billing_period_end is not null
      and billing_period_end > billing_period_start));

-- No foreign keys: deleting a job, attempt or account cannot refund usage.
create table private.practice_grading_reservations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid,
  lease_generation integer,
  reserved_cpu_ms bigint not null check (reserved_cpu_ms >= 0),
  reserved_creations integer not null check (reserved_creations >= 0),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  unique (job_id,lease_generation),
  check ((job_id is null and lease_generation is null)
    or (job_id is not null and lease_generation is not null and lease_generation > 0)),
  check (reserved_cpu_ms > 0 or reserved_creations > 0),
  check (expires_at > created_at)
);
create index practice_grading_reservations_expiry on private.practice_grading_reservations(expires_at);

create function private.guard_practice_grading_reservation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'grading_reservation_is_immutable';
end $$;
create trigger practice_grading_reservation_frozen before update or delete
on private.practice_grading_reservations for each row
execute function private.guard_practice_grading_reservation();

-- Serialize cutover with SQL006 claims. Treat all lifetime usage as recent:
-- conservative migration baseline, even if some of it is already older.
do $$ declare cfg private.practice_grading_settings; cutover timestamptz;
begin
  select * into strict cfg from private.practice_grading_settings where singleton for update;
  cutover := clock_timestamp();
  if cfg.reserved_cpu_ms > 0 or cfg.reserved_creations > 0 then
    insert into private.practice_grading_reservations
      (reserved_cpu_ms,reserved_creations,created_at,expires_at)
      values(cfg.reserved_cpu_ms,cfg.reserved_creations,cutover,cutover+interval '31 days 210 seconds');
  end if;
  update private.practice_grading_settings
    set billing_period_start=coalesce(billing_period_start,cutover),billing_period_end='infinity'
    where singleton;
end $$;

create or replace function private.submit_practice(p_user uuid, p_session uuid, p_key uuid, p_revision bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.practice_sessions; d public.practice_drafts;
  m private.practice_grading_manifests; a public.practice_attempts;
  cfg private.practice_grading_settings; aid text; active_cpu bigint; active_creations bigint;
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
  select coalesce(sum(reserved_cpu_ms),0), coalesce(sum(reserved_creations),0)
    into active_cpu,active_creations from private.practice_grading_reservations
    where expires_at > clock_timestamp();
  if active_creations + m.expected_tests > cfg.creations_limit
    or active_cpu + m.expected_tests::bigint * cfg.case_timeout_ms > cfg.cpu_ms_limit then
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

create or replace function private.claim_practice_job(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cfg private.practice_grading_settings; j private.practice_jobs;
  a public.practice_attempts; m private.practice_grading_manifests; cost bigint; active_cpu bigint; active_creations bigint;
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
  select coalesce(sum(reserved_cpu_ms),0), coalesce(sum(reserved_creations),0)
    into active_cpu,active_creations from private.practice_grading_reservations
    where expires_at > clock_timestamp();
  if active_creations + m.expected_tests > cfg.creations_limit
    or active_cpu + cost > cfg.cpu_ms_limit then raise exception 'grading_budget_exhausted'; end if;
  update private.practice_grading_settings set reserved_cpu_ms=reserved_cpu_ms+cost,
    reserved_creations=reserved_creations+m.expected_tests where singleton;
  update private.practice_jobs set status='leased',lease_generation=lease_generation+1,
    lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',
    claim_deadline_at=clock_timestamp()+interval '210 seconds',result_sha256=null
    where id=j.id returning * into j;
  -- Every retry pays again. Retain usage for a full rolling window after the
  -- last possible VM creation within this claim's execution deadline.
  insert into private.practice_grading_reservations(job_id,lease_generation,
    reserved_cpu_ms,reserved_creations,expires_at)
    values(j.id,j.lease_generation,cost,m.expected_tests,j.claim_deadline_at+interval '31 days');
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

alter table private.practice_grading_reservations enable row level security;
revoke all on private.practice_grading_reservations
  from public,anon,authenticated,service_role,practice_api,practice_worker;
revoke all on function private.guard_practice_grading_reservation()
  from public,anon,authenticated,service_role,practice_api,practice_worker;
-- CREATE OR REPLACE preserves existing function ACLs; no helper RPC is exposed.
commit;
