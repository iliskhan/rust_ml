import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundaryLossGradient, boundaryMetrics, boundaryParameterCount,
  createBoundaryParameters, makeBoundaryDataset, predictBoundary,
  type BoundaryConfig, type BoundaryKind, type BoundarySample,
} from '../src/boundaryNetworkMath.ts';
import { createOptimizerState, finiteDifference, optimizerStep } from '../src/math.ts';

function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Number.isFinite(actual), `Не конечное число: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

const kinds: BoundaryKind[] = ['circles', 'moons', 'spiral'];
const linear: BoundaryConfig = { layers: [] };
const examples: BoundarySample[] = [
  { input: [0.1, 0.2], target: 0 },
  { input: [0.35, 0.85], target: 1 },
  { input: [0.7, 0.4], target: 1 },
  { input: [0.9, 0.95], target: 0 },
];

test('без скрытых слоёв: ручной forward, BCE и все градиенты используют 2x−1', () => {
  const params = [Math.log(3), -Math.log(3), 0];
  const data: BoundarySample[] = [{ input: [1, 0.5], target: 1 }, { input: [0.5, 1], target: 0 }];
  assert.equal(boundaryParameterCount(linear), 3);
  close(predictBoundary(params, linear, [0.5, 0.5]), 0.5);
  close(predictBoundary(params, linear, data[0].input), 0.75);
  const result = boundaryLossGradient(params, linear, data);
  close(result.loss, Math.log(4 / 3));
  result.predictions.forEach((p, i) => close(p, [0.75, 0.25][i]));
  result.grad.forEach((g, i) => close(g, [-0.125, 0.125, 0][i]));
  assert.deepEqual(boundaryMetrics([0, 0, 0], linear, data), { loss: Math.LN2, correct: 1, total: 2, accuracy: 0.5 });
});

test('слои хранят W[out,in], затем b; выход всегда sigmoid', () => {
  const config: BoundaryConfig = { layers: [{ width: 2, activation: 'tanh' }] };
  const params = [1, 2, 3, 4, 0.5, -0.5, 2, -1, 0.25];
  // Centered input [.5,−.5] gives hidden preactivations [0,−1].
  const logit = 0.25 + Math.tanh(1);
  close(predictBoundary(params, config, [0.75, 0.25]), 1 / (1 + Math.exp(-logit)));
  assert.equal(boundaryParameterCount(config), params.length);
  assert.equal(boundaryParameterCount({ layers: Array.from({ length: 3 }, () => ({ width: 16, activation: 'relu' })) }), 609);
});

test('центральные разности проверяют каждый параметр при 0–3 скрытых слоях и всех активациях', () => {
  const configs: BoundaryConfig[] = [
    linear,
    { layers: [{ width: 3, activation: 'sigmoid' }] },
    { layers: [{ width: 3, activation: 'tanh' }, { width: 2, activation: 'sigmoid' }] },
    { layers: [{ width: 3, activation: 'tanh' }, { width: 4, activation: 'relu' }, { width: 2, activation: 'sigmoid' }] },
    { layers: [{ width: 3, activation: 'relu' }] },
  ];
  for (const config of configs) {
    const params = createBoundaryParameters(config, 7);
    // Set each ReLU far from a kink for every input: |x| <= 1 before
    // the first hidden layer, and |tanh(x)| <= 1 before the middle layer.
    let offset = 0;
    let inputs = 2;
    for (const layer of config.layers) {
      if (layer.activation === 'relu') {
        for (let j = 0; j < layer.width; j++) {
          const magnitude = params.slice(offset + j * inputs, offset + (j + 1) * inputs).reduce((sum, w) => sum + Math.abs(w), 0);
          params[offset + inputs * layer.width + j] = (j % 2 ? -1 : 1) * (magnitude + 1);
        }
      }
      offset += inputs * layer.width + layer.width;
      inputs = layer.width;
    }
    const analytic = boundaryLossGradient(params, config, examples).grad;
    const numerical = finiteDifference(p => boundaryLossGradient(p, config, examples).loss, params);
    assert.equal(analytic.length, boundaryParameterCount(config));
    analytic.forEach((g, i) => close(g, numerical[i], 2e-8));
  }
});

test('BCE из logits устойчива при ±1000, а порог влияет только на классификацию', () => {
  for (const [logit, target, gradient] of [[1000, 0, 1], [-1000, 1, -1]] as const) {
    const result = boundaryLossGradient([0, 0, logit], linear, [{ input: [0.5, 0.5], target }]);
    assert.equal(result.loss, 1000);
    result.grad.forEach((g, i) => close(g, [0, 0, gradient][i]));
    assert.equal(result.predictions[0], logit > 0 ? 1 : 0);
  }
  const data: BoundarySample[] = [{ input: [0.5, 0.5], target: 1 }];
  const params = [0, 0, Math.log(3)];
  const low = boundaryMetrics(params, linear, data, 0.5);
  const high = boundaryMetrics(params, linear, data, 0.9);
  assert.equal(low.accuracy, 1);
  assert.equal(high.accuracy, 0);
  assert.equal(low.loss, high.loss);
  assert.equal(low.loss, boundaryLossGradient(params, linear, data).loss);
  assert.equal(boundaryMetrics([0, 0, 0], linear, data, 0.5).correct, 1);
});

test('воспроизводимая инициализация: He/Glorot uniform, нулевые bias и независимые seed', () => {
  const relu: BoundaryConfig = { layers: [{ width: 16, activation: 'relu' }, { width: 8, activation: 'sigmoid' }] };
  const tanh: BoundaryConfig = { layers: [{ width: 16, activation: 'tanh' }, { width: 8, activation: 'sigmoid' }] };
  const params = createBoundaryParameters(relu, 42);
  assert.deepEqual(params, createBoundaryParameters(relu, 42));
  assert.notDeepEqual(params, createBoundaryParameters(relu, 43));
  const other = createBoundaryParameters(tanh, 42);
  for (let i = 0; i < 32; i++) close(params[i], other[i] * Math.sqrt(18 / 2));
  assert.deepEqual(params.slice(32), other.slice(32));
  let inputs = 2;
  let offset = 0;
  for (const layer of [...relu.layers, { width: 1, activation: 'sigmoid' }]) {
    const bound = Math.sqrt(layer.activation === 'relu' ? 6 / inputs : 6 / (inputs + layer.width));
    const weights = params.slice(offset, offset + inputs * layer.width);
    assert.ok(weights.every(w => Math.abs(w) <= bound));
    offset += inputs * layer.width;
    assert.deepEqual(params.slice(offset, offset + layer.width), Array(layer.width).fill(0));
    offset += layer.width;
    inputs = layer.width;
  }
  assert.equal(offset, params.length);
});

test('три набора: фиксированные seed, баланс 96/32, область и отдельные train/validation', () => {
  for (const kind of kinds) {
    const dataset = makeBoundaryDataset(kind, 42);
    assert.deepEqual(dataset, makeBoundaryDataset(kind, 42));
    assert.notDeepEqual(dataset.train, makeBoundaryDataset(kind, 7).train);
    assert.notDeepEqual(dataset.validation, makeBoundaryDataset(kind, 7).validation);
    for (const [split, size] of [[dataset.train, 96], [dataset.validation, 32]] as const) {
      assert.equal(split.length, size);
      assert.equal(split.filter(sample => sample.target === 0).length, size / 2);
      assert.equal(split.filter(sample => sample.target === 1).length, size / 2);
      assert.ok(split.every(sample => sample.input.every(x => Number.isFinite(x) && x >= 0 && x <= 1)));
      if (kind === 'circles') {
        for (const sample of split) {
          const radius = Math.hypot(sample.input[0] - 0.5, sample.input[1] - 0.5);
          assert.ok(Math.abs(radius - (sample.target === 0 ? 0.35 : 0.17)) <= Math.SQRT2 * 0.018);
        }
      }
    }
    const trainPoints = new Set(dataset.train.map(sample => sample.input.join(',')));
    assert.ok(dataset.validation.every(sample => !trainPoints.has(sample.input.join(','))));
    const before = structuredClone(dataset.validation);
    dataset.train[0].input[0] = -999;
    assert.deepEqual(dataset.validation, before);
    assert.notEqual(makeBoundaryDataset(kind, 42).train[0].input[0], -999);
  }
});

test('forward, backward и metrics не меняют параметры, конфигурацию или данные', () => {
  const config: BoundaryConfig = { layers: [{ width: 4, activation: 'tanh' }, { width: 3, activation: 'sigmoid' }] };
  const params = createBoundaryParameters(config, 42);
  const data = makeBoundaryDataset('moons', 42).train;
  const before = structuredClone({ config, params, data });
  boundaryParameterCount(config);
  createBoundaryParameters(config, 42);
  predictBoundary(params, config, data[0].input);
  boundaryLossGradient(params, config, data);
  boundaryMetrics(params, config, data, 0.6);
  assert.deepEqual({ config, params, data }, before);
});

test('некорректные формы, значения, разрежённые массивы и переполнения отклоняются', () => {
  for (const config of [null, {}, { layers: null }, { layers: Array(1) }, { layers: Array(4).fill({ width: 1, activation: 'tanh' }) },
    ...[0, 17, 1.5, NaN, Infinity].map(width => ({ layers: [{ width, activation: 'tanh' }] })),
    { layers: [{ width: 2, activation: 'softmax' }] }]) {
    assert.throws(() => boundaryParameterCount(config as BoundaryConfig), RangeError);
  }
  for (const params of [[], [0, 0], [0, 0, 0, 0], [0, NaN, 0], [0, Infinity, 0], Array(3)]) {
    assert.throws(() => predictBoundary(params, linear, [0.5, 0.5]), RangeError);
  }
  for (const input of [null, [], [0], [0, 0, 0], [-0.1, 0.5], [0.5, 1.1], [NaN, 0], [0, Infinity], Array(2)]) {
    assert.throws(() => predictBoundary([0, 0, 0], linear, input as [number, number]), RangeError);
  }
  for (const data of [null, [], Array(1), [{ input: [0, 0], target: 2 }], [{ input: [0, 0], target: NaN }], [{ input: [0], target: 0 }]]) {
    assert.throws(() => boundaryLossGradient([0, 0, 0], linear, data as BoundarySample[]), RangeError);
    assert.throws(() => boundaryMetrics([0, 0, 0], linear, data as BoundarySample[]), RangeError);
  }
  for (const threshold of [-0.1, 1.1, NaN, Infinity]) assert.throws(() => boundaryMetrics([0, 0, 0], linear, examples, threshold), RangeError);
  for (const seed of [NaN, Infinity, -Infinity]) {
    assert.throws(() => makeBoundaryDataset('circles', seed), RangeError);
    assert.throws(() => createBoundaryParameters(linear, seed), RangeError);
  }
  assert.throws(() => makeBoundaryDataset('unknown' as BoundaryKind), RangeError);
  assert.throws(() => predictBoundary([Number.MAX_VALUE, Number.MAX_VALUE, 0], linear, [1, 1]), RangeError);
  // A saturated hidden sigmoid must not silently hide an overflowing affine sum.
  assert.throws(() => predictBoundary([Number.MAX_VALUE, Number.MAX_VALUE, 0, 1, 0], { layers: [{ width: 1, activation: 'sigmoid' }] }, [1, 1]), RangeError);
});

test('реальный Adam обучает circles/moons/spiral на train и проверяет отдельную validation', () => {
  const config: BoundaryConfig = { layers: [{ width: 8, activation: 'tanh' }, { width: 8, activation: 'tanh' }] };
  for (const kind of kinds) {
    const { train, validation } = makeBoundaryDataset(kind, 42);
    let state = createOptimizerState(createBoundaryParameters(config, 42));
    const initial = boundaryMetrics(state.params, config, train).loss;
    for (let step = 0; step < 700; step++) {
      state = optimizerStep(state, boundaryLossGradient(state.params, config, train).grad, 'adam', { lr: 0.03 });
    }
    const trained = boundaryMetrics(state.params, config, train);
    const heldOut = boundaryMetrics(state.params, config, validation);
    assert.ok(trained.loss < initial / 20 && trained.loss < 0.02, `${kind}: train BCE=${trained.loss}`);
    assert.ok(trained.accuracy >= 0.98, `${kind}: train accuracy=${trained.accuracy}`);
    assert.ok(heldOut.loss < 0.1 && heldOut.accuracy >= 0.9, `${kind}: validation=${JSON.stringify(heldOut)}`);
    assert.equal(state.step, 700);
  }
});
