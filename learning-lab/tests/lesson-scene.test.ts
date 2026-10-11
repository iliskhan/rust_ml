import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetwork, networkLossGradient, optimizerStep, createOptimizerState } from '../src/math.ts';
import { functionSurface, quadraticHeight, quadraticTangent, neuronHeight, networkHeight, mseHeight } from '../src/lessonSceneMath.ts';

test('quadratic surface has known heights, and its tangent agrees to first order', () => {
  assert.equal(quadraticHeight(-3, 1.5), 13.5);
  assert.equal(quadraticHeight(0, 0), 0);
  assert.equal(quadraticHeight(4, 2), 24);
  assert.equal(quadraticTangent(2, 1, 2, 1), 6);
  const dx = .03, dy = -.04;
  const residual = quadraticHeight(2 + dx, 1 + dy) - quadraticTangent(2 + dx, 1 + dy, 2, 1);
  assert.ok(Math.abs(residual - .5 * (dx * dx + 8 * dy * dy)) < 1e-12);
});

test('neuron surfaces distinguish ReLU kink and bounded nonlinearities', () => {
  assert.equal(neuronHeight(1, 2, .8, -.4, .5, 'relu'), .5);
  assert.equal(neuronHeight(-3, 3, 1, -1, 0, 'relu'), 0);
  assert.equal(neuronHeight(0, 0, 1, 1, 0, 'sigmoid'), .5);
  assert.equal(neuronHeight(0, 0, 1, 1, 0, 'tanh'), 0);
  assert.ok(neuronHeight(3, 3, 2, 2, 2, 'tanh') <= 1);
});

test('MSE slice keeps the third prediction fixed and displays its true minimum', () => {
  assert.equal(mseHeight(1, 2, 3), 0);
  assert.equal(mseHeight(1, 2, 0), 3);
  assert.equal(mseHeight(2, 4, 3), 5 / 3);
});

test('surface mesh includes boundaries, preserves coordinates and rejects invalid values', () => {
  const rows = functionSurface([-4, 4], [-2, 2], quadraticHeight, 2);
  assert.deepEqual(rows[0][0], [-4, -2, 24]);
  assert.deepEqual(rows[1][1], [0, 0, 0]);
  assert.deepEqual(rows[2][2], [4, 2, 24]);
  assert.throws(() => functionSurface([1, 1], [0, 1], quadraticHeight), RangeError);
  assert.throws(() => functionSurface([0, 1], [0, 1], () => Infinity), RangeError);
});

test('XOR surface uses trained weights at the four actual samples', () => {
  let state = createOptimizerState(createNetwork(42));
  for (let step = 0; step < 3000; step++) state = optimizerStep(state, networkLossGradient(state.params).grad, 'adam', { lr: .03 });
  const mesh = functionSurface([0, 1], [0, 1], (x, y) => networkHeight(x, y, state.params), 2);
  assert.ok(mesh.flat().every(point => point[2] >= 0 && point[2] <= 1));
  assert.ok(mesh[0][0][2] < .1 && mesh[2][2][2] < .1);
  assert.ok(mesh[0][2][2] > .9 && mesh[2][0][2] > .9);
});
