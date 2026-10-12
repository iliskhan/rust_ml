import { boundaryBatchIndices, boundaryL2, boundaryLossGradient, boundaryMetrics, predictBoundary, type BoundaryConfig, type BoundaryDataset, type BoundarySample } from './boundaryNetworkMath.ts';

export type Outcome = 'TP' | 'FP' | 'TN' | 'FN';

export function boundaryConfusion(params: number[], config: BoundaryConfig, data: BoundarySample[], threshold: number) {
  const metrics = boundaryMetrics(params, config, data, threshold);
  const counts: Record<Outcome, number> = { TP: 0, FP: 0, TN: 0, FN: 0 };
  const points = data.map(sample => {
    const probability = predictBoundary(params, config, sample.input);
    const predicted = Number(probability >= threshold);
    const outcome: Outcome = predicted ? (sample.target ? 'TP' : 'FP') : (sample.target ? 'FN' : 'TN');
    counts[outcome]++;
    return { ...sample, probability, predicted, outcome };
  });
  return { ...metrics, counts, points, precision: counts.TP + counts.FP ? counts.TP / (counts.TP + counts.FP) : null,
    recall: counts.TP + counts.FN ? counts.TP / (counts.TP + counts.FN) : null };
}

/** Flat indices use exactly the row-major W followed by b layout of boundaryNetworkMath. */
export function boundaryWeightChoices(config: BoundaryConfig) {
  let inputs = 2, offset = 0;
  return [...config.layers, { width: 1 }].flatMap((layer, l) => {
    const choices = Array.from({ length: inputs * layer.width }, (_, i) => ({ index: offset + i, label: `W${l + 1}[${Math.floor(i / inputs) + 1},${i % inputs + 1}]` }));
    offset += inputs * layer.width + layer.width;
    inputs = layer.width;
    return choices;
  });
}

export function captureBoundarySlice(params: number[], config: BoundaryConfig, dataset: BoundaryDataset, step: number, batchSeed: number) {
  return { params: [...params], config: { layers: config.layers.map(layer => ({ ...layer })) },
    train: dataset.train.map(sample => ({ input: [...sample.input] as [number, number], target: sample.target })), step, batchSeed };
}
export type BoundarySliceSnapshot = ReturnType<typeof captureBoundarySlice>;
export type BoundarySliceMode = 'batch' | 'train' | 'regularized';

export function evaluateBoundarySlice(snapshot: BoundarySliceSnapshot, pair: [number, number], values: [number, number], batchSize: number, batchStep: number, lambda: number) {
  const choices = boundaryWeightChoices(snapshot.config);
  if (pair[0] === pair[1] || pair.some(index => !choices.some(choice => choice.index === index))) throw new RangeError('Нужны два различных веса сети');
  const params = [...snapshot.params];
  pair.forEach((index, i) => { params[index] = values[i]; });
  const indices = boundaryBatchIndices(batchStep, batchSize, snapshot.batchSeed, snapshot.train.length);
  const batch = boundaryLossGradient(params, snapshot.config, indices.map(index => snapshot.train[index]));
  const train = boundaryLossGradient(params, snapshot.config, snapshot.train);
  const penalty = boundaryL2(params, snapshot.config, lambda);
  const pick = (grad: number[]): [number, number] => [grad[pair[0]], grad[pair[1]]];
  return { batch: { loss: batch.loss, gradient: pick(batch.grad) }, train: { loss: train.loss, gradient: pick(train.grad) },
    regularized: { loss: train.loss + penalty.loss, gradient: pick(train.grad.map((g, i) => g + penalty.grad[i])) }, indices, penalty: penalty.loss };
}

/** Bounded 9×9 grid, computed only for an explicitly captured snapshot. */
export function boundarySliceGrid(snapshot: BoundarySliceSnapshot, pair: [number, number], radius: number, batchSize: number, batchStep: number, lambda: number) {
  if (!Number.isFinite(radius) || radius <= 0) throw new RangeError('Радиус должен быть положительным');
  return Array.from({ length: 9 }, (_, y) => Array.from({ length: 9 }, (_, x) => {
    const values: [number, number] = [snapshot.params[pair[0]] + radius * (x / 4 - 1), snapshot.params[pair[1]] + radius * (y / 4 - 1)];
    return { values, ...evaluateBoundarySlice(snapshot, pair, values, batchSize, batchStep, lambda) };
  }));
}
