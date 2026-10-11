import type { attentionTrace } from './transformerMath';

export type AttentionTrace = ReturnType<typeof attentionTrace>;

/** A square domain keeps lengths and angles comparable on both real axes. */
export function attentionGeometryDomain(points: number[][]) {
  const low = Math.min(0, ...points.flat());
  const high = Math.max(0, ...points.flat());
  const padding = Math.max(1, high - low) * .18;
  return { min: low - padding, max: high + padding };
}

export function attentionContributions(values: number[][], weights: number[]) {
  return values.map((value, j) => value.map(coordinate => weights[j] * coordinate));
}

export function selfAttentionChallenge(trace: AttentionTrace, query: number, causal: boolean) {
  if (query !== 0) return { passed: false, message: 'Выберите запрос позиции 0: «кот». Цель относится именно к первой позиции.' };
  if (!causal) return { passed: false, message: 'Включите Causal. Низкая температура может почти обнулить доли, но не запрещает будущие связи.' };
  const onlySelf = Number.isFinite(trace.scores[0][0]) && trace.scores[0].slice(1).every(score => score === -Infinity);
  const exactWeights = trace.weights[0][0] === 1 && trace.weights[0].slice(1).every(weight => weight === 0);
  const sameOutput = trace.output[0].every((value, d) => value === trace.v[0][d]);
  return onlySelf && exactWeights && sameOutput
    ? { passed: true, message: 'Готово: маска разрешает только ключ 0, доли равны [1; 0; 0], а выход точно равен V₀. Причина — запрет будущих связей, а не величина score.' }
    : { passed: false, message: 'Пока выход не подтверждает цель: нужны разрешённый ключ 0, запрещённые ключи 1 и 2, доли [1; 0; 0] и выход V₀.' };
}
