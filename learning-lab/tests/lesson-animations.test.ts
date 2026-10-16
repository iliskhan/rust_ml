import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activate, activationDerivative, linear, finiteDifference } from '../src/math.ts';
import { attentionTrace, projectTokens, SMALL_INPUT, SMALL_PROJECTIONS } from '../src/transformerMath.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../animations/${name}/fixture.json`, import.meta.url), 'utf8'));
const near = (actual: number, expected: number, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test('neuron film matches the lab and both sides of ReLU', () => {
  const film = fixture('neuron');
  assert.deepEqual(film.inputs, [1, 2]);
  assert.deepEqual(film.weights, [1, -1]);
  assert.deepEqual(film.contributions, [1, -2]);
  for (const state of [film.initial, film.final]) {
    const z = linear([film.inputs], [film.weights], [state.bias])[0][0];
    assert.equal(state.z, z);
    assert.equal(state.output, activate(z, 'relu'));
    assert.equal(state.derivative, activationDerivative(z, 'relu'));
    near(finiteDifference(([bias]) => activate(linear([film.inputs], [film.weights], [bias])[0][0], 'relu'), [state.bias])[0], state.derivative, 1e-8);
  }
  assert.equal(film.initial.output, 0);
  assert.equal(film.final.output, 1);
  for (const point of film.curve) assert.equal(point.output, Math.max(0, point.z));
});

test('attention film preserves projections, mask, softmax and coordinate mixing', () => {
  const film = fixture('attention');
  assert.deepEqual(film.input, SMALL_INPUT);
  assert.deepEqual(film.projections, SMALL_PROJECTIONS);
  const q = projectTokens(film.input, film.projections.q);
  const k = projectTokens(film.input, film.projections.k);
  const v = projectTokens(film.input, film.projections.v);
  const trace = attentionTrace(q, k, v, film.options);
  assert.deepEqual(film.trace, JSON.parse(JSON.stringify(trace)));
  assert.deepEqual(film.allowed, trace.scores.map(row => row.map(Number.isFinite)));
  const row = film.queryIndex;
  assert.equal(row, 1);
  assert.deepEqual(trace.rawScores[row], [0.5, 1, 1.5]);
  assert.equal(film.trace.scores[row][2], null);
  assert.equal(trace.weights[row][2], 0);
  near(trace.weights[row].reduce((a, b) => a + b), 1);
  // Independent two-key softmax and weighted coordinates, without attentionTrace.
  const a0 = Math.exp(0.5 / Math.sqrt(2)) / (Math.exp(0.5 / Math.sqrt(2)) + Math.exp(1 / Math.sqrt(2)));
  near(trace.weights[row][0], a0);
  near(trace.output[row][0], a0 + (1 - a0) * 0.5);
  near(trace.output[row][1], 1 - a0);
  const unmasked = attentionTrace(q, k, v, { ...film.options, causal: false });
  assert.ok(unmasked.weights[row][2] > unmasked.weights[row][1]);
  assert.notDeepEqual(unmasked.output[row], trace.output[row]);
});

test('new films have ordered captions covering their source timelines', () => {
  for (const [name, duration] of [['neuron', 44], ['attention', 50]] as const) {
    const captions = readFileSync(new URL(`../public/animations/${name}/captions.ru.vtt`, import.meta.url), 'utf8');
    const seconds = (stamp: string) => stamp.split(':').reduce((value, part) => value * 60 + Number(part), 0);
    const cues = [...captions.matchAll(/((?:\d{2}:)?\d{2}:\d{2}\.\d{3}) --> ((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/g)];
    assert.ok(captions.startsWith('WEBVTT'));
    assert.ok(cues.length > 0);
    let previous = 0;
    for (const cue of cues) {
      assert.equal(seconds(cue[1]), previous);
      assert.ok(seconds(cue[2]) > previous);
      previous = seconds(cue[2]);
    }
    assert.equal(previous, duration);
  }
});
