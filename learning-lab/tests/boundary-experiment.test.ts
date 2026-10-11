import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceBoundaryExperiment, boundaryComparisonDifferences, boundaryFileLimit, boundaryStepLimit, boundaryStorageKey, createBoundaryExperiment, decodeBoundaryWorkspace, encodeBoundaryWorkspace, initialBoundarySettings, readBoundaryStorage, restoreBoundaryRun, saveBoundaryRun, writeBoundaryStorage, type BoundaryWorkspace } from '../src/boundaryExperiment.ts';
import { boundaryLossGradient, boundaryMetrics, makeBoundaryDataset, type BoundaryConfig } from '../src/boundaryNetworkMath.ts';
import { optimizerStep, type OptimizerKind } from '../src/math.ts';

function fixture(): BoundaryWorkspace {
  const experiment = advanceBoundaryExperiment(createBoundaryExperiment(initialBoundarySettings), 17);
  const current = saveBoundaryRun(experiment, .63, [.24, .81]);
  return { format: 'rustml-boundary', version: 1, current, slots: { A: structuredClone(current), B: null } };
}

test('saved Boundary: exact JSON roundtrip, dataset order and next optimizer step for every optimizer', () => {
  const configs: BoundaryConfig[] = [{ layers: [] }, { layers: [{ width: 3, activation: 'relu' }, { width: 4, activation: 'tanh' }, { width: 2, activation: 'sigmoid' }] }];
  for (const method of ['sgd', 'momentum', 'adam'] as OptimizerKind[]) for (const config of configs) for (const seed of [7, 42, 4294967295]) {
    const before = advanceBoundaryExperiment(createBoundaryExperiment({ ...initialBoundarySettings, config, seed, method }), 23);
    assert.equal(before.error, null);
    const saved = saveBoundaryRun({ ...before, auto: true, remaining: 99 }, .63, [.24, .81]);
    const parsed = decodeBoundaryWorkspace(encodeBoundaryWorkspace(saved, { A: saved, B: null }));
    assert.deepEqual(parsed.current, saved);
    const restored = restoreBoundaryRun(parsed.current);
    assert.equal(restored.auto, false);
    assert.equal(restored.remaining, 0);
    assert.equal(restored.error, null);
    assert.deepEqual(restored.dataset, before.dataset);
    assert.deepEqual(restored.dataset, makeBoundaryDataset('moons', seed));
    const expected = optimizerStep(before.optimizer, boundaryLossGradient(before.optimizer.params, config, before.dataset.train).grad, method, { lr: before.settings.lr });
    const continued = advanceBoundaryExperiment(restored, 1);
    assert.deepEqual(continued.optimizer, expected);
    assert.deepEqual(continued.optimizer, advanceBoundaryExperiment(before, 1).optimizer);
    assert.deepEqual(continued.history.at(-1), { step: 24,
      train: boundaryMetrics(expected.params, config, before.dataset.train).loss,
      validation: boundaryMetrics(expected.params, config, before.dataset.validation).loss });
  }
});

test('saved Boundary: snapshots stay independent through training, reset, restore and source edits', () => {
  let current = advanceBoundaryExperiment(createBoundaryExperiment(initialBoundarySettings), 10);
  const A = saveBoundaryRun(current, .5, [.2, .8]), expectedA = structuredClone(A);
  current = advanceBoundaryExperiment(current, 10);
  const B = saveBoundaryRun(current, .7, [.3, .6]), expectedB = structuredClone(B);
  current.optimizer.params[0] = 900;
  current.settings.config.layers[0].width = 1;
  current.history[0].train = 200;
  assert.deepEqual(A, expectedA);
  assert.deepEqual(B, expectedB);
  const restored = restoreBoundaryRun(A);
  restored.optimizer.m[0] = 500;
  restored.history[0].train = 40;
  restored.settings.config.layers[0].width = 2;
  assert.deepEqual(A, expectedA);
  const reset = createBoundaryExperiment(A.settings);
  assert.equal(reset.optimizer.step, 0);
  assert.equal(reset.history.length, 1);
  assert.equal(reset.auto, false);
  assert.equal(reset.remaining, 0);
  assert.ok(reset.optimizer.m.every(value => value === 0));
  assert.ok(reset.optimizer.v.every(value => value === 0));
  assert.deepEqual(A, expectedA);
  assert.deepEqual(B, expectedB);
});

