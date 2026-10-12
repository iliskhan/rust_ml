// Small explicit probability models; no pretrained language model or timing claims.
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const dot = (a: number[], b: number[]) => sum(a.map((v, i) => v * b[i]));
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export function frontierSoftmax(xs: number[]) {
  if (!xs.length || xs.some(x => !Number.isFinite(x))) throw new RangeError('Нужны конечные логиты.');
  const m = Math.max(...xs), e = xs.map(x => Math.exp(x - m)), z = sum(e);
  return e.map(x => x / z);
}
function logSoftmax(xs: number[]) { const m = Math.max(...xs), z = m + Math.log(sum(xs.map(x => Math.exp(x - m)))); return xs.map(x => x - z); }
function random(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function sample(p: number[], u: number) { let c = 0; for (let i = 0; i < p.length; i++) { c += p[i]; if (u < c) return i; } return p.length - 1; }
const softplus = (x: number) => Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x)));

export const DPO_REFERENCE = [.3, 0, -.2];
export function dpoTrace(logits: number[], reference = DPO_REFERENCE, preferred = 0, beta = .5) {
  if (logits.length !== reference.length || logits.length < 2 || !Number.isInteger(preferred) || preferred < 0 || preferred >= logits.length || !Number.isFinite(beta) || beta <= 0) throw new RangeError('Некорректная пара предпочтений.');
  const p = frontierSoftmax(logits), ref = frontierSoftmax(reference), lp = logSoftmax(logits), lr = logSoftmax(reference);
  const gradient = logits.map(() => 0), pairs = logits.flatMap((_, rejected) => {
    if (rejected === preferred) return [];
    const margin = beta * ((logits[preferred] - logits[rejected]) - (reference[preferred] - reference[rejected]));
    const d = -beta * Math.exp(-softplus(margin)) / (logits.length - 1);
    gradient[preferred] += d; gradient[rejected] -= d;
    return [{ preferred, rejected, margin, loss: softplus(-margin) }];
  });
  return { p, ref, pairs, gradient, loss: sum(pairs.map(pair => pair.loss)) / pairs.length, kl: sum(p.map((v, i) => v * (lp[i] - lr[i]))) };
}
export function trainDpo(logits: number[], preferred: number, beta: number, steps: number) {
  let next = [...logits]; const losses: number[] = [];
  for (let s = 0; s < steps; s++) { const trace = dpoTrace(next, DPO_REFERENCE, preferred, beta); next = next.map((v, i) => v - .3 * trace.gradient[i]); losses.push(dpoTrace(next, DPO_REFERENCE, preferred, beta).loss); }
  return { parameters: next, losses };
}

