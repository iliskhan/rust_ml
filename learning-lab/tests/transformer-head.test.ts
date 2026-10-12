import test from 'node:test';
import assert from 'node:assert/strict';
import { headCrossEntropy, headTrainingTrace, headSgdStep, transformerHeadBatch, initialHeadParameters } from '../src/transformerHeadMath.ts';
import { toyLanguageForward, TOY_EMBEDDINGS, TOY_OUTPUT_WEIGHTS, SMALL_PROJECTIONS } from '../src/transformerMath.ts';

const near = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const copy = <T,>(value: T): T => structuredClone(value);

// Independent scalar expressions rather than another call to the production softmax/CE.
test('manual affine logits, two-class softmax, CE and outer-product gradients', () => {
  const trace = headTrainingTrace([[2, -1]], [1], { weights: [[.5, -.5], [1, 2]], bias: [.25, -.25] });
  assert.deepEqual(trace.positions[0].logits, [.25, -3.25]);
  const p = 1 / (1 + Math.exp(-3.5));
  near(trace.positions[0].probabilities[0], p);
  near(trace.positions[0].probabilities[1], 1 - p);
  near(trace.loss, Math.log(1 + Math.exp(3.5)));
  near(trace.dBias[0], p); near(trace.dBias[1], -p);
  near(trace.dWeights[0][0], 2 * p); near(trace.dWeights[0][1], -2 * p);
  near(trace.dWeights[1][0], -p); near(trace.dWeights[1][1], p);
});

test('large logits, common shifts and underflow keep fused loss finite', () => {
  const ordinary = headCrossEntropy([0, -1, -2], 2);
  const shifted = headCrossEntropy([10000, 9999, 9998], 2);
  near(shifted.loss, Math.log(1 + Math.exp(-1) + Math.exp(-2)) + 2);
  near(ordinary.loss, shifted.loss);
  assert.deepEqual(ordinary.probabilities, shifted.probabilities);
  const underflow = headCrossEntropy([1000, -1000], 1);
  assert.deepEqual(underflow.probabilities, [1, 0]);
  assert.equal(underflow.loss, 2000);
  assert.deepEqual(underflow.dlogits, [1, -1]);
  near(headCrossEntropy([1e100, 1e100], 1).loss, Math.log(2));
});

test('sum then mean uses active positions and bias is summed independently of h', () => {
  const h = [[1, 0], [0, 2]], targets = [0, 1], parameters = { weights: [[0, 0], [0, 0]], bias: [0, 0] };
  const both = headTrainingTrace(h, targets, parameters);
  assert.equal(both.count, 2);
  near(both.sumLoss, 2 * Math.log(2)); near(both.loss, Math.log(2));
  assert.deepEqual(both.sumWeights, [[-.5, .5], [1, -1]]);
  assert.deepEqual(both.dWeights, [[-.25, .25], [.5, -.5]]);
  assert.deepEqual(both.dBias, [0, 0]);
  const second = headTrainingTrace(h, targets, parameters, [false, true]);
  assert.equal(second.count, 1);
  assert.deepEqual(second.dWeights, [[0, 0], [1, -1]]);
  assert.deepEqual(second.dBias, [.5, -.5]);
  near(second.loss, Math.log(2));
  const changedExcluded = headTrainingTrace([[99, -99], h[1]], [1, 1], parameters, [false, true]);
  assert.deepEqual(changedExcluded.dWeights, second.dWeights);
  assert.deepEqual(changedExcluded.dBias, second.dBias);
  assert.equal(changedExcluded.loss, second.loss);
});

test('teacher forcing next-token shift matches current course and first hidden is manual', () => {
  const batch = transformerHeadBatch();
  assert.deepEqual(batch.inputIds, [0, 1, 2, 4]);
  assert.deepEqual(batch.targets, [1, 2, 4, 5]);
  // At t=0 only its own V=[.75,.5] is visible; residual x=[.5,.5].
  assert.deepEqual(batch.hidden[0], [1.25, 1]);
  const trace = headTrainingTrace(batch.hidden, batch.targets, initialHeadParameters());
  const current = toyLanguageForward(batch.inputIds);
  for (let t = 0; t < 4; t++) {
    assert.deepEqual(trace.positions[t].logits, current.logits[t]);
    assert.deepEqual(trace.positions[t].probabilities, current.probabilities[t]);
    near(trace.positions[t].loss, -Math.log(current.probabilities[t][batch.targets[t]]));
  }
});

test('causal features cannot see a changed target or any later input', () => {
  const original = [0, 1, 2, 4, 5];
  const baseline = transformerHeadBatch(original);
  for (let t = 0; t < baseline.hidden.length; t++) {
    const changed = [...original];
    for (let future = t + 1; future < changed.length; future++) changed[future] = 3;
    const after = transformerHeadBatch(changed);
    for (let prefix = 0; prefix <= t; prefix++) assert.deepEqual(after.hidden[prefix], baseline.hidden[prefix]);
    for (let key = t + 1; key < baseline.hidden.length; key++) assert.equal(baseline.backbone.attention.weights[t][key], 0);
  }
});

