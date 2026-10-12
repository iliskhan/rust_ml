import test from 'node:test';
import assert from 'node:assert/strict';
import { DPO_REFERENCE, dpoTrace, trainDpo, frontierSoftmax, quantizeWeights, quantizationWeights, initialQuantAdapter, quantAdapterTrace, trainQuantAdapter, QUANT_HELDOUT, speculativeKernel, speculativeSample, speculativeHistogram, speculativeBlock, SPEC_TARGET, contextTrace, contextTrainingLoss, trainContext, contextEvaluation, initialMaskedModel, maskedObjective, trainMaskedModel, maskedPrediction, unmaskStep, autoregressiveCycle, MASK_SEQUENCES } from '../src/inferenceFrontierMath.ts';
const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function gradcheck(parameters: number[], gradient: number[], f: (p: number[]) => number) {
  parameters.forEach((_, i) => { const lo = [...parameters], hi = [...parameters]; lo[i] -= 1e-5; hi[i] += 1e-5; close(gradient[i], (f(hi) - f(lo)) / 2e-5, 2e-7); });
}
test('DPO log odds objective matches scalar identity, gradients and shift invariance', () => {
  const ref = [0, 0], tr = dpoTrace([Math.log(3), 0], ref, 0, 1);
  close(tr.loss, -Math.log(.75)); close(tr.gradient[0], -.25); close(tr.kl, .75 * Math.log(1.5) + .25 * Math.log(.5));
  const p = [.6, -.7, .2], g = dpoTrace(p, DPO_REFERENCE, 1, .7);
  gradcheck(p, g.gradient, x => dpoTrace(x, DPO_REFERENCE, 1, .7).loss);
  close(g.loss, dpoTrace(p.map(v => v + 1000), DPO_REFERENCE, 1, .7).loss);
  close(dpoTrace(DPO_REFERENCE).loss, Math.log(2));
  assert.ok(Number.isFinite(dpoTrace([1000, -1000, 0]).loss));
});
test('DPO trains the chosen preference, keeps reference unchanged, loss falls', () => {
  for (const preferred of [0, 1, 2]) {
    const before = dpoTrace(DPO_REFERENCE, DPO_REFERENCE, preferred), after = trainDpo(DPO_REFERENCE, preferred, .5, 100);
    assert.ok(after.losses.at(-1)! < before.loss * .3);
    assert.ok(dpoTrace(after.parameters, DPO_REFERENCE, preferred).p[preferred] > before.p[preferred]);
  }
  assert.deepEqual(DPO_REFERENCE, [.3, 0, -.2]);
});
test('quantization has exact grid values, channel isolation, clipping and zero handling', () => {
  const exact = quantizeWeights([[-1, 0, 1]], 2, 'tensor', 10, 'symmetric');
  assert.deepEqual(exact.integers, [[-1, 0, 1]]); close(exact.mse, 0);
  const affine = quantizeWeights([[0, 1, 2, 3]], 2, 'tensor', 10, 'affine');
  assert.deepEqual(affine.integers, [[0, 1, 2, 3]]); close(affine.meta[0].scale, 1); close(affine.mse, 0);
  const weights = [[.1, -.2], [7, -7]], tensor = quantizeWeights(weights, 4, 'tensor', 10, 'symmetric'), channel = quantizeWeights(weights, 4, 'channel', 10, 'symmetric');
  assert.ok(channel.mse < tensor.mse);
  assert.equal(quantizeWeights([[0, 0]], 4, 'channel', 10, 'affine').mse, 0);
  close(quantizeWeights([[4]], 4, 'tensor', 2, 'symmetric').restored[0][0], 2);
  assert.throws(() => quantizeWeights([[NaN]], 4, 'tensor', 2, 'symmetric'));
});
test('frozen quantized weights plus rank-one adapter have independently checked gradients and learn', () => {
  const target = quantizationWeights(4), base = quantizeWeights(target, 3, 'tensor', 4, 'symmetric').restored;
  const p = [.1, -.2, .3, .15, .4, -.5, .2], tr = quantAdapterTrace(p, target, base);
  gradcheck(p, tr.gradient, x => quantAdapterTrace(x, target, base).loss);
  const initial = initialQuantAdapter(), before = quantAdapterTrace(initial, target, base).loss, saved = structuredClone(base);
  const result = trainQuantAdapter(initial, target, base, 300);
  assert.ok(result.losses.at(-1)! < before * .6);
  assert.ok(quantAdapterTrace(result.parameters, target, base, QUANT_HELDOUT).loss < quantAdapterTrace(initial, target, base, QUANT_HELDOUT).loss);
  assert.deepEqual(base, saved);
});
test('speculative correction recovers target distribution including zero support', () => {
  for (const [p, q] of [[[.1, .7, .2], [.5, .2, .3]], [[0, 1], [1, 0]], [[.4, .6], [.4, .6]], [[.2, .8], [0, 1]]]) {
    const tr = speculativeKernel(p, q); tr.exact.forEach((v, i) => close(v, p[i]));
    close(tr.acceptedMass.reduce((a, b) => a + b, 0) + tr.rejected, 1);
  }
  const tr = speculativeSample([.1, .9], [.9, .1], .1, .99, .3);
  assert.equal(tr.accepted, false); assert.equal(tr.output, 1);
  assert.throws(() => speculativeKernel([.3, .3], [.5, .5]));
});
test('speculative Monte Carlo is reproducible and statistically matches target; perfect draft has bonus', () => {
  const p = [.1, .7, .2], q = [.5, .2, .3], a = speculativeHistogram(p, q, 60000, 17);
  a.frequencies.forEach((v, i) => close(v, p[i], .008));
  assert.deepEqual(a, speculativeHistogram(p, q, 60000, 17));
  const block = speculativeBlock(0, 4, 1, 13);
  assert.equal(block.accepted, 4); assert.equal(block.output.length, 5); assert.notEqual(block.bonus, null);
  for (let seed = 0; seed < 20; seed++) { const b = speculativeBlock(0, 5, 0, seed); assert.ok(b.output.length >= 1 && b.output.length <= 6); const reject = b.rows.findIndex(row => row.status === 'rejected'); if (reject >= 0) assert.ok(b.rows.slice(reject + 1).every(row => row.status === 'discarded')); }
  assert.equal(SPEC_TARGET.length, 4);
});
test('context score derivative matches differences, training works, window cannot retrieve invisible key', () => {
  for (const method of ['none', 'alibi', 'rope'] as const) {
    const initial = contextTrainingLoss(.3, 6, method);
    close(initial.gradient, (contextTrainingLoss(.30001, 6, method).loss - contextTrainingLoss(.29999, 6, method).loss) / .00002);
    const trained = trainContext(.3, 6, method, 150); assert.ok(trained.losses.at(-1)! < initial.loss * .3);
    const visible = contextTrace(trained.strength, 32, 20, method, 8); assert.equal(visible.weights[visible.target], 0); assert.equal(visible.loss, Infinity);
  }
  close(contextEvaluation(6, 32, 'none', 8).reachable, .25);
  close(contextEvaluation(6, 32, 'none', 64).accuracy, 1);
  assert.ok(contextEvaluation(6, 32, 'rope', 64).accuracy < 1);
});
test('masked-denoiser gradient checks every coefficient without target leakage', () => {
  const parameters = initialMaskedModel(), tr = maskedObjective(parameters);
  gradcheck(parameters, tr.gradient, x => maskedObjective(x).loss);
  for (let position = 0; position < 4; position++) {
    const hidden = [0, 1, 2, 3]; hidden[position] = -1;
    const ownRow = maskedPrediction(parameters, hidden).logits[position];
    for (let token = 0; token < 4; token++) { const visible = [...hidden]; visible[position] = token; assert.deepEqual(maskedPrediction(parameters, visible).logits[position], ownRow); }
  }
  const uniform = Array(parameters.length).fill(0); close(maskedObjective(uniform).loss, Math.log(4));
  assert.throws(() => maskedPrediction(parameters, [-1, 5, 0, 0]));
});
test('masked learning reconstructs every cyclic example from a clue and preserves it', () => {
  const before = initialMaskedModel(), result = trainMaskedModel(before, 150);
  assert.ok(result.losses.at(-1)! < maskedObjective(before).loss * .4);
  for (const truth of MASK_SEQUENCES) for (let clue = 0; clue < 4; clue++) {
    let tokens = truth.map((v, i) => i === clue ? v : -1);
    for (let step = 0; step < 3; step++) tokens = unmaskStep(result.parameters, tokens, 1, 7).tokens;
    assert.deepEqual(tokens, truth); assert.deepEqual(autoregressiveCycle(truth[0]), truth);
  }
  const allMasked = maskedPrediction(result.parameters, [-1, -1, -1, -1]);
  allMasked.probabilities.forEach(row => row.forEach(p => close(p, .25, .015)));
  assert.deepEqual(unmaskStep(result.parameters, [0, 1, 2, 3], 4, 9).tokens, [0, 1, 2, 3]);
  assert.deepEqual(frontierSoftmax([1000, 1000]), [.5, .5]);
});
