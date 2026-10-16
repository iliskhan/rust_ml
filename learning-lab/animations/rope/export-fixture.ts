import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { rope, dotProduct } from '../../src/transformerMath.ts';

const q = [1, 0.5, 0.8, -0.4], k = [0.5, 1, -0.3, 0.9];
function state(queryPosition: number, keyPosition: number) {
  const rotatedQ = rope(q, queryPosition), rotatedK = rope(k, keyPosition);
  return { queryPosition, keyPosition, distance: keyPosition - queryPosition,
    rotatedQ, rotatedK, dot: dotProduct(rotatedQ, rotatedK),
    pairDot: dotProduct(rotatedQ.slice(0, 2), rotatedK.slice(0, 2)),
    qNorm: Math.hypot(...rotatedQ), kNorm: Math.hypot(...rotatedK) };
}
const raw = state(0, 0), initial = state(1, 3), shifted = state(3, 5), changed = state(3, 7);
assert.ok(Math.abs(initial.dot - shifted.dot) < 1e-12);
assert.ok(Math.abs(initial.dot - changed.dot) > 0.1);
for (const s of [initial, shifted, changed]) {
  assert.ok(Math.abs(s.qNorm - raw.qNorm) < 1e-12);
  assert.ok(Math.abs(s.kNorm - raw.kNorm) < 1e-12);
}
const fixture = { q, k, base: 10000, width: 4, shownPair: 0, pairFrequencies: [1, 0.01],
  options: { p: 1, distance: 2, shift: 0, pair: 0 },
  rotationAngles: { initialQ: 1, initialK: 3, commonShift: 2, keyOnly: 2 },
  raw, initial, shifted, changed, duration: 50,
  chapters: [0, 8, 18, 26, 38, 46], predictionAt: 20.5, answerAt: 26 };
writeFileSync(new URL('./fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('RoPE fixture: shared shift preserves the four-coordinate dot and both norms.');
