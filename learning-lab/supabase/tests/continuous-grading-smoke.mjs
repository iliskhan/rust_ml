import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
// node learning-lab/supabase/tests/continuous-grading-smoke.mjs work/backend-smoke/node_modules/@electric-sql/pglite/dist/index.js
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href)
const db = new PGlite()
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
for (const file of ['202610120001_practice.sql','202610120002_practice_rpc.sql','202610120003_anchor_content.sql',
  '202610130004_progress_sync.sql','202610130005_learning_language.sql','202610130006_grading_manifests.sql','202610160007_continuous_grading.sql']) {
  await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url),'utf8'))
}
let checks = 0
const q = async (sql,params=[]) => (await db.query(sql,params)).rows[0]
const role = async (name='postgres') => db.exec(name==='postgres'?'reset role':`reset role; set role ${name}`)
const asUser = async id => { await role('authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]) }
const eq = (actual,expected) => { assert.deepEqual(actual,expected); checks++ }
const fails = async (promise,pattern) => { await assert.rejects(promise,pattern); checks++ }
const canonical = value => value===null || typeof value!=='object' ? JSON.stringify(value)
  : Array.isArray(value) ? '['+value.map(canonical).join(',')+']'
    : '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'
const users = Array.from({length:5},()=>randomUUID())
await db.query('insert into auth.users select unnest($1::uuid[])',[users])
const variant = await q(`select v.* from public.practice_variants v join public.practice_exercises e on e.id=v.exercise_id
 join public.practice_requirements r on r.id=e.requirement_id where v.language='python' and r.completion_rule='independent' limit 1`)
const manifest = edition => {
  const runtime_digest='sha256:'+String(edition).repeat(64)
  const grading_tests=[{id:'a',input:{x:1},expected:1},{id:'b',input:{x:2},expected:2}]
  const runner_spec={enabled:true,protocol:1,adapter:'rustml-public-values-v1',language:variant.language,
    entrypoint:variant.entrypoint,runtime_digest,result_bytes:65536,source_bytes:65536,max_depth:16}
  const manifest_sha256=createHash('sha256').update(canonical({grading_tests,runner_spec})).digest('hex')
  return {edition,runtime_digest,grading_tests,runner_spec,manifest_sha256}
}
const put = m => db.query(`insert into private.practice_grading_manifests
 (variant_id,manifest_sha256,edition,runtime_digest,expected_tests,grading_tests,runner_spec) values($1,$2,$3,$4,2,$5,$6)`,
 [variant.id,m.manifest_sha256,m.edition,m.runtime_digest,JSON.stringify(m.grading_tests),JSON.stringify(m.runner_spec)])
const m1=manifest(1), m2=manifest(2)
await put(m1)
eq((await q('select enabled from private.practice_grading_settings')).enabled,false)
await fails(db.exec('update private.practice_grading_manifests set edition=8'),/grading_manifest_is_immutable/)
await fails(db.exec('delete from private.practice_grading_manifests'),/grading_manifest_is_immutable/)
await fails(put({...manifest(3),runner_spec:{...manifest(3).runner_spec,language:'rust'}}),/grading_manifest_variant_mismatch/)
await fails(put({...manifest(3),runner_spec:{...manifest(3).runner_spec,enabled:null}}),/check constraint/)
await fails(put({...manifest(3),runner_spec:{...manifest(3).runner_spec,runtime_digest:null}}),/check constraint/)
await fails(put({...manifest(3),grading_tests:[]}),/check constraint/)
for (const name of ['anon','authenticated','service_role','practice_api','practice_worker']) {
  await role(name)
  await fails(db.exec('select * from private.practice_grading_manifests'),/permission denied/)
  await fails(db.exec('update private.practice_grading_settings set enabled=true'),/permission denied/)
}
await role('practice_api')
await fails(db.query('select private.claim_practice_job($1)',[randomUUID()]),/permission denied/)
await role('practice_worker')
await fails(db.exec('select private.claim_practice_job()'),/permission denied/)
await fails(db.query('select private.submit_practice($1,$2,$3,0)',[users[0],randomUUID(),randomUUID()]),/permission denied/)
const sessions=[]
for (const user of users) {
  await asUser(user)
  const session=(await q('select public.practice_start($1) as id',[variant.id])).id
  sessions.push(session)
}
await asUser(users[0])
await q('select public.practice_save_draft($1,0,$2,$3)',[sessions[0],'saved learner source','editor'])
await q('select public.practice_open_help($1,$2)',[sessions[0],'solution'])
await fails(db.query('select public.practice_submit($1,$2,1)',[sessions[0],randomUUID()]),/grading_unavailable/)
await fails(db.query('select private.submit_practice($1,$2,$3,1)',[users[0],sessions[0],randomUUID()]),/permission denied/)
const submit = async (index,key=randomUUID(),revision=index===0?1:0) => {
  await role('practice_api')
  return (await q('select private.submit_practice($1,$2,$3,$4) as id',[users[index],sessions[index],key,revision])).id
}
await fails(submit(0),/grading_unavailable/)
await role()
await fails(db.exec('update private.practice_grading_settings set enabled=true,billing_period_start=null'),/check constraint/)
await db.exec(`update private.practice_grading_settings set enabled=true,billing_period_start=now()-interval '1 day',billing_period_end=now()+interval '29 days'`)
const key=randomUUID(), a=await submit(0,key)
await role()
await put(m2)
eq(await submit(0,key),a)
await fails(submit(0,key,0),/idempotency_key_reused/)
await fails(submit(0,randomUUID(),0),/draft_conflict/)
await fails(submit(0),/submission_limit/)
await fails(db.query('select private.submit_practice($1,$2,$3,1)',[users[1],sessions[0],randomUUID()]),/session_not_found/)
eq((await q('select private.practice_attempt_for_owner($1,$2) as result',[users[0],a])).result,{id:a,status:'queued'})
await fails(db.query('select private.practice_attempt_for_owner($1,$2)',[users[1],a]),/attempt_not_found/)
await role()
await db.exec('update private.practice_grading_settings set enabled=false')
eq(await submit(0,key),a)
await role('practice_worker')
await fails(db.query('select private.claim_practice_job($1)',[a]),/grading_unavailable/)
await role()
await db.exec('update private.practice_grading_settings set enabled=true')
const claim = async attempt => { await role('practice_worker'); return (await q('select private.claim_practice_job($1) as job',[attempt])).job }
const finish = async (job,passed=2,outcome='pass',error=null) => {
  await role('practice_worker')
  return (await q('select private.finish_practice_job($1,$2,$3,$4,$5,$6,$7) as status',
    [job.job_id,job.lease_token,job.lease_generation,outcome,passed,error,'Safe feedback'])).status
}
const first=await claim(a)
eq(first.bundle_sha256,m1.manifest_sha256)
eq(first.runtime_digest,m1.runtime_digest)
eq(first.expected_tests,2)
eq(first.source,'saved learner source')
eq(first.limits,{vcpus:1,memory_mb:2048,case_timeout_ms:30000,stdout_bytes:16384,result_bytes:65536})
eq(await claim(a),null)
await role()
eq(await q('select reserved_cpu_ms::int as cpu,reserved_creations as n from private.practice_grading_settings'),{cpu:60000,n:2})
await db.query("update private.practice_jobs set claim_deadline_at=now()+interval '10 seconds' where id=$1",[first.job_id])
await role('practice_worker')
eq((await q('select private.renew_practice_job($1,$2,$3) as ok',[first.job_id,first.lease_token,first.lease_generation])).ok,true)
await role()
eq((await q('select lease_until<=claim_deadline_at as ok from private.practice_jobs where id=$1',[first.job_id])).ok,true)
await db.query("update private.practice_jobs set lease_until=now()-interval '1 second' where id=$1",[first.job_id])
const retry=await claim(a)
eq(retry.lease_generation,2)
eq(retry.bundle_sha256,m1.manifest_sha256)
await fails(finish(first),/stale_lease/)
await fails(finish(retry,1),/check constraint/)
eq(await finish(retry),'graded')
eq(await finish(retry),'graded')
await role()
eq(await q('select reserved_cpu_ms::int as cpu,reserved_creations as n from private.practice_grading_settings'),{cpu:120000,n:4})
eq((await q('select assistance from public.practice_attempts where id=$1',[a])).assistance,'solution')
eq((await q('select source,revision::int from public.practice_drafts where session_id=$1',[sessions[0]])),{source:'saved learner source',revision:1})
eq((await q('select count(*)::int as n from public.practice_help_receipts where session_id=$1',[sessions[0]])).n,1)
await fails(db.query('update public.practice_attempts set bundle_sha256=$1 where id=$2',[m2.manifest_sha256,a]),/attempt_snapshot_is_immutable/)
await fails(db.query("update public.practice_attempts set feedback='changed' where id=$1",[a]),/attempt_snapshot_is_immutable/)
await asUser(users[0])
eq((await q('select sum(required_passed)::int as passed,sum(independent_required_passed)::int as independent from public.practice_topic_progress')),{passed:1,independent:0})
await asUser(users[1])
eq((await q('select count(*)::int as n from public.practice_attempts')).n,0)
const b=await submit(0)
const second=await claim(b)
eq(second.bundle_sha256,m2.manifest_sha256)
eq(await finish(second),'graded')
await fails(submit(0),/submission_limit/)
// Independent accounts cannot exceed global active leases; retries reserve again.
const others=[]
for (const i of [1,2,3]) others.push(await submit(i))
const c1=await claim(others[0]), c2=await claim(others[1])
eq(await claim(others[2]),null)
eq(await finish(c1,null,'infrastructure','infrastructure'),'queued')
eq(await finish(c1,null,'infrastructure','infrastructure'),'queued')
await role()
await db.query('update private.practice_jobs set available_at=now() where id=$1',[c1.job_id])
const c1retry=await claim(others[0])
eq(c1retry.lease_generation,2)
eq(await finish(c1retry),'graded')
eq(await finish(c2),'graded')
// Budget denial leaves queue/generation unchanged, including infra retry.
await role()
await db.exec('update private.practice_grading_settings set creations_limit=reserved_creations')
await fails(claim(others[2]),/grading_budget_exhausted/)
await fails(submit(4),/grading_budget_exhausted/)
await role()
eq((await q('select lease_generation from private.practice_jobs where attempt_id=$1',[others[2]])).lease_generation,0)
await db.exec('update private.practice_grading_settings set creations_limit=1000,cpu_ms_limit=reserved_cpu_ms')
await fails(claim(others[2]),/grading_budget_exhausted/)
await role()
await db.exec(`update private.practice_grading_settings set cpu_ms_limit=3600000,billing_period_start=now()-interval '30 days',billing_period_end=now()-interval '1 second'`)
await fails(claim(others[2]),/grading_unavailable/)
await fails(submit(4),/grading_unavailable/)
await role()
eq((await q('select runtime_digest from public.practice_variants where id=$1',[variant.id])).runtime_digest,null)
eq((await q('select expected_tests from private.practice_bundles where variant_id=$1',[variant.id])).expected_tests,0)
eq((await q('select count(*)::int as n from public.practice_sessions')).n,5)
// A lease cannot be renewed or finalized after expiry, and only three claims run.
await db.exec(`update private.practice_grading_settings set billing_period_start=now()-interval '1 day',billing_period_end=now()+interval '29 days'`)
let exhausted=await claim(others[2])
for (let generation=1;generation<=3;generation++) {
  eq(exhausted.lease_generation,generation)
  await role()
  await db.query("update private.practice_jobs set lease_until=now()-interval '1 second',claim_deadline_at=now()-interval '1 second' where id=$1",[exhausted.job_id])
  await role('practice_worker')
  eq((await q('select private.renew_practice_job($1,$2,$3) as ok',[exhausted.job_id,exhausted.lease_token,generation])).ok,false)
  await fails(finish(exhausted),/stale_lease/)
  exhausted=await claim(others[2])
}
eq(exhausted,null)
await role()
eq((await q('select status,error_kind from public.practice_attempts where id=$1',[others[2]])),{status:'error',error_kind:'infrastructure'})
// Seed historical completed attempts to isolate the daily cap from the minute cap.
await db.query(`insert into public.practice_attempts(user_id,session_id,variant_id,release_id,idempotency_key,
 draft_revision,source,source_sha256,runtime_digest,bundle_sha256,assistance,expected_tests,status,verdict,passed_tests,submitted_at,finished_at)
 select $1,$2,variant_id,release_id,gen_random_uuid(),0,source,source_sha256,runtime_digest,bundle_sha256,'none',expected_tests,
 'graded','fail',0,now()-interval '1 hour',now()-interval '1 hour' from public.practice_attempts cross join generate_series(1,10) where id=$3`,[users[4],sessions[4],a])
await fails(submit(4),/submission_limit/)
await role()
// Model a globally full queue with distinct real owners/session foreign keys.
for (let i=0;i<20;i++) {
  const user=randomUUID()
  await db.query('insert into auth.users values($1)',[user])
  const session=(await q('select private.start_practice($1,$2) as id',[user,variant.id])).id
  const attempt=(await q(`insert into public.practice_attempts(user_id,session_id,variant_id,release_id,idempotency_key,
   draft_revision,source,source_sha256,runtime_digest,bundle_sha256,assistance,expected_tests)
   select $1,$2,variant_id,release_id,gen_random_uuid(),0,source,source_sha256,runtime_digest,bundle_sha256,'none',expected_tests
   from public.practice_attempts where id=$3 returning id`,[user,session,a])).id
  await db.query('insert into private.practice_jobs(attempt_id) values($1)',[attempt])
}
await fails(submit(2),/submission_limit/)
await fails(db.exec('select * from private.practice_due_attempts()'),/permission denied/)
await role('practice_worker')
eq((await q('select count(*)::int as n from private.practice_due_attempts()')).n,20)
// SQL007 private ledger stays immutable and inaccessible through application roles.
await role()
eq((await q("select relrowsecurity as enabled from pg_class where oid='private.practice_grading_reservations'::regclass")).enabled,true)
eq((await q("select count(*)::int as n from pg_constraint where conrelid='private.practice_grading_reservations'::regclass and contype='f'")).n,0)
await fails(db.exec('update private.practice_grading_reservations set reserved_cpu_ms=0'),/grading_reservation_is_immutable/)
await fails(db.exec('delete from private.practice_grading_reservations'),/grading_reservation_is_immutable/)
for(const name of ['anon','authenticated','service_role','practice_api','practice_worker']) {
  await role(name)
  for(const sql of ['select * from private.practice_grading_reservations',
    'insert into private.practice_grading_reservations default values',
    'update private.practice_grading_reservations set reserved_cpu_ms=0',
    'delete from private.practice_grading_reservations','truncate private.practice_grading_reservations']) {
    await fails(db.exec(sql),/permission denied/)
  }
}
await role()
const beforeDelete=await q('select count(*)::int as rows,sum(reserved_cpu_ms)::text as cpu,sum(reserved_creations)::int as n from private.practice_grading_reservations')
await db.query('delete from auth.users where id=$1',[users[0]])
eq(await q('select count(*)::int as rows,sum(reserved_cpu_ms)::text as cpu,sum(reserved_creations)::int as n from private.practice_grading_reservations'),beforeDelete)
eq((await q('select count(*)::int as n from private.practice_jobs where id=$1',[first.job_id])).n,0)
const fresh = new PGlite()
await fresh.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
for (const file of ['202610120001_practice.sql','202610120002_practice_rpc.sql','202610120003_anchor_content.sql',
  '202610130004_progress_sync.sql','202610130005_learning_language.sql','202610130006_grading_manifests.sql']) {
  await fresh.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url),'utf8'))
}

