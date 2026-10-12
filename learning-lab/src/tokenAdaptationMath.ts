export type BpePair = { left: string; right: string; count: number };
export type BpeStep = { pair: BpePair; tokens: string[]; frequencies: BpePair[] };
export type BpeModel = { alphabet: string[]; vocabulary: string[]; steps: BpeStep[]; tokens: string[] };

const pairKey = (left: string, right: string) => JSON.stringify([left, right]);
export function bpePairs(tokens: readonly string[]): BpePair[] {
  const counts = new Map<string, BpePair>();
  for (let i = 0; i + 1 < tokens.length; i++) {
    const key = pairKey(tokens[i], tokens[i + 1]);
    const pair = counts.get(key);
    if (pair) pair.count++;
    else counts.set(key, { left: tokens[i], right: tokens[i + 1], count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || (pairKey(a.left, a.right) < pairKey(b.left, b.right) ? -1 : 1));
}
export function mergeBpePair(tokens: readonly string[], pair: Pick<BpePair, 'left' | 'right'>): string[] {
  const merged: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === pair.left && tokens[i + 1] === pair.right) { merged.push(pair.left + pair.right); i++; }
    else merged.push(tokens[i]);
  }
  return merged;
}
/** Unicode code points, with no normalization, word splitting, special tokens or byte fallback. */
export function trainBpe(corpus: string, mergeCount: number): BpeModel {
  if (!Number.isInteger(mergeCount) || mergeCount < 0 || mergeCount > 100) throw new RangeError('Число слияний должно быть от 0 до 100.');
  const alphabet = [...new Set(Array.from(corpus))].sort();
  const vocabulary = [...alphabet], steps: BpeStep[] = [];
  let tokens = Array.from(corpus);
  for (let i = 0; i < mergeCount; i++) {
    const frequencies = bpePairs(tokens), pair = frequencies[0];
    if (!pair) break;
    tokens = mergeBpePair(tokens, pair);
    const token = pair.left + pair.right;
    if (!vocabulary.includes(token)) vocabulary.push(token);
    steps.push({ pair: { ...pair }, tokens: [...tokens], frequencies });
  }
  return { alphabet, vocabulary, steps, tokens };
}
export function applyBpe(text: string, model: BpeModel) {
  let tokens = Array.from(text);
  for (const { pair } of model.steps) tokens = mergeBpePair(tokens, pair);
  const ids = tokens.map(token => { const id = model.vocabulary.indexOf(token); return id < 0 ? null : id; });
  return { tokens, ids, decoded: tokens.join(''), unknown: tokens.filter((_, i) => ids[i] === null) };
}

export type FfnKind = 'relu' | 'gelu' | 'swiglu';
export function activation(x: number, kind: FfnKind) {
  if (kind === 'relu') return Math.max(0, x);
  if (kind === 'swiglu') return x / (1 + Math.exp(-x));
  return .5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + .044715 * x ** 3)));
}
export function activationDerivative(x: number, kind: FfnKind) {
  if (kind === 'relu') return x > 0 ? 1 : 0; // Chosen subgradient at the kink is 0.
  if (kind === 'swiglu') { const sigmoid = 1 / (1 + Math.exp(-x)); return sigmoid + x * sigmoid * (1 - sigmoid); }
  const c = Math.sqrt(2 / Math.PI), t = Math.tanh(c * (x + .044715 * x ** 3));
  return .5 * (1 + t) + .5 * x * (1 - t * t) * c * (1 + 3 * .044715 * x * x);
}
export const FFN_UP = [[.8, -.4, .3], [-.6, .7, .2], [.4, .3, -.9], [1, -.2, -.5]];
export const FFN_GATE = [[-.5, .6, .2], [.7, -.3, .4], [-.4, .8, -.6], [.2, -.7, .9]];
export const FFN_DOWN = [[.6, -.3, .4, .2], [-.2, .7, .3, -.5], [.4, .1, -.6, .8]];
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export function ffnTrace(input: readonly number[], kind: FfnKind) {
  if (input.length !== 3 || input.some(v => !Number.isFinite(v))) throw new RangeError('FFN ожидает три конечных входа.');
  const up = FFN_UP.map(row => dot(row, input)), gate = FFN_GATE.map(row => dot(row, input));
  const rows = up.map((u, j) => {
    const z = kind === 'swiglu' ? gate[j] : u, activated = activation(z, kind), localDerivative = activationDerivative(z, kind);
    const product = kind === 'swiglu' ? activated * u : activated;
    const derivative = kind === 'swiglu' ? localDerivative * FFN_GATE[j][0] * u + activated * FFN_UP[j][0] : localDerivative * FFN_UP[j][0];
    return { up: u, gate: z, activated, localDerivative, product, derivative,
      dProductDUp: kind === 'swiglu' ? activated : localDerivative,
      dProductDGate: kind === 'swiglu' ? localDerivative * u : 0 };
  });
  return { rows, output: FFN_DOWN.map(row => dot(row, rows.map(r => r.product))),
    derivative: FFN_DOWN.map(row => dot(row, rows.map(r => r.derivative))),
    parameters: 3 * 4 * (kind === 'swiglu' ? 3 : 2) };
}

