import test from 'node:test';
import assert from 'node:assert/strict';
import { GRAPH_ADJACENCY as A, GRAPH_FEATURES as X, GRAPH_LABELS as Y, GRAPH_TRAIN as TRAIN, normalizedGraph, graphMultiply, gcnForward, gcnLossAndGradient, initialGCN, gcnTrainStep, permutationError, smoothGraph, reachableNodes, graphAttention } from '../src/gnnMath.ts';
const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
test('GCN normalization adds self loops; irregular degrees are symmetric, not row probabilities', () => {
  const result = normalizedGraph([[0,1,0],[1,0,1],[0,1,0]]);
  assert.deepEqual(result.degrees, [2,3,2]);
  close(result.normalized[0][0], .5); close(result.normalized[0][1], 1 / Math.sqrt(6));
  close(result.normalized[1][1], 1 / 3); close(result.normalized[1][0], result.normalized[0][1]);
  const aggregate = graphMultiply(result.normalized, [[2],[3],[4]]);
  close(aggregate[0][0], 1 + 3 / Math.sqrt(6)); close(aggregate[1][0], 1 + 6 / Math.sqrt(6));
  assert.ok(Math.abs(result.normalized[0].reduce((a,b) => a+b,0) - 1) > .01);
});
test('isolated nodes retain own state with loops; no-loop isolates give zero, never NaN', () => {
  assert.deepEqual(normalizedGraph([[0]]).normalized, [[1]]);
  assert.deepEqual(normalizedGraph([[0]], false).normalized, [[0]]);
  assert.deepEqual(smoothGraph([[0]], [[3,-2]], 10).history.at(-1), [[3,-2]]);
  assert.deepEqual(reachableNodes(A,0,0),[0]); assert.deepEqual(reachableNodes(A,0,2),[0,1,2,3]);
});
test('all 12 trainable GCN coordinates match central differences of masked cross entropy', () => {
  const weights = initialGCN(), analytic = gcnLossAndGradient(A,X,Y,TRAIN,weights), h = 1e-5;
  for (const layer of ['first','second'] as const) weights[layer].forEach((row,i) => row.forEach((_,j) => {
    const plus = structuredClone(weights), minus = structuredClone(weights);
    plus[layer][i][j] += h; minus[layer][i][j] -= h;
    const numerical = (gcnLossAndGradient(A,X,Y,TRAIN,plus).loss - gcnLossAndGradient(A,X,Y,TRAIN,minus).loss) / (2*h);
    close(analytic.gradient[layer][i][j],numerical,1e-8);
  }));
  const changedHeldout = [...Y]; changedHeldout[1] = 1; changedHeldout[4] = 0;
  assert.deepEqual(gcnLossAndGradient(A,X,changedHeldout,TRAIN,weights).gradient,analytic.gradient);
});
test('two-layer training lowers real masked loss and predicts held-out default nodes', () => {
  let weights = initialGCN(); const before = gcnLossAndGradient(A,X,Y,TRAIN,weights).loss;
  for(let i=0;i<200;i++) weights = gcnTrainStep(A,X,Y,TRAIN,weights,.2).weights;
  const after = gcnLossAndGradient(A,X,Y,TRAIN,weights);
  assert.ok(after.loss < before / 10);
  for(const node of [1,4]) assert.equal(after.probabilities[node].indexOf(Math.max(...after.probabilities[node])),Y[node]);
  assert.deepEqual(gcnTrainStep(A,X,Y,TRAIN,weights,0).weights,weights);
});
test('permuting adjacency and features together permutes node predictions', () => {
  close(permutationError(A,X,initialGCN(),[3,0,5,2,1,4]).error,0);
  const trace = gcnForward(A,X,initialGCN()); trace.probabilities.forEach(row => close(row.reduce((a,b) => a+b,0),1));
  assert.ok(smoothGraph(A,X,60).dispersions.at(-1)! < 1e-6);
});
test('GAT uses only neighbors and self, exact uniform mean at zero attention coefficients', () => {
  const trace = graphAttention(A,X,0,0,0);
  assert.deepEqual(trace.neighbors,[0,1,2]); trace.attention.forEach(a => close(a,1/3));
  close(trace.output,(1.05+.9+.85)/3); close(trace.mean,trace.output);
  const isolated = graphAttention([[0]],[[2,4]],0,1,1);
  assert.deepEqual(isolated.attention,[1]); assert.deepEqual(isolated.neighborMean,[0,0]); close(isolated.output,4);
});
test('invalid graph inputs are rejected', () => {
  assert.throws(() => normalizedGraph([[0,1],[0,0]]),RangeError);
  assert.throws(() => normalizedGraph([[0,-1],[-1,0]]),RangeError);
  assert.throws(() => graphMultiply([[1,2]],[[1]]),RangeError);
  assert.throws(() => gcnLossAndGradient(A,X,Y,[],initialGCN()),RangeError);
  assert.throws(() => permutationError(A,X,initialGCN(),[0,0,1,2,3,4]),RangeError);
});
