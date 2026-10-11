import { activate, bceLogit } from './math.ts';

function finite(values: number[]) {
  if (values.some(value => !Number.isFinite(value))) throw new Error('Ожидаются конечные числа');
}
function normalParameters(mu: number, sigma: number) {
  finite([mu, sigma]);
  if (sigma <= 0) throw new Error('Стандартное отклонение должно быть положительным');
}
export function normalLogDensity(x: number, mu = 0, sigma = 1) {
  finite([x]); normalParameters(mu, sigma);
  return -.5 * Math.log(2 * Math.PI) - Math.log(sigma) - .5 * ((x - mu) / sigma) ** 2;
}
export function normalDensity(x: number, mu = 0, sigma = 1) { return Math.exp(normalLogDensity(x, mu, sigma)); }
export function normalScore(x: number, mu = 0, sigma = 1) {
  finite([x]); normalParameters(mu, sigma);
  return -(x - mu) / (sigma * sigma);
}
export function normalKL(muQ: number, sigmaQ: number, muP = 0, sigmaP = 1) {
  normalParameters(muQ, sigmaQ); normalParameters(muP, sigmaP);
  return Math.log(sigmaP / sigmaQ) + (sigmaQ ** 2 + (muQ - muP) ** 2) / (2 * sigmaP ** 2) - .5;
}
export function reparameterize(mu: number, logVariance: number, epsilon: number) {
  finite([mu, logVariance, epsilon]);
  const sigma = Math.exp(logVariance / 2);
  if (!Number.isFinite(sigma) || sigma === 0) throw new Error('Дисперсия вне представимого диапазона');
  return { sigma, z: mu + sigma * epsilon, dMu: 1, dLogVariance: .5 * sigma * epsilon };
}

// A scalar Gaussian model gives exact expectations, so the ELBO gap can be checked.
export function gaussianVariational(x: number, mu: number, sigma: number, observationSigma: number) {
  finite([x]); normalParameters(mu, sigma); normalParameters(0, observationSigma);
  const tau2 = observationSigma ** 2;
  const posteriorMu = x / (1 + tau2), posteriorSigma = Math.sqrt(tau2 / (1 + tau2));
  const expectedLogLikelihood = -.5 * Math.log(2 * Math.PI) - Math.log(observationSigma)
    - ((x - mu) ** 2 + sigma ** 2) / (2 * tau2);
  const klPrior = normalKL(mu, sigma);
  const elbo = expectedLogLikelihood - klPrior;
  const logEvidence = normalLogDensity(x, 0, Math.sqrt(1 + tau2));
  return { posteriorMu, posteriorSigma, expectedLogLikelihood, klPrior, elbo, logEvidence,
    gap: logEvidence - elbo, klPosterior: normalKL(mu, sigma, posteriorMu, posteriorSigma) };
}
export function adversarialLosses(logit: number) {
  finite([logit]);
  const probability = activate(logit, 'sigmoid'), positive = bceLogit(logit, 1), negative = bceLogit(logit, 0);
  return { probability, discriminatorFake: negative.loss, nonSaturating: positive.loss,
    minimax: -negative.loss, nonSaturatingGradient: positive.grad, minimaxGradient: -negative.grad };
}
export function noiseMarginal(x0: number, alphaBar: number, epsilon: number) {
  finite([x0, alphaBar, epsilon]);
  if (alphaBar < 0 || alphaBar > 1) throw new Error('alphaBar должна лежать между 0 и 1');
  const signal = Math.sqrt(alphaBar) * x0, noise = Math.sqrt(1 - alphaBar) * epsilon;
  return { signal, noise, value: signal + noise, mean: signal, variance: 1 - alphaBar };
}
export function discountedReturn(rewards: number[], gamma: number) {
  finite([...rewards, gamma]);
  if (gamma < 0 || gamma > 1) throw new Error('gamma должна лежать между 0 и 1');
  const terms = rewards.map((reward, index) => gamma ** index * reward);
  return { terms, value: terms.reduce((sum, term) => sum + term, 0) };
}
export function bellmanExample(probability: number, reward: number, nextValue: number, gamma: number, terminal: boolean) {
  finite([probability, reward, nextValue, gamma]);
  if (probability < 0 || probability > 1 || gamma < 0 || gamma > 1) throw new Error('Вероятность и gamma должны лежать между 0 и 1');
  const success = reward + (terminal ? 0 : gamma * nextValue);
  // The alternative branch terminates with zero reward: no bootstrap remains there.
  return { success, failure: 0, value: probability * success };
}
export function twoNodeMessages(a: number, b: number, connected: boolean, steps: number) {
  finite([a, b, steps]);
  if (!Number.isInteger(steps) || steps < 0 || steps > 20) throw new Error('Ожидается от 0 до 20 шагов');
  const history: [number, number][] = [[a, b]];
  for (let step = 0; step < steps; step++) {
    const [left, right] = history.at(-1)!;
    history.push(connected ? [(left + right) / 2, (left + right) / 2] : [left, right]);
  }
  return history;
}