export type QuantScope = 'tensor' | 'channel';
export type QuantScheme = 'symmetric' | 'affine';
export function quantizationWeights(outlier = 4): number[][] { return [[-.9, .2, .6, 1.5], [-.05, .1, .15, outlier], [.3, -.6, .4, -.2]]; }
export function quantizeWeights(weights: number[][], bits: number, scope: QuantScope, clip: number, scheme: QuantScheme) {
  if (!Number.isInteger(bits) || bits < 2 || bits > 8 || !Number.isFinite(clip) || clip <= 0 || !weights.length || !weights[0].length || weights.some(row => row.length !== weights[0].length || row.some(v => !Number.isFinite(v)))) throw new RangeError('Некорректная матрица или разрядность.');
  const qmax = scheme === 'symmetric' ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
  const qmin = scheme === 'symmetric' ? -qmax : 0;
  const groups = scope === 'tensor' ? [weights.flat()] : weights;
  const meta = groups.map(group => {
    const values = group.map(v => clamp(v, -clip, clip));
    const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
    const scale = scheme === 'symmetric' ? Math.max(-lo, hi) / qmax : (hi - lo) / qmax;
    return { scale: scale || 1, zero: scheme === 'symmetric' ? 0 : clamp(Math.round(-lo / (scale || 1)), qmin, qmax) };
  });
  const integers = weights.map((row, r) => row.map(v => { const m = meta[scope === 'tensor' ? 0 : r]; return clamp(Math.round(clamp(v, -clip, clip) / m.scale) + m.zero, qmin, qmax); }));
  const restored = integers.map((row, r) => row.map(v => { const m = meta[scope === 'tensor' ? 0 : r]; return (v - m.zero) * m.scale; }));
  const error = restored.map((row, r) => row.map((v, c) => v - weights[r][c]));
  return { integers, restored, error, meta, qmin, qmax, mse: sum(error.flat().map(v => v * v)) / weights.flat().length,
    payloadBits: weights.flat().length * bits, metadataBits: meta.length * (scheme === 'affine' ? 64 : 32) };
}
export const QUANT_TRAIN = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [1, -.5, .5, -.25], [-.3, .4, -.8, .6]];
export const QUANT_HELDOUT = [[.2, .7, -.4, .9], [-.5, -.2, .6, .3]];
export function initialQuantAdapter() { return [.1, -.12, .08, .15, 0, 0, 0]; }
export function quantAdapterTrace(parameters: number[], target: number[][], base: number[][], inputs = QUANT_TRAIN) {
  if (parameters.length !== 7 || parameters.some(v => !Number.isFinite(v))) throw new RangeError('Адаптер имеет 7 конечных параметров.');
  const a = parameters.slice(0, 4), b = parameters.slice(4), gradient = parameters.map(() => 0);
  const matrix = base.map((row, r) => row.map((v, c) => v + b[r] * a[c]));
  let loss = 0;
  for (const x of inputs) {
    const h = dot(a, x);
    for (let r = 0; r < 3; r++) {
      const e = dot(matrix[r], x) - dot(target[r], x), g = 2 * e / (inputs.length * 3); loss += e * e / (inputs.length * 3);
      gradient[4 + r] += g * h;
      for (let c = 0; c < 4; c++) gradient[c] += g * b[r] * x[c];
    }
  }
  return { matrix, gradient, loss };
}
export function trainQuantAdapter(parameters: number[], target: number[][], base: number[][], steps: number) {
  let next = [...parameters]; const losses: number[] = [];
  for (let s = 0; s < steps; s++) { const tr = quantAdapterTrace(next, target, base); next = next.map((v, i) => v - .2 * tr.gradient[i]); losses.push(quantAdapterTrace(next, target, base).loss); }
  return { parameters: next, losses };
}

function probabilities(p: number[]) { if (!p.length || p.some(v => !Number.isFinite(v) || v < 0) || Math.abs(sum(p) - 1) > 1e-8) throw new RangeError('Вероятности должны суммироваться в 1.'); }
export function speculativeKernel(p: number[], q: number[]) {
  probabilities(p); probabilities(q); if (p.length !== q.length) throw new RangeError('Словари должны совпадать.');
  const acceptance = p.map((v, i) => q[i] > 0 ? Math.min(1, v / q[i]) : 0);
  const acceptedMass = p.map((v, i) => Math.min(v, q[i]));
  const residualMass = p.map((v, i) => Math.max(0, v - q[i]));
  const rejected = sum(residualMass), residual = rejected > 1e-15 ? residualMass.map(v => v / rejected) : [...p];
  return { acceptance, acceptedMass, residual, rejected, exact: acceptedMass.map((v, i) => v + rejected * residual[i]) };
}
export function speculativeSample(p: number[], q: number[], proposalU: number, acceptanceU: number, correctionU: number) {
  const kernel = speculativeKernel(p, q), proposal = sample(q, proposalU), accepted = acceptanceU < kernel.acceptance[proposal];
  return { proposal, accepted, output: accepted ? proposal : sample(kernel.residual, correctionU), ...kernel };
}
export const SPEC_TARGET = [[.1, .6, .2, .1], [.1, .1, .65, .15], [.15, .15, .1, .6], [.6, .15, .15, .1]];
export function specDraft(previous: number, fidelity: number) { return SPEC_TARGET[previous].map(v => fidelity * v + (1 - fidelity) / 4); }
export function speculativeBlock(previous: number, length: number, fidelity: number, seed: number) {
  const rng = random(seed), drafts: { previous: number; token: number; p: number[]; q: number[] }[] = [];
  let draftPrefix = previous;
  for (let i = 0; i < length; i++) { const q = specDraft(draftPrefix, fidelity), token = sample(q, rng()); drafts.push({ previous: draftPrefix, token, p: SPEC_TARGET[draftPrefix], q }); draftPrefix = token; }
  const output: number[] = [], rows: { token: number; status: 'accepted' | 'rejected' | 'discarded'; acceptance: number }[] = [];
  let rejected = false, correction: number | null = null;
  for (const draft of drafts) {
    const kernel = speculativeKernel(draft.p, draft.q);
    if (rejected) { rows.push({ token: draft.token, status: 'discarded', acceptance: kernel.acceptance[draft.token] }); continue; }
    const accepted = rng() < kernel.acceptance[draft.token];
    rows.push({ token: draft.token, status: accepted ? 'accepted' : 'rejected', acceptance: kernel.acceptance[draft.token] });
    if (accepted) output.push(draft.token); else { rejected = true; correction = sample(kernel.residual, rng()); output.push(correction); }
  }
  const bonus = rejected ? null : sample(SPEC_TARGET[output.at(-1) ?? previous], rng());
  if (bonus !== null) output.push(bonus);
  return { rows, output, correction, bonus, accepted: rows.filter(row => row.status === 'accepted').length };
}
export function speculativeHistogram(p: number[], q: number[], n = 20000, seed = 42) {
  const rng = random(seed), counts = p.map(() => 0), kernel = speculativeKernel(p, q); let accepted = 0;
  for (let i = 0; i < n; i++) { const proposal = sample(q, rng()), take = rng() < kernel.acceptance[proposal]; if (take) accepted++; counts[take ? proposal : sample(kernel.residual, rng())]++; }
  return { frequencies: counts.map(v => v / n), accepted: accepted / n };
}

