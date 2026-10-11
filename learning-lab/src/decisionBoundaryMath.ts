import { predictNetwork } from './math.ts';
import type { Vec3 } from './scene3dMath.ts';

export type DecisionGrid = {
  rows: Vec3[][];
  boundary: Array<readonly [Vec3, Vec3]>;
  min: number;
  max: number;
  above: number;
  below: number;
  onThreshold: number;
};

function sampleGrid(value: (x: number, y: number) => number, threshold: number, segments: number) {
  if (!Number.isFinite(threshold) || !Number.isInteger(segments) || segments < 1 || segments > 64) {
    throw new RangeError('Граница: нужен конечный порог и целое число делений от 1 до 64');
  }
  const evaluate = (x: number, y: number) => {
    const z = value(x, y);
    if (!Number.isFinite(z)) throw new RangeError('Граница: функция должна возвращать конечное число');
    return z;
  };
  const rows = Array.from({ length: segments + 1 }, (_, y) =>
    Array.from({ length: segments + 1 }, (_, x): Vec3 => [x / segments, y / segments, evaluate(x / segments, y / segments)]));
  return { rows, evaluate };
}

/** Sampled level set on [0,1]²; each cell uses its lower-left → upper-right diagonal. */
function contour(rows: Vec3[][], evaluate: (x: number, y: number) => number, threshold: number) {
  const boundary: Array<readonly [Vec3, Vec3]> = [];
  const roots = new Map<string, Vec3>();
  const points = new Map<string, Vec3>();
  const emitted = new Set<string>();
  const pointKey = (point: Vec3) => `${point[0]},${point[1]}`;
  const intern = (point: Vec3) => {
    const key = pointKey(point);
    if (!points.has(key)) points.set(key, [point[0], point[1], threshold]);
    return points.get(key)!;
  };
  const crossing = (a: Vec3, b: Vec3): Vec3 => {
    const key = [pointKey(a), pointKey(b)].sort().join('|');
    const cached = roots.get(key);
    if (cached) return cached;
    let low = a, high = b;
    // Refine the actual function, not a linearly interpolated probability.
    for (let iteration = 0; iteration < 52; iteration++) {
      const x = (low[0] + high[0]) / 2, y = (low[1] + high[1]) / 2;
      if ((x === low[0] && y === low[1]) || (x === high[0] && y === high[1])) break;
      const middle: Vec3 = [x, y, evaluate(x, y)];
      if (middle[2] === threshold) { low = high = middle; break; }
      if ((middle[2] < threshold) === (low[2] < threshold)) low = middle;
      else high = middle;
    }
    const closest = Math.abs(low[2] - threshold) <= Math.abs(high[2] - threshold) ? low : high;
    const root = intern([closest[0], closest[1], threshold]);
    roots.set(key, root);
    return root;
  };
  for (let y = 0; y < rows.length - 1; y++) {
    for (let x = 0; x < rows[y].length - 1; x++) {
      const [a, b, c, d] = [rows[y][x], rows[y][x + 1], rows[y + 1][x + 1], rows[y + 1][x]];
      for (const triangle of [[a, b, c], [a, c, d]]) {
        // A plateau is an area, not an arbitrary collection of its grid edges.
        if (triangle.every(point => point[2] === threshold)) continue;
        const hits = triangle.filter(point => point[2] === threshold).map(intern);
        for (let edge = 0; edge < 3; edge++) {
          const start = triangle[edge], end = triangle[(edge + 1) % 3];
          if ((start[2] < threshold && end[2] > threshold) || (start[2] > threshold && end[2] < threshold)) {
            hits.push(crossing(start, end));
          }
        }
        if (hits.length !== 2 || pointKey(hits[0]) === pointKey(hits[1])) continue;
        const key = hits.map(pointKey).sort().join('|');
        if (!emitted.has(key)) { emitted.add(key); boundary.push([hits[0], hits[1]]); }
      }
    }
  }
  return boundary;
}

/**
 * Endpoint roots follow the continuous callback. Chords/topology remain a grid approximation:
 * subcell loops and isolated tangencies can be missed; saddle connectivity follows the diagonal.
 * Edges between exact-level vertices appear once; all-level triangles contribute no edges.
 */
export function levelSegments(value: (x: number, y: number) => number, threshold: number, segments = 40): Array<readonly [Vec3, Vec3]> {
  const { rows, evaluate } = sampleGrid(value, threshold, segments);
  return contour(rows, evaluate, threshold);
}

/** Z and extrema/counts are predictions at grid vertices; counts are not class areas. */
export function decisionGrid(parameters: number[], threshold: number, segments = 40): DecisionGrid {
  if (parameters.length !== 17 || !Array.from(parameters).every(Number.isFinite)) {
    throw new RangeError('Граница XOR: нужны 17 конечных параметров');
  }
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new RangeError('Граница XOR: порог должен быть строго между 0 и 1');
  }
  // Bound every affine accumulation on [0,1]², including sums hidden by tanh/sigmoid saturation.
  const bounds = Array.from({ length: 4 }, (_, j) => Math.abs(parameters[2 * j]) + Math.abs(parameters[2 * j + 1]) + Math.abs(parameters[8 + j]));
  bounds.push(parameters.slice(12).reduce((sum, parameter) => sum + Math.abs(parameter), 0));
  if (!bounds.every(Number.isFinite)) throw new RangeError('Граница XOR: переполнение суммы параметров');
  const { rows, evaluate } = sampleGrid((x, y) => predictNetwork(parameters, [x, y]), threshold, segments);
  let min = Infinity, max = -Infinity, above = 0, below = 0, onThreshold = 0;
  for (const row of rows) {
    for (const [, , probability] of row) {
      min = Math.min(min, probability);
      max = Math.max(max, probability);
      if (probability > threshold) above++;
      else if (probability < threshold) below++;
      else onThreshold++;
    }
  }
  return { rows, boundary: contour(rows, evaluate, threshold), min, max, above, below, onThreshold };
}
