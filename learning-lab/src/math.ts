export type Activation = 'relu' | 'sigmoid' | 'tanh';

function finite(values: number[], label: string) {
  if (!values.every(Number.isFinite)) throw new RangeError(`${label}: нужны конечные числа`);
}

export function activate(x: number, kind: Activation): number {
  if (kind === 'relu') return Math.max(0, x);
  if (kind === 'tanh') return Math.tanh(x);
  // This branch also avoids exp overflow for large negative logits.
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

export function activationDerivative(x: number, kind: Activation): number {
  if (kind === 'relu') return x > 0 ? 1 : 0;
  const a = activate(x, kind);
  return kind === 'tanh' ? 1 - a * a : a * (1 - a);
}

/** Input [batch,in], weights [out,in], bias [out]; output [batch,out]. */
export function linear(input: number[][], weights: number[][], bias: number[]): number[][] {
  const width = weights[0]?.length ?? 0;
  if (!width || weights.length !== bias.length || weights.some(row => row.length !== width) || input.some(row => row.length !== width)) {
    throw new RangeError('Linear: несовместимые формы [batch,in] × [out,in] + [out]');
  }
  finite([...input.flat(), ...weights.flat(), ...bias], 'Linear');
  return input.map(row => weights.map((weight, j) => row.reduce((sum, x, i) => sum + x * weight[i], bias[j])));
}

export function mse(pred: number[], target: number[]) {
  if (!pred.length || pred.length !== target.length) throw new RangeError('MSE: нужны одинаковые непустые формы');
  finite([...pred, ...target], 'MSE');
  const terms = pred.map((p, i) => (p - target[i]) ** 2);
  return { loss: terms.reduce((a, b) => a + b, 0) / pred.length, grad: pred.map((p, i) => 2 * (p - target[i]) / pred.length), terms };
}

function probability(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label}: значение должно быть в [0,1]`);
}

export function bceProbability(p: number, y: number) {
  probability(p, 'BCE p');
  probability(y, 'BCE target');
  // Skip zero-weight terms: 0 * log(0) must not become NaN at a correct endpoint.
  const loss = (y === 0 ? 0 : -y * Math.log(p)) + (y === 1 ? 0 : -(1 - y) * Math.log1p(-p));
  const grad = (y === 0 ? 0 : -y / p) + (y === 1 ? 0 : (1 - y) / (1 - p));
  return { loss, grad };
}

export function bceLogit(z: number, y: number) {
  finite([z], 'BCE logit');
  probability(y, 'BCE target');
  return { loss: Math.max(z, 0) - z * y + Math.log1p(Math.exp(-Math.abs(z))), grad: activate(z, 'sigmoid') - y };
}

/** q is reused by both the square branch and the identity branch. */
export function sharedGraph(x: number, w: number, target: number) {
  finite([x, w, target], 'Граф');
  const q = x * w;
  const p = q * q + q;
  const delta = p - target;
  const square = delta * 2 * q;
  const identity = delta;
  const dq = square + identity;
  return {
    values: { x, w, q, p, target, loss: 0.5 * delta * delta },
    gradients: { loss: 1, p: delta, q: dq, x: dq * w, w: dq * x },
    qContributions: { square, identity },
  };
}

export function finiteDifference(fn: (params: number[]) => number, params: number[], epsilon = 1e-5): number[] {
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw new RangeError('epsilon должен быть положительным');
  return params.map((_, i) => {
    const plus = [...params];
    const minus = [...params];
    plus[i] += epsilon;
    minus[i] -= epsilon;
    return (fn(plus) - fn(minus)) / (2 * epsilon);
  });
}

export type OptimizerKind = 'sgd' | 'momentum' | 'adam';
export type OptimizerOptions = { lr?: number; momentum?: number; beta1?: number; beta2?: number; epsilon?: number };
export type OptimizerState = { params: number[]; m: number[]; v: number[]; step: number };

export function createOptimizerState(params: number[]): OptimizerState {
  finite(params, 'Параметры');
  return { params: [...params], m: params.map(() => 0), v: params.map(() => 0), step: 0 };
}

export function optimizerStep(state: OptimizerState, gradient: number[], kind: OptimizerKind, options: OptimizerOptions = {}): OptimizerState {
  const { lr = 0.03, momentum = 0.9, beta1 = 0.9, beta2 = 0.999, epsilon = 1e-8 } = options;
  if (gradient.length !== state.params.length || state.m.length !== gradient.length || state.v.length !== gradient.length) throw new RangeError('Оптимизатор: несовместимые формы');
  finite([...state.params, ...state.m, ...state.v, ...gradient, lr, momentum, beta1, beta2, epsilon], 'Оптимизатор');
  if (lr < 0 || momentum < 0 || momentum >= 1 || beta1 < 0 || beta1 >= 1 || beta2 < 0 || beta2 >= 1 || epsilon <= 0 || state.v.some(v => v < 0) || !Number.isInteger(state.step) || state.step < 0) throw new RangeError('Оптимизатор: недопустимые настройки');
  const step = state.step + 1;
  const m = gradient.map((g, i) => kind === 'adam' ? beta1 * state.m[i] + (1 - beta1) * g : kind === 'momentum' ? momentum * state.m[i] + g : 0);
  const v = gradient.map((g, i) => kind === 'adam' ? beta2 * state.v[i] + (1 - beta2) * g * g : 0);
  const params = state.params.map((p, i) => {
    const direction = kind === 'adam' ? (m[i] / (1 - beta1 ** step)) / (Math.sqrt(v[i] / (1 - beta2 ** step)) + epsilon) : kind === 'momentum' ? m[i] : gradient[i];
    return p - lr * direction;
  });
  return { params, m, v, step };
}

export function quadratic(params: number[]) {
  if (params.length !== 2) throw new RangeError('Квадратичная функция: нужны два параметра');
  finite(params, 'Квадратичная функция');
  const [x, y] = params;
  return { loss: 0.5 * (x * x + 8 * y * y), grad: [x, 8 * y] };
}

export const XOR_DATA: { input: [number, number]; target: number }[] = [
  { input: [0, 0], target: 0 },
  { input: [0, 1], target: 1 },
  { input: [1, 0], target: 1 },
  { input: [1, 1], target: 0 },
];

/** 17 params: W1 [4,2], b1 [4], W2 [1,4], b2 [1], in that order. */
export function createNetwork(seed = 42): number[] {
  if (!Number.isFinite(seed)) throw new RangeError('seed должен быть конечным');
  let value = seed >>> 0;
  const random = () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 17 }, (_, i) => i === 16 ? 0 : (2 * random() - 1) * (i >= 8 && i < 12 ? 0.1 : 1));
}

function networkForward(params: number[], input: [number, number]) {
  if (params.length !== 17) throw new RangeError('XOR: нужны 17 параметров сети 2→4→1');
  finite([...params, ...input], 'XOR');
  const hidden = Array.from({ length: 4 }, (_, j) => Math.tanh(params[2 * j] * input[0] + params[2 * j + 1] * input[1] + params[8 + j]));
  const logit = hidden.reduce((sum, h, j) => sum + params[12 + j] * h, params[16]);
  return { hidden, logit };
}

export function predictNetwork(params: number[], input: [number, number]): number {
  return activate(networkForward(params, input).logit, 'sigmoid');
}

export function networkLossGradient(params: number[]) {
  const grad = Array<number>(17).fill(0);
  const predictions: number[] = [];
  let loss = 0;
  for (const { input, target } of XOR_DATA) {
    const { hidden, logit } = networkForward(params, input);
    const result = bceLogit(logit, target);
    predictions.push(activate(logit, 'sigmoid'));
    loss += result.loss / XOR_DATA.length;
    const dz = result.grad / XOR_DATA.length;
    grad[16] += dz;
    for (let j = 0; j < 4; j++) {
      grad[12 + j] += dz * hidden[j];
      const dh = dz * params[12 + j] * (1 - hidden[j] * hidden[j]);
      grad[2 * j] += dh * input[0];
      grad[2 * j + 1] += dh * input[1];
      grad[8 + j] += dh;
    }
  }
  return { loss, grad, predictions };
}
