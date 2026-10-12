import { activate, activationDerivative, bceLogit, type Activation } from './math.ts';

export type BoundaryKind = 'circles' | 'moons' | 'spiral';
export type BoundaryLayer = { width: number; activation: Activation };
export type BoundaryConfig = { layers: BoundaryLayer[] };
export type BoundarySample = { input: [number, number]; target: 0 | 1 };
export type BoundaryDataset = { train: BoundarySample[]; validation: BoundarySample[] };

function randomSource(seed: number) {
  if (!Number.isFinite(seed)) throw new RangeError('Boundary: seed должен быть конечным');
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent balanced draws; fixed coordinate noise U(-0.018, 0.018), labels unchanged. */
export function makeBoundaryDataset(kind: BoundaryKind, seed = 42): BoundaryDataset {
  if (!['circles', 'moons', 'spiral'].includes(kind)) throw new RangeError('Boundary: неизвестный набор');
  randomSource(seed); // Validate before converting the two stream seeds to uint32.
  const sample = (size: number, streamSeed: number): BoundarySample[] => {
    const random = randomSource(streamSeed);
    const data: BoundarySample[] = [];
    for (let target = 0; target <= 1; target++) {
      for (let i = 0; i < size / 2; i++) {
        const t = random();
        let x: number;
        let y: number;
        if (kind === 'circles') {
          const angle = 2 * Math.PI * t;
          const radius = target === 0 ? 0.35 : 0.17;
          x = 0.5 + radius * Math.cos(angle);
          y = 0.5 + radius * Math.sin(angle);
        } else if (kind === 'moons') {
          const angle = Math.PI * t;
          const rawX = target === 0 ? Math.cos(angle) : 1 - Math.cos(angle);
          const rawY = target === 0 ? Math.sin(angle) : 0.5 - Math.sin(angle);
          x = 0.5 + 0.26 * (rawX - 0.5);
          y = 0.5 + 0.42 * (rawY - 0.25);
        } else {
          const angle = 1.75 * Math.PI * t + target * Math.PI;
          const radius = 0.055 + 0.36 * t;
          x = 0.5 + radius * Math.cos(angle);
          y = 0.5 + radius * Math.sin(angle);
        }
        data.push({ input: [x + 0.036 * (random() - 0.5), y + 0.036 * (random() - 0.5)], target: target as 0 | 1 });
      }
    }
    for (let i = data.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [data[i], data[j]] = [data[j], data[i]];
    }
    return data;
  };
  return { train: sample(96, seed >>> 0), validation: sample(32, (seed >>> 0) ^ 0x9e3779b9) };
}

/** Each layer is row-major W[out,in], followed by b[out]; final output is sigmoid. */
function layout(config: BoundaryConfig) {
  if (!config || !Array.isArray(config.layers) || config.layers.length > 3) throw new RangeError('Boundary: нужны 0–3 скрытых слоя');
  for (const layer of config.layers) {
    if (!layer || !Number.isInteger(layer.width) || layer.width < 1 || layer.width > 16 || !['relu', 'tanh', 'sigmoid'].includes(layer.activation)) {
      throw new RangeError('Boundary: ширина 1–16, активация ReLU, tanh или sigmoid');
    }
  }
  let inputs = 2;
  let offset = 0;
  return [...config.layers, { width: 1, activation: 'sigmoid' as const }].map(layer => {
    const result = { ...layer, inputs, offset, bias: offset + inputs * layer.width };
    offset = result.bias + layer.width;
    inputs = layer.width;
    return result;
  });
}

export function boundaryParameterCount(config: BoundaryConfig): number {
  const last = layout(config).at(-1)!;
  return last.bias + last.width;
}

/** He uniform for ReLU (variance 2/fan-in), Glorot uniform otherwise; zero biases. */
export function createBoundaryParameters(config: BoundaryConfig, seed = 42): number[] {
  const layers = layout(config);
  const random = randomSource(seed);
  const params: number[] = [];
  for (const layer of layers) {
    const limit = Math.sqrt(layer.activation === 'relu' ? 6 / layer.inputs : 6 / (layer.inputs + layer.width));
    for (let i = 0; i < layer.inputs * layer.width; i++) params.push((2 * random() - 1) * limit);
    for (let i = 0; i < layer.width; i++) params.push(0);
  }
  return params;
}

function finite(values: number[]) {
  for (const value of values) if (!Number.isFinite(value)) throw new RangeError('Boundary: нужны конечные числа');
}

function checkedModel(params: number[], config: BoundaryConfig) {
  const layers = layout(config);
  const last = layers.at(-1)!;
  if (!Array.isArray(params) || params.length !== last.bias + last.width) throw new RangeError('Boundary: число параметров не соответствует архитектуре');
  finite(params);
  return layers;
}

function checkInput(input: [number, number]) {
  if (!Array.isArray(input) || input.length !== 2 || input.some(x => !Number.isFinite(x) || x < 0 || x > 1)) {
    throw new RangeError('Boundary: нужны два входа в [0,1]');
  }
  finite(input);
}

function checkData(data: BoundarySample[]) {
  if (!Array.isArray(data) || !data.length) throw new RangeError('Boundary: нужна непустая выборка');
  for (const sample of data) {
    if (!sample || (sample.target !== 0 && sample.target !== 1)) throw new RangeError('Boundary: класс должен быть 0 или 1');
    checkInput(sample.input);
  }
}

/** The graph uses centered inputs 2x−1; plots retain the original x in [0,1]. */
function forward(params: number[], layers: ReturnType<typeof layout>, input: [number, number]) {
  const activations: number[][] = [[2 * input[0] - 1, 2 * input[1] - 1]];
  const preactivations: number[][] = [];
  for (const layer of layers) {
    const previous = activations[activations.length - 1];
    const z = Array<number>(layer.width);
    for (let j = 0; j < layer.width; j++) {
      let sum = params[layer.bias + j];
      for (let i = 0; i < layer.inputs; i++) sum += params[layer.offset + j * layer.inputs + i] * previous[i];
      z[j] = sum;
    }
    finite(z);
    preactivations.push(z);
    activations.push(z.map(value => activate(value, layer.activation)));
  }
  return { activations, preactivations, logit: preactivations[preactivations.length - 1][0] };
}

export function predictBoundary(params: number[], config: BoundaryConfig, input: [number, number]): number {
  const layers = checkedModel(params, config);
  checkInput(input);
  return activate(forward(params, layers, input).logit, 'sigmoid');
}

export type BoundaryTrace = {
  readonly input: readonly [number, number];
  /** a⁰ = 2x−1, followed by every hidden vector and the scalar sigmoid output. */
  readonly activations: readonly (readonly number[])[];
  /** One z vector per hidden layer, followed by the scalar output logit. */
  readonly preactivations: readonly (readonly number[])[];
  readonly logit: number;
  readonly probability: number;
};

/** Checked, independent arrays from the same forward pass used in prediction/training. */
export function traceBoundary(params: number[], config: BoundaryConfig, input: [number, number]): BoundaryTrace {
  const layers = checkedModel(params, config);
  checkInput(input);
  const trace = forward(params, layers, input);
  return { ...trace, input: [...input], probability: trace.activations.at(-1)![0] };
}

/** Copies one row of W and its bias so a numerical explanation cannot edit the model. */
export function boundaryNeuronParameters(params: number[], config: BoundaryConfig, layerIndex: number, neuron: number) {
  const layers = checkedModel(params, config);
  const layer = layers[layerIndex];
  if (!Number.isInteger(layerIndex) || !layer || !Number.isInteger(neuron) || neuron < 0 || neuron >= layer.width) {
    throw new RangeError('Boundary: неизвестный слой или нейрон');
  }
  return { weights: params.slice(layer.offset + neuron * layer.inputs, layer.offset + (neuron + 1) * layer.inputs),
    bias: params[layer.bias + neuron], activation: layer.activation };
}

/** Mean BCE from logits, with gradients for every weight and bias in the same flat layout. */
export function boundaryLossGradient(params: number[], config: BoundaryConfig, data: BoundarySample[], lambda = 0) {
  const layers = checkedModel(params, config);
  checkData(data);
  const grad = Array<number>(params.length).fill(0);
  const predictions: number[] = [];
  let loss = 0;
  for (const { input, target } of data) {
    const { activations, preactivations, logit } = forward(params, layers, input);
    const result = bceLogit(logit, target);
    loss += result.loss / data.length;
    predictions.push(activate(logit, 'sigmoid'));
    let dz = [result.grad / data.length];
    for (let l = layers.length - 1; l >= 0; l--) {
      const layer = layers[l];
      const previous = activations[l];
      const previousGradient = Array<number>(layer.inputs).fill(0);
      for (let j = 0; j < layer.width; j++) {
        grad[layer.bias + j] += dz[j];
        for (let i = 0; i < layer.inputs; i++) {
          const index = layer.offset + j * layer.inputs + i;
          grad[index] += dz[j] * previous[i];
          previousGradient[i] += dz[j] * params[index];
        }
      }
      if (l > 0) dz = previousGradient.map((g, i) => g * activationDerivative(preactivations[l - 1][i], layers[l - 1].activation));
    }
  }
  const rawBCE = loss;
  const penalty = boundaryL2(params, config, lambda);
  loss += penalty.loss;
  for (let i = 0; i < grad.length; i++) grad[i] += penalty.grad[i];
  finite([loss, ...grad]);
  return { loss, rawBCE, penalty: penalty.loss, grad, predictions };
}

/** λ/2 ΣW² and λW, excluding every bias; coupled objective L2 for all optimizers. */
export function boundaryL2(params: number[], config: BoundaryConfig, lambda = 0) {
  const layers = checkedModel(params, config);
  if (!Number.isFinite(lambda) || lambda < 0) throw new RangeError('Boundary: λ должна быть конечной и неотрицательной');
  const grad = Array<number>(params.length).fill(0);
  let loss = 0;
  if (lambda > 0) for (const layer of layers) for (let i = layer.offset; i < layer.bias; i++) {
    loss += (lambda / 2) * params[i] * params[i];
    grad[i] = lambda * params[i];
  }
  finite([loss, ...grad]);
  return { loss, grad };
}

/** The step determines epoch/cursor; the last batch is short, never crosses an epoch. */
export function boundaryBatchProgress(step: number, batchSize: number, size = 96) {
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > size || !Number.isSafeInteger(step) || step < 0) {
    throw new RangeError('Boundary: неверный шаг или размер batch');
  }
  const updatesPerEpoch = Math.ceil(size / batchSize);
  const epoch = Math.floor(step / updatesPerEpoch), cursor = (step % updatesPerEpoch) * batchSize;
  const examples = epoch * size + cursor;
  if (!Number.isSafeInteger(examples)) throw new RangeError('Boundary: слишком большой бюджет');
  return { epoch, cursor, examples, epochs: examples / size, updatesPerEpoch };
}

/** Fresh deterministic permutation per epoch; full-batch retains legacy summation order. */
export function boundaryBatchIndices(step: number, batchSize: number, seed: number, size = 96) {
  const { epoch, cursor } = boundaryBatchProgress(step, batchSize, size);
  const random = randomSource((seed >>> 0) ^ Math.imul(epoch, 0x9e3779b9));
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) throw new RangeError('Boundary: seed порядка должен быть uint32');
  const order = Array.from({ length: size }, (_, i) => i);
  if (batchSize < size) for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(cursor, Math.min(size, cursor + batchSize));
}

export function boundaryMetrics(params: number[], config: BoundaryConfig, data: BoundarySample[], threshold = 0.5) {
  const layers = checkedModel(params, config);
  checkData(data);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError('Boundary: порог должен быть в [0,1]');
  let loss = 0;
  let correct = 0;
  for (const { input, target } of data) {
    const { logit } = forward(params, layers, input);
    loss += bceLogit(logit, target).loss / data.length;
    if (Number(activate(logit, 'sigmoid') >= threshold) === target) correct++;
  }
  finite([loss]);
  return { loss, correct, total: data.length, accuracy: correct / data.length };
}
