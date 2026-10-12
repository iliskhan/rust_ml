import { policyGradientBandit, seededRandom } from './rlMath.ts';

/** One-step bandit: baseline is fixed before sampling and independent of the action. */
export function policyGradientMoments(theta: number, rewards: [number, number], baseline: number, count: number) {
  if (!Number.isFinite(baseline) || !Number.isInteger(count) || count < 1 || count > 1024) throw new RangeError('Нужны конечный baseline и 1–1024 наблюдения');
  const { right: p, gradient } = policyGradientBandit(theta, rewards, 0);
  const leftEstimate = (rewards[0] - baseline) * -p;
  const rightEstimate = (rewards[1] - baseline) * (1 - p);
  const mean = (1 - p) * leftEstimate + p * rightEstimate;
  const variance = (1 - p) * (leftEstimate - mean) ** 2 + p * (rightEstimate - mean) ** 2;
  return { p, gradient, mean, variance, meanVariance: variance / count, leftEstimate, rightEstimate,
    optimalBaseline: p * rewards[0] + (1 - p) * rewards[1] };
}

export function policyGradientSamples(theta: number, rewards: [number, number], baseline: number, count: number, seed: number, repeats = 80) {
  const moments = policyGradientMoments(theta, rewards, baseline, count);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(repeats) || repeats < 1 || repeats > 10000) throw new RangeError('Неверный seed или число повторов');
  // A stream per repetition gives the same first n actions when sample count grows.
  const means = Array.from({ length: repeats }, (_, i) => {
    const random = seededRandom((seed + Math.imul(i, 0x9e3779b9)) >>> 0);
    let sum = 0;
    for (let k = 0; k < count; k++) sum += random() < moments.p ? moments.rightEstimate : moments.leftEstimate;
    return sum / count;
  });
  const empiricalMean = means.reduce((sum, value) => sum + value, 0) / repeats;
  const empiricalVariance = means.reduce((sum, value) => sum + (value - empiricalMean) ** 2, 0) / repeats;
  return { ...moments, means, empiricalMean, empiricalVariance };
}

export function gradientHistogram(values: number[], domain: [number, number], bins = 12) {
  if (!values.every(Number.isFinite) || !domain.every(Number.isFinite) || domain[1] <= domain[0] || !Number.isInteger(bins) || bins < 1 || bins > 100) throw new RangeError('Неверные данные гистограммы');
  const width = (domain[1] - domain[0]) / bins;
  const rows = Array.from({ length: bins }, (_, i) => ({ min: domain[0] + width * i, max: domain[0] + width * (i + 1), count: 0 }));
  for (const value of values) {
    if (value < domain[0] || value > domain[1]) throw new RangeError('Оценка за пределами гистограммы');
    rows[Math.min(bins - 1, Math.floor((value - domain[0]) / width))].count++;
  }
  return rows;
}
