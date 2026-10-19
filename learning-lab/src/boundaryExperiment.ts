import { boundaryBatchIndices, boundaryBatchProgress, boundaryLossGradient, boundaryMetrics, boundaryParameterCount, boundaryTrainSize, checkBoundaryFinalTestSeed, createBoundaryParameters, makeBoundaryDataset, type BoundaryConfig, type BoundaryDataSettings, type BoundaryDataset, type BoundaryKind } from './boundaryNetworkMath.ts';
import { createOptimizerState, optimizerStep, type Activation, type OptimizerKind, type OptimizerState } from './math.ts';
import { boundaryEvaluationId, revealBoundaryEvaluation, type BoundaryFinalResult } from './boundaryEvaluation.ts';

export type BoundarySettings = { kind: BoundaryKind; seed: number; config: BoundaryConfig; method: OptimizerKind; lr: number; initSeed?: number; batchSeed?: number; batchSize?: number; lambda?: number; data?: BoundaryDataSettings };
export type BoundaryHistoryPoint = { step: number; train: number; validation: number };
export type BoundaryExperiment = { settings: BoundarySettings; dataset: BoundaryDataset; optimizer: OptimizerState; history: BoundaryHistoryPoint[]; auto: boolean; remaining: number; error: string | null; finalResult?: BoundaryFinalResult };
export type SavedBoundaryRun = { settings: BoundarySettings; optimizer: OptimizerState; history: BoundaryHistoryPoint[]; threshold: number; probe: [number, number]; finalResult?: BoundaryFinalResult };
export type BoundarySlots = { A: SavedBoundaryRun | null; B: SavedBoundaryRun | null };
export type BoundaryWorkspace = { format: 'rustml-boundary'; version: 2 | 3; current: SavedBoundaryRun; slots: BoundarySlots; evaluationReceipts?: string[] };
// Keep the key so old local v1 records are read and migrated only after successful validation.
export const boundaryStorageKey = 'rustml-boundary-v1';
export const boundaryStepLimit = 4000;
export const boundaryFileLimit = 2 * 1024 * 1024;
const numericLimit = 1e100;
export const initialBoundarySettings: BoundarySettings = { kind: 'moons', seed: 42, config: { layers: [{ width: 8, activation: 'tanh' }, { width: 8, activation: 'tanh' }] }, method: 'adam', lr: .02 };

export function boundaryTrainingSettings(settings: BoundarySettings) {
  return { ...settings, initSeed: settings.initSeed ?? settings.seed, batchSeed: settings.batchSeed ?? settings.seed, batchSize: settings.batchSize ?? boundaryTrainSize(settings.data), lambda: settings.lambda ?? 0 };
}

function batchGradient(optimizer: OptimizerState, settings: BoundarySettings, dataset: BoundaryDataset) {
  const { batchSize, batchSeed, lambda } = boundaryTrainingSettings(settings);
  const batch = boundaryBatchIndices(optimizer.step, batchSize, batchSeed, dataset.train.length).map(i => dataset.train[i]);
  return boundaryLossGradient(optimizer.params, settings.config, batch, lambda).grad;
}

/** Absolute epoch target makes A/B budgets equal even for a short last batch. */
export function boundaryStepsToEpoch(experiment: BoundaryExperiment, epochs: number) {
  if (!Number.isInteger(epochs) || epochs < 1 || epochs > 40) throw new RangeError('Boundary: цель 1–40 эпох');
  const { updatesPerEpoch } = boundaryBatchProgress(experiment.optimizer.step, boundaryTrainingSettings(experiment.settings).batchSize, experiment.dataset.train.length);
  if (epochs * updatesPerEpoch > boundaryStepLimit) throw new RangeError('Цель эпох недостижима в лимите 4000 обновлений.');
  return Math.max(0, epochs * updatesPerEpoch - experiment.optimizer.step);
}

function lossPoint(optimizer: OptimizerState, settings: BoundarySettings, dataset: BoundaryDataset): BoundaryHistoryPoint {
  const point = { step: optimizer.step, train: boundaryMetrics(optimizer.params, settings.config, dataset.train).loss,
    validation: boundaryMetrics(optimizer.params, settings.config, dataset.validation).loss };
  if (point.train > numericLimit || point.validation > numericLimit) throw new Error('Потеря вне сохраняемого численного диапазона.');
  return point;
}

