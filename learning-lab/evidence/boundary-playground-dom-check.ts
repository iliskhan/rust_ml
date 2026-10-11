import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boundaryLossGradient, boundaryMetrics, createBoundaryParameters, makeBoundaryDataset, predictBoundary, type BoundaryConfig, type BoundaryKind } from '../src/boundaryNetworkMath.ts';
import { createOptimizerState, optimizerStep, type OptimizerKind } from '../src/math.ts';
import { projectPoint, type Vec3 } from '../src/scene3dMath.ts';

// Replay the model against a captured real DOM. No playground component, probability-grid
// extractor, or replacement renderer is imported. Screenshot/UI checks remain separate.
type XY = readonly [number, number];
type Segment = readonly [XY, XY];
type Scene = { camera: [number, number, number]; viewBox: string; surfacePaths: string[]; planePaths: string[];
  contourPaths: Array<{ d: string; dashed: boolean }>; points: Array<{ name: string; cx: number; cy: number; fill: string }> };
type Case = { id?: string; kind: BoundaryKind; seed: number; config: BoundaryConfig; method: OptimizerKind;
  lr: number; step: number; threshold: number; probabilityColors?: boolean; projection?: boolean;
  cells: Array<{ x: number; y: number; p: number; fill: string }>;
  samples: Array<{ x: number; y: number; target: number; split: string }>;
  probe: string | { x: number; y: number; p: number }; readout: string | string[];
  scores: string | string[]; contour: string; viewBox: string; scene?: Scene };
const output: string[] = [];
const report = (value: unknown) => { const line = typeof value === 'string' ? value : JSON.stringify(value); output.push(line); console.log(line); };
const numeric = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const sha = (name: string) => createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex');
const normalized = (value: string | string[]) => (Array.isArray(value) ? value.join(' ') : value).replace(/\s+/gu, ' ').trim();
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const difference = (a: XY, b: XY) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
function close(actual: number, expected: number, tolerance = 1e-12, label = 'number') {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: finite values required`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}
function display(value: number, digits = 3) {
  if (value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 10000)) return value.toExponential(2);
  const rounded = Number(value.toFixed(digits));
  return (Object.is(rounded, -0) ? 0 : rounded).toLocaleString('ru-RU', { maximumFractionDigits: digits });
}
function containsNumber(text: string, value: number, digits: number) {
  const expected = normalized(display(value, digits));
  assert.match(text, new RegExp(`(?:^|[^0-9])${escaped(expected)}(?:$|[^0-9])`), `Displayed value ${expected} missing in ${text}`);
}
function parseSegments(path: string): Segment[] {
  const pattern = new RegExp(`M\\s*(${numeric}),\\s*(${numeric})\\s*L\\s*(${numeric}),\\s*(${numeric})`, 'gi');
  const matches = [...path.matchAll(pattern)];
  assert.equal(matches.map(match => match[0]).join('').replace(/\s/g, ''), path.replace(/\s/g, ''), 'Only checked M/L commands');
  return matches.map(match => [[Number(match[1]), Number(match[2])], [Number(match[3]), Number(match[4])]]);
}
function parseTriangle(path: string): XY[] {
  const pattern = new RegExp(`^M\\s*(${numeric}),\\s*(${numeric})\\s*L\\s*(${numeric}),\\s*(${numeric})\\s*L\\s*(${numeric}),\\s*(${numeric})\\s*Z$`, 'i');
  const match = path.trim().match(pattern);
  assert.ok(match, 'Every recorded surface facet is a closed triangle');
  return [[Number(match[1]), Number(match[2])], [Number(match[3]), Number(match[4])], [Number(match[5]), Number(match[6])]];
}
function viewBox(text: string) {
  const values = text.trim().split(/\s+/).map(Number);
  assert.equal(values.length, 4); assert.equal(values[0], 0); assert.equal(values[1], 0);
  assert.ok(values.every(Number.isFinite) && values[2] > 0 && values[3] > 0);
  return { width: values[2], height: values[3] };
}
function triangleSet(actual: string[], expected: XY[][], label: string) {
  assert.equal(actual.length, expected.length, `${label}: facet count`);
  const ordered = (triangle: XY[]) => [...triangle].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const key = (triangle: XY[]) => triangle.flat().map(value => Math.round(value * 1e6)).join(',');
  const available = new Map<string, XY[][]>();
  for (const triangle of expected.map(ordered)) {
    const id = key(triangle); const list = available.get(id) ?? []; list.push(triangle); available.set(id, list);
  }
  let maximumError = 0;
  for (const path of actual) {
    const triangle = ordered(parseTriangle(path)); const id = key(triangle); const candidates = available.get(id);
    assert.ok(candidates?.length, `${label}: unexpected projected triangle ${id}`);
    const index = candidates.findIndex(candidate => candidate.every((point, i) => difference(point, triangle[i]) < 1e-7));
    assert.ok(index >= 0, `${label}: projected vertices differ`);
    const [candidate] = candidates.splice(index, 1);
    maximumError = Math.max(maximumError, ...triangle.map((point, i) => difference(point, candidate[i])));
  }
  assert.ok([...available.values()].every(candidates => candidates.length === 0));
  return maximumError;
}
function probeData(probe: Case['probe']) {
  if (typeof probe !== 'string') return probe;
  const attribute = (name: string) => {
    const match = probe.match(new RegExp(`${name}="([^"]+)"`)); assert.ok(match, `Missing ${name}`); return Number(match[1]);
  };
  return { x: attribute('data-x'), y: attribute('data-y'), p: attribute('data-probability') };
}

