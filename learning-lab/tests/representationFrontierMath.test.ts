import test from 'node:test';
import assert from 'node:assert/strict';
import { clipInitial, clipObjective, clipStep, trainClip, CLIP_PAIRS,
  sparseFeatures, superpositionInitial, superpositionObjective, superpositionTrace, trainSuperposition,
  causalIntervention, causalHidden, causalLogit, causalLoss, CAUSAL_READOUT,
  jepaInitial, jepaObjective, jepaStep, trainJepa, JEPA_IMAGES,
  splineBasis, kanInitial, kanPredict, kanObjective, regressionData, regressionMlpInitial,
  regressionMlpObjective, trainKanComparison, regressionTarget } from '../src/representationFrontierMath.ts';

const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function gradientCheck(parameters: number[], gradient: number[], objective: (p: number[]) => number) {
  parameters.forEach((_, i) => {
    const plus = [...parameters], minus = [...parameters], h = 1e-5;
    plus[i] += h; minus[i] -= h;
    close(gradient[i], (objective(plus) - objective(minus)) / (2 * h), 2e-7);
  });
}
const rows = (flat: number[], width: number) => Array.from({ length: flat.length / width }, (_, i) => flat.slice(i * width, (i + 1) * width));

test('CLIP uniform similarities give ln(4), distributions sum to one, normalized embeddings lie on sphere', () => {
  const flat = { image: Array.from({ length: 3 }, (_, k) => Array(9).fill(k + 1)), text: Array.from({ length: 3 }, (_, k) => Array(4).fill(k + 1)) };
  const result = clipObjective(flat, .2);
  close(result.loss, Math.log(4));
  for (const embedding of [...result.imageEmbeddings, ...result.textEmbeddings]) close(Math.hypot(...embedding), 1);
  for (const distribution of [...result.imageToText, ...result.textToImage]) { close(distribution.reduce((a, b) => a + b), 1); distribution.forEach(v => close(v, .25)); }
  assert.equal(CLIP_PAIRS.length, 4);
});

test('all 39 CLIP projection gradients match independent central differences', () => {
  const p = clipInitial(), flat = [...p.image.flat(), ...p.text.flat()];
  for (const temperature of [.1, .7]) {
    const result = clipObjective(p, temperature);
    gradientCheck(flat, [...result.gradient.image.flat(), ...result.gradient.text.flat()], values => clipObjective({ image: rows(values.slice(0, 27), 9), text: rows(values.slice(27), 4) }, temperature).loss);
  }
  assert.throws(() => clipObjective(p, 0), RangeError);
});

test('contrastive SGD updates both projectors, learns all paired retrievals and decreases loss', () => {
  const initial = clipInitial(), next = clipStep(initial), trained = trainClip(200);
  assert.notDeepEqual(next.image, initial.image); assert.notDeepEqual(next.text, initial.text);
  assert.ok(trained.metrics.loss < clipObjective(initial).loss / 100);
  assert.equal(trained.metrics.imageAccuracy, 1); assert.equal(trained.metrics.textAccuracy, 1);
  assert.deepEqual(trainClip(5), trainClip(5));
});

test('CLIP gradient differentiates the constant denominator for near-zero image embeddings', () => {
  const initial = clipInitial(), parameters = { image: initial.image.map(row => row.map(v => v * 1e-13)), text: initial.text };
  const result = clipObjective(parameters), flat = parameters.image.flat(), h = 1e-17;
  assert.ok(result.imageEmbeddings.every(v => Math.hypot(...v) < 1), 'embedding norm is below the normalization floor');
  flat.forEach((_, i) => {
    const plus = [...flat], minus = [...flat]; plus[i] += h; minus[i] -= h;
    const numerical = (clipObjective({ image: rows(plus, 9), text: parameters.text }).loss - clipObjective({ image: rows(minus, 9), text: parameters.text }).loss) / (2 * h);
    close(result.gradient.image.flat()[i], numerical, 1e-5 * Math.max(1, Math.abs(numerical)));
  });
});

test('tied sparse autoencoder has independently checked weighted loss and gradients', () => {
  const p = { weights: [[.6, -.4, .2, .8, -.2], [.1, .7, -.5, .3, .4]], bias: [.5, .5, .5, .5, .5] };
  const data = [[.4, .2, 0, .1, 0], [0, .7, .3, 0, .2]], result = superpositionObjective(p, data);
  const flat = [...p.weights.flat(), ...p.bias];
  gradientCheck(flat, [...result.gradient.weights.flat(), ...result.gradient.bias], values => superpositionObjective({ weights: rows(values.slice(0, 10), 5), bias: values.slice(10) }, data).loss);
  const zero = { weights: [Array(5).fill(0), Array(5).fill(0)], bias: Array(5).fill(0) };
  close(superpositionObjective(zero, [[1, 0, 0, 0, 0]]).loss, .2);
  assert.deepEqual(superpositionTrace(zero, [1, 0, 0, 0, 0]).output, [0, 0, 0, 0, 0]);
});

test('sparse data is reproducible and learned reconstruction improves with actual weight changes', () => {
  assert.deepEqual(sparseFeatures(.15), sparseFeatures(.15));
  assert.ok(sparseFeatures(.1).flat().filter(Boolean).length < sparseFeatures(.8).flat().filter(Boolean).length);
  const initial = trainSuperposition(0), trained = trainSuperposition(600);
  assert.ok(trained.loss < initial.loss * .4);
  assert.notDeepEqual(trained.parameters.weights, superpositionInitial().weights);
  assert.ok(trained.parameters.weights.flat().every(Number.isFinite));
});

