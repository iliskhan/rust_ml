import test from 'node:test';
import assert from 'node:assert/strict';
import { createTinyModel, tinyLoss, tinyLossGradient, conditionalFlowPoint, createFlowModel, flowSamples, flowNoise, flowShapeError, integrateFlow, trainFlow, integrateVelocity, EGNN_COORDINATES, EGNN_FEATURES, egnnBlock, orthogonalVector, equivarianceTrace, createFieldModel, fieldSamples, trainField, compositeVolume, cameraRay, renderFieldRay, referenceField } from '../src/flowGeometryMath.ts';

test('both output activations have the actual MSE derivative (central finite differences)', () => {
  for (const bounded of [false, true]) {
    const model = createTinyModel(3, 4, 2, bounded), samples = [{ input: [.2, -.4, .7], target: [.1, .8] }, { input: [-.8, .6, .1], target: [.9, -.2] }];
    const { gradient } = tinyLossGradient(model, samples);
    for (let i = 0; i < model.weights.length; i++) {
      const original = model.weights[i], epsilon = 1e-6;
      model.weights[i] = original + epsilon; const plus = tinyLoss(model, samples);
      model.weights[i] = original - epsilon; const minus = tinyLoss(model, samples);
      model.weights[i] = original;
      assert.ok(Math.abs(gradient[i] - (plus - minus) / (2 * epsilon)) < 1e-8, `weight ${i}, bounded=${bounded}`);
    }
  }
});
test('conditional path velocity is the time derivative and endpoints match noise/data', () => {
  const noise = [-1, .3] as const, data = [.7, -1.2] as const, epsilon = 1e-5;
  assert.deepEqual(conditionalFlowPoint(noise, data, 0).position, noise);
  assert.deepEqual(conditionalFlowPoint(noise, data, 1).position, data);
  const center = conditionalFlowPoint(noise, data, .4), before = conditionalFlowPoint(noise, data, .4 - epsilon), after = conditionalFlowPoint(noise, data, .4 + epsilon);
  center.velocity.forEach((v, d) => assert.ok(Math.abs(v - (after.position[d] - before.position[d]) / (2 * epsilon)) < 1e-10));
});
test('flow learns on unseen conditional pairs for both distributions and preserves input state', () => {
  for (const distribution of ['blobs', 'ring'] as const) {
    const initial = createFlowModel(), validation = flowSamples(distribution, 256, 80003), before = tinyLoss(initial, validation);
    const trained = trainFlow(initial, distribution, 500), after = tinyLoss(trained, validation);
    assert.equal(initial.steps, 0); assert.equal(trained.steps, 500);
    assert.ok(after < before * .75, `${distribution}: ${before} -> ${after}`);
    assert.ok(trained.weights.every(Number.isFinite));
  }
});
test('ODE integrates the evolving point: constant field exact, rotation converges to analytic circle', () => {
  assert.deepEqual(integrateVelocity(() => [1, -2], [0, 0], 4).at(-1), [1, -2]);
  const integrate = (n: number) => integrateVelocity(([x, y]) => [-y, x], [1, 0], n).at(-1)!;
  const exact = [Math.cos(1), Math.sin(1)], error = (n: number) => Math.hypot(...integrate(n).map((v, d) => v - exact[d]));
  assert.ok(error(32) < error(4) / 40); assert.ok(error(32) < .0002);
});
test('trained ODE samples approach the actual target geometry, not only conditional velocity labels', () => {
  const noise = flowNoise(128);
  for (const distribution of ['blobs', 'ring'] as const) {
    const initial = createFlowModel(), trained = trainFlow(initial, distribution, 500);
    const shapeError = (model: typeof initial) => flowShapeError(noise.map(point => integrateFlow(model, point, 64).at(-1)!), distribution);
    assert.ok(shapeError(trained) < shapeError(initial) * .6, distribution);
  }
});
test('EGNN scalars, displacement vectors and updated positions obey E(3)', () => {
  for (const reflection of [false, true]) for (const angles of [[0, 0], [67, -32], [180, 90]]) {
    const trace = equivarianceTrace(EGNN_COORDINATES, EGNN_FEATURES, angles[0], angles[1], reflection, [.8, -1.2, .4]);
    assert.ok(trace.scalarError < 1e-14); assert.ok(trace.vectorError < 1e-14); assert.ok(trace.positionError < 1e-14);
    const rotated = orthogonalVector([.4, -.9, .7], angles[0], angles[1], reflection);
    assert.ok(Math.abs(Math.hypot(...rotated) - Math.hypot(.4, -.9, .7)) < 1e-14);
  }
  const order = [2, 0, 3, 1], original = egnnBlock(EGNN_COORDINATES, EGNN_FEATURES), reordered = egnnBlock(order.map(i => EGNN_COORDINATES[i]), order.map(i => EGNN_FEATURES[i]));
  order.forEach((i, j) => original.vectors[i].forEach((v, d) => assert.ok(Math.abs(v - reordered.vectors[j][d]) < 1e-14)));
  const broken = equivarianceTrace(EGNN_COORDINATES, EGNN_FEATURES, 67, -32, true, [.8, -.5, .4], .4, true);
  assert.ok(broken.scalarError > .01 && broken.vectorError > .01);
});
test('coordinate MLP learns held-out synthetic density and colors', () => {
  const initial = createFieldModel(), validation = fieldSamples(320, 888), before = tinyLoss(initial, validation), trained = trainField(initial, 500), after = tinyLoss(trained, validation);
  assert.ok(after < before * .2, `${before} -> ${after}`); assert.equal(trained.steps, 500); assert.equal(initial.steps, 0);
});
test('volume compositing matches Beer–Lambert, empty space, opaque foreground and order', () => {
  const sigma = 2, length = .7, red = [1, 0, 0] as const;
  for (const n of [1, 4, 32]) {
    const result = compositeVolume(Array.from({ length: n }, () => ({ density: sigma, color: red, delta: length / n })));
    assert.ok(Math.abs(result.transmittance - Math.exp(-sigma * length)) < 1e-14);
    assert.ok(Math.abs(result.color[0] - 1) < 1e-14); assert.ok(Math.abs(result.color[1] - Math.exp(-sigma * length)) < 1e-14);
    assert.ok(Math.abs(result.trace.reduce((s, item) => s + item.weight, 0) + result.transmittance - 1) < 1e-14);
  }
  assert.deepEqual(compositeVolume([{ density: 0, color: red, delta: 1 }]).color, [1, 1, 1]);
  const foreground = { density: 100, color: red, delta: 1 }, background = { density: 100, color: [0, 0, 1] as const, delta: 1 };
  assert.deepEqual(compositeVolume([foreground, background]).color, red);
  assert.deepEqual(compositeVolume([background, foreground]).color, background.color);
  assert.throws(() => compositeVolume([{ density: -1, color: red, delta: 1 }]), RangeError);
});
test('camera rays have unit physical direction, midpoint samples in cube, and finer reference integration converges', () => {
  for (const yaw of [-180, -65, 0, 110]) {
    const ray = cameraRay(yaw, .4, -.3); assert.ok(Math.abs(Math.hypot(...ray.direction) - 1) < 1e-14);
    const render = renderFieldRay(referenceField, yaw, .4, -.3, 32);
    assert.ok(render.points.every(p => p.every(x => Math.abs(x) < 1.2 + 1e-12)));
    assert.ok(render.trace.every((sample, i, all) => i === 0 || sample.transmittance <= all[i - 1].transmittance));
  }
  const exact = renderFieldRay(referenceField, 17, .2, -.15, 1024), coarse = renderFieldRay(referenceField, 17, .2, -.15, 4), fine = renderFieldRay(referenceField, 17, .2, -.15, 64);
  const error = (result: typeof exact) => Math.hypot(...result.color.map((v, d) => v - exact.color[d]));
  assert.ok(error(fine) < error(coarse) / 20);
  assert.equal(renderFieldRay(referenceField, 0, 0, 0, 16, 0).transmittance, 1);
  const miss = renderFieldRay(() => { throw new Error('A missing ray must not query the field outside its cube.'); }, 0, 8, 8, 16);
  assert.deepEqual(miss.color, [1, 1, 1]); assert.equal(miss.transmittance, 1);
});
