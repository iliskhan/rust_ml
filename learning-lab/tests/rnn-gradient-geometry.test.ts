import test from 'node:test';
import assert from 'node:assert/strict';
import { rnnLocalJacobian } from '../src/rnnGradientGeometryMath.ts';
import { bptt } from '../src/bpttMath.ts';

test('local RNN Jacobian matches finite differences, signs and exact zero', () => {
  for (const wh of [-3, -0.7, 0, 0.5, 1.6, 3]) for (const previous of [-0.8, 0, 0.7]) {
    const weights = { wx: 0.8, wh, b: 0.1 }, x = -0.4, epsilon = 1e-6;
    const forward = (h: number) => Math.tanh(weights.wx * x + wh * h + weights.b);
    const numeric = (forward(previous + epsilon) - forward(previous - epsilon)) / (2 * epsilon);
    assert.ok(Math.abs(rnnLocalJacobian(previous, x, weights).jacobian - numeric) < 1e-8);
  }
  assert.equal(rnnLocalJacobian(0.7, 0.3, { wx: 1, wh: 0, b: 1 }).jacobian, 0);
});

test('large recurrent weight amplifies near zero but saturation suppresses it', () => {
  const weights = { wx: 0.8, wh: 3, b: 0.1 }, x = 0.6;
  const neutral = -(weights.wx * x + weights.b) / weights.wh;
  assert.equal(rnnLocalJacobian(neutral, x, weights).jacobian, 3);
  assert.ok(Math.abs(rnnLocalJacobian(neutral + 1, x, weights).jacobian) < 0.03);
});

test('selected BPTT point uses the same local Jacobian without replacing the full loss gradient', () => {
  const weights = { wx: 0.8, wh: 0.7, b: 0.1 };
  const trace = bptt([0.8, -0.4, 0.6, 0.1], weights, -0.5, 0.1);
  for (const row of trace.steps) {
    assert.equal(rnnLocalJacobian(row.previous, row.x, weights).jacobian, row.recurrentDerivative);
    assert.ok(Math.abs(row.dhPrevious - row.dh * row.recurrentDerivative) < 1e-12);
  }
  assert.notEqual(trace.steps[0].recurrentDerivative, trace.dh0);
});
