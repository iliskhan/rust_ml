import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharedGraph, finiteDifference } from '../src/math.ts';

test('ManimGX fixture matches the live backprop calculation and numerical gradients', () => {
  const fixture = JSON.parse(readFileSync(new URL('../animations/backprop/fixture.json', import.meta.url), 'utf8'));
  const { x, w, target } = fixture.inputs;
  const graph = sharedGraph(x, w, target);
  assert.deepEqual(fixture, { inputs: { x, w, target }, ...graph });
  assert.deepEqual(fixture.qContributions, { square: 480, identity: 40 });
  const numerical = finiteDifference(([a, b]) => sharedGraph(a, b, target).values.loss, [x, w]);
  for (const [index, key] of (['x', 'w'] as const).entries()) {
    assert.ok(Math.abs(numerical[index] - fixture.gradients[key]) < 1e-5);
  }
});
