export type Activation = 'linear' | 'relu' | 'tanh' | 'sigmoid';
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const activate = (x: number, kind: Activation) => kind === 'relu' ? Math.max(0, x) : kind === 'tanh' ? Math.tanh(x) : kind === 'sigmoid' ? sigmoid(x) : x;
export type DenseLayer = { weights: number[][]; bias: number[] };
export function denseForward(input: number[], layers: DenseLayer[], activation: Activation) {
  let a = input;
  return layers.map(layer => {
    const before = a;
    const z = layer.weights.map((row, j) => dot(row, before) + layer.bias[j]);
    a = z.map(x => activate(x, activation));
    return { input: before, z, output: a, ...layer };
  });
}

export type ConvOptions = { stride: number; padding: number; dilation: number; bias?: number[] };
export function conv2d(input: number[][][], kernels: number[][][][], options: ConvOptions) {
  const { stride, padding, dilation } = options;
  const kh = kernels[0][0].length, kw = kernels[0][0][0].length;
  const height = Math.max(0, Math.floor((input[0].length + 2 * padding - dilation * (kh - 1) - 1) / stride + 1));
  const width = Math.max(0, Math.floor((input[0][0].length + 2 * padding - dilation * (kw - 1) - 1) / stride + 1));
  const output = kernels.map((kernel, o) => Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    let sum = options.bias?.[o] ?? 0;
    kernel.forEach((channel, c) => channel.forEach((row, ky) => row.forEach((weight, kx) => {
      sum += (input[c][y * stride - padding + ky * dilation]?.[x * stride - padding + kx * dilation] ?? 0) * weight;
    })));
    return sum;
  })));
  return { output, height, width };
}
export function pool2d(input: number[][], size = 2, mode: 'max' | 'average' = 'max') {
  return Array.from({ length: Math.floor(input.length / size) }, (_, y) => Array.from({ length: Math.floor((input[0]?.length ?? 0) / size) }, (_, x) => {
    const values = Array.from({ length: size }, (_, dy) => input[y * size + dy].slice(x * size, x * size + size)).flat();
    return mode === 'max' ? Math.max(...values) : values.reduce((a, b) => a + b, 0) / values.length;
  }));
}

export type RecurrentWeights = { wx: number; wh: number; b: number };
const affine = (x: number, h: number, w: RecurrentWeights) => w.wx * x + w.wh * h + w.b;
export function rnnForward(input: number[], weights: RecurrentWeights, initial = 0) {
  let h = initial;
  return input.map(x => {
    const previous = h, z = affine(x, h, weights);
    h = Math.tanh(z);
    return { x, previous, z, h };
  });
}
export type LstmWeights = { forget: RecurrentWeights; input: RecurrentWeights; output: RecurrentWeights; candidate: RecurrentWeights };
export function lstmForward(input: number[], weights: LstmWeights, initial = { h: 0, c: 0 }) {
  let { h, c } = initial;
  return input.map(x => {
    const previousH = h, previousC = c;
    const f = sigmoid(affine(x, h, weights.forget)), i = sigmoid(affine(x, h, weights.input));
    const o = sigmoid(affine(x, h, weights.output)), g = Math.tanh(affine(x, h, weights.candidate));
    const retained = f * c, written = i * g;
    c = retained + written;
    h = o * Math.tanh(c);
    return { x, previousH, previousC, f, i, o, g, retained, written, c, h };
  });
}
export type GruWeights = { reset: RecurrentWeights; update: RecurrentWeights; candidate: RecurrentWeights };
export function gruForward(input: number[], weights: GruWeights, initial = 0) {
  let h = initial;
  return input.map(x => {
    const previous = h;
    const r = sigmoid(affine(x, h, weights.reset)), z = sigmoid(affine(x, h, weights.update));
    // Reset-before formulation; candidate has one bias outside the reset term.
    const candidate = Math.tanh(weights.candidate.wx * x + weights.candidate.wh * (r * h) + weights.candidate.b);
    const retained = z * h, written = (1 - z) * candidate;
    h = retained + written;
    return { x, previous, r, z, candidate, retained, written, h };
  });
}

export function softmax(values: number[]) {
  const maximum = Math.max(...values);
  const exps = values.map(x => Math.exp(x - maximum));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / total);
}
export function scaledAttention(q: number[][], k: number[][], v: number[][], causal = false) {
  const scores = q.map((query, i) => k.map((key, j) => causal && j > i ? -Infinity : dot(query, key) / Math.sqrt(query.length)));
  const weights = scores.map(softmax);
  const output = weights.map(row => v[0].map((_, d) => row.reduce((sum, weight, j) => sum + weight * v[j][d], 0)));
  return { q, k, v, scores, weights, output };
}
export function layerNorm(row: number[], epsilon = 1e-5) {
  const mean = row.reduce((a, b) => a + b, 0) / row.length;
  const variance = row.reduce((sum, x) => sum + (x - mean) ** 2, 0) / row.length;
  return row.map(x => (x - mean) / Math.sqrt(variance + epsilon));
}

