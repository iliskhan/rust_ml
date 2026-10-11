/** Small, inspectable Transformer operations; rows are token positions. */
export type Matrix = number[][];

function vector(values: number[], label: string) {
  if (!values.length || !values.every(Number.isFinite)) throw new RangeError(`${label}: нужен непустой вектор конечных чисел`);
}
function matrix(rows: Matrix, label: string) {
  if (!rows.length || !rows[0].length || rows.some(row => row.length !== rows[0].length)) throw new RangeError(`${label}: нужна прямоугольная непустая матрица`);
  rows.forEach(row => vector(row, label));
}
export const dotProduct = (a: number[], b: number[]) => {
  vector(a, 'Скалярное произведение');
  vector(b, 'Скалярное произведение');
  if (a.length !== b.length) throw new RangeError('Скалярное произведение: размерности должны совпадать');
  return a.reduce((sum, value, i) => sum + value * b[i], 0);
};

/** X[n,in] times W[in,out]. No implicit bias. */
export function projectTokens(input: Matrix, weights: Matrix): Matrix {
  matrix(input, 'X'); matrix(weights, 'W');
  if (input[0].length !== weights.length) throw new RangeError('XW: несовместимые размерности');
  return input.map(row => weights[0].map((_, j) => row.reduce((sum, value, i) => sum + value * weights[i][j], 0)));
}

/** Stable softmax; -Infinity denotes a forbidden key, not a very small weight. */
export function temperatureSoftmax(scores: number[], temperature = 1) {
  if (!scores.length || scores.some(x => !Number.isFinite(x) && x !== -Infinity) || !Number.isFinite(temperature) || temperature <= 0) throw new RangeError('Softmax: нужны допустимые scores и T > 0');
  const maximum = Math.max(...scores);
  if (maximum === -Infinity) throw new RangeError('Softmax: хотя бы один ключ должен быть доступен');
  const exponentials = scores.map(score => Math.exp((score - maximum) / temperature));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map(value => value / total);
}

export function attentionTrace(q: Matrix, k: Matrix, v: Matrix, options: { causal?: boolean; queryOffset?: number; temperature?: number; scale?: boolean; allowedKeys?: boolean[] } = {}) {
  matrix(q, 'Q'); matrix(k, 'K'); matrix(v, 'V');
  if (q[0].length !== k[0].length || k.length !== v.length) throw new RangeError('Attention: несовместимые размерности Q, K, V');
  const { causal = false, queryOffset = 0, temperature = 1, scale = true, allowedKeys } = options;
  if (!Number.isInteger(queryOffset) || queryOffset < 0 || (allowedKeys && allowedKeys.length !== k.length)) throw new RangeError('Attention: недопустимая маска или смещение запроса');
  const rawScores = q.map(query => k.map(key => dotProduct(query, key)));
  const divisor = scale ? Math.sqrt(q[0].length) : 1;
  const scaledScores = rawScores.map(row => row.map(value => value / divisor));
  const scores = scaledScores.map((row, i) => row.map((value, j) => (causal && j > i + queryOffset) || allowedKeys?.[j] === false ? -Infinity : value));
  const weights = scores.map(row => temperatureSoftmax(row, temperature));
  const output = weights.map(row => v[0].map((_, d) => row.reduce((sum, weight, j) => sum + weight * v[j][d], 0)));
  return { q, k, v, rawScores, scaledScores, scores, weights, output, divisor };
}

export const SMALL_PROJECTIONS = {
  q: [[1, 0], [0, 1]],
  k: [[1, 0.5], [0, 1]],
  v: [[1, 0], [0.5, 1]],
};
export const SMALL_INPUT = [[1, 0], [0, 1], [1, 1]];

/** Adjacent-coordinate RoPE convention, with frequencies base^(-2i/d). */
export function rope(value: number[], position: number, base = 10000) {
  vector(value, 'RoPE');
  if (value.length % 2 || !Number.isFinite(position) || !Number.isFinite(base) || base <= 0) throw new RangeError('RoPE: нужны чётная размерность, конечная позиция и base > 0');
  return value.map((_, coordinate) => {
    const start = coordinate - coordinate % 2;
    const angle = position / base ** (start / value.length);
    return coordinate % 2 === 0
      ? value[start] * Math.cos(angle) - value[start + 1] * Math.sin(angle)
      : value[start] * Math.sin(angle) + value[start + 1] * Math.cos(angle);
  });
}
export function sinusoidalPosition(position: number, width = 4) {
  if (!Number.isFinite(position) || !Number.isInteger(width) || width < 2 || width % 2) throw new RangeError('Позиции: нужны конечная позиция и чётная размерность');
  return Array.from({ length: width }, (_, coordinate) => {
    const angle = position / 10000 ** ((coordinate - coordinate % 2) / width);
    return coordinate % 2 ? Math.cos(angle) : Math.sin(angle);
  });
}

