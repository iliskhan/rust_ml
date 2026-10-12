/** Small, deterministic teaching models; every displayed update changes these parameters. */
export type FrontierMatrix = number[][];
const zeros = (rows: number, columns: number) => Array.from({ length: rows }, () => Array(columns).fill(0) as number[]);
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const matvec = (w: FrontierMatrix, x: readonly number[]) => w.map(row => dot(row, x));
const seeded = (i: number, scale = .35) => scale * Math.sin(1.73 * (i + 1) + .41);
const initMatrix = (rows: number, columns: number, shift = 0, scale = .35) => Array.from({ length: rows }, (_, i) => Array.from({ length: columns }, (_, j) => seeded(i * columns + j + shift, scale)));
const update = (p: FrontierMatrix, g: FrontierMatrix, eta: number) => p.map((row, i) => row.map((v, j) => v - eta * g[i][j]));
const transpose = (w: FrontierMatrix) => w[0].map((_, j) => w.map(row => row[j]));
const norm = (x: readonly number[]) => Math.hypot(...x);
const positive = (value: number, name: string) => { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`); };
const softmax = (values: number[]) => {
  const max = Math.max(...values), exps = values.map(v => Math.exp(v - max)), sum = exps.reduce((a, b) => a + b, 0);
  return { probabilities: exps.map(v => v / sum), logNormalizer: max + Math.log(sum) };
};
export const frontierParameterDistance = (a: readonly number[], b: readonly number[]) => norm(a.map((v, i) => v - b[i]));

export const CLIP_PAIRS = [
  { name: 'Вертикаль', image: [0, 1, 0, 0, 1, 0, 0, 1, 0], text: [1, 0, 0, 0] },
  { name: 'Горизонталь', image: [0, 0, 0, 1, 1, 1, 0, 0, 0], text: [0, 1, 0, 0] },
  { name: 'Диагональ', image: [1, 0, 0, 0, 1, 0, 0, 0, 1], text: [0, 0, 1, 0] },
  { name: 'Крест', image: [0, 1, 0, 1, 1, 1, 0, 1, 0], text: [0, 0, 0, 1] },
];
export type ClipParameters = { image: FrontierMatrix; text: FrontierMatrix };
export const clipInitial = (): ClipParameters => ({ image: initMatrix(3, 9), text: initMatrix(3, 4, 31) });
function unit(x: number[]) {
  const rawLength = norm(x), length = Math.max(1e-12, rawLength);
  return { vector: x.map(v => v / length), length, clamped: rawLength < 1e-12 };
}
export function clipObjective(parameters: ClipParameters, temperature = .2) {
  positive(temperature, 'temperature');
  const n = CLIP_PAIRS.length;
  const images = CLIP_PAIRS.map(pair => unit(matvec(parameters.image, pair.image)));
  const texts = CLIP_PAIRS.map(pair => unit(matvec(parameters.text, pair.text)));
  const similarity = images.map(a => texts.map(b => dot(a.vector, b.vector)));
  const logits = similarity.map(row => row.map(v => v / temperature));
  const row = logits.map(softmax), column = transpose(logits).map(softmax);
  const loss = logits.reduce((sum, values, i) => sum + row[i].logNormalizer + column[i].logNormalizer - 2 * values[i], 0) / (2 * n);
  const dLogits = logits.map((values, i) => values.map((_, j) => (row[i].probabilities[j] + column[j].probabilities[i] - 2 * Number(i === j)) / (2 * n)));
  const gradient = { image: zeros(3, 9), text: zeros(3, 4) };
  for (let i = 0; i < n; i++) {
    for (const kind of ['image', 'text'] as const) {
      const embedding = kind === 'image' ? images[i] : texts[i];
      const other = kind === 'image' ? texts : images;
      const dUnit = [0, 1, 2].map(k => other.reduce((sum, v, j) => sum + (kind === 'image' ? dLogits[i][j] : dLogits[j][i]) * v.vector[k] / temperature, 0));
      const parallel = dot(dUnit, embedding.vector);
      // Below the floor the denominator is constant, so there is no norm derivative.
      const dRaw = dUnit.map((v, k) => (v - (embedding.clamped ? 0 : parallel * embedding.vector[k])) / embedding.length);
      const input = CLIP_PAIRS[i][kind];
      dRaw.forEach((v, k) => input.forEach((x, j) => { gradient[kind][k][j] += v * x; }));
    }
  }
  const retrieval = (probabilities: number[][]) => probabilities.reduce((sum, values, i) => sum + Number(values.indexOf(Math.max(...values)) === i), 0) / n;
  return { loss, gradient, similarity, imageEmbeddings: images.map(v => v.vector), textEmbeddings: texts.map(v => v.vector),
    imageToText: row.map(v => v.probabilities), textToImage: column.map(v => v.probabilities),
    imageAccuracy: retrieval(similarity), textAccuracy: retrieval(transpose(similarity)) };
}
export function clipStep(parameters: ClipParameters, eta = .08, temperature = .2): ClipParameters {
  positive(eta, 'eta');
  const { gradient } = clipObjective(parameters, temperature);
  return { image: update(parameters.image, gradient.image, eta), text: update(parameters.text, gradient.text, eta) };
}
export function trainClip(steps: number, eta = .08, temperature = .2) {
  let parameters = clipInitial();
  const history = [{ step: 0, loss: clipObjective(parameters, temperature).loss }];
  for (let step = 1; step <= steps; step++) {
    parameters = clipStep(parameters, eta, temperature);
    if (step % 5 === 0 || step === steps) history.push({ step, loss: clipObjective(parameters, temperature).loss });
  }
  return { parameters, history, metrics: clipObjective(parameters, temperature) };
}

export const FEATURE_IMPORTANCE = [1, .8, .6, .4, .2];
export type SuperpositionParameters = { weights: FrontierMatrix; bias: number[] };
export const superpositionInitial = (): SuperpositionParameters => ({ weights: initMatrix(2, 5, 7, .5), bias: Array(5).fill(0) });
/** Independent sparse features from a fixed PRNG stream; frequency changes the data, not the weights. */
export function sparseFeatures(frequency = .15, count = 160): number[][] {
  if (!(frequency >= .02 && frequency <= 1) || !Number.isInteger(count) || count < 1) throw new RangeError('Invalid sparse dataset');
  let seed = 8191;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: count }, () => Array.from({ length: 5 }, () => { const present = random(), magnitude = random(); return present < frequency ? .2 + .8 * magnitude : 0; }));
}
export function superpositionTrace(parameters: SuperpositionParameters, input: number[]) {
  const hidden = matvec(parameters.weights, input);
  const preactivation = transpose(parameters.weights).map((row, i) => dot(row, hidden) + parameters.bias[i]);
  return { hidden, preactivation, output: preactivation.map(v => Math.max(0, v)) };
}
export function superpositionObjective(parameters: SuperpositionParameters, data: number[][]) {
  if (!data.length) throw new RangeError('Empty dataset');
  const gradient = { weights: zeros(2, 5), bias: Array(5).fill(0) as number[] };
  let loss = 0;
  for (const input of data) {
    const trace = superpositionTrace(parameters, input);
    const dOutput = trace.output.map((v, i) => 2 * FEATURE_IMPORTANCE[i] * (v - input[i]) / (5 * data.length) * Number(trace.preactivation[i] > 0));
    loss += trace.output.reduce((sum, v, i) => sum + FEATURE_IMPORTANCE[i] * (v - input[i]) ** 2, 0) / (5 * data.length);
    const dHidden = matvec(parameters.weights, dOutput);
    dOutput.forEach((v, i) => { gradient.bias[i] += v; });
    gradient.weights.forEach((row, k) => row.forEach((_, j) => { row[j] += dOutput[j] * trace.hidden[k] + dHidden[k] * input[j]; }));
  }
  return { loss, gradient };
}
export function superpositionStep(parameters: SuperpositionParameters, data: number[][], eta = .3): SuperpositionParameters {
  positive(eta, 'eta');
  const { gradient } = superpositionObjective(parameters, data);
  return { weights: update(parameters.weights, gradient.weights, eta), bias: parameters.bias.map((v, i) => v - eta * gradient.bias[i]) };
}
export function trainSuperposition(steps: number, frequency = .15, eta = .3) {
  const data = sparseFeatures(frequency);
  let parameters = superpositionInitial();
  const history = [{ step: 0, loss: superpositionObjective(parameters, data).loss }];
  for (let step = 1; step <= steps; step++) {
    parameters = superpositionStep(parameters, data, eta);
    if (step % 10 === 0 || step === steps) history.push({ step, loss: superpositionObjective(parameters, data).loss });
  }
  return { parameters, data, history, loss: superpositionObjective(parameters, data).loss };
}
export const CAUSAL_WEIGHTS = [[1.4, .4], [-.6, 1.3], [.8, -.9]];
export const CAUSAL_READOUT = [1.3, -.5, .7];
export const causalHidden = (input: readonly number[]) => matvec(CAUSAL_WEIGHTS, input).map((v, i) => Math.tanh(v + [.1, -.2, .15][i]));
export const causalLogit = (hidden: readonly number[]) => dot(CAUSAL_READOUT, hidden) - .15;
export const causalLoss = (logit: number, label: number) => Math.max(logit, 0) - logit * label + Math.log1p(Math.exp(-Math.abs(logit)));
export function causalIntervention(clean: number[], corrupt: number[], neuron: number, baseline: 'zero' | 'mean' = 'zero') {
  if (!Number.isInteger(neuron) || neuron < 0 || neuron > 2) throw new RangeError('Invalid neuron');
  const cleanHidden = causalHidden(clean), corruptHidden = causalHidden(corrupt);
  const reference = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(causalHidden);
  const baselineValue = baseline === 'zero' ? 0 : reference.reduce((sum, h) => sum + h[neuron], 0) / reference.length;
  const ablated = [...cleanHidden], patched = [...corruptHidden];
  ablated[neuron] = baselineValue; patched[neuron] = cleanHidden[neuron];
  const label = Number(clean[0] >= 0);
  const measure = (hidden: number[]) => { const logit = causalLogit(hidden); return { hidden, logit, loss: causalLoss(logit, label) }; };
  return { label, baselineValue, clean: measure(cleanHidden), corrupt: measure(corruptHidden), ablated: measure(ablated), patched: measure(patched) };
}

export const JEPA_OFFSETS = [-.6, -.2, .2, .6];
export const JEPA_IMAGES = Array.from({ length: 20 }, (_, i) => {
  const a = (i % 5 - 2) / 2, b = (Math.floor(i / 5) - 1.5) / 1.5;
  return JEPA_OFFSETS.map(offset => [a + offset, b + offset * offset, 1]);
});
export type JepaParameters = { context: FrontierMatrix; target: FrontierMatrix; predictor: FrontierMatrix };
export function jepaInitial(collapsed = false): JepaParameters {
  const encoder = collapsed ? zeros(2, 3) : [[.8, .2, .05], [-.15, .7, -.1]];
  return { context: encoder.map(row => [...row]), target: encoder.map(row => [...row]), predictor: collapsed ? zeros(2, 6) : [[.5, .1, .05, -.04, .02, -.02], [-.1, .5, -.03, .02, .04, -.05]] };
}
export function jepaTrace(parameters: JepaParameters, image: number[][], mask: number) {
  const visible = image.filter((_, i) => i !== mask);
  const pooled = [0, 1, 2].map(k => visible.reduce((sum, patch) => sum + patch[k], 0) / visible.length);
  const context = matvec(parameters.context, pooled), predictorInput = [...context, ...JEPA_OFFSETS.map((_, i) => Number(i === mask))];
  return { pooled, context, predictorInput, target: matvec(parameters.target, image[mask]), prediction: matvec(parameters.predictor, predictorInput) };
}
export function jepaObjective(parameters: JepaParameters, mask = 1, fixedTarget?: FrontierMatrix) {
  if (!Number.isInteger(mask) || mask < 0 || mask > 3) throw new RangeError('Invalid mask');
  const gradient = { context: zeros(2, 3), predictor: zeros(2, 6) };
  let loss = 0, fixedLoss = 0;
  const targets: number[][] = [];
  for (const image of JEPA_IMAGES) {
    const trace = jepaTrace(parameters, image, mask), residual = trace.prediction.map((v, k) => v - trace.target[k]);
    loss += dot(residual, residual) / (2 * JEPA_IMAGES.length);
    const fixed = matvec(fixedTarget ?? parameters.target, image[mask]);
    fixedLoss += trace.prediction.reduce((sum, v, k) => sum + (v - fixed[k]) ** 2, 0) / (2 * JEPA_IMAGES.length);
    const dPrediction = residual.map(v => v / JEPA_IMAGES.length);
    gradient.predictor.forEach((row, k) => row.forEach((_, j) => { row[j] += dPrediction[k] * trace.predictorInput[j]; }));
    const dContext = [0, 1].map(k => dPrediction.reduce((sum, v, j) => sum + v * parameters.predictor[j][k], 0));
    gradient.context.forEach((row, k) => row.forEach((_, j) => { row[j] += dContext[k] * trace.pooled[j]; }));
    targets.push(trace.target);
  }
  const means = [0, 1].map(k => targets.reduce((sum, v) => sum + v[k], 0) / targets.length);
  const variance = targets.reduce((sum, v) => sum + v.reduce((part, x, k) => part + (x - means[k]) ** 2, 0), 0) / (2 * targets.length);
  return { loss, fixedLoss, targetVariance: variance, gradient };
}
export function jepaStep(parameters: JepaParameters, mask = 1, eta = .05, ema = .99): JepaParameters {
  positive(eta, 'eta');
  if (!(ema >= 0 && ema <= 1)) throw new RangeError('EMA outside [0, 1]');
  const { gradient } = jepaObjective(parameters, mask);
  const context = update(parameters.context, gradient.context, eta), predictor = update(parameters.predictor, gradient.predictor, eta);
  // Target receives only EMA after SGD, never the derivative of its side of the objective.
  const target = parameters.target.map((row, i) => row.map((v, j) => ema * v + (1 - ema) * context[i][j]));
  return { context, predictor, target };
}
export function trainJepa(steps: number, mask = 1, eta = .05, ema = .99, collapsed = false) {
  let parameters = jepaInitial(collapsed);
  const initialTarget = parameters.target.map(row => [...row]);
  const history = [{ step: 0, ...jepaObjective(parameters, mask, initialTarget) }];
  for (let step = 1; step <= steps; step++) {
    parameters = jepaStep(parameters, mask, eta, ema);
    if (step % 5 === 0 || step === steps) history.push({ step, ...jepaObjective(parameters, mask, initialTarget) });
  }
  return { parameters, history, metrics: jepaObjective(parameters, mask, initialTarget) };
}

export type RegressionTask = 'additive' | 'interaction';
export const regressionTarget = (x: number, y: number, task: RegressionTask = 'additive') => Math.sin(Math.PI * x) + .5 * y * y + (task === 'interaction' ? .6 * x * y : 0);
export const regressionData = (heldout = false, task: RegressionTask = 'additive') => {
  const axis = Array.from({ length: heldout ? 6 : 7 }, (_, i) => heldout ? -5 / 6 + i / 3 : -1 + i / 3);
  return axis.flatMap(x => axis.map(y => ({ x: [x, y], target: regressionTarget(x, y, task) })));
};
export type RegressionSample = { x: number[]; target: number };
/** Degree-1 B-spline basis (linear hats), including both boundary knots. */
export function splineBasis(x: number, knots: number) {
  if (!Number.isInteger(knots) || knots < 3 || knots > 15 || !Number.isFinite(x) || x < -1 || x > 1) throw new RangeError('Spline needs 3–15 knots and x in [-1, 1]');
  const coordinate = (x + 1) * (knots - 1) / 2, left = Math.min(knots - 2, Math.floor(coordinate)), fraction = coordinate - left;
  return Array.from({ length: knots }, (_, i) => i === left ? 1 - fraction : i === left + 1 ? fraction : 0);
}
export type KanParameters = { edges: FrontierMatrix; bias: number };
export const kanInitial = (knots = 7): KanParameters => { splineBasis(0, knots); return { edges: zeros(2, knots), bias: 0 }; };
export const kanEdge = (parameters: KanParameters, axis: number, x: number) => dot(parameters.edges[axis], splineBasis(x, parameters.edges[0].length));
export const kanPredict = (parameters: KanParameters, x: readonly number[]) => kanEdge(parameters, 0, x[0]) + kanEdge(parameters, 1, x[1]) + parameters.bias;
export function kanObjective(parameters: KanParameters, data: RegressionSample[]) {
  const gradient = { edges: zeros(2, parameters.edges[0].length), bias: 0 };
  let loss = 0;
  for (const sample of data) {
    const error = kanPredict(parameters, sample.x) - sample.target;
    loss += error * error / data.length;
    gradient.bias += 2 * error / data.length;
    gradient.edges.forEach((row, axis) => splineBasis(sample.x[axis], row.length).forEach((basis, j) => { row[j] += 2 * error * basis / data.length; }));
  }
  return { loss, gradient };
}
export function kanStep(parameters: KanParameters, data: RegressionSample[], eta = .08): KanParameters {
  positive(eta, 'eta'); const { gradient } = kanObjective(parameters, data);
  return { edges: update(parameters.edges, gradient.edges, eta), bias: parameters.bias - eta * gradient.bias };
}
export type MlpParameters = { hidden: FrontierMatrix; hiddenBias: number[]; output: number[]; bias: number };
export const regressionMlpInitial = (): MlpParameters => ({ hidden: initMatrix(6, 2, 5, .8), hiddenBias: Array.from({ length: 6 }, (_, i) => seeded(i + 23, .25)), output: Array.from({ length: 6 }, (_, i) => seeded(i + 51, .5)), bias: 0 });
export function regressionMlpPredict(parameters: MlpParameters, input: readonly number[]) {
  const hidden = matvec(parameters.hidden, input).map((v, i) => Math.tanh(v + parameters.hiddenBias[i]));
  return { hidden, output: dot(parameters.output, hidden) + parameters.bias };
}
export function regressionMlpObjective(parameters: MlpParameters, data: RegressionSample[]) {
  const gradient = { hidden: zeros(6, 2), hiddenBias: Array(6).fill(0) as number[], output: Array(6).fill(0) as number[], bias: 0 };
  let loss = 0;
  for (const sample of data) {
    const trace = regressionMlpPredict(parameters, sample.x), error = trace.output - sample.target, dOutput = 2 * error / data.length;
    loss += error * error / data.length; gradient.bias += dOutput;
    trace.hidden.forEach((v, i) => {
      gradient.output[i] += dOutput * v;
      const dHidden = dOutput * parameters.output[i] * (1 - v * v);
      gradient.hiddenBias[i] += dHidden;
      sample.x.forEach((x, j) => { gradient.hidden[i][j] += dHidden * x; });
    });
  }
  return { loss, gradient };
}
export function regressionMlpStep(parameters: MlpParameters, data: RegressionSample[], eta = .08): MlpParameters {
  positive(eta, 'eta'); const { gradient } = regressionMlpObjective(parameters, data);
  return { hidden: update(parameters.hidden, gradient.hidden, eta), hiddenBias: parameters.hiddenBias.map((v, i) => v - eta * gradient.hiddenBias[i]), output: parameters.output.map((v, i) => v - eta * gradient.output[i]), bias: parameters.bias - eta * gradient.bias };
}
export function trainKanComparison(steps: number, knots = 7, eta = .08, task: RegressionTask = 'additive') {
  const train = regressionData(false, task), heldout = regressionData(true, task);
  let kan = kanInitial(knots), mlp = regressionMlpInitial();
  const metrics = () => ({ kanTrain: kanObjective(kan, train).loss, kanHeldout: kanObjective(kan, heldout).loss, mlpTrain: regressionMlpObjective(mlp, train).loss, mlpHeldout: regressionMlpObjective(mlp, heldout).loss });
  const history = [{ step: 0, ...metrics() }];
  for (let step = 1; step <= steps; step++) {
    kan = kanStep(kan, train, eta); mlp = regressionMlpStep(mlp, train, eta);
    if (step % 10 === 0 || step === steps) history.push({ step, ...metrics() });
  }
  return { kan, mlp, train, heldout, history, metrics: metrics() };
}
