import { finiteDifference, linear, mse, quadratic, sharedGraph } from './math.ts';
import { layerNorm, softmax } from './architectures.ts';

// Reuse the lab's computations; the guards below describe these controls' domain.
export { finiteDifference, linear, mse, quadratic, sharedGraph };

export function secant(x: number, h: number) {
  if (![x, h].every(Number.isFinite) || h === 0) throw new RangeError('Секущая: h должен быть конечным и ненулевым');
  return { y: x * x, nextY: (x + h) ** 2, slope: 2 * x + h, derivative: 2 * x };
}

export function dotProduct(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length || ![...a, ...b].every(Number.isFinite)) throw new RangeError('Скалярное произведение: нужны равные непустые векторы');
  const terms = a.map((v, i) => v * b[i]);
  return { terms, value: terms.reduce((a, b) => a + b, 0) };
}

export function stableSoftmax(logits: number[], temperature = 1) {
  if (!logits.length || !logits.every(Number.isFinite) || !Number.isFinite(temperature) || temperature <= 0) throw new RangeError('Softmax: конечные логиты, температура > 0');
  // Shift BEFORE division: a large shared logit cannot overflow when T < 1.
  const max = Math.max(...logits);
  return softmax(logits.map(v => (v - max) / temperature));
}

export function crossEntropyLogits(logits: number[], target: number) {
  if (!Number.isInteger(target) || target < 0 || target >= logits.length) throw new RangeError('Cross-entropy: неверный класс');
  const probabilities = stableSoftmax(logits);
  const max = Math.max(...logits);
  const logSum = Math.log(logits.reduce((sum, z) => sum + Math.exp(z - max), 0));
  return { loss: (max - logits[target]) + logSum, probabilities, gradient: probabilities.map((p, i) => p - Number(i === target)) };
}

export function bernoulli(p: number) {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('Вероятность должна лежать в [0,1]');
  const entropy = -(p === 0 ? 0 : p * Math.log(p)) - (p === 1 ? 0 : (1 - p) * Math.log1p(-p));
  return { mean: p, variance: p * (1 - p), entropy };
}

export function normalize(values: number[], epsilon = 1e-5) {
  if (!values.length || !values.every(Number.isFinite) || !Number.isFinite(epsilon) || epsilon <= 0) throw new RangeError('Нормализация: непустой ряд и ε > 0');
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length;
  return { mean, variance, values: layerNorm(values, epsilon) };
}

export function chainSquare(x: number, a: number) {
  const u = a * x + 1;
  return { u, y: u * u, localOuter: 2 * u, localInner: a, derivative: 2 * u * a };
}

export function descent1D(initial: number, rate: number, steps = 12) {
  if (![initial, rate].every(Number.isFinite) || rate < 0 || !Number.isInteger(steps) || steps < 0 || steps > 100) throw new RangeError('Спуск: неверные настройки');
  const points = [{ x: initial, loss: initial * initial / 2 }];
  for (let i = 0; i < steps; i++) {
    const x = points[i].x * (1 - rate);
    points.push({ x, loss: x * x / 2 });
  }
  return points;
}

// A transparent overfitting example: y=x, with one noisy training label at x=0.
// Mix the simple line with the degree-4 interpolant of the five training points.
export const regressionTrain = [-2, -1, 0, 1, 2].map(x => ({ x, y: x + (x === 0 ? .8 : 0) }));
export const regressionValidation = [-1.5, -.5, .5, 1.5].map(x => ({ x, y: x }));
export function regressionPrediction(x: number, flexibility: number) {
  return x + flexibility * .8 * (x * x - 1) * (x * x - 4) / 4;
}
export function regressionErrors(flexibility: number) {
  const error = (rows: { x: number; y: number }[]) => mse(rows.map(p => regressionPrediction(p.x, flexibility)), rows.map(p => p.y)).loss;
  return { train: error(regressionTrain), validation: error(regressionValidation) };
}
