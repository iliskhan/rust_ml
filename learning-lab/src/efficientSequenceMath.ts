type Matrix = number[][];
export const sequenceDot = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const project = (x: number[], w: Matrix) => w[0].map((_, j) => x.reduce((s, value, i) => s + value * w[i][j], 0));
const weighted = (a: number[], values: Matrix) => values[0].map((_, j) => a.reduce((s, weight, i) => s + weight * values[i][j], 0));
const softmax = (xs: number[]) => {
  const m = Math.max(...xs);
  if (m === -Infinity) return xs.map(() => 0);
  const exps = xs.map(x => Math.exp(x - m)), sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(x => x / sum);
};
function validateAttention(q: Matrix, k: Matrix, v: Matrix) {
  const d = q[0]?.length, dv = v[0]?.length;
  if (!d || !dv || !k.length || k.length !== v.length || [...q, ...k].some(r => r.length !== d || r.some(x => !Number.isFinite(x))) || v.some(r => r.length !== dv || r.some(x => !Number.isFinite(x)))) throw new RangeError('Несовместимые или нечисловые Q/K/V');
}

export function fullAttentionReference(q: Matrix, k: Matrix, v: Matrix, causal = true) {
  validateAttention(q, k, v);
  const weights = q.map((row, i) => softmax(k.map((key, j) => causal && j > i ? -Infinity : sequenceDot(row, key) / Math.sqrt(row.length))));
  return { weights, output: weights.map(row => weighted(row, v)) };
}
export type OnlineTile = { start: number; end: number; scores: number[]; max: number; rescale: number; normalizer: number; accumulator: number[]; output: number[] };
/** One query row at a time. Only the requested row's teaching snapshots are retained. */
export function tiledAttention(q: Matrix, k: Matrix, v: Matrix, tileSize: number, causal = true, traceRow = q.length - 1) {
  validateAttention(q, k, v);
  if (!Number.isInteger(tileSize) || tileSize < 1) throw new RangeError('Размер плитки должен быть положительным целым');
  const trace: OnlineTile[] = [];
  const output = q.map((query, row) => {
    let m = -Infinity, l = 0;
    let acc = v[0].map(() => 0);
    const end = causal ? Math.min(row + 1, k.length) : k.length;
    for (let start = 0; start < end; start += tileSize) {
      const stop = Math.min(start + tileSize, end);
      const scores = k.slice(start, stop).map(key => sequenceDot(query, key) / Math.sqrt(query.length));
      const nextMax = Math.max(m, ...scores), rescale = Math.exp(m - nextMax);
      l *= rescale;
      acc = acc.map(x => x * rescale);
      scores.forEach((score, j) => {
        const p = Math.exp(score - nextMax);
        l += p;
        acc = acc.map((x, dim) => x + p * v[start + j][dim]);
      });
      m = nextMax;
      if (row === traceRow) trace.push({ start, end: stop, scores, max: m, rescale, normalizer: l, accumulator: [...acc], output: acc.map(x => x / l) });
    }
    return acc.map(x => l ? x / l : 0);
  });
  // Ideal live scalars of the row kernel; excludes Q/K/V/output and UI trace copies.
  return { output, trace, storage: { fullScores: q.length * k.length, online: Math.min(tileSize, k.length) + v[0].length + 2 } };
}
export function attentionFixture(n: number, sharpness = 1) {
  const q = Array.from({ length: n }, (_, t) => [Math.sin(t + .2) * sharpness, Math.cos(t * .7) * sharpness, .5 * sharpness]);
  const k = Array.from({ length: n }, (_, t) => [Math.cos(t * .4), Math.sin(t + .6), (t % 3 - 1) * .7]);
  const v = Array.from({ length: n }, (_, t) => [Math.sin(t * .8), Math.cos(t * .5), (t % 4) / 3]);
  return { q, k, v };
}

