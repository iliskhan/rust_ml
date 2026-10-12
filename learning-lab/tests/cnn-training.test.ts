import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, copyCnnMatrix, createCnnParameters,
  cnnLossGradient, cnnSgdStep, checkCnnTrainingPractice,
} from '../src/cnnTrainingMath.ts';

const close = (actual: number, expected: number, tolerance = 1e-8) => {
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
};
// Independent scalar reference: does not call conv2d or the training trace.
function referenceLoss(input: number[][], target: number[][], weights: number[][], bias: number) {
  let sum = 0;
  for (let y = 0; y < target.length; y++) for (let x = 0; x < target[0].length; x++) {
    let value = bias;
    for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) value += input[y + ky][x + kx] * weights[ky][kx];
    sum += (value - target[y][x]) ** 2;
  }
  return sum / (target.length * target[0].length);
}
function centralDifference(fn: (value: number) => number, value: number) {
  const epsilon = 1e-5;
  return (fn(value + epsilon) - fn(value - epsilon)) / (2 * epsilon);
}

test('CNN: ручное окно 3×3 сохраняет ориентацию cross-correlation и производные', () => {
  const input = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
  const trace = cnnLossGradient(input, [[280]], { weights: copyCnnMatrix(input), bias: 1 });
  assert.deepEqual(trace.prediction, [[286]]); // 1²+…+9² + 1
  assert.equal(trace.loss, 36);
  assert.equal(trace.biasGradient, 12);
  assert.deepEqual(trace.weightGradient, input.map(row => row.map(value => 12 * value)));
  assert.deepEqual(trace.inputGradient, trace.weightGradient);
  assert.equal(trace.windows[0].delta, 12);
});

test('CNN: ручная сумма четырёх окон и перекрывающиеся производные входа', () => {
  const input = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]];
  const weights = [[1, 0, -1], [0, 2, 0], [-1, 0, 1]];
  const trace = cnnLossGradient(input, [[0, 0], [0, 0]], { weights, bias: 0.5 });
  assert.deepEqual(trace.prediction, [[12.5, 14.5], [20.5, 22.5]]);
  assert.equal(trace.loss, 323.25);
  assert.deepEqual(trace.windows.map(window => window.delta), [6.25, 7.25, 10.25, 11.25]);
  assert.equal(trace.weightGradient[0][0], 139.5);
  assert.equal(trace.biasGradient, 35);
  assert.equal(trace.inputGradient[1][1], 23.75); // 6.25×2 + 11.25×1
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    close(trace.weightGradient[y][x], trace.windows.reduce((sum, window) => sum + window.weightContributions[y][x], 0));
  }
});

test('CNN: все 9 весов, bias и каждый вход совпадают с независимыми конечными разностями', () => {
  for (const [height, width, offset] of [[5, 5, 0.3], [3, 6, -0.7], [6, 4, 1.1]]) {
    const input = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => Math.sin(y * width + x + offset)));
    const weights = Array.from({ length: 3 }, (_, y) => Array.from({ length: 3 }, (_, x) => Math.cos(y * 3 + x + offset) * 0.4));
    const target = Array.from({ length: height - 2 }, (_, y) => Array.from({ length: width - 2 }, (_, x) => (y - x) * 0.2));
    const bias = offset, original = JSON.stringify({ input, target, weights });
    const trace = cnnLossGradient(input, target, { weights, bias });
    close(trace.loss, referenceLoss(input, target, weights, bias));
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      const numerical = centralDifference(value => {
        const changed = copyCnnMatrix(weights); changed[y][x] = value;
        return referenceLoss(input, target, changed, bias);
      }, weights[y][x]);
      close(trace.weightGradient[y][x], numerical);
    }
    close(trace.biasGradient, centralDifference(value => referenceLoss(input, target, weights, value), bias));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const numerical = centralDifference(value => {
        const changed = copyCnnMatrix(input); changed[y][x] = value;
        return referenceLoss(changed, target, weights, bias);
      }, input[y][x]);
      close(trace.inputGradient[y][x], numerical);
    }
    assert.equal(JSON.stringify({ input, target, weights }), original);
  }
});

