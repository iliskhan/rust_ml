/** A scalar DDPM. Indices 1..T are noisy states; index 0 is clean data. */
export type NoiseSchedule = 'linear' | 'cosine';
export type DiffusionSchedule = { kind: NoiseSchedule; steps: number; beta: number[]; alpha: number[]; alphaBar: number[] };
export const DIFFUSION_STEPS = 64;
export const DATA_MEAN = 1.5;
export const DATA_STD = 0.28;
export const DENOISER_HIDDEN = 24;
const FEATURES = 4;
const UNIT_SIZE = FEATURES + 2; // Four input weights, hidden bias, output weight.
export const DENOISER_PARAMETERS = DENOISER_HIDDEN * UNIT_SIZE + 2;

export function diffusionSchedule(kind: NoiseSchedule = 'linear', steps = DIFFUSION_STEPS): DiffusionSchedule {
  if (!Number.isInteger(steps) || steps < 2 || steps > 1000) throw new RangeError('Expected 2..1000 diffusion steps');
  const beta = [0], alpha = [1], alphaBar = [1];
  const cosine = (t: number) => Math.cos(((t / steps + 0.008) / 1.008) * Math.PI / 2) ** 2;
  for (let t = 1; t <= steps; t++) {
    // Educational cap: 0.25 instead of the paper's 0.999 avoids one almost singular final step.
    const b = kind === 'linear' ? 0.001 + 0.179 * (t - 1) / (steps - 1) : Math.min(0.25, 1 - cosine(t) / cosine(t - 1));
    beta.push(b); alpha.push(1 - b); alphaBar.push(alphaBar[t - 1] * (1 - b));
  }
  return { kind, steps, beta, alpha, alphaBar };
}

function checkTime(schedule: DiffusionSchedule, t: number, allowZero = true) {
  if (!Number.isInteger(t) || t < (allowZero ? 0 : 1) || t > schedule.steps) throw new RangeError('Invalid diffusion timestep');
}

export function forwardNoise(x0: number, epsilon: number, t: number, schedule: DiffusionSchedule) {
  checkTime(schedule, t);
  return Math.sqrt(schedule.alphaBar[t]) * x0 + Math.sqrt(1 - schedule.alphaBar[t]) * epsilon;
}

/** Mulberry32 with an open (0,1) interval, so Box–Muller cannot evaluate log(0). */
export function diffusionRandom(seed: number) {
  let state = seed >>> 0;
  return {
    uniform() {
      state = (state + 0x6D2B79F5) >>> 0;
      let x = state;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return (((x ^ (x >>> 14)) >>> 0) + 0.5) / 4294967296;
    },
    normal() { return Math.sqrt(-2 * Math.log(this.uniform())) * Math.cos(2 * Math.PI * this.uniform()); },
    state() { return state; },
  };
}

export function forwardTrajectory(x0: number, schedule: DiffusionSchedule, seed: number) {
  const random = diffusionRandom(seed), values = [x0];
  for (let t = 1; t <= schedule.steps; t++) values.push(Math.sqrt(schedule.alpha[t]) * values[t - 1] + Math.sqrt(schedule.beta[t]) * random.normal());
  return values;
}

export function normalDensity(x: number, mean: number, variance: number) {
  if (!(variance > 0)) throw new RangeError('Variance must be positive');
  return Math.exp(-((x - mean) ** 2) / (2 * variance)) / Math.sqrt(2 * Math.PI * variance);
}

export function noisyDataDensity(x: number, t: number, schedule: DiffusionSchedule) {
  checkTime(schedule, t);
  const a = schedule.alphaBar[t], mean = Math.sqrt(a) * DATA_MEAN, variance = a * DATA_STD ** 2 + 1 - a;
  return (normalDensity(x, -mean, variance) + normalDensity(x, mean, variance)) / 2;
}

