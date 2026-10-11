import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalSamples, gaussianKl, vaeTrace, vaeBatchGradient, vaeExpected, vaeTruePosterior, vaeMarginalNll,
  vaeTrainStep, VAE_INITIAL, VAE_DATA, gradientStep, binaryCrossEntropy, sigmoid,
  networkTrace, ganDiscriminatorGradient, ganGeneratorGradient, initialGan, ganTrainStep,
  ganMetrics, empiricalWasserstein, GAN_DATA, EVALUATION_NOISE,
} from '../src/vaeGanMath.ts';

const close = (a: number, b: number, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function checkGradient(parameters: number[], gradient: number[], objective: (p: number[]) => number) {
  parameters.forEach((_, i) => {
    const plus = [...parameters], minus = [...parameters], h = 1e-5;
    plus[i] += h; minus[i] -= h;
    const numerical = (objective(plus) - objective(minus)) / (2 * h);
    close(gradient[i], numerical, 2e-7 * Math.max(1, Math.abs(numerical)));
  });
}

test('VAE hand-computed Gaussian KL and one reparameterized sample', () => {
  close(gaussianKl(0, 0), 0);
  close(gaussianKl(2, Math.log(4)), (7 - Math.log(4)) / 2);
  const trace = vaeTrace([0, 0, 0, 0, 0, 0], 2, 0.5, 1, 1);
  close(trace.z, 0.5); close(trace.nll, 2.9189385332046727);
  assert.deepEqual(trace.gradient, [0, 0, 0, 0, -1, -2]);
  assert.throws(() => vaeTrace(VAE_INITIAL, 1, 0, 1, 0), RangeError);
});

test('all six VAE gradients match central differences for sample and averaged batch', () => {
  const parameters = [0.7, -0.2, 0.12, -0.6, 1.1, 0.15];
  for (const beta of [0, 1, 3]) {
    const trace = vaeTrace(parameters, -0.8, 0.6, beta);
    checkGradient(parameters, trace.gradient, p => vaeTrace(p, -0.8, 0.6, beta).loss);
    const data = [-0.9, 0.2, 1.5], noise = [0.3, -1.1, 0.6];
    const batch = vaeBatchGradient(parameters, data, noise, beta);
    checkGradient(parameters, batch.gradient, p => vaeBatchGradient(p, data, noise, beta).loss);
  }
});

test('exact negative ELBO equals marginal NLL plus KL to the true posterior', () => {
  const p = [0.7, 0.1, -0.15, -0.7, 1.2, -0.3], x = 0.9;
  const approximate = vaeTrace(p, x, 0);
  const posterior = vaeTruePosterior(p, x);
  const posteriorKl = 0.5 * (Math.log(posterior.variance / approximate.sd ** 2) + (approximate.sd ** 2 + (approximate.mu - posterior.mu) ** 2) / posterior.variance - 1);
  close(vaeExpected(p, [x]).loss, vaeMarginalNll(p, x) + posteriorKl);
  assert.ok(posteriorKl > 0);
  const exactEncoder = [1.2 / 1.6, 1.2 * 0.3 / 1.6, 0, Math.log(0.16 / 1.6), 1.2, -0.3];
  close(vaeExpected(exactEncoder, [x]).loss, vaeMarginalNll(exactEncoder, x));
});

test('seeded noise is deterministic, finite and approximately standard normal', () => {
  assert.deepEqual(normalSamples(100, 7), normalSamples(100, 7));
  assert.notDeepEqual(normalSamples(10, 7), normalSamples(10, 8));
  const noise = normalSamples(20000, 29);
  const mean = noise.reduce((sum, x) => sum + x, 0) / noise.length;
  const variance = noise.reduce((sum, x) => sum + (x - mean) ** 2, 0) / noise.length;
  assert.ok(Math.abs(mean) < 0.03 && Math.abs(variance - 1) < 0.04);
  assert.throws(() => normalSamples(-1), RangeError);
});

test('VAE SGD really changes parameters and lowers exact expected loss on the fixed dataset', () => {
  let parameters = [...VAE_INITIAL];
  const start = vaeExpected(parameters).loss;
  for (let step = 0; step < 500; step++) parameters = vaeTrainStep(parameters, step, 0.015, 1).parameters;
  const end = vaeExpected(parameters).loss;
  assert.ok(end < start * 0.6, `${end} should improve on ${start}`);
  assert.ok(parameters.every(Number.isFinite));
  assert.notDeepEqual(parameters, VAE_INITIAL);
  assert.deepEqual(vaeTrainStep(VAE_INITIAL, 17, 0.015, 1), vaeTrainStep(VAE_INITIAL, 17, 0.015, 1));
  assert.equal(VAE_DATA.length, 64);
});

test('stable BCE handles very confident correct and incorrect predictions', () => {
  close(binaryCrossEntropy(0, 1), Math.LN2);
  close(binaryCrossEntropy(1000, 0), 1000);
  close(binaryCrossEntropy(-1000, 1), 1000);
  close(binaryCrossEntropy(1000, 1), 0);
  close(binaryCrossEntropy(-1000, 0), 0);
  assert.ok(binaryCrossEntropy(40, 1) > 0);
  close(sigmoid(-1000), 0); close(sigmoid(1000), 1);
});

test('all 13 neural parameters and input derivative match finite differences', () => {
  const p = initialGan().generator, x = 0.7, trace = networkTrace(p, x);
  checkGradient(p, trace.gradient, q => networkTrace(q, x).output);
  close(trace.inputGradient, (networkTrace(p, x + 1e-5).output - networkTrace(p, x - 1e-5).output) / 2e-5);
});

test('GAN zero discriminator has analytical losses and gives G no input gradient', () => {
  const generator = initialGan().generator, discriminator = Array(13).fill(0), noise = [-1, 0, 1];
  close(ganDiscriminatorGradient(generator, discriminator, [-2, 2], noise).loss, 2 * Math.LN2);
  close(ganGeneratorGradient(generator, discriminator, noise).loss, Math.LN2);
  close(ganGeneratorGradient(generator, discriminator, noise, 'minimax').loss, -Math.LN2);
  assert.deepEqual(ganGeneratorGradient(generator, discriminator, noise).gradient, Array(13).fill(0));
});

test('all D gradients and both G objectives match independent central differences', () => {
  const { generator, discriminator } = initialGan(), noise = [-1.3, 0.4, 1.1], real = [-1.4, 1.2];
  checkGradient(discriminator, ganDiscriminatorGradient(generator, discriminator, real, noise).gradient,
    d => ganDiscriminatorGradient(generator, d, real, noise).loss);
  for (const objective of ['non-saturating', 'minimax'] as const) {
    checkGradient(generator, ganGeneratorGradient(generator, discriminator, noise, objective).gradient,
      g => ganGeneratorGradient(g, discriminator, noise, objective).loss);
  }
});

test('alternating updates freeze the other network, are deterministic, and stay finite', () => {
  const initial = initialGan();
  const d = ganTrainStep(initial, 'D', 0.03);
  assert.deepEqual(d.state.generator, initial.generator);
  assert.notDeepEqual(d.state.discriminator, initial.discriminator);
  const g = ganTrainStep(d.state, 'G', 0.03);
  assert.deepEqual(g.state.discriminator, d.state.discriminator);
  assert.notDeepEqual(g.state.generator, d.state.generator);
  assert.deepEqual(ganTrainStep(initial, 'D', 0.03), d);
  let state = initial;
  for (let step = 0; step < 500; step++) {
    state = ganTrainStep(state, 'D', 0.06).state;
    state = ganTrainStep(state, 'D', 0.06).state;
    state = ganTrainStep(state, 'G', 0.06).state;
  }
  const metrics = ganMetrics(state);
  assert.ok([metrics.dLoss, metrics.gLoss, metrics.distance, ...state.generator, ...state.discriminator].every(Number.isFinite));
  assert.ok(metrics.distance < ganMetrics(initial).distance);
  assert.equal(GAN_DATA.length, EVALUATION_NOISE.length);
});

test('sample W1 catches missing modes even when discriminator scores can be uninformative', () => {
  close(empiricalWasserstein([-1, 1], [1, -1]), 0);
  close(empiricalWasserstein([-1, 1], [-1, -1]), 1);
  close(empiricalWasserstein([0, 1], [2, 3]), 2);
  assert.throws(() => empiricalWasserstein([], []), RangeError);
  assert.ok(ganMetrics(initialGan(true)).leftFraction > 0.99);
});

test('step safeguards clip norm rather than coordinates and reject nonfinite updates', () => {
  const result = gradientStep([1, 2], [30, 40], 0.1);
  close(result.parameters[0], 0.4); close(result.parameters[1], 1.2);
  assert.equal(result.clipped, true);
  assert.throws(() => gradientStep([0], [Infinity], 0.1), RangeError);
});
