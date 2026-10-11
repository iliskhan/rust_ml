import test from 'node:test';
import assert from 'node:assert/strict';
import { diffusionDensityScene, vaeDensityScene } from '../src/generativeSceneMath.ts';
import { gaussianDensity, VAE_INITIAL, vaeEncode, vaeTrace, vaeTrainStep } from '../src/vaeGanMath.ts';
import { diffusionSchedule, noisyDataDensity } from '../src/diffusionMath.ts';

const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const trapezoid = (points: readonly (readonly number[])[], coordinate: number) => points.slice(1).reduce((sum, point, i) => sum + (point[coordinate] - points[i][coordinate]) * (point[2] + points[i][2]) / 2, 0);

test('VAE scene is a family of scalar conditional densities with an independently known Gaussian peak', () => {
  const scene = vaeDensityScene([0, 0, 0, 0, 0, 0], 1.1, .5);
  assert.equal(scene.rows.length, 25);
  assert.equal(scene.rows[0].length, 33);
  assert.deepEqual(scene.xDomain, [-2, 3]);
  assert.deepEqual(scene.zDomain, [-4, 4]);
  for (const row of scene.rows) {
    close(row[16][1], 0);
    close(row[16][2], 1 / Math.sqrt(2 * Math.PI));
    close(trapezoid(row, 1), .9999366575163338, 6e-6);
  }
  close(scene.sample[1], .5);
  close(scene.sample[2], Math.exp(-.125) / Math.sqrt(2 * Math.PI));
  close(trapezoid(scene.slice, 1), .9999366575163338, 2e-6);
});

test('VAE selected slice and sample exactly use the lesson encoder and reparameterization', () => {
  const scene = vaeDensityScene(VAE_INITIAL, -.73, -1.2), trace = vaeTrace(VAE_INITIAL, -.73, -1.2);
  close(scene.mu, trace.mu); close(scene.sd, trace.sd); close(scene.sample[1], trace.z);
  for (const [x, z, density] of scene.slice) {
    close(x, -.73);
    close(density, gaussianDensity(z, trace.mu, trace.sd));
  }
  for (const row of scene.rows) {
    const q = vaeEncode(VAE_INITIAL, row[0][0]);
    close(row[0][1], q.mu - 4 * q.sd);
    close(row.at(-1)![1], q.mu + 4 * q.sd);
  }
  const changedNoise = vaeDensityScene(VAE_INITIAL, -.73, 2.5);
  assert.deepEqual(scene.rows, changedNoise.rows);
  assert.deepEqual(scene.slice, changedNoise.slice);
  assert.notDeepEqual(scene.sample, changedNoise.sample);
});

test('VAE surface remains finite and resolves its peak after real training at several beta values', () => {
  for (const beta of [0, 1, 4]) {
    let parameters = [...VAE_INITIAL];
    for (let step = 0; step < 300; step++) parameters = vaeTrainStep(parameters, step, .015, beta).parameters;
    assert.notDeepEqual(parameters, VAE_INITIAL);
    for (const x of [-2, .15, 3]) {
      const scene = vaeDensityScene(parameters, x, 2.5);
      assert.ok([...scene.rows.flat(), ...scene.slice, scene.sample].every(p => p.every(Number.isFinite)));
      assert.ok(scene.zDomain[1] > scene.zDomain[0] && scene.densityMax > 0);
      close(trapezoid(scene.slice, 1), .9999366575163338, 2e-6);
      close(scene.slice[32][1], scene.mu);
      close(scene.slice[32][2], 1 / (scene.sd * Math.sqrt(2 * Math.PI)));
      assert.ok(scene.sample[1] >= scene.zDomain[0] && scene.sample[1] <= scene.zDomain[1]);
    }
  }
});

test('diffusion surface uses real integer times and the original mixture at t=0', () => {
  const schedule = diffusionSchedule(), scene = diffusionDensityScene(schedule, 0);
  assert.equal(scene.rows.length, 33);
  assert.equal(scene.rows[0].length, 33);
  assert.deepEqual(scene.rows.map(row => row[0][1]), Array.from({ length: 33 }, (_, i) => 2 * i));
  const peak = scene.slice.find(p => p[0] === 1.5)!;
  close(peak[2], (1 + Math.exp(-(3 ** 2) / (2 * .28 ** 2))) / (2 * .28 * Math.sqrt(2 * Math.PI)));
  close(trapezoid(scene.slice, 0), 1, 1e-10);
});

test('diffusion slice matches the exact current distribution, including odd times and both schedules', () => {
  for (const kind of ['linear', 'cosine'] as const) {
    const schedule = diffusionSchedule(kind);
    for (const t of [0, 1, 25, 63, 64]) {
      const scene = diffusionDensityScene(schedule, t);
      for (const [x, time, density] of [...scene.rows.flat(), ...scene.slice]) {
        assert.ok(Number.isInteger(time) && time >= 0 && time <= 64);
        close(density, noisyDataDensity(x, time, schedule));
        close(density, noisyDataDensity(-x, time, schedule));
        assert.ok(Number.isFinite(density) && density >= 0);
      }
      assert.ok(scene.slice.every(p => p[1] === t));
      const mass = trapezoid(scene.slice, 0);
      assert.ok(mass > .9998 && mass <= 1 + 1e-10, `visible probability mass at ${kind}, t=${t}: ${mass}`);
    }
  }
});

test('diffusion schedule changes the surface while a different slice keeps the same surface', () => {
  const schedule = diffusionSchedule('linear');
  assert.deepEqual(diffusionDensityScene(schedule, 1).rows, diffusionDensityScene(schedule, 63).rows);
  assert.notDeepEqual(diffusionDensityScene(schedule, 1).rows, diffusionDensityScene(diffusionSchedule('cosine'), 1).rows);
  assert.throws(() => diffusionDensityScene(schedule, .5), RangeError);
  assert.throws(() => diffusionDensityScene(schedule, 65), RangeError);
});
