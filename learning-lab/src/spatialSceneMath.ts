import { rope } from './transformerMath.ts';
import type { ConvOptions } from './architectures.ts';
import type { Vec3 } from './scene3dMath.ts';

/** The third coordinate is the channel index, never a third spatial dimension. */
export function cnnSpatialTrace(input: number[][][], filter: number[][], options: Pick<ConvOptions, 'stride' | 'padding' | 'dilation'>, oy: number, ox: number) {
  const { stride, padding, dilation } = options;
  const height = input[0]?.length ?? 0, width = input[0]?.[0]?.length ?? 0;
  const kh = filter.length, kw = filter[0]?.length ?? 0;
  if (!height || !width || !kh || !kw || ![stride, padding, dilation, oy, ox].every(Number.isInteger)
    || stride < 1 || padding < 0 || dilation < 1 || oy < 0 || ox < 0
    || input.some(channel => channel.length !== height || channel.some(row => row.length !== width))
    || filter.some(row => row.length !== kw) || ![...input.flat(2), ...filter.flat()].every(Number.isFinite)) {
    throw new RangeError('CNN: нужны прямоугольные конечные данные и допустимое окно.');
  }
  const inWindow = (y: number, x: number) => {
    const ky = (y - oy * stride + padding) / dilation, kx = (x - ox * stride + padding) / dilation;
    return Number.isInteger(ky) && Number.isInteger(kx) && ky >= 0 && ky < kh && kx >= 0 && kx < kw;
  };
  const window = input.flatMap((channel, c) => filter.flatMap((row, ky) => row.map((weight, kx) => {
    const y = oy * stride - padding + ky * dilation, x = ox * stride - padding + kx * dilation;
    const padded = y < 0 || y >= height || x < 0 || x >= width;
    const value = padded ? 0 : channel[y][x];
    return { position: [x, y, c] as Vec3, value, weight, term: value * weight, padded };
  })));
  const patches = input.map((_, c) => Array.from({ length: kh }, (_, ky) => window.slice(c * kh * kw + ky * kw, c * kh * kw + (ky + 1) * kw).map(cell => cell.value)));
  const contributions = input.map((_, c) => window.slice(c * kh * kw, (c + 1) * kh * kw).reduce((sum, cell) => sum + cell.term, 0));
  const cells = input.flatMap((channel, c) => channel.flatMap((row, y) => row.map((value, x) => ({ position: [x, y, c] as Vec3, value, selected: inWindow(y, x) }))));
  return { cells, window, patches, contributions, inWindow };
}

/** Position is a plot axis only; rotating and measuring vectors still uses their original coordinates. */
export function ropePairPoint(value: number[], pair: number, position: number): Vec3 {
  if (!Number.isInteger(pair) || pair < 0 || pair >= value.length / 2) throw new RangeError('RoPE: неверная пара координат.');
  const rotated = rope(value, position);
  return [position, rotated[2 * pair], rotated[2 * pair + 1]];
}

export function ropePairPath(value: number[], pair: number, start: number, end: number, samples = 121): Vec3[] {
  if (![start, end].every(Number.isFinite) || end <= start || !Number.isInteger(samples) || samples < 2 || samples > 501) throw new RangeError('RoPE: неверный диапазон позиций или число образцов.');
  return Array.from({ length: samples }, (_, i) => ropePairPoint(value, pair, start + (end - start) * i / (samples - 1)));
}
