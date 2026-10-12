import { normalizationTrace, projectTokens, temperatureSoftmax } from './transformerMath.ts';
import type { HeadParameters } from './transformerHeadMath.ts';
import type { Vec3 } from './scene3dMath.ts';

export function normalizationGeometry(base: Vec3, shift: number, scale: number, epsilon: number) {
  if (![...base, shift, scale, epsilon].every(Number.isFinite)) throw new RangeError('Нужны конечные координаты и настройки');
  const input = base.map(value => scale * value + shift);
  const layer = normalizationTrace(input, 'layer', epsilon), rms = normalizationTrace(input, 'rms', epsilon);
  return { input, centered: input.map(value => value - layer.mean), layer, rms };
}

export function headGeometryProbe(hidden: number[], parameters: HeadParameters) {
  if (hidden.length !== 2 || parameters.weights.length !== 2 || parameters.bias.length !== parameters.weights[0].length || !parameters.bias.every(Number.isFinite)) {
    throw new RangeError('Геометрия головы: два признака, совместимые W и b');
  }
  const logits = projectTokens([hidden], parameters.weights)[0].map((value, j) => value + parameters.bias[j]);
  if (!logits.every(Number.isFinite)) throw new RangeError('Переполнение logits');
  return { logits, probabilities: temperatureSoftmax(logits), winner: logits.indexOf(Math.max(...logits)) };
}

/** A deliberately scalar stack; local identity and branch gradients add before the next backward step. */
export function residualGradientTrace(input: number, weight: number, depth: number, residual: boolean) {
  if (![input, weight].every(Number.isFinite) || !Number.isInteger(depth) || depth < 1 || depth > 12) throw new RangeError('Нужны конечные h, a и глубина 1…12');
  let hidden = input;
  const layers = Array.from({ length: depth }, (_, index) => {
    const before = hidden, branch = weight * Math.tanh(before);
    const branchDerivative = weight * (1 - Math.tanh(before) ** 2);
    hidden = (residual ? before : 0) + branch;
    return { index, before, branch, after: hidden, branchDerivative, localDerivative: (residual ? 1 : 0) + branchDerivative };
  });
  let gradient = 1;
  const backward = [...layers].reverse().map(layer => {
    const incoming = gradient, identity = residual ? incoming : 0, branch = incoming * layer.branchDerivative;
    gradient = identity + branch;
    return { ...layer, incoming, identity, branchGradient: branch, outgoing: gradient };
  });
  return { layers, backward, output: hidden, gradient };
}
