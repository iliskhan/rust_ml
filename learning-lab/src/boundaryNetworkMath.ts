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

/** Mean BCE from logits, with gradients for every weight and bias in the same flat layout. */
export function boundaryLossGradient(params: number[], config: BoundaryConfig, data: BoundarySample[]) {
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
  finite([loss, ...grad]);
  return { loss, grad, predictions };
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
