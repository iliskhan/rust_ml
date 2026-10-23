import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, initialWord2vec, WORD2VEC_CORPORA, word2vecData, word2vecLoss,
  word2vecStep, word2vecTrace, word2vecExamples, word2vecExampleTrace, word2vecExampleStep, word2vecExampleLoss,
  word2vecNegatives, word2vecNoiseDistribution, type Word2vecModel, type Word2vecObjective } from '../src/word2vecMath.ts';

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

test('CBOW groups all same-window neighbors around each target, including repeated words', () => {
  const data = word2vecData(['кот ест кот корм', 'пёс пьёт воду'], 1);
  const skipgram = word2vecExamples(data, 'skipgram'), cbow = word2vecExamples(data, 'cbow');
  assert.equal(skipgram.length, data.pairs.length);
  assert.deepEqual(skipgram[1], { inputs: [1], target: 0, sentence: 0, position: 1, contextPositions: [0] });
  assert.equal(cbow.length, 7);
  assert.deepEqual(cbow[1], { inputs: [0, 0], target: 1, sentence: 0, position: 1, contextPositions: [0, 2] });
  for (const example of cbow) {
    assert.equal(data.sentences[example.sentence][example.position], example.target);
    assert.deepEqual(example.contextPositions.map(position => data.sentences[example.sentence][position]), example.inputs);
  }
  const wide = word2vecExamples(word2vecData(['кот ест кот корм воду'], 2), 'cbow');
  assert.deepEqual(wide[2].inputs, [0, 1, 2, 3]);
  assert.deepEqual(wide[2].contextPositions, [0, 1, 3, 4]);
});

test('All four architecture/objective gradients match finite differences, including repeated inputs and negatives', () => {
  for (const inputs of [[1], [1, 1, 2]]) for (const objective of ['softmax', 'negative-sampling'] as const) {
    const model = initialWord2vec(5), example = { inputs, target: 3 }, negatives = objective === 'softmax' ? [] : [0, 0, 2];
    const trace = word2vecExampleTrace(model, example, objective, negatives);
    for (let d = 0; d < 2; d++) near(trace.hidden[d], inputs.reduce((sum, id) => sum + model.input[id][d], 0) / inputs.length);
    for (const key of ['input', 'output'] as const) model[key].forEach((row, i) => row.forEach((value, d) => {
      const lossAt = (changed: number) => {
        const perturbed = { ...model, [key]: model[key].map((values, ri) => values.map((v, di) => ri === i && di === d ? changed : v)) };
        return word2vecExampleTrace(perturbed, example, objective, negatives).loss;
      };
      const numeric = (lossAt(value + 1e-5) - lossAt(value - 1e-5)) / 2e-5;
      near(numeric, key === 'input' ? trace.inputGradients[i][d] : trace.outputGradient[i][d]);
    }));
    const snapshot = structuredClone(model), next = word2vecExampleStep(model, example, .05, objective, negatives);
    assert.deepEqual(model, snapshot);
    assert.ok(word2vecExampleTrace(next, example, objective, negatives).loss < trace.loss);
    for (let i = 0; i < model.input.length; i++) if (!inputs.includes(i)) assert.deepEqual(next.input[i], model.input[i]);
    if (objective === 'negative-sampling') {
      assert.deepEqual(next.output[1], model.output[1]);
      assert.deepEqual(next.output[4], model.output[4]);
      assert.deepEqual(trace.terms.map(term => [term.word, term.label]), [[3, 1], [0, 0], [0, 0], [2, 0]]);
      near(trace.loss, trace.terms.reduce((sum, term) => sum + term.loss, 0));
      near(trace.outputGradient[0][0], 2 * trace.probabilities[0] * trace.hidden[0]);
    } else near(trace.probabilities.reduce((sum, value) => sum + value, 0), 1);
  }
});

