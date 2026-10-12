import test from 'node:test';
import assert from 'node:assert/strict';
import { bptt, trainBptt } from '../src/bpttMath.ts';
import type { RecurrentWeights } from '../src/architectures.ts';

const close = (actual: number, expected: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} differs from ${expected}`);
const difference = (fn: (x: number) => number, x: number) => (fn(x + 1e-6) - fn(x - 1e-6)) / 2e-6;

// Independent forward, deliberately does not call the implementation under test.
function loss(input: readonly number[], weights: RecurrentWeights, target: number, h0: number) {
  let state = h0;
  for (const x of input) state = Math.tanh(weights.wx * x + weights.wh * state + weights.b);
  return (state - target) ** 2 / 2;
}

test('BPTT matches an independent two-step hand calculation and adds both shared-weight contributions', () => {
  // atanh(1/2) = log(3)/2. Both states are 1/2, so tanh prime is 3/4.
  const a = Math.log(3) / 2;
  const trace = bptt([a, a - 0.25], { wx: 1, wh: 0.5, b: 0 }, -0.5);
  close(trace.loss, 0.5);
  close(trace.prediction, 0.5);
  const [first, last] = trace.steps;
  close(last.dh, 1); close(last.dz, 0.75); close(last.dx, 0.75);
  close(last.dWx, 0.75 * (a - 0.25)); close(last.dWh, 0.375); close(last.db, 0.75);
  close(first.dh, 0.375); close(first.dz, 0.28125); close(first.dx, 0.28125);
  close(first.dWx, 0.28125 * a); close(first.dWh, 0); close(first.db, 0.28125);
  close(trace.gradients.wx, 1.03125 * a - 0.1875);
  close(trace.gradients.wh, 0.375); close(trace.gradients.b, 1.03125); close(trace.dh0, 0.140625);
});

for (const length of [1, 4, 9, 16]) {
  for (const wh of [0.7, -1.2]) {
    test(`BPTT finite differences for all weights, h0, selected inputs and states: T=${length}, Wh=${wh}`, () => {
      const input = Array.from({ length }, (_, i) => 0.4 * Math.sin(i * 1.3 + 0.7));
      const weights = { wx: -0.6, wh, b: 0.04 }, target = 0.3, h0 = -0.15;
      const trace = bptt(input, weights, target, h0);
      close(trace.loss, loss(input, weights, target, h0));
      for (const key of ['wx', 'wh', 'b'] as const) {
        close(trace.gradients[key], difference(value => loss(input, { ...weights, [key]: value }, target, h0), weights[key]));
      }
      close(trace.dh0, difference(value => loss(input, weights, target, value), h0));
      for (const i of new Set([0, Math.floor(length / 2), length - 1])) {
        close(trace.steps[i].dx, difference(value => loss(input.map((x, j) => j === i ? value : x), weights, target, h0), input[i]));
        // Treat h_t as an independent variable, then run only the remaining suffix.
        close(trace.steps[i].dh, difference(value => loss(input.slice(i + 1), weights, target, value), trace.steps[i].h));
      }
      close(trace.gradients.wx, trace.steps.reduce((sum, row) => sum + row.dWx, 0));
      close(trace.gradients.wh, trace.steps.reduce((sum, row) => sum + row.dWh, 0));
      close(trace.gradients.b, trace.steps.reduce((sum, row) => sum + row.db, 0));
    });
  }
}

test('zero recurrent weight removes all earlier loss paths, but its own gradient can remain nonzero', () => {
  const trace = bptt([0.8, -0.4, 0.6, 0.1], { wx: 0.8, wh: 0, b: 0.1 }, -0.5, 0.1);
  for (const row of trace.steps.slice(0, -1)) {
    assert.equal(row.dh, 0); assert.equal(row.dx, 0); assert.equal(row.db, 0);
  }
  assert.equal(trace.dh0, 0);
  assert.notEqual(trace.gradients.wh, 0);
  close(trace.gradients.b, trace.steps.at(-1)!.db);
});

test('zero trajectory exposes exact decay and growth from Wh; tanh saturation suppresses it', () => {
  const input = Array(12).fill(0);
  for (const wh of [0.5, 1.6, -1.6]) {
    const trace = bptt(input, { wx: 0.8, wh, b: 0 }, 0.5);
    trace.steps.forEach(row => {
      assert.equal(row.h, 0); assert.equal(row.tanhDerivative, 1);
      close(row.dh, -0.5 * wh ** (12 - row.t));
    });
    close(trace.dh0, -0.5 * wh ** 12);
  }
  const saturated = bptt(input, { wx: 0.8, wh: 1.6, b: 2 }, 0.5);
  assert.ok(saturated.steps.every(row => Math.abs(row.recurrentDerivative) < 1));
  assert.ok(Math.abs(saturated.steps[0].dh) < Math.abs(saturated.steps.at(-1)!.dh));
});

test('exact target gives zero loss and every gradient is zero', () => {
  const input = [0.3, -0.2, 0.1, 0.7], weights = { wx: 0.8, wh: -0.7, b: 0.1 };
  const target = bptt(input, weights, 0).prediction;
  const trace = bptt(input, weights, target);
  assert.equal(trace.loss, 0);
  assert.deepEqual(trace.gradients, { wx: 0, wh: 0, b: 0 });
  close(trace.dh0, 0);
  trace.steps.forEach(row => [row.dh, row.dz, row.dx].forEach(value => close(value, 0)));
});

test('one real SGD step uses full summed gradients and reduces the practice loss', () => {
  const input = [0.8, -0.4, 0.6, 0.1], weights = { wx: 0.8, wh: 0.7, b: 0.1 };
  const result = trainBptt(input, weights, -0.5, 0.1, 0.05);
  for (const key of ['wx', 'wh', 'b'] as const) close(result.weights[key], weights[key] - 0.05 * result.before.gradients[key]);
  assert.ok(result.after.loss < result.before.loss);
  close(result.after.loss, loss(input, result.weights, -0.5, 0.1));
  assert.deepEqual(result.losses, [result.before.loss, result.after.loss]);
});

test('bounded SGD package recomputes gradients, is reproducible, and does not mutate its inputs', () => {
  const input = Object.freeze([0.8, -0.4, 0.6, 0.1]);
  const weights = Object.freeze({ wx: 0.8, wh: 0.7, b: 0.1 });
  const inputCopy = [...input], weightCopy = { ...weights };
  const batch = trainBptt(input, weights, -0.5, 0.1, 0.05, 10);
  let current: RecurrentWeights = { ...weights };
  for (let i = 0; i < 10; i++) current = trainBptt(input, current, -0.5, 0.1, 0.05).weights;
  assert.deepEqual(batch.weights, current);
  assert.deepEqual(batch, trainBptt(input, weights, -0.5, 0.1, 0.05, 10));
  assert.ok(batch.after.loss < batch.before.loss);
  assert.equal(batch.losses.length, 11);
  assert.deepEqual(input, inputCopy); assert.deepEqual(weights, weightCopy);
});

test('finite saturation is stable; overflow is rejected rather than returning nonfinite data', () => {
  const saturated = bptt([2, 2, 2, 2], { wx: 100, wh: 100, b: 100 }, -1);
  assert.equal(saturated.loss, 2);
  assert.deepEqual(saturated.gradients, { wx: 0, wh: 0, b: 0 });
  assert.throws(() => bptt([2], { wx: Number.MAX_VALUE, wh: 0, b: 0 }, 0), /Переполнение/);
  assert.throws(() => bptt([0], { wx: 0, wh: 0, b: 0 }, Number.MAX_VALUE), /Переполнение/);
  assert.throws(() => trainBptt([0], { wx: 0, wh: 0, b: 0 }, Number.MAX_VALUE, 0, 0.1), /Переполнение/);
});

test('BPTT validates lengths and every scalar, including h0 and each input', () => {
  const valid = { wx: 0.8, wh: 0.7, b: 0.1 };
  for (const input of [[], Array(17).fill(0)]) assert.throws(() => bptt(input, valid, 0), RangeError);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.throws(() => bptt([0, value], valid, 0), /конечными/);
    assert.throws(() => bptt([0], valid, value), /конечными/);
    assert.throws(() => bptt([0], valid, 0, value), /конечными/);
    for (const key of ['wx', 'wh', 'b'] as const) assert.throws(() => bptt([0], { ...valid, [key]: value }, 0), /конечными/);
  }
  assert.throws(() => bptt(new Array(4), valid, 0), /конечными/);
});

test('SGD validates eta and package size without changing the supplied weights', () => {
  const weights = Object.freeze({ wx: 0.8, wh: 0.7, b: 0.1 });
  for (const eta of [0, -0.1, 1.01, Infinity, NaN]) assert.throws(() => trainBptt([0], weights, 0, 0, eta), /Шаг/);
  for (const count of [0, 21, 1.5, Infinity, NaN]) assert.throws(() => trainBptt([0], weights, 0, 0, 0.1, count), /Пакет/);
  assert.deepEqual(weights, { wx: 0.8, wh: 0.7, b: 0.1 });
});