export type PositionMethod = 'none' | 'alibi' | 'rope';
export function contextTrace(strength: number, length: number, distance: number, method: PositionMethod, window: number) {
  if (!Number.isFinite(strength) || !Number.isInteger(length) || length < 2 || length > 64 || !Number.isInteger(distance) || distance < 1 || distance > length || !Number.isInteger(window) || window < 1) throw new RangeError('Некорректная длина или позиция.');
  const target = length - distance;
  const content = Array.from({ length }, (_, i) => {
    // q=(1,0), matching key=(1,0), distractor key=(0,1); one real rotary pair.
    if (method === 'rope') return i === target ? Math.cos(.1 * (length - i)) : Math.sin(.1 * (length - i));
    return i === target ? 1 : 0;
  });
  const scores = content.map((v, i) => strength * v - (method === 'alibi' ? .12 * (length - i) : 0));
  const visible = scores.map((_, i) => length - i <= window), indices = scores.flatMap((_, i) => visible[i] ? [i] : []);
  const weights = scores.map(() => 0); frontierSoftmax(indices.map(i => scores[i])).forEach((p, j) => { weights[indices[j]] = p; });
  const included = visible[target], loss = included ? -logSoftmax(indices.map(i => scores[i]))[indices.indexOf(target)] : Infinity;
  const gradient = included ? dot(weights, content) - content[target] : 0;
  return { target, content, scores, visible, weights, included, loss, gradient, predicted: weights.indexOf(Math.max(...weights)) };
}
export function contextTrainingLoss(strength: number, length: number, method: PositionMethod) {
  const traces = Array.from({ length }, (_, i) => contextTrace(strength, length, i + 1, method, length));
  return { loss: sum(traces.map(t => t.loss)) / length, gradient: sum(traces.map(t => t.gradient)) / length };
}
export function trainContext(strength: number, length: number, method: PositionMethod, steps: number) {
  let next = strength; const losses: number[] = [];
  for (let s = 0; s < steps; s++) { const tr = contextTrainingLoss(next, length, method); next -= .3 * tr.gradient; losses.push(contextTrainingLoss(next, length, method).loss); }
  return { strength: next, losses };
}
export function contextEvaluation(strength: number, length: number, method: PositionMethod, window: number) {
  const traces = Array.from({ length }, (_, i) => contextTrace(strength, length, i + 1, method, window));
  return { accuracy: traces.filter(t => t.predicted === t.target).length / length, reachable: traces.filter(t => t.included).length / length,
    meanProbability: sum(traces.map(t => t.weights[t.target])) / length };
}

