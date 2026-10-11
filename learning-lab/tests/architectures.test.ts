import test from 'node:test';
import assert from 'node:assert/strict';
import { denseForward, conv2d, pool2d, rnnForward, lstmForward, gruForward, scaledAttention, layerNorm, transformerForward } from '../src/architectures.ts';

const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const constant = (b: number) => ({ wx: 0, wh: 0, b });

test('Dense preserves the orientation of weights and applies bias before activation', () => {
  const layers = [{ weights: [[2, -1], [-3, 2]], bias: [0.5, -1] }, { weights: [[0.5, -2]], bias: [1] }];
  const trace = denseForward([1, 2], layers, 'relu');
  assert.deepEqual(trace[0].z, [0.5, 0]);
  assert.deepEqual(trace[1].output, [1.25]);
  assert.deepEqual(denseForward([1, 2], [{ weights: [[-1, 0]], bias: [0] }], 'relu')[0].output, [0]);
});

test('Conv2D uses cross-correlation and sums channels; padding, dilation and stride affect shape', () => {
  const image = [[[1, 2, 3], [4, 5, 6], [7, 8, 9]]];
  const kernel = [[[[1, 0], [0, -1]]]];
  const basic = conv2d(image, kernel, { stride: 1, padding: 0, dilation: 1 });
  assert.deepEqual(basic.output, [[[-4, -4], [-4, -4]]]);
  const dilated = conv2d(image, kernel, { stride: 1, padding: 0, dilation: 2 });
  assert.deepEqual(dilated.output, [[[-8]]]);
  const multi = conv2d([image[0], image[0]], [[kernel[0][0], kernel[0][0]]], { stride: 2, padding: 1, dilation: 1, bias: [1] });
  assert.deepEqual([multi.height, multi.width], [2, 2]);
  assert.deepEqual(multi.output, [[[-1, -5], [-13, -7]]]);
});

test('Pooling selects complete windows, preserving max and average semantics', () => {
  const input = [[-2, 4, 8], [2, 0, 9], [100, 100, 100]];
  assert.deepEqual(pool2d(input, 2, 'max'), [[4]]);
  assert.deepEqual(pool2d(input, 2, 'average'), [[1]]);
  assert.deepEqual(pool2d([[1]], 2, 'max'), []);
});

test('RNN reuses its previous state; zero recurrent weight removes history', () => {
  const trace = rnnForward([1, 0], { wx: 1, wh: 1, b: 0 });
  close(trace[0].h, 0.7615941559557649);
  close(trace[1].h, 0.6420149920119997);
  assert.equal(rnnForward([2, 0], { wx: 1, wh: 0, b: 0 })[1].h, 0);
  assert.equal(trace[1].previous, trace[0].h);
});

test('LSTM independently retains cell state, writes candidate and exposes gated tanh', () => {
  // sigmoid(0)=1/2 and tanh(atanh(1/2))=1/2: c = .5*2 + .5*.5 = 1.25.
  const weights = { forget: constant(0), input: constant(0), output: constant(0), candidate: constant(Math.atanh(0.5)) };
  const step = lstmForward([999], weights, { c: 2, h: -3 })[0];
  close(step.retained, 1);
  close(step.written, 0.25);
  close(step.c, 1.25);
  close(step.h, 0.42414181997875644);
  const mostlyKeep = lstmForward([0], { ...weights, forget: constant(20), input: constant(-20) }, { c: 2, h: 0 })[0];
  close(mostlyKeep.c, 2, 1e-8);
});

test('GRU update gate means retention; reset acts before the candidate transform', () => {
  const weights = { reset: constant(0), update: constant(0), candidate: { wx: 0, wh: 2, b: 0 } };
  // r=.5, previous=.5 => candidate=tanh(.5), update blends old and candidate equally.
  const step = gruForward([0], weights, 0.5)[0];
  close(step.candidate, 0.46211715726000974);
  close(step.h, 0.4810585786300049);
  close(gruForward([0], { ...weights, update: constant(30) }, 0.5)[0].h, 0.5, 1e-10);
  close(gruForward([0], { ...weights, reset: constant(-30), update: constant(-30) }, 0.5)[0].h, 0, 1e-10);
});

test('Attention uniform scores average values; causal mask excludes future positions', () => {
  const q = [[0, 0], [0, 0]], k = [[1, 2], [3, 4]], v = [[2, 4], [6, 8]];
  const full = scaledAttention(q, k, v);
  assert.deepEqual(full.weights, [[0.5, 0.5], [0.5, 0.5]]);
  assert.deepEqual(full.output, [[4, 6], [4, 6]]);
  const masked = scaledAttention(q, k, v, true);
  assert.deepEqual(masked.weights, [[1, 0], [0.5, 0.5]]);
  assert.deepEqual(masked.output, [[2, 4], [4, 6]]);
  const scaled = scaledAttention([[2, 0]], [[1, 0], [0, 1]], [[1], [0]]);
  close(scaled.scores[0][0], Math.SQRT2);
  close(scaled.weights[0].reduce((a, b) => a + b, 0), 1);
});

test('LayerNorm has zero mean and unit variance within epsilon; constant features stay finite', () => {
  const normalized = layerNorm([1, 2, 3, 4]);
  close(normalized.reduce((a, b) => a + b, 0), 0);
  close(normalized.reduce((sum, x) => sum + x * x, 0) / 4, 1, 1e-5);
  assert.deepEqual(layerNorm([3, 3, 3, 3]), [0, 0, 0, 0]);
});

test('Transformer has finite normalized outputs and 1/2 proper attention heads', () => {
  for (const mode of ['encoder', 'decoder', 'encoder-decoder'] as const) for (const heads of [1, 2] as const) {
    const result = transformerForward({ tokens: [0.6, -0.4, 1], source: [1.2, 0.2, -0.8], mode, heads, positionScale: 1 });
    assert.equal(result.self.heads.length, heads);
    assert.equal(result.output.length, 3);
    for (const row of result.output) {
      assert.equal(row.length, 4);
      assert.ok(row.every(Number.isFinite));
      close(row.reduce((a, b) => a + b, 0), 0);
    }
    for (const head of result.self.heads) for (const [i, weights] of head.weights.entries()) {
      close(weights.reduce((a, b) => a + b, 0), 1);
      if (mode !== 'encoder') assert.ok(weights.slice(i + 1).every(x => x === 0));
    }
  }
});

test('Causal decoder cannot see a changed future token; cross-attention responds to source', () => {
  const settings = { tokens: [0.6, -0.4, 1], source: [1.2, 0.2, -0.8], heads: 2 as const, positionScale: 1 };
  const before = transformerForward({ ...settings, mode: 'decoder' });
  const after = transformerForward({ ...settings, tokens: [0.6, -0.4, -2], mode: 'decoder' });
  assert.deepEqual(before.output[0], after.output[0]);
  assert.deepEqual(before.output[1], after.output[1]);
  assert.notDeepEqual(before.output[2], after.output[2]);
  const crossBefore = transformerForward({ ...settings, mode: 'encoder-decoder' });
  const crossAfter = transformerForward({ ...settings, source: [-1.8, 0.2, -0.8], mode: 'encoder-decoder' });
  assert.deepEqual(crossBefore.self, crossAfter.self);
  assert.notDeepEqual(crossBefore.cross?.output, crossAfter.cross?.output);
  assert.notDeepEqual(crossBefore.output, crossAfter.output);
});
