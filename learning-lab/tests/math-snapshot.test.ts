import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMathSnapshot, copyMathSnapshot, type MathSnapshot } from '../src/mathSnapshot.ts';
import { attentionTrace } from '../src/transformerMath.ts';

const source = { origin: 'Урок', detail: 'Выбранный шаг' };
const dot = (inputs: number[], weights: number[], bias = 0): MathSnapshot => ({ ...source, kind: 'dot-product', inputs, weights, bias });
const softmax = (scores: number[], temperature = 1, mask?: boolean[]): MathSnapshot => ({ ...source, kind: 'softmax', scores, temperature, mask });
function near(actual: number, expected: number, tolerance = 1e-13) {
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test('dot snapshot separates each product, bias and activation with known results', () => {
  assert.deepEqual(analyzeMathSnapshot(dot([2, -3, .25], [.5, 2, 4], .75)), {
    kind: 'dot-product', terms: [1, -6, 1], sum: -4, z: -3.25, output: -3.25,
  });
  const inputs = { ...source, kind: 'dot-product' as const, inputs: [1, 2], weights: [.8, -.4], bias: .5 };
  for (const activation of ['relu', 'sigmoid', 'tanh'] as const) {
    const result = analyzeMathSnapshot({ ...inputs, activation });
    assert.equal(result.kind, 'dot-product');
    if (result.kind !== 'dot-product') return;
    near(result.output, activation === 'relu' ? .5 : activation === 'sigmoid' ? 1 / (1 + Math.exp(-.5)) : Math.tanh(.5));
  }
});

test('softmax honors temperature and ignores the masked maximum', () => {
  for (const snapshot of [softmax([Math.log(3), 0]), softmax([Math.log(9), 0], 2), softmax([Math.log(3), 1000, 0], 1, [true, false, true])]) {
    const result = analyzeMathSnapshot(snapshot);
    assert.equal(result.kind, 'softmax');
    if (result.kind !== 'softmax') return;
    near(result.probabilities[0], .75);
    near(result.probabilities.at(-1)!, .25);
    if (result.probabilities.length === 3) {
      assert.equal(result.probabilities[1], 0);
      assert.equal(result.shifted[1], null);
      assert.equal(result.exponentials[1], 0);
    }
  }
});

test('bias-first snapshot reproduces the source neuron accumulation order', () => {
  const values = { ...source, kind: 'dot-product' as const, inputs: [1e16, -1e16], weights: [1, 1], bias: 1 };
  const sumThenBias = analyzeMathSnapshot(values);
  const biasThenSum = analyzeMathSnapshot({ ...values, accumulation: 'bias-first' });
  assert.equal(sumThenBias.kind, 'dot-product');
  assert.equal(biasThenSum.kind, 'dot-product');
  if (sumThenBias.kind !== 'dot-product' || biasThenSum.kind !== 'dot-product') return;
  assert.equal(sumThenBias.z, 1);
  assert.equal(biasThenSum.sum, 0);
  assert.equal(biasThenSum.z, 0);
});

test('softmax snapshot uses exact attention scores, selected row and combined mask', () => {
  for (const causal of [false, true]) for (const scale of [false, true]) for (const temperature of [.2, 1, 2.7]) {
    const trace = attentionTrace([[1 / 3, .4], [.2, -.7], [1, 2]], [[.3, -1], [1.1, 2], [-1, -.1]], [[0], [1], [2]], { causal, scale, temperature, allowedKeys: [true, false, true] });
    for (let query = 0; query < 3; query++) {
      const result = analyzeMathSnapshot(softmax(trace.scaledScores[query], temperature, trace.scores[query].map(Number.isFinite)));
      assert.equal(result.kind, 'softmax');
      if (result.kind !== 'softmax') return;
      assert.deepEqual(result.probabilities, trace.weights[query]);
    }
  }
});

test('softmax shift invariance and extreme finite inputs remain numerically meaningful', () => {
  for (const [scores, temperature, expected] of [
    [[2, 1], .5, [1 / (1 + Math.exp(-2)), 1 / (1 + Math.exp(2))]],
    [[10002, 10001], .5, [1 / (1 + Math.exp(-2)), 1 / (1 + Math.exp(2))]],
    [[1e308, 1e308], .01, [.5, .5]],
    [[Number.MAX_VALUE, -Number.MAX_VALUE], Number.MAX_VALUE, [1 / (1 + Math.exp(-2)), 1 / (1 + Math.exp(2))]],
    [[Number.MAX_VALUE, -Number.MAX_VALUE], Number.MIN_VALUE, [1, 0]],
  ] as [number[], number, number[]][]) {
    const result = analyzeMathSnapshot(softmax(scores, temperature));
    assert.equal(result.kind, 'softmax');
    if (result.kind !== 'softmax') return;
    result.probabilities.forEach((value, index) => near(value, expected[index]));
    result.probabilities.forEach((value, index) => assert.equal(value, result.exponentials[index] / result.denominator));
    near(result.probabilities.reduce((a, b) => a + b, 0), 1);
  }
});

test('sparse vectors and masks are rejected instead of producing NaN or permitted keys', () => {
  const sparseScores = [1, , 0] as number[];
  const sparseMask = [true, , false] as boolean[];
  for (const snapshot of [softmax(sparseScores), softmax([1, 2, 3], 1, sparseMask), dot(sparseScores, [1, 2, 3])]) {
    assert.throws(() => copyMathSnapshot(snapshot), RangeError);
  }
});

test('captured source arrays are detached, frozen and never rounded', () => {
  const inputs = [1 / 3, -.12345678912345678], weights = [.7, -.6];
  const captured = copyMathSnapshot(dot(inputs, weights, .12345678912345678));
  assert.equal(captured.kind, 'dot-product');
  if (captured.kind !== 'dot-product') return;
  assert.equal(captured.inputs[0], 1 / 3);
  inputs[0] = 9; weights[0] = 8;
  assert.equal(captured.inputs[0], 1 / 3);
  assert.equal(captured.weights[0], .7);
  assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.inputs) && Object.isFrozen(captured.weights));
  const scores = [1 / 3, .7], mask = [true, false];
  const probabilities = copyMathSnapshot(softmax(scores, .123456789, mask));
  assert.equal(probabilities.kind, 'softmax');
  if (probabilities.kind !== 'softmax') return;
  scores[0] = 9; mask[0] = false;
  assert.equal(probabilities.scores[0], 1 / 3);
  assert.equal(probabilities.temperature, .123456789);
  assert.deepEqual(probabilities.mask, [true, false]);
  assert.ok(Object.isFrozen(probabilities.scores) && Object.isFrozen(probabilities.mask));
});

test('invalid dimensions, numbers, temperature and all-masked rows are rejected', () => {
  for (const snapshot of [dot([], []), dot([1], [1, 2]), dot([NaN], [1]), dot([1], [Infinity]), dot([1], [1], Infinity),
    dot([Number.MAX_VALUE], [2]), dot([Number.MAX_VALUE, Number.MAX_VALUE], [1, 1]),
    softmax([]), softmax([Infinity]), softmax([-Infinity, 1]), softmax([NaN]), softmax([1], 0), softmax([1], -1), softmax([1], Infinity),
    softmax([1, 2], 1, [true]), softmax([1, 2], 1, [false, false]), { ...dot([1], [1]), origin: '' },
  ]) assert.throws(() => copyMathSnapshot(snapshot), RangeError);
});