/** Exact E[epsilon | x_t,t] for our known Gaussian mixture, NOT a trained model or the realized noise. */
export function optimalEpsilon(x: number, t: number, schedule: DiffusionSchedule, condition?: -1 | 1) {
  checkTime(schedule, t);
  const a = schedule.alphaBar[t], mean = Math.sqrt(a) * DATA_MEAN, variance = a * DATA_STD ** 2 + 1 - a;
  const expectedMean = condition === undefined ? mean * Math.tanh(mean * x / variance) : condition * mean;
  return Math.sqrt(1 - a) * (x - expectedMean) / variance;
}

export function guidedEpsilon(x: number, t: number, schedule: DiffusionSchedule, condition: -1 | 1, scale: number) {
  const unconditional = optimalEpsilon(x, t, schedule), conditional = optimalEpsilon(x, t, schedule, condition);
  return { unconditional, conditional, guided: unconditional + scale * (conditional - unconditional) };
}

export function estimateClean(xt: number, epsilon: number, t: number, schedule: DiffusionSchedule) {
  checkTime(schedule, t, false);
  return (xt - Math.sqrt(1 - schedule.alphaBar[t]) * epsilon) / Math.sqrt(schedule.alphaBar[t]);
}

export function posteriorParameters(xt: number, x0: number, t: number, schedule: DiffusionSchedule) {
  checkTime(schedule, t, false);
  const a = schedule.alpha[t], bar = schedule.alphaBar[t], previous = schedule.alphaBar[t - 1];
  const cleanWeight = Math.sqrt(previous) * schedule.beta[t] / (1 - bar);
  const noisyWeight = Math.sqrt(a) * (1 - previous) / (1 - bar);
  return { mean: cleanWeight * x0 + noisyWeight * xt, variance: schedule.beta[t] * (1 - previous) / (1 - bar), cleanWeight, noisyWeight };
}

export function ddpmStep(xt: number, epsilon: number, t: number, schedule: DiffusionSchedule, z = 0) {
  const x0 = estimateClean(xt, epsilon, t, schedule);
  const posterior = posteriorParameters(xt, x0, t, schedule);
  const noise = t === 1 ? 0 : Math.sqrt(posterior.variance) * z;
  return { ...posterior, x0, noise, next: posterior.mean + noise };
}

/** DDIM eta=0, including skipped timesteps s<t. Removing DDPM noise alone is different. */
export function ddimStep(xt: number, epsilon: number, t: number, s: number, schedule: DiffusionSchedule) {
  checkTime(schedule, s);
  if (s >= t) throw new RangeError('DDIM requires 0 <= s < t');
  const x0 = estimateClean(xt, epsilon, t, schedule);
  return { x0, next: Math.sqrt(schedule.alphaBar[s]) * x0 + Math.sqrt(1 - schedule.alphaBar[s]) * epsilon };
}

export type Denoiser = { weights: number[] };
export type DiffusionExample = { x0: number; xt: number; t: number; epsilon: number };

function timeFeatures(x: number, t: number, steps: number) {
  const u = t / steps;
  return [x / 2, 2 * u - 1, Math.sin(Math.PI * u), Math.cos(Math.PI * u)];
}

export function initialDenoiser(seed = 73): Denoiser {
  const random = diffusionRandom(seed), weights = Array(DENOISER_PARAMETERS).fill(0) as number[];
  for (let h = 0; h < DENOISER_HIDDEN; h++) {
    for (let j = 0; j < FEATURES; j++) weights[h * UNIT_SIZE + j] = random.normal() * 0.65;
    weights[h * UNIT_SIZE + FEATURES] = random.normal() * 0.15;
    weights[h * UNIT_SIZE + FEATURES + 1] = random.normal() * 0.04;
  }
  weights[DENOISER_PARAMETERS - 2] = 1; // Trainable linear skip, initially epsilon≈x_t.
  return { weights };
}

