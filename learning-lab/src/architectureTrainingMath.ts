import { imagePatches } from './visionRoutingMath.ts';

// ponytail: scalar reverse-mode graphs suit these tiny lessons, not production tensors.
// Kept local: the existing Transformer tape is private and has a different trace contract.
type Scalar = { value: number; grad: number; parents: [Scalar, number][] };
class Tape {
  nodes: Scalar[] = [];
  recording: boolean;
  constructor(recording = true) { this.recording = recording; }
  scalar(value: number, parents: [Scalar, number][] = []): Scalar {
    const x = { value, grad: 0, parents: this.recording ? parents : [] };
    if (this.recording) this.nodes.push(x);
    return x;
  }
  sum(xs: Scalar[]) { return this.scalar(xs.reduce((s, x) => s + x.value, 0), xs.map(x => [x, 1])); }
  add(a: Scalar, b: Scalar) { return this.sum([a, b]); }
  scale(a: Scalar, k: number) { return this.scalar(a.value * k, [[a, k]]); }
  mul(a: Scalar, b: Scalar) { return this.scalar(a.value * b.value, [[a, b.value], [b, a.value]]); }
  tanh(a: Scalar) { const y = Math.tanh(a.value); return this.scalar(y, [[a, 1 - y * y]]); }
  exp(a: Scalar) { const y = Math.exp(a.value); return this.scalar(y, [[a, y]]); }
  log(a: Scalar) { return this.scalar(Math.log(a.value), [[a, 1 / a.value]]); }
  inverse(a: Scalar) { return this.scalar(1 / a.value, [[a, -1 / a.value ** 2]]); }
  softmax(xs: Scalar[]) {
    const max = Math.max(...xs.map(x => x.value));
    const e = xs.map(x => this.exp(this.add(x, this.scalar(-max)))), total = this.sum(e);
    return { probabilities: e.map(x => this.mul(x, this.inverse(total))), logZ: this.add(this.log(total), this.scalar(max)) };
  }
  squareError(a: Scalar, target: number) { const e = this.add(a, this.scalar(-target)); return this.mul(e, e); }
  backward(loss: Scalar) {
    loss.grad = 1;
    for (let i = this.nodes.length - 1; i >= 0; i--) for (const [p, d] of this.nodes[i].parents) p.grad += d * this.nodes[i].grad;
  }
}

