import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNetwork, createOptimizerState, networkLossGradient, optimizerStep, predictNetwork, quadratic, XOR_DATA, type OptimizerKind } from '../src/math.ts';
import { traceNetwork } from '../src/networkTrace.ts';
import { cachedAttentionStep, dotProduct, fullCausalAttention, groupedAttention, HEAD_INPUT, kvGroupForHead, OUTPUT_PROJECTION, projectTokens, QUERY_PROJECTIONS, rope, SMALL_PROJECTIONS, type KvCache } from '../src/transformerMath.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../animations/${name}/fixture.json`, import.meta.url), 'utf8'));
const near = (actual: number, expected: number, tolerance = 1e-12) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < tolerance, `${actual} ≉ ${expected}`);
const vectorNear = (actual: number[], expected: number[], tolerance = 1e-12) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => near(value, expected[i], tolerance));
};
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

test('descent film distinguishes a stable SGD step, sign change and growing oscillation', () => {
  const film = fixture('descent');
  assert.deepEqual(film.start, [-3, 1.5]);
  assert.equal(film.options.lr, .12);
  vectorNear(film.tracks.sgd[1].params, [-2.64, .06]);
  near(film.tracks.sgd[1].loss, 3.4992);
  near(film.fast.lr, .30);
  near(film.fast.path[1].params[1], -2.1);
  near(film.fast.path[2].params[1], 2.94);
  assert.ok(film.fast.path.at(-1).loss > film.fast.path[0].loss);
  for (let i = 1; i < film.tracks.sgd.length; i++) {
    assert.ok(film.tracks.sgd[i].loss < film.tracks.sgd[i - 1].loss);
  }
  // Crossing zero alone is not divergence: a different, unshown case contracts.
  const next = optimizerStep(createOptimizerState([0, 1]), [0, 8], 'sgd', { lr: .20 });
  near(next.params[1], -.6);
  assert.ok(Math.abs(next.params[1]) < 1);
});

test('descent film replays every exported optimizer endpoint and true level set', () => {
  const film = fixture('descent');
  for (const kind of ['sgd', 'momentum', 'adam'] as OptimizerKind[]) {
    let state = createOptimizerState(film.start);
    assert.equal(film.tracks[kind].length, film.steps + 1);
    film.tracks[kind].forEach((point: { step: number; params: number[]; loss: number; grad: number[] }, i: number) => {
      if (i) state = optimizerStep(state, quadratic(state.params).grad, kind, film.options);
      assert.equal(point.step, state.step);
      vectorNear(point.params, state.params);
      near(point.loss, quadratic(state.params).loss);
      // Independent gradient and loss prevent a shared exporter/API error hiding here.
      vectorNear(point.grad, [point.params[0], 8 * point.params[1]]);
      near(point.loss, (point.params[0] ** 2 + 8 * point.params[1] ** 2) / 2);
    });
  }
  for (const contour of film.contours) {
    assert.ok(contour.points.length > 3);
    vectorNear(contour.points[0], contour.points.at(-1));
    for (const [x, y] of contour.points) near((x * x + 8 * y * y) / 2, contour.loss, 1e-10);
  }
  let unstable = createOptimizerState(film.start);
  film.fast.path.forEach((point: { params: number[]; loss: number }, step: number) => {
    if (step) unstable = optimizerStep(unstable, quadratic(unstable.params).grad, 'sgd', { lr: film.fast.lr });
    vectorNear(point.params, unstable.params);
    near(point.params[1], film.start[1] * (1 - 8 * film.fast.lr) ** step);
    near(point.loss, quadratic(unstable.params).loss);
  });
});

test('XOR film is a deterministic replay of the existing lab, not a separately trained model', () => {
  const film = fixture('xor');
  assert.deepEqual(film.data, XOR_DATA);
  assert.equal(film.config.seed, 42);
  assert.equal(film.config.kind, 'adam');
  near(film.config.lr, .03);
  assert.equal(film.config.steps, 1000);
  let state = createOptimizerState(createNetwork(film.config.seed));
  assert.deepEqual(film.initial.params, state.params);
  assert.deepEqual(film.initial.predictions, networkLossGradient(state.params).predictions);
  for (let step = 0; step < film.config.steps; step++) {
    state = optimizerStep(state, networkLossGradient(state.params).grad, film.config.kind, { lr: film.config.lr });
    const recorded = film.history.find((point: { step: number }) => point.step === state.step);
    if (recorded) near(recorded.loss, networkLossGradient(state.params).loss);
  }
  vectorNear(film.final.params, state.params);
  near(film.final.loss, networkLossGradient(state.params).loss);
  assert.ok(film.final.loss < film.initial.loss);
  assert.deepEqual(film.final.predictions.map((p: number) => Number(p >= .5)), XOR_DATA.map(point => point.target));
});

