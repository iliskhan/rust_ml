import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { practiceTopics, practiceRelease } from '../src/practice/all-catalog.ts';

const repeated=practiceTopics.filter(topic=>topic.exercises.some(exercise=>exercise.evidenceScope==='repeat'));
const bank=(exercise:typeof practiceTopics[number]['exercises'][number])=>exercise.fixtures.map(f=>f.input).sort();
const quote=(value:string)=>`'${value.replaceAll("'","''")}'`;

test('review #10 preserves known banks and marks every repeated scope honestly',()=>{
  assert.equal(repeated.length,47);
  for(const topic of repeated)for(const exercise of topic.exercises){
    assert.equal(exercise.evidenceScope,'repeat',exercise.id);
    assert.deepEqual(bank(exercise),bank(topic.exercises[0]),exercise.id);
  }
  const sql=readFileSync(new URL('../supabase/migrations/202610230009_review_learning.sql',import.meta.url),'utf8');
  const keys=[...sql.matchAll(/^  \('([^']+)'\)/gm)].map(match=>match[1]);
  assert.deepEqual(keys.sort(),repeated.map(topic=>topic.id).sort());
  assert.ok(sql.includes(`r.release_key = '${practiceRelease}' and rt.topic_key is not null`));
  assert.match(sql,/bool_or\(coalesce\(a\.independent, false\)[\s\S]*?and not \(r\.release_key/);
  assert.match(sql,/bool_or\(coalesce\(a\.passed, false\)\) as passed/);
  assert.match(sql,/security_invoker = true/);
  assert.doesNotMatch(sql,/\b(update|delete|truncate|drop|alter)\b/i);
});

test('metadata corrections retain every immutable published statement, starter and fixture contract',()=>{
  const seed=readFileSync(new URL('../supabase/migrations/202610120003_anchor_content.sql',import.meta.url),'utf8');
  for(const topic of practiceTopics)for(const exercise of topic.exercises){
    assert.ok(seed.includes(`${quote(exercise.id)},`),exercise.id);
    assert.ok(seed.includes(`${quote(exercise.title)},${quote(exercise.prompt+'\n\n'+exercise.formula)}`),exercise.id+' published statement');
    const tests=JSON.stringify(exercise.fixtures.map(f=>({input:JSON.parse(f.input),output:JSON.parse(f.output)})));
    for(const language of ['python','javascript','rust'] as const){
      assert.ok(seed.includes(quote(exercise.starter[language])),exercise.id+'/'+language+' starter');
      assert.ok(seed.includes(quote(tests)),exercise.id+'/'+language+' fixtures');
    }
  }
});

test('seed generation refuses to publish known repetition as independent and preserves published history',()=>{
  const seed=new URL('../supabase/migrations/202610120003_anchor_content.sql',import.meta.url);
  const before=readFileSync(seed,'utf8');
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../supabase/generate-seed.mjs',import.meta.url))],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Repeated examples cannot publish independent transfer/);
  assert.equal(readFileSync(seed,'utf8'),before);
});
