import type { BoundarySettings } from './boundaryExperiment.ts';

export type BoundaryLessonForm = 'hidden' | 'threshold';
export type BoundaryLessonMode = 'free' | BoundaryLessonForm;
export type LessonObservation = {
  name: string; step: number; settings: BoundarySettings; threshold: number;
  probe: [number, number]; params: number[]; probability: number;
  trainLoss: number | null; validationLoss: number | null;
};
export type BoundaryLessonAttempt = {
  form: BoundaryLessonForm; version: 1; instanceId: string; index: number;
  prediction: string; explanation: string; answers: string[];
  predictionBeforeAction: boolean; exposed: boolean; help: boolean;
  checked: boolean | null; observations: LessonObservation[];
};

export function createLessonAttempt(form: BoundaryLessonForm, index = 0): BoundaryLessonAttempt {
  if (!Number.isInteger(index) || index < 0 || index > 9999) throw new Error('Доступные новые экземпляры закончились. История сохранена.');
  return { form, version: 1, instanceId: `boundary-${form}-v1-${index}`, index,
    prediction: '', explanation: '', answers: [], predictionBeforeAction: false,
    exposed: false, help: false, checked: null, observations: [] };
}

/** A new index changes the first probability without repeating an earlier list. */
export function thresholdLessonQuestion(index: number) {
  const first = Number((.05 + index / 100000).toFixed(5));
  const second = Number((((index * 37 + 19) % 81 + 10) / 100).toFixed(2));
  const third = Number((((index * 53 + 65) % 81 + 10) / 100).toFixed(2));
  const probabilities = [first, second, third], thresholds = [.35, .65];
  return { probabilities, thresholds, answers: thresholds.flatMap(threshold => probabilities.map(p => String(Number(p >= threshold)))) };
}

export function checkThresholdLesson(index: number, answers: string[]) {
  const expected = [...thresholdLessonQuestion(index).answers, 'same', 'training'];
  return answers.length === expected.length && expected.every((value, i) => answers[i] === value);
}

export function hiddenLessonMismatches(settings: BoundarySettings) {
  const extra = settings as BoundarySettings & { data?: { trainSize: number; labelNoise: number } };
  const config = settings.config as BoundarySettings['config'] & { features?: string };
  const reasons = [];
  if (settings.kind !== 'circles') reasons.push('нужны данные «Круги»');
  if (settings.method !== 'adam') reasons.push('нужен Adam');
  if (settings.lr !== .02) reasons.push('нужна скорость 0,02');
  if ((settings.batchSize ?? 96) !== 96) reasons.push('нужен batch 96');
  if ((settings.lambda ?? 0) !== 0) reasons.push('нужна λ = 0');
  if (extra.data && extra.data.trainSize !== 96) reasons.push('нужны 96 train');
  if (extra.data && extra.data.labelNoise !== 0) reasons.push('нужны исходные train-метки');
  if (config.features !== undefined && config.features !== 'raw') reasons.push('нужны только два исходных входа');
  const layers = settings.config.layers;
  if (!(layers.length === 0 || (layers.length === 1 && layers[0].width === 8 && layers[0].activation === 'tanh'))) reasons.push('нужны 0 скрытых слоёв или один слой 8 tanh');
  return reasons;
}

export function hiddenComparisonMismatches(a: LessonObservation, b: LessonObservation) {
  const reasons = [...hiddenLessonMismatches(a.settings), ...hiddenLessonMismatches(b.settings)];
  if (a.settings.config.layers.length !== 0 || b.settings.config.layers.length !== 1) reasons.push('снимок A должен быть линейным, B — со скрытым слоем');
  if (a.step !== 700 || b.step !== 700) reasons.push('оба бюджета должны быть ровно 700 обновлений');
  if (a.settings.seed !== b.settings.seed) reasons.push('seed данных различается');
  if ((a.settings.initSeed ?? a.settings.seed) !== (b.settings.initSeed ?? b.settings.seed)) reasons.push('seed начальных весов различается (сама архитектура всё равно меняет число весов)');
  if ((a.settings.batchSeed ?? a.settings.seed) !== (b.settings.batchSeed ?? b.settings.seed)) reasons.push('seed порядка batch различается');
  if (a.threshold !== b.threshold) reasons.push('пороги решений различаются');
  const dataA = (a.settings as BoundarySettings & { data?: unknown }).data;
  const dataB = (b.settings as BoundarySettings & { data?: unknown }).data;
  if (JSON.stringify(dataA) !== JSON.stringify(dataB)) reasons.push('версии генератора или настройки данных различаются');
  return [...new Set(reasons)];
}

export function thresholdObservationMismatches(previous: LessonObservation, next: LessonObservation, action: 'threshold' | 'input' | 'training') {
  const reasons = [];
  if (JSON.stringify(previous.settings) !== JSON.stringify(next.settings)) reasons.push('настройки сети/данных изменились');
  if (action !== 'training' && JSON.stringify(previous.params) !== JSON.stringify(next.params)) reasons.push('параметры изменились');
  if (next.step !== previous.step + (action === 'training' ? 1 : 0)) reasons.push(action === 'training' ? 'нужен ровно один шаг обучения' : 'шаг обучения изменился');
  if (action === 'threshold' ? previous.threshold === next.threshold : previous.threshold !== next.threshold) reasons.push(action === 'threshold' ? 'порог ещё не изменён' : 'порог тоже изменился');
  const sameProbe = JSON.stringify(previous.probe) === JSON.stringify(next.probe);
  if (action === 'input' ? sameProbe : !sameProbe) reasons.push(action === 'input' ? 'вход ещё не изменён' : 'вход тоже изменился');
  return reasons;
}

export function lessonEvidence(attempt: BoundaryLessonAttempt, storageVerified: boolean) {
  if (!storageVerified) return 'История хранения не подтверждена; самостоятельность попытки не установлена.';
  if (attempt.exposed) return 'Ответ уже раскрыт: это работа с образцом.';
  if (attempt.help) return 'Содержательная помощь использована; ответ учитывается отдельно.';
  if (attempt.checked === true) return 'Объективные ответы верны без отмеченной помощи. Свободное объяснение не оценено; освоение и перенос не подтверждены.';
  return 'Черновик опыта. Просмотр и сохранение не подтверждают освоение.';
}
