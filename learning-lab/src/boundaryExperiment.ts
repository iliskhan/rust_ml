import { boundaryLossGradient, boundaryMetrics, boundaryParameterCount, createBoundaryParameters, makeBoundaryDataset, type BoundaryConfig, type BoundaryDataset, type BoundaryKind } from './boundaryNetworkMath.ts';
import { createOptimizerState, optimizerStep, type Activation, type OptimizerKind, type OptimizerState } from './math.ts';

export type BoundarySettings = { kind: BoundaryKind; seed: number; config: BoundaryConfig; method: OptimizerKind; lr: number };
export type BoundaryHistoryPoint = { step: number; train: number; validation: number };
export type BoundaryExperiment = { settings: BoundarySettings; dataset: BoundaryDataset; optimizer: OptimizerState; history: BoundaryHistoryPoint[]; auto: boolean; remaining: number; error: string | null };
export type SavedBoundaryRun = { settings: BoundarySettings; optimizer: OptimizerState; history: BoundaryHistoryPoint[]; threshold: number; probe: [number, number] };
export type BoundarySlots = { A: SavedBoundaryRun | null; B: SavedBoundaryRun | null };
export type BoundaryWorkspace = { format: 'rustml-boundary'; version: 1; current: SavedBoundaryRun; slots: BoundarySlots };
export const boundaryStorageKey = 'rustml-boundary-v1';
export const boundaryStepLimit = 4000;
export const boundaryFileLimit = 2 * 1024 * 1024;
const numericLimit = 1e100;
export const initialBoundarySettings: BoundarySettings = { kind: 'moons', seed: 42, config: { layers: [{ width: 8, activation: 'tanh' }, { width: 8, activation: 'tanh' }] }, method: 'adam', lr: .02 };

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
  const dataset = makeBoundaryDataset(settings.kind, settings.seed);
  const optimizer = createOptimizerState(createBoundaryParameters(settings.config, settings.seed));
  return { settings: structuredClone(settings), dataset, optimizer, history: [lossPoint(optimizer, settings, dataset)], auto: false, remaining: 0, error: null };
}

// Bound affine sums for every input in [0,1]², including places outside the samples.
function checkDomain(params: number[], config: BoundaryConfig) {
  let bounds = [1, 1], offset = 0;
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
  const { settings, dataset } = experiment;
  const steps = Math.min(count, boundaryStepLimit - experiment.optimizer.step);
  if (steps <= 0) return { ...experiment, auto: false, remaining: 0 };
  try {
    let optimizer = experiment.optimizer;
    for (let i = 0; i < steps; i++) {
      const { grad } = boundaryLossGradient(optimizer.params, settings.config, dataset.train);
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
  const { settings, optimizer, history } = experiment;
  return structuredClone({ settings, optimizer, history, threshold, probe });
}

export function restoreBoundaryRun(saved: SavedBoundaryRun): BoundaryExperiment {
  const { settings, optimizer, history } = structuredClone(saved);
  return { settings, optimizer, history, dataset: makeBoundaryDataset(settings.kind, settings.seed), auto: false, remaining: 0, error: null };
}

export function encodeBoundaryWorkspace(current: SavedBoundaryRun, slots: BoundarySlots): string {
  return JSON.stringify({ format: 'rustml-boundary', version: 1, current, slots } satisfies BoundaryWorkspace);
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

function readRun(value: unknown, label: string): SavedBoundaryRun {
  const run = object(value, label), rawSettings = object(run.settings, `${label}: настройки`);
  const rawConfig = object(rawSettings.config, `${label}: архитектура`);
  if (!Array.isArray(rawConfig.layers) || rawConfig.layers.length > 3) throw new Error(`${label}: нужны 0–3 скрытых слоя.`);
  const config: BoundaryConfig = { layers: rawConfig.layers.map(value => {
    const layer = object(value, `${label}: слой`);
    return { width: integer(layer.width, 1, 16, `${label}: ширина слоя`), activation: choice<Activation>(layer.activation, ['relu', 'tanh', 'sigmoid'], `${label}: активация`) };
  }) };
  const settings: BoundarySettings = { config, kind: choice<BoundaryKind>(rawSettings.kind, ['circles', 'moons', 'spiral'], `${label}: данные`),
    seed: integer(rawSettings.seed, 0, 4294967295, `${label}: seed`), method: choice<OptimizerKind>(rawSettings.method, ['sgd', 'momentum', 'adam'], `${label}: оптимизатор`),
    lr: number(rawSettings.lr, .001, .2, `${label}: скорость обучения`) };
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
    const dataset = makeBoundaryDataset(settings.kind, settings.seed);
    const current = lossPoint(optimizer, settings, dataset), last = history.at(-1)!;
    if (['train', 'validation'].some(key => {
      const field = key as 'train' | 'validation';
      return Math.abs(current[field] - last[field]) > 1e-12 * Math.max(1, current[field]);
    })) throw new Error('Последняя точка истории не соответствует весам.');
    const next = optimizerStep(optimizer, boundaryLossGradient(optimizer.params, config, dataset.train).grad, settings.method, { lr: settings.lr });
    checkOptimizer(next);
    checkDomain(next.params, config);
  } catch (error) {
    throw new Error(`${label}: небезопасное или несогласованное численное состояние. ${error instanceof Error ? error.message : ''}`);
  }
  return { settings, optimizer, history, threshold, probe };
}

export function decodeBoundaryWorkspace(text: string): BoundaryWorkspace {
  if (text.length > boundaryFileLimit || new TextEncoder().encode(text).length > boundaryFileLimit) throw new Error('Файл слишком большой: максимум 2 МиБ.');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON. Выберите файл экспорта лаборатории.'); }
  const file = object(value, 'Файл');
  if (file.format !== 'rustml-boundary' || file.version !== 1) throw new Error('Неподдерживаемый формат или версия. Нужен экспорт RustML Boundary v1.');
  const slots = object(file.slots, 'Слоты A/B');
  return { format: 'rustml-boundary', version: 1, current: readRun(file.current, 'Текущий опыт'),
    slots: { A: slots.A === null ? null : readRun(slots.A, 'Опыт A'), B: slots.B === null ? null : readRun(slots.B, 'Опыт B') } };
}

export function readBoundaryStorage(storage: Pick<Storage, 'getItem'>): BoundaryWorkspace | null {
  const text = storage.getItem(boundaryStorageKey);
  return text === null ? null : decodeBoundaryWorkspace(text);
}

export function writeBoundaryStorage(storage: Pick<Storage, 'setItem'>, current: SavedBoundaryRun, slots: BoundarySlots): void {
  const text = encodeBoundaryWorkspace(current, slots);
  if (new TextEncoder().encode(text).length > boundaryFileLimit) throw new Error('Сохранение превышает 2 МиБ. Экспортируйте опыт и сократите историю сбросом.');
  storage.setItem(boundaryStorageKey, text);
}

export function boundaryComparisonDifferences(a: SavedBoundaryRun, b: SavedBoundaryRun): string[] {
  return [a.settings.kind !== b.settings.kind && 'разные наборы данных', a.settings.seed !== b.settings.seed && 'разные seed (данные и начальные веса)',
    a.optimizer.step !== b.optimizer.step && 'разное число шагов', a.threshold !== b.threshold && 'разные пороги решения'].filter((value): value is string => !!value);
}
