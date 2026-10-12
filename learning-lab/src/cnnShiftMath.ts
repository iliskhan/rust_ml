import { conv2d } from './architectures.ts';

export const SHIFT_FILTER = [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]];

export function shiftRight(input: number[][], cells: number) {
  if (!Number.isInteger(cells) || cells < 0) throw new RangeError('Сдвиг должен быть целым неотрицательным числом.');
  return input.map(row => row.map((_, x) => row[x - cells] ?? 0));
}

export function cnnShiftComparison(input: number[][], stride: 1 | 2, padding: 0 | 1, cells: number, filter = SHIFT_FILTER) {
  const height = input.length, width = input[0]?.length ?? 0;
  const kh = filter.length, kw = filter[0]?.length ?? 0;
  if (!height || !width || input.some(row => row.length !== width) || !kh || !kw
    || filter.some(row => row.length !== kw) || ![...input.flat(), ...filter.flat()].every(Number.isFinite)
    || ![1, 2].includes(stride) || ![0, 1].includes(padding)) {
    throw new RangeError('Нужны прямоугольные конечные матрицы, stride 1/2 и padding 0/1.');
  }
  const shiftedInput = shiftRight(input, cells);
  const convolve = (values: number[][]) => conv2d([values], [[filter]], { stride, padding, dilation: 1 }).output[0];
  const output = convolve(input), shiftedOutput = convolve(shiftedInput);
  // A one-pixel input shift has no integer output shift at stride=2.
  // Floor is an explicitly approximate comparison, not an equivariance identity.
  const outputShift = Math.floor(cells / stride), aligned = cells % stride === 0;
  const expected = shiftRight(output, outputShift);
  const difference = shiftedOutput.map((row, y) => row.map((value, x) => value - expected[y][x]));
  const interior = difference.map((row, y) => row.map((_, x) => {
    const top = y * stride - padding, left = x * stride - padding;
    const referenceLeft = (x - outputShift) * stride - padding;
    return top >= 0 && top + kh <= height && left >= cells && left + kw <= width
      && x >= outputShift && referenceLeft >= 0 && referenceLeft + kw <= width;
  }));
  const values = difference.flatMap((row, y) => row.filter((_, x) => interior[y][x]));
  const edgeValues = difference.flatMap((row, y) => row.filter((_, x) => !interior[y][x]));
  return { shiftedInput, output, shiftedOutput, expected, difference, interior, aligned, outputShift,
    interiorCount: values.length, maxInteriorDifference: values.length ? Math.max(...values.map(Math.abs)) : null,
    maxEdgeDifference: edgeValues.length ? Math.max(...edgeValues.map(Math.abs)) : null };
}