try {
  const fixture = JSON.parse(readFileSync(new URL('./boundary-playground-browser.json', import.meta.url), 'utf8'));
  const cases: Case[] = Array.isArray(fixture) ? fixture : fixture.cases;
  assert.ok(Array.isArray(cases) && cases.length > 0, 'At least one captured DOM case is required');
  report({ timestamp: new Date().toISOString(), checkout: fileURLToPath(new URL('../../', import.meta.url)), node: process.version,
    command: 'node evidence/boundary-playground-dom-check.ts', baseline: '4ad0dddaf8bfbb051e8407c9342f0115a697282b', url: fixture.url, capturedCases: cases.length });
  for (const file of ['./boundary-playground-browser.json', './boundary-playground-dom-check.ts', '../src/boundaryNetworkMath.ts', '../src/math.ts', '../src/scene3dMath.ts', '../src/BoundaryPlayground.tsx', '../src/decisionBoundaryMath.ts', '../src/Scene3D.tsx']) report({ file, sha256: sha(file) });
  let totalCells = 0, totalSamples = 0, totalEndpoints = 0, totalSurfaceFacets = 0, totalPoints = 0;
  for (const [caseIndex, entry] of cases.entries()) {
    assert.ok(Number.isInteger(entry.step) && entry.step >= 0 && entry.step <= 4000);
    assert.ok(['sgd', 'momentum', 'adam'].includes(entry.method));
    const data = makeBoundaryDataset(entry.kind, entry.seed);
    let state = createOptimizerState(createBoundaryParameters(entry.config, entry.seed));
    for (let step = 0; step < entry.step; step++) state = optimizerStep(state, boundaryLossGradient(state.params, entry.config, data.train).grad, entry.method, { lr: entry.lr });
    const probability = (x: number, y: number) => predictBoundary(state.params, entry.config, [x, y]);
    assert.equal(entry.cells.length, 1089);
    let maximumCellError = 0;
    for (const [i, cell] of entry.cells.entries()) {
      close(cell.x, (i % 33) / 32); close(cell.y, Math.floor(i / 33) / 32);
      const p = probability(cell.x, cell.y); close(cell.p, p, 1e-12, 'cell probability'); maximumCellError = Math.max(maximumCellError, Math.abs(cell.p - p));
      const smooth = entry.probabilityColors ?? cell.fill.startsWith('hsl(');
      if (smooth) {
        const match = cell.fill.match(/^hsl\(153 32% ([\d.e+-]+)%\)$/i); assert.ok(match, 'Probability color has defined hue/saturation'); close(Number(match[1]), 97 - p * 54, 1e-10, 'probability color lightness');
      } else assert.equal(cell.fill, p >= entry.threshold ? '#c6dfd0' : '#e0ecf4', 'Actual rendered class fill');
    }
    const expectedSamples = [...data.train.map(sample => ({ ...sample, split: 'train' })), ...data.validation.map(sample => ({ ...sample, split: 'validation' }))];
    assert.equal(entry.samples.length, 128);
    expectedSamples.forEach((expected, i) => { const actual = entry.samples[i]; close(actual.x, expected.input[0]); close(actual.y, expected.input[1]); assert.equal(actual.target, expected.target); assert.equal(actual.split, expected.split); });
    const probe = probeData(entry.probe); const probeP = probability(probe.x, probe.y); close(probe.p, probeP);
    const readout = normalized(entry.readout); containsNumber(readout, probeP, 6);
    assert.match(readout, /p\(класс 1\)/);
    assert.match(readout, new RegExp(`Решение при τ\\s*=\\s*${escaped(display(entry.threshold, 2))}Класс`));
    assert.match(readout, new RegExp(`Класс\\s*${Number(probeP >= entry.threshold)}(?:$|[^0-9])`));
    const scoreText = normalized(entry.scores);
    const scoreParts = scoreText.split(/Проверка\s*·\s*validation/);
    assert.equal(scoreParts.length, 2, 'Both train and validation headings are recorded');
    assert.match(scoreParts[0], /Обучение\s*·\s*train/);
    const metrics = [boundaryMetrics(state.params, entry.config, data.train, entry.threshold), boundaryMetrics(state.params, entry.config, data.validation, entry.threshold)];
    metrics.forEach((metric, i) => { assert.match(scoreParts[i], new RegExp(`${metric.correct}\\s*\\/\\s*${metric.total}`)); containsNumber(scoreParts[i], 100 * metric.accuracy, 1); assert.match(scoreParts[i], new RegExp(`BCE:\\s*${escaped(display(metric.loss, 6))}(?:$|[^0-9])`)); });

    const map = viewBox(entry.viewBox), left = 34, right = map.width - 14, top = 27, bottom = top + right - left;
    close(map.height, bottom + 48);
    const contours: Segment[] = parseSegments(entry.contour).map(segment => segment.map(([x, y]) => [(x - left) / (right - left), (bottom - y) / (bottom - top)]) as unknown as Segment);
    let maximumEndpointResidual = 0;
    const seen = new Set<string>();
    for (const segment of contours) {
      assert.ok(difference(segment[0], segment[1]) > 1e-15, 'Contour segment has positive length');
      const key = segment.map(point => point.join(',')).sort().join('|'); assert.ok(!seen.has(key), 'No duplicate contour segment'); seen.add(key);
      for (const point of segment) {
        assert.ok(point.every(value => value >= -1e-12 && value <= 1 + 1e-12));
        const p = probability(Math.max(0, Math.min(1, point[0])), Math.max(0, Math.min(1, point[1])));
        maximumEndpointResidual = Math.max(maximumEndpointResidual, Math.abs(p - entry.threshold));
      }
    }
    assert.ok(maximumEndpointResidual < 2e-9, 'Real contour endpoints satisfy model probability=threshold');
    totalCells += entry.cells.length; totalSamples += entry.samples.length; totalEndpoints += contours.length * 2;
    report({ case: entry.id ?? caseIndex, kind: entry.kind, seed: entry.seed, config: entry.config, method: entry.method, lr: entry.lr, step: entry.step, threshold: entry.threshold, probabilityColors: entry.probabilityColors,
      cells: entry.cells.length, maximumCellError, samples: entry.samples.length, probe: [probe.x, probe.y, probeP], train: metrics[0], validation: metrics[1], contourSegments: contours.length, maximumEndpointResidual, status: '2D/model PASS' });

    if (entry.scene) {
      const scene = entry.scene, viewport = viewBox(scene.viewBox); assert.equal(scene.camera.length, 3); assert.ok(scene.camera.every(Number.isFinite));
      const [yaw, pitch, zoom] = scene.camera;
      const project = ([x, y, z]: Vec3): XY => { const point = projectPoint([2 * x - 1, 2 * y - 1, 2 * z - 1], yaw, pitch, viewport.width, viewport.height, zoom); return [point.x, point.y]; };
      const vertices = Array.from({ length: 33 }, (_, y) => Array.from({ length: 33 }, (_, x) => project([x / 32, y / 32, probability(x / 32, y / 32)])));
      const triangles: XY[][] = [];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const a = vertices[y][x], b = vertices[y][x + 1], c = vertices[y + 1][x + 1], d = vertices[y + 1][x]; triangles.push([a, b, c], [a, c, d]); }
      const surfaceError = triangleSet(scene.surfacePaths, triangles, 'Probability surface');
      const plane = [[0, 0, entry.threshold], [1, 0, entry.threshold], [1, 1, entry.threshold], [0, 1, entry.threshold]].map(point => project(point as unknown as Vec3));
      const planeError = triangleSet(scene.planePaths, [[plane[0], plane[1], plane[2]], [plane[0], plane[2], plane[3]]], 'Threshold plane');
      const projection = entry.projection ?? scene.contourPaths.some(path => path.dashed);
      const expectedLines = [false, ...(projection ? [true] : [])].flatMap(dashed => contours.map(segment => ({ dashed, points: segment.map(([x, y]) => project([Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)), dashed ? 0 : entry.threshold])) })));
      assert.equal(scene.contourPaths.length, expectedLines.length);
      let maximumLineError = 0;
      for (const path of scene.contourPaths) {
        const actual = parseSegments(path.d); assert.equal(actual.length, 1);
        let best = -1, error = Infinity;
        expectedLines.forEach((expected, i) => { if (expected.dashed !== path.dashed) return; const delta = Math.min(Math.max(difference(expected.points[0], actual[0][0]), difference(expected.points[1], actual[0][1])), Math.max(difference(expected.points[1], actual[0][0]), difference(expected.points[0], actual[0][1]))); if (delta < error) { error = delta; best = i; } });
        assert.ok(best >= 0 && error < 1e-7, `3D slice/floor mismatch: ${error}`); maximumLineError = Math.max(maximumLineError, error); expectedLines.splice(best, 1);
      }
      assert.equal(expectedLines.length, 0);
      assert.equal(scene.points.length, 129);
      const expectedPoints = [...expectedSamples.map(sample => ({ position: project([sample.input[0], sample.input[1], 0]), fill: sample.target === 0 ? '#27669a' : '#26724b', prefix: `${sample.split === 'train' ? 'Обучение' : 'Проверка'} · цель ${sample.target}`, coordinates: sample.input })), { position: project([probe.x, probe.y, probeP]), fill: '#694799', prefix: 'Проба · вероятность p', coordinates: null }];
      let maximumPointError = 0;
      for (const point of scene.points) {
        const name = normalized(point.name); const index = expectedPoints.findIndex(expected => expected.fill === point.fill && name.startsWith(expected.prefix) && difference(expected.position, [Number(point.cx), Number(point.cy)]) < 1e-7);
        assert.ok(index >= 0, `3D point position/target/split name mismatch: ${name}`); const [expected] = expectedPoints.splice(index, 1); maximumPointError = Math.max(maximumPointError, difference(expected.position, [Number(point.cx), Number(point.cy)]));
        expected.coordinates?.forEach(value => containsNumber(name, value, 3));
      }
      assert.equal(expectedPoints.length, 0);
      totalSurfaceFacets += triangles.length; totalPoints += scene.points.length;
      report({ case: entry.id ?? caseIndex, status: '3D PASS', camera: scene.camera, surfaceFacets: triangles.length, surfaceVertices: triangles.length * 3, surfaceError, planeVertices: 6, planeError, contourPaths: scene.contourPaths.length, maximumLineError, points: scene.points.length, maximumPointError });
    }
  }
  report({ status: 'PASS', cases: cases.length, totalCells, totalSamples, totalEndpoints, totalSurfaceFacets, totalPoints,
    limits: 'Captured settings only. Uses the separately gradient-checked engine and existing projection math. Does not certify unseen settings, contour chord interiors/topology, screenshot appearance, focus, or navigation.' });
} catch (error) {
  report(`FAIL: ${error instanceof Error ? error.stack : String(error)}`); process.exitCode = 1;
} finally {
  writeFileSync(new URL('./boundary-playground-dom-check.log', import.meta.url), `${output.join('\n')}\n`);
}
