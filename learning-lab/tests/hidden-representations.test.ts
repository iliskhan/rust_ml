import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMathSnapshot } from '../src/mathSnapshot.ts';
import { boundaryLossGradient, boundaryNeuronParameters, createBoundaryParameters, makeBoundaryDataset, predictBoundary, traceBoundary, type BoundaryConfig, type BoundaryKind } from '../src/boundaryNetworkMath.ts';
import { createOptimizerState, optimizerStep } from '../src/math.ts';

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-13, `${actual} != ${expected}`);
}

test('trace: независимый ручной расчёт всех z и a с ReLU, tanh и sigmoid', () => {
  const config: BoundaryConfig = { layers: [{ width: 2, activation: 'relu' }, { width: 2, activation: 'tanh' }, { width: 1, activation: 'sigmoid' }] };
  const params = [2, -1, -1, 3, -.25, .1, .4, -.2, -.8, .6, .1, .2, 1.2, -.7, -.3, 1.7, -.4];
  const result = traceBoundary(params, config, [.75, .25]);
  const lastZ = 1.2 * Math.tanh(.6) - .7 * Math.tanh(-.8) - .3;
  const lastH = 1 / (1 + Math.exp(-lastZ));
  const logit = 1.7 * lastH - .4;
  const expectedZ = [[1.25, -1.9], [.6, -.8], [lastZ], [logit]];
  const expectedA = [[.5, -.5], [1.25, 0], [Math.tanh(.6), Math.tanh(-.8)], [lastH], [1 / (1 + Math.exp(-logit))]];
  assert.deepEqual(result.input, [.75, .25]);
  assert.equal(result.preactivations.length, 4);
  assert.equal(result.activations.length, 5);
  expectedZ.forEach((values, layer) => values.forEach((value, i) => close(result.preactivations[layer][i], value)));
  expectedA.forEach((values, layer) => values.forEach((value, i) => close(result.activations[layer][i], value)));
  close(result.logit, logit);
  assert.equal(result.probability, predictBoundary(params, config, [.75, .25]));
  assert.equal(result.probability, result.activations.at(-1)![0]);
});

test('0 скрытых слоёв: trace содержит только центрированный вход и настоящий выход', () => {
  const config: BoundaryConfig = { layers: [] };
  const params = [2, -3, .25];
  const result = traceBoundary(params, config, [.75, .25]);
  assert.deepEqual(result.activations[0], [.5, -.5]);
  assert.deepEqual(result.preactivations, [[2.75]]);
  assert.equal(result.activations.length, 2);
  close(result.probability, 1 / (1 + Math.exp(-2.75)));
  assert.deepEqual(traceBoundary(params, config, [0, 1]).activations[0], [-1, 1]);
  assert.deepEqual(traceBoundary(params, config, [.5, .5]).activations[0], [0, 0]);
});

test('ширина 1/2/16: trace сохраняет ровно реальные координаты, порядок и полные векторы', () => {
  for (const width of [1, 2, 16]) {
    const config: BoundaryConfig = { layers: [{ width, activation: 'tanh' }] };
    const params = createBoundaryParameters(config, 42);
    const result = traceBoundary(params, config, [.2, .8]);
    assert.deepEqual(result.activations.map(values => values.length), [2, width, 1]);
    assert.deepEqual(result.preactivations.map(values => values.length), [width, 1]);
    for (let neuron = 0; neuron < width; neuron++) {
      const z = params[2 * width + neuron] + params[2 * neuron] * (2 * .2 - 1) + params[2 * neuron + 1] * (2 * .8 - 1);
      assert.equal(result.preactivations[0][neuron], z);
      assert.equal(result.activations[1][neuron], Math.tanh(z));
    }
  }
});

test('каждая из 128 точек всех наборов: точное совпадение trace, predict и train-forward', () => {
  const configs: BoundaryConfig[] = [{ layers: [] }, { layers: [{ width: 1, activation: 'relu' }] }, { layers: [{ width: 2, activation: 'tanh' }] }, { layers: [{ width: 8, activation: 'tanh' }, { width: 4, activation: 'sigmoid' }] }];
  for (const kind of ['circles', 'moons', 'spiral'] as BoundaryKind[]) for (const config of configs) {
    const dataset = makeBoundaryDataset(kind, 42), params = createBoundaryParameters(config, 42);
    const trainPredictions = boundaryLossGradient(params, config, dataset.train).predictions;
    for (const [index, point] of [...dataset.train, ...dataset.validation].entries()) {
      const result = traceBoundary(params, config, point.input);
      assert.equal(result.probability, predictBoundary(params, config, point.input));
      if (index < 96) assert.equal(result.probability, trainPredictions[index]);
      assert.deepEqual(result.input, point.input);
      assert.deepEqual(result.activations[0], point.input.map(value => 2 * value - 1));
      assert.ok([...result.activations.flat(), ...result.preactivations.flat()].every(Number.isFinite));
    }
  }
});

