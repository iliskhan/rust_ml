import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionTrace, temperatureSoftmax, projectTokens, rope, sinusoidalPosition, dotProduct, normalizationTrace, residualFfn, groupedAttention, kvGroupForHead, HEAD_INPUT, kvCacheBytes, cachedAttentionStep, fullCausalAttention, samplingDistribution, sampleToken, toyLanguageForward } from '../src/transformerMath.ts';

const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≉ ${expected}`);
const closeRows = (actual: number[][], expected: number[][]) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((row, i) => {
    assert.equal(row.length, expected[i].length);
    row.forEach((value, j) => close(value, expected[i][j]));
  });
};

test('projection uses X[n,in] W[in,out], not the transpose', () => {
  assert.deepEqual(projectTokens([[2, 3]], [[1, 4], [2, 5]]), [[8, 23]]);
  assert.throws(() => projectTokens([[1, 2]], [[1]]), RangeError);
});
test('attention: known average, scaled dot products and row sums', () => {
  const trace = attentionTrace([[0, 0], [1, 0]], [[1, 0], [0, 1]], [[2, -1], [6, 3]]);
  assert.deepEqual(trace.output[0], [4, 1]);
  close(trace.scaledScores[1][0], 1 / Math.sqrt(2));
  close(trace.weights[1][0], Math.exp(1 / Math.sqrt(2)) / (Math.exp(1 / Math.sqrt(2)) + 1));
  trace.weights.forEach(row => close(row.reduce((sum, x) => sum + x, 0), 1));
});
test('causal and padding masks are exact, including cached query offsets', () => {
  const q = [[1, 0], [0, 1], [1, 1]];
  const trace = attentionTrace(q, q, q, { causal: true, allowedKeys: [true, true, false] });
  assert.deepEqual(trace.weights[0], [1, 0, 0]);
  assert.equal(trace.weights[1][2], 0);
  assert.equal(trace.weights[2][2], 0);
  closeRows(attentionTrace([q[2]], q, q, { causal: true, queryOffset: 2 }).output, [attentionTrace(q, q, q, { causal: true }).output[2]]);
  assert.throws(() => attentionTrace(q, q, q, { allowedKeys: [false, false, false] }), RangeError);
});
test('softmax handles large logits, masks, temperature and additive shifts', () => {
  closeRows([temperatureSoftmax([10000, 10001, -Infinity])], [temperatureSoftmax([0, 1, -Infinity])]);
  assert.equal(temperatureSoftmax([0, -Infinity])[1], 0);
  assert.ok(temperatureSoftmax([0, 2], 0.5)[1] > temperatureSoftmax([0, 2], 2)[1]);
  assert.throws(() => temperatureSoftmax([-Infinity, -Infinity]), RangeError);
  assert.throws(() => temperatureSoftmax([1, 2], 0), RangeError);
  assert.throws(() => temperatureSoftmax([NaN]), RangeError);
});
test('RoPE preserves norm and depends on relative position at fixed q/k', () => {
  const q = [1, 2, 3, -1], k = [-2, 1, 0.5, 3];
  close(dotProduct(rope(q, 7), rope(q, 7)), dotProduct(q, q));
  close(dotProduct(rope(q, 3), rope(k, 7)), dotProduct(rope(q, 103), rope(k, 107)));
  close(dotProduct(rope(q, 3), rope(k, 7)), dotProduct(q, rope(k, 4)));
  closeRows([rope([1, 0], Math.PI / 2)], [[0, 1]]);
  assert.deepEqual(sinusoidalPosition(0, 4), [0, 1, 0, 1]);
  close(sinusoidalPosition(100, 4)[2], Math.sin(1));
  assert.throws(() => rope([1, 2, 3], 0), RangeError);
});
test('LayerNorm centers; RMSNorm keeps mean, and norm placement changes the block', () => {
  const input = [1, 2, 3, 4];
  const ln = normalizationTrace(input, 'layer');
  const rms = normalizationTrace(input, 'rms');
  close(ln.mean, 2.5); close(ln.meanSquare, 1.25);
  close(ln.output.reduce((sum, x) => sum + x, 0), 0);
  close(rms.output[0], 1 / Math.sqrt(7.5 + 1e-5));
  closeRows([normalizationTrace(input.map(x => x + 10), 'layer').output], [ln.output]);
  assert.notDeepEqual(normalizationTrace(input.map(x => x + 10), 'rms').output, rms.output);
  assert.deepEqual(normalizationTrace([5, 5, 5, 5], 'layer').output, [0, 0, 0, 0]);
  const pre = residualFfn(input, 'layer', 'pre');
  const post = residualFfn(input, 'layer', 'post');
  closeRows([pre.output], [pre.ffn.output.map((x, i) => x + input[i])]);
  closeRows([post.output], [normalizationTrace(post.sum, 'layer').output]);
  assert.notDeepEqual(pre.output, post.output);
});
test('GQA shares K/V within groups, keeping four independent query heads', () => {
  assert.deepEqual([0, 1, 2, 3].map(h => kvGroupForHead(h, 4, 2)), [0, 0, 1, 1]);
  for (const count of [1, 2, 4] as const) {
    const trace = groupedAttention(HEAD_INPUT, count);
    assert.equal(trace.heads.length, 4);
    assert.equal(trace.keys.length, count);
    assert.equal(trace.concatenated[0].length, 8);
    assert.equal(trace.output[0].length, 4);
    trace.heads.forEach(head => assert.strictEqual(head.k, trace.keys[head.group]));
    trace.heads.forEach(head => head.weights.forEach(row => close(row.reduce((sum, x) => sum + x, 0), 1)));
    assert.notDeepEqual(trace.heads[0].q, trace.heads[1].q);
  }
  const gqa = groupedAttention(HEAD_INPUT, 2);
  assert.strictEqual(gqa.heads[0].v, gqa.heads[1].v);
  assert.notDeepEqual(gqa.heads[0].weights[2], gqa.heads[1].weights[2]);
  assert.throws(() => kvGroupForHead(0, 4, 3), RangeError);
  assert.equal(kvCacheBytes(4096, 32, 8, 128), 536870912);
});
test('cached attention equals full causal attention at every prefix, with or without RoPE', () => {
  const input = [[1, 0], [0, 1], [1, 1], [-1, 0.5], [0.2, -0.7]];
  for (const rotary of [true, false]) {
    let cache = { keys: [] as number[][], values: [] as number[][] };
    input.forEach((row, i) => {
      const oldKeys = structuredClone(cache.keys);
      const step = cachedAttentionStep(row, cache, rotary);
      const full = fullCausalAttention(input.slice(0, i + 1), rotary);
      closeRows([step.output], [full.output[i]]);
      closeRows(step.cache.keys, full.k);
      closeRows(cache.keys, oldKeys);
      cache = step.cache;
    });
  }
});
test('sampling implements temperature then top-k then normalized top-p', () => {
  const logits = [Math.log(0.5), Math.log(0.3), Math.log(0.2)];
  const distribution = samplingDistribution(logits, 1, 3, 0.7);
  assert.deepEqual(distribution.kept, [0, 1]);
  closeRows([distribution.filtered], [[0.625, 0.375, 0]]);
  assert.deepEqual(samplingDistribution(logits, 1, 1, 1).filtered, [1, 0, 0]);
  assert.deepEqual(samplingDistribution(logits, 1, 2, 0.6).kept, [0]);
  assert.equal(sampleToken([0, 0.25, 0.75], 0), 1);
  assert.equal(sampleToken([0, 0.25, 0.75], 0.25), 2);
  assert.equal(sampleToken([0, 0.25, 0.75], 0.999), 2);
  assert.throws(() => sampleToken([0.5, 0.5], 1), RangeError);
});
test('teacher-forced parallel logits equal sequential prefix logits, with no future leakage', () => {
  const ids = [0, 1, 2, 4];
  const parallel = toyLanguageForward(ids);
  ids.forEach((_, i) => closeRows([parallel.logits[i]], [toyLanguageForward(ids.slice(0, i + 1)).logits[i]]));
  closeRows(parallel.logits.slice(0, 2), toyLanguageForward([0, 1, 3, 5]).logits.slice(0, 2));
  parallel.probabilities.forEach(row => close(row.reduce((sum, p) => sum + p, 0), 1));
});
