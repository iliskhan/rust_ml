import { writeFileSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { cachedAttentionStep, fullCausalAttention, SMALL_PROJECTIONS } from '../../src/transformerMath.ts';

// CACHE_INPUT belongs to the existing lesson, not to a second numeric model.
const lesson = readFileSync(new URL('../../src/TransformerCourse.tsx', import.meta.url), 'utf8');
const literal = lesson.match(/const CACHE_INPUT = (\[.*\]);/);
assert.ok(literal, 'The cache lesson must still declare its fixed input matrix.');
const input: number[][] = JSON.parse(literal[1]);
let cache: { keys: number[][]; values: number[][] } = { keys: [], values: [] };
const steps = input.map((row, position) => {
  const previous = cache;
  const cached = cachedAttentionStep(row, previous, true);
  const full = fullCausalAttention(input.slice(0, position + 1), true);
  const maxError = Math.max(...cached.output.map((x, d) => Math.abs(x - full.output[position][d])));
  assert.ok(maxError < 1e-12);
  assert.deepEqual(cached.cache.keys.slice(0, position), previous.keys);
  assert.deepEqual(cached.cache.values.slice(0, position), previous.values);
  cache = cached.cache;
  return { position, input: row, query: cached.attention.q[0],
    keys: cache.keys, values: cache.values, weights: cached.attention.weights[0],
    output: cached.output, fullOutput: full.output[position], maxError };
});
const fixture = { input, projections: SMALL_PROJECTIONS, rotary: true, causal: true,
  initialLength: 3, nextLength: 4, steps, duration: 50,
  chapters: [0, 8, 18, 26, 36, 46], predictionAt: 20.5, answerAt: 26 };
writeFileSync(new URL('./fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('Cache fixture: all six prefixes agree with full causal attention; previous K/V unchanged.');