test('снимок любого нейрона воспроизводит z из trace с исходным порядком bias-first', () => {
  const config: BoundaryConfig = { layers: [{ width: 4, activation: 'relu' }, { width: 2, activation: 'tanh' }] };
  const params = createBoundaryParameters(config, 7);
  const result = traceBoundary(params, config, [.125, .375]);
  result.preactivations.forEach((values, layer) => values.forEach((expected, neuron) => {
    const row = boundaryNeuronParameters(params, config, layer, neuron);
    const z = row.weights.reduce((sum, weight, i) => sum + weight * result.activations[layer][i], row.bias);
    assert.equal(z, expected);
    assert.equal(row.activation, config.layers[layer]?.activation ?? 'sigmoid');
    const snapshot = analyzeMathSnapshot({ kind: 'dot-product', origin: 'MLP test', detail: `Layer ${layer}, neuron ${neuron}`,
      inputs: result.activations[layer], ...row, accumulation: 'bias-first' });
    assert.equal(snapshot.kind, 'dot-product');
    if (snapshot.kind === 'dot-product') {
      assert.equal(snapshot.z, expected);
      assert.equal(snapshot.output, result.activations[layer + 1][neuron]);
    }
  }));
});

test('просмотр всех train/validation и изменение возвращённых копий не меняют сеть, вход или optimizer', () => {
  const config: BoundaryConfig = { layers: [{ width: 3, activation: 'tanh' }] };
  const dataset = makeBoundaryDataset('spiral', 7);
  const state = createOptimizerState(createBoundaryParameters(config, 7));
  const input: [number, number] = [.4, .6];
  const before = structuredClone({ config, dataset, state, input });
  Object.freeze(input);
  Object.freeze(state.params);
  const first = traceBoundary(state.params, config, input);
  const original = structuredClone(first);
  for (const point of [...dataset.train, ...dataset.validation]) traceBoundary(state.params, config, point.input);
  // Deliberately mutate the returned copy to prove it cannot mutate the source.
  (first.input as unknown as [number, number])[0] = 999;
  (first.activations[0] as number[])[0] = 999;
  (first.preactivations[0] as number[])[0] = 999;
  boundaryNeuronParameters(state.params, config, 0, 0).weights[0] = 999;
  assert.deepEqual({ config, dataset, state, input }, before);
  assert.deepEqual(traceBoundary(state.params, config, input), original);
});

test('после настоящего шага trace видит новые веса; проверочные точки не входят в обновление', () => {
  const config: BoundaryConfig = { layers: [{ width: 4, activation: 'tanh' }] };
  const dataset = makeBoundaryDataset('moons', 42);
  const previous = createOptimizerState(createBoundaryParameters(config, 42));
  const probe = dataset.validation[0].input;
  const before = traceBoundary(previous.params, config, probe);
  const next = optimizerStep(previous, boundaryLossGradient(previous.params, config, dataset.train).grad, 'adam', { lr: .02 });
  const after = traceBoundary(next.params, config, probe);
  assert.equal(next.step, 1);
  assert.notDeepEqual(after.activations[1], before.activations[1]);
  assert.equal(after.probability, predictBoundary(next.params, config, probe));
  assert.deepEqual(traceBoundary(previous.params, config, probe), before);
});

test('trace и строки нейронов отклоняют неверные формы, нечисловые значения и переполнение', () => {
  const linear: BoundaryConfig = { layers: [] };
  for (const params of [[], [0, 0], [0, 0, 0, 0], [0, NaN, 0], [0, Infinity, 0], Array(3)]) {
    assert.throws(() => traceBoundary(params, linear, [.5, .5]), RangeError);
    assert.throws(() => boundaryNeuronParameters(params, linear, 0, 0), RangeError);
  }
  for (const input of [null, [], [0], [0, 0, 0], [-.1, .5], [.5, 1.1], [NaN, 0], [0, Infinity], Array(2)]) {
    assert.throws(() => traceBoundary([0, 0, 0], linear, input as [number, number]), RangeError);
  }
  for (const config of [null, {}, { layers: Array(1) }, { layers: [{ width: 0, activation: 'tanh' }] }, { layers: [{ width: 17, activation: 'relu' }] }, { layers: [{ width: 1, activation: 'unknown' }] }]) {
    assert.throws(() => traceBoundary([0, 0, 0], config as BoundaryConfig, [.5, .5]), RangeError);
  }
  for (const index of [-1, .5, 1, NaN, Infinity]) {
    assert.throws(() => boundaryNeuronParameters([0, 0, 0], linear, index, 0), RangeError);
    assert.throws(() => boundaryNeuronParameters([0, 0, 0], linear, 0, index), RangeError);
  }
  assert.throws(() => traceBoundary([Number.MAX_VALUE, Number.MAX_VALUE, 0], linear, [1, 1]), RangeError);
  assert.throws(() => traceBoundary([Number.MAX_VALUE, Number.MAX_VALUE, 0, 1, 0], { layers: [{ width: 1, activation: 'sigmoid' }] }, [1, 1]), RangeError);
});
