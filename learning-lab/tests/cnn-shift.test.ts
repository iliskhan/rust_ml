import test from 'node:test';
import assert from 'node:assert/strict';
import { cnnShiftComparison, shiftRight } from '../src/cnnShiftMath.ts';

const ramp = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => 10 * y + x + 1));

test('stride one shift commutes on aligned interior, with padding edges explicitly excluded', () => {
  for (const padding of [0, 1] as const) {
    const result = cnnShiftComparison(ramp, 1, padding, 1);
    assert.equal(result.aligned, true);
    assert.ok(result.interiorCount > 0);
    assert.equal(result.maxInteriorDifference, 0);
    assert.equal(result.output[2][2], 6); // three rows × (right−left = 2)
  }
  const padded = cnnShiftComparison(ramp, 1, 1, 1);
  assert.ok(padded.maxEdgeDifference! > 0);
  assert.equal(padded.interior[0][0], false);
});

test('stride two one-cell shift changes the sampling phase, while two cells align', () => {
  const impulse = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => y === 3 && x === 3 ? 1 : 0));
  const odd = cnnShiftComparison(impulse, 2, 0, 1);
  assert.equal(odd.aligned, false);
  assert.equal(odd.outputShift, 0);
  assert.equal(odd.output[1][1], 0); // impulse lands on the zero centre weight
  assert.equal(odd.shiftedOutput[1][1], 1); // then the right weight
  assert.equal(odd.maxInteriorDifference, 1);
  const even = cnnShiftComparison(impulse, 2, 0, 2);
  assert.equal(even.aligned, true);
  assert.equal(even.outputShift, 1);
  assert.equal(even.maxInteriorDifference, 0);
});

test('zero input remains zero at either stride and shift clips rather than wraps', () => {
  assert.deepEqual(shiftRight([[1, 2, 3]], 1), [[0, 1, 2]]);
  assert.deepEqual(shiftRight([[1, 2, 3]], 3), [[0, 0, 0]]);
  const zeros = ramp.map(row => row.map(() => 0));
  for (const stride of [1, 2] as const) for (const padding of [0, 1] as const) {
    const result = cnnShiftComparison(zeros, stride, padding, 1);
    assert.equal(result.maxInteriorDifference, 0);
    assert.ok(result.difference.flat().every(value => value === 0));
  }
});
