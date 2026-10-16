import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../src/representationFrontierMath.ts';
import * as F from '../src/flowGeometryMath.ts';
import * as I from '../src/inferenceFrontierMath.ts';
import * as A from '../src/architectureTrainingMath.ts';

const slugs = 'clip flowmatching superposition egnn neuralfield dpo qlora speculative longcontext jepa maskedtext kan vittraining moetraining ssmtraining imagedenoisertraining'.split(' ');
const fixture = (slug: string) => JSON.parse(readFileSync(new URL('../animations/' + slug + '/fixture.json', import.meta.url), 'utf8'));
function close(actual: number, expected: number, epsilon = 1e-10) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < epsilon, actual + ' != ' + expected);
}
function vector(actual: number[], expected: number[]) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => close(value, expected[i]));
}
for (const slug of slugs) test(slug + ': timing, accessible alternative and geometry are complete', () => {
  const f = fixture(slug);
  assert.equal(f.duration, 40);
  assert.deepEqual(f.chapters, [0, 6, 12, 26, 34]);
  assert.deepEqual(f.keyframes, [4, 9, 22, 30, 37]);
  assert.equal(f.lesson.question.time, 9);
  assert.ok(f.answerAt > f.lesson.question.time);
  assert.equal(f.posterAt, 30);
  assert.ok(f.lesson.table.rows.length > 1);
  assert.ok(f.lesson.practice.question !== f.lesson.question.question);
  f.lesson.table.rows.forEach((row: unknown[]) => assert.equal(row.length, f.lesson.table.headers.length));
  assert.equal(f.geometry.before.length, f.geometry.after.length);
  f.geometry.before.forEach((row: number[][], i: number) => assert.equal(row.length, f.geometry.after[i].length));
  for (const p of [...f.geometry.before.flat(), ...f.geometry.after.flat()] as number[][]) assert.ok(p.length === 2 && p.every(Number.isFinite));
  assert.notDeepEqual(f.geometry.before, f.geometry.after);
  const vtt = readFileSync(new URL('../public/animations/' + slug + '/captions.ru.vtt', import.meta.url), 'utf8');
  const spans = [...vtt.matchAll(/00:(\d\d)\.(\d{3}) --> 00:(\d\d)\.(\d{3})/g)].map(m => [+m[1] + +m[2] / 1000, +m[3] + +m[4] / 1000]);
  assert.equal(spans[0][0], 0); assert.equal(spans.at(-1)![1], 40);
  spans.slice(1).forEach((span, i) => assert.equal(span[0], spans[i][1]));
});

