import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { concepts, conceptSources, getConcept } from '../src/concepts.ts';
import { curriculum, curriculumGroups, studyRoutes, topicsForRoute } from '../src/curriculum.ts';
import { MAX_CONCEPT_DEPTH } from '../src/learning-navigation.ts';

test('required concepts exist and every advertised page has real content and an attributed source', () => {
  const required = ['function', 'slope', 'limit', 'derivative', 'partial-derivative', 'gradient', 'chain-rule', 'vector', 'matrix', 'dot-product', 'probability', 'exponential', 'logarithm', 'softmax', 'normalization', 'loss', 'cross-entropy', 'learning-rate', 'backpropagation'];
  required.forEach(id => assert.ok(getConcept(id), `Missing ${id}`));
  assert.equal(new Set(concepts.map(c => c.id)).size, concepts.length);
  for (const concept of concepts) {
    for (const field of ['idea', 'example', 'observe', 'formal', 'limits'] as const) {
      assert.ok(concept[field].length > 40, `${concept.id}.${field} is empty or only a stub`);
    }
    assert.ok(conceptSources[concept.source]?.url.startsWith('https://'), `Missing source: ${concept.id}`);
    concept.prerequisites.forEach(id => assert.ok(getConcept(id), `Broken prerequisite ${concept.id} → ${id}`));
  }
});

test('prerequisite graph has no cycles and includes gradient → derivative → function', () => {
  function visit(id: string, ancestors: Set<string>) {
    assert.ok(!ancestors.has(id), `Cycle at ${id}`);
    const next = new Set(ancestors).add(id);
    getConcept(id)!.prerequisites.forEach(prerequisite => visit(prerequisite, next));
  }
  concepts.forEach(concept => visit(concept.id, new Set()));
  assert.ok(getConcept('gradient')!.prerequisites.includes('derivative'));
  assert.ok(getConcept('derivative')!.prerequisites.includes('function'));
  assert.ok(getConcept('derivative')!.prerequisites.includes('limit'));
});

test('every prerequisite chain fits the supported return stack', () => {
  function depth(id: string): number {
    return 1 + Math.max(0, ...getConcept(id)!.prerequisites.map(depth));
  }
  for (const concept of concepts) assert.ok(depth(concept.id) <= MAX_CONCEPT_DEPTH, `Unreachable deepest prerequisite of ${concept.id}`);
});

test('rendered experiment references and demo kinds resolve', () => {
  const source = readFileSync(new URL('../src/ConceptLesson.tsx', import.meta.url), 'utf8');
  for (const match of source.matchAll(/concept="([a-z-]+)"/g)) assert.ok(getConcept(match[1]), `Broken concept link ${match[1]}`);
  const demoKinds = new Set([...source.matchAll(/case '([a-z-]+)':/g)].map(match => match[1]));
  concepts.filter(concept => concept.demo).forEach(concept => assert.ok(demoKinds.has(concept.demo!), `Unimplemented demo: ${concept.id}`));
});

test('curriculum destinations are real, all levels are honest and routes are nonempty', () => {
  const lessons = new Set(['neuron', 'loss', 'backprop', 'optimizers', 'network', 'architectures', 'transformer', 'vae', 'gan', 'diffusion', 'gnn', 'rl']);
  const groups = new Set(curriculumGroups.map(group => group.id));
  assert.equal(new Set(curriculum.map(topic => topic.id)).size, curriculum.length);
  for (const topic of curriculum) {
    assert.ok(groups.has(topic.group));
    assert.ok(topic.summary.length > 40 && topic.example.length > 40 && topic.limit.length > 40, `Thin topic ${topic.id}`);
    topic.concepts.forEach(id => assert.ok(getConcept(id), `${topic.id} links to missing ${id}`));
    if (topic.lesson) assert.ok(lessons.has(topic.lesson), `Unknown lesson ${topic.lesson}`);
    if (topic.coverage === 'interactive') assert.ok(topic.lesson || topic.concepts.some(id => getConcept(id)!.demo), `No experiment for ${topic.id}`);
    if (topic.coverage === 'next') assert.ok(topic.source?.url.startsWith('https://'), `No continuation for ${topic.id}`);
  }
  for (const route of studyRoutes) assert.ok(topicsForRoute(route.id).length > 0, `Empty route ${route.id}`);
  for (const group of groups) assert.ok(curriculum.some(topic => topic.group === group), `Empty group ${group}`);
});

test('remaining directions are marked as continuations and implemented chapters have destinations', () => {
  for (const id of ['text-representations', 'transfer']) {
    const topic = curriculum.find(item => item.id === id);
    assert.equal(topic?.coverage, 'next', id);
    assert.ok(topic?.source?.title);
  }
  for (const [id, lesson] of [['residual', 'transformer'], ['autoencoder-vae', 'vae'], ['gan', 'gan'], ['diffusion', 'diffusion'], ['gnn', 'gnn'], ['rl', 'rl']]) {
    const topic = curriculum.find(item => item.id === id);
    assert.equal(topic?.coverage, 'interactive');
    assert.equal(topic?.lesson, lesson);
    assert.ok(topic?.source?.title);
  }
});