test('saved Boundary: malformed, version, shape, range and history imports reject atomically', () => {
  const file = fixture(), original = structuredClone(file);
  const invalidChanges: Array<(value: any) => void> = [
    value => { value.version = 2; }, value => { value.format = 'another-lab'; }, value => { value.current = null; },
    value => { value.current.settings.kind = 'xor'; }, value => { value.current.settings.seed = -1; },
    value => { value.current.settings.seed = 4.2; }, value => { value.current.settings.seed = 4294967296; },
    value => { value.current.settings.method = 'unknown'; }, value => { value.current.settings.lr = 2; },
    value => { value.current.settings.config.layers[0].width = 17; }, value => { value.current.settings.config.layers[0].activation = 'sin'; },
    value => { value.current.settings.config.layers.push({}, {}); },
    value => { value.current.optimizer.params.pop(); }, value => { value.current.optimizer.m.pop(); }, value => { value.current.optimizer.v.pop(); },
    value => { value.current.optimizer.v[0] = -1; }, value => { value.current.optimizer.params[0] = null; },
    value => { value.current.optimizer.params[0] = '1'; }, value => { value.current.optimizer.m[0] = 1e101; },
    value => { value.current.optimizer.step = boundaryStepLimit + 1; }, value => { value.current.optimizer.step = 1.5; },
    value => { value.current.threshold = 1; }, value => { value.current.probe = [.5]; }, value => { value.current.probe[1] = -1; },
    value => { value.current.history = []; }, value => { value.current.history[0].step = 1; },
    value => { value.current.history.push(value.current.history.at(-1)); }, value => { value.current.history.at(-1).step = 16; },
    value => { value.current.history[0].train = -1; }, value => { value.current.history.at(-1).validation += .1; },
    value => { value.current.history = Array(4002).fill(value.current.history[0]); },
    value => { delete value.slots.B; }, value => { value.slots.A.optimizer.params = []; },
  ];
  for (const change of invalidChanges) {
    const damaged = structuredClone(file); change(damaged);
    assert.throws(() => decodeBoundaryWorkspace(JSON.stringify(damaged)), Error);
    assert.deepEqual(file, original);
  }
  for (const text of ['', '{', 'null', '[]', JSON.stringify(file).replace('"seed":42', '"seed":1e999')]) assert.throws(() => decodeBoundaryWorkspace(text), Error);
  assert.throws(() => decodeBoundaryWorkspace(' '.repeat(boundaryFileLimit + 1)), /2 МиБ/);
  assert.throws(() => decodeBoundaryWorkspace('я'.repeat(boundaryFileLimit / 2 + 1)), /2 МиБ/);
});

test('saved Boundary: finite values that overflow the input domain cannot enter the UI', () => {
  const config: BoundaryConfig = { layers: Array.from({ length: 3 }, () => ({ width: 16, activation: 'relu' })) };
  const current = saveBoundaryRun(createBoundaryExperiment({ ...initialBoundarySettings, config }), .5, [.5, .5]);
  current.optimizer.params.fill(1e100);
  assert.throws(() => decodeBoundaryWorkspace(encodeBoundaryWorkspace(current, { A: null, B: null })), /численное состояние.*Переполнение/);
});

test('saved Boundary: local storage reports read denial, corrupt data and quota instead of claiming success', () => {
  const file = fixture(); let stored: string | null = null;
  const storage = { getItem(key: string) { assert.equal(key, boundaryStorageKey); return stored; }, setItem(key: string, value: string) { assert.equal(key, boundaryStorageKey); stored = value; } };
  assert.equal(readBoundaryStorage(storage), null);
  writeBoundaryStorage(storage, file.current, file.slots);
  assert.deepEqual(readBoundaryStorage(storage), file);
  const before = stored;
  assert.throws(() => readBoundaryStorage({ getItem() { throw new Error('SecurityError'); } }), /SecurityError/);
  assert.throws(() => writeBoundaryStorage({ setItem() { throw new Error('QuotaExceededError'); } }, file.current, file.slots), /QuotaExceededError/);
  assert.equal(stored, before);
  stored = '{"broken":';
  assert.throws(() => readBoundaryStorage(storage), /JSON/);
  assert.equal(stored, '{"broken":');
});

test('saved Boundary: comparison labels changed conditions without treating equal seed as equal weights', () => {
  const A = fixture().current, B = structuredClone(A);
  assert.deepEqual(boundaryComparisonDifferences(A, B), []);
  B.settings.kind = 'spiral'; B.settings.seed = 7; B.optimizer.step++; B.threshold = .5;
  assert.deepEqual(boundaryComparisonDifferences(A, B), ['разные наборы данных', 'разные seed (данные и начальные веса)', 'разное число шагов', 'разные пороги решения']);
});

test('saved Boundary: reaching the limit does not append duplicate history or restart a run', () => {
  const current = createBoundaryExperiment(initialBoundarySettings);
  const atLimit = { ...current, optimizer: { ...current.optimizer, step: boundaryStepLimit }, auto: true, remaining: 10 };
  const next = advanceBoundaryExperiment(atLimit, 1);
  assert.equal(next.auto, false); assert.equal(next.remaining, 0);
  assert.deepEqual(next.optimizer, atLimit.optimizer);
  assert.deepEqual(next.history, atLimit.history);
});