test('central finite differences check each of 12 W and 6 bias for full and masked mean', () => {
  const batch = transformerHeadBatch();
  const parameters = initialHeadParameters();
  parameters.bias = [.15, -.2, .3, -.1, .05, -.05];
  const epsilon = 1e-5;
  for (const active of [[true, true, true, true], [true, false, true, false]]) {
    const analytic = headTrainingTrace(batch.hidden, batch.targets, parameters, active);
    for (let d = 0; d < 2; d++) for (let j = 0; j < 6; j++) {
      const plus = copy(parameters), minus = copy(parameters);
      plus.weights[d][j] += epsilon; minus.weights[d][j] -= epsilon;
      const numeric = (headTrainingTrace(batch.hidden, batch.targets, plus, active).loss - headTrainingTrace(batch.hidden, batch.targets, minus, active).loss) / (2 * epsilon);
      near(analytic.dWeights[d][j], numeric, 2e-8);
    }
    for (let j = 0; j < 6; j++) {
      const plus = copy(parameters), minus = copy(parameters);
      plus.bias[j] += epsilon; minus.bias[j] -= epsilon;
      const numeric = (headTrainingTrace(batch.hidden, batch.targets, plus, active).loss - headTrainingTrace(batch.hidden, batch.targets, minus, active).loss) / (2 * epsilon);
      near(analytic.dBias[j], numeric, 2e-8);
    }
  }
});

test('SGD is simultaneous and immutable; frozen backbone and all inputs remain unchanged', () => {
  const batch = transformerHeadBatch(), parameters = initialHeadParameters(), active = [true, false, true, true];
  const before = copy({ batch, parameters, active, embeddings: TOY_EMBEDDINGS, output: TOY_OUTPUT_WEIGHTS, projections: SMALL_PROJECTIONS });
  batch.hidden.forEach(Object.freeze); Object.freeze(batch.hidden);
  parameters.weights.forEach(Object.freeze); Object.freeze(parameters.weights); Object.freeze(parameters.bias); Object.freeze(parameters);
  Object.freeze(batch.targets); Object.freeze(active);
  const result = headSgdStep(batch.hidden, batch.targets, parameters, .1, active);
  for (let d = 0; d < 2; d++) for (let j = 0; j < 6; j++) near(result.parameters.weights[d][j], parameters.weights[d][j] - .1 * result.before.dWeights[d][j]);
  for (let j = 0; j < 6; j++) near(result.parameters.bias[j], parameters.bias[j] - .1 * result.before.dBias[j]);
  assert.notStrictEqual(result.parameters.weights, parameters.weights);
  assert.notStrictEqual(result.parameters.bias, parameters.bias);
  assert.deepEqual({ batch, parameters, active, embeddings: TOY_EMBEDDINGS, output: TOY_OUTPUT_WEIGHTS, projections: SMALL_PROJECTIONS }, before);
  assert.deepEqual(transformerHeadBatch().hidden, batch.hidden);
});

test('deterministic safe SGD lowers loss and completes the action challenge in 20 steps', () => {
  const batch = transformerHeadBatch();
  const train = () => {
    let parameters = initialHeadParameters();
    const initial = headTrainingTrace(batch.hidden, batch.targets, parameters).loss;
    for (let step = 0; step < 20; step++) {
      const result = headSgdStep(batch.hidden, batch.targets, parameters, .1);
      assert.ok(result.after.loss < result.before.loss);
      parameters = result.parameters;
    }
    const final = headTrainingTrace(batch.hidden, batch.targets, parameters).loss;
    assert.ok(initial - final >= .35, `${initial} -> ${final}`);
    return { parameters, initial, final };
  };
  assert.deepEqual(train(), train());
  assert.deepEqual(initialHeadParameters().weights, TOY_OUTPUT_WEIGHTS);
});

test('reject invalid logits, targets, matrix shapes, nonfinite values, masks and rates', () => {
  for (const [logits, target] of [[[], 0], [[NaN], 0], [[Infinity], 0], [[-Infinity], 0], [[0, 1], -1], [[0, 1], 2], [[0, 1], .5], [[0, 1], NaN]] as [number[], number][]) {
    assert.throws(() => headCrossEntropy(logits, target), RangeError);
  }
  const h = [[1, 2]], targets = [0], parameters = { weights: [[1, 2], [3, 4]], bias: [0, 0] };
  for (const invalid of [[], [[1]], [[1, NaN]], [[1, Infinity]], [[1, 2], [3]]]) {
    assert.throws(() => headTrainingTrace(invalid, targets, parameters), RangeError);
  }
  for (const weights of [[], [[1, 2]], [[1, 2], [1]], [[NaN, 2], [1, 2]]]) {
    assert.throws(() => headTrainingTrace(h, targets, { ...parameters, weights }), RangeError);
  }
  for (const bias of [[], [0], [NaN, 0], [0, Infinity]]) assert.throws(() => headTrainingTrace(h, targets, { ...parameters, bias }), RangeError);
  for (const target of [[], [2], [-1], [.5], [NaN], [0, 1]]) assert.throws(() => headTrainingTrace(h, target, parameters), RangeError);
  for (const mask of [[], [false], [true, false], [1] as unknown as boolean[]]) assert.throws(() => headTrainingTrace(h, targets, parameters, mask), RangeError);
  for (const rate of [0, -.1, NaN, Infinity]) assert.throws(() => headSgdStep(h, targets, parameters, rate), RangeError);
  assert.throws(() => headTrainingTrace([[Number.MAX_VALUE, Number.MAX_VALUE]], targets, parameters), RangeError);
});

test('reject invalid teacher sequences and keep caller sequence immutable', () => {
  for (const sequence of [[], [0], [0, 6], [0, -1], [0, .5], [0, NaN]]) assert.throws(() => transformerHeadBatch(sequence), RangeError);
  const sequence = [0, 1, 3, 4, 5], snapshot = [...sequence];
  Object.freeze(sequence);
  transformerHeadBatch(sequence);
  assert.deepEqual(sequence, snapshot);
});