const migration=readFileSync(new URL('../migrations/202610160007_continuous_grading.sql',import.meta.url),'utf8')
await fresh.exec("update private.practice_grading_settings set enabled=true,billing_period_start=now()-interval '1 day',billing_period_end=now()+interval '29 days',reserved_cpu_ms=720000,reserved_creations=24")
const start=(await fresh.query('select billing_period_start::text as start from private.practice_grading_settings')).rows[0].start
await fresh.exec(migration)
eq((await fresh.query("select enabled,billing_period_start::text as start,billing_period_end='infinity'::timestamptz as infinite,reserved_cpu_ms::text as cpu,reserved_creations as n from private.practice_grading_settings")).rows[0],{enabled:true,start,infinite:true,cpu:'720000',n:24})
eq((await fresh.query("select count(*)::int as n,min(reserved_cpu_ms)::text as cpu,min(reserved_creations) as creations,bool_and(job_id is null and lease_generation is null) as baseline,bool_and(expires_at=created_at+interval '31 days 210 seconds') as expiry from private.practice_grading_reservations")).rows[0],{n:1,cpu:'720000',creations:24,baseline:true,expiry:true})
await fresh.close()
const historic = new PGlite()
await historic.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
for (const file of ['202610120001_practice.sql','202610120002_practice_rpc.sql','202610120003_anchor_content.sql',
  '202610130004_progress_sync.sql','202610130005_learning_language.sql','202610130006_grading_manifests.sql']) {
  await historic.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url),'utf8'))
}

