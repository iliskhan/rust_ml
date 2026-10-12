import { attentionTrace, projectTokens, temperatureSoftmax, type Matrix } from './transformerMath.ts';

export const VISION_IMAGE = [[0, 0, 1, 0], [0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 1, 0]];
export const PATCH_PROJECTION = [[.5, .5], [.5, -.5], [.5, -.5], [.5, .5]];
export const VISION_Q = [[1, 0], [0, 1]], VISION_K = [[1, .25], [0, 1]], VISION_V = [[.6, -.2], [.1, .8]];

function image4(image: Matrix) {
  if (image.length !== 4 || image.some(row => row.length !== 4 || !row.every(Number.isFinite))) throw new RangeError('Нужна картинка 4 × 4 из конечных чисел');
}
function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label}: нужно конечное число`);
}

/** Four nonoverlapping 2 × 2 patches, row-major both within and between patches. */
export function imagePatches(image: Matrix) {
  image4(image);
  return [0, 1, 2, 3].map(index => {
    const row = Math.floor(index / 2) * 2, column = index % 2 * 2;
    return { row, column, pixels: [image[row][column], image[row][column + 1], image[row + 1][column], image[row + 1][column + 1]] };
  });
}

export function visionTransformerTrace(image: Matrix, positionStrength = 1) {
  finite(positionStrength, 'Сила позиции');
  const patches = imagePatches(image);
  const flattened = patches.map(patch => patch.pixels);
  const projected = projectTokens(flattened, PATCH_PROJECTION);
  const positions = patches.map(patch => [(patch.row - 1) * .2 * positionStrength, (patch.column - 1) * .2 * positionStrength]);
  const tokens = projected.map((row, i) => row.map((value, d) => value + positions[i][d]));
  const q = projectTokens(tokens, VISION_Q), k = projectTokens(tokens, VISION_K), v = projectTokens(tokens, VISION_V);
  const attention = attentionTrace(q, k, v);
  const output = tokens.map((row, i) => row.map((value, d) => value + attention.output[i][d]));
  const pooled = [0, 1].map(d => output.reduce((sum, row) => sum + row[d], 0) / output.length);
  return { patches, flattened, projected, positions, tokens, attention, output, pooled };
}

export const MOE_INPUT = [[1, .2], [.8, .1], [-.8, .5], [.2, -1]];
export const ROUTER_WEIGHTS = [[1, -1, .3], [.2, .6, -.5]];
export const EXPERTS = [
  { first: [[1, 0, 1], [0, 1, -1]], hiddenBias: [.1, .1, .1], second: [[.5, 0], [0, .5], [.25, -.25]], outputBias: [0, 0] },
  { first: [[-1, 0, .5], [0, 1, .5]], hiddenBias: [.2, .1, .1], second: [[.4, .1], [.1, .6], [-.3, .2]], outputBias: [.1, -.1] },
  { first: [[.5, 1, 0], [-.5, 0, 1]], hiddenBias: [0, .2, .1], second: [[.6, -.2], [-.1, .5], [.2, .4]], outputBias: [-.1, .1] },
];
export function expertForward(input: number[], expert: number) {
  if (input.length !== 2 || !input.every(Number.isFinite) || !Number.isInteger(expert) || expert < 0 || expert >= 3) throw new RangeError('Эксперт: два признака и индекс 0…2');
  const weights = EXPERTS[expert];
  const preactivation = projectTokens([input], weights.first)[0].map((value, i) => value + weights.hiddenBias[i]);
  const hidden = preactivation.map(value => Math.max(0, value));
  const output = projectTokens([hidden], weights.second)[0].map((value, i) => value + weights.outputBias[i]);
  return { preactivation, hidden, output };
}

/** Overflow drops an assignment, never reroutes it. Surviving probabilities are renormalized. */
export function mixtureExpertsTrace(inputs: Matrix, topK: 1 | 2 = 2, capacity = 4, routerBias = [0, 0, 0]) {
  if (!inputs.length || inputs.some(row => row.length !== 2 || !row.every(Number.isFinite)) || (topK !== 1 && topK !== 2) || !Number.isInteger(capacity) || capacity < 0 || routerBias.length !== 3 || !routerBias.every(Number.isFinite)) throw new RangeError('MoE: проверьте токены, top-k, capacity и bias');
  const scores = projectTokens(inputs, ROUTER_WEIGHTS).map(row => row.map((value, i) => value + routerBias[i]));
  const probabilities = scores.map(row => temperatureSoftmax(row));
  const loads = [0, 0, 0], requestedLoads = [0, 0, 0];
  const tokens = inputs.map((input, token) => {
    const selected = [0, 1, 2].sort((a, b) => scores[token][b] - scores[token][a] || a - b).slice(0, topK);
    const selectedMass = selected.reduce((sum, expert) => sum + probabilities[token][expert], 0);
    const routes = selected.map(expert => {
      requestedLoads[expert]++;
      const accepted = loads[expert] < capacity;
      if (accepted) loads[expert]++;
      return { expert, accepted, selectedWeight: probabilities[token][expert] / selectedMass, weight: 0, computation: accepted ? expertForward(input, expert) : null };
    });
    const kept = routes.filter(route => route.accepted);
    // Recompute from logits: a surviving route may have underflowed to probability 0.
    const keptWeights = kept.length ? temperatureSoftmax(kept.map(route => scores[token][route.expert])) : [];
    kept.forEach((route, i) => { route.weight = keptWeights[i]; });
    const output = [0, 1].map(d => routes.reduce((sum, route) => sum + route.weight * (route.computation?.output[d] ?? 0), 0));
    return { input, selected, routes, output, fullyDropped: kept.length === 0, activeParameters: 9 + 17 * kept.length };
  });
  return { scores, probabilities, loads, requestedLoads, tokens, totalParameters: 60, routerParameters: 9, expertParameters: 17 };
}

export const IMAGE_NOISE = [[-.8, .4, -.3, 1], [.6, -1, .8, -.5], [-.2, .7, -.6, .3], [1, -.4, .2, -.9]];
export const UNET_KERNEL = [[0, .1, 0], [.1, .6, .1], [0, .1, 0]];
function square(image: Matrix) {
  if (!image.length || image.some(row => row.length !== image.length || !row.every(Number.isFinite))) throw new RangeError('Нужна непустая квадратная карта');
}
/** Same-size convolution with zero padding, correlation convention. */
export function sameConvolution(image: Matrix, kernel: Matrix) {
  square(image); square(kernel);
  if (kernel.length % 2 !== 1) throw new RangeError('Нужен нечётный размер ядра');
  const radius = Math.floor(kernel.length / 2);
  return image.map((row, r) => row.map((_, c) => kernel.reduce((sum, kr, i) => sum + kr.reduce((part, weight, j) => part + weight * (image[r + i - radius]?.[c + j - radius] ?? 0), 0), 0)));
}
export function averagePool(image: Matrix) {
  square(image);
  if (image.length % 2) throw new RangeError('Pooling требует чётный размер');
  return Array.from({ length: image.length / 2 }, (_, r) => Array.from({ length: image.length / 2 }, (_, c) => (image[2 * r][2 * c] + image[2 * r][2 * c + 1] + image[2 * r + 1][2 * c] + image[2 * r + 1][2 * c + 1]) / 4));
}
export function nearestUpsample(image: Matrix) {
  square(image);
  return Array.from({ length: image.length * 2 }, (_, r) => Array.from({ length: image.length * 2 }, (_, c) => image[Math.floor(r / 2)][Math.floor(c / 2)]));
}
export function unetNoisePrediction(noisy: Matrix, time: number, skip = true) {
  image4(noisy); finite(time, 'Время');
  const encoder4 = sameConvolution(noisy, UNET_KERNEL).map(row => row.map(value => Math.tanh(value + .1 * time)));
  const down2 = averagePool(encoder4);
  const encoder2 = sameConvolution(down2, UNET_KERNEL).map(row => row.map(value => Math.tanh(value + .1 * time)));
  const down1 = averagePool(encoder2);
  const bottleneck = [[Math.tanh(.8 * down1[0][0] + .15 * time)]];
  const up2 = nearestUpsample(bottleneck);
  // Concatenated decoder channels [upsampled, encoder skip] feed a 1 × 1 convolution.
  const concat2 = up2.map((row, r) => row.map((value, c) => [value, skip ? encoder2[r][c] : 0]));
  const decoder2 = concat2.map(row => row.map(channels => Math.tanh(.6 * channels[0] + .4 * channels[1] + .1 * time)));
  const up4 = nearestUpsample(decoder2);
  const concat4 = up4.map((row, r) => row.map((value, c) => [value, skip ? encoder4[r][c] : 0]));
  const decoder4 = concat4.map(row => row.map(channels => Math.tanh(.5 * channels[0] + .5 * channels[1] + .05 * time)));
  const prediction = decoder4.map(row => row.map(value => .6 * value));
  return { encoder4, down2, encoder2, down1, bottleneck, up2, concat2, decoder2, up4, concat4, decoder4, prediction };
}

export const DIT_READOUT = [[.3, .2, .3, .2], [.2, -.2, -.2, .2]];
export function ditNoisePrediction(noisy: Matrix, time: number) {
  image4(noisy); finite(time, 'Время');
  const patchTrace = visionTransformerTrace(noisy);
  const timeEmbedding = [Math.sin(time * Math.PI / 2), Math.cos(time * Math.PI / 2) - 1];
  const conditioned = patchTrace.tokens.map(row => row.map((value, d) => value + .4 * timeEmbedding[d]));
  const attention = attentionTrace(projectTokens(conditioned, VISION_Q), projectTokens(conditioned, VISION_K), projectTokens(conditioned, VISION_V));
  const residual = conditioned.map((row, i) => row.map((value, d) => value + attention.output[i][d]));
  const hidden = projectTokens(residual, [[1, 0, .5], [0, 1, -.5]]).map(row => row.map(Math.tanh));
  const ffn = projectTokens(hidden, [[.2, 0], [0, .2], [.1, -.1]]);
  const outputTokens = residual.map((row, i) => row.map((value, d) => value + ffn[i][d]));
  const patchPredictions = projectTokens(outputTokens, DIT_READOUT);
  const prediction: Matrix = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  patchTrace.patches.forEach((patch, i) => patchPredictions[i].forEach((value, d) => { prediction[patch.row + Math.floor(d / 2)][patch.column + d % 2] = value; }));
  return { projected: patchTrace.projected, positions: patchTrace.positions, timeEmbedding, conditioned, attention, residual, hidden, ffn, outputTokens, patchPredictions, prediction };
}
export function imageDenoiserTrace(clean: Matrix, noise: Matrix, time: number, skip = true) {
  image4(clean); image4(noise);
  if (!Number.isFinite(time) || time < 0 || time > 1) throw new RangeError('Время в диапазоне 0…1');
  const alphaBar = 1 - .85 * time;
  const noisy = clean.map((row, r) => row.map((value, c) => Math.sqrt(alphaBar) * value + Math.sqrt(1 - alphaBar) * noise[r][c]));
  const unet = unetNoisePrediction(noisy, time, skip), dit = ditNoisePrediction(noisy, time);
  const mse = (prediction: Matrix) => prediction.reduce((sum, row, r) => sum + row.reduce((part, value, c) => part + (value - noise[r][c]) ** 2, 0), 0) / 16;
  const reconstruction = (prediction: Matrix) => noisy.map((row, r) => row.map((value, c) => (value - Math.sqrt(1 - alphaBar) * prediction[r][c]) / Math.sqrt(alphaBar)));
  return { alphaBar, noisy, unet, dit, unetMse: mse(unet.prediction), ditMse: mse(dit.prediction), unetReconstruction: reconstruction(unet.prediction), ditReconstruction: reconstruction(dit.prediction) };
}
