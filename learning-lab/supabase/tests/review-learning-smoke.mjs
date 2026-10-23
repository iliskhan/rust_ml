import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Local disposable PostgreSQL only. Pass the installed PGlite module path.
const { PGlite }=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new PGlite();
try{
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  for(const file of ['202610120001_practice.sql','202610120002_practice_rpc.sql','202610120003_anchor_content.sql',
    '202610130004_progress_sync.sql','202610130005_learning_language.sql','202610130006_grading_manifests.sql',
    '202610160007_continuous_grading.sql','202610230008_review_grading.sql']){
    await db.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  }
  const q=async(sql,params=[])=> (await db.query(sql,params)).rows;
  const user=randomUUID(),other=randomUUID();
  await q('insert into auth.users values($1),($2)',[user,other]);
  for(const key of ['concept.gaussian','unit.architecture.bptt'])for(const suffix of ['guided','transfer-a']){
    const [variant]=await q(`select v.* from public.practice_variants v join public.practice_exercises e on e.id=v.exercise_id
      where e.exercise_key=$1 and v.language='python'`,[key+'.'+suffix]);
    const [started]=await q('select private.start_practice($1,$2) as id',[user,variant.id]);
    await q('select private.save_practice_draft($1,$2,0,$3,$4)',[user,started.id,'historical learner source','editor']);
    const assistance=key==='concept.gaussian'&&suffix==='guided'?'solution':'none';
    if(assistance==='solution')await q('select private.open_practice_help($1,$2,$3)',[user,started.id,'solution']);
    // Seed a historical terminal result without executing any learner source.
    await q(`insert into public.practice_attempts(user_id,session_id,variant_id,release_id,idempotency_key,draft_revision,
      source,source_sha256,runtime_digest,bundle_sha256,assistance,status,verdict,expected_tests,passed_tests,finished_at)
      values($1,$2,$3,$4,$5,1,'historical learner source',repeat('a',64),'sha256:'||repeat('b',64),repeat('c',64),$6,'graded','pass',1,1,now())`,
      [user,started.id,variant.id,variant.release_id,randomUUID(),assistance]);
    if(suffix==='guided')await q('select private.start_practice($1,$2)',[other,variant.id]);
  }
  const progress=async()=>q(`select t.topic_key,p.required_total::int as total,p.required_passed::int as passed,
    p.required_completed::int as completed,p.independent_required_passed::int as independent
    from public.practice_topic_progress p join public.practice_topics t on t.id=p.topic_id
    where p.user_id=$1 and p.language='python' and t.topic_key in ('concept.gaussian','unit.architecture.bptt') order by t.topic_key`,[user]);
  const complete=[{topic_key:'concept.gaussian',total:2,passed:2,completed:2,independent:1},
    {topic_key:'unit.architecture.bptt',total:2,passed:2,completed:2,independent:1}];
  assert.deepEqual(await progress(),complete);
  const snapshots=async()=>Object.fromEntries(await Promise.all(['practice_attempts','practice_drafts','practice_help_receipts','practice_enrollments','practice_sessions'].map(async table=>
    [table,(await q(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from public.${table} t`))[0].data])));
  const before=await snapshots();
  await db.exec(readFileSync(new URL('../migrations/202610230009_review_learning.sql',import.meta.url),'utf8'));
  const expected=[{...complete[0],completed:1,independent:0},complete[1]];
  assert.deepEqual(await progress(),expected);
  assert.deepEqual(await snapshots(),before,'all historical data must remain byte-for-byte equivalent');
  await db.exec('set role authenticated');
  await q("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  assert.deepEqual(await progress(),expected);
  assert.equal((await q('select count(*)::int as n from public.practice_attempts'))[0].n,4);
  await q("select set_config('request.jwt.claim.sub',$1,false)",[other]);
  assert.equal((await q('select count(*)::int as n from public.practice_attempts'))[0].n,0);
  assert.equal((await q('select sum(required_passed)::int as n from public.practice_topic_progress'))[0].n,0);
  console.log(JSON.stringify({migration:'009',repeatIndependent:false,rawPassesPreserved:true,otherTopicIndependent:true,historyPreserved:true,ownerRls:true}));
}finally{await db.close();}
