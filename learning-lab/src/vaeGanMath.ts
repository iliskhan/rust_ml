// Small, inspectable models. Every curve in the lessons is computed from these parameters.
export const VAE_PARAMETER_NAMES = ['aμ', 'bμ', 'aℓ', 'bℓ', 'w', 'b'];
export const VAE_INITIAL = [0.25, -0.15, 0.08, -0.3, 0.35, -0.4];
export const VAE_NOISE_SD = 0.4;
export const TRAINING_LIMIT = 2000;

function finite(values: number[]) {
  if (!values.every(Number.isFinite)) throw new RangeError('Expected finite numbers');
}

export function normalSamples(count: number, seed = 73): number[] {
  if (!Number.isInteger(count) || count < 0 || count > 100000) throw new RangeError('Invalid sample count');
  let state = seed >>> 0;
  const uniform = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return (state + 0.5) / 4294967296; };
  return Array.from({ length: count }, () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform()));
}

export const VAE_DATA = normalSamples(64, 107).map(x => 0.65 + 0.9 * x);
export const GAN_DATA = normalSamples(64, 611).map((x, i) => (i % 2 ? 1.2 : -1.2) + 0.2 * x);
export const EVALUATION_NOISE = normalSamples(64, 919);

export function gaussianDensity(x: number, mean = 0, sd = 1) {
  if (!(sd > 0)) throw new RangeError('Standard deviation must be positive');
  return Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
}

export function gaussianKl(mu: number, logVariance: number) {
  return 0.5 * (mu * mu + Math.expm1(logVariance) - logVariance);
}

export function vaeEncode(parameters: number[], x: number) {
  const mu = parameters[0] * x + parameters[1];
  const logVariance = parameters[2] * x + parameters[3];
  return { mu, logVariance, sd: Math.exp(logVariance / 2) };
}

export function vaeDecode(parameters: number[], z: number) { return parameters[4] * z + parameters[5]; }

export function vaeTrace(parameters: number[], x: number, epsilon: number, beta = 1, noiseSd = VAE_NOISE_SD) {
  if (parameters.length !== 6 || !(noiseSd > 0) || beta < 0) throw new RangeError('Invalid VAE parameters');
  finite([...parameters, x, epsilon, beta, noiseSd]);
  const encoded = vaeEncode(parameters, x);
  const z = encoded.mu + encoded.sd * epsilon;
  const reconstruction = vaeDecode(parameters, z);
  const error = reconstruction - x;
  const nll = Math.log(noiseSd * Math.sqrt(2 * Math.PI)) + error * error / (2 * noiseSd ** 2);
  const kl = gaussianKl(encoded.mu, encoded.logVariance);
  const dReconstruction = error / noiseSd ** 2;
  const dZ = dReconstruction * parameters[4];
  const dMu = dZ + beta * encoded.mu;
  const dLogVariance = dZ * encoded.sd * epsilon / 2 + beta * Math.expm1(encoded.logVariance) / 2;
  const gradient = [dMu * x, dMu, dLogVariance * x, dLogVariance, dReconstruction * z, dReconstruction];
  return { ...encoded, z, reconstruction, error, nll, kl, loss: nll + beta * kl, gradient, dZ, dMu, dLogVariance };
}

// Exact expectation is available because this decoder is affine. Training still uses reparameterized samples.
export function vaeExpected(parameters: number[], data = VAE_DATA, beta = 1, noiseSd = VAE_NOISE_SD) {
  if (!data.length) throw new RangeError('An evaluation set is required');
  let nll = 0, kl = 0;
  for (const x of data) {
    const q = vaeEncode(parameters, x);
    const bias = vaeDecode(parameters, q.mu) - x;
    nll += Math.log(noiseSd * Math.sqrt(2 * Math.PI)) + (bias ** 2 + parameters[4] ** 2 * q.sd ** 2) / (2 * noiseSd ** 2);
    kl += gaussianKl(q.mu, q.logVariance);
  }
  return { nll: nll / data.length, kl: kl / data.length, loss: (nll + beta * kl) / data.length };
}

export function vaeTruePosterior(parameters: number[], x: number, noiseSd = VAE_NOISE_SD) {
  const variance = noiseSd ** 2 / (parameters[4] ** 2 + noiseSd ** 2);
  return { mu: parameters[4] * (x - parameters[5]) / (parameters[4] ** 2 + noiseSd ** 2), variance };
}