export function predictEpsilon(model: Denoiser, x: number, t: number, schedule: DiffusionSchedule) {
  const features = timeFeatures(x, t, schedule.steps), weights = model.weights;
  let result = weights[DENOISER_PARAMETERS - 2] * x + weights[DENOISER_PARAMETERS - 1];
  for (let h = 0; h < DENOISER_HIDDEN; h++) {
    const offset = h * UNIT_SIZE;
    let activation = weights[offset + FEATURES];
    for (let j = 0; j < FEATURES; j++) activation += weights[offset + j] * features[j];
    result += weights[offset + FEATURES + 1] * Math.tanh(activation);
  }
  return result;
}

export function denoiserLossGradient(model: Denoiser, examples: DiffusionExample[], schedule: DiffusionSchedule) {
  if (!examples.length) throw new RangeError('A batch cannot be empty');
  const gradient = Array(DENOISER_PARAMETERS).fill(0) as number[], weights = model.weights;
  let loss = 0;
  for (const example of examples) {
    const features = timeFeatures(example.xt, example.t, schedule.steps), hidden = [] as number[];
    let prediction = weights[DENOISER_PARAMETERS - 2] * example.xt + weights[DENOISER_PARAMETERS - 1];
    for (let h = 0; h < DENOISER_HIDDEN; h++) {
      const offset = h * UNIT_SIZE;
      let activation = weights[offset + FEATURES];
      for (let j = 0; j < FEATURES; j++) activation += weights[offset + j] * features[j];
      hidden.push(Math.tanh(activation));
      prediction += weights[offset + FEATURES + 1] * hidden[h];
    }
    const error = prediction - example.epsilon, outputGradient = 2 * error / examples.length;
    loss += error ** 2 / examples.length;
    gradient[DENOISER_PARAMETERS - 2] += outputGradient * example.xt;
    gradient[DENOISER_PARAMETERS - 1] += outputGradient;
    for (let h = 0; h < DENOISER_HIDDEN; h++) {
      const offset = h * UNIT_SIZE;
      gradient[offset + FEATURES + 1] += outputGradient * hidden[h];
      const upstream = outputGradient * weights[offset + FEATURES + 1] * (1 - hidden[h] ** 2);
      gradient[offset + FEATURES] += upstream;
      for (let j = 0; j < FEATURES; j++) gradient[offset + j] += upstream * features[j];
    }
  }
  return { loss, gradient };
}

export function diffusionExamples(schedule: DiffusionSchedule, count: number, seed: number) {
  const random = diffusionRandom(seed), examples = [] as DiffusionExample[];
  for (let i = 0; i < count; i++) {
    const x0 = (random.uniform() < 0.5 ? -DATA_MEAN : DATA_MEAN) + DATA_STD * random.normal();
    const t = 1 + Math.floor(random.uniform() * schedule.steps), epsilon = random.normal();
    examples.push({ x0, xt: forwardNoise(x0, epsilon, t, schedule), t, epsilon });
  }
  return { examples, seed: random.state() };
}

export function evaluationLoss(model: Denoiser, schedule: DiffusionSchedule) {
  const { examples } = diffusionExamples(schedule, 512, 91571);
  return examples.reduce((sum, e) => sum + (predictEpsilon(model, e.xt, e.t, schedule) - e.epsilon) ** 2, 0) / examples.length;
}

export type DiffusionTraining = { model: Denoiser; first: number[]; second: number[]; updates: number; seed: number; batchLoss: number | null; history: { x: number; y: number }[] };

export function initialTraining(schedule: DiffusionSchedule): DiffusionTraining {
  const model = initialDenoiser();
  return { model, first: Array(DENOISER_PARAMETERS).fill(0), second: Array(DENOISER_PARAMETERS).fill(0), updates: 0, seed: 441, batchLoss: null, history: [{ x: 0, y: evaluationLoss(model, schedule) }] };
}