function checkOptimizer(optimizer: OptimizerState) {
  if (![...optimizer.params, ...optimizer.m, ...optimizer.v].every(value => Number.isFinite(value) && Math.abs(value) <= numericLimit)) throw new Error('Состояние оптимизатора вне сохраняемого численного диапазона.');
}

export function createBoundaryExperiment(settings: BoundarySettings): BoundaryExperiment {
  settings = boundaryTrainingSettings(settings);
  for (const seed of [settings.seed, settings.initSeed!, settings.batchSeed!]) integer(seed, 0, 4294967295, 'Seed');
  integer(settings.batchSize, 1, boundaryTrainSize(settings.data), 'Batch size');
  number(settings.lambda, 0, 1, 'L2 λ');
  number(settings.lr, .001, .2, 'Скорость обучения');
  choice(settings.method, ['sgd', 'momentum', 'adam'], 'Оптимизатор');
  const dataset = makeBoundaryDataset(settings.kind, settings.seed, settings.data);
  const optimizer = createOptimizerState(createBoundaryParameters(settings.config, settings.initSeed));
  return { settings: structuredClone(settings), dataset, optimizer, history: [lossPoint(optimizer, settings, dataset)], auto: false, remaining: 0, error: null };
}

// Bound affine sums for every input in [0,1]², including places outside the samples.
function checkDomain(params: number[], config: BoundaryConfig) {
  let bounds = config.features === 'radial' ? [1, 1, 2] : [1, 1], offset = 0;
  for (const layer of [...config.layers, { width: 1, activation: 'sigmoid' }]) {
    const inputs = bounds.length, bias = offset + inputs * layer.width;
    const next = Array.from({ length: layer.width }, (_, j) => {
      const bound = bounds.reduce((sum, value, i) => sum + Math.abs(params[offset + j * inputs + i]) * value, Math.abs(params[bias + j]));
      if (!Number.isFinite(bound)) throw new Error('Переполнение на области входов');
      return layer.activation === 'relu' ? bound : 1;
    });
    offset = bias + layer.width;
    bounds = next;
  }
}

export function advanceBoundaryExperiment(experiment: BoundaryExperiment, count: number): BoundaryExperiment {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Boundary: число обновлений должно быть неотрицательным целым');
  const { settings, dataset } = experiment;
  const steps = Math.min(count, boundaryStepLimit - experiment.optimizer.step);
  if (steps <= 0) return { ...experiment, auto: false, remaining: 0 };
  try {
    let optimizer = experiment.optimizer;
    for (let i = 0; i < steps; i++) {
      const grad = batchGradient(optimizer, settings, dataset);
      optimizer = optimizerStep(optimizer, grad, settings.method, { lr: settings.lr });
      checkOptimizer(optimizer);
    }
    checkDomain(optimizer.params, settings.config);
    const point = lossPoint(optimizer, settings, dataset);
    return { ...experiment, optimizer, history: [...experiment.history, point], remaining: Math.max(0, experiment.remaining - steps), auto: experiment.auto && optimizer.step < boundaryStepLimit };
  } catch {
    return { ...experiment, auto: false, remaining: 0, error: 'Обучение остановлено: расчёт вышел за численный диапазон. Сохранены последние корректные веса. Уменьшите скорость обучения или нажмите «Сброс».' };
  }
}

export function saveBoundaryRun(experiment: BoundaryExperiment, threshold: number, probe: [number, number]): SavedBoundaryRun {
  const { settings, optimizer, history, finalResult } = experiment;
  return structuredClone({ settings, optimizer, history, threshold, probe, ...(finalResult ? { finalResult } : {}) });
}

export function restoreBoundaryRun(saved: SavedBoundaryRun): BoundaryExperiment {
  const { settings, optimizer, history, finalResult } = structuredClone(saved);
  return { settings: boundaryTrainingSettings(settings), optimizer, history, dataset: makeBoundaryDataset(settings.kind, settings.seed, settings.data), auto: false, remaining: 0, error: null, ...(finalResult ? { finalResult } : {}) };
}

