import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createNetwork, createOptimizerState, networkLossGradient, optimizerStep, predictNetwork, XOR_DATA } from '../src/math.ts';
import { projectPoint, type Vec3 } from '../src/scene3dMath.ts';

// Validates a captured production DOM against the unchanged trainer and projection math.
// This checker does not import the new decision-boundary extractor or render a replacement UI.
type Point2 = readonly [number, number];
type Segment2 = readonly [Point2, Point2];
type Evidence = {
  camera: [number, number, number]; contour: string; corners: string[][]; fills: string[];
  lr: number; optimizer: string; planeFacets: number; planePaths: string[]; pointNames: string[];
  probe: [number, number]; readout: string[]; sceneViewBox: string; seed: number;
  slicePaths: Array<{ d: string; dashed: boolean }>; step: number; threshold: number;
  url: string; viewBox: string; width: number;
};
const output: string[] = [];
const report = (value: unknown) => { const line = typeof value === 'string' ? value : JSON.stringify(value); output.push(line); console.log(line); };
const sha256 = (name: string) => createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex');
const numberPattern = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';

function segments(path: string): Segment2[] {
  const expression = new RegExp(`M\\s*(${numberPattern}),\\s*(${numberPattern})\\s*L\\s*(${numberPattern}),\\s*(${numberPattern})`, 'gi');
  const matches = [...path.matchAll(expression)];
  assert.equal(matches.map(match => match[0]).join('').replace(/\s/g, ''), path.replace(/\s/g, ''), 'SVG path only contains checked M/L segments');
  return matches.map(match => [[Number(match[1]), Number(match[2])], [Number(match[3]), Number(match[4])]]);
}

function decimal(text: string) {
  const value = Number(text.trim().replace(',', '.'));
  assert.ok(Number.isFinite(value), `Not a displayed number: ${text}`);
  return value;
}

function roundedSix(text: string, actual: number) {
  assert.match(text, /^[-+]?\d+,\d{6}$/, 'The recorded probability/margin has six decimal places');
  const difference = Math.abs(decimal(text) - actual);
  assert.ok(difference <= .500001e-6, `Six-place rounding mismatch: DOM ${text}, expected ${actual}`);
  return difference;
}

