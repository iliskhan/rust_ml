import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { practiceTopics } from '../src/practice/all-catalog.ts';
import { practiceChapterIds, practiceChapter } from '../src/practice/placement.ts';
import { concepts } from '../src/concepts.ts';

const inventory=JSON.parse(readFileSync(new URL('../docs/practice-topic-inventory.json',import.meta.url),'utf8'));
test('published practice covers every original unit with exact semantic ID; all exercise IDs and scope references unique',()=>{
  const topicIds=practiceTopics.map(t=>t.id),exerciseIds=practiceTopics.flatMap(t=>t.exercises.map(e=>e.id));
  assert.equal(new Set(topicIds).size,topicIds.length);assert.equal(new Set(exerciseIds).size,exerciseIds.length);
  for(const unit of inventory.units){
    const topic=practiceTopics.find(t=>t.id===unit.id);assert.ok(topic,unit.id);assert.equal(topic.lessonId,unit.route.slice(1));
    assert.ok(topic.exercises.some(e=>e.mode==='guided'),unit.id);assert.ok(topic.exercises.some(e=>e.id.endsWith('.transfer-a')),unit.id);assert.ok(topic.exercises.some(e=>e.id.endsWith('.transfer-b')),unit.id);
    assert.ok(topic.exercises.every(e=>e.topicId===unit.id&&e.fixtures.length>0),unit.id);
  }
});
test('every mathematical concept has its own guided and two transfer practices in the math catalogue',()=>{
  for(const concept of concepts){
    const topic=practiceTopics.find(t=>t.id===`concept.${concept.id}`);
    assert.ok(topic,concept.id);assert.equal(topic.lessonId,'math');
    assert.ok(topic.exercises.some(e=>e.mode==='guided'),concept.id);
    assert.ok(topic.exercises.some(e=>e.id.endsWith('.transfer-a')),concept.id);
    assert.ok(topic.exercises.some(e=>e.id.endsWith('.transfer-b')),concept.id);
  }
});
test('chapter locators remain exactly the inventory order; indices never replace stored semantic IDs',()=>{
  for(const [route,ids]of Object.entries(practiceChapterIds)){
    assert.deepEqual(ids,inventory.units.filter((u:{route:string})=>u.route==='#'+route).map((u:{id:string})=>u.id));
    ids.forEach((id,i)=>assert.equal(practiceChapter(route,i),id));
    assert.equal(practiceChapter(route,ids.length),undefined);
  }
  for(const [file,route,index]of [['TransformerCourse','transformer','chapter'],['AdvancedArchitecturesCourse','advanced','chapter'],['FrontierCourse','frontiers','chapter'],['VAECourse','vae','chapter'],['GANCourse','gan','chapter'],['DiffusionCourse','diffusion','chapter'],['GNNCourse','gnn','section'],['RLCourse','rl','section']]){
    const source=readFileSync(new URL(`../src/${file}.tsx`,import.meta.url),'utf8');
    assert.ok(source.includes(`practiceChapter('${route}', ${index})`),file);
  }
});
