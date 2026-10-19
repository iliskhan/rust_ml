import assert from 'node:assert/strict';
import test from 'node:test';
import { boundaryInputSize, boundaryLossGradient, boundaryMetrics, boundaryNeuronParameters, boundaryParameterCount, createBoundaryParameters, makeBoundaryDataset, makeBoundaryFinalTest, predictBoundary, traceBoundary, type BoundaryConfig, type BoundaryKind } from '../src/boundaryNetworkMath.ts';
import { advanceBoundaryExperiment, BoundaryStorageWriter, boundaryComparisonDifferences, createBoundaryExperiment, decodeBoundaryWorkspace, encodeBoundaryWorkspace, initialBoundarySettings, mergeBoundaryEvaluationReceipts, restoreBoundaryRun, saveBoundaryRun } from '../src/boundaryExperiment.ts';
import { boundaryEvaluationId, freezeBoundaryEvaluation, revealBoundaryEvaluation } from '../src/boundaryEvaluation.ts';
import { boundaryWeightChoices, captureBoundarySlice, evaluateBoundarySlice } from '../src/boundaryDiagnosticsMath.ts';

test('data v2: nested balanced clean subsets, fixed validation and isolated rounded label corruption', () => {
  for (const kind of ['circles', 'moons', 'spiral'] as BoundaryKind[]) for (const seed of [7, 42, 1337]) {
    const legacy = makeBoundaryDataset(kind, seed);
    let previous: string[] = [];
    for (const trainSize of [24, 48, 96] as const) {
      const clean = makeBoundaryDataset(kind, seed, { version: 2, trainSize, labelNoise: 0 });
      assert.equal(clean.train.length, trainSize);
      assert.equal(clean.train.filter(point => point.target === 1).length, trainSize / 2);
      assert.deepEqual(clean.validation, legacy.validation);
      const points = clean.train.map(point => JSON.stringify(point.input));
      assert.ok(previous.every(point => points.includes(point)));
      previous = points;
      if (trainSize === 96) assert.deepEqual(clean, legacy);
      for (const labelNoise of [.1, .2]) {
        const noisy = makeBoundaryDataset(kind, seed, { version: 2, trainSize, labelNoise });
        assert.deepEqual(noisy.validation, clean.validation);
        assert.deepEqual(noisy.train.map(point => point.input), clean.train.map(point => point.input));
        assert.equal(noisy.train.filter((point, i) => point.target !== clean.train[i].target).length, Math.round(trainSize * labelNoise));
        assert.deepEqual(noisy, makeBoundaryDataset(kind, seed, { version: 2, trainSize, labelNoise }));
      }
    }
  }
});

test('radial feature: manual forward, trace, row layout and every gradient across mixed depth', () => {
  const linear: BoundaryConfig = { layers: [], features: 'radial' };
  const trace = traceBoundary([1, 2, 3, 4], linear, [.75, .25]);
  assert.deepEqual(trace.activations[0], [.5, -.5, .5]);
  assert.equal(trace.logit, 5);
  assert.equal(predictBoundary([1, 2, 3, 4], linear, [.75, .25]), 1 / (1 + Math.exp(-5)));
  assert.deepEqual(boundaryNeuronParameters([1, 2, 3, 4], linear, 0, 0).weights, [1, 2, 3]);
  const data = makeBoundaryDataset('moons', 42, { version: 2, trainSize: 24, labelNoise: .1 });
  for (let depth = 0; depth <= 3; depth++) {
    const config: BoundaryConfig = { features: 'radial', layers: [{ width: 3, activation: 'tanh' }, { width: 2, activation: 'sigmoid' }, { width: 2, activation: 'relu' }].slice(0, depth) as BoundaryConfig['layers'] };
    const params = createBoundaryParameters(config, 7);
    assert.equal(boundaryInputSize(config), 3);
    assert.equal(boundaryParameterCount(config), params.length);
    assert.equal(boundaryParameterCount(config) - boundaryParameterCount({ layers: config.layers }), config.layers[0]?.width ?? 1);
    const analytical = boundaryLossGradient(params, config, data.train, .03);
    params.forEach((_, i) => {
      const plus = [...params], minus = [...params]; plus[i] += 1e-5; minus[i] -= 1e-5;
      const numerical = (boundaryLossGradient(plus, config, data.train, .03).loss - boundaryLossGradient(minus, config, data.train, .03).loss) / 2e-5;
      assert.ok(Math.abs(numerical - analytical.grad[i]) < 1e-7, `depth ${depth}, param ${i}: ${numerical} vs ${analytical.grad[i]}`);
    });
    const choices = boundaryWeightChoices(config);
    assert.equal(choices.length, params.length - config.layers.reduce((n, layer) => n + layer.width, 1));
    const snapshot = captureBoundarySlice(params, config, data, 0, 42);
    assert.equal(snapshot.config.features, 'radial');
    const pair: [number, number] = [choices[0].index, choices[1].index];
    const slice = evaluateBoundarySlice(snapshot, pair, [params[pair[0]], params[pair[1]]], 24, 0, .03);
    assert.equal(slice.regularized.loss, analytical.loss);
    assert.deepEqual(slice.regularized.gradient, pair.map(i => analytical.grad[i]));
  }
});

