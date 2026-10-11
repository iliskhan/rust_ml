import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diffusionSchedule, forwardNoise, forwardTrajectory, diffusionRandom, posteriorParameters, ddpmStep, ddimStep,
  initialDenoiser, predictEpsilon, denoiserLossGradient, diffusionExamples, initialTraining, trainDenoiser,
  evaluationLoss, estimateClean, optimalEpsilon, noisyDataDensity, normalDensity, guidedEpsilon,
  diffusionTimeGrid, sampleTrajectory, sampleDistribution, diffusionHistogram, DENOISER_PARAMETERS,
} from '../src/diffusionMath.ts';
import type { DiffusionSchedule } from '../src/diffusionMath.ts';

const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≉ ${expected}`);
const twoSteps: DiffusionSchedule = { kind: 'linear', steps: 2, beta: [0, .2, .3], alpha: [1, .8, .7], alphaBar: [1, .8, .56] };

test('both schedules have explicit clean endpoint and consistent decreasing cumulative alpha', () => {
  for (const kind of ['linear', 'cosine'] as const) {
    const s = diffusionSchedule(kind);
    assert.equal(s.beta.length, 65); assert.equal(s.alphaBar[0], 1);
    for (let t = 1; t <= s.steps; t++) {
      assert.ok(s.beta[t] > 0 && s.beta[t] <= .25);
      close(s.alpha[t], 1 - s.beta[t]);
      close(s.alphaBar[t], s.alpha[t] * s.alphaBar[t - 1]);
      assert.ok(s.alphaBar[t] < s.alphaBar[t - 1] && s.alphaBar[t] > 0);
    }
    assert.ok(s.alphaBar[64] < .01);
  }
  close(diffusionSchedule('linear').beta[1], .001);
  close(diffusionSchedule('linear').beta[64], .18);
  const f = (t: number) => Math.cos((t / 64 + .008) / 1.008 * Math.PI / 2) ** 2;
  close(diffusionSchedule('cosine').beta[1], 1 - f(1) / f(0));
  close(diffusionSchedule('cosine').beta[64], .25);
  assert.throws(() => diffusionSchedule('linear', 1), RangeError);
});

test('forward marginal and reconstruction use cumulative variance, including t=0', () => {
  close(forwardNoise(2, -1, 2, twoSteps), 2 * Math.sqrt(.56) - Math.sqrt(.44));
  assert.equal(forwardNoise(2, 900, 0, twoSteps), 2);
  for (const t of [1, 2]) close(estimateClean(forwardNoise(-1.2, .7, t, twoSteps), .7, t, twoSteps), -1.2);
  assert.throws(() => estimateClean(1, 2, 0, twoSteps), RangeError);
  assert.throws(() => forwardNoise(1, 2, 3, twoSteps), RangeError);
});

test('posterior matches independent Gaussian conditioning arithmetic, with zero final variance', () => {
  const posterior = posteriorParameters(.4, -1.2, 2, twoSteps);
  close(posterior.variance, .3 * .2 / .44);
  close(posterior.mean, Math.sqrt(.8) * .3 / .44 * -1.2 + Math.sqrt(.7) * .2 / .44 * .4);
  close(posteriorParameters(.4, -1.2, 1, twoSteps).mean, -1.2);
  assert.equal(posteriorParameters(.4, -1.2, 1, twoSteps).variance, 0);
  const xt = forwardNoise(-1.2, .7, 2, twoSteps), actual = ddpmStep(xt, .7, 2, twoSteps, 2);
  close(actual.x0, -1.2);
  close(actual.mean, (xt - .3 / Math.sqrt(.44) * .7) / Math.sqrt(.7));
  close(actual.next, actual.mean + 2 * Math.sqrt(.3 * .2 / .44));
  assert.deepEqual(ddpmStep(.6, .7, 1, twoSteps, 1000), ddpmStep(.6, .7, 1, twoSteps, -1000));
});

test('DDIM eta=0 reconstructs a fixed-noise marginal and is not DDPM with z=0', () => {
  const xt = forwardNoise(-1.2, .7, 2, twoSteps);
  close(ddimStep(xt, .7, 2, 1, twoSteps).next, forwardNoise(-1.2, .7, 1, twoSteps));
  close(ddimStep(xt, .7, 2, 0, twoSteps).next, -1.2);
  assert.ok(Math.abs(ddimStep(xt, .7, 2, 1, twoSteps).next - ddpmStep(xt, .7, 2, twoSteps).next) > .01);
  assert.throws(() => ddimStep(xt, .7, 2, 2, twoSteps), RangeError);
});

test('seeded forward Markov path follows one-step equation, not a fixed epsilon trajectory', () => {
  const s = diffusionSchedule(), path = forwardTrajectory(1.5, s, 11), random = diffusionRandom(11);
  close(path[1], Math.sqrt(s.alpha[1]) * 1.5 + Math.sqrt(s.beta[1]) * random.normal());
  close(path[2], Math.sqrt(s.alpha[2]) * path[1] + Math.sqrt(s.beta[2]) * random.normal());
  assert.deepEqual(path, forwardTrajectory(1.5, s, 11));
  assert.notDeepEqual(path, forwardTrajectory(1.5, s, 12));
});

test('known-mixture optimal epsilon equals negative marginal score times noise standard deviation', () => {
  const s = diffusionSchedule(), delta = 1e-5;
  close(normalDensity(0, 0, 1), 1 / Math.sqrt(2 * Math.PI));
  for (const t of [1, 16, 40, 64]) for (const x of [-2, -.3, 0, .8, 2]) {
    const score = (Math.log(noisyDataDensity(x + delta, t, s)) - Math.log(noisyDataDensity(x - delta, t, s))) / (2 * delta);
    close(optimalEpsilon(x, t, s), -Math.sqrt(1 - s.alphaBar[t]) * score, 1e-7);
  }
  assert.equal(optimalEpsilon(2, 0, s), 0);
  close(guidedEpsilon(.2, 15, s, 1, 0).guided, optimalEpsilon(.2, 15, s));
  close(guidedEpsilon(.2, 15, s, 1, 1).guided, optimalEpsilon(.2, 15, s, 1));
  close(guidedEpsilon(.2, 15, s, 1, 2).guided, 2 * optimalEpsilon(.2, 15, s, 1) - optimalEpsilon(.2, 15, s));
});

test('all 146 analytic MLP gradients match central finite differences of a separate MSE calculation', () => {
  const s = diffusionSchedule(), model = initialDenoiser();
  const examples = [{ x0: 1.5, xt: -.4, t: 4, epsilon: 1.2 }, { x0: -1.5, xt: 1.7, t: 39, epsilon: -.7 }];
  const { gradient, loss } = denoiserLossGradient(model, examples, s);
  const mse = () => examples.reduce((sum, e) => sum + (predictEpsilon(model, e.xt, e.t, s) - e.epsilon) ** 2, 0) / examples.length;
  close(loss, mse()); assert.equal(gradient.length, DENOISER_PARAMETERS);
  const delta = 1e-5;
  for (let j = 0; j < gradient.length; j++) {
    const original = model.weights[j];
    model.weights[j] = original + delta; const upper = mse();
    model.weights[j] = original - delta; const lower = mse();
    model.weights[j] = original;
    close(gradient[j], (upper - lower) / (2 * delta), 1e-7);
  }
  assert.throws(() => denoiserLossGradient(model, [], s), RangeError);
});

test('MLP forward has the stated feature scale, tanh, output bias and trainable skip', () => {
  const model = { weights: Array(DENOISER_PARAMETERS).fill(0) as number[] }, s = diffusionSchedule();
  model.weights[0] = 1; // x_t / 2
  model.weights[1] = 2; // 2t/T - 1
  model.weights[2] = 3; // sin(pi*t/T)
  model.weights[3] = 4; // cos(pi*t/T)
  model.weights[4] = .5; model.weights[5] = 2;
  model.weights[DENOISER_PARAMETERS - 2] = 3;
  model.weights[DENOISER_PARAMETERS - 1] = 4;
  close(predictEpsilon(model, 2, 32, s), 10 + 2 * Math.tanh(4.5));
  close(predictEpsilon(model, 2, 64, s), 10 + 2 * Math.tanh(-.5));
});

test('Adam updates real weights, is immutable/reproducible across chunks, and improves this seeded evaluation', () => {
  const s = diffusionSchedule(), initial = initialTraining(s), before = structuredClone(initial);
  const trained = trainDenoiser(initial, s, 300), split = trainDenoiser(trainDenoiser(initial, s, 100), s, 200);
  assert.deepEqual(initial, before);
  assert.deepEqual(trained, split);
  assert.notDeepEqual(trained.model, initial.model);
  assert.equal(trained.updates, 300);
  assert.equal(trained.history.length, 4);
  assert.ok(evaluationLoss(trained.model, s) < evaluationLoss(initial.model, s) * .8);
  assert.throws(() => trainDenoiser(initial, s, 2001), RangeError);
  assert.throws(() => trainDenoiser(initial, s, 1, 0), RangeError);
  const batch = diffusionExamples(s, 64, 441);
  assert.ok(batch.examples.every(e => e.t >= 1 && e.t <= 64));
  assert.deepEqual(batch, diffusionExamples(s, 64, 441));
});

test('DDPM changes with reverse noise seed; DDIM depends only on fixed xT, weights and time grid', () => {
  const s = diffusionSchedule(), predict = (x: number, t: number) => optimalEpsilon(x, t, s);
  assert.deepEqual(sampleTrajectory(predict, s, 'ddim', .3, 12, 16), sampleTrajectory(predict, s, 'ddim', .3, 901, 16));
  assert.notDeepEqual(sampleTrajectory(predict, s, 'ddpm', .3, 12), sampleTrajectory(predict, s, 'ddpm', .3, 901));
  assert.equal(sampleTrajectory(predict, s, 'ddpm', .3, 12).length, 65);
  assert.equal(sampleTrajectory(predict, s, 'ddim', .3, 12, 16).length, 17);
  assert.deepEqual(diffusionTimeGrid(64, 4), [64, 48, 32, 16, 0]);
  assert.deepEqual(sampleDistribution(predict, s, 'ddpm', 32, 5), sampleDistribution(predict, s, 'ddpm', 32, 5));
  assert.ok(sampleDistribution(predict, s, 'ddpm', 32, 5).every(Number.isFinite));
});

test('seeded trained denoiser produces both modes on unseen DDPM sampling seeds for both schedules', () => {
  for (const kind of ['linear', 'cosine'] as const) {
    const s = diffusionSchedule(kind), trained = trainDenoiser(initialTraining(s), s, 2000);
    const samples = sampleDistribution((x, t) => predictEpsilon(trained.model, x, t, s), s, 'ddpm', 256, 120);
    assert.ok(samples.every(Number.isFinite));
    assert.ok(samples.filter(x => x < 0).length > 80);
    assert.ok(samples.filter(x => x > 0).length > 80);
    assert.ok(samples.filter(x => Math.abs(Math.abs(x) - 1.5) < .6).length > 205);
  }
});

test('histogram accounts for outside samples without renormalizing visible mass', () => {
  const h = diffusionHistogram([-2, -1, 0, 1, 2, 3], -2, 2, 4);
  assert.deepEqual(h.counts, [1, 1, 1, 2]);
  assert.equal(h.outside, 1);
  close(h.density.reduce((sum, y) => sum + y * h.width, 0), 5 / 6);
  assert.equal(diffusionHistogram([]).outside, 0);
});
