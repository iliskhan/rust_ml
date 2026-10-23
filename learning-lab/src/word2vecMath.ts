import { diffusionRandom } from './diffusionMath.ts';

export type Word2vecModel = { input: number[][]; output: number[][] };
export type Word2vecPair = { center: number; context: number; sentence: number; position: number; contextPosition: number };
export type Word2vecArchitecture = 'skipgram' | 'cbow';
export type Word2vecObjective = 'softmax' | 'negative-sampling';
export type Word2vecExample = { inputs: number[]; target: number; sentence: number; position: number; contextPositions: number[] };

export const WORD2VEC_CORPORA = [
  { name: 'Животные и их соседи', sentences: [
    'кот ест корм', 'пёс ест корм', 'кот пьёт воду', 'пёс пьёт воду',
    'птица ест зерно', 'утка ест зерно', 'птица пьёт воду', 'утка пьёт воду',
  ] },
  { name: 'Транспорт и действия', sentences: [
    'поезд везёт людей', 'автобус везёт людей', 'поезд везёт груз', 'автобус везёт груз',
    'лодка плывёт медленно', 'корабль плывёт медленно', 'лодка плывёт быстро', 'корабль плывёт быстро',
  ] },
];

export function word2vecData(source: readonly string[], window: number) {
  if (window !== 1 && window !== 2) throw new RangeError('Радиус окна должен быть 1 или 2.');
  if (!source.length || source.length > 32 || source.some(sentence => typeof sentence !== 'string' || sentence.length > 500))
    throw new RangeError('Корпус: от 1 до 32 предложений, до 500 символов в каждом.');
  const vocabulary: string[] = [], ids = new Map<string, number>();
  const sentences = source.map(sentence => (sentence.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map(word => {
    if (!ids.has(word)) { ids.set(word, vocabulary.length); vocabulary.push(word); }
    return ids.get(word)!;
  }));
  if (!vocabulary.length || vocabulary.length > 32 || sentences.some(sentence => sentence.length > 32))
    throw new RangeError('Нужно от 1 до 32 слов в словаре и не более 32 слов в предложении.');
  const pairs: Word2vecPair[] = [];
  sentences.forEach((tokens, sentence) => tokens.forEach((center, position) => {
    for (let contextPosition = Math.max(0, position - window); contextPosition <= Math.min(tokens.length - 1, position + window); contextPosition++) {
      if (contextPosition !== position) pairs.push({ center, context: tokens[contextPosition], sentence, position, contextPosition });
    }
  }));
  if (!pairs.length) throw new RangeError('Нужны хотя бы два слова в одном предложении.');
  return { vocabulary, sentences, pairs };
}

export function word2vecExamples(data: ReturnType<typeof word2vecData>, architecture: Word2vecArchitecture): Word2vecExample[] {
  if (architecture === 'skipgram') return data.pairs.map(pair => ({ inputs: [pair.center], target: pair.context,
    sentence: pair.sentence, position: pair.position, contextPositions: [pair.contextPosition] }));
  if (architecture !== 'cbow') throw new RangeError('Архитектура должна быть Skip-gram или CBOW.');
  const examples: Word2vecExample[] = [];
  for (const pair of data.pairs) {
    let example = examples[examples.length - 1];
    if (!example || example.sentence !== pair.sentence || example.position !== pair.position) {
      example = { inputs: [], target: pair.center, sentence: pair.sentence, position: pair.position, contextPositions: [] };
      examples.push(example);
    }
    example.inputs.push(pair.context);
    example.contextPositions.push(pair.contextPosition);
  }
  return examples;
}

export function word2vecNoiseDistribution(data: Pick<ReturnType<typeof word2vecData>, 'vocabulary' | 'sentences'>) {
  const counts = data.vocabulary.map(() => 0);
  for (const sentence of data.sentences) for (const id of sentence) {
    if (!Number.isInteger(id) || id < 0 || id >= counts.length) throw new RangeError('Слово отсутствует в словаре.');
    counts[id]++;
  }
  if (!counts.length || counts.length > 32 || counts.some(count => !count)) throw new RangeError('Нужна частота каждого слова словаря.');
  const weights = counts.map(count => count ** .75), total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => weight / total);
}

