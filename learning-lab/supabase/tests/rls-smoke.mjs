import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { practiceTopics, practiceRelease } from '../../src/practice/all-catalog.ts'
import { createHash } from 'node:crypto'
// Usage: node learning-lab/supabase/tests/rls-smoke.mjs /path/to/@electric-sql/pglite/dist/index.js
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href)
const db = new PGlite()
let checks = 0
async function one(sql) { return (await db.query(sql)).rows[0] }
async function fails(sql, pattern) { await assert.rejects(db.exec(sql), pattern); checks++ }
const catalogExercises = practiceTopics.flatMap(t => t.exercises)
const expectedVariants = catalogExercises.length * 3
const root = new URL('../', import.meta.url)
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;`)
for (const file of readdirSync(new URL('migrations/', root)).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(new URL(`migrations/${file}`, root), 'utf8'))
  console.log(`Applied ${file}`)
}
// Compare the executed seed with every authored variant, not a fixed anchor count.
const seededTopics = (await db.query('select t.topic_key from public.practice_topics t join public.practice_releases r on r.id=t.release_id where r.release_key=$1 order by topic_key', [practiceRelease])).rows
assert.deepEqual(seededTopics.map(t=>t.topic_key), practiceTopics.map(t=>t.id).sort()); checks++
const seededVariants = (await db.query(`select v.id,v.language,v.starter_code,v.public_tests,v.runtime_digest,e.exercise_key,
 b.hints,b.reference_solution,b.explanation,b.bundle_sha256,b.grading_tests,b.expected_tests,b.runner_spec
 from public.practice_variants v join public.practice_exercises e on e.id=v.exercise_id
 join public.practice_releases r on r.id=v.release_id join private.practice_bundles b on b.variant_id=v.id
 where r.release_key=$1 order by e.exercise_key,v.language`, [practiceRelease])).rows
assert.equal(seededVariants.length, expectedVariants); checks++
const exerciseById = new Map(catalogExercises.map(e=>[e.id,e]))
for (const variant of seededVariants) {
  const e=exerciseById.get(variant.exercise_key)
  assert.ok(e, 'Unknown seeded exercise '+variant.exercise_key)
  assert.equal(variant.starter_code,e.starter[variant.language]); checks++
  // Seed JSON serialization normalizes numeric -0 to 0; compare that serialized representation.
  assert.deepEqual(variant.public_tests,JSON.parse(JSON.stringify(e.fixtures.map(f=>({input:JSON.parse(f.input),output:JSON.parse(f.output)}))))); checks++
  assert.deepEqual(variant.hints,e.hints); checks++
  assert.equal(variant.reference_solution,e.solution[variant.language]); checks++
  assert.equal(variant.explanation,e.explanation); checks++
  assert.equal(variant.runtime_digest,null); checks++
  assert.equal(variant.expected_tests,0); checks++
  assert.deepEqual(variant.grading_tests,[]); checks++
  assert.equal(variant.runner_spec.enabled,false); checks++
  // Rebuild the canonical author-help manifest; this digest is not a runner digest.
  const spec={enabled:false,reason:'isolated_runner_not_verified',artifact_kind:'authored_help_only',language:variant.language,entrypoint:variant.runner_spec.entrypoint}
  const manifest={grading_tests:[],runner_spec:spec,hints:e.hints,reference_solution:e.solution[variant.language],explanation:e.explanation}
  assert.equal(variant.bundle_sha256,createHash('sha256').update(JSON.stringify(manifest)).digest('hex')); checks++
}
const catalogCounts = await one(`select (select count(*)::int from public.practice_topics) as topics,
 (select count(*)::int from public.practice_requirements) as requirements,
 (select count(*)::int from public.practice_exercises) as exercises,
 (select count(*)::int from public.practice_variants) as variants`)
assert.equal(catalogCounts.exercises,catalogExercises.length); checks++
const requirementRows=(await db.query(`select q.requirement_key,q.required,q.completion_rule,
 array_agg(e.exercise_key order by e.exercise_key) as exercises
 from public.practice_requirements q join public.practice_exercises e on e.requirement_id=q.id
 group by q.id order by q.requirement_key`)).rows
const expectedGroups=new Map()
for(const topic of practiceTopics) for(const e of topic.exercises) {
  const paired=e.mode==='transfer' && /\.transfer-[ab]$/.test(e.id)
    && topic.exercises.some(other=>other.id===e.id.replace(/([ab])$/,e.id.endsWith('a')?'b':'a') && other.mode==='transfer')
  const key=paired?e.id.replace(/\.transfer-[ab]$/,':transfer'):e.id
  const group=expectedGroups.get(key)??{requirement_key:key,required:e.mode==='guided'||paired,completion_rule:paired?'independent':'pass',exercises:[]}
  group.exercises.push(e.id); expectedGroups.set(key,group)
}
const expectedRequirements=[...expectedGroups.values()].map(g=>({...g,exercises:g.exercises.sort()})).sort((a,b)=>a.requirement_key < b.requirement_key ? -1 : a.requirement_key > b.requirement_key ? 1 : 0)
assert.deepEqual(requirementRows,expectedRequirements); checks++
assert.equal(catalogCounts.requirements,expectedGroups.size); checks++
const u1 = '10000000-0000-4000-8000-000000000001', u2 = '10000000-0000-4000-8000-000000000002'
const release = '20000000-0000-4000-8000-000000000001'
await db.exec(`insert into auth.users values ('${u1}'),('${u2}');
insert into public.practice_releases(id,version,title) values ('${release}',9999,'Smoke only');
insert into public.practice_topics(id,release_id,topic_key,title,lesson_anchor,position) values ('30000000-0000-4000-8000-000000000001','${release}','smoke','Smoke','#smoke',0);
insert into public.practice_requirements(id,topic_id,release_id,requirement_key,position,completion_rule) values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','${release}','guided',0,'pass');
insert into public.practice_exercises(id,topic_id,release_id,requirement_id,exercise_key,position,objective,prompt_markdown) values ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','${release}','40000000-0000-4000-8000-000000000001','smoke.guided',0,'Smoke','Smoke');
insert into public.practice_variants(exercise_id,release_id,language,starter_code,entrypoint,public_tests,runtime_digest)
select '50000000-0000-4000-8000-000000000001','${release}',lang,'TODO','f','[]',null from unnest(array['python','javascript','rust']) lang;
insert into private.practice_bundles(variant_id,release_id,bundle_sha256,grading_tests,expected_tests,runner_spec,hints,reference_solution)
select id,release_id,repeat('a',64),'[]',0,'{"enabled":false}',array['Hint'], 'Private solution' from public.practice_variants where release_id='${release}';
select private.publish_practice_release('${release}');`)
const variant = (await db.query(`select id from public.practice_variants where release_id='${release}' and language='javascript'`)).rows[0].id
async function asUser(id) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${id}';`) }
await asUser(u1)
const s1 = (await one(`select public.practice_start('${variant}') as id`)).id
assert.equal((await one(`select public.practice_start('${variant}') as id`)).id, s1); checks++
assert.equal((await one(`select public.practice_save_draft('${s1}',0,'mine','editor') as revision`)).revision, 1); checks++
await fails(`select public.practice_save_draft('${s1}',0,'stale','editor')`, /draft_conflict/)
await fails(`select public.practice_save_draft('${s1}',1,repeat('a',65537),'editor')`, /check constraint/)
assert.equal((await one(`select public.practice_open_help('${s1}','hint:1') as hint`)).hint, 'Hint'); checks++
await db.exec(`select public.practice_open_help('${s1}','hint:1')`)
assert.equal((await one('select count(*)::int as n from public.practice_help_receipts')).n, 1); checks++
await fails(`select public.practice_open_help('${s1}','hint:99')`, /help_not_found/)
await db.exec(`select public.practice_open_help('${s1}','explanation')`);
assert.equal((await one("select count(*)::int as n from public.practice_help_receipts where help_key='explanation'")).n,1); checks++
await fails(`update public.practice_drafts set source='bypass'`, /permission denied/)
await fails(`delete from public.practice_help_receipts`, /permission denied/)
await fails(`insert into public.practice_attempts(id) values(gen_random_uuid())`, /permission denied/)
await fails(`select * from private.practice_bundles`, /permission denied/)
await fails(`select private.start_practice('${u2}','${variant}')`, /permission denied/)
await fails(`select private.claim_practice_job()`, /permission denied/)
await fails(`select public.practice_submit('${s1}',gen_random_uuid(),1)`, /grading_unavailable/)
await asUser(u2)
assert.equal((await one('select count(*)::int as n from public.practice_sessions')).n, 0); checks++
assert.equal((await one('select count(*)::int as n from public.practice_drafts')).n, 0); checks++
assert.equal((await one('select count(*)::int as n from public.practice_help_receipts')).n, 0); checks++
assert.equal((await one('select count(*)::int as n from public.practice_topic_progress')).n, 0); checks++
await fails(`select public.practice_save_draft('${s1}',1,'stolen','editor')`, /draft_conflict/)
await fails(`select public.practice_open_help('${s1}','solution')`, /session_not_found/)
const s2 = (await one(`select public.practice_start('${variant}') as id`)).id
assert.notEqual(s1, s2); checks++
assert.equal((await one(`select count(*)::int as n from public.practice_topic_progress where user_id <> '${u2}'`)).n, 0); checks++
assert.equal((await one(`select sum(required_completed)::int as n from public.practice_topic_progress`)).n, 0); checks++
await db.exec(`reset role; set role anon; set request.jwt.claim.sub = '';`)
assert.ok((await one('select count(*)::int as n from public.practice_releases')).n > 0); checks++
await fails('select * from public.practice_drafts', /permission denied/)
await fails(`select public.practice_start('${variant}')`, /permission denied/)
await asUser('')
await fails(`select public.practice_start('${variant}')`, /unauthenticated/)
await db.exec('reset role')
await fails(`update public.practice_releases set title='changed' where id='${release}'`, /published_release_is_immutable/)
await fails(`update public.practice_variants set starter_code='changed' where release_id='${release}'`, /published_release_is_immutable/)
await fails(`update private.practice_bundles set reference_solution='changed' where release_id='${release}'`, /published_release_is_immutable/)
await db.exec(`set role practice_api`)
await fails(`select private.submit_practice('${u1}','${s1}',gen_random_uuid(),1)`, /grading_unavailable/)
await db.exec('reset role')
assert.equal((await one('select count(*)::int as n from public.practice_attempts')).n, 0); checks++
// Exercise a real authored variant beyond the first page of the catalogue.
const lastVariant=seededVariants.at(-1)
assert.ok(lastVariant)
await asUser(u1)
const realSession=(await one(`select public.practice_start('${lastVariant.id}') as id`)).id
assert.equal((await one(`select source from public.practice_drafts where session_id='${realSession}'`)).source,lastVariant.starter_code); checks++
assert.equal((await one(`select public.practice_open_help('${realSession}','solution') as answer`)).answer,lastVariant.reference_solution); checks++
assert.equal((await one(`select sum(required_completed)::int as n from public.practice_topic_progress`)).n,0); checks++
await asUser(u2)
assert.equal((await one(`select count(*)::int as n from public.practice_sessions where id='${realSession}'`)).n,0); checks++
await fails(`select public.practice_open_help('${realSession}','solution')`,/session_not_found/)
await db.exec('reset role')
const evidence={
  timestamp_utc:new Date().toISOString(), timezone:'Europe/Moscow',
  checkout:process.cwd(), revision:execFileSync('git',['-c',`safe.directory=${process.cwd().replaceAll('\\','/')}`,'rev-parse','HEAD'],{encoding:'utf8'}).trim(), working_tree:true,
  node:process.version, engine:(await one('select version()')).version,
  command:'node learning-lab/supabase/tests/rls-smoke.mjs work/backend-smoke/node_modules/@electric-sql/pglite/dist/index.js learning-lab/supabase/tests/rls-smoke-result.json',
  release:practiceRelease,catalog:catalogCounts,
  requirements:{required:requirementRows.filter(r=>r.required).length,independent:requirementRows.filter(r=>r.completion_rule==='independent').length,pass:requirementRows.filter(r=>r.completion_rule==='pass').length},
  public_fixtures:catalogExercises.reduce((n,e)=>n+e.fixtures.length,0),
  migration_sha256:Object.fromEntries(readdirSync(new URL('migrations/',root)).filter(f=>f.endsWith('.sql')).sort().map(f=>[f,createHash('sha256').update(readFileSync(new URL(`migrations/${f}`,root))).digest('hex')])),
  checks,result:'PASS',
  verified:['fresh schema migrations','complete catalog/requirement mapping','every variant starter/public fixture/help/bundle digest','two-owner RLS and CAS','immutable published release/content/private bundles','disabled grading and zero attempts'],
  boundary:'PostgreSQL WASM; auth.uid stub; hosted JWT/Auth/PostgREST, provider redirects and concurrent multi-process locks not tested'
}
if(process.argv[3])writeFileSync(resolve(process.argv[3]),JSON.stringify(evidence,null,2)+'\n')
console.log(JSON.stringify(evidence))
await db.close()