export type NormKind = 'layer' | 'rms';
export function normalizationTrace(value: number[], kind: NormKind, epsilon = 1e-5) {
  vector(value, 'Нормализация');
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw new RangeError('Нормализация: epsilon > 0');
  const mean = value.reduce((sum, x) => sum + x, 0) / value.length;
  const centered = value.map(x => kind === 'layer' ? x - mean : x);
  const meanSquare = centered.reduce((sum, x) => sum + x * x, 0) / value.length;
  const denominator = Math.sqrt(meanSquare + epsilon);
  return { mean, meanSquare, denominator, output: centered.map(x => x / denominator) };
}
export const FFN_WEIGHTS = {
  first: [[1, 0, 0.5, -0.5, 0, 1], [0, 1, -0.5, 0.5, 1, 0], [0.5, 0, 1, 0, -1, 0], [0, 0.5, 0, 1, 0, -1]],
  second: [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5], [0.2, -0.2, 0.1, 0], [0, 0.1, -0.2, 0.2]],
};
export function ffnTrace(value: number[]) {
  if (value.length !== 4) throw new RangeError('Учебный FFN: четыре входных признака');
  const beforeActivation = projectTokens([value], FFN_WEIGHTS.first)[0].map(x => x + 0.1);
  const hidden = beforeActivation.map(x => Math.max(0, x));
  const output = projectTokens([hidden], FFN_WEIGHTS.second)[0];
  return { beforeActivation, hidden, output };
}
export function residualFfn(value: number[], kind: NormKind, placement: 'pre' | 'post', residual = true) {
  const norm = normalizationTrace(value, kind);
  const branchInput = placement === 'pre' ? norm.output : value;
  const ffn = ffnTrace(branchInput);
  const sum = ffn.output.map((x, i) => x + (residual ? value[i] : 0));
  const output = placement === 'post' ? normalizationTrace(sum, kind).output : sum;
  return { norm, branchInput, ffn, sum, output };
}

export function kvGroupForHead(head: number, queryHeads: number, kvHeads: number) {
  if (![head, queryHeads, kvHeads].every(Number.isInteger) || queryHeads < 1 || kvHeads < 1 || queryHeads % kvHeads || head < 0 || head >= queryHeads) throw new RangeError('GQA: число Q-голов должно делиться на число KV-голов');
  return Math.floor(head / (queryHeads / kvHeads));
}
export const HEAD_INPUT = [[1, 0, 0.5, -0.5], [0, 1, -0.5, 0.5], [1, 1, 0, 0.5]];
export const QUERY_PROJECTIONS: Matrix[] = [
  [[1, 0], [0, 1], [0.5, 0], [0, 0]],
  [[0, 1], [1, 0], [0, 0], [0.5, 0]],
  [[1, 0], [0, -1], [0, 0.5], [0.5, 0]],
  [[0, 0.5], [0.5, 0], [1, 0], [0, 1]],
];
export const KEY_PROJECTIONS: Matrix[] = [
  [[1, 0], [0, 1], [0, 0], [0, 0]],
  [[0, 1], [1, 0], [0.5, 0], [0, 0]],
  [[1, 0], [0, -1], [0, 0.5], [0, 0]],
  [[0, 0.5], [0.5, 0], [1, 0], [0, 1]],
];
export const VALUE_PROJECTIONS: Matrix[] = [
  [[1, 0], [0, 1], [0.5, 0], [0, 0.5]],
  [[0, 1], [1, 0], [0, 0.5], [0.5, 0]],
  [[0.5, 0], [0, 0.5], [1, 0], [0, 1]],
  [[1, 0], [0, -1], [0, 0.5], [0.5, 0]],
];
export const OUTPUT_PROJECTION = [[0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5], [0.5, 0, 0, 0], [0, 0.5, 0, 0], [0, 0, 0.5, 0], [0, 0, 0, 0.5]];

export function groupedAttention(input: Matrix, kvHeads: 1 | 2 | 4, causal = true) {
  const keys = KEY_PROJECTIONS.slice(0, kvHeads).map(weights => projectTokens(input, weights));
  const values = VALUE_PROJECTIONS.slice(0, kvHeads).map(weights => projectTokens(input, weights));
  const heads = QUERY_PROJECTIONS.map((weights, h) => {
    const group = kvGroupForHead(h, 4, kvHeads);
    return { group, ...attentionTrace(projectTokens(input, weights), keys[group], values[group], { causal }) };
  });
  const concatenated = input.map((_, i) => heads.flatMap(head => head.output[i]));
  return { keys, values, heads, concatenated, output: projectTokens(concatenated, OUTPUT_PROJECTION) };
}