export function word2vecNegatives(data: Pick<ReturnType<typeof word2vecData>, 'vocabulary' | 'sentences'>, target: number, count: number, seed: number): number[] {
  const probabilities = word2vecNoiseDistribution(data);
  if (!Number.isInteger(target) || target < 0 || target >= probabilities.length || probabilities.length < 2)
    throw new RangeError('Для negative sampling нужны target и хотя бы два разных слова.');
  if (!Number.isInteger(count) || count < 1 || count > 5 || !Number.isInteger(seed) || seed < 0 || seed > 4294967295)
    throw new RangeError('Нужны от 1 до 5 отрицательных примеров и целый seed от 0 до 2³²−1.');
  const random = diffusionRandom(seed);
  // Conditioning on word != target is rejection sampling without an unbounded retry loop.
  const candidates = probabilities.map((probability, word) => ({ word, probability })).filter(item => item.word !== target);
  const mass = candidates.reduce((sum, item) => sum + item.probability, 0);
  return Array.from({ length: count }, () => {
    let remaining = random.uniform() * mass;
    for (const item of candidates) { remaining -= item.probability; if (remaining < 0) return item.word; }
    return candidates[candidates.length - 1].word;
  });
}

export function initialWord2vec(size: number): Word2vecModel {
  if (!Number.isInteger(size) || size < 1 || size > 32) throw new RangeError('Размер словаря должен быть от 1 до 32.');
  return {
    input: Array.from({ length: size }, (_, i) => [.4 * Math.sin((i + 1) * 1.7), .4 * Math.cos((i + 1) * 2.3)]),
    output: Array.from({ length: size }, (_, i) => [.4 * Math.cos((i + 1) * 1.3), .4 * Math.sin((i + 1) * 2.1)]),
  };
}

/** Explicit 2D gradients keep every training term visible in the lesson. */
export function word2vecExampleTrace(model: Word2vecModel, example: Pick<Word2vecExample, 'inputs' | 'target'>, objective: Word2vecObjective, negatives: readonly number[] = []) {
  const size = model.input.length;
  if (!size || size > 32 || model.output.length !== size || [...model.input, ...model.output].some(row => row.length !== 2 || row.some(value => !Number.isFinite(value))))
    throw new RangeError('Нужны две конечные таблицы embeddings одинакового размера: до 32 строк по 2 координаты.');
  if (!example.inputs.length || example.inputs.length > 4 || ![...example.inputs, example.target, ...negatives].every(id => Number.isInteger(id) && id >= 0 && id < size))
    throw new RangeError('Нужны от 1 до 4 входных слов и существующие слова словаря.');
  if (objective !== 'softmax' && objective !== 'negative-sampling') throw new RangeError('Неизвестная функция потерь.');
  if (objective === 'negative-sampling' && (negatives.length < 1 || negatives.length > 5 || negatives.includes(example.target)))
    throw new RangeError('Нужны от 1 до 5 отрицательных слов, отличных от target.');
  if (objective === 'softmax' && negatives.length) throw new RangeError('Full softmax не использует отрицательную выборку.');
  const hidden = [0, 1].map(d => example.inputs.reduce((sum, id) => sum + model.input[id][d], 0) / example.inputs.length);
  const scores = model.output.map(row => row[0] * hidden[0] + row[1] * hidden[1]);
  if ([...hidden, ...scores].some(score => !Number.isFinite(score))) throw new RangeError('Слишком большие значения embeddings.');
  let probabilities: number[], loss: number, residuals: number[];
  const terms: { word: number; label: number; score: number; probability: number; loss: number; residual: number }[] = [];
  if (objective === 'softmax') {
    const max = Math.max(...scores), exponentials = scores.map(score => Math.exp(score - max));
    const sum = exponentials.reduce((total, value) => total + value, 0);
    probabilities = exponentials.map(value => value / sum);
    residuals = probabilities.map((value, i) => value - Number(i === example.target));
    loss = (max - scores[example.target]) + Math.log(sum);
  } else {
    probabilities = scores.map(score => score >= 0 ? 1 / (1 + Math.exp(-score)) : Math.exp(score) / (1 + Math.exp(score)));
    residuals = scores.map(() => 0);
    for (const [index, word] of [example.target, ...negatives].entries()) {
      const label = Number(index === 0), score = scores[word], signed = label ? -score : score;
      const termLoss = Math.max(0, signed) + Math.log1p(Math.exp(-Math.abs(signed)));
      const residual = probabilities[word] - label;
      terms.push({ word, label, score, probability: probabilities[word], loss: termLoss, residual });
      residuals[word] += residual;
    }
    loss = terms.reduce((sum, term) => sum + term.loss, 0);
  }
  const hiddenGradient = hidden.map((_, d) => residuals.reduce((sum, residual, i) => sum + residual * model.output[i][d], 0));
  const inputGradients = model.input.map(() => [0, 0]);
  for (const id of example.inputs) for (let d = 0; d < 2; d++) inputGradients[id][d] += hiddenGradient[d] / example.inputs.length;
  const outputGradient = model.output.map((_, i) => hidden.map(value => residuals[i] * value));
  if (![loss, ...inputGradients.flat(), ...outputGradient.flat()].every(Number.isFinite)) throw new RangeError('Слишком большие значения потерь или градиентов.');
  return { objective, hidden, scores, probabilities, loss, hiddenGradient, inputGradients, outputGradient, terms };
}