export const MASK_VOCAB = ['А', 'Б', 'В', 'Г'];
export const MASK_SEQUENCES = Array.from({ length: 4 }, (_, start) => Array.from({ length: 4 }, (_, i) => (start + i) % 4));
// Each output position owns 4 biases and 3×4×4 other-position coefficients.
export const MASK_PARAMETERS = 208;
export function initialMaskedModel() { return Array.from({ length: MASK_PARAMETERS }, (_, i) => .015 * Math.sin(i * 1.7)); }
const maskWeight = (position: number, source: number, token: number, output: number) => 16 + (((position * 3 + (source < position ? source : source - 1)) * 4 + token) * 4 + output);
export function maskedPrediction(parameters: number[], tokens: number[]) {
  if (parameters.length !== MASK_PARAMETERS || parameters.some(v => !Number.isFinite(v)) || tokens.length !== 4 || tokens.some(v => !Number.isInteger(v) || v < -1 || v > 3)) throw new RangeError('Нужны 4 токена (−1 = MASK) и 208 конечных параметров.');
  const logits = tokens.map((_, position) => Array.from({ length: 4 }, (_, output) => parameters[position * 4 + output] + sum(tokens.map((token, source) => token < 0 || source === position ? 0 : parameters[maskWeight(position, source, token, output)]))));
  return { logits, probabilities: logits.map(frontierSoftmax) };
}
export function maskedObjective(parameters: number[], examples = MASK_SEQUENCES) {
  const gradient = parameters.map(() => 0); let loss = 0, count = 0;
  // Uniform over the 15 nonempty masks and their masked positions. This is an
  // explicit finite denoising objective, not LLaDA's continuous-time likelihood bound.
  for (const truth of examples) for (let mask = 1; mask < 16; mask++) {
    const tokens = truth.map((v, i) => mask & (1 << i) ? -1 : v), tr = maskedPrediction(parameters, tokens);
    for (let position = 0; position < 4; position++) if (tokens[position] < 0) {
      loss -= logSoftmax(tr.logits[position])[truth[position]]; count++;
      for (let output = 0; output < 4; output++) {
        const g = tr.probabilities[position][output] - Number(output === truth[position]); gradient[position * 4 + output] += g;
        tokens.forEach((token, source) => { if (token >= 0) gradient[maskWeight(position, source, token, output)] += g; });
      }
    }
  }
  return { loss: loss / count, gradient: gradient.map(v => v / count) };
}
export function trainMaskedModel(parameters: number[], steps: number) {
  let next = [...parameters]; const losses: number[] = [];
  for (let s = 0; s < steps; s++) { const tr = maskedObjective(next); next = next.map((v, i) => v - 2 * tr.gradient[i]); losses.push(maskedObjective(next).loss); }
  return { parameters: next, losses };
}
export function unmaskStep(parameters: number[], tokens: number[], count: number, seed: number, greedy = true) {
  const rng = random(seed), tr = maskedPrediction(parameters, tokens);
  const selected = tokens.flatMap((v, i) => v < 0 ? [{ position: i, confidence: Math.max(...tr.probabilities[i]) }] : []).sort((a, b) => b.confidence - a.confidence || a.position - b.position).slice(0, count);
  const next = [...tokens];
  selected.forEach(({ position }) => { const p = tr.probabilities[position]; next[position] = greedy ? p.indexOf(Math.max(...p)) : sample(p, rng()); });
  return { tokens: next, selected, probabilities: tr.probabilities };
}
export function autoregressiveCycle(start: number) {
  // Maximum-likelihood bigram counts from the same four cycles, with fixed first token.
  const counts = Array.from({ length: 4 }, () => Array(4).fill(0) as number[]);
  MASK_SEQUENCES.forEach(seq => seq.slice(1).forEach((token, i) => counts[seq[i]][token]++));
  const output = [start]; while (output.length < 4) { const row = counts[output.at(-1)!]; output.push(row.indexOf(Math.max(...row))); } return output;
}
