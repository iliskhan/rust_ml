import { gaussianDensity, vaeEncode } from './vaeGanMath.ts';
import { noisyDataDensity, type DiffusionSchedule } from './diffusionMath.ts';
import type { Vec3 } from './ThreeD.tsx';

const grid = (min: number, max: number, count: number) => Array.from({ length: count }, (_, i) => min + (max - min) * i / (count - 1));

/** Each row is a scalar conditional density, sampled within four of its own standard deviations. */
export function vaeDensityScene(parameters: number[], x: number, epsilon: number) {
  const xDomain = [-2, 3] as const;
  const row = (input: number, count: number): Vec3[] => {
    const { mu, sd } = vaeEncode(parameters, input);
    return grid(-4, 4, count).map(offset => {
      const z = mu + sd * offset;
      return [input, z, gaussianDensity(z, mu, sd)];
    });
  };
  const rows = grid(...xDomain, 25).map(input => row(input, 33));
  const slice = row(x, 65);
  const { mu, sd } = vaeEncode(parameters, x), z = mu + sd * epsilon;
  const sample: Vec3 = [x, z, gaussianDensity(z, mu, sd)];
  const mean: Vec3 = [x, mu, gaussianDensity(mu, mu, sd)];
  const positions = [...rows.flat(), ...slice, sample];
  const zDomain = [Math.min(...positions.map(p => p[1])), Math.max(...positions.map(p => p[1]))] as const;
  const densityMax = Math.max(...positions.map(p => p[2])) * 1.08;
  return { rows, slice, sample, mean, xDomain, zDomain, densityMax, mu, sd };
}

/** Time labels index distributions of one scalar; time is not another data coordinate. */
export function diffusionDensityScene(schedule: DiffusionSchedule, t: number) {
  const xDomain = [-4, 4] as const;
  const row = (time: number, count: number): Vec3[] => grid(...xDomain, count).map(x => [x, time, noisyDataDensity(x, time, schedule)]);
  const times = [...new Set(grid(0, schedule.steps, Math.min(33, schedule.steps + 1)).map(Math.round))];
  const rows = times.map(time => row(time, 33));
  const slice = row(t, 129);
  const densityMax = Math.max(...rows.flat().map(p => p[2]), ...slice.map(p => p[2])) * 1.08;
  return { rows, slice, xDomain, densityMax };
}
