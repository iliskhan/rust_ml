import test from 'node:test';
import assert from 'node:assert/strict';
import { cnnSpatialTrace, ropePairPath, ropePairPoint } from '../src/spatialSceneMath.ts';
import { conv2d } from '../src/architectures.ts';
import { dotProduct, rope } from '../src/transformerMath.ts';

const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const filter = [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]];
const input = Array.from({ length: 2 }, (_, c) => Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => c ? (x + y) % 2 : x < 2 ? 0 : 1)));

test('CNN stack preserves all 50 input values and exposes padding as separate zeros', () => {
  const trace = cnnSpatialTrace(input, filter, { stride: 1, padding: 1, dilation: 1 }, 0, 0);
  assert.equal(trace.cells.length, 50);
  assert.deepEqual(trace.cells[0], { position: [0, 0, 0], value: 0, selected: true });
  assert.deepEqual(trace.cells[49], { position: [4, 4, 1], value: 0, selected: false });
  assert.equal(trace.window.filter(cell => cell.padded).length, 10);
  assert.ok(trace.window.filter(cell => cell.padded).every(cell => cell.value === 0 && cell.term === 0));
  assert.deepEqual(trace.patches[1], [[0, 0, 0], [0, 0, 1], [0, 1, 0]]);
  assert.deepEqual(trace.contributions, [0, 1]);
  assert.equal(trace.contributions.reduce((a, b) => a + b, 0), conv2d(input, [[filter, filter]], { stride: 1, padding: 1, dilation: 1 }).output[0][0][0]);
});

test('CNN dilation marks nine actual samples per channel, not the intervening cells', () => {
  const trace = cnnSpatialTrace(input, filter, { stride: 1, padding: 0, dilation: 2 }, 0, 0);
  assert.deepEqual(trace.window.slice(0, 9).map(cell => cell.position), [[0, 0, 0], [2, 0, 0], [4, 0, 0], [0, 2, 0], [2, 2, 0], [4, 2, 0], [0, 4, 0], [2, 4, 0], [4, 4, 0]]);
  assert.equal(trace.cells.filter(cell => cell.selected).length, 18);
  assert.equal(trace.inWindow(1, 1), false);
  assert.equal(trace.inWindow(4, 4), true);
  assert.deepEqual(trace.contributions, [3, 0]);
});

test('CNN highlighted products agree with the existing convolution for every supported setting', () => {
  for (const channels of [1, 2]) for (const stride of [1, 2]) for (const padding of [0, 1, 2]) for (const dilation of [1, 2]) {
    const values = input.slice(0, channels), options = { stride, padding, dilation };
    const output = conv2d(values, [Array.from({ length: channels }, () => filter)], options);
    for (let y = 0; y < output.height; y++) for (let x = 0; x < output.width; x++) {
      const trace = cnnSpatialTrace(values, filter, options, y, x);
      close(trace.contributions.reduce((a, b) => a + b, 0), output.output[0][y][x]);
      assert.equal(trace.cells.length, channels * 25);
      assert.equal(trace.window.length, channels * 9);
      assert.ok(trace.cells.every(cell => cell.selected === trace.inWindow(cell.position[1], cell.position[0])));
    }
  }
});

test('RoPE scene uses the selected real pair, keeps radius, and labels position independently', () => {
  const vector = [1, 0, 1, 0], fast = ropePairPoint(vector, 0, Math.PI / 2), slow = ropePairPoint(vector, 1, Math.PI / 2);
  close(fast[0], Math.PI / 2); close(fast[1], 0); close(fast[2], 1);
  close(slow[1], 0.9998766324816606); close(slow[2], 0.015707317311820675);
  const values = [1, .5, .8, -.4];
  for (const pair of [0, 1]) {
    const path = ropePairPath(values, pair, -10, 50);
    assert.equal(path.length, 121);
    assert.equal(path[0][0], -10); assert.equal(path.at(-1)![0], 50);
    for (const [position, x, y] of path) {
      assert.ok(position >= -10 && position <= 50);
      close(Math.hypot(x, y), Math.hypot(values[2 * pair], values[2 * pair + 1]));
    }
  }
});

test('RoPE active markers preserve full attention dot product without adding the position axis', () => {
  const q = [1, .5, .8, -.4], k = [.5, 1, -.3, .9], p = 1, distance = 2, shift = 7;
  const query = [0, 1].flatMap(pair => ropePairPoint(q, pair, p + shift).slice(1));
  const key = [0, 1].flatMap(pair => ropePairPoint(k, pair, p + distance + shift).slice(1));
  close(dotProduct(query, key), dotProduct(rope(q, p), rope(k, p + distance)));
  close(Math.hypot(...query), Math.hypot(...q));
  assert.notEqual(dotProduct([p + shift, ...query], [p + distance + shift, ...key]), dotProduct(query, key));
});

test('Spatial helpers reject malformed shapes, nonfinite values and invalid sampling', () => {
  assert.throws(() => cnnSpatialTrace([], filter, { stride: 1, padding: 0, dilation: 1 }, 0, 0), RangeError);
  assert.throws(() => cnnSpatialTrace(input, filter, { stride: 1, padding: 0, dilation: 0 }, 0, 0), RangeError);
  assert.throws(() => ropePairPoint([1, 0, 1, 0], 2, 0), RangeError);
  assert.throws(() => ropePairPoint([1, 0], 0, Infinity), RangeError);
  assert.throws(() => ropePairPath([1, 0], 0, 2, 1), RangeError);
  assert.throws(() => ropePairPath([1, 0], 0, 0, 1, 10000), RangeError);
});