export type TrainingFamily = 'vit' | 'moe' | 'ssm' | 'unet' | 'dit';
export type TrainingGroup = { name: string; label: string; offset: number; size: number };
const specs: Record<TrainingFamily, [string, string, number][]> = {
  vit: [['patch', 'Проекция патча 4→2', 8], ['position', 'Позиции 4×2', 8], ['q', 'Q 2×2', 4], ['k', 'K 2×2', 4], ['v', 'V 2×2', 4], ['ff', 'FFN 2×2 + bias', 6], ['head', 'Голова 2→2 + bias', 6]],
  moe: [['router', 'Router: два affine-logit', 4], ['expert0', 'Эксперт 1: ax+b', 2], ['expert1', 'Эксперт 2: ax+b', 2]],
  ssm: [['a', 'Диагональ A=tanh(a)', 3], ['b', 'Запись B', 3], ['c', 'Чтение C', 3]],
  unet: [['encoder', 'Свёртка 3×3 + bias + t', 11], ['bottleneck', 'Свёртка 3×3 + bias + t', 11], ['decoder', 'Skip + upsample → 1×1', 3]],
  dit: [['patch', 'Проекция патча 4→4', 16], ['position', 'Позиции 4×4', 16], ['time', 'Модуляция t: scale + shift', 8], ['q', 'Q 4×4', 16], ['k', 'K 4×4', 16], ['v', 'V 4×4', 16], ['ff', 'FFN 4×4 + bias', 20], ['head', 'Патч шума 4→4 + bias', 20]],
};
export function trainingGroups(family: TrainingFamily): TrainingGroup[] {
  let offset = 0;
  return specs[family].map(([name, label, size]) => { const g = { name, label, offset, size }; offset += size; return g; });
}
function rng(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state + .5) / 4294967296; };
}
export function initialArchitectureParameters(family: TrainingFamily, seed = 41) {
  if (family === 'ssm') return [.8, .2, -.5, .4, -.25, .3, .3, .2, -.2];
  if (family === 'moe') return [.7, .3, -.4, -.2, .5, .1, -.3, .2];
  const random = rng(seed);
  return trainingGroups(family).flatMap(g => Array.from({ length: g.size }, () => (random() * 2 - 1) * (g.name === 'position' ? .15 : .35)));
}
function setup(family: TrainingFamily, parameters: number[], recording: boolean) {
  const groups = trainingGroups(family), size = groups.reduce((n, g) => n + g.size, 0);
  if (parameters.length !== size || !parameters.every(Number.isFinite)) throw new RangeError(`Нужны ${size} конечных параметров ${family}.`);
  const t = new Tape(recording), p = parameters.map(x => t.scalar(x));
  const g = Object.fromEntries(groups.map(group => [group.name, p.slice(group.offset, group.offset + group.size)]));
  return { t, p, g };
}
function linear(t: Tape, x: Scalar[], weights: Scalar[], out: number, bias = false) {
  return Array.from({ length: out }, (_, j) => t.sum([...x.map((v, i) => t.mul(v, weights[i * out + j])), ...(bias ? [weights[x.length * out + j]] : [])]));
}
function attentionBlock(t: Tape, tokens: Scalar[][], g: Record<string, Scalar[]>) {
  const d = tokens[0].length;
  const q = tokens.map(x => linear(t, x, g.q, d)), k = tokens.map(x => linear(t, x, g.k, d)), v = tokens.map(x => linear(t, x, g.v, d));
  const attention = q.map(row => t.softmax(k.map(key => t.scale(t.sum(row.map((x, j) => t.mul(x, key[j]))), 1 / Math.sqrt(d)))).probabilities);
  const residual = tokens.map((row, i) => row.map((x, j) => t.add(x, t.sum(attention[i].map((a, z) => t.mul(a, v[z][j]))))));
  const hidden = residual.map(row => linear(t, row, g.ff, d, true).map((x, j) => t.add(row[j], t.tanh(x))));
  return { hidden, attention };
}
function result(t: Tape, p: Scalar[], loss: Scalar, recording: boolean) {
  if (!Number.isFinite(loss.value)) throw new RangeError('Потеря не конечна: уменьшите шаг и сбросьте опыт.');
  if (recording) t.backward(loss);
  return { loss: loss.value, gradients: p.map(x => x.grad) };
}

export type VisionSample = { image: number[][]; label: number };
export function visionTrainingData(split: 'train' | 'validation'): VisionSample[] {
  const random = rng(split === 'train' ? 23 : 91);
  return Array.from({ length: split === 'train' ? 16 : 8 }, (_, i) => {
    const label = i % 2, phase = Math.floor(i / 2) % 2, amplitude = .65 + .3 * random();
    const image = Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) =>
      ((label === 0 ? c : r) % 2 === phase ? amplitude : -amplitude) + (random() - .5) * .24));
    return { image, label };
  });
}
export function vitTrainingTrace(parameters: number[], sample: VisionSample, recording = true) {
  if (sample.label !== 0 && sample.label !== 1) throw new RangeError('Класс ViT: 0 или 1.');
  const patches = imagePatches(sample.image), { t, p, g } = setup('vit', parameters, recording);
  const tokens = patches.map((patch, i) => linear(t, patch.pixels.map(x => t.scalar(x)), g.patch, 2).map((x, j) => t.add(x, g.position[i * 2 + j])));
  const { hidden, attention } = attentionBlock(t, tokens, g);
  // Squared features retain orientation under contrast reversal of a striped image.
  const pooled = [0, 1].map(j => t.scale(t.sum(hidden.map(row => t.mul(row[j], row[j]))), .25));
  const logits = linear(t, pooled, g.head, 2, true), softmax = t.softmax(logits);
  const loss = t.add(softmax.logZ, t.scale(logits[sample.label], -1));
  return { ...result(t, p, loss, recording), probabilities: softmax.probabilities.map(x => x.value), attention: attention.map(row => row.map(x => x.value)), tokens: tokens.map(row => row.map(x => x.value)) };
}
export function evaluateVit(parameters: number[], samples: VisionSample[]) {
  if (!samples.length) throw new RangeError('Нужен хотя бы один пример ViT.');
  const traces = samples.map(sample => vitTrainingTrace(parameters, sample, false));
  return { loss: traces.reduce((s, trace) => s + trace.loss, 0) / samples.length, accuracy: traces.filter((trace, i) => Number(trace.probabilities[1] > trace.probabilities[0]) === samples[i].label).length / samples.length };
}