test('CNN: исходный ручной градиент учитывает все девять окон и среднее MSE', () => {
  const trace = cnnLossGradient(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, createCnnParameters());
  close(trace.loss, 2 / 3);
  close(trace.biasGradient, -4 / 3);
  trace.weightGradient.forEach(row => { close(row[0], 0); close(row[1], -2 / 3); close(row[2], -4 / 3); });
  assert.deepEqual(trace.inputGradient, CNN_TRAINING_INPUT.map(row => row.map(() => 0)));
  const step = cnnSgdStep(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, createCnnParameters(), 0.05);
  close(step.parameters.bias, 1 / 15);
  step.parameters.weights.forEach(row => { close(row[0], 0); close(row[1], 1 / 30); close(row[2], 1 / 15); });
});

test('CNN: безопасный SGD снижает MSE, воспроизводим и не меняет вход/старые параметры', () => {
  function run() {
    let parameters = createCnnParameters(), previous = 2 / 3;
    for (let n = 0; n < 100; n++) {
      const original = JSON.stringify(parameters);
      const step = cnnSgdStep(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, parameters, 0.05);
      assert.equal(JSON.stringify(parameters), original);
      assert.ok(step.after.loss < previous);
      previous = step.after.loss; parameters = step.parameters;
    }
    assert.ok(previous < 0.05);
    assert.ok(checkCnnTrainingPractice(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, parameters, 100).passed);
    return parameters;
  }
  assert.deepEqual(run(), run());
  assert.deepEqual(CNN_TRAINING_TARGET, [[1, 1, 0], [1, 1, 0], [1, 1, 0]]);
  for (const learningRate of [0.001, 0.1]) {
    assert.ok(cnnSgdStep(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, createCnnParameters(), learningRate).after.loss < 2 / 3);
  }
});

test('CNN: практика требует изменения весов и настоящего уменьшения loss', () => {
  const start = createCnnParameters();
  assert.equal(checkCnnTrainingPractice(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, start, 100).passed, false);
  const changed = copyCnnMatrix(CNN_TRAINING_INPUT); changed[0][0] = 0.1;
  assert.equal(checkCnnTrainingPractice(changed, CNN_TRAINING_TARGET, start, 100).passed, false);
  assert.equal(checkCnnTrainingPractice(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, { weights: [[-1 / 3, 0, 1 / 3], [-1 / 3, 0, 1 / 3], [-1 / 3, 0, 1 / 3]], bias: 0 }, 0).passed, false);
  const perfect = { weights: [[-1, 0, 1], [0, 0, 0], [0, 0, 0]], bias: 0 };
  const unchanged = cnnSgdStep(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, perfect, 0.05);
  assert.equal(unchanged.after.loss, 0);
  assert.equal(checkCnnTrainingPractice(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, unchanged.parameters, 1, 0).passed, false);
});

test('CNN: граничные размеры и ошибки форм/неfinite/переполнение отклоняются явно', () => {
  const start = createCnnParameters();
  const trace = cnnLossGradient(Array.from({ length: 32 }, () => Array(32).fill(0)), Array.from({ length: 30 }, () => Array(30).fill(0)), start);
  assert.equal(trace.windows.length, 900);
  for (const input of [[], [[]], [[0, 0], [0, 0]], [[0, 1, 2], [0]], [[0, 0, NaN], [0, 0, 0], [0, 0, 0]], Array.from({ length: 33 }, () => [0, 0, 0])]) {
    assert.throws(() => cnnLossGradient(input, [[0]], start), RangeError);
  }
  assert.throws(() => cnnLossGradient(CNN_TRAINING_INPUT, [[0]], start), RangeError);
  assert.throws(() => cnnLossGradient(CNN_TRAINING_INPUT, [[NaN, 0, 0], [0, 0, 0], [0, 0, 0]], start), RangeError);
  assert.throws(() => cnnLossGradient(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, { weights: [[1]], bias: 0 }), RangeError);
  for (const value of [Infinity, -Infinity, NaN]) {
    assert.throws(() => cnnLossGradient(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, { ...start, bias: value }), RangeError);
    assert.throws(() => cnnLossGradient(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, { weights: [[value, 0, 0], [0, 0, 0], [0, 0, 0]], bias: 0 }), RangeError);
  }
  assert.throws(() => cnnLossGradient(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, { ...start, bias: 1e308 }), RangeError);
  for (const value of [0, -1, 1.1, NaN, Infinity]) assert.throws(() => cnnSgdStep(CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, start, value), RangeError);
});