export function encodeBoundaryWorkspace(current: SavedBoundaryRun, slots: BoundarySlots, evaluationReceipts: string[] = []): string {
  const runs = [current, slots.A, slots.B].filter((run): run is SavedBoundaryRun => run !== null);
  const receipts = [...new Set([...evaluationReceipts, ...runs.filter(run => run.finalResult?.revealed).map(run => run.finalResult!.evaluationId)])];
  const version = receipts.length || runs.some(run => run.settings.data || run.settings.config.features || run.finalResult) ? 3 : 2;
  return JSON.stringify({ format: 'rustml-boundary', version, current, slots, ...(version === 3 ? { evaluationReceipts: receipts } : {}) } satisfies BoundaryWorkspace);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: ожидается объект.`);
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}: число вне допустимого диапазона.`);
  return value;
}
function integer(value: unknown, min: number, max: number, label: string): number {
  const result = number(value, min, max, label);
  if (!Number.isInteger(result)) throw new Error(`${label}: требуется целое число.`);
  return result;
}
function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw new Error(`${label}: неизвестное значение.`);
  return value as T;
}

function readSettings(value: unknown, label: string, version: 1 | 2 | 3): BoundarySettings {
  const rawSettings = object(value, `${label}: настройки`);
  if (version === 1 && ['initSeed', 'batchSeed', 'batchSize', 'lambda'].some(key => key in rawSettings)) {
    throw new Error(`${label}: настройки mini-batch/L2 требуют формат v2.`);
  }
  const rawConfig = object(rawSettings.config, `${label}: архитектура`);
  if (version < 3 && ('features' in rawConfig || 'data' in rawSettings)) throw new Error(`${label}: данные и признаки требуют формат v3.`);
  if (!Array.isArray(rawConfig.layers) || rawConfig.layers.length > 3) throw new Error(`${label}: нужны 0–3 скрытых слоя.`);
  const config: BoundaryConfig = { layers: rawConfig.layers.map(value => {
    const layer = object(value, `${label}: слой`);
    return { width: integer(layer.width, 1, 16, `${label}: ширина слоя`), activation: choice<Activation>(layer.activation, ['relu', 'tanh', 'sigmoid'], `${label}: активация`) };
  }) };
  if ('features' in rawConfig) config.features = choice<'raw' | 'radial'>(rawConfig.features, ['raw', 'radial'], `${label}: признаки`);
  const settings: BoundarySettings = { config, kind: choice<BoundaryKind>(rawSettings.kind, ['circles', 'moons', 'spiral'], `${label}: данные`),
    seed: integer(rawSettings.seed, 0, 4294967295, `${label}: seed`), method: choice<OptimizerKind>(rawSettings.method, ['sgd', 'momentum', 'adam'], `${label}: оптимизатор`),
    lr: number(rawSettings.lr, .001, .2, `${label}: скорость обучения`) };
  if ('data' in rawSettings) {
    const data = object(rawSettings.data, `${label}: генератор данных`);
    if (data.version !== 2 || ![24, 48, 96].includes(data.trainSize as number)) throw new Error(`${label}: данные v2, train 24/48/96.`);
    settings.data = { version: 2, trainSize: data.trainSize as 24 | 48 | 96, labelNoise: number(data.labelNoise, 0, .2, `${label}: ошибки меток`) };
  }
  Object.assign(settings, version === 1 ? { initSeed: settings.seed, batchSeed: settings.seed, batchSize: 96, lambda: 0 } : {
    initSeed: integer(rawSettings.initSeed, 0, 4294967295, `${label}: seed начальных весов`),
    batchSeed: integer(rawSettings.batchSeed, 0, 4294967295, `${label}: seed порядка batch`),
    batchSize: integer(rawSettings.batchSize, 1, boundaryTrainSize(settings.data), `${label}: batch size`),
    lambda: number(rawSettings.lambda, 0, 1, `${label}: L2 λ`),
  });
  return settings;
}

