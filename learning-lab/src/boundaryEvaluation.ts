import { boundaryMetrics, checkBoundaryFinalTestSeed, makeBoundaryFinalTest } from './boundaryNetworkMath.ts';
import type { BoundaryExperiment, BoundarySettings } from './boundaryExperiment.ts';

export { makeBoundaryFinalTest } from './boundaryNetworkMath.ts';
export type BoundaryFinalResult = {
  version: 1;
  evaluationId: string;
  testSeed: number;
  model: { settings: BoundarySettings; params: number[]; step: number; threshold: number; criterion: string };
  revealed: boolean;
  reused: boolean;
  metrics?: ReturnType<typeof boundaryMetrics>;
};

export function boundaryEvaluationId(kind: BoundarySettings['kind'], testSeed: number): string {
  if (!['circles', 'moons', 'spiral'].includes(kind) || !Number.isInteger(testSeed) || testSeed < 0 || testSeed > 4294967295) throw new Error('Некорректный набор итоговой оценки.');
  return `boundary-final-v1:${kind}:${testSeed}`;
}

/** Selection is copied before any test values are computed or disclosed. */
export function freezeBoundaryEvaluation(experiment: BoundaryExperiment, threshold: number, criterion: string, testSeed: number, receipts: string[] = []): BoundaryFinalResult {
  if (!Number.isFinite(threshold) || threshold < .05 || threshold > .95) throw new Error('Порог должен быть от .05 до .95.');
  if (typeof criterion !== 'string' || !criterion.trim() || criterion.length > 500) throw new Error('Укажите критерий выбора модели (1–500 символов).');
  const evaluationId = boundaryEvaluationId(experiment.settings.kind, testSeed);
  checkBoundaryFinalTestSeed(experiment.settings.seed, testSeed);
  return { version: 1, evaluationId, testSeed, model: structuredClone({ settings: experiment.settings, params: experiment.optimizer.params,
    step: experiment.optimizer.step, threshold, criterion: criterion.trim() }), revealed: false, reused: receipts.includes(evaluationId) };
}

export function revealBoundaryEvaluation(result: BoundaryFinalResult): BoundaryFinalResult {
  checkBoundaryFinalTestSeed(result.model.settings.seed, result.testSeed);
  const copy = structuredClone(result);
  copy.metrics = boundaryMetrics(copy.model.params, copy.model.settings.config, makeBoundaryFinalTest(copy.model.settings.kind, copy.testSeed), copy.model.threshold);
  copy.revealed = true;
  return copy;
}
