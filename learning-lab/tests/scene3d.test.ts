import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAxes, buildSceneGeometry, clipPolygon, clipSegment, inCube, normalizePoint, projectPoint, rotatePoint, sortByDepth, type SceneAxes, type ScenePrimitive, type Vec3 } from '../src/scene3dMath.ts';

const axes: SceneAxes = [{ label: 'x', min: -2, max: 2 }, { label: 'y', min: 10, max: 30 }, { label: 'z', min: 0, max: 100 }];
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const vectorClose = (actual: readonly number[], expected: readonly number[]) => actual.forEach((v, i) => close(v, expected[i]));
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, v, i) => sum + v * b[i], 0);

test('3D: independent scales map true data endpoints and midpoints into the cube', () => {
  assertAxes(axes);
  assert.deepEqual(normalizePoint([-2, 10, 0], axes), [-1, -1, -1]);
  assert.deepEqual(normalizePoint([0, 20, 50], axes), [0, 0, 0]);
  assert.deepEqual(normalizePoint([2, 30, 100], axes), [1, 1, 1]);
  assert.equal(normalizePoint([NaN, 20, 50], axes), null);
  assert.equal(inCube(normalizePoint([3, 20, 50], axes)!), false);
});

test('3D: orthographic camera has known front, yaw and top results', () => {
  vectorClose(rotatePoint([1, 2, 3], 0, 0), [1, 3, 2]);
  vectorClose(rotatePoint([1, 2, 3], 90, 0), [-2, 3, 1]);
  vectorClose(rotatePoint([1, 2, 3], 0, 90), [1, -2, 3]);
  assert.ok(rotatePoint([0, 1, 0], 0, 0)[2] > rotatePoint([0, -1, 0], 0, 0)[2]);
});

test('3D: camera preserves normalized-space norm and dot product at arbitrary angles', () => {
  const a: Vec3 = [.2, -.7, .4], b: Vec3 = [-.8, .6, .1];
  for (const yaw of [-180, -47, 0, 35, 180]) for (const pitch of [-85, 0, 25, 90]) {
    const ra = rotatePoint(a, yaw, pitch), rb = rotatePoint(b, yaw, pitch);
    close(dot(ra, ra), dot(a, a));
    close(dot(ra, rb), dot(a, b));
  }
});

test('3D: default projection fits every cube corner, including a narrow mobile viewport', () => {
  for (const width of [180, 220, 320, 720]) for (const yaw of [-175, -35, 0, 35, 140]) for (const pitch of [-85, 0, 25, 90]) {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const point = projectPoint([x, y, z], yaw, pitch, width, 280);
      assert.ok(point.x >= 39 && point.x <= width - 39);
      assert.ok(point.y >= 39 && point.y <= 241);
    }
  }
  const original = projectPoint([1, 0, 0], 0, 0, 320, 280);
  const zoomed = projectPoint([1, 0, 0], 0, 0, 320, 280, 1.5);
  close(zoomed.x - 160, (original.x - 160) * 1.5);
  close(zoomed.depth, original.depth);
});

test('3D: line clipping preserves crossing segments with two external endpoints', () => {
  assert.deepEqual(clipSegment([-2, 0, 0], [2, 0, 0]), [[-1, 0, 0], [1, 0, 0]]);
  assert.deepEqual(clipSegment([0, 0, 0], [2, 2, 2]), [[0, 0, 0], [1, 1, 1]]);
  assert.equal(clipSegment([-2, 2, 0], [2, 2, 0]), null);
  assert.equal(clipSegment([NaN, 0, 0], [0, 0, 0]), null);
  assert.deepEqual(clipSegment([1, 1, 1], [1, 1, 1]), [[1, 1, 1], [1, 1, 1]]);
});

test('3D: surface clipping preserves its boundary intersection', () => {
  const clipped = clipPolygon([[-2, -2, 0], [2, -2, 0], [2, 2, 0], [-2, 2, 0]]);
  assert.equal(clipped.length, 4);
  assert.ok(clipped.every(inCube));
  assert.deepEqual(new Set(clipped.map(p => p.join(','))), new Set(['-1,-1,0', '1,-1,0', '1,1,0', '-1,1,0']));
  assert.deepEqual(clipPolygon([[2, 2, 0], [3, 2, 0], [3, 3, 0]]), []);
  assert.deepEqual(clipPolygon([[NaN, 0, 0]]), []);
});

test('3D: all geometry types share depth ordering, with rear points behind surfaces', () => {
  const primitives: ScenePrimitive[] = [
    { kind: 'point', name: 'front', color: '', vertices: [[0, .8, 0]] },
    { kind: 'surface', name: 'surface', color: '', vertices: [[-1, 0, -1], [1, 0, -1], [0, 0, 1]] },
    { kind: 'point', name: 'rear', color: '', vertices: [[0, -.8, 0]] },
    { kind: 'line', name: 'line', color: '', vertices: [[-1, -.4, 0], [1, -.4, 0]] },
  ];
  assert.deepEqual(sortByDepth(primitives, 0, 0).map(p => p.name), ['rear', 'line', 'surface', 'front']);
  assert.deepEqual(sortByDepth(primitives, 180, 0).map(p => p.name), ['front', 'surface', 'line', 'rear']);
  assert.equal(primitives[0].name, 'front');
});

test('3D: geometry does not bridge invalid line samples and explicitly counts omissions', () => {
  const geometry = buildSceneGeometry({ axes,
    surfaces: [{ name: 'plane', rows: [[[-2, 10, 0], [2, 10, 0]], [[-2, 30, 100], [2, 30, 100]]] }],
    lines: [{ name: 'gap', points: [[0, 20, 50], [NaN, 20, 50], [2, 30, 100]] }],
    points: [{ name: 'inside', position: [0, 20, 50] }, { name: 'outside', position: [3, 20, 50] }],
  });
  assert.equal(geometry.invalid, 1);
  assert.equal(geometry.outside, 1);
  assert.equal(geometry.primitives.filter(p => p.kind === 'surface').length, 2);
  assert.equal(geometry.primitives.filter(p => p.kind === 'line').length, 0);
  assert.deepEqual(geometry.primitives.filter(p => p.kind === 'point').map(p => p.name), ['inside']);
});

test('3D: degenerate, reversed and nonfinite axes fail clearly instead of projecting NaNs', () => {
  for (const [min, max] of [[0, 0], [1, -1], [NaN, 1], [0, Infinity], [-Number.MAX_VALUE, Number.MAX_VALUE]]) {
    const invalidAxes: SceneAxes = [{ label: 'broken', min, max }, axes[1], axes[2]];
    assert.throws(() => assertAxes(invalidAxes), RangeError);
    assert.throws(() => buildSceneGeometry({ axes: invalidAxes }), RangeError);
  }
  assert.deepEqual(buildSceneGeometry({ axes }).primitives, []);
});
