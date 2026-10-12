import { rnnForward, type RecurrentWeights } from './architectures.ts';

export type BpttStep = {
  t: number; x: number; previous: number; z: number; h: number;
  tanhDerivative: number; recurrentDerivative: number;
  dh: number; dz: number; dx: number; dhPrevious: number;
  dWx: number; dWh: number; db: number;
};

// One final-state loss; h0 and the inputs are differentiated but held fixed by SGD.
export function bptt(input: readonly number[], weights: RecurrentWeights, target: number, h0 = 0) {
  if (input.length < 1 || input.length > 16) throw new RangeError('Нужна последовательность длины 1–16.');
  if (![...input, weights.wx, weights.wh, weights.b, target, h0].every(Number.isFinite)) {
    throw new RangeError('Входы, веса, цель и h₀ должны быть конечными числами.');
  }
  const forward = rnnForward([...input], weights, h0);
  const prediction = forward.at(-1)!.h;
  const loss = 0.5 * (prediction - target) ** 2;
  const steps = new Array<BpttStep>(input.length);
  const gradients = { wx: 0, wh: 0, b: 0 };
  let dh = prediction - target;
  for (let i = input.length - 1; i >= 0; i--) {
    const row = forward[i];
    const tanhDerivative = 1 - row.h ** 2;
    const dz = dh * tanhDerivative;
    const dWx = dz * row.x, dWh = dz * row.previous, db = dz;
    const recurrentDerivative = weights.wh * tanhDerivative;
    const dhPrevious = dz * weights.wh;
    steps[i] = { ...row, t: i + 1, tanhDerivative, recurrentDerivative, dh, dz,
      dx: dz * weights.wx, dhPrevious, dWx, dWh, db };
    gradients.wx += dWx;
    gradients.wh += dWh;
    gradients.b += db;
    dh = dhPrevious;
  }
  if (![loss, dh, ...Object.values(gradients), ...steps.flatMap(row => Object.values(row))].every(Number.isFinite)) {
    throw new RangeError('Переполнение расчёта: уменьшите входы, веса или цель.');
  }
  return { steps, prediction, loss, gradients, dh0: dh };
}

export function trainBptt(input: readonly number[], weights: RecurrentWeights, target: number, h0: number, eta: number, count = 1) {
  if (!Number.isFinite(eta) || eta <= 0 || eta > 1) throw new RangeError('Шаг η должен быть больше 0 и не больше 1.');
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new RangeError('Пакет содержит 1–20 шагов SGD.');
  const before = bptt(input, weights, target, h0);
  let current = { ...weights }, after = before;
  const losses = [before.loss];
  for (let i = 0; i < count; i++) {
    current = {
      wx: current.wx - eta * after.gradients.wx,
      wh: current.wh - eta * after.gradients.wh,
      b: current.b - eta * after.gradients.b,
    };
    after = bptt(input, current, target, h0);
    losses.push(after.loss);
  }
  return { weights: current, before, after, losses };
}
