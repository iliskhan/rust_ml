import { createNetwork, createOptimizerState, optimizerStep, networkLossGradient, finiteDifference } from '../src/math.ts';

const results = [42, 7, 1, 1337].map(seed => {
  let state = createOptimizerState(createNetwork(seed));
  const initial = networkLossGradient(state.params);
  const numerical = finiteDifference(p => networkLossGradient(p).loss, state.params);
  const maxGradientError = Math.max(...numerical.map((v, i) => Math.abs(v - initial.grad[i])));
  for (let step = 0; step < 3000; step++) state = optimizerStep(state, networkLossGradient(state.params).grad, 'adam', { lr: 0.03 });
  const trained = networkLossGradient(state.params);
  return { seed, steps: state.step, initialLoss: initial.loss, trainedLoss: trained.loss, predictions: trained.predictions, maxGradientError };
});
console.log(JSON.stringify(results, null, 2));