try {
  const evidence = JSON.parse(readFileSync(new URL('./decision-boundary-browser-numbers.json', import.meta.url), 'utf8')) as Evidence;
  report({ timestamp: new Date().toISOString(), checkout: fileURLToPath(new URL('../../', import.meta.url)), node: process.version,
    command: 'node evidence/decision-boundary-dom-check.ts', baseline: 'a52273cdf3e67593aadb3a69cbfe6086166dcd18', url: evidence.url });
  for (const name of ['./decision-boundary-browser-numbers.json', '../src/math.ts', '../src/scene3dMath.ts', '../src/decisionBoundaryMath.ts', '../src/DecisionBoundaryLesson.tsx', '../src/Scene3D.tsx', './decision-boundary-dom-check.ts']) {
    report({ file: name, sha256: sha256(name) });
  }
  assert.equal(evidence.seed, 42);
  assert.equal(evidence.optimizer, 'adam');
  assert.equal(evidence.lr, .03);
  assert.equal(evidence.step, 101);
  assert.equal(evidence.threshold, .5);
  assert.deepEqual(evidence.probe, [.23, .67]);
  assert.deepEqual(evidence.camera, [36, 25, 1]);

  let state = createOptimizerState(createNetwork(evidence.seed));
  for (let step = 0; step < evidence.step; step++) {
    state = optimizerStep(state, networkLossGradient(state.params).grad, 'adam', { lr: evidence.lr });
  }
  const probability = predictNetwork(state.params, evidence.probe);
  assert.equal(evidence.readout.length, 4);
  const probeRoundingError = roundedSix(evidence.readout[0], probability);
  assert.equal(decimal(evidence.readout[1]), evidence.threshold);
  const marginRoundingError = roundedSix(evidence.readout[2], probability - evidence.threshold);
  assert.equal(evidence.readout[3], `Класс ${Number(probability >= evidence.threshold)}`);
  assert.equal(evidence.corners.length, 4);
  const cornerProbabilities: number[] = [];
  const cornerRoundingErrors: number[] = [];
  XOR_DATA.forEach(({ input, target }, index) => {
    const row = evidence.corners[index];
    assert.deepEqual(row.slice(0, 2), [input.join('; '), String(target)]);
    const predicted = predictNetwork(state.params, input);
    cornerProbabilities.push(predicted);
    cornerRoundingErrors.push(roundedSix(row[2], predicted));
    const predictedClass = Number(predicted >= evidence.threshold);
    assert.equal(row[3], `${predictedClass} · ${predictedClass === target ? 'верно' : 'ошибка'}`);
  });
  report({ check: 'probe/corners: PASS', probability, probeRoundingError, marginRoundingError, cornerProbabilities, cornerRoundingErrors });

  const expectedFills: string[] = [];
  for (let y = 0; y <= 40; y++) for (let x = 0; x <= 40; x++) {
    expectedFills.push(predictNetwork(state.params, [x / 40, y / 40]) >= evidence.threshold ? '#b9d9c5' : '#dce9f1');
  }
  assert.equal(evidence.fills.length, 1681);
  assert.deepEqual(evidence.fills, expectedFills, 'Every rendered cell uses the actual network class in row-major x/y order');
  report({ check: '1681 rendered classes: PASS', class0: evidence.fills.filter(fill => fill === '#dce9f1').length,
    class1: evidence.fills.filter(fill => fill === '#b9d9c5').length });

  const [mapX, mapY, mapWidth, mapHeight] = evidence.viewBox.split(' ').map(Number);
  assert.equal(mapX, 0); assert.equal(mapY, 0);
  const left = 36, top = 29, right = mapWidth - 16, bottom = top + right - left;
  assert.equal(mapHeight, bottom + 52);
  const contourPixels = segments(evidence.contour);
  assert.equal(contourPixels.length, 84);
  const contour: Segment2[] = contourPixels.map(segment => segment.map(([x, y]) =>
    [(x - left) / (right - left), (bottom - y) / (bottom - top)]) as unknown as Segment2);
  let maximumEndpointResidual = 0;
  const seen = new Set<string>();
  for (const [a, b] of contour) {
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) > 0, 'No zero-length 2D contour segment');
    const key = [a.join(','), b.join(',')].sort().join('|');
    assert.ok(!seen.has(key), 'No duplicate 2D segment'); seen.add(key);
    for (const [x, y] of [a, b]) {
      assert.ok(x >= -1e-12 && x <= 1 + 1e-12 && y >= -1e-12 && y <= 1 + 1e-12, 'DOM contour inside input domain');
      maximumEndpointResidual = Math.max(maximumEndpointResidual, Math.abs(predictNetwork(state.params, [x, y]) - evidence.threshold));
    }
  }
  assert.ok(maximumEndpointResidual < 1e-12);
  report({ check: 'inverted real 2D SVG contour: PASS', segments: contour.length, endpoints: contour.length * 2, maximumEndpointResidual });

  const [sceneX, sceneY, sceneWidth, sceneHeight] = evidence.sceneViewBox.split(' ').map(Number);
  assert.equal(sceneX, 0); assert.equal(sceneY, 0);
  const [yaw, pitch, zoom] = evidence.camera;
  const expectedPaths = [false, true].flatMap(dashed => contour.map(segment => ({ dashed, points: segment.map(([x, y]) => {
    const normalized: Vec3 = [2 * x - 1, 2 * y - 1, 2 * (dashed ? 0 : evidence.threshold) - 1];
    const point = projectPoint(normalized, yaw, pitch, sceneWidth, sceneHeight, zoom);
    return [point.x, point.y] as Point2;
  }) as unknown as Segment2 })));
  assert.equal(evidence.slicePaths.length, 168);
  assert.equal(evidence.slicePaths.filter(path => path.dashed).length, 84);
  let maximumProjectionError = 0;
  const unmatched = [...expectedPaths];
  const pointDifference = (a: Point2, b: Point2) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  for (const path of evidence.slicePaths) {
    const actual = segments(path.d);
    assert.equal(actual.length, 1);
    let bestIndex = -1, bestError = Infinity;
    unmatched.forEach((expected, index) => {
      if (expected.dashed !== path.dashed) return;
      const error = Math.min(
        Math.max(pointDifference(actual[0][0], expected.points[0]), pointDifference(actual[0][1], expected.points[1])),
        Math.max(pointDifference(actual[0][0], expected.points[1]), pointDifference(actual[0][1], expected.points[0])));
      if (error < bestError) { bestIndex = index; bestError = error; }
    });
    assert.ok(bestIndex >= 0 && bestError < 1e-8, `Unmatched real 3D ${path.dashed ? 'floor' : 'slice'} path; error=${bestError}`);
    maximumProjectionError = Math.max(maximumProjectionError, bestError);
    unmatched.splice(bestIndex, 1);
  }
  assert.equal(unmatched.length, 0);
  assert.equal(evidence.planeFacets, 2);
  assert.equal(evidence.planePaths.length, 2);
  const sortPoints = (points: Point2[]) => [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const planeCorners: Point2[] = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => {
    const point = projectPoint([2 * x - 1, 2 * y - 1, 2 * evidence.threshold - 1], yaw, pitch, sceneWidth, sceneHeight, zoom);
    return [point.x, point.y];
  });
  const unmatchedTriangles = [[planeCorners[0], planeCorners[1], planeCorners[2]], [planeCorners[0], planeCorners[2], planeCorners[3]]].map(sortPoints);
  let maximumPlaneProjectionError = 0;
  for (const path of evidence.planePaths) {
    const expression = new RegExp(`^M\\s*(${numberPattern}),\\s*(${numberPattern})\\s*L\\s*(${numberPattern}),\\s*(${numberPattern})\\s*L\\s*(${numberPattern}),\\s*(${numberPattern})\\s*Z$`, 'i');
    const match = path.trim().match(expression);
    assert.ok(match, 'Every threshold-plane facet is a closed triangle');
    const actual = sortPoints([[Number(match[1]), Number(match[2])], [Number(match[3]), Number(match[4])], [Number(match[5]), Number(match[6])]]);
    assert.ok(actual.every(point => point.every(Number.isFinite)));
    let bestIndex = -1, bestError = Infinity;
    unmatchedTriangles.forEach((expected, index) => {
      const error = Math.max(...actual.map((point, vertex) => pointDifference(point, expected[vertex])));
      if (error < bestError) { bestIndex = index; bestError = error; }
    });
    assert.ok(bestIndex >= 0 && bestError < 1e-8, `Threshold-plane vertices do not project from the corners at z=tau: error=${bestError}`);
    maximumPlaneProjectionError = Math.max(maximumPlaneProjectionError, bestError);
    unmatchedTriangles.splice(bestIndex, 1);
  }
  assert.equal(unmatchedTriangles.length, 0);
  report({ check: 'actual threshold-plane vertices: PASS', triangles: 2, checkedVertices: 6, z: evidence.threshold, maximumPlaneProjectionError });
  const expectedPointNames = [...XOR_DATA.map(({ input, target }) => `[${input.join('; ')}] · цель ${target} · класс ${Number(predictNetwork(state.params, input) >= evidence.threshold)}`), 'Выбранная точка · выход p'].sort();
  assert.deepEqual([...evidence.pointNames].sort(), expectedPointNames);
  report({ check: 'actual 3D SVG slice/floor: PASS', slicePaths: 84, floorPaths: 84, planeFacets: evidence.planeFacets,
    camera: evidence.camera, viewport: [sceneWidth, sceneHeight], maximumProjectionError, pointNames: '5/5 correct' });
  report('PASS. No numerical/geometry mismatch in this captured production DOM. Scope: seed42, Adam lr=.03, step101, threshold=.5, probe [.23,.67], desktop width1280. Both threshold-plane triangles match the input-domain corners at z=tau. Screenshot appearance is checked separately; chord interiors/topology remain sampled approximations.');
} catch (error) {
  report(`FAIL: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  writeFileSync(new URL('./decision-boundary-dom-check.log', import.meta.url), `${output.join('\n')}\n`);
}