function readFinalResult(value: unknown, label: string): BoundaryFinalResult {
  const raw = object(value, `${label}: итоговая оценка`), model = object(raw.model, `${label}: выбранная модель`);
  const settings = readSettings(model.settings, label, 3);
  const testSeed = integer(raw.testSeed, 0, 4294967295, `${label}: seed test`);
  const evaluationId = boundaryEvaluationId(settings.kind, testSeed);
  checkBoundaryFinalTestSeed(settings.seed, testSeed);
  if (raw.version !== 1 || raw.evaluationId !== evaluationId || typeof raw.revealed !== 'boolean' || typeof raw.reused !== 'boolean') throw new Error(`${label}: некорректная итоговая оценка.`);
  if (typeof model.criterion !== 'string' || !model.criterion.trim() || model.criterion.length > 500) throw new Error(`${label}: нужен критерий выбора.`);
  if (!Array.isArray(model.params) || model.params.length !== boundaryParameterCount(settings.config)) throw new Error(`${label}: неверные веса выбранной модели.`);
  const params = model.params.map(value => number(value, -numericLimit, numericLimit, `${label}: вес выбранной модели`));
  checkDomain(params, settings.config);
  const result: BoundaryFinalResult = { version: 1, evaluationId, testSeed, model: { settings, params,
    step: integer(model.step, 0, boundaryStepLimit, `${label}: выбранный шаг`), threshold: number(model.threshold, .05, .95, `${label}: выбранный порог`), criterion: model.criterion },
    revealed: raw.revealed, reused: raw.reused };
  if (result.revealed) {
    const actual = revealBoundaryEvaluation(result);
    const metrics = object(raw.metrics, `${label}: результаты test`);
    if (Object.entries(actual.metrics!).some(([key, value]) => metrics[key] !== value)) throw new Error(`${label}: результат test не соответствует выбранной модели.`);
    return actual;
  }
  if ('metrics' in raw) throw new Error(`${label}: нераскрытая оценка не должна содержать результаты.`);
  return result;
}

function readRun(value: unknown, label: string, version: 1 | 2 | 3): SavedBoundaryRun {
  const run = object(value, label), settings = readSettings(run.settings, label, version), config = settings.config;
  if (version < 3 && 'finalResult' in run) throw new Error(`${label}: итоговая оценка требует формат v3.`);
  const rawOptimizer = object(run.optimizer, `${label}: состояние оптимизатора`), size = boundaryParameterCount(config);
  const vector = (value: unknown, name: string, min: number) => {
    if (!Array.isArray(value) || value.length !== size) throw new Error(`${label}: размер ${name} не соответствует архитектуре (${size}).`);
    // Conservative numeric bounds also keep charts and intermediate products representable.
    return value.map(item => number(item, min, numericLimit, `${label}: ${name}`));
  };
  const optimizer: OptimizerState = { params: vector(rawOptimizer.params, 'весов', -numericLimit), m: vector(rawOptimizer.m, 'm', -numericLimit), v: vector(rawOptimizer.v, 'v', 0),
    step: integer(rawOptimizer.step, 0, boundaryStepLimit, `${label}: шаг`) };
  if (!Array.isArray(run.history) || !run.history.length || run.history.length > boundaryStepLimit + 1) throw new Error(`${label}: история должна содержать 1–4001 точку.`);
  let previous = -1;
  const history = run.history.map(value => {
    const point = object(value, `${label}: точка истории`), step = integer(point.step, 0, optimizer.step, `${label}: шаг истории`);
    if (step <= previous) throw new Error(`${label}: шаги истории должны строго возрастать.`);
    previous = step;
    return { step, train: number(point.train, 0, numericLimit, `${label}: train BCE`), validation: number(point.validation, 0, numericLimit, `${label}: validation BCE`) };
  });
  if (history[0].step !== 0 || history.at(-1)!.step !== optimizer.step) throw new Error(`${label}: история должна идти от шага 0 до текущего шага.`);
  const threshold = number(run.threshold, .05, .95, `${label}: порог`);
  if (!Array.isArray(run.probe) || run.probe.length !== 2) throw new Error(`${label}: у пробы должны быть два входа.`);
  const probe: [number, number] = [number(run.probe[0], 0, 1, `${label}: x₁`), number(run.probe[1], 0, 1, `${label}: x₂`)];
  try {
    checkDomain(optimizer.params, config);
    const dataset = makeBoundaryDataset(settings.kind, settings.seed, settings.data);
    const current = lossPoint(optimizer, settings, dataset), last = history.at(-1)!;
    if (['train', 'validation'].some(key => {
      const field = key as 'train' | 'validation';
      return Math.abs(current[field] - last[field]) > 1e-12 * Math.max(1, current[field]);
    })) throw new Error('Последняя точка истории не соответствует весам.');
    const next = optimizerStep(optimizer, batchGradient(optimizer, settings, dataset), settings.method, { lr: settings.lr });
    checkOptimizer(next);
    checkDomain(next.params, config);
  } catch (error) {
    throw new Error(`${label}: небезопасное или несогласованное численное состояние. ${error instanceof Error ? error.message : ''}`);
  }
  return { settings, optimizer, history, threshold, probe, ...('finalResult' in run ? { finalResult: readFinalResult(run.finalResult, label) } : {}) };
}