export type Matrix = number[][];
export type AdaptationSample = { x: number[]; y: number[] };
export type AdaptationState = { w: Matrix; a: Matrix; b: Matrix };
const matrix = (rows: number, cols: number, f: (i: number, j: number) => number) => Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => f(i, j)));
export const BASE_WEIGHT = matrix(3, 8, (i, j) => .15 * Math.cos((i + 1) * (j + 1)));
export function adaptationInitial(rank: number): AdaptationState {
  if (!Number.isInteger(rank) || rank < 1 || rank > 3) throw new RangeError('Ранг должен быть 1, 2 или 3.');
  return { w: BASE_WEIGHT.map(row => [...row]), a: matrix(rank, 8, (i, j) => .25 * Math.sin((i + 1) * (j + 1) + .7)), b: matrix(3, rank, () => 0) };
}
export function adaptationDelta(state: AdaptationState): Matrix {
  return matrix(3, 8, (i, j) => state.b[i].reduce((sum, b, k) => sum + b * state.a[k][j], 0));
}
export function adaptationPredict(state: AdaptationState, x: readonly number[], mode: 'full' | 'lora') {
  if (x.length !== 8 || x.some(v => !Number.isFinite(v))) throw new RangeError('Ожидается восемь конечных входов.');
  const low = state.a.map(row => dot(row, x));
  return state.w.map((row, i) => dot(row, x) + (mode === 'lora' ? dot(state.b[i], low) : 0));
}
export function adaptationData(taskRank: 1 | 3, noise = 0) {
  if (![1, 3].includes(taskRank) || !Number.isFinite(noise) || noise < 0 || noise > .5) throw new RangeError('Ранг задачи 1 или 3; шум от 0 до 0,5.');
  const targetDelta = matrix(3, 8, (i, j) => Array.from({ length: taskRank }, (_, k) => .3 * Math.sin((i + 1) * (k + 1) + .3) * Math.cos((k + 1) * (j + 1) + .2)).reduce((sum, v) => sum + v, 0));
  const targetWeight = matrix(3, 8, (i, j) => BASE_WEIGHT[i][j] + targetDelta[i][j]);
  const train = Array.from({ length: 16 }, (_, n) => {
    const x = Array.from({ length: 8 }, (_, j) => j === n % 8 ? (n < 8 ? 2 : -2) : 0);
    return { x, y: targetWeight.map((row, i) => dot(row, x) + noise * Math.sin((n + 1) * (i + 1) * 1.7)) };
  });
  const heldout = Array.from({ length: 8 }, (_, n) => {
    const x = Array.from({ length: 8 }, (_, j) => Math.sin((n + 1) * (j + 1) + .4) / Math.sqrt(2));
    return { x, y: targetWeight.map(row => dot(row, x)) };
  });
  return { train, heldout, targetDelta };
}
export function adaptationLoss(state: AdaptationState, data: readonly AdaptationSample[], mode: 'full' | 'lora') {
  if (!data.length) throw new RangeError('Нужна непустая выборка.');
  return data.reduce((sum, sample) => sum + adaptationPredict(state, sample.x, mode).reduce((error, v, i) => error + (v - sample.y[i]) ** 2, 0), 0) / (data.length * 3);
}
export function adaptationGradients(state: AdaptationState, data: readonly AdaptationSample[], mode: 'full' | 'lora'): AdaptationState {
  if (!data.length) throw new RangeError('Нужна непустая выборка.');
  const grad = { w: matrix(3, 8, () => 0), a: matrix(state.a.length, 8, () => 0), b: matrix(3, state.a.length, () => 0) };
  for (const sample of data) {
    const low = state.a.map(row => dot(row, sample.x));
    const error = adaptationPredict(state, sample.x, mode).map((v, i) => 2 * (v - sample.y[i]) / (data.length * 3));
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 8; j++) if (mode === 'full') grad.w[i][j] += error[i] * sample.x[j];
      for (let k = 0; k < state.a.length; k++) if (mode === 'lora') {
        grad.b[i][k] += error[i] * low[k];
        for (let j = 0; j < 8; j++) grad.a[k][j] += error[i] * state.b[i][k] * sample.x[j];
      }
    }
  }
  return grad;
}
export function adaptationStep(state: AdaptationState, data: readonly AdaptationSample[], mode: 'full' | 'lora', eta: number): AdaptationState {
  if (!Number.isFinite(eta) || eta <= 0 || eta > 1) throw new RangeError('Шаг SGD должен быть в (0, 1].');
  const gradient = adaptationGradients(state, data, mode);
  const update = (values: Matrix, grad: Matrix) => values.map((row, i) => row.map((v, j) => v - eta * grad[i][j]));
  return { w: update(state.w, gradient.w), a: update(state.a, gradient.a), b: update(state.b, gradient.b) };
}
export function trainAdaptation(rank: number, taskRank: 1 | 3, noise: number, eta: number, epochs: number) {
  if (!Number.isInteger(epochs) || epochs < 0 || epochs > 1000) throw new RangeError('Число эпох должно быть от 0 до 1000.');
  if (!Number.isFinite(eta) || eta <= 0 || eta > 1) throw new RangeError('Шаг SGD должен быть в (0, 1].');
  const data = adaptationData(taskRank, noise);
  let full = adaptationInitial(rank), lora = adaptationInitial(rank);
  const history: { epoch: number; fullTrain: number; fullHeldout: number; loraTrain: number; loraHeldout: number }[] = [];
  for (let epoch = 0; epoch <= epochs; epoch++) {
    history.push({ epoch, fullTrain: adaptationLoss(full, data.train, 'full'), fullHeldout: adaptationLoss(full, data.heldout, 'full'),
      loraTrain: adaptationLoss(lora, data.train, 'lora'), loraHeldout: adaptationLoss(lora, data.heldout, 'lora') });
    if (epoch < epochs) { full = adaptationStep(full, data.train, 'full', eta); lora = adaptationStep(lora, data.train, 'lora', eta); }
  }
  return { full, lora, history, data };
}
