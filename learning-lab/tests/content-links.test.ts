import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { concepts } from '../src/concepts.ts';

// ConceptLink deliberately has a readable fallback. Broken authored links must
// nevertheless fail validation instead of silently removing the learning path.
test('literal concept links in lessons resolve to an actual explanation', () => {
  const ids = new Set(concepts.map(concept => concept.id));
  const source = new URL('../src/', import.meta.url);
  let checked = 0;
  for (const file of readdirSync(source).filter(name => name.endsWith('.tsx'))) {
    const content = readFileSync(new URL(file, source), 'utf8');
    for (const match of content.matchAll(/<ConceptLink\b[^>]*\bconcept=["']([^"']+)["']/g)) {
      assert.ok(ids.has(match[1]), `${file}: missing concept ${match[1]}`);
      checked++;
    }
  }
  assert.ok(checked >= 15, 'Core lessons must expose contextual mathematical links');
});

test('authored lesson hash links have a registered destination', () => {
  const source = new URL('../src/', import.meta.url);
  const app = readFileSync(new URL('App.tsx', source), 'utf8');
  const registry = app.match(/const lessons = \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(registry, 'Could not inspect the lesson registry');
  const routes = new Set([...registry.matchAll(/\bid: '([^']+)'/g)].map(match => match[1]));
  for (const file of readdirSync(source).filter(name => name.endsWith('.tsx'))) {
    const content = readFileSync(new URL(file, source), 'utf8');
    for (const match of content.matchAll(/href=["']#([a-z-]+)["']/g)) {
      if (match[1] === 'content') continue; // The skip link targets the main element.
      assert.ok(routes.has(match[1]), `${file}: missing lesson #${match[1]}`);
    }
  }
});