/** Pure bounded batch of Adam updates, so React strict-mode replay cannot advance RNG twice. */
export function trainDenoiser(state: DiffusionTraining, schedule: DiffusionSchedule, count: number, learningRate = 0.003): DiffusionTraining {
  if (!Number.isInteger(count) || count < 1 || count > 2000) throw new RangeError('Expected 1..2000 updates');
  if (!(learningRate > 0 && learningRate <= 0.03)) throw new RangeError('Invalid learning rate');
  const next = { ...state, model: { weights: [...state.model.weights] }, first: [...state.first], second: [...state.second], history: [...state.history] };
  for (let i = 0; i < count; i++) {
    const batch = diffusionExamples(schedule, 64, next.seed);
    next.seed = batch.seed;
    const { loss, gradient } = denoiserLossGradient(next.model, batch.examples, schedule);
    next.batchLoss = loss;
    next.updates++;
    for (let j = 0; j < DENOISER_PARAMETERS; j++) {
      next.first[j] = 0.9 * next.first[j] + 0.1 * gradient[j];
      next.second[j] = 0.999 * next.second[j] + 0.001 * gradient[j] ** 2;
      const mean = next.first[j] / (1 - 0.9 ** next.updates), variance = next.second[j] / (1 - 0.999 ** next.updates);
      next.model.weights[j] -= learningRate * mean / (Math.sqrt(variance) + 1e-8);
    }
    if (next.updates % 100 === 0) next.history.push({ x: next.updates, y: evaluationLoss(next.model, schedule) });
  }
  return next;
}

export type EpsilonPredictor = (x: number, t: number) => number;
export type DiffusionSampler = 'ddpm' | 'ddim';

export function diffusionTimeGrid(steps: number, evaluations: number) {
  if (!Number.isInteger(evaluations) || evaluations < 1 || evaluations > steps) throw new RangeError('Invalid number of evaluations');
  return Array.from({ length: evaluations + 1 }, (_, i) => Math.round(steps * (1 - i / evaluations)));
}

export function sampleTrajectory(predict: EpsilonPredictor, schedule: DiffusionSchedule, sampler: DiffusionSampler, initial: number, noiseSeed: number, evaluations = schedule.steps) {
  const random = diffusionRandom(noiseSeed), grid = diffusionTimeGrid(schedule.steps, sampler === 'ddpm' ? schedule.steps : evaluations);
  const path = [{ t: schedule.steps, x: initial }];
  let x = initial;
  for (let i = 0; i < grid.length - 1; i++) {
    const t = grid[i], epsilon = predict(x, t);
    x = sampler === 'ddpm' ? ddpmStep(x, epsilon, t, schedule, t > 1 ? random.normal() : 0).next : ddimStep(x, epsilon, t, grid[i + 1], schedule).next;
    path.push({ t: grid[i + 1], x });
  }
  return path;
}

export function sampleDistribution(predict: EpsilonPredictor, schedule: DiffusionSchedule, sampler: DiffusionSampler, count: number, seed: number, evaluations = schedule.steps) {
  const random = diffusionRandom(seed);
  return Array.from({ length: count }, () => {
    const initial = random.normal(), noiseSeed = Math.floor(random.uniform() * 4294967296);
    return sampleTrajectory(predict, schedule, sampler, initial, noiseSeed, evaluations).at(-1)!.x;
  });
}

export function diffusionHistogram(values: number[], min = -4, max = 4, bins = 32) {
  if (!(max > min) || !Number.isInteger(bins) || bins < 1) throw new RangeError('Invalid histogram domain');
  const width = (max - min) / bins, counts = Array(bins).fill(0) as number[];
  let outside = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < min || value > max) { outside++; continue; }
    counts[Math.min(bins - 1, Math.floor((value - min) / width))]++;
  }
  const density = counts.map(n => n / ((values.length || 1) * width));
  return { counts, density, width, outside, points: density.flatMap((y, i) => [{ x: min + i * width, y }, { x: min + (i + 1) * width, y }]) };
}
