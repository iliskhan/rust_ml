import test from 'node:test';
import assert from 'node:assert/strict';
import { activation, activationDerivative, adaptationData, adaptationDelta, adaptationGradients, adaptationInitial,
  adaptationLoss, adaptationPredict, adaptationStep, applyBpe, BASE_WEIGHT, bpePairs, ffnTrace,
  mergeBpePair, trainAdaptation, trainBpe, type AdaptationState, type FfnKind } from '../src/tokenAdaptationMath.ts';

const near = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
const fd = (f: (x: number) => number, x: number) => (f(x + 1e-5) - f(x - 1e-5)) / 2e-5;

test('BPE counts overlapping pairs but replaces without overlap, preserving exact text', () => {
  assert.equal(bpePairs(Array.from('aaaa'))[0].count, 3);
  assert.deepEqual(mergeBpePair(Array.from('aaaa'), { left: 'a', right: 'a' }), ['aa', 'aa']);
  assert.deepEqual(trainBpe('aaaa', 2).steps.map(step => [step.pair.left, step.pair.right, step.pair.count]), [['a', 'a', 3], ['aa', 'aa', 1]]);
  const corpus = '🦊🦊 а\nа e\u0301 é';
  for (let merges = 0; merges <= 20; merges++) {
    const model = trainBpe(corpus, merges), encoded = applyBpe(corpus, model);
    assert.equal(encoded.decoded, corpus);
    assert.deepEqual(encoded.tokens, model.tokens);
    assert.ok(encoded.ids.every(id => id !== null));
    assert.equal(encoded.ids.map(id => model.vocabulary[id!]).join(''), corpus);
    assert.equal(model.vocabulary.length, new Set(model.vocabulary).size);
  }
});

test('BPE deterministic frequency ties and merge order do not retrain on inference text', () => {
  const model = trainBpe('abac', 1);
  assert.deepEqual(model.steps[0].pair, { left: 'a', right: 'b', count: 1 });
  assert.deepEqual(trainBpe('abac', 1), model);
  assert.deepEqual(applyBpe('acacac', model).tokens, ['a', 'c', 'a', 'c', 'a', 'c']);
  assert.deepEqual(applyBpe('aba🦊', model).tokens, ['ab', 'a', '🦊']);
  assert.equal(applyBpe('aba🦊', model).ids.at(-1), null);
  assert.equal(applyBpe('aba🦊', model).decoded, 'aba🦊');
  assert.deepEqual(trainBpe('', 20).steps, []);
  assert.deepEqual(trainBpe('🦊', 20).tokens, ['🦊']);
  assert.throws(() => trainBpe('x', -1), RangeError);
  assert.throws(() => trainBpe('x', 1.5), RangeError);
});

test('GELU approximation and SiLU analytic derivatives match central differences throughout range', () => {
  for (const kind of ['gelu', 'swiglu'] as FfnKind[]) for (const x of [-7, -3, -1, -.3, 0, .3, 1, 3, 7]) {
    near(activationDerivative(x, kind), fd(v => activation(v, kind), x));
  }
  near(activation(0, 'gelu'), 0); near(activationDerivative(0, 'gelu'), .5);
  near(activationDerivative(0, 'swiglu'), .5);
  assert.ok(activation(-1, 'swiglu') < 0);
  assert.ok(activation(2, 'swiglu') > 1);
  assert.equal(activationDerivative(-1, 'relu'), 0);
  assert.equal(activationDerivative(1, 'relu'), 1);
  assert.equal(activationDerivative(0, 'relu'), 0);
});

test('FFN real gate/up/product/down chain derivatives match perturbed output', () => {
  for (const kind of ['relu', 'gelu', 'swiglu'] as FfnKind[]) for (const x of [-1.2, -.1, .7, 1.4]) {
    const input = [x, -.4, .6], trace = ffnTrace(input, kind);
    trace.output.forEach((_, i) => near(trace.derivative[i], fd(v => ffnTrace([v, input[1], input[2]], kind).output[i], x)));
    trace.rows.forEach((row, j) => near(row.derivative, fd(v => ffnTrace([v, input[1], input[2]], kind).rows[j].product, x)));
    if (kind === 'swiglu') trace.rows.forEach(row => {
      near(row.dProductDGate, fd(v => activation(v, 'swiglu') * row.up, row.gate));
      near(row.dProductDUp, fd(v => activation(row.gate, 'swiglu') * v, row.up));
      near(row.product, row.activated * row.up);
    });
  }
  assert.deepEqual(ffnTrace([0, 0, 0], 'swiglu').output, [0, 0, 0]);
  assert.equal(ffnTrace([1, 1, 1], 'gelu').parameters, 24);
  assert.equal(ffnTrace([1, 1, 1], 'swiglu').parameters, 36);
  assert.throws(() => ffnTrace([1, 2], 'relu'), RangeError);
});