test('Negative sampling uses stable logistic losses, and its scores are independent binary probabilities', () => {
  const model = { input: [[100, 0], [0, 1], [1, 1]], output: [[100, 0], [-100, 0], [100, 0]] };
  const trace = word2vecExampleTrace(model, { inputs: [0], target: 1 }, 'negative-sampling', [0, 0]);
  assert.deepEqual(trace.probabilities, [1, 0, 1]);
  assert.equal(trace.loss, 30000);
  assert.ok([...trace.inputGradients.flat(), ...trace.outputGradient.flat()].every(Number.isFinite));
  const correct = word2vecExampleTrace(model, { inputs: [0], target: 0 }, 'negative-sampling', [1]);
  assert.equal(correct.loss, 0);
  assert.throws(() => word2vecExampleTrace(model, { inputs: [], target: 1 }, 'softmax'), RangeError);
  assert.throws(() => word2vecExampleTrace(model, { inputs: [0], target: 1 }, 'negative-sampling'), RangeError);
  assert.throws(() => word2vecExampleTrace(model, { inputs: [0], target: 1 }, 'negative-sampling', [1]), RangeError);
  assert.throws(() => word2vecExampleTrace(model, { inputs: [0], target: 1 }, 'softmax', [0]), RangeError);
  assert.throws(() => word2vecExampleStep(model, { inputs: [0], target: 1 }, Infinity, 'softmax'), RangeError);
});

test('Unigram^.75 negatives are reproducible, conditioned on excluding target, and sampled with replacement', () => {
  const data = word2vecData(['часто часто часто часто редко цель'], 1), distribution = word2vecNoiseDistribution(data);
  near(distribution.reduce((sum, value) => sum + value, 0), 1);
  near(distribution[0] / distribution[1], 4 ** .75);
  assert.deepEqual(word2vecNegatives(data, 2, 5, 73), word2vecNegatives(data, 2, 5, 73));
  assert.notDeepEqual(word2vecNegatives(data, 2, 5, 73), word2vecNegatives(data, 2, 5, 90210));
  const counts = [0, 0, 0];
  for (let seed = 0; seed < 2000; seed++) for (const word of word2vecNegatives(data, 2, 5, seed)) {
    assert.ok(word >= 0 && word < 2);
    counts[word]++;
  }
  near(counts[0] / 10000, distribution[0] / (1 - distribution[2]), .03);
  assert.deepEqual(word2vecNegatives(word2vecData(['кот пёс'], 1), 0, 5, 0), [1, 1, 1, 1, 1]);
  assert.throws(() => word2vecNegatives(word2vecData(['кот кот'], 1), 0, 1, 1), RangeError);
  for (const count of [0, 6, 1.5]) assert.throws(() => word2vecNegatives(data, 2, count, 1), RangeError);
  for (const seed of [-1, .5, NaN, 4294967296]) assert.throws(() => word2vecNegatives(data, 2, 2, seed), RangeError);
});

test('All four modes learn on both corpora/windows against a fixed evaluation negative bank', () => {
  for (const corpus of WORD2VEC_CORPORA) for (const window of [1, 2]) for (const architecture of ['skipgram', 'cbow'] as const)
    for (const objective of ['softmax', 'negative-sampling'] as Word2vecObjective[]) {
      const data = word2vecData(corpus.sentences, window), examples = word2vecExamples(data, architecture);
      const bank = objective === 'softmax' ? [] : examples.map((example, i) => word2vecNegatives(data, example.target, 3, i + 1));
      let model = initialWord2vec(data.vocabulary.length), step = 0;
      const before = word2vecExampleLoss(model, examples, objective, bank);
      for (let epoch = 0; epoch < 100; epoch++) for (const example of examples) {
        const negatives = objective === 'softmax' ? [] : word2vecNegatives(data, example.target, 3, 100000 + step++);
        model = word2vecExampleStep(model, example, .05, objective, negatives);
      }
      const after = word2vecExampleLoss(model, examples, objective, bank);
      assert.ok(after < before - .15, `${corpus.name}, window=${window}, ${architecture}/${objective}: ${before} → ${after}`);
      assert.ok([...model.input, ...model.output].flat().every(Number.isFinite));
      assert.equal(after, word2vecExampleLoss(model, examples, objective, bank));
    }
  const model = initialWord2vec(2), example = { inputs: [0], target: 1 };
  assert.throws(() => word2vecExampleLoss(model, [], 'softmax'), RangeError);
  assert.throws(() => word2vecExampleLoss(model, [example], 'negative-sampling'), RangeError);
  assert.throws(() => word2vecExampleLoss(model, [example], 'softmax', [[0]]), RangeError);
});
