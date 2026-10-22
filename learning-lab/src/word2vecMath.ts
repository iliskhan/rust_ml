export type Word2vecModel = { input: number[][]; output: number[][] };
export type Word2vecPair = { center: number; context: number; sentence: number; position: number; contextPosition: number };

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

export function initialWord2vec(size: number): Word2vecModel {
  if (!Number.isInteger(size) || size < 1 || size > 32) throw new RangeError('Размер словаря должен быть от 1 до 32.');
  return {
    input: Array.from({ length: size }, (_, i) => [.4 * Math.sin((i + 1) * 1.7), .4 * Math.cos((i + 1) * 2.3)]),
    output: Array.from({ length: size }, (_, i) => [.4 * Math.cos((i + 1) * 1.3), .4 * Math.sin((i + 1) * 2.1)]),
  };
}

/** Full softmax makes every score and gradient visible; a tensor library would hide this tiny 2D example. */
export function word2vecTrace(model: Word2vecModel, center: number, context: number) {
  const size = model.input.length;
  if (!size || size > 32 || model.output.length !== size || [...model.input, ...model.output].some(row => row.length !== 2 || row.some(value => !Number.isFinite(value))))
    throw new RangeError('Нужны две конечные таблицы embeddings одинакового размера: до 32 строк по 2 координаты.');
  if (![center, context].every(id => Number.isInteger(id) && id >= 0 && id < size)) throw new RangeError('Слово отсутствует в словаре.');
  const vector = model.input[center];
  const scores = model.output.map(row => row[0] * vector[0] + row[1] * vector[1]);
  if (scores.some(score => !Number.isFinite(score))) throw new RangeError('Слишком большие значения embeddings.');
  const max = Math.max(...scores), exponentials = scores.map(score => Math.exp(score - max));
  const sum = exponentials.reduce((total, value) => total + value, 0);
  const probabilities = exponentials.map(value => value / sum);
  const residuals = probabilities.map((value, i) => value - Number(i === context));
  return {
    scores, probabilities, loss: (max - scores[context]) + Math.log(sum),
    inputGradient: vector.map((_, d) => residuals.reduce((total, residual, i) => total + residual * model.output[i][d], 0)),
    outputGradient: model.output.map((_, i) => vector.map(value => residuals[i] * value)),
  };
}

export function word2vecLoss(model: Word2vecModel, pairs: readonly Pick<Word2vecPair, 'center' | 'context'>[]) {
  if (!pairs.length) throw new RangeError('Нужна хотя бы одна пара слов.');
  return pairs.reduce((total, pair) => total + word2vecTrace(model, pair.center, pair.context).loss, 0) / pairs.length;
}

export function word2vecStep(model: Word2vecModel, pair: Pick<Word2vecPair, 'center' | 'context'>, rate: number): Word2vecModel {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new RangeError('Шаг SGD должен быть в (0, 1].');
  const trace = word2vecTrace(model, pair.center, pair.context);
  const next = {
    input: model.input.map((row, i) => row.map((value, d) => i === pair.center ? value - rate * trace.inputGradient[d] : value)),
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
