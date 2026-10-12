import test from 'node:test';
import assert from 'node:assert/strict';
import { VISION_IMAGE, IMAGE_NOISE, imagePatches, visionTransformerTrace, expertForward, mixtureExpertsTrace, sameConvolution, averagePool, nearestUpsample, unetNoisePrediction, ditNoisePrediction, imageDenoiserTrace } from '../src/visionRoutingMath.ts';

const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const closeGrid = (actual: number[][], expected: number[][]) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((row, r) => { assert.equal(row.length, expected[r].length); row.forEach((value, c) => close(value, expected[r][c])); });
};
const zeros = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);

test('MoE renormalizes surviving routes even after probability underflow', () => {
  const trace = mixtureExpertsTrace([[0, 2000], [2000, 0]], 2, 1);
  const second = trace.tokens[1];
  assert.equal(second.fullyDropped, false);
  assert.ok(second.output.every(Number.isFinite));
  close(second.routes.reduce((sum, route) => sum + route.weight, 0), 1);
  second.routes.filter(route => route.accepted).forEach(route => closeGrid([second.output], [route.computation!.output]));
});

test('ViT patch coordinates and flattening preserve every original pixel exactly once', () => {
  const image = Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, c) => r * 4 + c));
  const patches = imagePatches(image);
  assert.deepEqual(patches.map(p => [p.row, p.column]), [[0, 0], [0, 2], [2, 0], [2, 2]]);
  assert.deepEqual(patches.map(p => p.pixels), [[0, 1, 4, 5], [2, 3, 6, 7], [8, 9, 12, 13], [10, 11, 14, 15]]);
  assert.deepEqual([...patches.flatMap(p => p.pixels)].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i));
  closeGrid(visionTransformerTrace(image, 0).projected, [[5, 0], [9, 0], [21, 0], [25, 0]]);
});

test('ViT uniform tokens have analytical uniform attention and known residual output', () => {
  const image = zeros().map(row => row.map(() => 1));
  const trace = visionTransformerTrace(image, 0);
  closeGrid(trace.projected, [[2, 0], [2, 0], [2, 0], [2, 0]]);
  closeGrid(trace.attention.weights, Array.from({ length: 4 }, () => [.25, .25, .25, .25]));
  closeGrid(trace.attention.scaledScores, Array.from({ length: 4 }, () => Array(4).fill(4 / Math.sqrt(2))));
  closeGrid(trace.output, Array.from({ length: 4 }, () => [3.2, -.4]));
  close(trace.pooled[0], 3.2); close(trace.pooled[1], -.4);
});

test('ViT input editing first affects one patch; position affects attention and no inputs mutate', () => {
  const image = structuredClone(VISION_IMAGE), before = structuredClone(image);
  const baseline = visionTransformerTrace(image, 0);
  image[3][3] = .7;
  const edited = visionTransformerTrace(image, 0);
  assert.deepEqual(edited.projected.slice(0, 3), baseline.projected.slice(0, 3));
  assert.notDeepEqual(edited.projected[3], baseline.projected[3]);
  assert.notDeepEqual(edited.output[0], baseline.output[0]);
  const positioned = visionTransformerTrace(before, 1);
  assert.notDeepEqual(positioned.attention.weights, baseline.attention.weights);
  assert.deepEqual(before, VISION_IMAGE);
  assert.equal(image[3][3], .7);
});

test('MoE FFN known manual output and weighted top-2 mixture', () => {
  closeGrid([expertForward([1, 0], 0).output], [[.825, -.225]]);
  closeGrid([expertForward([1, 0], 2).output], [[.1, .64]]);
  const trace = mixtureExpertsTrace([[1, 0]], 2, 1);
  assert.deepEqual(trace.tokens[0].selected, [0, 2]);
  const weight = 1 / (1 + Math.exp(-.7));
  close(trace.tokens[0].routes[0].weight, weight);
  close(trace.tokens[0].output[0], weight * .825 + (1 - weight) * .1);
  close(trace.tokens[0].output[1], weight * -.225 + (1 - weight) * .64);
  assert.equal(trace.totalParameters, 60);
  assert.equal(trace.tokens[0].activeParameters, 43);
  assert.equal(mixtureExpertsTrace([[1, 0]], 1, 1).tokens[0].activeParameters, 26);
});

