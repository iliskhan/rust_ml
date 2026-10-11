import test from 'node:test';
import assert from 'node:assert/strict';
import { probabilityGrid, decisionGrid, levelSegments } from '../src/decisionBoundaryMath.ts';
import { predictNetwork } from '../src/math.ts';

test('probability surface keeps exact vertex values and genuine callback roots', () => {
  const value = (x: number, y: number) => (x * x + y) / 2;
  const grid = probabilityGrid(value, 0.37, 12);
  assert.equal(grid.rows.length, 13);
  assert.equal(grid.min, 0);
  assert.equal(grid.max, 1);
  assert.equal(grid.above + grid.below + grid.onThreshold, 169);
  for (const row of grid.rows) for (const [x, y, p] of row) assert.equal(p, value(x, y));
  assert.ok(grid.boundary.length > 0);
  for (const segment of grid.boundary) for (const [x, y, z] of segment) {
    assert.equal(z, 0.37);
    assert.ok(Math.abs(value(x, y) - z) < 1e-14);
  }
});

test('generic probability grid preserves fixed XOR grid and generic level API', () => {
  const params = Array.from({ length: 17 }, (_, i) => Math.sin(i));
  assert.deepEqual(probabilityGrid((x, y) => predictNetwork(params, [x, y]), 0.63, 8), decisionGrid(params, 0.63, 8));
  assert.ok(levelSegments((x, y) => x + y - 4, -3, 4).length > 0);
});

test('probability surface rejects invalid probability at vertices and contour roots', () => {
  for (const invalid of [-1, 1.1, NaN, Infinity]) assert.throws(() => probabilityGrid(() => invalid, 0.5), RangeError);
  for (const threshold of [0, 1, NaN, Infinity]) assert.throws(() => probabilityGrid(() => 0.5, threshold), RangeError);
  assert.throws(() => probabilityGrid(() => 0.5, 0.5, 0), RangeError);
  assert.throws(() => probabilityGrid((x) => x === 0 || x === 1 ? x : 2, 0.5, 1), RangeError);
});
