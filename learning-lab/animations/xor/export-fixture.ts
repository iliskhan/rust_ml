import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createNetwork, createOptimizerState, networkLossGradient, optimizerStep, predictNetwork, XOR_DATA } from '../../src/math.ts';
import { traceNetwork } from '../../src/networkTrace.ts';

const config = { seed: 42, kind: 'adam' as const, lr: .03, steps: 1000, sample: 1 };
let state = createOptimizerState(createNetwork(config.seed));
const initial = { params: state.params, ...networkLossGradient(state.params) };
const history = [{ step: 0, loss: initial.loss }];
for (let step = 0; step < config.steps; step++) {
  state = optimizerStep(state, networkLossGradient(state.params).grad, config.kind, { lr: config.lr });
  if (state.step % 100 === 0) history.push({ step: state.step, loss: networkLossGradient(state.params).loss });
}
const final = { params: state.params, ...networkLossGradient(state.params) };
const sample = XOR_DATA[config.sample];
const trace = traceNetwork(final.params, sample.input, sample.target);
// Cells are samples of real probabilities, not an exact continuous boundary.
function grid(params: number[]) {
  return Array.from({ length: 14 }, (_, row) => Array.from({ length: 14 }, (_, column) => {
    const input: [number, number] = [(column + .5) / 14, (row + .5) / 14];
    return { input, probability: predictNetwork(params, input) };
  }));
}
assert.ok(final.loss < initial.loss);
assert.deepEqual(final.predictions.map(p => Number(p >= .5)), XOR_DATA.map(sample => sample.target));
assert.ok(Math.abs(trace.probability - final.predictions[config.sample]) < 1e-12);
assert.ok(Math.abs(trace.logit - (trace.outputContributions.reduce((a, b) => a + b, final.params[16]))) < 1e-12);
const fixture = { config, data: XOR_DATA, initial: { ...initial, grid: grid(initial.params) }, final: { ...final, grid: grid(final.params) }, trace, history };
writeFileSync(new URL('./fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`XOR fixture: seed42 Adam .03, 1000 steps, BCE ${initial.loss} → ${final.loss}; shared trace and all four classes verified.`);
