import assert from 'node:assert/strict';
import test from 'node:test';
import { boundaryConfusion, boundarySliceGrid, boundaryWeightChoices, captureBoundarySlice, evaluateBoundarySlice } from '../src/boundaryDiagnosticsMath.ts';
import { boundaryBatchIndices, boundaryLossGradient, createBoundaryParameters, makeBoundaryDataset, type BoundaryConfig, type BoundarySample } from '../src/boundaryNetworkMath.ts';

const linear: BoundaryConfig = { layers: [] };
const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const fixture: BoundarySample[] = [
  { input: [1, .5], target: 1 }, { input: [1, .5], target: 0 },
  { input: [0, .5], target: 0 }, { input: [0, .5], target: 1 },
];

test('confusion hand fixture links every point to exactly one count and metric', () => {
  const result = boundaryConfusion([2, 0, 0], linear, fixture, .5);
  assert.deepEqual(result.counts, { TP: 1, FP: 1, TN: 1, FN: 1 });
  assert.deepEqual(result.points.map(point => point.outcome), ['TP', 'FP', 'TN', 'FN']);
  assert.equal(result.precision, .5); assert.equal(result.recall, .5);
  assert.equal(result.correct, result.counts.TP + result.counts.TN);
});

test('threshold equality and extremes preserve BCE, report undefined precision/recall', () => {
  const allPositive = boundaryConfusion([0, 0, 0], linear, fixture, .5);
  const allNegative = boundaryConfusion([0, 0, 0], linear, fixture, 1);
  assert.deepEqual(allPositive.counts, { TP: 2, FP: 2, TN: 0, FN: 0 });
  assert.deepEqual(allNegative.counts, { TP: 0, FP: 0, TN: 2, FN: 2 });
  assert.equal(allNegative.precision, null); assert.equal(allNegative.recall, 0);
  assert.equal(allPositive.loss, allNegative.loss);
  assert.deepEqual(boundaryConfusion([0, 0, 0], linear, fixture, 0).counts, allPositive.counts);
  assert.equal(boundaryConfusion([0, 0, 0], linear, [fixture[1]], .5).recall, null);
});

test('weight choices exclude every hidden/output bias and label actual row-major weights', () => {
  const config: BoundaryConfig = { layers: [{ width: 2, activation: 'tanh' }, { width: 1, activation: 'sigmoid' }] };
  const choices = boundaryWeightChoices(config);
  assert.deepEqual(choices.map(choice => choice.index), [0, 1, 2, 3, 6, 7, 9]);
  assert.equal(choices[3].label, 'W1[2,2]'); assert.equal(choices.at(-1)!.label, 'W3[1,1]');
});

test('slice gradients match finite differences of batch, train and regularized loss', () => {
  for (const config of [linear, { layers: [{ width: 3, activation: 'tanh' as const }] }]) {
    const params = createBoundaryParameters(config, 7), data = makeBoundaryDataset('moons', 8);
    const snapshot = captureBoundarySlice(params, config, data, 4, 11);
    const choices = boundaryWeightChoices(config), pair: [number, number] = [choices[0].index, choices.at(-1)!.index];
    const values: [number, number] = [.7, -.4];
    const result = evaluateBoundarySlice(snapshot, pair, values, 13, 4, .2);
    for (const mode of ['batch', 'train', 'regularized'] as const) for (let axis = 0; axis < 2; axis++) {
      const plus = [...values] as [number, number], minus = [...values] as [number, number];
      plus[axis] += 1e-5; minus[axis] -= 1e-5;
      close(result[mode].gradient[axis], (evaluateBoundarySlice(snapshot, pair, plus, 13, 4, .2)[mode].loss - evaluateBoundarySlice(snapshot, pair, minus, 13, 4, .2)[mode].loss) / 2e-5);
    }
  }
});

test('L2 surface equals actual objective, adds lambda W to chosen weights and excludes bias', () => {
  const snapshot = captureBoundarySlice([1, 2, 10], linear, { train: fixture, validation: fixture }, 0, 1);
  const result = evaluateBoundarySlice(snapshot, [0, 1], [1, 2], 2, 0, .1);
  close(result.penalty, .25);
  close(result.regularized.loss, boundaryLossGradient(snapshot.params, linear, fixture, .1).loss);
  close(result.regularized.gradient[0] - result.train.gradient[0], .1);
  close(result.regularized.gradient[1] - result.train.gradient[1], .2);
  assert.throws(() => evaluateBoundarySlice(snapshot, [0, 2], [1, 10], 2, 0, .1), /веса/);
  assert.throws(() => evaluateBoundarySlice(snapshot, [0, 0], [1, 1], 2, 0, .1), /различных/);
});

test('snapshot is independent of source mutation; evaluating grid never updates weights or data', () => {
  const config: BoundaryConfig = { layers: [{ width: 2, activation: 'tanh' }] };
  const params = createBoundaryParameters(config), data = makeBoundaryDataset('circles');
  const snapshot = captureBoundarySlice(params, config, data, 2, 5), original = structuredClone(snapshot);
  params[0] = 900; config.layers[0].width = 8; data.train[0].input[0] = 0; data.train[0].target = 1;
  assert.deepEqual(snapshot, original);
  const grid = boundarySliceGrid(snapshot, [0, 1], 1, 16, 2, .1);
  assert.equal(grid.length, 9); assert.equal(grid.flat().length, 81);
  assert.deepEqual(grid[4][4].values, snapshot.params.slice(0, 2));
  close(grid[4][4].regularized.loss, boundaryLossGradient(snapshot.params, snapshot.config, snapshot.train, .1).loss);
  assert.deepEqual(snapshot, original);
});

test('batch selection matches training API including a short last batch, train stays fixed', () => {
  const snapshot = captureBoundarySlice([.4, -.3, .2], linear, makeBoundaryDataset('spiral', 13), 7, 21);
  const a = evaluateBoundarySlice(snapshot, [0, 1], [.4, -.3], 13, 7, .2);
  const b = evaluateBoundarySlice(snapshot, [0, 1], [.4, -.3], 13, 8, .2);
  assert.equal(a.indices.length, 5);
  assert.deepEqual(a.indices, boundaryBatchIndices(7, 13, 21));
  assert.deepEqual(a.train, b.train); assert.deepEqual(a.regularized, b.regularized);
  assert.notDeepEqual(a.batch.gradient, b.batch.gradient);
  const full = evaluateBoundarySlice(snapshot, [0, 1], [.4, -.3], 96, 7, .2);
  assert.deepEqual(full.batch, full.train);
});