test('XOR film hidden contributions, logits and every probability cell agree with actual inputs', () => {
  const film = fixture('xor');
  const sample = XOR_DATA[film.config.sample];
  const trace = traceNetwork(film.final.params, sample.input, sample.target);
  // JSON fixtures intentionally serialize signed zero as zero.
  assert.deepEqual(film.trace, JSON.parse(JSON.stringify(trace)));
  near(film.trace.logit, sum(film.trace.outputContributions) + film.final.params[16]);
  near(film.trace.probability, 1 / (1 + Math.exp(-film.trace.logit)));
  for (const state of [film.initial, film.final]) {
    const height = state.grid.length, width = state.grid[0].length;
    assert.ok(height > 1 && width > 1);
    state.grid.forEach((row: { input: [number, number]; probability: number }[], r: number) => {
      assert.equal(row.length, width);
      row.forEach((cell, c) => {
        // Checks the actual input orientation and cell centres, not just colours.
        vectorNear(cell.input, [(c + .5) / width, (r + .5) / height]);
        near(cell.probability, predictNetwork(state.params, cell.input));
        const [x, y] = cell.input;
        const hidden = Array.from({ length: 4 }, (_, i) => Math.tanh(state.params[2 * i] * x + state.params[2 * i + 1] * y + state.params[8 + i]));
        const logit = sum(hidden.map((h, i) => h * state.params[12 + i])) + state.params[16];
        near(cell.probability, 1 / (1 + Math.exp(-logit)));
      });
    });
  }
});

test('RoPE film rotates actual coordinate pairs and preserves norm under a common shift', () => {
  const film = fixture('rope');
  assert.equal(film.width, film.q.length);
  assert.equal(film.q.length, film.k.length);
  const rotatePairwise = (values: number[], position: number) => values.map((_, d) => {
    const start = d - d % 2, angle = position / film.base ** (start / values.length);
    return d % 2 ? values[start] * Math.sin(angle) + values[start + 1] * Math.cos(angle)
      : values[start] * Math.cos(angle) - values[start + 1] * Math.sin(angle);
  });
  for (const state of [film.raw, film.initial, film.shifted, film.changed]) {
    vectorNear(state.rotatedQ, rotatePairwise(film.q, state.queryPosition));
    vectorNear(state.rotatedK, rotatePairwise(film.k, state.keyPosition));
    vectorNear(state.rotatedQ, rope(film.q, state.queryPosition, film.base));
    vectorNear(state.rotatedK, rope(film.k, state.keyPosition, film.base));
    near(state.qNorm, Math.hypot(...film.q));
    near(state.kNorm, Math.hypot(...film.k));
    near(state.dot, sum(state.rotatedQ.map((value: number, d: number) => value * state.rotatedK[d])));
    near(state.pairDot, dotProduct(state.rotatedQ.slice(0, 2), state.rotatedK.slice(0, 2)));
    assert.equal(state.distance, state.keyPosition - state.queryPosition);
  }
  assert.equal(film.initial.distance, film.shifted.distance);
  near(film.initial.dot, film.shifted.dot);
  assert.notEqual(film.changed.distance, film.initial.distance);
  assert.ok(Math.abs(film.initial.dot - film.changed.dot) > .1);
  // An extra common shift tests the invariant beyond the exact shown pair.
  near(dotProduct(rope(film.q, film.initial.queryPosition + 17, film.base), rope(film.k, film.initial.keyPosition + 17, film.base)), film.initial.dot, 1e-10);
});

