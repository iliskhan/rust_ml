import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activate, activationDerivative, linear, mse, bceProbability, bceLogit,
  sharedGraph, finiteDifference, createOptimizerState, optimizerStep,
  quadratic, createNetwork, predictNetwork, networkLossGradient, XOR_DATA,
} from '../src/math.ts';

function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Number.isFinite(actual), `Не конечное число: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test('активации: известные значения, производная по входу и ReLU в нуле', () => {
  assert.equal(activate(-2, 'relu'), 0);
  assert.equal(activate(3, 'relu'), 3);
  assert.equal(activationDerivative(-2, 'relu'), 0);
  assert.equal(activationDerivative(0, 'relu'), 0);
  assert.equal(activationDerivative(3, 'relu'), 1);
  close(activate(Math.log(3), 'sigmoid'), 0.75);
  close(activationDerivative(Math.log(3), 'sigmoid'), 3 / 16);
  close(activate(Math.log(3) / 2, 'tanh'), 0.5);
  close(activationDerivative(Math.log(3) / 2, 'tanh'), 0.75);
  assert.equal(activate(-1000, 'sigmoid'), 0);
  assert.equal(activate(1000, 'sigmoid'), 1);
});

test('Linear: два образца, три выхода и транспонированная раскладка весов', () => {
  assert.deepEqual(linear([[1, 2], [-1, 0]], [[2, 3], [-1, 4], [0, 2]], [1, -2, 3]), [[9, 5, 7], [-1, -1, 3]]);
  assert.deepEqual(linear([], [[1, 2]], [0]), []);
  assert.throws(() => linear([[1, 2]], [[1]], [0]), RangeError);
  assert.throws(() => linear([[1, 2]], [[1, 2]], []), RangeError);
  assert.throws(() => linear([[1, 2]], [[1, 2], [3]], [0, 0]), RangeError);
});

test('MSE: среднее, вклад каждого элемента и множитель 2/n', () => {
  assert.deepEqual(mse([1, 3], [0, 1]), { loss: 2.5, grad: [1, 2], terms: [1, 4] });
  assert.deepEqual(mse([2], [-1]), { loss: 9, grad: [6], terms: [9] });
  assert.throws(() => mse([], []), RangeError);
  assert.throws(() => mse([1], [1, 2]), RangeError);
});

test('BCE: ручные вероятности и производные по p и z', () => {
  close(bceProbability(0.25, 1).loss, Math.log(4));
  close(bceProbability(0.25, 1).grad, -4);
  close(bceProbability(0.25, 0).loss, Math.log(4 / 3));
  close(bceProbability(0.25, 0).grad, 4 / 3);
  close(bceLogit(0, 1).loss, Math.LN2);
  close(bceLogit(0, 1).grad, -0.5);
  close(bceLogit(Math.log(3), 0).loss, Math.log(4));
  close(bceLogit(Math.log(3), 0).grad, 0.75);
  close(bceLogit(Math.log(3), 0.5).grad, 0.25);
  assert.throws(() => bceProbability(-0.1, 0), RangeError);
  assert.throws(() => bceLogit(0, 2), RangeError);
});

test('BCE-logits остается конечной на ±1000; вероятностная BCE не скрывает бесконечность', () => {
  assert.deepEqual(bceLogit(1000, 0), { loss: 1000, grad: 1 });
  assert.deepEqual(bceLogit(-1000, 1), { loss: 1000, grad: -1 });
  assert.deepEqual(bceLogit(1000, 1), { loss: 0, grad: 0 });
  assert.deepEqual(bceLogit(-1000, 0), { loss: 0, grad: 0 });
  close(bceProbability(0, 0).loss, 0);
  close(bceProbability(0, 0).grad, 1);
  close(bceProbability(1, 1).loss, 0);
  close(bceProbability(1, 1).grad, -1);
  assert.equal(bceProbability(0, 1).loss, Infinity);
  assert.equal(bceProbability(0, 1).grad, -Infinity);
  assert.equal(bceProbability(1, 0).loss, Infinity);
  assert.equal(bceProbability(1, 0).grad, Infinity);
});

test('общий узел: два пути суммируются перед продолжением backward', () => {
  const graph = sharedGraph(2, 3, 2);
  assert.deepEqual(graph.values, { x: 2, w: 3, q: 6, p: 42, target: 2, loss: 800 });
  assert.deepEqual(graph.qContributions, { square: 480, identity: 40 });
  assert.deepEqual(graph.gradients, { loss: 1, p: 40, q: 520, x: 1560, w: 1040 });
  for (const [x, w, target] of [[2, 3, 2], [-0.7, 1.2, 0.4], [0, 2, 1]]) {
    const numerical = finiteDifference(([a, b]) => {
      const p = (a * b) ** 2 + a * b;
      return (p - target) ** 2 / 2;
    }, [x, w]);
    const analytic = sharedGraph(x, w, target).gradients;
    close(analytic.x, numerical[0], 1e-7);
    close(analytic.w, numerical[1], 1e-7);
  }
});

test('центральная разность не меняет параметры и проверяет известный полином', () => {
  const params = [2, -3];
  const gradient = finiteDifference(([x, y]) => x ** 3 + 2 * y ** 2, params);
  close(gradient[0], 12, 1e-8);
  close(gradient[1], -12, 1e-8);
  assert.deepEqual(params, [2, -3]);
  assert.throws(() => finiteDifference(() => 1, params, 0), RangeError);
});

test('SGD и momentum: два ручных шага без изменения старого состояния', () => {
  const initial = createOptimizerState([2, -1]);
  const original = structuredClone(initial);
  const sgd = optimizerStep(initial, [3, -2], 'sgd', { lr: 0.1 });
  close(sgd.params[0], 1.7);
  close(sgd.params[1], -0.8);
  const first = optimizerStep(initial, [3, -2], 'momentum', { lr: 0.1, momentum: 0.5 });
  const second = optimizerStep(first, [1, 2], 'momentum', { lr: 0.1, momentum: 0.5 });
  assert.deepEqual(first.m, [3, -2]);
  assert.deepEqual(second.m, [2.5, 1]);
  close(second.params[0], 1.45);
  close(second.params[1], -0.9);
  assert.equal(second.step, 2);
  assert.deepEqual(initial, original);
  assert.throws(() => optimizerStep(initial, [1], 'sgd'), RangeError);
  assert.throws(() => optimizerStep(initial, [1, 1], 'adam', { beta1: 1 }), RangeError);
});

test('Adam: bias correction и epsilon вне квадратного корня', () => {
  const first = optimizerStep(createOptimizerState([5]), [2], 'adam', { lr: 1, beta1: 0.5, beta2: 0.5, epsilon: 1e-12 });
  close(first.params[0], 4);
  assert.deepEqual(first.m, [1]);
  assert.deepEqual(first.v, [2]);
  const second = optimizerStep(first, [4], 'adam', { lr: 1, beta1: 0.5, beta2: 0.5, epsilon: 1e-12 });
  assert.deepEqual(second.m, [2.5]);
  assert.deepEqual(second.v, [9]);
  close(second.params[0], 4 - 10 / (3 * Math.sqrt(12)));
  const epsilonCase = optimizerStep(createOptimizerState([1]), [2], 'adam', { lr: 0.3, epsilon: 1 });
  close(epsilonCase.params[0], 0.8);
  const zero = optimizerStep(createOptimizerState([1, 2]), [0, 0], 'adam');
  assert.deepEqual(zero.params, [1, 2]);
});

test('квадратичная поверхность имеет неравные кривизны', () => {
  assert.deepEqual(quadratic([2, -3]), { loss: 38, grad: [2, -24] });
  assert.throws(() => quadratic([1]), RangeError);
});

test('сеть 2→4→1: детерминированный seed, нейтральная сеть, все 17 градиентов', () => {
  assert.equal(createNetwork(42).length, 17);
  assert.deepEqual(createNetwork(42), createNetwork(42));
  assert.notDeepEqual(createNetwork(42), createNetwork(43));
  const neutral = networkLossGradient(Array(17).fill(0));
  close(neutral.loss, Math.LN2);
  assert.deepEqual(neutral.predictions, [0.5, 0.5, 0.5, 0.5]);
  assert.ok(neutral.grad.every(g => g === 0));
  const constantParams = Array(17).fill(0);
  constantParams[16] = Math.log(3);
  const constant = networkLossGradient(constantParams);
  close(constant.loss, Math.log(16 / 3) / 2);
  constant.predictions.forEach(p => close(p, 0.75));
  close(constant.grad[16], 0.25);
  assert.ok(constant.grad.slice(0, 16).every(g => g === 0));
  for (const seed of [7, 42]) {
    const params = createNetwork(seed);
    const analytic = networkLossGradient(params).grad;
    const numerical = finiteDifference(p => networkLossGradient(p).loss, params);
    for (let i = 0; i < 17; i++) close(analytic[i], numerical[i], 1e-7);
    for (const { input } of XOR_DATA) assert.ok(predictNetwork(params, input) > 0 && predictNetwork(params, input) < 1);
  }
});

test('Adam действительно обучает XOR на нескольких seed за 3000 шагов', () => {
  for (const seed of [1, 7, 42, 1337]) {
    let state = createOptimizerState(createNetwork(seed));
    const initialLoss = networkLossGradient(state.params).loss;
    for (let step = 0; step < 3000; step++) {
      state = optimizerStep(state, networkLossGradient(state.params).grad, 'adam', { lr: 0.03 });
    }
    const trained = networkLossGradient(state.params);
    assert.ok(trained.loss < 0.02 && trained.loss < initialLoss / 10, `seed ${seed}: loss=${trained.loss}`);
    for (let i = 0; i < XOR_DATA.length; i++) {
      assert.equal(Number(trained.predictions[i] >= 0.5), XOR_DATA[i].target, `seed ${seed}, example ${i}`);
    }
  }
});