test('v3: exact data, history and next optimizer update for radial/noisy mini-batches', () => {
  for (const method of ['sgd', 'momentum', 'adam'] as const) for (const trainSize of [24, 48, 96] as const) {
    const original = advanceBoundaryExperiment(createBoundaryExperiment({ ...initialBoundarySettings, method,
      data: { version: 2, trainSize, labelNoise: .2 }, config: { ...initialBoundarySettings.config, features: 'radial' }, batchSize: 7 }), 11);
    const saved = saveBoundaryRun(original, .6, [.7, .3]);
    const workspace = decodeBoundaryWorkspace(encodeBoundaryWorkspace(saved, { A: saved, B: null }));
    assert.equal(workspace.version, 3);
    assert.deepEqual(workspace.current, saved);
    const restored = restoreBoundaryRun(workspace.current);
    assert.deepEqual(restored.dataset, original.dataset);
    assert.deepEqual(advanceBoundaryExperiment(restored, 1), advanceBoundaryExperiment(original, 1));
  }
});

test('v3: malformed settings and final records reject; legacy versions cannot smuggle new features', () => {
  const experiment = createBoundaryExperiment({ ...initialBoundarySettings, data: { version: 2, trainSize: 24, labelNoise: .1 }, config: { layers: [], features: 'radial' } });
  experiment.finalResult = revealBoundaryEvaluation(freezeBoundaryEvaluation(experiment, .5, 'Минимум validation BCE', 314159));
  const saved = saveBoundaryRun(experiment, .5, [.5, .5]);
  const original = JSON.parse(encodeBoundaryWorkspace(saved, { A: null, B: null }));
  for (const change of [
    (f: any) => { f.current.settings.data.version = 1; },
    (f: any) => { f.current.settings.data.trainSize = 25; },
    (f: any) => { f.current.settings.data.labelNoise = .21; },
    (f: any) => { f.current.settings.batchSize = 25; },
    (f: any) => { f.current.settings.config.features = 'time'; },
    (f: any) => { f.current.finalResult.evaluationId += '0'; },
    (f: any) => { f.current.finalResult.model.params.pop(); },
    (f: any) => { f.current.finalResult.model.criterion = ''; },
    (f: any) => { f.current.finalResult.model.threshold = 2; },
    (f: any) => { f.current.finalResult.metrics.correct++; },
    (f: any) => { f.current.finalResult.revealed = false; },
    (f: any) => { f.evaluationReceipts = ['invented']; },
    (f: any) => { f.version = 2; delete f.evaluationReceipts; },
  ]) {
    const damaged = structuredClone(original); change(damaged);
    assert.throws(() => decodeBoundaryWorkspace(JSON.stringify(damaged)));
  }
});

test('final test: dedicated clean draw, frozen selection, identity independent of model and reveal roundtrip', () => {
  let experiment = advanceBoundaryExperiment(createBoundaryExperiment(initialBoundarySettings), 8);
  const before = structuredClone(experiment);
  const frozen = freezeBoundaryEvaluation(experiment, .6, 'Выбрана по validation', 314159);
  assert.equal(frozen.revealed, false);
  assert.equal(frozen.metrics, undefined);
  assert.equal(frozen.evaluationId, boundaryEvaluationId('moons', 314159));
  assert.deepEqual(experiment, before);
  for (const collision of [(42 ^ 0xc2b2ae35) >>> 0, (42 ^ 0x9e3779b9 ^ 0xc2b2ae35) >>> 0]) {
    assert.throws(() => freezeBoundaryEvaluation(experiment, .5, 'Коллизия', collision), /совпадает/);
  }
  const testData = makeBoundaryFinalTest('moons', 314159);
  assert.equal(testData.length, 32);
  assert.equal(testData.filter(sample => sample.target === 1).length, 16);
  const trainValidation = [...experiment.dataset.train, ...experiment.dataset.validation].map(point => JSON.stringify(point.input));
  assert.ok(testData.every(point => !trainValidation.includes(JSON.stringify(point.input))));
  experiment = advanceBoundaryExperiment({ ...experiment, finalResult: frozen }, 10);
  assert.deepEqual(experiment.finalResult, frozen);
  const revealed = revealBoundaryEvaluation(frozen);
  assert.deepEqual(revealed.metrics, boundaryMetrics(before.optimizer.params, before.settings.config, testData, .6));
  assert.equal(frozen.metrics, undefined);
  const other = freezeBoundaryEvaluation(experiment, .4, 'После обучения', 314159, [revealed.evaluationId]);
  assert.equal(other.evaluationId, revealed.evaluationId);
  assert.equal(other.reused, true);
  experiment.finalResult = revealed;
  const saved = saveBoundaryRun(experiment, .5, [.5, .5]);
  const workspace = decodeBoundaryWorkspace(encodeBoundaryWorkspace(saved, { A: null, B: null }));
  assert.deepEqual(workspace.current.finalResult, revealed);
  assert.deepEqual(workspace.evaluationReceipts, [revealed.evaluationId]);
  assert.deepEqual(restoreBoundaryRun(workspace.current).finalResult, revealed);
});