await historic.exec(migration)
eq((await historic.query('select enabled from private.practice_grading_settings')).rows[0].enabled,false)
eq((await historic.query('select count(*)::int as n from private.practice_grading_reservations')).rows[0].n,0)
await historic.exec("insert into private.practice_grading_reservations(reserved_cpu_ms,reserved_creations,created_at,expires_at) values(4000000,1100,now()-interval '33 days',now()-interval '1 day'); update private.practice_grading_settings set enabled=true,reserved_cpu_ms=4000000,reserved_creations=1100")
const hv=(await historic.query("select * from public.practice_variants where language='python' limit 1")).rows[0]
await historic.query('insert into private.practice_grading_manifests(variant_id,manifest_sha256,edition,runtime_digest,expected_tests,grading_tests,runner_spec) values($1,$2,1,$3,2,$4,$5)',[hv.id,m1.manifest_sha256,m1.runtime_digest,JSON.stringify(m1.grading_tests),JSON.stringify({...m1.runner_spec,entrypoint:hv.entrypoint})])
const hu=randomUUID(); await historic.query('insert into auth.users values($1)',[hu])
const hs=(await historic.query('select private.start_practice($1,$2) as id',[hu,hv.id])).rows[0].id
await historic.exec('set role practice_api')
const ha=(await historic.query('select private.submit_practice($1,$2,$3,0) as id',[hu,hs,randomUUID()])).rows[0].id
await historic.exec('reset role; set role practice_worker')
const hj=(await historic.query('select private.claim_practice_job($1) as job',[ha])).rows[0].job
await historic.exec('reset role')
eq(hj.lease_generation,1)
eq((await historic.query('select reserved_cpu_ms::text as cpu,reserved_creations as n from private.practice_grading_settings')).rows[0],{cpu:'4060000',n:1102})
eq((await historic.query("select expires_at=j.claim_deadline_at+interval '31 days' as exact from private.practice_grading_reservations r join private.practice_jobs j on j.id=r.job_id where r.job_id=$1",[hj.job_id])).rows[0].exact,true)
await fails(historic.exec('update private.practice_grading_settings set reserved_cpu_ms=-1'),/check constraint/)
await fails(historic.exec('update private.practice_grading_settings set reserved_creations=-1'),/check constraint/)
await fails(historic.exec('update private.practice_grading_settings set cpu_ms_limit=3600001'),/check constraint/)
await fails(historic.exec('update private.practice_grading_settings set creations_limit=1001'),/check constraint/)
await historic.close()
console.log(JSON.stringify({status:'PASS',checks,scope:'SQL007 continuous ledger/cutover/fresh-off/expired-admission/lifetime/no-delete-refund plus SQL006 PGlite manifests/roles/RLS/pinning/assistance/progress/idempotence/fencing/leases/budgets; not hosted or concurrent connections',timestamp:new Date().toISOString()}))
await db.close()
