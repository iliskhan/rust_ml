import { rnnForward, type RecurrentWeights } from './architectures.ts';

/** Local state Jacobian of one cell, not the gradient of the sequence loss. */
export function rnnLocalJacobian(previous: number, x: number, weights: RecurrentWeights) {
  if (![previous, x, weights.wx, weights.wh, weights.b].every(Number.isFinite)) {
    throw new RangeError('Для локального якобиана нужны конечные значения.');
  }
  const row = rnnForward([x], weights, previous)[0];
  return { ...row, derivative: 1 - row.h ** 2, jacobian: weights.wh * (1 - row.h ** 2) };
}
