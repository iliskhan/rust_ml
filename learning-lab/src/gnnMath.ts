export type GraphMatrix = number[][];
export type GCNWeights = { first: GraphMatrix; second: GraphMatrix };
export const GRAPH_FEATURES = [[1, .1], [.8, .2], [.9, -.1], [-1, -.1], [-.8, -.2], [-.9, .1]];
export const GRAPH_LABELS = [0, 0, 0, 1, 1, 1];
export const GRAPH_TRAIN = [0, 2, 3, 5];
export const GRAPH_TEST = [1, 4];
export const GRAPH_ADJACENCY = [
  [0, 1, 1, 0, 0, 0], [1, 0, 1, 0, 0, 0], [1, 1, 0, 1, 0, 0],
  [0, 0, 1, 0, 1, 1], [0, 0, 0, 1, 0, 1], [0, 0, 0, 1, 1, 0],
];
export function initialGCN(): GCNWeights {
  return { first: [[.25, -.4, .3], [.15, .2, -.35]], second: [[.2, -.15], [-.25, .3], [.1, -.2]] };
}
function matrixShape(a: GraphMatrix) {
  if (!a.length || !a[0].length || a.some(row => row.length !== a[0].length || row.some(x => !Number.isFinite(x)))) throw new RangeError('Нужна непустая прямоугольная матрица конечных чисел');
  return [a.length, a[0].length];
}
export function graphMultiply(a: GraphMatrix, b: GraphMatrix): GraphMatrix {
  const [rows, inner] = matrixShape(a), [other, cols] = matrixShape(b);
  if (inner !== other) throw new RangeError('Размеры матриц не совпадают');
  return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => a[i].reduce((s, x, k) => s + x * b[k][j], 0)));
}
function transpose(a: GraphMatrix) { return a[0].map((_, i) => a.map(row => row[i])); }
export function normalizedGraph(adjacency: GraphMatrix, selfLoops = true) {
  const [n, m] = matrixShape(adjacency);
  if (n !== m || adjacency.some((row, i) => row.some((x, j) => x < 0 || x !== adjacency[j][i]))) throw new RangeError('Нужна неотрицательная симметричная матрица смежности');
  const withLoops = adjacency.map((row, i) => row.map((x, j) => x + (selfLoops && i === j ? 1 : 0)));
  const degrees = withLoops.map(row => row.reduce((a, b) => a + b, 0));
  const normalized = withLoops.map((row, i) => row.map((x, j) => degrees[i] * degrees[j] > 0 ? x / Math.sqrt(degrees[i] * degrees[j]) : 0));
  return { withLoops, degrees, normalized };
}
export function gcnForward(adjacency: GraphMatrix, features: GraphMatrix, weights: GCNWeights) {
  const { normalized, degrees } = normalizedGraph(adjacency);
  const aggregate = graphMultiply(normalized, features);
  const preHidden = graphMultiply(aggregate, weights.first);
  const hidden = preHidden.map(row => row.map(Math.tanh));
  const hiddenAggregate = graphMultiply(normalized, hidden);
  const logits = graphMultiply(hiddenAggregate, weights.second);
  const logProbabilities = logits.map(row => {
    const maximum = Math.max(...row), logTotal = Math.log(row.reduce((sum, x) => sum + Math.exp(x - maximum), 0));
    return row.map(x => x - maximum - logTotal);
  });
  return { normalized, degrees, aggregate, preHidden, hidden, hiddenAggregate, logits, logProbabilities, probabilities: logProbabilities.map(row => row.map(Math.exp)) };
}
export function gcnLossAndGradient(adjacency: GraphMatrix, features: GraphMatrix, labels: number[], train: number[], weights: GCNWeights) {
  const trace = gcnForward(adjacency, features, weights);
  if (!train.length || new Set(train).size !== train.length || labels.length !== features.length || train.some(i => !Number.isInteger(i) || i < 0 || i >= labels.length || !Number.isInteger(labels[i]) || labels[i] < 0 || labels[i] >= trace.logits[0].length)) throw new RangeError('Нужны корректные обучающие узлы и метки');
  const loss = -train.reduce((sum, i) => sum + trace.logProbabilities[i][labels[i]], 0) / train.length;
  const dLogits = trace.probabilities.map((row, i) => row.map((p, c) => train.includes(i) ? (p - Number(c === labels[i])) / train.length : 0));
  const second = graphMultiply(transpose(trace.hiddenAggregate), dLogits);
  const dHidden = graphMultiply(transpose(trace.normalized), graphMultiply(dLogits, transpose(weights.second)));
  const dPreHidden = dHidden.map((row, i) => row.map((d, j) => d * (1 - trace.hidden[i][j] ** 2)));
  const first = graphMultiply(transpose(trace.aggregate), dPreHidden);
  return { ...trace, loss, gradient: { first, second } };
}
export function gcnTrainStep(adjacency: GraphMatrix, features: GraphMatrix, labels: number[], train: number[], weights: GCNWeights, rate: number) {
  if (!Number.isFinite(rate) || rate < 0 || rate > 2) throw new RangeError('Шаг обучения должен быть от 0 до 2');
  const before = gcnLossAndGradient(adjacency, features, labels, train, weights);
  const updated = {
    first: weights.first.map((row, i) => row.map((x, j) => x - rate * before.gradient.first[i][j])),
    second: weights.second.map((row, i) => row.map((x, j) => x - rate * before.gradient.second[i][j])),
  };
  return { weights: updated, before, after: gcnLossAndGradient(adjacency, features, labels, train, updated) };
}
export function permutationError(adjacency: GraphMatrix, features: GraphMatrix, weights: GCNWeights, order: number[]) {
  if (order.length !== adjacency.length || new Set(order).size !== order.length || order.some(i => !Number.isInteger(i) || i < 0 || i >= order.length)) throw new RangeError('Нужна перестановка всех узлов');
  const original = gcnForward(adjacency, features, weights).probabilities;
  const permuted = gcnForward(order.map(i => order.map(j => adjacency[i][j])), order.map(i => features[i]), weights).probabilities;
  return { original, permuted, error: Math.max(...permuted.flatMap((row, i) => row.map((x, j) => Math.abs(x - original[order[i]][j])))) };
}
export function smoothGraph(adjacency: GraphMatrix, features: GraphMatrix, steps: number) {
  if (!Number.isInteger(steps) || steps < 0 || steps > 100) throw new RangeError('Число шагов от 0 до 100');
  const { normalized, degrees } = normalizedGraph(adjacency);
  let state = features.map(row => [...row]);
  const history = [state];
  for (let step = 0; step < steps; step++) { state = graphMultiply(normalized, state); history.push(state); }
  // S converges to the degree-scaled subspace, not to identical raw rows.
  const dispersions = history.map(rows => {
    const corrected = rows.map((row, i) => row.map(x => x / Math.sqrt(degrees[i])));
    const mean = corrected[0].map((_, c) => corrected.reduce((s, row) => s + row[c], 0) / corrected.length);
    return corrected.reduce((s, row) => s + row.reduce((t, x, c) => t + (x - mean[c]) ** 2, 0), 0) / corrected.length;
  });
  return { history, dispersions };
}
export function reachableNodes(adjacency: GraphMatrix, node: number, hops: number) {
  if (!Number.isInteger(node) || node < 0 || node >= adjacency.length || !Number.isInteger(hops) || hops < 0 || hops > 100) throw new RangeError('Некорректные узел или глубина');
  let reached = new Set([node]);
  for (let k = 0; k < hops; k++) { const next = new Set(reached); reached.forEach(i => adjacency[i].forEach((x, j) => { if (x > 0) next.add(j); })); reached = next; }
  return [...reached].sort((a, b) => a - b);
}
export function graphAttention(adjacency: GraphMatrix, features: GraphMatrix, node: number, sourceWeight: number, neighborWeight: number) {
  normalizedGraph(adjacency);
  if (!Number.isInteger(node) || node < 0 || node >= features.length || features.length !== adjacency.length || features.some(row => row.length !== 2 || row.some(x => !Number.isFinite(x))) || !Number.isFinite(sourceWeight) || !Number.isFinite(neighborWeight)) throw new RangeError('Некорректный вход attention');
  const projected = features.map(row => row[0] + .5 * row[1]);
  const neighbors = adjacency[node].flatMap((x, j) => x > 0 || j === node ? [j] : []);
  const scores = neighbors.map(j => { const e = sourceWeight * projected[node] + neighborWeight * projected[j]; return e >= 0 ? e : .2 * e; });
  const maximum = Math.max(...scores), exps = scores.map(x => Math.exp(x - maximum)), total = exps.reduce((a, b) => a + b, 0);
  const attention = exps.map(x => x / total);
  const output = attention.reduce((sum, a, i) => sum + a * projected[neighbors[i]], 0);
  const mean = neighbors.reduce((sum, j) => sum + projected[j], 0) / neighbors.length;
  const others = neighbors.filter(j => j !== node);
  const neighborMean = features[node].map((_, c) => others.length ? others.reduce((s, j) => s + features[j][c], 0) / others.length : 0);
  const concatenated = [...features[node], ...neighborMean];
  const sageProjection = [[1, 0], [0, 1], [.5, -.2], [.2, .5]];
  const sage = graphMultiply([concatenated], sageProjection)[0].map(Math.tanh);
  return { projected, neighbors, scores, attention, output, mean, neighborMean, concatenated, sage, sageProjection };
}
