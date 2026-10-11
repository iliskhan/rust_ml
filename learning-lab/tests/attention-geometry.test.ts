import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionContributions, attentionGeometryDomain, selfAttentionChallenge } from '../src/attentionGeometryMath.ts';
import { attentionTrace } from '../src/transformerMath.ts';

test('triangle contributions locate the weighted mixture at (0.5, 1)', () => {
  const values = [[0, 0], [2, 0], [0, 2]];
  const trace = attentionTrace([[1, 0]], [[Math.log(.25), 0], [Math.log(.25), 0], [Math.log(.5), 0]], values, { scale: false });
  assert.deepEqual(trace.weights[0], [.25, .25, .5]);
  assert.deepEqual(attentionContributions(values, trace.weights[0]), [[0, 0], [.5, 0], [0, 1]]);
  assert.deepEqual(trace.output[0], [.5, 1]);
  const domain = attentionGeometryDomain([...values, trace.output[0]]);
  assert.ok([...values, trace.output[0]].flat().every(value => value > domain.min && value < domain.max));
});

test('masked values contribute exactly zero even when their magnitude is large', () => {
  const trace = attentionTrace([[1, 0]], [[1, 0], [100, 0], [2, 0]], [[-2, -3], [999, 999], [4, -1]], { allowedKeys: [true, false, true] });
  const contributions = attentionContributions(trace.v, trace.weights[0]);
  assert.deepEqual(contributions[1], [0, 0]);
  for (let d = 0; d < 2; d++) assert.equal(contributions.reduce((sum, row) => sum + row[d], 0), trace.output[0][d]);
});

test('zero and negative vectors retain a finite square domain including the origin', () => {
  for (const points of [[[0, 0]], [[-4, -2], [-1, -9]], [[-3, 5], [8, -2]]]) {
    const domain = attentionGeometryDomain(points);
    assert.ok(Number.isFinite(domain.min) && Number.isFinite(domain.max) && domain.min < domain.max);
    assert.ok([...points.flat(), 0].every(value => value > domain.min && value < domain.max));
  }
});

test('practice rejects an unmasked start and rounded near-zero weights, accepts actual causal exclusion', () => {
  const q = [[1, 0], [0, 1], [1, 1]], k = [[100, 0], [0, 0], [-100, 0]], v = [[1, 2], [-2, 3], [4, -5]];
  const unmasked = attentionTrace(q, k, v, { temperature: .2 });
  assert.equal(selfAttentionChallenge(unmasked, 0, false).passed, false);
  assert.equal(selfAttentionChallenge(unmasked, 0, true).passed, false);
  const masked = attentionTrace(q, k, v, { causal: true });
  assert.equal(selfAttentionChallenge(masked, 0, true).passed, true);
  assert.equal(selfAttentionChallenge(masked, 1, true).passed, false);
});
