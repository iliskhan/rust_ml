import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizationGeometry, headGeometryProbe, residualGradientTrace } from '../src/transformerVisualMath.ts';
import { headTrainingTrace, headSgdStep, initialHeadParameters, transformerHeadBatch } from '../src/transformerHeadMath.ts';
const near = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('three real norm coordinates: zero-sum plane, epsilon radius and LN shift invariance', () => {
  const original = normalizationGeometry([-1, .5, 2], 0, 1, .01);
  const shifted = normalizationGeometry([-1, .5, 2], 2, 1, .01);
  near(original.centered.reduce((a, b) => a + b), 0);
  near(original.layer.output.reduce((a, b) => a + b), 0);
  original.layer.output.forEach((value, i) => near(value, shifted.layer.output[i]));
  assert.ok(Math.hypot(...original.layer.output) < Math.sqrt(3));
  near(Math.hypot(...original.layer.output) ** 2, 3 * 1.5 / 1.51);
  assert.notDeepEqual(original.rms.output, shifted.rms.output);
  const constant = normalizationGeometry([-1, .5, 2], 2, 0, .01);
  assert.deepEqual(constant.layer.output, [0, 0, 0]);
  assert.ok(Math.hypot(...constant.rms.output) < Math.sqrt(3));
  assert.throws(() => normalizationGeometry([-1, .5, 2], 0, 1, 0));
});

test('head planes use affine logits and the same live SGD parameters as all six token probabilities', () => {
  const manual = headGeometryProbe([2, -1], { weights: [[.5, -.5], [1, 2]], bias: [.25, -.25] });
  assert.deepEqual(manual.logits, [.25, -3.25]);
  near(manual.probabilities[0], 1 / (1 + Math.exp(-3.5)));
  const batch = transformerHeadBatch(), parameters = initialHeadParameters();
  const next = headSgdStep(batch.hidden, batch.targets, parameters, .1).parameters;
  const trace = headTrainingTrace(batch.hidden, batch.targets, next);
  batch.hidden.forEach((hidden, t) => {
    assert.deepEqual(headGeometryProbe(hidden, next).logits, trace.positions[t].logits);
    assert.deepEqual(headGeometryProbe(hidden, next).probabilities, trace.positions[t].probabilities);
  });
  assert.notDeepEqual(headGeometryProbe(batch.hidden[1], parameters).logits, headGeometryProbe(batch.hidden[1], next).logits);
  const pairTie = headGeometryProbe([0, 0], { weights: [[0, 0, 0], [0, 0, 0]], bias: [0, 0, 1] });
  assert.equal(pairTie.logits[0], pairTie.logits[1]);
  assert.equal(pairTie.winner, 2); // Pair equality alone is not a multiclass winner boundary.
});

test('plain and residual stack derivatives agree with finite differences, including cancellation', () => {
  for (const residual of [false, true]) for (const weight of [-1.2, -.5, .5, 1.2]) {
    const trace = residualGradientTrace(.4, weight, 5, residual), delta = 1e-6;
    const numeric = (residualGradientTrace(.4 + delta, weight, 5, residual).output - residualGradientTrace(.4 - delta, weight, 5, residual).output) / (2 * delta);
    near(trace.gradient, numeric, 2e-8);
    trace.backward.forEach(step => near(step.outgoing, step.identity + step.branchGradient));
  }
  assert.equal(residualGradientTrace(0, -1, 3, true).gradient, 0);
  assert.equal(residualGradientTrace(0, -1, 3, false).gradient, -1);
  const plain = residualGradientTrace(.4, .5, 6, false), residual = residualGradientTrace(.4, .5, 6, true);
  assert.ok(Math.abs(residual.gradient) > Math.abs(plain.gradient));
});