test('CLIP: symmetric four-pair loss and unit embeddings replay', () => {
  const f = fixture('clip'), replay = R.clipObjective(f.data.parameters, f.state.temperature);
  close(replay.loss, f.data.b.loss);
  assert.equal(replay.imageEmbeddings.length, 4);
  [...replay.imageEmbeddings, ...replay.textEmbeddings].forEach(p => close(Math.hypot(...p), 1));
  [...replay.imageToText, ...replay.textToImage].forEach(p => close(p.reduce((a, b) => a + b, 0), 1));
});
test('Flow: learned field integrates from identical starts without reading target', () => {
  const f = fixture('flowmatching');
  f.data.noise.forEach((point: F.Vec2, i: number) => {
    const path = F.integrateFlow(f.state.model, point, f.state.steps);
    assert.deepEqual(path, f.data.b[i]);
    vector([...path[0]], [...point]);
  });
});
test('Superposition: weights and single-coordinate intervention replay', () => {
  const f = fixture('superposition'), tr = R.causalIntervention([.8, -.5], [-.8, -.5], 0, 'zero');
  assert.deepEqual(tr, f.data.causal);
  close(tr.patched.hidden[0], tr.clean.hidden[0]);
  vector(tr.patched.hidden.slice(1), tr.corrupt.hidden.slice(1));
  assert.deepEqual(R.trainSuperposition(f.state.steps, f.state.frequency).parameters, f.data.b);
});
test('EGNN: physical xyz transformation preserves scalar and vector laws', () => {
  const f = fixture('egnn'), s = f.state;
  const tr = F.equivarianceTrace(s.coordinates, s.features, s.z, s.y, s.reflection, s.translation, s.strength, s.broken);
  assert.deepEqual(tr, f.data.tr);
  assert.ok(tr.positionError < 1e-12 && tr.scalarError < 1e-12 && tr.vectorError < 1e-12);
  assert.ok(f.data.broken.positionError > 1e-3);
});
test('Neural field: ray geometry, density, color and remaining light replay', () => {
  const f = fixture('neuralfield'), s = f.state;
  const u = ((s.pixelX + .5) / 12 * 2 - 1) * 1.15, v = (1 - (s.pixelY + .5) / 12 * 2) * 1.15;
  const tr = F.renderFieldRay(p => F.neuralField(s.model, p), s.yaw, u, v, s.samples, s.densityScale);
  assert.deepEqual(tr, f.data.b);
  close(tr.trace.reduce((sum, row) => sum + row.weight, 0) + tr.transmittance, 1);
  tr.trace.forEach(row => assert.ok(row.after <= row.transmittance));
  assert.ok(tr.transmittance < f.data.a.transmittance);
});
test('DPO: reference remains fixed while preferred probability grows', () => {
  const f = fixture('dpo'), s = f.state, tr = I.dpoTrace(s.parameters, I.DPO_REFERENCE, s.preferred, s.beta);
  assert.deepEqual(tr, f.data.b);
  vector(tr.ref, f.data.a.ref);
  assert.ok(tr.p[s.preferred] > f.data.a.p[s.preferred]);
});
test('Quantization: frozen base plus rank-one adapter', () => {
  const f = fixture('qlora'), s = f.state, weights = I.quantizationWeights(s.outlier);
  const quant = I.quantizeWeights(weights, s.bits, s.scope, s.clip, s.scheme);
  assert.deepEqual(quant, f.data.quant);
  const baseCopy = structuredClone(quant.restored), tr = I.quantAdapterTrace(s.parameters, weights, quant.restored);
  assert.deepEqual(quant.restored, baseCopy);
  assert.deepEqual(tr, f.data.b);
  tr.matrix.forEach((row, r) => row.forEach((v, c) => close(v - quant.restored[r][c], s.parameters[4 + r] * s.parameters[c])));
});
test('Speculative: accepted and corrected masses exactly recover target', () => {
  const f = fixture('speculative'), s = f.state;
  const tr = I.speculativeKernel(I.SPEC_TARGET[s.previous], I.specDraft(s.previous, s.fidelity));
  assert.deepEqual(tr, f.data.kernel);
  vector(tr.exact, f.data.p);
  assert.deepEqual(I.speculativeBlock(s.previous, s.length, s.fidelity, s.seed), f.data.block);
  const rejected = f.data.block.rows.findIndex((r: { status: string }) => r.status === 'rejected');
  if (rejected >= 0) assert.ok(f.data.block.rows.slice(rejected + 1).every((r: { status: string }) => r.status === 'discarded'));
});
test('Long context: train short, evaluate long, closed target remains inaccessible', () => {
  const f = fixture('longcontext'), s = f.state;
  assert.ok(s.trainLength < s.length);
  assert.deepEqual(I.contextTrace(s.strength, s.length, s.distance, s.method, s.window), f.data.b);
  const closed = I.contextTrace(s.strength, s.length, s.distance, s.method, 8);
  assert.equal(closed.included, false); assert.equal(closed.weights[closed.target], 0);
});
test('JEPA: prediction, EMA update and collapse control are distinct', () => {
  const f = fixture('jepa'), s = f.state;
  assert.deepEqual(R.jepaTrace(f.data.b, R.JEPA_IMAGES[s.sample], s.mask), f.data.tb);
  const initial = R.jepaInitial(), next = R.jepaStep(initial, s.mask, s.eta, s.ema);
  next.target.forEach((row, i) => row.forEach((v, j) => close(v, s.ema * initial.target[i][j] + (1 - s.ema) * next.context[i][j])));
  const collapse = R.trainJepa(50, 1, .05, .99, true);
  close(collapse.metrics.loss, 0); close(collapse.metrics.targetVariance, 0);
  assert.ok(f.data.metrics.targetVariance > 0);
});
test('Masked text: right context affects left prediction and visible tokens survive', () => {
  const f = fixture('maskedtext'), s = f.state;
  assert.deepEqual(I.maskedPrediction(s.parameters, s.tokens), f.data.b);
  assert.notDeepEqual(f.data.a.probabilities[0], f.data.b.probabilities[0]);
  const next = I.unmaskStep(s.parameters, s.tokens, s.count, s.seed, s.greedy);
  assert.deepEqual(next, f.data.next); assert.equal(next.tokens[2], s.tokens[2]);
});
test('KAN: splines replay and additive architecture cannot invent xy', () => {
  const f = fixture('kan'), s = f.state, tr = R.trainKanComparison(s.steps, s.knots, s.eta, s.task);
  assert.deepEqual(tr.kan, f.data.b);
  close(R.kanPredict(tr.kan, [1, 1]) - R.kanPredict(tr.kan, [1, -1]) - R.kanPredict(tr.kan, [-1, 1]) + R.kanPredict(tr.kan, [-1, -1]), 0);
});
test('ViT training: full trace on held-out pixels and SGD checkpoint', () => {
  const f = fixture('vittraining'), s = f.state;
  assert.deepEqual(A.vitTrainingTrace(s.run.parameters, A.visionTrainingData('validation')[s.example]), f.data.b);
  close(A.evaluateVit(s.run.parameters, A.visionTrainingData('train')).loss, s.run.history.at(-1).train);
  A.trainingGroups('vit').forEach(g => assert.ok(s.run.parameters.slice(g.offset, g.offset + g.size).some((v: number, i: number) => v !== f.data.initial[g.offset + i])));
});
test('MoE training: router and experts replay, probabilities normalize', () => {
  const f = fixture('moetraining'), s = f.state;
  const tr = A.moeTrainingTrace(s.run.parameters, A.moeTrainingData('validation'), s.balance);
  assert.deepEqual(tr, f.data.b);
  tr.rows.forEach(row => { close(row.probabilities.reduce((a, b) => a + b, 0), 1); close(row.output, row.experts.reduce((v, x, i) => v + x * row.probabilities[i], 0)); });
});
test('SSM training: every recurrent state and final loss replay', () => {
  const f = fixture('ssmtraining'), s = f.state, tr = A.ssmTrainingTrace(s.run.parameters, A.ssmTrainingData('validation')[s.example]);
  assert.deepEqual(tr, f.data.b); tr.decay.forEach(v => assert.ok(Math.abs(v) < 1));
  close(tr.loss, (tr.outputs.at(-1)! - f.data.sample.target) ** 2);
});
test('U-Net and DiT: trained prediction and all eight DDIM steps replay', () => {
  const f = fixture('imagedenoisertraining'), s = f.state, sample = A.denoisingTrainingData('validation')[s.example];
  assert.deepEqual(A.denoiserTrainingTrace('unet', s.run.parameters, sample), f.data.b);
  assert.deepEqual(A.denoiserTrainingTrace('dit', f.data.dit.parameters, sample), f.data.ditTrace);
  for (const kind of ['unet', 'dit'] as const) {
    const parameters = kind === 'unet' ? s.run.parameters : f.data.dit.parameters;
    const path = A.sampleDenoiser(kind, parameters, s.seed);
    assert.deepEqual(path, kind === 'unet' ? f.data.trajectory : f.data.ditTrajectory);
    assert.deepEqual(path.map(p => p.time), [8, 7, 6, 5, 4, 3, 2, 1, 0]);
    assert.ok(path.flatMap(p => p.pixels).every(Number.isFinite));
  }
});