test('final exposure survives stale import, model replacement, legacy reset and guarded storage writes', async () => {
  const experiment = createBoundaryExperiment(initialBoundarySettings);
  const frozen = freezeBoundaryEvaluation(experiment, .5, 'Выбор', 314159);
  const unopened = saveBoundaryRun({ ...experiment, finalResult: frozen }, .5, [.5, .5]);
  const revealed = saveBoundaryRun({ ...experiment, finalResult: revealBoundaryEvaluation(frozen) }, .5, [.5, .5]);
  const original = decodeBoundaryWorkspace(encodeBoundaryWorkspace(revealed, { A: null, B: null }));
  const stale = decodeBoundaryWorkspace(encodeBoundaryWorkspace(unopened, { A: null, B: null }));
  const merged = mergeBoundaryEvaluationReceipts(stale, original);
  assert.equal(merged.current.finalResult!.revealed, false);
  assert.equal(merged.current.finalResult!.metrics, undefined);
  assert.equal(merged.current.finalResult!.reused, true);
  const reset = saveBoundaryRun(experiment, .5, [.5, .5]);
  const fresh = decodeBoundaryWorkspace(encodeBoundaryWorkspace(reset, { A: null, B: null }));
  assert.deepEqual(mergeBoundaryEvaluationReceipts(fresh, original).evaluationReceipts, [frozen.evaluationId]);
  let stored = encodeBoundaryWorkspace(revealed, { A: null, B: null });
  const writer = new BoundaryStorageWriter({ getItem() { return stored; }, setItem(_key, value) { stored = value; } }, stored, async (_name, action) => action());
  await writer.save(reset, { A: null, B: null });
  assert.deepEqual(decodeBoundaryWorkspace(stored).evaluationReceipts, [frozen.evaluationId]);
  await writer.save(unopened, { A: null, B: null });
  assert.equal(decodeBoundaryWorkspace(stored).current.finalResult!.revealed, false);
  assert.equal(decodeBoundaryWorkspace(stored).current.finalResult!.reused, true);
});

test('v3 comparisons use actual train budgets and distinguish radial features and corruption', () => {
  const a = saveBoundaryRun(advanceBoundaryExperiment(createBoundaryExperiment(initialBoundarySettings), 1), .5, [.5, .5]);
  const b = saveBoundaryRun(advanceBoundaryExperiment(createBoundaryExperiment({ ...initialBoundarySettings, data: { version: 2, trainSize: 24, labelNoise: .2 }, config: { layers: initialBoundarySettings.config.layers, features: 'radial' } }), 1), .5, [.5, .5]);
  const differences = boundaryComparisonDifferences(a, b);
  for (const label of ['разные входные признаки', 'разное количество train-точек', 'разные доли ошибок train-меток', 'разный бюджет train-примеров']) assert.ok(differences.includes(label));
});

test('fixed overfit demonstration: lower noisy-train BCE accompanies worse clean validation on three seeds', () => {
  for (const seed of [7, 42, 1337]) {
    let experiment = createBoundaryExperiment({ kind: 'circles', seed, config: { layers: [{ width: 16, activation: 'tanh' }, { width: 16, activation: 'tanh' }] },
      method: 'adam', lr: .02, data: { version: 2, trainSize: 24, labelNoise: .2 }, lambda: 0 });
    experiment = advanceBoundaryExperiment(experiment, 100);
    const early = experiment.history.at(-1)!;
    experiment = advanceBoundaryExperiment(experiment, 900);
    const late = experiment.history.at(-1)!;
    assert.equal(experiment.error, null);
    assert.ok(late.train < early.train && late.validation > early.validation);
  }
});