export function decodeBoundaryWorkspace(text: string): BoundaryWorkspace {
  if (text.length > boundaryFileLimit || new TextEncoder().encode(text).length > boundaryFileLimit) throw new Error('Файл слишком большой: максимум 2 МиБ.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON. Выберите файл экспорта лаборатории.'); }
  const file = object(value, 'Файл');
  if (file.format !== 'rustml-boundary' || (file.version !== 1 && file.version !== 2 && file.version !== 3)) throw new Error('Неподдерживаемый формат или версия. Нужен экспорт RustML Boundary v1, v2 или v3.');
  const slots = object(file.slots, 'Слоты A/B');
  if (file.version < 3 && 'evaluationReceipts' in file) throw new Error('Раскрытия итоговой оценки требуют формат v3.');
  const receipts = file.version === 3 ? readEvaluationReceipts(file.evaluationReceipts) : [];
  return mergeBoundaryEvaluationReceipts({ format: 'rustml-boundary', version: file.version === 3 ? 3 : 2, current: readRun(file.current, 'Текущий опыт', file.version),
    slots: { A: slots.A === null ? null : readRun(slots.A, 'Опыт A', file.version), B: slots.B === null ? null : readRun(slots.B, 'Опыт B', file.version) },
    ...(file.version === 3 ? { evaluationReceipts: receipts } : {}) }, []);
}

function readEvaluationReceipts(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10000 || value.some(id => typeof id !== 'string' || !/^boundary-final-v1:(circles|moons|spiral):\d{1,10}$/.test(id) || Number(id.split(':').at(-1)) > 4294967295 || String(Number(id.split(':').at(-1))) !== id.split(':').at(-1))) throw new Error('Некорректная история раскрытия итоговых оценок.');
  return [...new Set(value as string[])];
}

/** Exposure belongs to the test dataset, survives import/reset, and is not an achievement. */
export function mergeBoundaryEvaluationReceipts(workspace: BoundaryWorkspace, previous: BoundaryWorkspace | string[]): BoundaryWorkspace {
  const copy = structuredClone(workspace);
  const old = Array.isArray(previous) ? previous : [...(previous.evaluationReceipts ?? []), ...[previous.current, previous.slots.A, previous.slots.B].flatMap(run => run?.finalResult?.revealed ? [run.finalResult.evaluationId] : [])];
  const runs = [copy.current, copy.slots.A, copy.slots.B];
  const receipts = readEvaluationReceipts([...new Set([...old, ...(copy.evaluationReceipts ?? []), ...runs.flatMap(run => run?.finalResult?.revealed ? [run.finalResult.evaluationId] : [])])]);
  for (const run of runs) if (run?.finalResult && !run.finalResult.revealed && receipts.includes(run.finalResult.evaluationId)) {
    run.finalResult.reused = true;
  }
  if (copy.version === 3 || receipts.length) { copy.version = 3; copy.evaluationReceipts = receipts; }
  return copy;
}

export function readBoundaryStorage(storage: Pick<Storage, 'getItem'>): BoundaryWorkspace | null {
  const text = storage.getItem(boundaryStorageKey);
  return text === null ? null : decodeBoundaryWorkspace(text);
}