export function vaeMarginalNll(parameters: number[], x: number, noiseSd = VAE_NOISE_SD) {
  const variance = parameters[4] ** 2 + noiseSd ** 2;
  return 0.5 * (Math.log(2 * Math.PI * variance) + (x - parameters[5]) ** 2 / variance);
}

export function vaeBatchGradient(parameters: number[], data: number[], epsilon: number[], beta = 1) {
  if (!data.length || data.length !== epsilon.length) throw new RangeError('Data and noise batches must match');
  const gradient = Array(6).fill(0) as number[];
  let loss = 0;
  data.forEach((x, i) => {
    const trace = vaeTrace(parameters, x, epsilon[i], beta);
    loss += trace.loss / data.length;
    trace.gradient.forEach((value, j) => { gradient[j] += value / data.length; });
  });
  return { loss, gradient };
}

// Global norm clipping is an explicit teaching safeguard, not part of the loss.
export function gradientStep(parameters: number[], gradient: number[], learningRate: number) {
  if (parameters.length !== gradient.length || learningRate < 0) throw new RangeError('Invalid gradient step');
  finite([...parameters, ...gradient, learningRate]);
  const norm = Math.hypot(...gradient);
  const scale = norm > 10 ? 10 / norm : 1;
  const next = parameters.map((p, i) => p - learningRate * scale * gradient[i]);
  if (next.some(p => !Number.isFinite(p) || Math.abs(p) > 30)) throw new RangeError('Учебный предел весов достигнут. Уменьшите шаг или сбросьте модель.');
  return { parameters: next, norm, clipped: scale < 1 };
}

export function vaeTrainStep(parameters: number[], step: number, learningRate: number, beta: number) {
  const batch = Array.from({ length: 16 }, (_, i) => VAE_DATA[(step * 16 + i) % VAE_DATA.length]);
  const estimate = vaeBatchGradient(parameters, batch, normalSamples(16, 1009 + step), beta);
  return { ...gradientStep(parameters, estimate.gradient, learningRate), estimate };
}

export const GAN_WIDTH = 4;
export const GAN_PARAMETER_NAMES = Array.from({ length: GAN_WIDTH }, (_, i) => [`w${i + 1}`, `b${i + 1}`, `v${i + 1}`]).flat().concat('b_out');
// Each hidden unit stores input weight, bias, output weight; the final entry is output bias.
export const GAN_GENERATOR_INITIAL = [0.7, -0.3, 0.4, -0.5, 0.4, -0.35, 1.1, 0.8, 0.25, -1, -0.8, -0.3, -0.2];
export const GAN_DISCRIMINATOR_INITIAL = [1, 1, 0.2, -1, 1, 0.2, 1.5, -1, -0.2, -1.5, -1, -0.2, 0];

export function networkTrace(parameters: number[], x: number) {
  if (parameters.length !== GAN_WIDTH * 3 + 1) throw new RangeError('Expected a 1→4→1 network');
  const hidden = Array.from({ length: GAN_WIDTH }, (_, i) => Math.tanh(parameters[3 * i] * x + parameters[3 * i + 1]));
  let output = parameters.at(-1)!;
  hidden.forEach((value, i) => { output += value * parameters[3 * i + 2]; });
  const gradient = Array(parameters.length).fill(0) as number[];
  let inputGradient = 0;
  hidden.forEach((value, i) => {
    const local = parameters[3 * i + 2] * (1 - value * value);
    gradient[3 * i] = local * x;
    gradient[3 * i + 1] = local;
    gradient[3 * i + 2] = value;
    inputGradient += local * parameters[3 * i];
  });
  gradient[parameters.length - 1] = 1;
  return { output, hidden, gradient, inputGradient };
}

export function sigmoid(logit: number) {
  if (logit >= 0) return 1 / (1 + Math.exp(-logit));
  const exponential = Math.exp(logit);
  return exponential / (1 + exponential);
}
export function softplus(x: number) { return Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x))); }
export function binaryCrossEntropy(logit: number, label: 0 | 1) { return label ? softplus(-logit) : softplus(logit); }
export type GeneratorObjective = 'non-saturating' | 'minimax';

export function ganDiscriminatorGradient(generator: number[], discriminator: number[], real: number[], noise: number[]) {
  if (!real.length || !noise.length) throw new RangeError('Empty GAN batch');
  const gradient = Array(discriminator.length).fill(0) as number[];
  let loss = 0;
  const accumulate = (input: number, label: 0 | 1, size: number) => {
    const trace = networkTrace(discriminator, input);
    loss += binaryCrossEntropy(trace.output, label) / size;
    // sigmoid(logit)-1 is evaluated as -sigmoid(-logit) to retain tiny derivatives.
    const dLogit = label ? -sigmoid(-trace.output) : sigmoid(trace.output);
    trace.gradient.forEach((value, i) => { gradient[i] += dLogit * value / size; });
  };
  real.forEach(x => accumulate(x, 1, real.length));
  noise.forEach(z => accumulate(networkTrace(generator, z).output, 0, noise.length));
  return { loss, gradient };
}