test('ablation and activation patching replace only selected activation and have exact readout delta', () => {
  const clean = [.8, -.5], corrupt = [-.8, -.5];
  for (const neuron of [0, 1, 2]) {
    const result = causalIntervention(clean, corrupt, neuron, 'mean');
    close(result.ablated.logit - result.clean.logit, CAUSAL_READOUT[neuron] * (result.baselineValue - causalHidden(clean)[neuron]));
    close(result.patched.logit - result.corrupt.logit, CAUSAL_READOUT[neuron] * (causalHidden(clean)[neuron] - causalHidden(corrupt)[neuron]));
    result.patched.hidden.forEach((v, i) => close(v, i === neuron ? result.clean.hidden[i] : result.corrupt.hidden[i]));
    close(result.patched.loss, causalLoss(causalLogit(result.patched.hidden), 1));
  }
  assert.notEqual(causalIntervention(clean, corrupt, 0, 'mean').baselineValue, 0);
  close(causalLoss(0, 1), Math.LN2); close(causalLoss(-1000, 1), 1000);
});

test('JEPA context/predictor gradient treats target as fixed and matches differences', () => {
  const p = jepaInitial(), result = jepaObjective(p, 2), flat = [...p.context.flat(), ...p.predictor.flat()];
  gradientCheck(flat, [...result.gradient.context.flat(), ...result.gradient.predictor.flat()], values => jepaObjective({ target: p.target, context: rows(values.slice(0, 6), 3), predictor: rows(values.slice(6), 6) }, 2).loss);
  const frozen = jepaStep(p, 2, .05, 1);
  assert.deepEqual(frozen.target, p.target); assert.notDeepEqual(frozen.context, p.context); assert.notDeepEqual(frozen.predictor, p.predictor);
  const ema = jepaStep(p, 2, .05, .8);
  ema.target.forEach((row, i) => row.forEach((v, j) => close(v, .8 * p.target[i][j] + .2 * ema.context[i][j])));
  assert.equal(JEPA_IMAGES.length, 20);
});

test('JEPA training predicts noncollapsed latents; zero-loss collapse is explicitly detected', () => {
  const trained = trainJepa(300), start = trainJepa(0);
  assert.ok(trained.metrics.loss < start.metrics.loss / 100);
  assert.ok(trained.metrics.targetVariance > .1);
  assert.ok(trained.metrics.fixedLoss > trained.metrics.loss); // EMA target moved; both metrics matter.
  const collapsed = trainJepa(100, 1, .05, .99, true);
  close(collapsed.metrics.loss, 0); close(collapsed.metrics.targetVariance, 0);
  assert.deepEqual(collapsed.parameters, jepaInitial(true));
});

test('linear B-spline knots interpolate exact values and form a partition of unity', () => {
  assert.deepEqual(splineBasis(-1, 5), [1, 0, 0, 0, 0]);
  assert.deepEqual(splineBasis(1, 5), [0, 0, 0, 0, 1]);
  assert.deepEqual(splineBasis(-.75, 5), [.5, .5, 0, 0, 0]);
  for (const x of [-.83, 0, .32, 1]) close(splineBasis(x, 7).reduce((a, b) => a + b), 1);
  const p = { edges: [[-1, -.5, 0, .5, 1], [1, .25, 0, .25, 1]], bias: .2 };
  close(kanPredict(p, [.3, -.75]), .3 + .625 + .2);
  assert.throws(() => splineBasis(2, 7), RangeError);
});

test('every KAN and MLP parameter gradient matches independent central differences', () => {
  const data = regressionData(true).slice(0, 11), kan = kanInitial(5);
  const k = kanObjective(kan, data), flatK = [...kan.edges.flat(), kan.bias];
  gradientCheck(flatK, [...k.gradient.edges.flat(), k.gradient.bias], values => kanObjective({ edges: rows(values.slice(0, 10), 5), bias: values[10] }, data).loss);
  const mlp = regressionMlpInitial(), m = regressionMlpObjective(mlp, data), flatM = [...mlp.hidden.flat(), ...mlp.hiddenBias, ...mlp.output, mlp.bias];
  gradientCheck(flatM, [...m.gradient.hidden.flat(), ...m.gradient.hiddenBias, ...m.gradient.output, m.gradient.bias], values => regressionMlpObjective({ hidden: rows(values.slice(0, 12), 2), hiddenBias: values.slice(12, 18), output: values.slice(18, 24), bias: values[24] }, data).loss);
});

test('same-data KAN/MLP SGD changes both models and improves train and held-out', () => {
  const initial = trainKanComparison(0), trained = trainKanComparison(600);
  for (const metric of ['kanTrain', 'kanHeldout', 'mlpTrain', 'mlpHeldout'] as const) assert.ok(trained.metrics[metric] < initial.metrics[metric], metric);
  assert.notDeepEqual(trained.kan.edges, initial.kan.edges); assert.notDeepEqual(trained.mlp.hidden, initial.mlp.hidden);
  assert.equal(trained.train.length, 49); assert.equal(trained.heldout.length, 36);
  const interaction = trainKanComparison(600, 7, .08, 'interaction');
  assert.ok(interaction.metrics.kanTrain > .06, 'additive KAN cannot fit xy interaction on symmetric grid');
  close(regressionTarget(1, 1, 'interaction'), 1.1);
});
