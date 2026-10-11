import { dotProduct } from './conceptMath.ts';
import { activate, type Activation } from './math.ts';
import { temperatureSoftmax } from './transformerMath.ts';

type SnapshotSource = { readonly origin: string; readonly detail: string };
export type MathSnapshot = SnapshotSource & (
  | { readonly kind: 'dot-product'; readonly inputs: readonly number[]; readonly weights: readonly number[]; readonly bias: number; readonly activation?: Activation; readonly accumulation?: 'bias-first' | 'bias-last' }
  | { readonly kind: 'softmax'; readonly scores: readonly number[]; readonly temperature: number; readonly mask?: readonly boolean[] }
);

/** A true mask entry permits the key. Keep the finite score even when its key is hidden. */
export function analyzeMathSnapshot(snapshot: MathSnapshot) {
  if (!snapshot || typeof snapshot.origin !== 'string' || !snapshot.origin.trim() || typeof snapshot.detail !== 'string' || !snapshot.detail.trim()) {
    throw new RangeError('Укажите урок и выбранный шаг для разбора чисел.');
  }
  if (snapshot.kind === 'dot-product') {
    if (!Array.isArray(snapshot.inputs) || !Array.isArray(snapshot.weights) || !Number.isFinite(snapshot.bias)
      || (snapshot.activation !== undefined && !['relu', 'sigmoid', 'tanh'].includes(snapshot.activation))
      || (snapshot.accumulation !== undefined && !['bias-first', 'bias-last'].includes(snapshot.accumulation))) {
      throw new RangeError('Для суммы нужны конечное смещение и допустимая активация.');
    }
    const { terms, value } = dotProduct([...snapshot.inputs], [...snapshot.weights]);
    const z = snapshot.accumulation === 'bias-first' ? terms.reduce((sum, term) => sum + term, snapshot.bias) : value + snapshot.bias;
    if (![...terms, value, z].every(Number.isFinite)) throw new RangeError('Эти произведения или их сумма превышают числовой диапазон браузера.');
    return { kind: 'dot-product' as const, terms, sum: value, z, output: snapshot.activation ? activate(z, snapshot.activation) : z };
  }
  if (snapshot.kind !== 'softmax' || !Array.isArray(snapshot.scores) || !snapshot.scores.length || ![...snapshot.scores].every(Number.isFinite)
    || !Number.isFinite(snapshot.temperature) || snapshot.temperature <= 0
    || (snapshot.mask !== undefined && (!Array.isArray(snapshot.mask) || snapshot.mask.length !== snapshot.scores.length || ![...snapshot.mask].every(value => typeof value === 'boolean')))) {
    throw new RangeError('Для softmax нужны конечные scores, T > 0 и маска той же длины.');
  }
  const allowed = snapshot.scores.map((_, index) => snapshot.mask?.[index] ?? true);
  const masked = snapshot.scores.map((score, index) => allowed[index] ? score : -Infinity);
  const maximum = Math.max(...masked);
  const shifted = snapshot.scores.map((score, index) => {
    if (!allowed[index]) return null;
    const difference = score - maximum;
    // Opposite finite extremes can overflow subtraction even when division by T would fit.
    return Number.isFinite(difference) ? difference / snapshot.temperature : score / snapshot.temperature - maximum / snapshot.temperature;
  });
  const probabilities = temperatureSoftmax(shifted.map(value => value ?? -Infinity));
  const exponentials = shifted.map(value => value === null ? 0 : Math.exp(value));
  const denominator = exponentials.reduce((sum, value) => sum + value, 0);
  return { kind: 'softmax' as const, allowed, maximum, shifted, exponentials, denominator, probabilities };
}

/** Capture numbers on the explicit click; detached frozen arrays cannot track later training. */
export function copyMathSnapshot(snapshot: MathSnapshot): MathSnapshot {
  analyzeMathSnapshot(snapshot);
  return snapshot.kind === 'dot-product'
    ? Object.freeze({ ...snapshot, inputs: Object.freeze([...snapshot.inputs]), weights: Object.freeze([...snapshot.weights]) })
    : Object.freeze({ ...snapshot, scores: Object.freeze([...snapshot.scores]), ...(snapshot.mask === undefined ? {} : { mask: Object.freeze([...snapshot.mask]) }) });
}
