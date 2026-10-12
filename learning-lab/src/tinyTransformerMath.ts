// ponytail: scalar reverse-mode tape is deliberately tiny; use tensor kernels for larger models.
export const TINY_VOCAB = ['А', 'Б', 'В', 'Г'];
export const TINY_DIM = 4, TINY_FFN = 8, TINY_CONTEXT = 4;
export const TINY_TRAIN = [[0, 1, 2, 3, 0], [1, 2, 3, 0, 1]];
export const TINY_VALIDATION = [[2, 3, 0, 1, 2], [3, 0, 1, 2, 3]];

const shapes = [
  ['E', 4, 4], ['P', 4, 4], ['Wq', 4, 4], ['Wk', 4, 4], ['Wv', 4, 4], ['Wo', 4, 4],
  ['g1', 1, 4], ['b1', 1, 4], ['g2', 1, 4], ['b2', 1, 4],
  ['W1', 4, 8], ['bf1', 1, 8], ['W2', 8, 4], ['bf2', 1, 4], ['U', 4, 4], ['bu', 1, 4],
] as const;
export type TinyGroupName = typeof shapes[number][0];
let offset = 0;
export const TINY_GROUPS = shapes.map(([name, rows, cols]) => {
  const group = { name, rows, cols, offset, size: rows * cols };
  offset += group.size;
  return group;
});
export const TINY_PARAMETER_COUNT = offset;

export function initialTinyParameters(seed = 17): number[] {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return TINY_GROUPS.flatMap(group => Array.from({ length: group.size }, () =>
    group.name === 'g1' || group.name === 'g2' ? 1 : group.name.startsWith('b') ? 0 :
      (random() * 2 - 1) * (group.name === 'P' ? .08 : .45)));
}

type Scalar = { value: number; grad: number; parents: [Scalar, number][] };
class Tape {
  nodes: Scalar[] = [];
  scalar(value: number, parents: [Scalar, number][] = []): Scalar {
    const node = { value, grad: 0, parents };
    this.nodes.push(node);
    return node;
  }
  add(a: Scalar, b: Scalar) { return this.scalar(a.value + b.value, [[a, 1], [b, 1]]); }
  scale(a: Scalar, k: number) { return this.scalar(a.value * k, [[a, k]]); }
  mul(a: Scalar, b: Scalar) { return this.scalar(a.value * b.value, [[a, b.value], [b, a.value]]); }
  sum(xs: Scalar[]) { return this.scalar(xs.reduce((s, x) => s + x.value, 0), xs.map(x => [x, 1])); }
  pow(a: Scalar, k: number) { return this.scalar(a.value ** k, [[a, k * a.value ** (k - 1)]]); }
  exp(a: Scalar) { const y = Math.exp(a.value); return this.scalar(y, [[a, y]]); }
  log(a: Scalar) { return this.scalar(Math.log(a.value), [[a, 1 / a.value]]); }
  tanh(a: Scalar) { const y = Math.tanh(a.value); return this.scalar(y, [[a, 1 - y * y]]); }
  backward(loss: Scalar) {
    for (const node of this.nodes) node.grad = 0;
    loss.grad = 1;
    for (let i = this.nodes.length - 1; i >= 0; i--)
      for (const [parent, derivative] of this.nodes[i].parents) parent.grad += this.nodes[i].grad * derivative;
  }
}

