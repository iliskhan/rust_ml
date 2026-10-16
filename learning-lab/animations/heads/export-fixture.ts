import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { groupedAttention, HEAD_INPUT, OUTPUT_PROJECTION } from '../../src/transformerMath.ts';

const queryIndex = 2;
const modes = ([4, 2, 1] as const).map(kvHeads => {
  const trace = groupedAttention(HEAD_INPUT, kvHeads, true);
  assert.equal(trace.heads.length, 4);
  assert.equal(trace.concatenated[queryIndex].length, 8);
  assert.equal(trace.output[queryIndex].length, 4);
  trace.heads.forEach(h => assert.ok(Math.abs(h.weights[queryIndex].reduce((s, x) => s + x, 0) - 1) < 1e-12));
  return { kvHeads, groups: trace.heads.map(h => h.group),
    queries: trace.heads.map(h => h.q[queryIndex]), keys: trace.keys, values: trace.values,
    weights: trace.heads.map(h => h.weights[queryIndex]),
    headOutputs: trace.heads.map(h => h.output[queryIndex]),
    concatenated: trace.concatenated[queryIndex], output: trace.output[queryIndex] };
});
assert.deepEqual(modes[1].groups, [0, 0, 1, 1]);
assert.deepEqual(modes[2].groups, [0, 0, 0, 0]);
assert.notDeepEqual(modes[1].weights[0], modes[1].weights[1]);
const fixture = { input: HEAD_INPUT, outputProjection: OUTPUT_PROJECTION,
  queryIndex, causal: true, queryHeads: 4, headWidth: 2, modelWidth: 4,
  modes, duration: 50, chapters: [0, 8, 18, 26, 36, 46], predictionAt: 28, answerAt: 32 };
writeFileSync(new URL('./fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('Heads fixture: four Q heads, 4/2/1 KV groups, concatenation 8, projection 4.');