const DOWN = [[.8, -.3], [.2, .7], [-.4, .5]];
const UP_K = [[[.7, -.2], [.1, .9]], [[-.4, .6], [.8, .2]]];
const UP_V = [[[.5, .8], [-.7, .2]], [[.9, -.3], [.4, .6]]];
const QUERY = [[[.5, .3], [-.2, .7], [.4, -.1]], [[-.3, .8], [.6, .1], [.2, -.5]]];
const rotate = ([x, y]: number[], position: number) => [x * Math.cos(position) - y * Math.sin(position), x * Math.sin(position) + y * Math.cos(position)];
/** A defined two-head MLA KV core, with a shared 2D latent and decoupled 2D RoPE key. */
export function mlaTrace(n: number, queryPosition: number, latentScale = 1) {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(queryPosition) || queryPosition < 0 || queryPosition >= n || !Number.isFinite(latentScale)) throw new RangeError('Неверные параметры MLA');
  const x = Array.from({ length: n }, (_, t) => [Math.sin(t + .5), Math.cos(t * .6), .4 + t * .1]);
  const latent = x.map(row => project(row, DOWN).map(z => z * latentScale));
  const ropeKeys = x.map((row, t) => rotate([row[0] * .4, row[1] * .6], t));
  const heads = UP_K.map((upK, h) => {
    const keys = latent.map(c => project(c, upK)), values = latent.map(c => project(c, UP_V[h]));
    const query = project(x[queryPosition], QUERY[h]), queryRope = rotate([query[1], query[0]], queryPosition);
    const absorbedQuery = upK.map(row => sequenceDot(query, row));
    const score = (content: number, t: number) => t > queryPosition ? -Infinity : (content + sequenceDot(queryRope, ropeKeys[t])) / 2;
    const weights = softmax(keys.map((key, t) => score(sequenceDot(query, key), t)));
    const absorbedWeights = softmax(latent.map((c, t) => score(sequenceDot(absorbedQuery, c), t)));
    return { keys, values, query, queryRope, weights, output: weighted(weights, values), absorbedOutput: project(weighted(absorbedWeights, latent), UP_V[h]) };
  });
  const cachedTokens = queryPosition + 1;
  return { x, latent, ropeKeys, heads, cache: { cachedTokens, latentScalars: cachedTokens * 4, expandedScalars: cachedTokens * 12 } };
}

export type MemoryToken = { input: number; key: number[]; value: number[] };
export function memoryTokens(pattern: 'impulse' | 'rewrite' | 'alternating'): MemoryToken[] {
  return Array.from({ length: 8 }, (_, t) => {
    const input = pattern === 'impulse' ? (t === 0 ? 1 : 0) : pattern === 'alternating' ? (t % 2 ? -1 : 1) : (t < 4 ? 1 : -1);
    const key = [0, 0, 0]; key[pattern === 'rewrite' ? (t === 0 || t >= 4 ? 0 : 1) : t % 3] = 1;
    return { input, key, value: [input, .5 * input, -.25 * input] };
  });
}
/** Diagonal continuous SSM with exact zero-order-hold discretization. */
export function selectiveSsm(tokens: MemoryToken[], stepSize: number, selectivity: number) {
  if (!(stepSize > 0) || !Number.isFinite(stepSize) || !Number.isFinite(selectivity)) throw new RangeError('Неверные параметры SSM');
  let state = [0, 0, 0];
  return tokens.map(({ input }) => {
    const delta = stepSize * Math.exp(selectivity * input);
    const a = [-.3, -.8, -1.4], b = [1, .5, -.4].map(z => z * (1 + .25 * selectivity * input));
    const c = [1, -.5, .7].map(z => z * (1 + .2 * selectivity * input));
    const decay = a.map(z => Math.exp(delta * z));
    const write = a.map((z, i) => Math.expm1(delta * z) / z * b[i] * input);
    const previous = [...state];
    state = state.map((z, i) => decay[i] * z + write[i]);
    return { input, delta, decay, write, previous, state: [...state], output: sequenceDot(state, c) };
  });
}
/** S has value rows/key columns. Delta updates the residual AFTER global decay. */
export function memoryStep(previous: Matrix, key: number[], value: number[], alpha: number, beta: number, delta: boolean) {
  if (alpha < 0 || alpha > 1 || beta < 0 || beta > 1 || !Number.isFinite(alpha + beta)) throw new RangeError('Ворота должны быть в [0,1]');
  if (previous.length !== value.length || previous.some(row => row.length !== key.length) || Math.abs(sequenceDot(key, key) - 1) > 1e-9) throw new RangeError('Нужен единичный ключ и согласованная форма памяти');
  const decayed = previous.map(row => row.map(x => alpha * x));
  const oldValue = decayed.map(row => sequenceDot(row, key));
  const error = value.map((x, i) => x - (delta ? oldValue[i] : 0));
  const state = decayed.map((row, i) => row.map((x, j) => x + (delta ? beta : 1) * error[i] * key[j]));
  return { decayed, oldValue, error, state, output: state.map(row => sequenceDot(row, key)) };
}
export function memoryComparison(tokens: MemoryToken[], retention: number, beta: number, selectivity: number) {
  let ssd = Array.from({ length: 3 }, () => [0, 0, 0]), delta = ssd.map(row => [...row]);
  const attention = fullAttentionReference(tokens.map(t => t.key), tokens.map(t => t.key), tokens.map(t => t.value));
  return tokens.map((token, t) => {
    const alpha = retention === 0 ? 0 : Math.pow(retention, Math.exp(selectivity * Math.abs(token.input)));
    const ssdStep = memoryStep(ssd, token.key, token.value, alpha, beta, false);
    const deltaStep = memoryStep(delta, token.key, token.value, alpha, beta, true);
    ssd = ssdStep.state; delta = deltaStep.state;
    // A pedagogical residual mixer, not a reproduction of a published hybrid stack.
    const hybrid = deltaStep.output.map((x, j) => .5 * x + .5 * attention.output[t][j]);
    return { alpha, ssd: ssdStep, delta: deltaStep, attention: attention.output[t], hybrid };
  });
}