function graph(parameters: number[], sequence: number[]) {
  if (parameters.length !== TINY_PARAMETER_COUNT || parameters.some(x => !Number.isFinite(x)))
    throw new RangeError('Нужны конечные значения всех параметров tiny Transformer.');
  if (sequence.length < 2 || sequence.length > TINY_CONTEXT + 1 || sequence.some(x => !Number.isInteger(x) || x < 0 || x >= TINY_VOCAB.length))
    throw new RangeError('Последовательность: от 2 до 5 токенов словаря.');
  const tape = new Tape(), p = parameters.map(x => tape.scalar(x));
  const groups = Object.fromEntries(TINY_GROUPS.map(g => [g.name,
    Array.from({ length: g.rows }, (_, r) => p.slice(g.offset + r * g.cols, g.offset + (r + 1) * g.cols))])) as Record<TinyGroupName, Scalar[][]>;
  const linear = (x: Scalar[], name: TinyGroupName, bias?: TinyGroupName) => groups[name][0].map((_, j) => {
    const sum = tape.sum(x.map((value, i) => tape.mul(value, groups[name][i][j])));
    return bias ? tape.add(sum, groups[bias][0][j]) : sum;
  });
  const norm = (x: Scalar[], gamma: TinyGroupName, beta: TinyGroupName) => {
    const mean = tape.scale(tape.sum(x), 1 / x.length);
    const centered = x.map(value => tape.add(value, tape.scale(mean, -1)));
    const variance = tape.scale(tape.sum(centered.map(value => tape.mul(value, value))), 1 / x.length);
    const inverse = tape.pow(tape.add(variance, tape.scalar(1e-5)), -.5);
    return centered.map((value, i) => tape.add(tape.mul(tape.mul(value, inverse), groups[gamma][0][i]), groups[beta][0][i]));
  };
  const softmax = (xs: Scalar[]) => {
    // Subtracting a numeric maximum is stable; its derivative cancels in softmax/log-sum-exp.
    const max = Math.max(...xs.map(x => x.value));
    const exponentials = xs.map(x => tape.exp(tape.add(x, tape.scalar(-max))));
    const denominator = tape.sum(exponentials), inverse = tape.pow(denominator, -1);
    return { probabilities: exponentials.map(x => tape.mul(x, inverse)), logSumExp: tape.add(tape.log(denominator), tape.scalar(max)) };
  };
  const inputs = sequence.slice(0, -1), targets = sequence.slice(1);
  const embedding = inputs.map((token, t) => groups.E[token].map((x, d) => tape.add(x, groups.P[t][d])));
  const normalized = embedding.map(x => norm(x, 'g1', 'b1'));
  const q = normalized.map(x => linear(x, 'Wq')), k = normalized.map(x => linear(x, 'Wk')), v = normalized.map(x => linear(x, 'Wv'));
  // Future keys are absent from the graph, rather than represented by a finite negative score.
  const scores = q.map((row, t) => k.slice(0, t + 1).map(key => tape.scale(tape.sum(row.map((x, d) => tape.mul(x, key[d]))), 1 / Math.sqrt(TINY_DIM))));
  const attention = scores.map(row => softmax(row).probabilities);
  const context = attention.map(row => Array.from({ length: TINY_DIM }, (_, d) => tape.sum(row.map((weight, j) => tape.mul(weight, v[j][d])))));
  const projected = context.map(x => linear(x, 'Wo'));
  const residual = embedding.map((row, t) => row.map((x, d) => tape.add(x, projected[t][d])));
  const normalized2 = residual.map(x => norm(x, 'g2', 'b2'));
  const ffn = normalized2.map(x => linear(linear(x, 'W1', 'bf1').map(z => tape.tanh(z)), 'W2', 'bf2'));
  const hidden = residual.map((row, t) => row.map((x, d) => tape.add(x, ffn[t][d])));
  const logits = hidden.map(x => linear(x, 'U', 'bu'));
  const output = logits.map(row => softmax(row));
  const losses = output.map((o, t) => tape.add(o.logSumExp, tape.scale(logits[t][targets[t]], -1)));
  const loss = tape.scale(tape.sum(losses), 1 / losses.length);
  return { tape, p, loss, losses, inputs, targets, embedding, normalized, q, k, v, scores, attention, context, residual, normalized2, ffn, hidden, logits, output };
}

const values = (rows: Scalar[][]) => rows.map(row => row.map(x => x.value));
const gradients = (rows: Scalar[][]) => rows.map(row => row.map(x => x.grad));
export const tinyNorm = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0));

/** Gradients refer to the mean loss over all predicted positions in this sequence. */
export function tinyTransformerTrace(parameters: number[], sequence: number[]) {
  const g = graph(parameters, sequence);
  g.tape.backward(g.loss);
  const stages = [
    ['Logits z', g.logits], ['Скрытые h', g.hidden], ['FFN', g.ffn], ['Второй LayerNorm', g.normalized2],
    ['Первый residual', g.residual], ['Контекст AV', g.context], ['Softmax attention A', g.attention],
    ['Scores QKᵀ/√d', g.scores], ['Q', g.q], ['K', g.k], ['V', g.v], ['Первый LayerNorm', g.normalized], ['Embeddings E + P', g.embedding],
  ] as const;
  return {
    loss: g.loss.value, losses: g.losses.map(x => x.value), gradients: g.p.map(x => x.grad),
    inputs: g.inputs, targets: g.targets, logits: values(g.logits), probabilities: values(g.output.map(o => o.probabilities)),
    attention: values(g.attention), attentionGradients: gradients(g.attention), scoreGradients: gradients(g.scores),
    dlogits: gradients(g.logits), hidden: values(g.hidden), embedding: values(g.embedding),
    stages: stages.map(([name, nodes]) => ({ name, values: values(nodes), gradients: gradients(nodes), gradientNorm: tinyNorm(nodes.flat().map(x => x.grad)) })),
  };
}

/** Each term is dℓ_t/dθ divided by T; their sum equals dL/dθ for one shared parameter. */
export function tinyTokenContributions(parameters: number[], sequence: number[], parameter: number) {
  if (!Number.isInteger(parameter) || parameter < 0 || parameter >= TINY_PARAMETER_COUNT) throw new RangeError('Неизвестный параметр.');
  const g = graph(parameters, sequence);
  return g.losses.map(loss => { g.tape.backward(loss); return g.p[parameter].grad / g.losses.length; });
}

export function tinyEvaluate(parameters: number[], dataset: number[][]) {
  if (!dataset.length) throw new RangeError('Нужна хотя бы одна последовательность.');
  let total = 0, correct = 0, count = 0;
  for (const sequence of dataset) {
    const g = graph(parameters, sequence);
    g.losses.forEach((loss, t) => {
      total += loss.value; count++;
      const logits = g.logits[t].map(x => x.value);
      correct += Number(logits.indexOf(Math.max(...logits)) === g.targets[t]);
    });
  }
  return { loss: total / count, accuracy: correct / count, count };
}

/** One stochastic step on a selected train sequence; validation is never passed by the UI. */
export function tinySgdStep(parameters: number[], sequence: number[], rate: number) {
  if (!Number.isFinite(rate) || rate <= 0 || rate > .5) throw new RangeError('Скорость SGD должна быть от 0 до 0,5 (не включая 0).');
  const g = graph(parameters, sequence);
  g.tape.backward(g.loss);
  const next = parameters.map((x, i) => x - rate * g.p[i].grad);
  if (next.some(x => !Number.isFinite(x))) throw new RangeError('Шаг SGD привёл к нечисловому параметру.');
  return next;
}