export function word2vecTrace(model: Word2vecModel, center: number, context: number) {
  const trace = word2vecExampleTrace(model, { inputs: [center], target: context }, 'softmax');
  return { scores: trace.scores, probabilities: trace.probabilities, loss: trace.loss,
    inputGradient: trace.inputGradients[center], outputGradient: trace.outputGradient };
}

export function word2vecLoss(model: Word2vecModel, pairs: readonly Pick<Word2vecPair, 'center' | 'context'>[]) {
  if (!pairs.length) throw new RangeError('Нужна хотя бы одна пара слов.');
  return pairs.reduce((total, pair) => total + word2vecTrace(model, pair.center, pair.context).loss, 0) / pairs.length;
}

export function word2vecExampleLoss(model: Word2vecModel, examples: readonly Pick<Word2vecExample, 'inputs' | 'target'>[], objective: Word2vecObjective, negativeSamples: readonly (readonly number[])[] = []) {
  if (!examples.length) throw new RangeError('Нужен хотя бы один учебный пример.');
  if (objective === 'negative-sampling' ? negativeSamples.length !== examples.length : negativeSamples.length !== 0)
    throw new RangeError('Для negative sampling нужна фиксированная выборка к каждому примеру; full softmax её не использует.');
  return examples.reduce((total, example, i) => total + word2vecExampleTrace(model, example, objective, negativeSamples[i]).loss, 0) / examples.length;
}

export function word2vecStep(model: Word2vecModel, pair: Pick<Word2vecPair, 'center' | 'context'>, rate: number): Word2vecModel {
  return word2vecExampleStep(model, { inputs: [pair.center], target: pair.context }, rate, 'softmax');
}

export function word2vecExampleStep(model: Word2vecModel, example: Pick<Word2vecExample, 'inputs' | 'target'>, rate: number, objective: Word2vecObjective, negatives: readonly number[] = []): Word2vecModel {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new RangeError('Шаг SGD должен быть в (0, 1].');
  const trace = word2vecExampleTrace(model, example, objective, negatives);
  const next = {
    input: model.input.map((row, i) => row.map((value, d) => value - rate * trace.inputGradients[i][d])),
    output: model.output.map((row, i) => row.map((value, d) => value - rate * trace.outputGradient[i][d])),
  };
  if ([...next.input, ...next.output].some(row => row.some(value => !Number.isFinite(value)))) throw new RangeError('Шаг SGD привёл к нечисловому параметру.');
  return next;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]) {
  if (!a.length || a.length !== b.length || [...a, ...b].some(value => !Number.isFinite(value))) throw new RangeError('Векторы должны иметь одинаковую длину и конечные координаты.');
  const normA = Math.hypot(...a), normB = Math.hypot(...b);
  if (normA === 0 || normB === 0) return 0;
  return Math.max(-1, Math.min(1, a.reduce((sum, value, d) => sum + (value / normA) * (b[d] / normB), 0)));
}
