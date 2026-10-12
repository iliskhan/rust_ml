import assert from 'node:assert/strict';
import test from 'node:test';
import { boundaryBatchIndices, boundaryBatchProgress, boundaryL2, boundaryLossGradient, createBoundaryParameters, type BoundaryConfig, type BoundarySample } from '../src/boundaryNetworkMath.ts';
import { advanceBoundaryExperiment as advance, boundaryComparisonDifferences, boundaryStepsToEpoch, createBoundaryExperiment as create, decodeBoundaryWorkspace as decode, encodeBoundaryWorkspace as encode, initialBoundarySettings as defaults, readBoundaryStorage, restoreBoundaryRun as restore, saveBoundaryRun as save, writeBoundaryStorage } from '../src/boundaryExperiment.ts';
import { optimizerStep, type OptimizerKind } from '../src/math.ts';

const linear: BoundaryConfig = { layers: [] };
const samples: BoundarySample[] = [{ input: [.2, .8], target: 0 }, { input: [.9, .3], target: 1 }];
const close = (a: number, b: number, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('L2: λ=.1, W=[1,2] adds .25 and [.1,.2], never a bias penalty', () => {
  const params = [1, 2, 10];
  const penalty = boundaryL2(params, linear, .1);
  close(penalty.loss, .25); assert.deepEqual(penalty.grad, [.1, .2, 0]);
  const raw = boundaryLossGradient(params, linear, samples), regularized = boundaryLossGradient(params, linear, samples, .1);
  close(regularized.loss - raw.loss, .25);
  assert.equal(regularized.rawBCE, raw.loss); assert.equal(regularized.penalty, .25);
  close(regularized.grad[0] - raw.grad[0], .1); close(regularized.grad[1] - raw.grad[1], .2);
  assert.equal(regularized.grad[2], raw.grad[2]);
  const multilayer: BoundaryConfig = { layers: [{ width: 2, activation: 'tanh' }, { width: 1, activation: 'sigmoid' }] };
  // W0 indices0..3,b0 indices4..5; W1 indices6..7,b1 index8; W2 index9,b2 index10.
  const p = Array.from({ length: 11 }, (_, i) => i + 1), result = boundaryL2(p, multilayer, .1);
  for (const i of [4, 5, 8, 10]) assert.equal(result.grad[i], 0);
  close(result.loss, .05 * [1, 2, 3, 4, 7, 8, 10].reduce((sum, x) => sum + x * x, 0));
});

test('L2 objective finite differences include every weight and bias in linear and hidden networks', () => {
  for (const config of [linear, { layers: [{ width: 3, activation: 'tanh' as const }, { width: 2, activation: 'sigmoid' as const }] }]) {
    const params = createBoundaryParameters(config, 9), result = boundaryLossGradient(params, config, samples, .1);
    params.forEach((_, i) => {
      const plus = [...params], minus = [...params]; plus[i] += 1e-5; minus[i] -= 1e-5;
      close(result.grad[i], (boundaryLossGradient(plus, config, samples, .1).loss - boundaryLossGradient(minus, config, samples, .1).loss) / 2e-5);
    });
  }
});

test('mini-batch: independent example gradients +2,-2 average to0 in a full batch', () => {
  const config: BoundaryConfig = { layers: [{ width: 1, activation: 'tanh' }] };
  const params = [0, 0, 0, 4, 0], data: BoundarySample[] = [{ input: [1, .5], target: 0 }, { input: [0, .5], target: 0 }];
  assert.equal(boundaryLossGradient(params, config, [data[0]]).grad[0], 2);
  assert.equal(boundaryLossGradient(params, config, [data[1]]).grad[0], -2);
  assert.equal(boundaryLossGradient(params, config, data).grad[0], 0);
});

test('batch96 λ0 preserves legacy full-batch summation and all optimizer states exactly', () => {
  for (const method of ['sgd', 'momentum', 'adam'] as OptimizerKind[]) {
    const current = create({ ...defaults, method, batchSize: 96, lambda: 0, batchSeed: 777 });
    let old = current.optimizer;
    for (let i = 0; i < 23; i++) old = optimizerStep(old, boundaryLossGradient(old.params, current.settings.config, current.dataset.train).grad, method, { lr: current.settings.lr });
    assert.deepEqual(advance(current, 23).optimizer, old);
    assert.deepEqual(boundaryBatchIndices(500, 96, 999), Array.from({ length: 96 }, (_, i) => i));
  }
});

test('batch order: deterministic no-replacement epochs, short tail and exact example budgets', () => {
  for (const batch of [1, 7, 16, 95, 96]) {
    const updates = Math.ceil(96 / batch);
    for (const epoch of [0, 1, 2]) {
      const indices = Array.from({ length: updates }, (_, i) => boundaryBatchIndices(epoch * updates + i, batch, 7)).flat();
      assert.deepEqual([...indices].sort((a, b) => a - b), Array.from({ length: 96 }, (_, i) => i));
      assert.deepEqual(boundaryBatchProgress(epoch * updates, batch), { epoch, cursor: 0, examples: epoch * 96, epochs: epoch, updatesPerEpoch: updates });
    }
  }
  assert.equal(boundaryBatchIndices(13, 7, 42).length, 5);
  assert.equal(boundaryBatchProgress(13, 7).examples, 91);
  assert.equal(boundaryBatchProgress(14, 7).examples, 96);
  assert.deepEqual(boundaryBatchIndices(14, 7, 42), boundaryBatchIndices(14, 7, 42));
  assert.notDeepEqual(boundaryBatchIndices(0, 7, 42), boundaryBatchIndices(14, 7, 42));
  assert.notDeepEqual(boundaryBatchIndices(0, 7, 42), boundaryBatchIndices(0, 7, 7));
});

test('three seed streams: data, initialization, batch order change independently', () => {
  const settings = { ...defaults, seed: 42, initSeed: 42, batchSeed: 42, batchSize: 7 };
  const base = create(settings), data = create({ ...settings, seed: 7 }), init = create({ ...settings, initSeed: 7 }), order = create({ ...settings, batchSeed: 7 });
  assert.notDeepEqual(base.dataset, data.dataset); assert.deepEqual(base.optimizer, data.optimizer);
  assert.deepEqual(base.dataset, init.dataset); assert.notDeepEqual(base.optimizer, init.optimizer);
  assert.deepEqual(base.dataset, order.dataset); assert.deepEqual(base.optimizer, order.optimizer);
  assert.notDeepEqual(advance(base, 1).optimizer, advance(order, 1).optimizer);
});

test('validation never participates in mini-batch updates or L2 gradient', () => {
  const current = create({ ...defaults, batchSize: 7, lambda: .1 });
  const changed = structuredClone(current); changed.dataset.validation = [{ input: [0, 0], target: 1 }];
  const a = advance(current, 17), b = advance(changed, 17);
  assert.deepEqual(a.optimizer, b.optimizer);
  assert.equal(a.history.at(-1)!.train, b.history.at(-1)!.train);
  assert.notEqual(a.history.at(-1)!.validation, b.history.at(-1)!.validation);
});

test('v2 roundtrip and reload continue exactly before/after epoch tail for every optimizer', () => {
  for (const method of ['sgd', 'momentum', 'adam'] as OptimizerKind[]) for (const batchSize of [1, 7, 16, 96]) {
    const updates = Math.ceil(96 / batchSize);
    for (const step of [updates - 1, updates, updates + 1]) {
      const current = advance(create({ ...defaults, method, batchSize, lambda: .1, seed: 7, initSeed: 9, batchSeed: 1337 }), step);
      const saved = save(current, .63, [.2, .8]), json = encode(saved, { A: saved, B: saved });
      const parsed = decode(json); assert.equal(parsed.version, 2); assert.deepEqual(parsed.current, saved);
      const restored = restore(parsed.current); assert.deepEqual(restored, current);
      assert.deepEqual(advance(restored, 1), advance(current, 1));
      assert.deepEqual(restore(parsed.slots.A!), restored);
    }
  }
});

test('v1 JSON/local storage migrates full-batch λ0 and legacy shared seed exactly', () => {
  const current = advance(create({ ...defaults, seed: 7 }), 17), saved = save(current, .5, [.5, .5]);
  const legacy = structuredClone(saved);
  for (const key of ['batchSize', 'lambda', 'initSeed', 'batchSeed'] as const) delete legacy.settings[key];
  const json = JSON.stringify({ format: 'rustml-boundary', version: 1, current: legacy, slots: { A: legacy, B: null } });
  const parsed = decode(json); assert.deepEqual(parsed.current, saved); assert.equal(parsed.version, 2);
  assert.deepEqual(readBoundaryStorage({ getItem() { return json; } }), parsed);
  assert.deepEqual(advance(restore(parsed.current), 1), advance(current, 1));
});

test('equal epoch target gives exactly equal example budget despite different updates', () => {
  const runs = [7, 16, 96].map(batchSize => {
    let run = create({ ...defaults, batchSize });
    run = advance(run, 1); run = advance(run, boundaryStepsToEpoch(run, 2));
    assert.equal(boundaryBatchProgress(run.optimizer.step, batchSize).examples, 192);
    assert.equal(boundaryStepsToEpoch(run, 1), 0);
    return save(run, .5, [.5, .5]);
  });
  assert.notEqual(runs[0].optimizer.step, runs[2].optimizer.step);
  assert.ok(!boundaryComparisonDifferences(runs[0], runs[2]).includes('разный бюджет train-примеров'));
  const A = save(advance(create({ ...defaults, batchSize: 7 }), 2), .5, [.5, .5]);
  const B = save(advance(create({ ...defaults, batchSize: 96 }), 2), .5, [.5, .5]);
  assert.ok(boundaryComparisonDifferences(A, B).includes('разный бюджет train-примеров'));
});

test('v2 invalid fields and invalid A/B leave old local record and current/slots intact', () => {
  const saved = save(advance(create({ ...defaults, batchSize: 7, lambda: .1 }), 13), .5, [.5, .5]);
  const file = decode(encode(saved, { A: saved, B: saved })), before = structuredClone(file);
  let stored = encode(file.current, file.slots), writes = 0;
  const storage = { setItem(_key: string, value: string) { writes++; stored = value; } }, old = stored;
  for (const change of [
    (x: any) => { x.version = 1; },
    (x: any) => { delete x.current.settings.batchSeed; },
    ...[0, 97, 1.5, null].map(batchSize => (x: any) => { x.current.settings.batchSize = batchSize; }),
    ...[-.1, 1.1, null].map(lambda => (x: any) => { x.current.settings.lambda = lambda; }),
    ...[-1, 4294967296, .2, null].map(seed => (x: any) => { x.slots.A.settings.initSeed = seed; }),
    (x: any) => { x.slots.B.optimizer.params.pop(); },
  ]) {
    const damaged = structuredClone(file); change(damaged);
    assert.throws(() => decode(JSON.stringify(damaged)));
    // Changing the envelope alone is an import error, not an invalid in-memory run.
    if (damaged.version === 2) assert.throws(() => writeBoundaryStorage(storage, damaged.current, damaged.slots));
    assert.equal(stored, old); assert.equal(writes, 0); assert.deepEqual(file, before);
  }
});

test('batch/L2/create/advance reject invalid inputs rather than a partial update', () => {
  for (const lambda of [-1, NaN, Infinity]) assert.throws(() => boundaryLossGradient([0, 0, 0], linear, samples, lambda), RangeError);
  for (const batch of [0, 97, 1.2, NaN]) assert.throws(() => boundaryBatchIndices(0, batch, 42), RangeError);
  for (const step of [-1, .5, Infinity]) assert.throws(() => boundaryBatchProgress(step, 7), RangeError);
  for (const seed of [NaN, -1, .5, 4294967296]) assert.throws(() => boundaryBatchIndices(0, 7, seed), RangeError);
  for (const change of [{ seed: NaN }, { initSeed: -1 }, { batchSeed: .5 }, { batchSize: 0 }, { lambda: -.1 }]) assert.throws(() => create({ ...defaults, ...change }));
  const current = create(defaults), before = structuredClone(current);
  for (const count of [-1, .5, Infinity, NaN]) assert.throws(() => advance(current, count), RangeError);
  assert.deepEqual(current, before);
});
