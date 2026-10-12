import test from 'node:test';
import assert from 'node:assert/strict';
import { policyGradientBandit } from '../src/rlMath.ts';
import { gradientHistogram, policyGradientMoments, policyGradientSamples } from '../src/policyVarianceMath.ts';

test('baseline leaves expected REINFORCE gradient equal to finite difference of reward', () => {
  for (const theta of [-3, 0, 2]) for (const baseline of [-1, .4, 2]) {
    const rewards: [number, number] = [-.3, 1.7], h = 1e-5;
    const derivative = (policyGradientBandit(theta + h, rewards, 0).expected - policyGradientBandit(theta - h, rewards, 0).expected) / (2 * h);
    const result = policyGradientMoments(theta, rewards, baseline, 16);
    assert.ok(Math.abs(result.mean - derivative) < 1e-10);
    assert.ok(Math.abs(result.mean - result.gradient) < 1e-14);
  }
});
test('known moments and sample mean variance; arbitrary baseline can make variance worse', () => {
  const a = policyGradientMoments(0, [0, 1], 0, 1), b = policyGradientMoments(0, [0, 1], 0, 64);
  assert.equal(a.mean, .25); assert.equal(a.variance, .0625); assert.equal(b.meanVariance, .0625 / 64);
  assert.equal(policyGradientMoments(0, [0, 1], .5, 1).variance, 0);
  assert.ok(policyGradientMoments(0, [0, 1], 2, 1).variance > a.variance);
});
test('binary deterministic bandit optimal baseline equalizes both action estimates', () => {
  const result = policyGradientMoments(.7, [-.5, 1.3], 0, 1);
  const optimal = policyGradientMoments(.7, [-.5, 1.3], result.optimalBaseline, 1);
  assert.ok(Math.abs(optimal.leftEstimate - optimal.rightEstimate) < 1e-14);
  assert.ok(optimal.variance < 1e-28);
});
test('repeated samples are reproducible and approach the known mean and variance', () => {
  const a = policyGradientSamples(.7, [0, 1], 0, 16, 71, 6000);
  assert.deepEqual(a, policyGradientSamples(.7, [0, 1], 0, 16, 71, 6000));
  assert.notDeepEqual(a.means, policyGradientSamples(.7, [0, 1], 0, 16, 72, 6000).means);
  assert.ok(Math.abs(a.empiricalMean - a.gradient) < .003);
  assert.ok(Math.abs(a.empiricalVariance - a.meanVariance) < .0002);
  const zeroNoise = policyGradientSamples(0, [0, 1], .5, 64, 71);
  assert.ok(zeroNoise.means.every(value => value === .25));
});
test('histogram counts every endpoint and rejects invalid experiment inputs', () => {
  assert.deepEqual(gradientHistogram([0, .1, .5, 1], [0, 1], 2).map(row => row.count), [2, 2]);
  assert.throws(() => gradientHistogram([2], [0, 1]));
  assert.throws(() => policyGradientMoments(0, [0, 1], 0, 0));
  assert.throws(() => policyGradientSamples(0, [0, 1], 0, 16, NaN));
});