test('MoE equal scores choose expert ids in ascending order; capacity obeys token order', () => {
  const trace = mixtureExpertsTrace([[0, 0], [0, 0]], 2, 1);
  assert.deepEqual(trace.scores, [[0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(trace.tokens.map(t => t.selected), [[0, 1], [0, 1]]);
  assert.deepEqual(trace.loads, [1, 1, 0]);
  assert.deepEqual(trace.requestedLoads, [2, 2, 0]);
  closeGrid([trace.tokens[0].output], [[.1175, .0125]]);
  assert.deepEqual(trace.tokens[1].output, [0, 0]);
  assert.equal(trace.tokens[1].fullyDropped, true);
  assert.equal(trace.tokens[1].activeParameters, 9);
  assert.ok(trace.tokens[1].routes.every(route => route.computation === null && route.weight === 0));
});

test('MoE partially overflowing top-2 renormalizes the remaining route without rerouting', () => {
  const trace = mixtureExpertsTrace([[1, 0], [-1, 0]], 2, 1);
  const second = trace.tokens[1];
  assert.deepEqual(second.selected, [1, 2]);
  assert.deepEqual(second.routes.map(route => route.accepted), [true, false]);
  assert.deepEqual(second.routes.map(route => route.weight), [1, 0]);
  closeGrid([second.output], [expertForward([-1, 0], 1).output]);
  assert.deepEqual(trace.loads, [1, 1, 1]);
  const dropped = mixtureExpertsTrace([[1, 0]], 2, 0).tokens[0];
  assert.deepEqual(dropped.output, [0, 0]);
  assert.ok(dropped.routes.every(route => Number.isFinite(route.weight)));
});

test('U-Net zero padding, mean downsampling, and nearest upsampling match independent fixtures', () => {
  const input = [[1, 2], [3, 4]], saved = structuredClone(input);
  closeGrid(sameConvolution(input, [[1, 1, 1], [1, 1, 1], [1, 1, 1]]), [[10, 10], [10, 10]]);
  closeGrid(sameConvolution(input, [[0, 0, 0], [0, 1, 2], [0, 0, 0]]), [[5, 2], [11, 4]]);
  closeGrid(averagePool([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]), [[3.5, 5.5], [11.5, 13.5]]);
  closeGrid(nearestUpsample([[1, 2], [3, 4]]), [[1, 1, 2, 2], [1, 1, 2, 2], [3, 3, 4, 4], [3, 3, 4, 4]]);
  assert.deepEqual(input, saved);
});

test('U-Net has real resolution changes and skip channels contribute to prediction', () => {
  closeGrid(unetNoisePrediction(zeros(), 0).prediction, zeros());
  const input = structuredClone(VISION_IMAGE), saved = structuredClone(input);
  const enabled = unetNoisePrediction(input, .6), disabled = unetNoisePrediction(input, .6, false);
  assert.equal(enabled.encoder4.length, 4); assert.equal(enabled.down2.length, 2); assert.equal(enabled.down1.length, 1); assert.equal(enabled.up2.length, 2); assert.equal(enabled.up4.length, 4);
  close(enabled.concat2[0][0][1], enabled.encoder2[0][0]);
  close(enabled.concat4[1][2][1], enabled.encoder4[1][2]);
  assert.ok(disabled.concat4.flat().every(channels => channels[1] === 0));
  assert.ok(disabled.concat2.flat().every(channels => channels[1] === 0));
  assert.notDeepEqual(enabled.prediction, disabled.prediction);
  assert.deepEqual(input, saved);
});

test('both denoisers use timestep conditioning even when the noisy input is fixed', () => {
  const input = structuredClone(VISION_IMAGE), saved = structuredClone(input);
  assert.notDeepEqual(unetNoisePrediction(input, .2).prediction, unetNoisePrediction(input, .8).prediction);
  assert.notDeepEqual(ditNoisePrediction(input, .2).prediction, ditNoisePrediction(input, .8).prediction);
  const dit = ditNoisePrediction(input, 1);
  closeGrid([dit.timeEmbedding], [[1, -1]]);
  dit.attention.weights.forEach(row => close(row.reduce((sum, value) => sum + value, 0), 1));
  // Readout fixture: its first pixel is .3*y1 + .2*y2, second .2*y1 -.2*y2.
  close(dit.prediction[0][0], .3 * dit.outputTokens[0][0] + .2 * dit.outputTokens[0][1]);
  close(dit.prediction[3][3], .2 * dit.outputTokens[3][0] + .2 * dit.outputTokens[3][1]);
  assert.deepEqual(input, saved);
});

test('denoising target and one-step inversion use shared diffusion input and true MSE', () => {
  const clean = structuredClone(VISION_IMAGE), noise = structuredClone(IMAGE_NOISE), saved = { clean: structuredClone(clean), noise: structuredClone(noise) };
  const trace = imageDenoiserTrace(clean, noise, .6);
  close(trace.alphaBar, .49);
  close(trace.noisy[0][0], -.8 * Math.sqrt(.51));
  close(trace.noisy[0][2], .7 - .3 * Math.sqrt(.51));
  const uErrors = trace.unet.prediction.flat().map((value, i) => (value - noise.flat()[i]) ** 2);
  close(trace.unetMse, uErrors.reduce((sum, value) => sum + value, 0) / 16);
  close(trace.ditReconstruction[0][2], (trace.noisy[0][2] - Math.sqrt(.51) * trace.dit.prediction[0][2]) / .7);
  closeGrid(imageDenoiserTrace(clean, noise, 0).noisy, clean);
  closeGrid(imageDenoiserTrace(clean, noise, 0).unetReconstruction, clean);
  assert.deepEqual({ clean, noise }, saved);
});

test('invalid image, capacity, top-k, and timestep inputs are rejected', () => {
  assert.throws(() => visionTransformerTrace([[1]]), RangeError);
  assert.throws(() => visionTransformerTrace(zeros(), NaN), RangeError);
  assert.throws(() => mixtureExpertsTrace([[1, 2]], 2, -1), RangeError);
  assert.throws(() => mixtureExpertsTrace([[1, 2]], 3 as 2), RangeError);
  assert.throws(() => mixtureExpertsTrace([[Infinity, 2]]), RangeError);
  assert.throws(() => averagePool([[1]]), RangeError);
  assert.throws(() => imageDenoiserTrace(VISION_IMAGE, IMAGE_NOISE, 1.1), RangeError);
});