export function ganGeneratorGradient(generator: number[], discriminator: number[], noise: number[], objective: GeneratorObjective = 'non-saturating') {
  if (!noise.length) throw new RangeError('Empty GAN batch');
  const gradient = Array(generator.length).fill(0) as number[];
  let loss = 0;
  noise.forEach(z => {
    const generated = networkTrace(generator, z);
    const judged = networkTrace(discriminator, generated.output);
    loss += (objective === 'non-saturating' ? softplus(-judged.output) : -softplus(judged.output)) / noise.length;
    const dLogit = objective === 'non-saturating' ? -sigmoid(-judged.output) : -sigmoid(judged.output);
    generated.gradient.forEach((value, i) => { gradient[i] += dLogit * judged.inputGradient * value / noise.length; });
  });
  return { loss, gradient };
}

export type GanState = { generator: number[]; discriminator: number[]; dSteps: number; gSteps: number };
export function initialGan(collapsed = false): GanState {
  const generator = [...GAN_GENERATOR_INITIAL];
  if (collapsed) {
    for (let i = 0; i < GAN_WIDTH; i++) generator[3 * i + 2] *= 0.02;
    generator[generator.length - 1] = -1.2;
  }
  return { generator, discriminator: [...GAN_DISCRIMINATOR_INITIAL], dSteps: 0, gSteps: 0 };
}

export function ganTrainStep(state: GanState, who: 'D' | 'G', learningRate: number, objective: GeneratorObjective = 'non-saturating') {
  const step = who === 'D' ? state.dSteps : state.gSteps;
  const noise = normalSamples(16, (who === 'D' ? 2011 : 4001) + step);
  const real = Array.from({ length: 16 }, (_, i) => GAN_DATA[(step * 16 + i) % GAN_DATA.length]);
  const estimate = who === 'D' ? ganDiscriminatorGradient(state.generator, state.discriminator, real, noise) : ganGeneratorGradient(state.generator, state.discriminator, noise, objective);
  const update = gradientStep(who === 'D' ? state.discriminator : state.generator, estimate.gradient, learningRate);
  return {
    state: who === 'D' ? { ...state, discriminator: update.parameters, dSteps: state.dSteps + 1 } : { ...state, generator: update.parameters, gSteps: state.gSteps + 1 },
    norm: update.norm, clipped: update.clipped, loss: estimate.loss,
  };
}

export function empiricalWasserstein(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) throw new RangeError('Equal nonempty sample counts required');
  const left = [...a].sort((x, y) => x - y), right = [...b].sort((x, y) => x - y);
  return left.reduce((sum, x, i) => sum + Math.abs(x - right[i]), 0) / a.length;
}

export function ganMetrics(state: GanState, objective: GeneratorObjective = 'non-saturating') {
  const generated = EVALUATION_NOISE.map(z => networkTrace(state.generator, z).output);
  return {
    generated,
    dLoss: ganDiscriminatorGradient(state.generator, state.discriminator, GAN_DATA, EVALUATION_NOISE).loss,
    gLoss: ganGeneratorGradient(state.generator, state.discriminator, EVALUATION_NOISE, objective).loss,
    distance: empiricalWasserstein(GAN_DATA, generated),
    leftFraction: generated.filter(x => x < 0).length / generated.length,
    realScore: GAN_DATA.reduce((sum, x) => sum + sigmoid(networkTrace(state.discriminator, x).output), 0) / GAN_DATA.length,
    fakeScore: generated.reduce((sum, x) => sum + sigmoid(networkTrace(state.discriminator, x).output), 0) / generated.length,
  };
}

export function plotPoints(fn: (x: number) => number, min = -3.5, max = 3.5, count = 101) {
  return Array.from({ length: count }, (_, i) => { const x = min + (max - min) * i / (count - 1); return { x, y: fn(x) }; });
}

export function sampleDensity(samples: number[], bandwidth = 0.18) {
  return plotPoints(x => samples.reduce((sum, value) => sum + gaussianDensity(x, value, bandwidth), 0) / samples.length);
}
