import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
// node learning-lab/supabase/tests/progress-sync-smoke.mjs work/backend-smoke/node_modules/@electric-sql/pglite/dist/index.js [result.json]
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href)
const db = new PGlite()
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
for (const file of ['202610120001_practice.sql','202610120002_practice_rpc.sql','202610120003_anchor_content.sql','202610130004_progress_sync.sql']) await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url),'utf8'))
const one = async sql => (await db.query(sql)).rows[0]
const u1 = '10000000-0000-4000-8000-000000000001', u2 = '10000000-0000-4000-8000-000000000002'
const u3 = '10000000-0000-4000-8000-000000000003', u4 = '10000000-0000-4000-8000-000000000004'
const release = (await one("select id from public.practice_releases where status='published' limit 1")).id
const exercise = (await one(`select exercise_key from public.practice_exercises where release_id='${release}' limit 1`)).exercise_key
await db.exec(`insert into auth.users values ('${u1}'),('${u2}'),('${u3}'),('${u4}')`)
// An event committed before SQL005 must be reconciled during migration, without a session.
await db.query(`insert into public.practice_learning_events(user_id,release_id,event_id,language,kind,occurred_at,payload)
 values($1,$2,'a0000000-0000-4000-8000-000000000001','rust','language','2000-01-01','{}')`,[u3,release])
await db.exec(readFileSync(new URL('../migrations/202610130005_learning_language.sql',import.meta.url),'utf8'))
const asUser = async id => db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}'`)
const event = (id, changes={}) => ({ event_id: id, exercise_key: exercise, language:'python', kind:'quiz', occurred_at: new Date().toISOString(), payload:{answer:1,correct:true,draftRevision:0}, ...changes })
let checks = 0
const sync = async (events, after=0) => (await db.query('select * from public.practice_sync_learning($1,$2,$3)', [release,JSON.stringify(events),after])).rows
const fails = async (action, pattern) => { await assert.rejects(action,pattern); checks++ }
await asUser(u1)
const original = event('60000000-0000-4000-8000-000000000001')
const first = await sync([original]); assert.equal(first.length,1); checks++
assert.equal((await sync([original]))[0].sequence,first[0].sequence); checks++
await fails(sync([{...original,payload:{answer:0,correct:false,draftRevision:0}}]),/learning_event_conflict/)
await fails(sync([{...event('60000000-0000-4000-8000-000000000002'),user_id:u2}]),/invalid_learning_event/)
await fails(sync([event('60000000-0000-4000-8000-000000000003',{payload:{answer:1,correct:true,draftRevision:0,passed:true}})]),/invalid_quiz_event/)
await fails(sync([event('60000000-0000-4000-8000-000000000004',{exercise_key:'nonexistent'})]),/exercise_unavailable/)
await fails(sync([event('60000000-0000-4000-8000-000000000005',{payload:{answer:1.1,correct:true,draftRevision:0}})]),/invalid_quiz_event/)
await fails(db.exec('update public.practice_learning_events set payload=\'{}\''),/permission denied/)
await fails(db.exec('delete from public.practice_learning_events'),/permission denied/)
await fails(db.exec(`insert into public.practice_learning_events(user_id,release_id,event_id,language,kind,occurred_at,payload) values('${u1}','${release}',gen_random_uuid(),'python','language',now(),'{}')`),/permission denied/)
assert.equal((await one('select count(*)::int as n from public.practice_attempts')).n,0); checks++
assert.equal((await one('select count(*)::int as n from public.practice_sessions')).n,0); checks++
await asUser(u2)
assert.equal((await one('select count(*)::int as n from public.practice_learning_events')).n,0); checks++
assert.deepEqual(await sync([]),[]); checks++
await sync([original]); assert.equal((await one('select count(*)::int as n from public.practice_learning_events')).n,1); checks++
await db.exec('reset role; set role anon')
await fails(sync([]),/permission denied/)
await asUser(u1)
await db.exec("set request.jwt.claim.sub=''")
await fails(sync([]),/authentication_required/)
await asUser(u1)
// Two pages retain commit order; the next incremental read does not replay earlier sequences.
const batch = Array.from({length:500},(_,i)=>event(`70000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`))
const page1 = await sync(batch); assert.equal(page1.length,500); checks++
const page2 = await sync([],page1.at(-1).sequence); assert.equal(page2.length,1); checks++
assert.deepEqual(await sync([],page2.at(-1).sequence),[]); checks++
await fails(sync(Array.from({length:501},(_,i)=>event(`80000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`))),/learning_batch_too_large/)
// Populate the bounded allowance as migration owner; retries at the limit remain free.
await db.exec('reset role')
await db.exec(`insert into public.practice_learning_events(user_id,release_id,event_id,exercise_key,language,kind,occurred_at,payload)
 select '${u1}','${release}',gen_random_uuid(),'${exercise}','python','activity',now(),'{}' from generate_series(1,2499)`)
