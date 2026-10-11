import test from 'node:test';
import assert from 'node:assert/strict';
import { bceLogit, bceProbability, createNetwork, finiteDifference, networkLossGradient, predictNetwork, XOR_DATA } from '../src/math.ts';
import { networkParameterName, traceNetwork } from '../src/networkTrace.ts';

function close(actual: number, expected: number, tolerance = 1e-10) {
  assert.ok(Number.isFinite(actual), `Не конечное число: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test('trace: forward совпадает с predictNetwork и сохраняет вклады каждой связи', () => {
  for (const seed of [1, 42, 1337]) {
    const parameters = createNetwork(seed);
    const original = [...parameters];
    for (const input of [[0, 0], [0, 1], [1, 0], [1, 1], [-0.4, 1.3]] as [number, number][]) {
      const trace = traceNetwork(parameters, input, 1);
      assert.equal(trace.probability, predictNetwork(parameters, input));
      assert.deepEqual(trace.input, input);
      assert.notEqual(trace.input, input);
      assert.equal(trace.hidden.length, 4);
      for (const h of trace.hidden) {
        assert.deepEqual(h.inputContributions, [parameters[2 * h.index] * input[0], parameters[2 * h.index + 1] * input[1]]);
        close(h.z, h.inputContributions[0] + h.inputContributions[1] + parameters[8 + h.index]);
        close(h.activation, Math.tanh(h.z));
        close(h.activationSlope, 1 - h.activation ** 2);
        close(trace.outputContributions[h.index], h.activation * parameters[12 + h.index]);
      }
      close(trace.logit, trace.outputContributions.reduce((sum, value) => sum + value, parameters[16]));
      close(trace.loss, bceLogit(trace.logit, 1).loss);
    }
    assert.deepEqual(parameters, original);
  }
});

test('trace: все 17 производных параметров и оба входа совпадают с центральными разностями', () => {
  const examples: { parameters: number[]; input: [number, number]; target: number }[] = [
    { parameters: createNetwork(7), input: [0.3, -0.8], target: 0 },
    { parameters: createNetwork(42), input: [1, 1], target: 1 },
    { parameters: createNetwork(1337).map((value, index) => value * 1.7 + (index % 3 - 1) * 0.2), input: [-1.2, 0.6], target: 0.35 },
  ];
  for (const { parameters, input, target } of examples) {
    const trace = traceNetwork(parameters, input, target);
    // Use the existing prediction and probability loss, independently of traceNetwork.
    const parameterGradient = finiteDifference(p => bceProbability(predictNetwork(p, input), target).loss, parameters);
    const inputGradient = finiteDifference(([x0, x1]) => bceProbability(predictNetwork(parameters, [x0, x1]), target).loss, input);
    const outputLoss = (activations: number[]) => bceLogit(activations.reduce((sum, value, index) => sum + parameters[12 + index] * value, parameters[16]), target).loss;
    const activationGradient = finiteDifference(outputLoss, trace.hidden.map(h => h.activation));
    const preactivationGradient = finiteDifference(values => outputLoss(values.map(Math.tanh)), trace.hidden.map(h => h.z));
    assert.equal(trace.parameterGradient.length, 17);
    trace.parameterGradient.forEach((gradient, index) => close(gradient, parameterGradient[index], 1e-7));
    trace.inputGradient.forEach((gradient, index) => close(gradient, inputGradient[index], 1e-7));
    for (const h of trace.hidden) {
      close(h.dLossDActivation, activationGradient[h.index], 1e-7);
      close(h.dLossDPreactivation, preactivationGradient[h.index], 1e-7);
    }
  }
});

test('trace: среднее четырёх отдельных backward равно networkLossGradient', () => {
  for (const seed of [1, 7, 42, 1337]) {
    const parameters = createNetwork(seed);
    const batch = networkLossGradient(parameters);
    const traces = XOR_DATA.map(({ input, target }) => traceNetwork(parameters, input, target));
    close(traces.reduce((sum, trace) => sum + trace.loss / 4, 0), batch.loss);
    for (let index = 0; index < 17; index++) {
      close(traces.reduce((sum, trace) => sum + trace.parameterGradient[index] / 4, 0), batch.grad[index]);
    }
    assert.deepEqual(traces.map(trace => trace.probability), batch.predictions);
  }
});

test('trace: ручной ответ нулевой сети сохраняет ±0.5 градиент выходного bias одного примера', () => {
  for (const target of [0, 1]) {
    const trace = traceNetwork(Array(17).fill(0), [0.4, -0.6], target);
    close(trace.logit, 0);
    close(trace.probability, 0.5);
    close(trace.loss, Math.LN2);
    close(trace.dLossDLogit, 0.5 - target);
    trace.hidden.forEach(h => {
      close(h.z, 0);
      close(h.activation, 0);
      close(h.activationSlope, 1);
      close(h.dLossDActivation, 0);
      close(h.dLossDPreactivation, 0);
    });
    trace.parameterGradient.slice(0, 16).forEach(gradient => close(gradient, 0));
    close(trace.parameterGradient[16], 0.5 - target);
    trace.inputGradient.forEach(gradient => close(gradient, 0));
  }
});

test('trace: устойчивый BCE и backward при экстремальных логитах ±1000', () => {
  for (const logit of [-1000, 1000]) {
    const parameters = Array(17).fill(0);
    parameters[16] = logit;
    for (const target of [0, 0.25, 1]) {
      const trace = traceNetwork(parameters, [1, 1], target);
      const expectedProbability = logit > 0 ? 1 : 0;
      close(trace.probability, expectedProbability);
      close(trace.loss, logit > 0 ? logit * (1 - target) : -logit * target);
      close(trace.dLossDLogit, expectedProbability - target);
      assert.ok([...trace.parameterGradient, ...trace.inputGradient].every(Number.isFinite));
    }
  }
});

test('trace: формы, нечисловые значения, target и переполнение отклоняются', () => {
  const parameters = createNetwork();
  for (const invalid of [[], parameters.slice(1), [...parameters, 1], Array(17), parameters.map((value, index) => index === 3 ? NaN : value), parameters.map((value, index) => index === 8 ? Infinity : value)]) {
    assert.throws(() => traceNetwork(invalid, [0, 1], 0), RangeError);
  }
  for (const invalid of [[], [1], [1, 2, 3], [NaN, 0], [0, Infinity], Array(2)]) {
    assert.throws(() => traceNetwork(parameters, invalid as [number, number], 0), RangeError);
  }
  for (const target of [-0.1, 1.1, NaN, Infinity]) assert.throws(() => traceNetwork(parameters, [0, 1], target), RangeError);
  const overflowing = Array(17).fill(0);
  overflowing[0] = Number.MAX_VALUE;
  assert.throws(() => traceNetwork(overflowing, [2, 0], 1), RangeError);
});

test('имена параметров отражают индексы реального массива весов', () => {
  assert.deepEqual(Array.from({ length: 17 }, (_, index) => networkParameterName(index)), [
    'W1[0,0]', 'W1[0,1]', 'W1[1,0]', 'W1[1,1]', 'W1[2,0]', 'W1[2,1]', 'W1[3,0]', 'W1[3,1]',
    'b1[0]', 'b1[1]', 'b1[2]', 'b1[3]', 'W2[0]', 'W2[1]', 'W2[2]', 'W2[3]', 'b2',
  ]);
  for (const index of [-1, 17, 0.5, Infinity, NaN]) assert.throws(() => networkParameterName(index), RangeError);
});
