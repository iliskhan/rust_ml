import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { advanceBoundaryExperiment, decodeBoundaryWorkspace, restoreBoundaryRun } from '../src/boundaryExperiment.ts';
import { predictBoundary } from '../src/boundaryNetworkMath.ts';

test('real v1 browser export preserves weights and the exact next optimizer step', () => {
  const raw = readFileSync(new URL('../evidence/training-labs/boundary-v1-step450.json', import.meta.url), 'utf8');
  // Captured with the unchanged v1 implementation at 490162f before mini-batch integration.
  const expected = JSON.parse(readFileSync(new URL('../evidence/training-labs/boundary-v1-reference.json', import.meta.url), 'utf8'));
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const workspace = decodeBoundaryWorkspace(raw);
  const restored = restoreBoundaryRun(workspace.current);
  assert.equal(restored.auto, false);
  assert.equal(restored.remaining, 0);
  assert.equal(restored.optimizer.step, expected.step);
  assert.equal(hash(restored.optimizer), expected.currentOptimizerSha256);
  assert.equal(workspace.slots.A?.optimizer.step, 100);
  assert.equal(workspace.slots.B?.optimizer.step, 100);
  const next = advanceBoundaryExperiment(restored, 1);
  assert.equal(next.error, null);
  assert.equal(next.optimizer.step, expected.nextStep);
  assert.equal(hash(next.optimizer), expected.nextOptimizerSha256);
  assert.equal(predictBoundary(next.optimizer.params, next.settings.config, workspace.current.probe), expected.nextProbeProbability);
});