export type MoeSample = { x: number; target: number };
export function moeTrainingData(split: 'train' | 'validation'): MoeSample[] {
  const n = split === 'train' ? 16 : 15;
  return Array.from({ length: n }, (_, i) => { const x = split === 'train' ? -1.5 + 3 * i / (n - 1) : -1.4 + 2.8 * i / (n - 1); return { x, target: Math.abs(x) }; });
}
export function moeTrainingTrace(parameters: number[], samples: MoeSample[], balance = .05, recording = true) {
  if (!samples.length || samples.some(s => !Number.isFinite(s.x) || !Number.isFinite(s.target)) || !Number.isFinite(balance) || balance < 0) throw new RangeError('MoE: нужны конечные примеры и λ≥0.');
  const { t, p, g } = setup('moe', parameters, recording);
  const rows = samples.map(sample => {
    const x = t.scalar(sample.x), logits = [0, 1].map(j => t.add(t.mul(x, g.router[j * 2]), g.router[j * 2 + 1]));
    const probabilities = t.softmax(logits).probabilities;
    const experts = [g.expert0, g.expert1].map(w => t.add(t.mul(x, w[0]), w[1]));
    const output = t.sum(probabilities.map((a, j) => t.mul(a, experts[j])));
    return { probabilities, experts, output, error: t.squareError(output, sample.target) };
  });
  const load = [0, 1].map(j => t.scale(t.sum(rows.map(row => row.probabilities[j])), 1 / rows.length));
  // Importance balance: E * sum(mean(p_e)^2) - 1. This is not Switch's hard-load loss.
  const balancing = t.add(t.scale(t.sum(load.map(x => t.mul(x, x))), 2), t.scalar(-1));
  const mse = t.scale(t.sum(rows.map(row => row.error)), 1 / rows.length), loss = t.add(mse, t.scale(balancing, balance));
  return { ...result(t, p, loss, recording), mse: mse.value, balanceLoss: balancing.value, load: load.map(x => x.value), rows: rows.map(row => {
    const probabilities = row.probabilities.map(x => x.value), experts = row.experts.map(x => x.value), winner = Number(probabilities[1] > probabilities[0]);
    return { probabilities, experts, output: row.output.value, winner, hardOutput: experts[winner] };
  }) };
}

export type MemorySample = { input: number[]; target: number };
export function ssmTrainingData(split: 'train' | 'validation'): MemorySample[] {
  const random = rng(split === 'train' ? 61 : 103);
  return Array.from({ length: split === 'train' ? 12 : 8 }, (_, i) => {
    const signal = (i % 2 ? -1 : 1) * (.5 + .5 * random());
    return { input: [signal, ...Array.from({ length: 5 }, () => (random() - .5) * .08)], target: signal };
  });
}
export function ssmTrainingTrace(parameters: number[], sample: MemorySample, recording = true) {
  if (!sample.input.length || sample.input.length > 32 || !sample.input.every(Number.isFinite) || !Number.isFinite(sample.target)) throw new RangeError('SSM: 1…32 конечных входа и конечная цель.');
  const { t, p, g } = setup('ssm', parameters, recording), decay = g.a.map(x => t.tanh(x));
  let state = [t.scalar(0), t.scalar(0), t.scalar(0)];
  const states: number[][] = [], outputs: number[] = [];
  let output = t.scalar(0);
  for (const x of sample.input) {
    state = state.map((h, j) => t.add(t.mul(decay[j], h), t.scale(g.b[j], x)));
    output = t.sum(state.map((h, j) => t.mul(g.c[j], h)));
    states.push(state.map(h => h.value)); outputs.push(output.value);
  }
  const loss = t.squareError(output, sample.target);
  return { ...result(t, p, loss, recording), decay: decay.map(x => x.value), states, outputs };
}
export function evaluateSsm(parameters: number[], samples: MemorySample[]) {
  if (!samples.length) throw new RangeError('Нужны примеры памяти.');
  return samples.reduce((s, sample) => s + ssmTrainingTrace(parameters, sample, false).loss, 0) / samples.length;
}

