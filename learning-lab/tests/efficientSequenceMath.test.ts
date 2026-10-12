import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionFixture, fullAttentionReference, tiledAttention, mlaTrace, selectiveSsm, memoryTokens, memoryStep, memoryComparison } from '../src/efficientSequenceMath.ts';
const close = (a: number, b: number, eps = 1e-10) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('online attention equals independent full softmax for tiles, masks and sharp logits', () => {
  for (const n of [2, 7, 13]) for (const size of [1, 3, 8]) for (const causal of [false, true]) for (const scale of [0, 1, 100]) {
    const { q, k, v } = attentionFixture(n, scale);
    const reference = fullAttentionReference(q, k, v, causal), actual = tiledAttention(q, k, v, size, causal);
    actual.output.forEach((r, i) => r.forEach((x, j) => close(x, reference.output[i][j])));
    assert.ok(actual.trace.every(t => t.normalizer >= 1 && Number.isFinite(t.max)));
  }
});
test('uniform attention computes known prefix averages; large shared logits stay finite', () => {
  const q = [[1000], [1000], [1000]], k = [[1000], [1000], [1000]], v = [[2, 0], [4, 3], [12, 6]];
  const out = tiledAttention(q, k, v, 2);
  assert.deepEqual(out.output, [[2, 0], [3, 1.5], [6, 3]]);
  close(out.trace.at(-1)!.normalizer, 3);
  assert.equal(out.storage.fullScores, 9); assert.equal(out.storage.online, 6);
});
test('causal attention cannot see altered future values and trace ends at row', () => {
  const { q, k, v } = attentionFixture(8), baseline = tiledAttention(q, k, v, 3, true, 2);
  v[7] = [1e6, -1e6, 1e6]; k[7] = [1e4, 1e4, 1e4];
  assert.deepEqual(tiledAttention(q, k, v, 3).output[2], baseline.output[2]);
  assert.equal(baseline.trace.at(-1)!.end, 3);
  assert.throws(() => tiledAttention(q, k, v, 0), RangeError);
  assert.throws(() => tiledAttention([[NaN]], [[1]], [[2]], 1), RangeError);
});
test('MLA absorption is exact for this factorization, respects causality and cache count', () => {
  for (const scale of [0, .3, 2]) for (const position of [0, 2, 7]) {
    const trace = mlaTrace(8, position, scale);
    trace.heads.forEach(h => { h.output.forEach((x, j) => close(x, h.absorbedOutput[j])); close(h.weights.reduce((a, b) => a + b), 1); assert.ok(h.weights.slice(position + 1).every(x => x === 0)); });
    assert.equal(trace.cache.latentScalars, (position + 1) * 4);
    assert.equal(trace.cache.expandedScalars, (position + 1) * 12);
    if (scale === 0) assert.ok(trace.heads.every(h => h.output.every(x => x === 0)));
  }
  assert.throws(() => mlaTrace(3, 3), RangeError);
});
test('SSM zero-order hold matches closed-form response to constant input', () => {
  const tokens = Array.from({ length: 8 }, () => ({ input: 1, key: [1, 0, 0], value: [1, 0, 0] }));
  const states = selectiveSsm(tokens, .4, 0);
  states.forEach((s, t) => [-.3, -.8, -1.4].forEach((a, j) => close(s.state[j], Math.expm1((t + 1) * .4 * a) / a * [1, .5, -.4][j])));
  const impulse = selectiveSsm(memoryTokens('impulse'), .5, 0);
  for (let t = 1; t < impulse.length; t++) impulse[t].state.forEach((x, j) => close(x, impulse[t - 1].state[j] * Math.exp([-.3, -.8, -1.4][j] * .5)));
  assert.notDeepEqual(selectiveSsm(tokens, .4, 1), states);
});
test('gated delta overwrites one key exactly and preserves orthogonal memory', () => {
  const old = [[4, 7, 2], [-2, 3, 8], [1, 2, 3]], key = [1, 0, 0], value = [9, 5, -1];
  const step = memoryStep(old, key, value, 1, 1, true);
  assert.deepEqual(step.state, [[9, 7, 2], [5, 3, 8], [-1, 2, 3]]);
  assert.deepEqual(step.output, value);
  assert.deepEqual(memoryStep(old, key, value, 0, 1, true).state, [[9, 0, 0], [5, 0, 0], [-1, 0, 0]]);
  assert.deepEqual(memoryStep(old, key, value, .5, 0, true).state, old.map(r => r.map(x => x / 2)));
  assert.deepEqual(old, [[4, 7, 2], [-2, 3, 8], [1, 2, 3]]);
});
test('delta residual is read after decay; additive SSD and hybrid are distinct', () => {
  close(memoryStep([[4]], [1], [10], .5, .5, true).output[0], 6);
  close(memoryStep([[4]], [1], [10], .5, .5, false).output[0], 12);
  const trace = memoryComparison(memoryTokens('rewrite'), 1, 1, 0);
  trace.forEach(s => s.hybrid.forEach((x, j) => close(x, .5 * s.delta.output[j] + .5 * s.attention[j])));
  assert.notDeepEqual(trace.at(-1)!.ssd.output, trace.at(-1)!.delta.output);
  assert.throws(() => memoryStep([[1]], [2], [1], 1, 1, true), RangeError);
});
