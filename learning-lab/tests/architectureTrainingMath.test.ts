import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialArchitectureParameters, trainingGroups, architectureSgd, meanArchitectureGradients,
  visionTrainingData, vitTrainingTrace, evaluateVit, moeTrainingData, moeTrainingTrace,
  ssmTrainingData, ssmTrainingTrace, evaluateSsm, denoisingTrainingData, denoisingAlpha,
  denoiserTrainingTrace, denoiserPrediction, evaluateDenoiser, sampleDenoiser, DENOISING_STEPS,
  type TrainingFamily,
} from '../src/architectureTrainingMath.ts';

const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≉ ${b}`);

test('analytic reverse-mode gradients of every architecture match independent central differences', () => {
  for (const family of ['vit', 'moe', 'ssm', 'unet', 'dit'] as TrainingFamily[]) {
    const p = initialArchitectureParameters(family);
    const trace = (weights: number[], recording: boolean) => family === 'vit' ? vitTrainingTrace(weights, visionTrainingData('train')[0], recording)
      : family === 'moe' ? moeTrainingTrace(weights, moeTrainingData('train'), .2, recording)
      : family === 'ssm' ? ssmTrainingTrace(weights, ssmTrainingData('train')[0], recording)
      : denoiserTrainingTrace(family, weights, denoisingTrainingData('train')[3], recording);
    const analytic = trace(p, true);
    p.forEach((_, i) => {
      const plus = [...p], minus = [...p]; plus[i] += 1e-5; minus[i] -= 1e-5;
      close(analytic.gradients[i], (trace(plus, false).loss - trace(minus, false).loss) / 2e-5, 2e-7);
    });
    for (const g of trainingGroups(family)) assert.ok(analytic.gradients.slice(g.offset, g.offset + g.size).some(x => Math.abs(x) > 1e-10), `${family}/${g.name}`);
  }
});

test('SSM BPTT equals a closed-form impulse derivative across six recurrent steps', () => {
  const p = initialArchitectureParameters('ssm'), amplitude = .7, length = 6;
  const sample = { input: [amplitude, 0, 0, 0, 0, 0], target: amplitude };
  const trace = ssmTrainingTrace(p, sample);
  const output = [0, 1, 2].reduce((s, j) => s + p[6 + j] * p[3 + j] * amplitude * Math.tanh(p[j]) ** (length - 1), 0);
  close(trace.outputs.at(-1)!, output);
  for (let j = 0; j < 3; j++) {
    const a = Math.tanh(p[j]), error = 2 * (output - amplitude);
    close(trace.gradients[j], error * p[6 + j] * p[3 + j] * amplitude * (length - 1) * a ** (length - 2) * (1 - a * a));
    close(trace.gradients[3 + j], error * p[6 + j] * amplitude * a ** (length - 1));
    close(trace.gradients[6 + j], error * p[3 + j] * amplitude * a ** (length - 1));
  }
});

test('MoE affine experts and denoiser output biases have independently derived gradients', () => {
  const p = initialArchitectureParameters('moe'), samples = moeTrainingData('train');
  const trace = moeTrainingTrace(p, samples, .3);
  for (let expert = 0; expert < 2; expert++) {
    const slope = trace.rows.reduce((s, row, i) => s + 2 * (row.output - samples[i].target) * row.probabilities[expert] * samples[i].x / samples.length, 0);
    const bias = trace.rows.reduce((s, row, i) => s + 2 * (row.output - samples[i].target) * row.probabilities[expert] / samples.length, 0);
    close(trace.gradients[4 + 2 * expert], slope);
    close(trace.gradients[5 + 2 * expert], bias);
  }
  const sample = denoisingTrainingData('validation')[2];
  for (const kind of ['unet', 'dit'] as const) {
    const zero = initialArchitectureParameters(kind).map(() => 0), trace = denoiserTrainingTrace(kind, zero, sample);
    assert.deepEqual(trace.prediction, Array(16).fill(0));
    close(trace.loss, sample.noise.reduce((s, x) => s + x * x, 0) / 16);
    if (kind === 'unet') close(trace.gradients.at(-1)!, -2 * sample.noise.reduce((s, x) => s + x, 0) / 16);
    else for (let coordinate = 0; coordinate < 4; coordinate++) {
      const target = sample.noise.filter((_, i) => Math.floor(i / 4) % 2 * 2 + i % 2 === coordinate);
      close(trace.gradients[zero.length - 4 + coordinate], -2 * target.reduce((s, x) => s + x, 0) / 16);
    }
  }
});

test('real SGD trains patch/QKV/FFN/head and generalizes tiny orientation patterns', () => {
  const original = initialArchitectureParameters('vit'), train = visionTrainingData('train'), validation = visionTrainingData('validation');
  assert.ok(train.every(a => validation.every(b => JSON.stringify(a.image) !== JSON.stringify(b.image))));
  let p = original;
  for (let step = 0; step < 80; step++) p = architectureSgd(p, meanArchitectureGradients(train.map(s => vitTrainingTrace(p, s))), .12);
  assert.ok(evaluateVit(p, train).loss < .15);
  assert.ok(evaluateVit(p, validation).loss < .2);
  assert.equal(evaluateVit(p, validation).accuracy, 1);
  for (const g of trainingGroups('vit')) assert.ok(p.slice(g.offset, g.offset + g.size).some((x, i) => Math.abs(x - original[g.offset + i]) > 1e-6), g.name);
  assert.deepEqual(original, initialArchitectureParameters('vit'));
});

test('MoE jointly learns experts/router; balance is batch importance and hard routing is separate', () => {
  const original = initialArchitectureParameters('moe'), train = moeTrainingData('train'), heldout = moeTrainingData('validation');
  let p = original;
  const before = moeTrainingTrace(p, heldout, .05, false);
  for (let step = 0; step < 200; step++) p = architectureSgd(p, moeTrainingTrace(p, train, .05).gradients, .12);
  const after = moeTrainingTrace(p, heldout, .05, false);
  assert.ok(after.mse < before.mse / 10 && after.mse < .02);
  close(after.load.reduce((s, x) => s + x), 1);
  close(after.balanceLoss, 2 * after.load.reduce((s, x) => s + x * x, 0) - 1);
  assert.ok(after.rows[0].winner !== after.rows.at(-1)!.winner);
  assert.ok(after.rows.some(row => Math.abs(row.output - row.hardOutput) > .01));
  for (const g of trainingGroups('moe')) assert.ok(p.slice(g.offset, g.offset + g.size).some((x, i) => Math.abs(x - original[g.offset + i]) > 1e-6), g.name);
  const noBalance = moeTrainingTrace(original, train, 0), withBalance = moeTrainingTrace(original, train, 1);
  assert.ok(withBalance.gradients.slice(0, 4).some((x, i) => Math.abs(x - noBalance.gradients[i]) > 1e-5));
  withBalance.gradients.slice(4).forEach((g, i) => close(g, noBalance.gradients[4 + i]));
});

test('SSM learns six-step memory with separate noisy held-out sequences and changes A/B/C', () => {
  const original = initialArchitectureParameters('ssm'), train = ssmTrainingData('train'), validation = ssmTrainingData('validation');
  let p = original;
  const before = evaluateSsm(p, validation);
  for (let step = 0; step < 100; step++) p = architectureSgd(p, meanArchitectureGradients(train.map(s => ssmTrainingTrace(p, s))), .15);
  assert.ok(evaluateSsm(p, train) < .02);
  assert.ok(evaluateSsm(p, validation) < before / 10);
  for (const g of trainingGroups('ssm')) assert.ok(p.slice(g.offset, g.offset + g.size).some((x, i) => Math.abs(x - original[g.offset + i]) > 1e-6), g.name);
  assert.ok(ssmTrainingTrace(p, validation[0]).decay.every(a => Math.abs(a) < 1));
});

test('both complete denoisers learn epsilon, lower held-out MSE and run reproducible reverse sampling', () => {
  const train = denoisingTrainingData('train'), validation = denoisingTrainingData('validation');
  assert.ok(train.every(a => validation.every(b => a.noise.join() !== b.noise.join())));
  for (const kind of ['unet', 'dit'] as const) {
    const original = initialArchitectureParameters(kind);
    let p = original;
    const before = evaluateDenoiser(kind, p, validation);
    for (let step = 0; step < 160; step++) {
      const batch = Array.from({ length: 4 }, (_, i) => train[(step * 4 + i) % train.length]);
      p = architectureSgd(p, meanArchitectureGradients(batch.map(s => denoiserTrainingTrace(kind, p, s))), .06);
    }
    assert.ok(evaluateDenoiser(kind, p, train) < .65, kind);
    assert.ok(evaluateDenoiser(kind, p, validation) < before * .8, kind);
    for (const g of trainingGroups(kind)) assert.ok(p.slice(g.offset, g.offset + g.size).some((x, i) => Math.abs(x - original[g.offset + i]) > 1e-6), `${kind}/${g.name}`);
    const trajectory = sampleDenoiser(kind, p, 42);
    assert.equal(trajectory.length, DENOISING_STEPS + 1);
    assert.deepEqual(trajectory, sampleDenoiser(kind, p, 42));
    assert.notDeepEqual(trajectory.at(-1), sampleDenoiser(kind, original, 42).at(-1));
    assert.ok(trajectory.every(row => row.pixels.length === 16 && row.pixels.every(Number.isFinite)));
    // Independently reconstruct every DDIM step (eta=0), with no display clipping in the mathematics.
    for (let i = 0; i < trajectory.length - 1; i++) {
      const row = trajectory[i], a = denoisingAlpha(row.time), previous = denoisingAlpha(row.time - 1);
      const noise = denoiserPrediction(kind, p, row.pixels, row.time);
      row.pixels.forEach((x, j) => close(trajectory[i + 1].pixels[j], Math.sqrt(previous / a) * x + (Math.sqrt(1 - previous) - Math.sqrt(previous / a) * Math.sqrt(1 - a)) * noise[j], 1e-10));
    }
  }
});

test('invalid shapes and controls fail clearly; zero learning rate preserves parameters', () => {
  const p = initialArchitectureParameters('ssm');
  assert.deepEqual(architectureSgd(p, p.map(() => 1), 0), p);
  assert.throws(() => architectureSgd(p, [1], .1), RangeError);
  assert.throws(() => architectureSgd(p, p, -1), RangeError);
  assert.throws(() => vitTrainingTrace([], visionTrainingData('train')[0]), RangeError);
  assert.throws(() => ssmTrainingTrace(p, { input: [], target: 0 }), RangeError);
  assert.throws(() => denoiserPrediction('dit', initialArchitectureParameters('dit'), [1], 2), RangeError);
  assert.throws(() => denoisingAlpha(2.5), RangeError);
});
