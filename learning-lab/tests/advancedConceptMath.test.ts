import test from 'node:test';
import assert from 'node:assert/strict';
import { normalDensity, normalLogDensity, normalScore, normalKL, reparameterize, gaussianVariational,
  adversarialLosses, noiseMarginal, discountedReturn, bellmanExample, twoNodeMessages } from '../src/advancedConceptMath.ts';

const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test('Gaussian density is normalized, uses standard deviation, and score matches a log-density derivative', () => {
  close(normalDensity(0), 1 / Math.sqrt(2 * Math.PI));
  close(normalDensity(2, 2, .25), 4 / Math.sqrt(2 * Math.PI)); // density may exceed one
  let area = 0;
  for (let i = 0; i < 16000; i++) area += normalDensity(-8 + (i + .5) * .001) * .001;
  close(area, 1, 1e-9);
  const x = 1.2, h = 1e-5;
  close((normalLogDensity(x + h, -.4, .7) - normalLogDensity(x - h, -.4, .7)) / (2 * h), normalScore(x, -.4, .7), 1e-8);
  assert.throws(() => normalDensity(0, 0, 0));
});
test('Gaussian KL has known values, is directed and vanishes only for matching distributions', () => {
  close(normalKL(0, 1), 0);
  close(normalKL(2, 1), 2);
  close(normalKL(0, 2), 1.5 - Math.log(2));
  assert.notEqual(normalKL(0, 2, 0, 1), normalKL(0, 1, 0, 2));
});
test('reparameterization preserves fixed epsilon and both parameter derivatives', () => {
  const mu = 1, logVariance = Math.log(4), epsilon = -.5, h = 1e-5;
  const result = reparameterize(mu, logVariance, epsilon);
  close(result.z, 0); close(result.sigma, 2); close(result.dMu, 1); close(result.dLogVariance, -.5);
  close((reparameterize(mu, logVariance + h, epsilon).z - reparameterize(mu, logVariance - h, epsilon).z) / (2 * h), result.dLogVariance, 1e-9);
});
test('exact scalar ELBO gap equals KL to the posterior, and tightens at the exact posterior', () => {
  const result = gaussianVariational(2, .3, .8, 1);
  close(result.posteriorMu, 1); close(result.posteriorSigma, Math.SQRT1_2);
  close(result.gap, result.klPosterior); assert.ok(result.gap > 0);
  const exact = gaussianVariational(2, 1, Math.SQRT1_2, 1);
  close(exact.gap, 0); close(exact.elbo, exact.logEvidence);
});
test('GAN generator objectives have different losses and saturated gradients at a strong discriminator', () => {
  const neutral = adversarialLosses(0);
  close(neutral.nonSaturating, Math.log(2)); close(neutral.minimax, -Math.log(2));
  close(neutral.nonSaturatingGradient, -.5); close(neutral.minimaxGradient, -.5);
  const strong = adversarialLosses(-1000);
  assert.ok(Number.isFinite(strong.nonSaturating)); close(strong.nonSaturating, 1000);
  close(strong.nonSaturatingGradient, -1); close(strong.minimaxGradient, 0);
});
test('forward diffusion marginal respects signal and variance at both endpoints', () => {
  const middle = noiseMarginal(2, .25, -1);
  close(middle.signal, 1); close(middle.variance, .75); close(middle.value, 1 - Math.sqrt(.75));
  close(noiseMarginal(2, 1, -9).value, 2); close(noiseMarginal(2, 0, -9).value, -9);
  assert.throws(() => noiseMarginal(2, 1.01, 1));
});
test('discounted return and terminal Bellman branch have independently known answers', () => {
  close(discountedReturn([1, 2, 4], .5).value, 3);
  close(discountedReturn([1, 2, 4], 0).value, 1);
  close(discountedReturn([1, 2, 4], 1).value, 7);
  close(bellmanExample(.75, 2, 10, .9, false).value, 8.25);
  close(bellmanExample(.75, 2, 10, .9, true).value, 1.5);
});
test('mean messages preserve isolates, ignore node ordering, and expose smoothing', () => {
  assert.deepEqual(twoNodeMessages(1, 3, true, 2), [[1, 3], [2, 2], [2, 2]]);
  assert.deepEqual(twoNodeMessages(1, 3, false, 2), [[1, 3], [1, 3], [1, 3]]);
  assert.deepEqual(twoNodeMessages(3, 1, true, 1).at(-1), twoNodeMessages(1, 3, true, 1).at(-1));
});