type BoundaryLock = <T>(name: string, action: () => T) => Promise<T>;
async function boundaryLock<T>(name: string, action: () => T): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Браузер не поддерживает безопасное сохранение между вкладками. Экспортируйте JSON.');
  return navigator.locks.request(name, action);
}

/** A stale tab must keep its work in memory instead of replacing another tab's workspace. */
export class BoundaryStorageWriter {
  private storage: Pick<Storage, 'getItem' | 'setItem'>;
  private expected: string | null;
  private lock: BoundaryLock;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>, expected: string | null, lock: BoundaryLock = boundaryLock) { this.storage = storage; this.expected = expected; this.lock = lock; }
  save(current: SavedBoundaryRun, slots: BoundarySlots, isCurrent = () => true, evaluationReceipts: string[] = []): Promise<boolean> {
    return this.lock(boundaryStorageKey, () => {
      if (!isCurrent()) return false;
      if (this.storage.getItem(boundaryStorageKey) !== this.expected) throw new Error('В другой вкладке сохранён новый опыт или A/B. Экспортируйте текущий JSON и перезагрузите страницу для чтения новой копии.');
      const workspace = mergeBoundaryEvaluationReceipts(decodeBoundaryWorkspace(encodeBoundaryWorkspace(current, slots, evaluationReceipts)), this.expected === null ? [] : decodeBoundaryWorkspace(this.expected));
      const text = encodeBoundaryWorkspace(workspace.current, workspace.slots, workspace.evaluationReceipts);
      this.storage.setItem(boundaryStorageKey, text);
      this.expected = text;
      return true;
    });
  }
}

export async function readBoundaryImport(file: Pick<File, 'size' | 'text'>, isCurrent: () => boolean): Promise<BoundaryWorkspace> {
  if (file.size > boundaryFileLimit) throw new Error('Файл слишком большой: максимум 2 МиБ.');
  const text = await file.text();
  if (!isCurrent()) throw new Error('Опыт изменился во время чтения файла. Повторите импорт, если хотите заменить новые изменения.');
  return decodeBoundaryWorkspace(text);
}

export function writeBoundaryStorage(storage: Pick<Storage, 'setItem'>, current: SavedBoundaryRun, slots: BoundarySlots): void {
  const text = encodeBoundaryWorkspace(current, slots);
  // Validate all slots before writing; invalid input must not replace a previous local record.
  decodeBoundaryWorkspace(text);
  storage.setItem(boundaryStorageKey, text);
}

export function boundaryComparisonDifferences(a: SavedBoundaryRun, b: SavedBoundaryRun): string[] {
  const A = boundaryTrainingSettings(a.settings), B = boundaryTrainingSettings(b.settings);
  const budgetA = boundaryBatchProgress(a.optimizer.step, A.batchSize, boundaryTrainSize(A.data)).examples, budgetB = boundaryBatchProgress(b.optimizer.step, B.batchSize, boundaryTrainSize(B.data)).examples;
  return [A.kind !== B.kind && 'разные наборы данных', A.seed !== B.seed && 'разные seed данных',
    A.initSeed !== B.initSeed && 'разные seed начальных весов', A.batchSeed !== B.batchSeed && 'разные seed порядка batch',
    JSON.stringify(A.config.layers) !== JSON.stringify(B.config.layers) && 'разные архитектуры или активации',
    (A.config.features ?? 'raw') !== (B.config.features ?? 'raw') && 'разные входные признаки',
    boundaryTrainSize(A.data) !== boundaryTrainSize(B.data) && 'разное количество train-точек',
    (A.data?.labelNoise ?? 0) !== (B.data?.labelNoise ?? 0) && 'разные доли ошибок train-меток',
    A.method !== B.method && 'разные оптимизаторы', A.lr !== B.lr && 'разные скорости обучения',
    A.batchSize !== B.batchSize && 'разные размеры batch', A.lambda !== B.lambda && 'разные L2 λ',
    a.optimizer.step !== b.optimizer.step && 'разное число обновлений', budgetA !== budgetB && 'разный бюджет train-примеров',
    a.threshold !== b.threshold && 'разные пороги решения'].filter((value): value is string => !!value);
}
