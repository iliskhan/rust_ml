import { projectTokens, temperatureSoftmax, toyLanguageForward, TOY_OUTPUT_WEIGHTS, TOY_VOCAB } from './transformerMath.ts';
import type { Matrix } from './transformerMath.ts';

export type HeadParameters = { weights: Matrix; bias: number[] };
export const HEAD_SEQUENCE = [0, 1, 2, 4, 5];

export function initialHeadParameters(): HeadParameters {
  return { weights: TOY_OUTPUT_WEIGHTS.map(row => [...row]), bias: TOY_VOCAB.map(() => 0) };
}

/** Teacher input excludes the final token; h[t] sees only sequence[0..t]. */
export function transformerHeadBatch(sequence = HEAD_SEQUENCE) {
  if (sequence.length < 2 || sequence.some(id => !Number.isInteger(id) || id < 0 || id >= TOY_VOCAB.length)) {
    throw new RangeError('Teacher forcing: нужны хотя бы два допустимых ID токенов');
  }
  const inputIds = sequence.slice(0, -1), targets = sequence.slice(1);
  const backbone = toyLanguageForward(inputIds);
  return { inputIds, targets, hidden: backbone.hidden, backbone };
}

/** Fused CE avoids -log(0) when a target probability underflows. T = 1. */
export function headCrossEntropy(logits: number[], target: number) {
  if (!logits.length || !logits.every(Number.isFinite) || !Number.isInteger(target) || target < 0 || target >= logits.length) {
    throw new RangeError('Cross-entropy: нужны конечные logits и допустимый target');
  }
  const maximum = Math.max(...logits);
  const probabilities = temperatureSoftmax(logits);
  const loss = Math.log(logits.reduce((sum, value) => sum + Math.exp(value - maximum), 0)) + (maximum - logits[target]);
  if (!Number.isFinite(loss)) throw new RangeError('Cross-entropy: переполнение потери');
  return { probabilities, loss, dlogits: probabilities.map((p, id) => p - Number(id === target)) };
}

/** Rows h[t], W[feature,token]; average only over active training positions. */
export function headTrainingTrace(hidden: Matrix, targets: number[], parameters: HeadParameters, active = targets.map(() => true)) {
  const { weights, bias } = parameters;
  // projectTokens validates both matrix shapes and all input numbers.
  const projected = projectTokens(hidden, weights);
  if (bias.length !== weights[0].length || !bias.every(Number.isFinite) || targets.length !== hidden.length ||
      active.length !== hidden.length || active.some(value => typeof value !== 'boolean') || !active.some(Boolean)) {
    throw new RangeError('Output head: неверные формы bias/targets/mask или нет обучаемых позиций');
  }
  const positions = projected.map((row, t) => {
    const logits = row.map((value, id) => value + bias[id]);
    const trace = headCrossEntropy(logits, targets[t]);
    const dWeights = hidden[t].map(value => trace.dlogits.map(gradient => value * gradient));
    return { ...trace, logits, dWeights, active: active[t] };
  });
  const count = active.filter(Boolean).length;
  const sumWeights = weights.map((row, d) => row.map((_, id) => positions.reduce((sum, p) => sum + (p.active ? p.dWeights[d][id] : 0), 0)));
  const sumBias = bias.map((_, id) => positions.reduce((sum, p) => sum + (p.active ? p.dlogits[id] : 0), 0));
  const sumLoss = positions.reduce((sum, p) => sum + (p.active ? p.loss : 0), 0);
  if (![...sumWeights.flat(), ...sumBias, sumLoss].every(Number.isFinite)) throw new RangeError('Output head: переполнение градиента или потери');
  return { positions, count, sumLoss, loss: sumLoss / count, sumWeights, sumBias,
    dWeights: sumWeights.map(row => row.map(value => value / count)), dBias: sumBias.map(value => value / count) };
}

export function headSgdStep(hidden: Matrix, targets: number[], parameters: HeadParameters, learningRate: number, active = targets.map(() => true)) {
  if (!Number.isFinite(learningRate) || learningRate <= 0) throw new RangeError('SGD: нужен конечный learning rate > 0');
  const before = headTrainingTrace(hidden, targets, parameters, active);
  const next = {
    weights: parameters.weights.map((row, d) => row.map((value, id) => value - learningRate * before.dWeights[d][id])),
    bias: parameters.bias.map((value, id) => value - learningRate * before.dBias[id]),
  };
  const after = headTrainingTrace(hidden, targets, next, active);
  return { parameters: next, before, after };
}
