import test from 'node:test';
import assert from 'node:assert/strict';
import { bernoulli, chainSquare, crossEntropyLogits, descent1D, dotProduct, finiteDifference, linear, normalize, quadratic, regressionErrors, regressionPrediction, regressionTrain, secant, sharedGraph, stableSoftmax } from '../src/conceptMath.ts';

function near(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Number.isFinite(actual), `Expected finite result, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test('secant approaches derivative from both sides and tangent predicts only a local change', () => {
  for (const x of [-2, 0, .7, 2]) {
    for (const h of [-.1, -.001, .001, .1]) {
      const result = secant(x, h);
      near(result.slope, (result.nextY - result.y) / h, 1e-10);
      near(result.slope - result.derivative, h);
      near(result.nextY - (result.y + result.derivative * h), h * h);
    }
  }
  assert.throws(() => secant(2, 0), RangeError);
});

test('gradient matches finite differences and directional derivative on an anisotropic surface', () => {
  for (const point of [[2, 1], [-1.7, .3], [0, 0]]) {
    const actual = quadratic(point).grad;
    const numerical = finiteDifference(p => quadratic(p).loss, point);
    actual.forEach((g, i) => near(g, numerical[i], 1e-8));
    const u = [Math.cos(.7), Math.sin(.7)], h = 1e-5;
    const plus = point.map((v, i) => v + h * u[i]), minus = point.map((v, i) => v - h * u[i]);
    near(dotProduct(actual, u).value, (quadratic(plus).loss - quadratic(minus).loss) / (2 * h), 1e-8);
  }
  near(quadratic([2, 1]).loss, 6);
  near(quadratic([1.8, .2]).loss, 1.78);
});

test('chain and shared branches accumulate the derivative before continuing backward', () => {
  for (const [x, a] of [[1, 3], [-.3, -2], [0, 0]]) {
    near(chainSquare(x, a).derivative, finiteDifference(([v]) => chainSquare(v, a).y, [x])[0], 1e-8);
  }
  for (const [x, w, y] of [[1, .5, 1], [-.7, 1.2, -.4], [2, -.3, .6]]) {
    const graph = sharedGraph(x, w, y);
    near(graph.gradients.q, graph.qContributions.square + graph.qContributions.identity);
    const numerical = finiteDifference(([v]) => sharedGraph(x, v, y).values.loss, [w])[0];
    near(graph.gradients.w, numerical, 1e-8);
  }
});

test('linear algebra examples have explicit independent expected results and shape errors', () => {
  assert.deepEqual(dotProduct([2, 1], [1, -1]), { terms: [2, -1], value: 1 });
  assert.deepEqual(linear([[2, 1]], [[1, 2], [-1, 1]], [0, 0]), [[4, -1]]);
  assert.throws(() => dotProduct([1], [1, 2]), RangeError);
  assert.throws(() => dotProduct([], []), RangeError);
});

test('softmax stays normalized after a large common shift and sharp temperature', () => {
  for (const temperature of [.1, 1, 3]) {
    const base = stableSoftmax([2, 1, 0], temperature);
    const shifted = stableSoftmax([1002, 1001, 1000], temperature);
    base.forEach((p, i) => near(p, shifted[i], 1e-12));
    near(base.reduce((a, b) => a + b, 0), 1);
    assert.ok(base.every(p => p >= 0 && p <= 1));
  }
  stableSoftmax([1e308, 1e308, 1e308], .1).forEach(p => near(p, 1 / 3));
  assert.throws(() => stableSoftmax([], 1), RangeError);
  assert.throws(() => stableSoftmax([1, 2], 0), RangeError);
});

test('cross entropy from logits remains finite when target probability underflows to zero', () => {
  const result = crossEntropyLogits([1000, -1000], 1);
  near(result.loss, 2000);
  assert.deepEqual(result.probabilities, [1, 0]);
  assert.deepEqual(result.gradient, [1, -1]);
  near(crossEntropyLogits([1000, -1000], 0).loss, 0);
  near(crossEntropyLogits([0, 0, 0], 2).loss, Math.log(3));
  near(crossEntropyLogits([1002, 1001, 1000], 1).loss, crossEntropyLogits([2, 1, 0], 1).loss);
  assert.throws(() => crossEntropyLogits([1, 2], 2), RangeError);
});

test('cross entropy gradient agrees with finite differences, including temperature scaling', () => {
  const logits = [1.4, -.7, .2];
  for (const temperature of [.3, 1, 2]) {
    for (const target of [0, 1, 2]) {
      const analytical = crossEntropyLogits(logits.map(z => z / temperature), target).gradient.map(g => g / temperature);
      const numerical = finiteDifference(values => crossEntropyLogits(values.map(z => z / temperature), target).loss, logits);
      analytical.forEach((g, i) => near(g, numerical[i], 1e-8));
      near(analytical.reduce((a, b) => a + b, 0), 0);
    }
  }
});

test('Bernoulli entropy and moments include endpoints without NaN', () => {
  assert.deepEqual(bernoulli(0), { mean: 0, variance: 0, entropy: 0 });
  near(bernoulli(1).entropy, 0);
  near(bernoulli(.5).variance, .25);
  near(bernoulli(.5).entropy, Math.log(2));
  near(bernoulli(.7).entropy, bernoulli(.3).entropy);
  assert.throws(() => bernoulli(-.1), RangeError);
});

test('normalization removes common shift and safely handles zero variance', () => {
  const a = normalize([1, 2, 3]), b = normalize([6, 7, 8]);
  near(a.mean, 2); near(a.variance, 2 / 3);
  a.values.forEach((v, i) => near(v, b.values[i]));
  near(a.values.reduce((a, b) => a + b, 0), 0);
  near(a.values.reduce((sum, v) => sum + v * v, 0) / 3, (2 / 3) / (2 / 3 + 1e-5));
  assert.deepEqual(normalize([2, 2, 2]).values, [0, 0, 0]);
  assert.throws(() => normalize([], 1e-5), RangeError);
});

test('learning rate examples match the exact recurrence, stable and unstable regimes', () => {
  near(descent1D(2, .25, 1)[1].x, 1.5);
  near(descent1D(2, 1, 1)[1].loss, 0);
  near(descent1D(2, 2, 12)[12].loss, 2);
  assert.ok(descent1D(2, 1.8, 12)[12].loss < 2);
  assert.ok(descent1D(2, 2.1, 12)[12].loss > 2);
});

test('overfitting uses actual predictions: train error falls while validation error rises', () => {
  regressionTrain.forEach(point => near(regressionPrediction(point.x, 1), point.y));
  near(regressionErrors(0).train, .8 ** 2 / 5);
  near(regressionErrors(0).validation, 0);
  near(regressionErrors(1).train, 0);
  assert.ok(regressionErrors(1).validation > regressionErrors(.5).validation);
  assert.ok(regressionErrors(.5).train < regressionErrors(0).train);
  assert.ok(regressionErrors(.5).validation > 0);
});