test('heads film concatenates individual weighted values before the actual output projection', () => {
  const film = fixture('heads');
  assert.deepEqual(film.input, HEAD_INPUT);
  assert.deepEqual(film.outputProjection, OUTPUT_PROJECTION);
  assert.equal(film.queryHeads, QUERY_PROJECTIONS.length);
  for (const mode of film.modes) {
    const replay = groupedAttention(film.input, mode.kvHeads, film.causal);
    assert.equal(mode.headOutputs.length, film.queryHeads);
    assert.equal(mode.keys.length, mode.kvHeads);
    assert.equal(mode.values.length, mode.kvHeads);
    assert.deepEqual(mode.queries, replay.heads.map(head => head.q[film.queryIndex]));
    assert.deepEqual(mode.keys, replay.keys);
    assert.deepEqual(mode.values, replay.values);
    assert.deepEqual(mode.weights, replay.heads.map(head => head.weights[film.queryIndex]));
    assert.deepEqual(mode.headOutputs, replay.heads.map(head => head.output[film.queryIndex]));
    mode.weights.forEach((weights: number[], h: number) => {
      near(sum(weights), 1);
      const group = Math.floor(h / (film.queryHeads / mode.kvHeads));
      assert.equal(mode.groups[h], group);
      assert.equal(mode.groups[h], kvGroupForHead(h, film.queryHeads, mode.kvHeads));
      vectorNear(mode.headOutputs[h], Array.from({ length: film.headWidth }, (_, d) => sum(weights.map((weight, token) => weight * mode.values[group][token][d]))));
      if (film.causal) weights.forEach((weight, token) => { if (token > film.queryIndex) assert.equal(weight, 0); });
    });
    assert.deepEqual(mode.concatenated, mode.headOutputs.flat());
    assert.equal(mode.concatenated.length, film.queryHeads * film.headWidth);
    const independentProjection = Array.from({ length: film.modelWidth }, (_, d) => sum(mode.concatenated.map((value: number, i: number) => value * film.outputProjection[i][d])));
    vectorNear(mode.output, independentProjection);
    vectorNear(mode.output, projectTokens([mode.concatenated], film.outputProjection)[0]);
  }
  const shared = film.modes.find((mode: { kvHeads: number }) => mode.kvHeads > 1 && mode.kvHeads < film.queryHeads);
  assert.ok(shared, 'Film must include a grouped-query example.');
  assert.equal(shared.groups[0], shared.groups[1]);
  assert.notDeepEqual(shared.weights[0], shared.weights[1], 'Shared K/V do not make distinct Q heads identical.');
});

test('generation film extends K/V without modifying old entries and matches every full prefix', () => {
  const film = fixture('generation');
  assert.deepEqual(film.projections, SMALL_PROJECTIONS);
  assert.equal(film.rotary, true);
  assert.equal(film.causal, true);
  assert.equal(film.steps.length, film.input.length);
  assert.equal(film.nextLength, film.initialLength + 1);
  let cache: KvCache = { keys: [], values: [] };
  film.steps.forEach((step: { position: number; input: number[]; query: number[]; keys: number[][]; values: number[][]; weights: number[]; output: number[]; fullOutput: number[]; maxError: number }, position: number) => {
    const previousSnapshot = JSON.parse(JSON.stringify(cache));
    const cached = cachedAttentionStep(film.input[position], cache, film.rotary);
    assert.deepEqual(cache, previousSnapshot, 'Appending a token must not mutate the previous cache.');
    const full = fullCausalAttention(film.input.slice(0, position + 1), film.rotary);
    assert.equal(step.position, position);
    assert.deepEqual(step.input, film.input[position]);
    assert.deepEqual(step.keys, cached.cache.keys);
    assert.deepEqual(step.values, cached.cache.values);
    assert.deepEqual(step.keys.slice(0, position), previousSnapshot.keys);
    assert.deepEqual(step.values.slice(0, position), previousSnapshot.values);
    vectorNear(step.query, cached.attention.q[0]);
    vectorNear(step.weights, cached.attention.weights[0]);
    assert.equal(step.weights.length, position + 1);
    near(sum(step.weights), 1);
    vectorNear(step.output, full.output[position]);
    vectorNear(step.fullOutput, full.output[position]);
    vectorNear(step.output, cached.output);
    const weightedValues = step.output.map((_, d) => sum(step.weights.map((weight, token) => weight * step.values[token][d])));
    vectorNear(step.output, weightedValues);
    near(step.maxError, Math.max(...step.output.map((value, d) => Math.abs(value - step.fullOutput[d]))));
    cache = cached.cache;
  });
});

test('all eight films have nonempty, ordered captions covering their full source duration', () => {
  for (const name of ['backprop', 'neuron', 'attention', 'descent', 'xor', 'rope', 'heads', 'generation']) {
    const duration = ['backprop', 'neuron'].includes(name) ? 44 : fixture(name).duration ?? 50;
    const captions = readFileSync(new URL(`../public/animations/${name}/captions.ru.vtt`, import.meta.url), 'utf8');
    assert.ok(captions.startsWith('WEBVTT'), name);
    const seconds = (stamp: string) => stamp.split(':').reduce((value, part) => value * 60 + Number(part), 0);
    const cues = [...captions.matchAll(/((?:\d{2}:)?\d{2}:\d{2}\.\d{3}) --> ((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\r?\n([^]*?)(?=\r?\n\r?\n|$)/g)];
    assert.ok(cues.length > 0, name);
    let end = 0;
    for (const cue of cues) {
      assert.equal(seconds(cue[1]), end, `${name}: caption gap or overlap`);
      end = seconds(cue[2]);
      assert.ok(end > seconds(cue[1]) && end <= duration, name);
      assert.ok(cue[3].trim().length > 0, `${name}: empty caption`);
    }
    assert.equal(end, duration, name);
  }
});
