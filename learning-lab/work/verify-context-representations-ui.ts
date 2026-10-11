import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boundaryLossGradient, createBoundaryParameters, makeBoundaryDataset, traceBoundary, type BoundaryConfig, type BoundaryKind } from '../src/boundaryNetworkMath.ts';
import { createOptimizerState, optimizerStep, type OptimizerKind } from '../src/math.ts';
import { normalizePoint, projectPoint, type SceneAxes, type Vec3 } from '../src/scene3dMath.ts';
import { attentionTrace, projectTokens, SMALL_INPUT, SMALL_PROJECTIONS } from '../src/transformerMath.ts';

const root = new URL('../evidence/context-representations/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('ui-coordinate-cases.json', root), 'utf8'));
const near = (a: number, b: number, context: string) => assert.ok(Math.abs(a - b) <= 1e-10, `${context}: ${a} != ${b}`);
let maps = 0, samples = 0, scenePoints = 0;
for (const item of cases) {
  const e: { kind: BoundaryKind; seed: number; layers: BoundaryConfig['layers']; method: OptimizerKind; lr: number; steps: number } = item.expected;
  const config = { layers: e.layers }, data = makeBoundaryDataset(e.kind, e.seed);
  let model = createOptimizerState(createBoundaryParameters(config, e.seed));
  for (let i = 0; i < e.steps; i++) model = optimizerStep(model, boundaryLossGradient(model.params, config, data.train).grad, e.method, { lr: e.lr });
  assert.equal(item.step, e.steps);
  assert.equal(item.overflow, false); assert.equal(item.nonfinitePaths, 0);
  const known = new Map([...data.train.map((sample, i) => [`T${String(i + 1).padStart(3, '0')}`, sample] as const),
    ...data.validation.map((sample, i) => [`V${String(i + 1).padStart(3, '0')}`, sample] as const)]);
  assert.equal(item.inputPoints.length, 128);
  for (const point of item.inputPoints) {
    const expected = known.get(point.id)!;
    assert.ok(expected); near(point.x, expected.input[0], point.id); near(point.y, expected.input[1], point.id);
    assert.equal(point.target, expected.target);
    assert.equal(point.split, point.id.startsWith('T') ? 'train' : 'validation');
  }
  const layer = Number(item.layer), selected = item.selection, indices = selected.slice(1, 3).map((s: {value: string}) => Number(s.value));
  const probe: [number, number] = [item.plots[0].probe[0].x, item.plots[0].probe[0].y];
  for (let p = 0; p < item.plots.length; p++) {
    const plot = item.plots[p]; assert.equal(plot.points.length, 128); maps++;
    const dims = p === 0 ? [0, 1] : indices;
    const values = (input: [number, number]) => p === 0 ? input : traceBoundary(model.params, config, input).activations[layer];
    for (const point of plot.points) {
      const expected = known.get(point.id)!; const a = values(expected.input);
      near(point.x, a[dims[0]], `${item.name}/${point.id}/x`);
      if (point.y !== null) near(point.y, a[dims[1]], `${item.name}/${point.id}/y`);
      else assert.equal(e.layers[layer - 1].width, 1);
      assert.equal(point.target, expected.target); samples++;
    }
    near(plot.probe[0].x, values(probe)[dims[0]], `${item.name}/probe/x`);
    if (plot.probe[0].y !== null) near(plot.probe[0].y, values(probe)[dims[1]], `${item.name}/probe/y`);
  }
  if (item.scene) {
    const dimensions = [indices[0], indices[1], Number(selected[5].value)];
    assert.equal(new Set(dimensions).size, 3);
    const all = [...known.values()].map(s => traceBoundary(model.params, config, s.input).activations[layer]);
    const probeH = traceBoundary(model.params, config, probe).activations[layer];
    const axes = dimensions.map(d => {
      const min = Math.min(...all.map(a => a[d]), probeH[d]), max = Math.max(...all.map(a => a[d]), probeH[d]);
      const margin = (max - min || Math.max(1, Math.abs(min)) * .2) * .08;
      return { label: `h${d + 1}`, min: min - margin, max: max + margin };
    }) as unknown as SceneAxes;
    const [, , width, height] = item.scene.viewBox.split(' ').map(Number);
    assert.equal(item.scene.points.length, 129);
    for (const glyph of item.scene.points) {
      const id = glyph.name.split(' · ')[0]; const sample = known.get(id);
      const h = sample ? traceBoundary(model.params, config, sample.input).activations[layer] : probeH;
      const point = dimensions.map(d => h[d]) as unknown as Vec3;
      const position = projectPoint(normalizePoint(point, axes)!, item.scene.camera[0], item.scene.camera[1], width, height, item.scene.camera[2]);
      const xy = glyph.tag === 'circle' ? [Number(glyph.cx), Number(glyph.cy)] : glyph.d.match(/^M([^,]+),([^l]+)/).slice(1).map(Number);
      near(xy[0], position.x, `${id}/3D/x`); near(xy[1] + (glyph.tag === 'path' ? 5.5 : 0), position.y, `${id}/3D/y`);
      if (sample && !glyph.name.includes('общая проба')) {
        assert.equal(glyph.tag, sample.target ? 'path' : 'circle');
        assert.equal(glyph.fill === 'var(--paper)', id.startsWith('V'));
      }
      scenePoints++;
    }
  }
}
const snapshot = JSON.parse(readFileSync(new URL('mlp-snapshot.json', root), 'utf8'));
const firstCase = cases[0], e = firstCase.expected, config = {layers:e.layers};
const data = makeBoundaryDataset(e.kind, e.seed);
let model = createOptimizerState(createBoundaryParameters(config, e.seed));
for (let i = 0; i < 100; i++) model = optimizerStep(model, boundaryLossGradient(model.params, config, data.train).grad, e.method, {lr:e.lr});
const trace = traceBoundary(model.params, config, data.validation[6].input);
snapshot.rows.forEach((row: number[], i: number) => near(row[0], trace.activations[1][i], `snapshot/input/${i}`));
near(snapshot.outputs[1], trace.preactivations[1][0], 'snapshot/z');
near(snapshot.outputs[2], trace.activations[2][0], 'snapshot/h');
const attention = JSON.parse(readFileSync(new URL('attention-snapshot.json', root), 'utf8'));
const scores = attentionTrace(projectTokens(SMALL_INPUT, SMALL_PROJECTIONS.q), projectTokens(SMALL_INPUT, SMALL_PROJECTIONS.k),
  projectTokens(SMALL_INPUT, SMALL_PROJECTIONS.v), {causal:true,scale:true,temperature:2.7,allowedKeys:[true,true,false]});
attention.rows.forEach((row: string[], i: number) => {
  near(Number(row[0]), scores.scaledScores[2][i], `attention/score/${i}`);
  near(Number(row[4]), scores.weights[2][i], `attention/p/${i}`);
  assert.equal(row[1], i === 2 ? 'Запрещён' : 'Разрешён');
});
console.log(JSON.stringify({cases:cases.length,maps,samples,scenePoints,snapshot:'exact selected V007/step100/layer2/neuron1',attention:'exact scores/mask/p at T=2.7',result:'PASS'},null,2));
