import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createOptimizerState, optimizerStep, quadratic, type OptimizerKind } from '../../src/math.ts';

const start = [-3, 1.5];
const options = { lr: .12, momentum: .9, beta1: .9, beta2: .999 };
function trajectory(kind: OptimizerKind, lr: number, steps: number) {
  let state = createOptimizerState(start);
  const path = [{ step: 0, params: state.params, ...quadratic(state.params) }];
  for (let step = 0; step < steps; step++) {
    state = optimizerStep(state, quadratic(state.params).grad, kind, { ...options, lr });
    path.push({ step: state.step, params: state.params, ...quadratic(state.params) });
  }
  return path;
}
const tracks = Object.fromEntries((['sgd', 'momentum', 'adam'] as const).map(kind => [kind, trajectory(kind, options.lr, 20)]));
const fast = trajectory('sgd', .30, 4);
const contours = [1, 3, 6, 10].map(loss => ({ loss, points: Array.from({ length: 65 }, (_, i) => {
  const angle = i / 64 * Math.PI * 2;
  const point = [Math.sqrt(2 * loss) * Math.cos(angle), Math.sqrt(loss / 4) * Math.sin(angle)];
  assert.ok(Math.abs(quadratic(point).loss - loss) < 1e-10);
  return point;
}) }));
assert.ok(Math.abs(tracks.sgd[1].params[1] - .06) < 1e-12);
assert.ok(Math.abs(fast[1].params[1] + 2.1) < 1e-12);
assert.ok(fast[4].loss > fast[0].loss);
assert.ok(tracks.sgd.every((p, i) => i === 0 || p.loss < tracks.sgd[i - 1].loss));
const fixture = { start, options, steps: 20, tracks, fast: { lr: .30, path: fast }, contours };
writeFileSync(new URL('./fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('Descent fixture: exact shared optimizer trajectories, contours and stable/unstable assertions passed.');
