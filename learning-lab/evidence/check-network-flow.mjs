// Checks captured, rendered table cells against the existing XOR trainer.
// Capture is made through real browser controls, never by modifying React state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNetwork, createOptimizerState, networkLossGradient, optimizerStep, XOR_DATA } from '../src/math.ts';
import { networkParameterName, traceNetwork } from '../src/networkTrace.ts';

const captured = JSON.parse(readFileSync(new URL('./network-flow-browser.json', import.meta.url), 'utf8'));
const display = value => value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 10000)
  ? value.toExponential(2)
  : Number(value.toFixed(5)).toLocaleString('ru-RU', { maximumFractionDigits: 5 });
let states = Object.fromEntries(['sgd', 'momentum', 'adam'].map(kind => [kind, createOptimizerState(createNetwork(42))]));
let checked = 0;
for (const observation of captured.finalBuildCases) {
  const before = states[observation.kind];
  assert.equal(observation.step, before.step + 1);
  const sample = XOR_DATA[observation.sample];
  const trace = traceNetwork(before.params, sample.input, sample.target);
  const batch = networkLossGradient(before.params);
  const after = optimizerStep(before, batch.grad, observation.kind, { lr: .03 });
  const expected = before.params.map((value, index) => [
    networkParameterName(index), display(value), display(trace.parameterGradient[index]),
    display(batch.grad[index]), display(after.params[index] - value), display(after.params[index]),
  ]);
  assert.deepEqual(observation.preview, expected, `${observation.kind}, step ${observation.step}: preview`);
  assert.deepEqual(observation.actual, expected, `${observation.kind}, step ${observation.step}: actual`);
  assert.ok(observation.training.startsWith(`Шаг ${after.step} · BCE ${display(networkLossGradient(after.params).loss)}`));
  states[observation.kind] = after;
  checked += expected.length * 5 * 2;
}
assert.equal(captured.finalBuildCases.length, 6);
console.log(`PASS: ${checked} rendered numeric cells, SGD/Momentum/Adam steps 1 and 2; preview equals actual.`);