export function kvCacheBytes(tokens: number, layers: number, kvHeads: number, headWidth: number, bytesPerValue = 2, batch = 1) {
  if (![tokens, layers, kvHeads, headWidth, bytesPerValue, batch].every(n => Number.isInteger(n) && n > 0)) throw new RangeError('KV-cache: размеры должны быть положительными целыми числами');
  return 2 * batch * layers * tokens * kvHeads * headWidth * bytesPerValue;
}

export type KvCache = { keys: Matrix; values: Matrix };
/** Single causal attention head, with absolute RoPE positions; no layers are elided. */
export function cachedAttentionStep(input: number[], previous: KvCache = { keys: [], values: [] }, rotary = true) {
  if (previous.keys.length !== previous.values.length) throw new RangeError('KV-cache: разные длины K и V');
  const position = previous.keys.length;
  const queryRaw = projectTokens([input], SMALL_PROJECTIONS.q)[0];
  const keyRaw = projectTokens([input], SMALL_PROJECTIONS.k)[0];
  const query = rotary ? rope(queryRaw, position) : queryRaw;
  const key = rotary ? rope(keyRaw, position) : keyRaw;
  const value = projectTokens([input], SMALL_PROJECTIONS.v)[0];
  const cache = { keys: [...previous.keys, key], values: [...previous.values, value] };
  const attention = attentionTrace([query], cache.keys, cache.values, { causal: true, queryOffset: position });
  return { cache, attention, output: attention.output[0] };
}
export function fullCausalAttention(input: Matrix, rotary = true) {
  const q = projectTokens(input, SMALL_PROJECTIONS.q).map((row, i) => rotary ? rope(row, i) : row);
  const k = projectTokens(input, SMALL_PROJECTIONS.k).map((row, i) => rotary ? rope(row, i) : row);
  const v = projectTokens(input, SMALL_PROJECTIONS.v);
  return attentionTrace(q, k, v, { causal: true });
}

export const TOY_VOCAB = ['<нач>', 'кот', 'спит', 'ест', '.', '<кон>'];
export const TOY_EMBEDDINGS = [[0.5, 0.5], [1, 0], [0, 1], [-0.5, 1], [-1, 0], [0, -1]];
export const TOY_OUTPUT_WEIGHTS = [[-0.5, 0.4, 0.8, -0.2, -0.7, 0.2], [-0.5, 0.7, -0.3, 0.8, 0.3, -0.5]];

/** An untrained, one-head attention + residual + output projection illustration. */
export function toyLanguageForward(ids: number[]) {
  if (!ids.length || ids.some(id => !Number.isInteger(id) || id < 0 || id >= TOY_VOCAB.length)) throw new RangeError('Словарь: недопустимый ID');
  const input = ids.map(id => TOY_EMBEDDINGS[id]);
  const attention = fullCausalAttention(input);
  const hidden = attention.output.map((row, i) => row.map((value, d) => value + input[i][d]));
  const logits = projectTokens(hidden, TOY_OUTPUT_WEIGHTS);
  return { input, attention, hidden, logits, probabilities: logits.map(row => temperatureSoftmax(row)) };
}

export function samplingDistribution(logits: number[], temperature = 1, topK = logits.length, topP = 1) {
  vector(logits, 'Logits');
  if (!Number.isInteger(topK) || topK < 1 || topK > logits.length || !Number.isFinite(topP) || topP <= 0 || topP > 1) throw new RangeError('Sampling: 1 ≤ top-k ≤ словарь, 0 < top-p ≤ 1');
  const probabilities = temperatureSoftmax(logits, temperature);
  const ranked = probabilities.map((p, id) => ({ id, p })).sort((a, b) => b.p - a.p || a.id - b.id);
  const candidates = ranked.slice(0, topK);
  const candidateMass = candidates.reduce((sum, token) => sum + token.p, 0);
  let cumulative = 0;
  const kept: number[] = [];
  for (const token of candidates) {
    if (kept.length && cumulative >= topP) break;
    kept.push(token.id);
    cumulative += token.p / candidateMass;
  }
  const keptMass = kept.reduce((sum, id) => sum + probabilities[id], 0);
  const filtered = probabilities.map((p, id) => kept.includes(id) ? p / keptMass : 0);
  return { probabilities, filtered, kept };
}
export function sampleToken(probabilities: number[], uniform: number) {
  vector(probabilities, 'Вероятности');
  if (probabilities.some(p => p < 0) || Math.abs(probabilities.reduce((sum, p) => sum + p, 0) - 1) > 1e-8 || !Number.isFinite(uniform) || uniform < 0 || uniform >= 1) throw new RangeError('Sampling: распределение с суммой 1 и случайное u ∈ [0,1)');
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (uniform < cumulative) return i;
  }
  for (let i = probabilities.length - 1; i >= 0; i--) if (probabilities[i] > 0) return i;
  throw new RangeError('Sampling: пустая поддержка распределения');
}