await asUser(u1)
await sync([original]); checks++
await fails(sync([event('90000000-0000-4000-8000-000000000001')]),/learning_rate_limit/)
await db.exec('reset role')
await db.exec(`insert into public.practice_learning_events(user_id,release_id,event_id,exercise_key,language,kind,occurred_at,payload,received_at)
 select '${u1}','${release}',gen_random_uuid(),'${exercise}','python','activity',now(),'{}',now()-interval '2 minutes' from generate_series(1,97000)`)
await asUser(u1)
await sync([original]); checks++
await fails(sync([event('90000000-0000-4000-8000-000000000002')]),/learning_storage_limit/)
await asUser(u3)
assert.equal((await one('select preferred_language from public.practice_profiles')).preferred_language,'rust'); checks++
assert.equal((await one('select primary_language from public.practice_enrollments')).primary_language,'rust'); checks++
await asUser(u4)
assert.equal((await one('select count(*)::int as n from public.practice_profiles')).n,0); checks++
const languageEvent = (suffix,language,occurred_at) => event(`b0000000-0000-4000-8000-${suffix.padStart(12,'0')}`,{exercise_key:null,kind:'language',language,occurred_at,payload:{}})
const newer = languageEvent('2','rust','2002-01-01T00:00:00.000Z')
const older = languageEvent('1','javascript','2001-01-01T00:00:00.000Z')
await sync([newer,older])
assert.equal((await one('select preferred_language from public.practice_profiles')).preferred_language,'rust'); checks++
assert.equal((await one('select primary_language from public.practice_enrollments')).primary_language,'rust'); checks++
const tied = languageEvent('3','python',newer.occurred_at)
await sync([tied]); await sync([older,newer,tied])
assert.equal((await one('select primary_language from public.practice_enrollments')).primary_language,'python'); checks++
assert.equal((await one('select count(*)::int as n from public.practice_learning_events')).n,3); checks++
await fails(db.exec('update public.practice_enrollments set primary_language=\'rust\''),/permission denied/)
await fails(db.exec('select private.reconcile_practice_learning_language()'),/permission denied/)
assert.equal((await one(`select count(*)::int as n from public.practice_profiles where user_id='${u3}'`)).n,0); checks++

await db.exec('reset role')
const release2 = '20000000-0000-4000-8000-000000000002'
await db.exec(`insert into public.practice_releases(id,release_key,version,title,status,published_at)
 values('${release2}','language-sync-test',2,'Language sync fixture','published',now())`)
await asUser(u4)
const otherRelease = languageEvent('4','javascript','2003-01-01T00:00:00.000Z')
await db.query('select * from public.practice_sync_learning($1,$2,0)',[release2,JSON.stringify([otherRelease])])
await sync([languageEvent('5','rust','2002-06-01T00:00:00.000Z')])
assert.equal((await one('select preferred_language from public.practice_profiles')).preferred_language,'javascript'); checks++
assert.equal((await one(`select primary_language from public.practice_enrollments where release_id='${release}'`)).primary_language,'rust'); checks++
assert.equal((await one(`select primary_language from public.practice_enrollments where release_id='${release2}'`)).primary_language,'javascript'); checks++
await db.query('select public.practice_choose_language($1,$2)',[release,'python'])
assert.equal((await one('select preferred_language from public.practice_profiles')).preferred_language,'python'); checks++
assert.equal((await one(`select primary_language from public.practice_enrollments where release_id='${release}'`)).primary_language,'python'); checks++
assert.equal((await one('select count(*)::int as n from public.practice_learning_events')).n,6); checks++
await fails(db.query('select public.practice_choose_language($1,$2)',[release,'go']),/invalid_learning_event/)
await fails(db.query('select public.practice_choose_language($1,$2)',[null,'rust']),/release_unavailable/)
await db.exec('reset role; set role anon')
await fails(db.query('select public.practice_choose_language($1,$2)',[release,'rust']),/permission denied/)
await asUser(u4); await db.exec("set request.jwt.claim.sub=''")
await fails(db.query('select public.practice_choose_language($1,$2)',[release,'rust']),/unauthenticated/)
await db.exec('reset role')
for (const table of ['practice_sessions','practice_drafts','practice_attempts']) {
  assert.equal((await one(`select count(*)::int as n from public.${table}`)).n,0); checks++
}
assert.equal((await one('select coalesce(sum(required_completed),0)::int as n from public.practice_topic_progress')).n,0); checks++
const result = { status:'PASS', checks, scope:'PGlite SQL004/005 owner/RLS/replay/schema/500-page/quota/language-LWW/backfill/no-grading; not hosted Supabase or concurrent connections', timestamp:new Date().toISOString() }
if (process.argv[3]) writeFileSync(resolve(process.argv[3]),JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
await db.close()
