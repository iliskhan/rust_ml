import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionGrid, levelSegments } from '../src/decisionBoundaryMath.ts';
import { createNetwork, createOptimizerState, networkLossGradient, optimizerStep, predictNetwork, XOR_DATA } from '../src/math.ts';
import type { Vec3 } from '../src/scene3dMath.ts';

function close(actual: number, expected: number, tolerance = 1e-11) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function geometry(boundary: Array<readonly [Vec3, Vec3]>, threshold: number) {
  const segments = new Set<string>();
  const points = new Map<string, Vec3>();
  for (const [a, b] of boundary) {
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 0, 'нет нулевых отрезков');
    const key = [JSON.stringify(a), JSON.stringify(b)].sort().join('|');
    assert.ok(!segments.has(key), 'общий отрезок должен появиться один раз');
    segments.add(key);
    for (const point of [a, b]) {
      assert.ok(point.every(Number.isFinite));
      assert.ok(point[0] >= 0 && point[0] <= 1 && point[1] >= 0 && point[1] <= 1);
      assert.equal(point[2], threshold);
      const key = JSON.stringify(point);
      if (points.has(key)) assert.equal(point, points.get(key), 'общая вершина переиспользуется');
      points.set(key, point);
    }
  }
  return [...points.values()];
}

test('уровни известных аффинных функций: вертикаль, горизонталь, обе диагонали', () => {
  const cases = [
    { value: (x: number, _y: number) => x, threshold: .5, length: 1 },
    { value: (_x: number, y: number) => y, threshold: .37, length: 1 },
    { value: (x: number, y: number) => x + y, threshold: 1, length: Math.SQRT2 },
    { value: (x: number, y: number) => x - y, threshold: 0, length: Math.SQRT2 },
  ];
  for (const { value, threshold, length } of cases) {
    for (const resolution of [1, 7, 8, 40, 64]) {
      const boundary = levelSegments(value, threshold, resolution);
      assert.ok(boundary.length > 0);
      geometry(boundary, threshold).forEach(([x, y]) => close(value(x, y), threshold));
      close(boundary.reduce((sum, [a, b]) => sum + Math.hypot(a[0] - b[0], a[1] - b[1]), 0), length);
      assert.deepEqual(boundary, levelSegments(value, threshold, resolution));
    }
  }
});

test('бисекция проверяет исходную нелинейную функцию, а не линейную интерполяцию её значений', () => {
  const threshold = .2;
  for (const resolution of [1, 3, 16]) {
    const boundary = levelSegments(x => x * x, threshold, resolution);
    assert.ok(boundary.length > 0);
    geometry(boundary, threshold).forEach(([x]) => close(x, Math.sqrt(threshold), 1e-14));
  }
  const circle = levelSegments((x, y) => x * x + y * y, .5, 13);
  assert.ok(circle.length > 0);
  geometry(circle, .5).forEach(([x, y]) => close(x * x + y * y, .5, 1e-14));
  // Tiny function magnitudes must not be treated as an all-zero plateau by an absolute epsilon.
  const tiny = levelSegments(x => 1e-200 * x, 3e-201, 4);
  geometry(tiny, 3e-201).forEach(([x]) => close(x, .3, 1e-14));
  assert.ok(tiny.length > 0);
});

