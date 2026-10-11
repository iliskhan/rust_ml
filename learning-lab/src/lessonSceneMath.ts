import { activate, mse, predictNetwork, quadratic, type Activation } from './math.ts';
import type { Vec3 } from './scene3dMath';

/** Two inputs and their actual function value; these are not three model inputs. */
export function functionSurface(xRange: readonly [number, number], yRange: readonly [number, number], value: (x: number, y: number) => number, segments = 20): Vec3[][] {
  if (![...xRange, ...yRange].every(Number.isFinite) || xRange[0] >= xRange[1] || yRange[0] >= yRange[1] || !Number.isInteger(segments) || segments < 1 || segments > 64) throw new RangeError('Поверхность: нужны конечные возрастающие диапазоны и 1–64 разбиения');
  return Array.from({ length: segments + 1 }, (_, row) => {
    const y = yRange[0] + row / segments * (yRange[1] - yRange[0]);
    return Array.from({ length: segments + 1 }, (_, column): Vec3 => {
      const x = xRange[0] + column / segments * (xRange[1] - xRange[0]), z = value(x, y);
      if (!Number.isFinite(z)) throw new RangeError('Поверхность: значение функции должно быть конечным');
      return [x, y, z];
    });
  });
}

export const quadraticHeight = (x: number, y: number) => quadratic([x, y]).loss;
export const neuronHeight = (x: number, y: number, w1: number, w2: number, bias: number, kind: Activation) => activate(x * w1 + y * w2 + bias, kind);
export const networkHeight = (x: number, y: number, parameters: number[]) => predictNetwork(parameters, [x, y]);
export const mseHeight = (a: number, b: number, third: number) => mse([a, b, third], [1, 2, 3]).loss;

export function quadraticTangent(x: number, y: number, atX: number, atY: number) {
  const { loss, grad } = quadratic([atX, atY]);
  return loss + grad[0] * (x - atX) + grad[1] * (y - atY);
}
