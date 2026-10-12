import { conv2d } from './architectures.ts';

export type CnnParameters = { weights: number[][]; bias: number };
export const CNN_TRAINING_INPUT = [
  [0, 0, 1, 1, 1], [0, 0, 1, 1, 1], [0, 0, 1, 1, 1],
  [0, 0, 1, 1, 1], [0, 0, 1, 1, 1],
];
// An explicit label: 1 for windows crossing the vertical edge, 0 for uniform ones.
export const CNN_TRAINING_TARGET = [[1, 1, 0], [1, 1, 0], [1, 1, 0]];
export const copyCnnMatrix = (matrix: number[][]) => matrix.map(row => [...row]);
export const createCnnParameters = (): CnnParameters => ({ weights: Array.from({ length: 3 }, () => [0, 0, 0]), bias: 0 });

function matrixShape(matrix: number[][], name: string) {
  const height = matrix.length, width = matrix[0]?.length ?? 0;
  if (!height || !width || height > 32 || width > 32 || matrix.some(row => row.length !== width || !row.every(Number.isFinite))) {
    throw new RangeError(`${name}: нужна непустая прямоугольная матрица конечных чисел, не больше 32×32.`);
  }
  return { height, width };
}
function finite(values: number[]) {
  if (!values.every(Number.isFinite)) throw new RangeError('Числа слишком велики: результат расчёта не конечен.');
}

export type CnnWindow = {
  row: number; column: number; patch: number[][]; output: number; target: number;
  error: number; delta: number; weightContributions: number[][];
};

// One channel, one shared 3×3 kernel; valid cross-correlation, stride=dilation=1.
export function cnnLossGradient(input: number[][], target: number[][], parameters: CnnParameters) {
  const shape = matrixShape(input, 'Вход'), kernel = matrixShape(parameters.weights, 'Фильтр');
  const labels = matrixShape(target, 'Цель');
  if (kernel.height !== 3 || kernel.width !== 3 || shape.height < 3 || shape.width < 3) {
    throw new RangeError('Нужен фильтр 3×3 и вход не меньше 3×3.');
  }
  if (labels.height !== shape.height - 2 || labels.width !== shape.width - 2 || !Number.isFinite(parameters.bias)) {
    throw new RangeError('Цель должна совпадать с размером выхода (H−2)×(W−2), bias должен быть конечным.');
  }
  const prediction = conv2d([input], [[parameters.weights]], { stride: 1, padding: 0, dilation: 1, bias: [parameters.bias] }).output[0];
  const count = labels.height * labels.width;
  const error = prediction.map((row, y) => row.map((value, x) => value - target[y][x]));
  const weightGradient = Array.from({ length: 3 }, () => [0, 0, 0]);
  const inputGradient = input.map(row => row.map(() => 0));
  const windows: CnnWindow[] = [];
  let loss = 0, biasGradient = 0;
  prediction.forEach((row, y) => row.forEach((output, x) => {
    const residual = error[y][x], delta = 2 * residual / count;
    loss += residual ** 2 / count;
    biasGradient += delta;
    const patch = Array.from({ length: 3 }, (_, ky) => input[y + ky].slice(x, x + 3));
    const weightContributions = patch.map(row => row.map(value => delta * value));
    for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) {
      weightGradient[ky][kx] += weightContributions[ky][kx];
      // Overlapping windows add their contributions to the same input cell.
      inputGradient[y + ky][x + kx] += delta * parameters.weights[ky][kx];
    }
    windows.push({ row: y, column: x, patch, output, target: target[y][x], error: residual, delta, weightContributions });
  }));
  finite([loss, biasGradient, ...prediction.flat(), ...weightGradient.flat(), ...inputGradient.flat()]);
  return { prediction, error, loss, weightGradient, biasGradient, inputGradient, windows };
}

export function cnnSgdStep(input: number[][], target: number[][], parameters: CnnParameters, learningRate: number) {
  if (!Number.isFinite(learningRate) || learningRate <= 0 || learningRate > 1) throw new RangeError('Шаг SGD должен быть конечным числом: 0 < η ≤ 1.');
  const before = cnnLossGradient(input, target, parameters);
  const next = {
    weights: parameters.weights.map((row, y) => row.map((value, x) => value - learningRate * before.weightGradient[y][x])),
    bias: parameters.bias - learningRate * before.biasGradient,
  };
  // Validate the next calculation before returning any updated state.
  const after = cnnLossGradient(input, target, next);
  return { parameters: next, before, after };
}

export function checkCnnTrainingPractice(input: number[][], target: number[][], parameters: CnnParameters, steps: number, startingLoss = 2 / 3) {
  if (JSON.stringify(input) !== JSON.stringify(CNN_TRAINING_INPUT) || JSON.stringify(target) !== JSON.stringify(CNN_TRAINING_TARGET)) {
    return { passed: false, feedback: 'Верните исходные вход и цель кнопкой «Начать заново»: задание проверяет обучение на фиксированной карте.' };
  }
  const loss = cnnLossGradient(input, target, parameters).loss;
  const changed = parameters.weights.flat().some(value => value !== 0);
  const passed = Number.isSafeInteger(steps) && steps > 0 && changed && loss < 0.05 && Number.isFinite(startingLoss) && loss < startingLoss;
  return { passed, feedback: `Шагов SGD: ${steps}; MSE = ${loss.toFixed(6)}. ${passed ? 'Веса изменились, SGD снизил MSE и MSE < 0,05.' : 'Нужно снизить MSE шагами SGD в текущей истории и получить MSE < 0,05.'}` };
}