test('седло: концы отрезков точны, но хорды и топология внутри ячейки остаются приближением', () => {
  const saddle = (x: number, y: number) => (x - .5) * (y - .5);
  const exactAxes = levelSegments(saddle, 0, 8);
  geometry(exactAxes, 0).forEach(([x, y]) => close(saddle(x, y), 0));
  // Even grid-aligned axes can acquire extra chords beside all-level triangles at the saddle.
  // The analytical product bounds their error within one cell; do not claim exact topology.
  for (const [a, b] of exactAxes) {
    assert.ok(Math.abs(saddle((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) <= 1 / (4 * 8 ** 2));
  }
  assert.ok(exactAxes.some(segment => segment.some(([x, y]) => x === .5 && y === .5)));
  const coarse = levelSegments(saddle, 0, 1);
  assert.equal(coarse.length, 2);
  geometry(coarse, 0).forEach(([x, y]) => close(saddle(x, y), 0));
  // The exact crossing is invisible to corner samples; a chord does not claim exact topology.
  assert.ok(coarse.every(([a, b]) => Math.abs(saddle((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) > 0));
});

test('точный уровень на рёбрах области/вершинах не дублируется, плато и одиночное касание не создают сетку', () => {
  for (const threshold of [0, 1]) {
    const edges = levelSegments(x => x, threshold, 8);
    assert.equal(edges.length, 8);
    geometry(edges, threshold).forEach(([x]) => assert.equal(x, threshold));
  }
  for (const threshold of [.5 - 1e-12, .5, .5 + 1e-12]) {
    const boundary = levelSegments(x => x, threshold, 8);
    geometry(boundary, threshold).forEach(([x]) => close(x, threshold, 1e-14));
    close(boundary.reduce((sum, [a, b]) => sum + Math.hypot(a[0] - b[0], a[1] - b[1]), 0), 1);
  }
  for (const constant of [0, .5, 1]) assert.deepEqual(levelSegments(() => constant, .5, 8), []);
  assert.deepEqual(levelSegments((x, y) => x + y, -1, 8), []);
  assert.deepEqual(levelSegments((x, y) => (x - .5) ** 2 + (y - .5) ** 2, 0, 8), []);
  const plateau = levelSegments(x => Math.max(x - .5, 0), 0, 8);
  geometry(plateau, 0).forEach(([x]) => assert.equal(x, .5));
  assert.equal(plateau.length, 8, 'виден только край плато, без внутренних рёбер');
});

test('decisionGrid: упорядоченные x/y, настоящие вероятности и статистика узлов без изменения параметров', () => {
  for (const seed of [1, 7, 42, 1337]) {
    const parameters = createNetwork(seed), original = [...parameters];
    const grid = decisionGrid(parameters, .5, 8);
    assert.equal(grid.rows.length, 9);
    for (let row = 0; row <= 8; row++) {
      assert.equal(grid.rows[row].length, 9);
      for (let column = 0; column <= 8; column++) {
        assert.deepEqual(grid.rows[row][column], [column / 8, row / 8, predictNetwork(parameters, [column / 8, row / 8])]);
      }
    }
    const probabilities = grid.rows.flat().map(point => point[2]);
    assert.equal(grid.min, Math.min(...probabilities));
    assert.equal(grid.max, Math.max(...probabilities));
    assert.equal(grid.above, probabilities.filter(p => p > .5).length);
    assert.equal(grid.below, probabilities.filter(p => p < .5).length);
    assert.equal(grid.onThreshold, probabilities.filter(p => p === .5).length);
    assert.equal(grid.above + grid.below + grid.onThreshold, 81);
    geometry(grid.boundary, .5).forEach(([x, y]) => close(predictNetwork(parameters, [x, y]), .5, 1e-13));
    assert.deepEqual(parameters, original);
  }
  const neutral = decisionGrid(Array(17).fill(0), .5);
  assert.equal(neutral.rows.length, 41);
  assert.equal(neutral.min, .5);
  assert.equal(neutral.max, .5);
  assert.equal(neutral.above, 0);
  assert.equal(neutral.below, 0);
  assert.equal(neutral.onThreshold, 1681);
  assert.deepEqual(neutral.boundary, []);
  for (const bias of [-1000, 1000]) {
    const parameters = Array(17).fill(0);
    parameters[16] = bias;
    const grid = decisionGrid(parameters, .5, 4);
    assert.equal(grid.min, bias > 0 ? 1 : 0);
    assert.equal(grid.max, grid.min);
    assert.deepEqual(grid.boundary, []);
  }
});

test('граница обновляется после настоящего обучения XOR и при смене порога, обучение от порога не зависит', () => {
  for (const seed of [7, 42]) {
    let state = createOptimizerState(createNetwork(seed));
    const before = decisionGrid(state.params, .5, 12);
    for (let step = 0; step < 1500; step++) state = optimizerStep(state, networkLossGradient(state.params).grad, 'adam', { lr: .03 });
    const loss = networkLossGradient(state.params);
    assert.ok(loss.loss < .03);
    for (let index = 0; index < XOR_DATA.length; index++) assert.equal(Number(loss.predictions[index] >= .5), XOR_DATA[index].target);
    const after = decisionGrid(state.params, .5, 12);
    assert.notDeepEqual(after.rows, before.rows);
    assert.notDeepEqual(after.boundary, before.boundary);
    assert.ok(after.above > 0 && after.below > 0);
    for (const threshold of [.05, .5, .95]) {
      const grid = decisionGrid(state.params, threshold, 16);
      assert.ok(grid.boundary.length > 0);
      geometry(grid.boundary, threshold).forEach(([x, y]) => close(predictNetwork(state.params, [x, y]), threshold, 1e-12));
      assert.deepEqual(grid.rows, decisionGrid(state.params, .5, 16).rows);
    }
    assert.deepEqual(networkLossGradient(state.params), loss);
  }
});

test('валидация: формы, разреженные/нечисловые параметры, переполнение, пороги, размер сетки и callback', () => {
  const parameters = createNetwork();
  for (const invalid of [[], parameters.slice(1), [...parameters, 0], Array(17), parameters.map((p, i) => i === 1 ? NaN : p), parameters.map((p, i) => i === 1 ? Infinity : p)]) {
    assert.throws(() => decisionGrid(invalid, .5), RangeError);
  }
  for (const threshold of [0, 1, -.1, 1.1, NaN, Infinity]) assert.throws(() => decisionGrid(parameters, threshold), RangeError);
  for (const resolution of [0, -1, 1.5, 65, 1e6, Infinity, NaN]) {
    assert.throws(() => decisionGrid(parameters, .5, resolution), RangeError);
    assert.throws(() => levelSegments(x => x, .5, resolution), RangeError);
  }
  for (const threshold of [NaN, Infinity, -Infinity]) assert.throws(() => levelSegments(x => x, threshold), RangeError);
  for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => levelSegments(() => invalid, .5), RangeError);
  assert.throws(() => levelSegments(x => x === .5 ? NaN : x, .3, 1), RangeError, 'нечисло во время бисекции');
  for (const indices of [[0, 1], [12, 16]]) {
    const overflowing = Array(17).fill(0);
    indices.forEach(index => { overflowing[index] = Number.MAX_VALUE; });
    assert.throws(() => decisionGrid(overflowing, .5), RangeError, 'переполнение скрытое насыщением активации');
  }
});
