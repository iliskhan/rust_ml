import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialTinyParameters, tinyTransformerTrace, tinyTokenContributions, tinyEvaluate, tinySgdStep,
  TINY_GROUPS, TINY_PARAMETER_COUNT, TINY_TRAIN, TINY_VALIDATION,
} from '../src/tinyTransformerMath.ts';

const close = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≉ ${b}`);

test('all 208 analytic parameter gradients match central differences through the full block', () => {
  const p = initialTinyParameters(), analytic = tinyTransformerTrace(p, TINY_TRAIN[0]);
  assert.equal(p.length, 208);
  const epsilon = 1e-5;
  for (let i = 0; i < TINY_PARAMETER_COUNT; i++) {
    const plus = [...p], minus = [...p]; plus[i] += epsilon; minus[i] -= epsilon;
    const numerical = (tinyEvaluate(plus, [TINY_TRAIN[0]]).loss - tinyEvaluate(minus, [TINY_TRAIN[0]]).loss) / (2 * epsilon);
    close(analytic.gradients[i], numerical, 2e-7);
  }
  for (const group of TINY_GROUPS) assert.ok(analytic.gradients.slice(group.offset, group.offset + group.size).some(x => Math.abs(x) > 1e-7), group.name);
});

test('CE and attention softmax expose their actual local backward equations', () => {
  const trace = tinyTransformerTrace(initialTinyParameters(), TINY_TRAIN[0]);
  trace.probabilities.forEach((row, t) => row.forEach((p, j) => close(trace.dlogits[t][j], (p - Number(trace.targets[t] === j)) / 4)));
  trace.attention.forEach((row, t) => {
    close(row.reduce((s, x) => s + x, 0), 1);
    const weighted = row.reduce((s, x, j) => s + x * trace.attentionGradients[t][j], 0);
    row.forEach((a, j) => close(trace.scoreGradients[t][j], a * (trace.attentionGradients[t][j] - weighted)));
  });
});

test('causal mask prevents future input from changing earlier logits', () => {
  const p = initialTinyParameters();
  const original = tinyTransformerTrace(p, [0, 1, 2, 3, 0]);
  const changed = tinyTransformerTrace(p, [0, 1, 3, 2, 0]);
  assert.deepEqual(original.logits.slice(0, 2), changed.logits.slice(0, 2));
  assert.notDeepEqual(original.logits[2], changed.logits[2]);
  assert.deepEqual(original.attention.map(row => row.length), [1, 2, 3, 4]);
  const position = TINY_GROUPS.find(g => g.name === 'P')!;
  // Loss t=0 cannot use positional embedding of the future t=2.
  close(tinyTokenContributions(p, TINY_TRAIN[0], position.offset + 2 * 4)[0], 0);
});

test('token-loss contributions add to shared weights and repeated token embeddings', () => {
  const p = initialTinyParameters(), sequence = [0, 0, 1, 0, 1];
  const trace = tinyTransformerTrace(p, sequence);
  for (const group of TINY_GROUPS) {
    const terms = tinyTokenContributions(p, sequence, group.offset);
    close(terms.reduce((s, x) => s + x, 0), trace.gradients[group.offset]);
  }
  const terms = tinyTokenContributions(p, sequence, 0);
  assert.ok(terms.filter(x => Math.abs(x) > 1e-8).length > 1);
});

test('real SGD changes every parameter group and improves separate held-out contexts', () => {
  const initial = initialTinyParameters();
  const beforeTrain = tinyEvaluate(initial, TINY_TRAIN), beforeValidation = tinyEvaluate(initial, TINY_VALIDATION);
  assert.ok(TINY_TRAIN.every(train => TINY_VALIDATION.every(validation => train.join() !== validation.join())));
  let p = initial;
  for (let step = 0; step < 120; step++) p = tinySgdStep(p, TINY_TRAIN[step % TINY_TRAIN.length], .08);
  const train = tinyEvaluate(p, TINY_TRAIN), validation = tinyEvaluate(p, TINY_VALIDATION);
  assert.ok(train.loss < .08 && train.loss < beforeTrain.loss / 10);
  assert.equal(train.accuracy, 1);
  assert.ok(validation.loss < .6 && validation.loss < beforeValidation.loss);
  assert.ok(validation.accuracy >= .75); // A small familiar rule, not evidence of language generalization.
  for (const g of TINY_GROUPS) assert.ok(p.slice(g.offset, g.offset + g.size).some((x, i) => Math.abs(x - initial[g.offset + i]) > 1e-6), g.name);
  assert.deepEqual(initial, initialTinyParameters());
});

test('stable CE stays finite for a very unlikely target; invalid shapes and controls fail clearly', () => {
  const p = initialTinyParameters(), bias = TINY_GROUPS.find(g => g.name === 'bu')!;
  p[bias.offset] = 10000;
  const trace = tinyTransformerTrace(p, [0, 1]);
  assert.ok(trace.loss > 9000 && Number.isFinite(trace.loss));
  assert.ok(trace.gradients.every(Number.isFinite));
  assert.throws(() => tinyTransformerTrace([], [0, 1]), RangeError);
  assert.throws(() => tinyTransformerTrace(p, [0]), RangeError);
  assert.throws(() => tinyTransformerTrace(p, [0, 4]), RangeError);
  assert.throws(() => tinyTransformerTrace(p, [0, 1, 2, 3, 0, 1]), RangeError);
  assert.throws(() => tinySgdStep(p, [0, 1], 0), RangeError);
  assert.throws(() => tinySgdStep(p, [0, 1], NaN), RangeError);
  assert.throws(() => tinyTokenContributions(p, [0, 1], -1), RangeError);
  assert.throws(() => tinyEvaluate(p, []), RangeError);
});