test('LoRA identity start, one-factor gradient, and zero-zero initialization trap', () => {
  const initial = adaptationInitial(2), data = adaptationData(3).train;
  assert.ok(initial.a.flat().some(v => v !== 0));
  assert.ok(adaptationDelta(initial).flat().every(v => v === 0));
  assert.deepEqual(adaptationPredict(initial, data[0].x, 'lora'), adaptationPredict(initial, data[0].x, 'full'));
  const grad = adaptationGradients(initial, data, 'lora');
  assert.ok(grad.a.flat().every(v => v === 0));
  assert.ok(grad.b.flat().some(v => v !== 0));
  const next = adaptationStep(initial, data, 'lora', .4);
  assert.deepEqual(next.a, initial.a);
  assert.notDeepEqual(next.b, initial.b);
  assert.deepEqual(next.w, BASE_WEIGHT);
  assert.deepEqual(initial.b, [[0, 0], [0, 0], [0, 0]]);
  const dead = { ...initial, a: initial.a.map(row => row.map(() => 0)) };
  assert.deepEqual(adaptationStep(dead, data, 'lora', .4), dead);
});

test('Every trainable full and LoRA gradient agrees with finite difference of mean squared loss', () => {
  const state = adaptationInitial(2), data = adaptationData(3, .1).train;
  state.b = [[.2, -.1], [.3, .15], [-.25, .35]];
  for (const mode of ['full', 'lora'] as const) {
    const grad = adaptationGradients(state, data, mode);
    const trainable = (mode === 'full' ? ['w'] : ['a', 'b']) as (keyof AdaptationState)[];
    if (mode === 'lora') assert.ok(grad.w.flat().every(v => v === 0));
    else assert.ok([...grad.a.flat(), ...grad.b.flat()].every(v => v === 0));
    for (const key of trainable) state[key].forEach((row, i) => row.forEach((v, j) => {
      const numeric = fd(value => {
        const changed = { ...state, [key]: state[key].map((r, ri) => r.map((old, ci) => ri === i && ci === j ? value : old)) };
        return adaptationLoss(changed, data, mode);
      }, v);
      near(grad[key][i][j], numeric);
    }));
    near(adaptationLoss(state, [...data, ...data], mode), adaptationLoss(state, data, mode));
    const repeated = adaptationGradients(state, [...data, ...data], mode);
    for (const key of ['w', 'a', 'b'] as (keyof AdaptationState)[]) repeated[key].forEach((row, i) => row.forEach((v, j) => near(v, grad[key][i][j])));
    assert.ok(adaptationLoss(adaptationStep(state, data, mode, .01), data, mode) < adaptationLoss(state, data, mode));
  }
});

test('Same-task training reduces clean rank-one loss and keeps LoRA base fixed', () => {
  const run = trainAdaptation(1, 1, 0, .4, 500), first = run.history[0], last = run.history.at(-1)!;
  assert.equal(first.fullTrain, first.loraTrain);
  assert.equal(first.fullHeldout, first.loraHeldout);
  assert.ok(last.fullTrain < 1e-10 && last.loraTrain < 1e-10);
  assert.ok(last.fullHeldout < 1e-10 && last.loraHeldout < 1e-10);
  assert.deepEqual(run.lora.w, BASE_WEIGHT);
  assert.notDeepEqual(run.full.w, BASE_WEIGHT);
  assert.equal(run.history.length, 501);
  assert.equal(run.lora.a.flat().length + run.lora.b.flat().length, 11);
});

test('Rank restriction causes observable residual on rank-three task; held-out is separate', () => {
  const run = trainAdaptation(1, 3, 0, .4, 500), last = run.history.at(-1)!;
  assert.ok(last.fullTrain < 1e-10);
  assert.ok(last.loraTrain > .01);
  assert.ok(last.loraHeldout > .001);
  assert.ok(run.data.heldout.every(sample => !run.data.train.some(train => JSON.stringify(train.x) === JSON.stringify(sample.x))));
  const noisy = adaptationData(1, .5), clean = adaptationData(1, 0);
  assert.deepEqual(noisy.heldout, clean.heldout);
  assert.notDeepEqual(noisy.train, clean.train);
  assert.throws(() => trainAdaptation(0, 1, 0, .4, 10), RangeError);
  assert.throws(() => trainAdaptation(1, 1, NaN, .4, 10), RangeError);
  assert.throws(() => trainAdaptation(1, 1, 0, 0, 0), RangeError);
});