export type DenoiserKind = 'unet' | 'dit';
export type DenoisingSample = { clean: number[]; noise: number[]; noisy: number[]; time: number };
export const DENOISING_STEPS = 8;
/** alphaBar(0)=1; alphaBar(8)=.01. A short, explicitly chosen VP schedule. */
export function denoisingAlpha(time: number) {
  if (!Number.isInteger(time) || time < 0 || time > DENOISING_STEPS) throw new RangeError('Шаг диффузии: 0…8.');
  return Math.exp(Math.log(.01) * time / DENOISING_STEPS);
}
function gaussian(random: () => number) { return Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random()); }
export function denoisingTrainingData(split: 'train' | 'validation'): DenoisingSample[] {
  const random = rng(split === 'train' ? 131 : 197);
  return Array.from({ length: split === 'train' ? 32 : 16 }, (_, i) => {
    const time = i % DENOISING_STEPS + 1, orientation = Math.floor(i / DENOISING_STEPS) % 2;
    const clean = Array.from({ length: 16 }, (_, j) => ((orientation ? Math.floor(j / 4) : j % 4) < 2 ? .6 : -.6));
    const noise = clean.map(() => gaussian(random)), a = denoisingAlpha(time);
    return { clean, noise, time, noisy: clean.map((x, j) => Math.sqrt(a) * x + Math.sqrt(1 - a) * noise[j]) };
  });
}
function conv(t: Tape, input: Scalar[], side: number, weights: Scalar[], time: number) {
  return input.map((_, index) => {
    const r = Math.floor(index / side), c = index % side;
    const terms: Scalar[] = [weights[9], t.scale(weights[10], time)];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < side && cc >= 0 && cc < side) terms.push(t.mul(input[rr * side + cc], weights[(dr + 1) * 3 + dc + 1]));
    }
    return t.tanh(t.sum(terms));
  });
}
function denoisingGraph(kind: DenoiserKind, parameters: number[], noisy: number[], time: number, recording: boolean) {
  if (noisy.length !== 16 || !noisy.every(Number.isFinite) || !Number.isInteger(time) || time < 1 || time > DENOISING_STEPS) throw new RangeError('Denoiser: 16 конечных пикселей и t=1…8.');
  const { t, p, g } = setup(kind, parameters, recording), tau = time / DENOISING_STEPS;
  let output: Scalar[], attention: number[][] = [], bottleneck: number[] = [];
  if (kind === 'unet') {
    const encoder = conv(t, noisy.map(x => t.scalar(x)), 4, g.encoder, tau);
    const down = [0, 1, 2, 3].map(j => { const r = Math.floor(j / 2) * 2, c = j % 2 * 2; return t.scale(t.sum([encoder[r * 4 + c], encoder[r * 4 + c + 1], encoder[(r + 1) * 4 + c], encoder[(r + 1) * 4 + c + 1]]), .25); });
    const low = conv(t, down, 2, g.bottleneck, tau); bottleneck = low.map(x => x.value);
    output = encoder.map((x, j) => t.sum([t.mul(g.decoder[0], x), t.mul(g.decoder[1], low[Math.floor(Math.floor(j / 4) / 2) * 2 + Math.floor(j % 4 / 2)]), g.decoder[2]]));
  } else {
    const patches = imagePatches(Array.from({ length: 4 }, (_, r) => noisy.slice(r * 4, r * 4 + 4)));
    const tokens = patches.map((patch, i) => linear(t, patch.pixels.map(x => t.scalar(x)), g.patch, 4).map((x, j) =>
      t.add(t.mul(t.add(x, g.position[i * 4 + j]), t.add(t.scalar(1), t.scale(g.time[j], tau))), t.scale(g.time[4 + j], tau))));
    const block = attentionBlock(t, tokens, g); attention = block.attention.map(row => row.map(x => x.value));
    const pixels = block.hidden.map(row => linear(t, row, g.head, 4, true));
    output = Array.from({ length: 16 }, (_, j) => { const r = Math.floor(j / 4), c = j % 4; return pixels[Math.floor(r / 2) * 2 + Math.floor(c / 2)][r % 2 * 2 + c % 2]; });
  }
  return { t, p, output, attention, bottleneck };
}
export function denoiserPrediction(kind: DenoiserKind, parameters: number[], noisy: number[], time: number) {
  const graph = denoisingGraph(kind, parameters, noisy, time, false);
  return graph.output.map(x => x.value);
}
export function denoiserTrainingTrace(kind: DenoiserKind, parameters: number[], sample: DenoisingSample, recording = true) {
  if (sample.noise.length !== 16 || !sample.noise.every(Number.isFinite)) throw new RangeError('Целевой шум: 16 конечных чисел.');
  const { t, p, output, attention, bottleneck } = denoisingGraph(kind, parameters, sample.noisy, sample.time, recording);
  const loss = t.scale(t.sum(output.map((x, i) => t.squareError(x, sample.noise[i]))), 1 / 16);
  return { ...result(t, p, loss, recording), prediction: output.map(x => x.value), attention, bottleneck };
}
export function evaluateDenoiser(kind: DenoiserKind, parameters: number[], samples: DenoisingSample[]) {
  if (!samples.length) throw new RangeError('Нужны примеры денойзинга.');
  return samples.reduce((s, sample) => s + denoiserTrainingTrace(kind, parameters, sample, false).loss, 0) / samples.length;
}
/** Deterministic DDIM (eta=0), no clipping: every iterate depends on the trained epsilon model. */
export function sampleDenoiser(kind: DenoiserKind, parameters: number[], seed = 701) {
  const random = rng(seed);
  let pixels = Array.from({ length: 16 }, () => gaussian(random));
  const trajectory = [{ time: DENOISING_STEPS, pixels: [...pixels] }];
  for (let time = DENOISING_STEPS; time > 0; time--) {
    const a = denoisingAlpha(time), previous = denoisingAlpha(time - 1), epsilon = denoiserPrediction(kind, parameters, pixels, time);
    const clean = pixels.map((x, i) => (x - Math.sqrt(1 - a) * epsilon[i]) / Math.sqrt(a));
    pixels = clean.map((x, i) => Math.sqrt(previous) * x + Math.sqrt(1 - previous) * epsilon[i]);
    if (!pixels.every(Number.isFinite)) throw new RangeError('Обратный процесс разошёлся: сбросьте веса или уменьшите η.');
    trajectory.push({ time: time - 1, pixels: [...pixels] });
  }
  return trajectory;
}

export function architectureSgd(parameters: number[], gradients: number[], rate: number) {
  if (parameters.length !== gradients.length || ![...parameters, ...gradients].every(Number.isFinite) || !Number.isFinite(rate) || rate < 0 || rate > 1) throw new RangeError('SGD: конечные векторы равного размера, η=0…1.');
  return parameters.map((x, i) => x - rate * gradients[i]);
}
export function meanArchitectureGradients(traces: { gradients: number[] }[]) {
  if (!traces.length || traces.some(t => t.gradients.length !== traces[0].gradients.length)) throw new RangeError('Градиенты батча должны иметь одинаковую форму.');
  return traces[0].gradients.map((_, i) => traces.reduce((s, t) => s + t.gradients[i], 0) / traces.length);
}