// ponytail: fixed d_model=4 and one block keep every intermediate inspectable;
// use a tensor library only if this teaching lab needs trainable large models.
export const transformerMatrices = {
  q: [[0.8, 0.1, 0, -0.2], [0.2, 0.7, 0.1, 0], [0, -0.1, 0.9, 0.2], [0.1, 0, 0.2, 0.8]],
  k: [[0.6, 0.2, 0.1, 0], [0, 0.9, -0.1, 0.2], [0.2, 0, 0.7, 0.1], [-0.1, 0.1, 0, 0.8]],
  v: [[0.9, 0, 0.2, 0.1], [0.1, 0.7, 0, -0.1], [0, 0.2, 0.8, 0.1], [0.2, 0, -0.1, 0.6]],
  o: [[0.8, 0.1, 0, 0.1], [0, 0.9, 0.1, 0], [0.1, 0, 0.8, 0.2], [0.1, 0.1, 0, 0.9]],
  f1: [[0.7, -0.2, 0.1, 0, 0.3, 0.2], [0, 0.6, 0.2, -0.1, 0.2, 0.1], [0.1, 0, 0.8, 0.3, -0.2, 0.1], [0.2, 0.1, 0, 0.7, 0.1, -0.3]],
  f2: [[0.7, 0, 0.1, 0.2], [0.1, 0.8, 0, 0.1], [0, 0.2, 0.6, 0.1], [0.2, 0, 0.1, 0.7], [-0.1, 0.2, 0.1, 0], [0.1, 0, -0.2, 0.3]],
};
function project(rows: number[][], matrix: number[][]) {
  return rows.map(row => matrix[0].map((_, j) => row.reduce((sum, x, i) => sum + x * matrix[i][j], 0)));
}
function multiHead(query: number[][], memory: number[][], heads: 1 | 2, causal: boolean) {
  const q = project(query, transformerMatrices.q), k = project(memory, transformerMatrices.k), v = project(memory, transformerMatrices.v);
  const width = 4 / heads;
  const attention = Array.from({ length: heads }, (_, head) => {
    const slice = (rows: number[][]) => rows.map(row => row.slice(head * width, (head + 1) * width));
    return scaledAttention(slice(q), slice(k), slice(v), causal);
  });
  const concatenated = query.map((_, i) => attention.flatMap(head => head.output[i]));
  return { heads: attention, concatenated, output: project(concatenated, transformerMatrices.o) };
}
const residual = (a: number[][], b: number[][]) => a.map((row, i) => row.map((x, j) => x + b[i][j]));
function feedForward(input: number[][]) {
  const hidden = project(input, transformerMatrices.f1).map(row => row.map(x => Math.max(0, x + 0.1)));
  const output = project(hidden, transformerMatrices.f2).map(row => row.map(x => x + 0.05));
  const sum = residual(input, output);
  return { hidden, output, residual: sum, normalized: sum.map(row => layerNorm(row)) };
}
export type TransformerMode = 'encoder' | 'decoder' | 'encoder-decoder';
export function transformerForward(options: { tokens: number[]; source: number[]; mode: TransformerMode; heads: 1 | 2; positionScale: number }) {
  const embed = (tokens: number[]) => {
    const embeddings = tokens.map(x => [x, x * x / 2, Math.sin(x), Math.cos(x)]);
    const positions = tokens.map((_, i) => [Math.sin(i), Math.cos(i), Math.sin(i / 100), Math.cos(i / 100)].map(x => x * options.positionScale));
    return { embeddings, positions, input: residual(embeddings, positions) };
  };
  const embedded = embed(options.tokens);
  const self = multiHead(embedded.input, embedded.input, options.heads, options.mode !== 'encoder');
  const selfResidual = residual(embedded.input, self.output), selfNorm = selfResidual.map(row => layerNorm(row));
  let source = null, cross = null;
  let blockInput = selfNorm;
  if (options.mode === 'encoder-decoder') {
    const sourceEmbedding = embed(options.source);
    const sourceSelf = multiHead(sourceEmbedding.input, sourceEmbedding.input, options.heads, false);
    const sourceNorm = residual(sourceEmbedding.input, sourceSelf.output).map(row => layerNorm(row));
    const sourceFfn = feedForward(sourceNorm);
    source = { ...sourceEmbedding, self: sourceSelf, output: sourceFfn.normalized };
    const attention = multiHead(selfNorm, source.output, options.heads, false);
    const sum = residual(selfNorm, attention.output);
    cross = { ...attention, residual: sum, normalized: sum.map(row => layerNorm(row)) };
    blockInput = cross.normalized;
  }
  const ffn = feedForward(blockInput);
  return { ...embedded, self, selfResidual, selfNorm, source, cross, ffn, output: ffn.normalized };
}

export const architectureFamilies = [
  { id: 'dense', name: 'Dense / MLP', supported: '1–3 слоя, 1–5 нейронов; linear, ReLU, tanh, sigmoid', schema: 'Residual MLP и dropout: только пояснения' },
  { id: 'cnn', name: 'CNN', supported: 'Conv2D; stride, padding, dilation; 1–2 входных канала; max/average pooling', schema: 'Conv1D / Conv3D: сравнение форм, без численного расчёта' },
  { id: 'rnn', name: 'RNN', supported: 'Обычная, двухслойная и двунаправленная скалярная RNN', schema: 'Векторное состояние: формула расширения' },
  { id: 'lstm', name: 'LSTM', supported: 'Скалярные c и h, четыре преобразования, регулируемые bias ворот', schema: 'Stacked / bidirectional / peephole: пояснения' },
  { id: 'gru', name: 'GRU', supported: 'Скалярный reset-before GRU, reset и update', schema: 'Reset-after, stacked и bidirectional: пояснения' },
  { id: 'transformer', name: 'Transformer', supported: 'Encoder, decoder, encoder–decoder; 1/2 головы; self/cross; позиции; FFN', schema: 'Один блок, d_model=4; без обучения, словаря и генерации' },
] as const;
