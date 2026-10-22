import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, initialWord2vec, WORD2VEC_CORPORA, word2vecData, word2vecLoss,
  word2vecStep, word2vecTrace, type Word2vecModel } from '../src/word2vecMath.ts';

const near = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test('Skip-gram makes directed pairs within each sentence, respecting window and positions', () => {
  const data = word2vecData(['Кот ест корм.', 'Пёс пьёт воду!'], 1);
  assert.deepEqual(data.vocabulary, ['кот', 'ест', 'корм', 'пёс', 'пьёт', 'воду']);
  assert.deepEqual(data.sentences, [[0, 1, 2], [3, 4, 5]]);
  assert.deepEqual(data.pairs.slice(0, 4), [
    { center: 0, context: 1, sentence: 0, position: 0, contextPosition: 1 },
    { center: 1, context: 0, sentence: 0, position: 1, contextPosition: 0 },
    { center: 1, context: 2, sentence: 0, position: 1, contextPosition: 2 },
    { center: 2, context: 1, sentence: 0, position: 2, contextPosition: 1 },
  ]);
  assert.equal(data.pairs.length, 8);
  const wide = word2vecData(['Кот ест корм.', 'Пёс пьёт воду!'], 2);
  assert.equal(wide.pairs.length, 12);
  assert.ok(wide.pairs.every(pair => wide.sentences[pair.sentence][pair.position] === pair.center
    && wide.sentences[pair.sentence][pair.contextPosition] === pair.context && pair.position !== pair.contextPosition));
  assert.equal(word2vecData(['кот кот'], 1).pairs.length, 2);
  assert.throws(() => word2vecData(['кот', 'пёс'], 1), RangeError);
  assert.throws(() => word2vecData(['кот ест'], 0), RangeError);
  assert.throws(() => word2vecData(['кот ест'], 1.5), RangeError);
});

test('Full-softmax analytic gradients match finite differences for both embedding tables', () => {
  const model = initialWord2vec(4), center = 1, context = 3, trace = word2vecTrace(model, center, context);
  near(trace.probabilities.reduce((sum, value) => sum + value, 0), 1);
  near(trace.loss, -Math.log(trace.probabilities[context]));
  for (const key of ['input', 'output'] as const) model[key].forEach((row, i) => row.forEach((value, d) => {
    const lossAt = (changed: number) => {
      const perturbed: Word2vecModel = { ...model, [key]: model[key].map((values, ri) => values.map((v, di) => ri === i && di === d ? changed : v)) };
      return word2vecTrace(perturbed, center, context).loss;
    };
    const numeric = (lossAt(value + 1e-5) - lossAt(value - 1e-5)) / 2e-5;
    near(numeric, key === 'input' ? i === center ? trace.inputGradient[d] : 0 : trace.outputGradient[i][d]);
  }));
  const snapshot = structuredClone(model), rate = .2, next = word2vecStep(model, { center, context }, rate);
  assert.deepEqual(model, snapshot);
  next.input.forEach((row, i) => row.forEach((value, d) => near(value, model.input[i][d] - rate * (i === center ? trace.inputGradient[d] : 0))));
  next.output.forEach((row, i) => row.forEach((value, d) => near(value, model.output[i][d] - rate * trace.outputGradient[i][d])));
  assert.ok(word2vecTrace(next, center, context).loss < trace.loss);
});

test('Softmax and cross entropy remain finite when target probability underflows', () => {
  const model = { input: [[100, 0], [0, 1]], output: [[100, 0], [-100, 0]] };
  const trace = word2vecTrace(model, 0, 1);
  assert.deepEqual(trace.probabilities, [1, 0]);
  assert.equal(trace.loss, 20000);
  assert.ok([...trace.inputGradient, ...trace.outputGradient.flat()].every(Number.isFinite));
  assert.throws(() => word2vecTrace(model, 2, 0), RangeError);
  assert.throws(() => word2vecTrace({ input: [[1, 2]], output: [[NaN, 0]] }, 0, 0), RangeError);
  assert.throws(() => word2vecStep(model, { center: 0, context: 1 }, 0), RangeError);
});

test('Deterministic SGD lowers mean corpus loss on both toy corpora and windows', () => {
  for (const corpus of WORD2VEC_CORPORA) for (const window of [1, 2]) {
    const { vocabulary, pairs } = word2vecData(corpus.sentences, window);
    let model = initialWord2vec(vocabulary.length);
    assert.deepEqual(model, initialWord2vec(vocabulary.length));
    const before = word2vecLoss(model, pairs);
    for (let epoch = 0; epoch < 100; epoch++) for (const pair of pairs) model = word2vecStep(model, pair, .05);
    assert.ok(word2vecLoss(model, pairs) < before - .2);
    assert.ok([...model.input, ...model.output].flat().every(Number.isFinite));
  }
  near(cosineSimilarity([1, 0], [0, 1]), 0);
  near(cosineSimilarity([1, 2], [2, 4]), 1);
  near(cosineSimilarity([1, 2], [-1, -2]), -1);
  assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
});
