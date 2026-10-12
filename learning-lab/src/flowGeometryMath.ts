import type { Vec3 } from './scene3dMath.ts';

export type Vec2 = readonly [number, number];
export type TinyModel = { inputs: number; hidden: number; outputs: number; bounded: boolean; weights: number[]; first: number[]; second: number[]; steps: number };
export type TrainingSample = { input: number[]; target: number[] };

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state + .5) / 4294967296; };
}
function gaussian(random: () => number) { return Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random()); }
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function createTinyModel(inputs: number, hidden: number, outputs: number, bounded = false, seed = 19): TinyModel {
  const random = seededRandom(seed), count = hidden * (inputs + 1) + outputs * (hidden + 1);
  const weights = Array.from({ length: count }, () => (random() - .5) * .7);
  return { inputs, hidden, outputs, bounded, weights, first: weights.map(() => 0), second: weights.map(() => 0), steps: 0 };
}
function forward(model: TinyModel, input: readonly number[]) {
  const { inputs, hidden, outputs, weights } = model;
  const activation = Array.from({ length: hidden }, (_, h) => Math.tanh(weights[h * (inputs + 1) + inputs] + input.reduce((s, x, i) => s + x * weights[h * (inputs + 1) + i], 0)));
  const offset = hidden * (inputs + 1);
  const output = Array.from({ length: outputs }, (_, o) => {
    const value = weights[offset + o * (hidden + 1) + hidden] + activation.reduce((s, x, h) => s + x * weights[offset + o * (hidden + 1) + h], 0);
    return model.bounded ? sigmoid(value) : value;
  });
  return { activation, output };
}
export const tinyPredict = (model: TinyModel, input: readonly number[]) => forward(model, input).output;

/** Mean squared error over samples AND output coordinates; derivative uses the same normalization. */
export function tinyLossGradient(model: TinyModel, samples: readonly TrainingSample[]) {
  const { inputs, hidden, outputs, weights } = model, offset = hidden * (inputs + 1);
  const gradient = weights.map(() => 0);
  let loss = 0;
  for (const sample of samples) {
    const { activation, output } = forward(model, sample.input), hiddenDerivative = activation.map(() => 0);
    for (let o = 0; o < outputs; o++) {
      const error = output[o] - sample.target[o];
      loss += error * error / (samples.length * outputs);
      const derivative = 2 * error / (samples.length * outputs) * (model.bounded ? output[o] * (1 - output[o]) : 1);
      for (let h = 0; h < hidden; h++) {
        gradient[offset + o * (hidden + 1) + h] += derivative * activation[h];
        hiddenDerivative[h] += derivative * weights[offset + o * (hidden + 1) + h];
      }
      gradient[offset + o * (hidden + 1) + hidden] += derivative;
    }
    for (let h = 0; h < hidden; h++) {
      const derivative = hiddenDerivative[h] * (1 - activation[h] ** 2);
      for (let i = 0; i < inputs; i++) gradient[h * (inputs + 1) + i] += derivative * sample.input[i];
      gradient[h * (inputs + 1) + inputs] += derivative;
    }
  }
  return { loss, gradient };
}
export function tinyLoss(model: TinyModel, samples: readonly TrainingSample[]) {
  return samples.reduce((sum, sample) => sum + tinyPredict(model, sample.input).reduce((s, value, i) => s + (value - sample.target[i]) ** 2, 0), 0) / (samples.length * model.outputs);
}
function adam(model: TinyModel, samples: readonly TrainingSample[], learningRate: number) {
  const { gradient } = tinyLossGradient(model, samples);
  model.steps++;
  for (let i = 0; i < model.weights.length; i++) {
    model.first[i] = .9 * model.first[i] + .1 * gradient[i];
    model.second[i] = .999 * model.second[i] + .001 * gradient[i] ** 2;
    model.weights[i] -= learningRate * (model.first[i] / (1 - .9 ** model.steps)) / (Math.sqrt(model.second[i] / (1 - .999 ** model.steps)) + 1e-8);
  }
}
function copyModel(model: TinyModel) { return { ...model, weights: [...model.weights], first: [...model.first], second: [...model.second] }; }

export type FlowDistribution = 'blobs' | 'ring';
export function flowTarget(random: () => number, distribution: FlowDistribution): Vec2 {
  if (distribution === 'ring') {
    const angle = 2 * Math.PI * random(), radius = 1.4 + .12 * gaussian(random);
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  }
  const side = random() < .5 ? -1 : 1;
  return [side * 1.15 + .22 * gaussian(random), side * .5 + .3 * gaussian(random)];
}
export function conditionalFlowPoint(noise: Vec2, data: Vec2, time: number) {
  return { position: [(1 - time) * noise[0] + time * data[0], (1 - time) * noise[1] + time * data[1]] as Vec2,
    velocity: [data[0] - noise[0], data[1] - noise[1]] as Vec2 };
}
export function flowSamples(distribution: FlowDistribution, count = 256, seed = 31): TrainingSample[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => {
    const noise: Vec2 = [gaussian(random), gaussian(random)], data = flowTarget(random, distribution), t = random();
    const path = conditionalFlowPoint(noise, data, t);
    return { input: [...path.position, t], target: [...path.velocity] };
  });
}
export const createFlowModel = () => createTinyModel(3, 24, 2, false, 41);
export function trainFlow(model: TinyModel, distribution: FlowDistribution, count: number, learningRate = .008) {
  const next = copyModel(model);
  for (let i = 0; i < count; i++) adam(next, flowSamples(distribution, 40, 1009 + next.steps * 17), learningRate);
  return next;
}
export function flowNoise(count = 72, seed = 29): Vec2[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => [gaussian(random), gaussian(random)]);
}
export function flowData(distribution: FlowDistribution, count = 72, seed = 37): Vec2[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => flowTarget(random, distribution));
}
export function integrateVelocity(velocity: (point: Vec2, time: number) => Vec2, initial: Vec2, steps: number): Vec2[] {
  if (!Number.isInteger(steps) || steps < 1) throw new RangeError('Число шагов ODE должно быть целым и положительным.');
  const path: Vec2[] = [initial], dt = 1 / steps;
  // Explicit midpoint: both evaluations use the actual evolving point, never a conditional endpoint.
  for (let i = 0; i < steps; i++) {
    const point = path[i], first = velocity(point, i * dt);
    const second = velocity([point[0] + dt * first[0] / 2, point[1] + dt * first[1] / 2], (i + .5) * dt);
    path.push([point[0] + dt * second[0], point[1] + dt * second[1]]);
  }
  return path;
}
export const integrateFlow = (model: TinyModel, initial: Vec2, steps: number) => integrateVelocity((point, t) => tinyPredict(model, [...point, t]) as unknown as Vec2, initial, steps);
export function flowStatistics(points: readonly Vec2[]) {
  const n = points.length;
  return { meanX: points.reduce((s, p) => s + p[0], 0) / n, meanY: points.reduce((s, p) => s + p[1], 0) / n,
    radius: points.reduce((s, p) => s + Math.hypot(...p), 0) / n, left: points.filter(p => p[0] < 0).length / n };
}
/** Descriptive shape error to known synthetic geometry; this is not a distribution distance. */
export function flowShapeError(points: readonly Vec2[], distribution: FlowDistribution) {
  return points.reduce((sum, point) => sum + (distribution === 'ring' ? (Math.hypot(...point) - 1.4) ** 2
    : Math.min((point[0] - 1.15) ** 2 + (point[1] - .5) ** 2, (point[0] + 1.15) ** 2 + (point[1] + .5) ** 2)), 0) / points.length;
}

export const EGNN_COORDINATES: Vec3[] = [[-.8, -.5, .1], [.7, -.4, -.3], [.2, .8, .4], [-.4, .1, 1]];
export const EGNN_FEATURES = [.2, .8, -.4, .5];
export function egnnBlock(coordinates: readonly Vec3[], features: readonly number[], strength = .4, broken = false) {
  const messages: number[][] = coordinates.map((point, i) => coordinates.map((other, j) => i === j ? 0 : Math.tanh(.6 * features[i] - .2 * features[j] - .4 * point.reduce((s, value, d) => s + (value - other[d]) ** 2, 0) + .1 + (broken ? .5 * point[0] : 0))));
  const vectors: Vec3[] = coordinates.map((point, i) => [0, 1, 2].map(d => coordinates.reduce((s, other, j) => s + (i === j ? 0 : (point[d] - other[d]) * strength * Math.tanh(.8 * messages[i][j] - .15)), 0) / Math.max(1, coordinates.length - 1)) as unknown as Vec3);
  const scalars = features.map((feature, i) => Math.tanh(.7 * feature + .5 * messages[i].reduce((a, b) => a + b, 0)));
  const positions: Vec3[] = coordinates.map((point, i) => point.map((v, d) => v + vectors[i][d]) as unknown as Vec3);
  return { messages, vectors, scalars, positions };
}
/** Reflection in X, then rotations around Z and Y. Every operation is orthogonal. */
export function orthogonalVector(point: Vec3, zDegrees: number, yDegrees: number, reflection = false): Vec3 {
  const z = zDegrees * Math.PI / 180, y = yDegrees * Math.PI / 180, x0 = (reflection ? -1 : 1) * point[0];
  const x = Math.cos(z) * x0 - Math.sin(z) * point[1], yy = Math.sin(z) * x0 + Math.cos(z) * point[1];
  return [Math.cos(y) * x + Math.sin(y) * point[2], yy, -Math.sin(y) * x + Math.cos(y) * point[2]];
}
export function transformCoordinate(point: Vec3, z: number, y: number, reflection: boolean, translation: Vec3): Vec3 {
  return orthogonalVector(point, z, y, reflection).map((v, d) => v + translation[d]) as unknown as Vec3;
}
export function equivarianceTrace(coordinates: readonly Vec3[], features: readonly number[], z: number, y: number, reflection: boolean, translation: Vec3, strength = .4, broken = false) {
  const original = egnnBlock(coordinates, features, strength, broken), transformedInput = coordinates.map(p => transformCoordinate(p, z, y, reflection, translation)), transformed = egnnBlock(transformedInput, features, strength, broken);
  const expectedVectors = original.vectors.map(v => orthogonalVector(v, z, y, reflection)), expectedPositions = original.positions.map(p => transformCoordinate(p, z, y, reflection, translation));
  const scalarError = Math.max(...original.scalars.map((v, i) => Math.abs(v - transformed.scalars[i])));
  const vectorError = Math.max(...expectedVectors.map((p, i) => Math.hypot(...p.map((v, d) => v - transformed.vectors[i][d]))));
  const positionError = Math.max(...expectedPositions.map((p, i) => Math.hypot(...p.map((v, d) => v - transformed.positions[i][d]))));
  return { original, transformedInput, transformed, expectedVectors, expectedPositions, scalarError, vectorError, positionError };
}

export function encodeField([x, y, z]: Vec3) { return [x, y, z, Math.sin(Math.PI * x), Math.sin(Math.PI * y), Math.sin(Math.PI * z), Math.cos(Math.PI * x), Math.cos(Math.PI * y), Math.cos(Math.PI * z)]; }
/** Synthetic volume used for supervision, not a neural prediction. σ is in inverse scene units. */
export function referenceField([x, y, z]: Vec3) {
  const red = Math.exp(-((x + .45) ** 2 + y ** 2 + z ** 2) / .3), blue = Math.exp(-((x - .45) ** 2 + (y - .15) ** 2 + (z + .15) ** 2) / .22);
  const density = 6 * (1 - Math.exp(-1.6 * red - 1.2 * blue)), norm = red + blue + .025;
  return { density, color: [(.85 * red + .12 * blue + .01) / norm, (.25 * red + .45 * blue + .01) / norm, (.15 * red + .85 * blue + .01) / norm] as Vec3 };
}
export function fieldSamples(count = 320, seed = 57): TrainingSample[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => {
    const point: Vec3 = [2.4 * random() - 1.2, 2.4 * random() - 1.2, 2.4 * random() - 1.2], field = referenceField(point);
    return { input: encodeField(point), target: [field.density / 6, ...field.color] };
  });
}
export const createFieldModel = () => createTinyModel(9, 24, 4, true, 67);
export function trainField(model: TinyModel, count: number, learningRate = .008) {
  const next = copyModel(model);
  for (let i = 0; i < count; i++) adam(next, fieldSamples(40, 1601 + next.steps * 19), learningRate);
  return next;
}
export function neuralField(model: TinyModel, point: Vec3) {
  const output = tinyPredict(model, encodeField(point));
  return { density: 6 * output[0], color: output.slice(1) as unknown as Vec3 };
}
export type VolumeSample = { density: number; color: Vec3; delta: number };
export function compositeVolume(samples: readonly VolumeSample[], background: Vec3 = [1, 1, 1]) {
  let transmittance = 1, color = [0, 0, 0];
  const trace = samples.map(sample => {
    if (sample.density < 0 || sample.delta < 0 || ![sample.density, sample.delta, ...sample.color].every(Number.isFinite)) throw new RangeError('Образцам нужны конечные значения, σ ≥ 0 и Δ ≥ 0.');
    const alpha = -Math.expm1(-sample.density * sample.delta), weight = transmittance * alpha, before = transmittance;
    color = color.map((value, d) => value + weight * sample.color[d]);
    transmittance *= 1 - alpha;
    return { ...sample, alpha, weight, transmittance: before, after: transmittance };
  });
  return { color: color.map((value, d) => value + transmittance * background[d]) as unknown as Vec3, transmittance, opacity: 1 - transmittance, trace };
}
export function cameraRay(yawDegrees: number, u: number, v: number) {
  const angle = yawDegrees * Math.PI / 180;
  const origin: Vec3 = [2.8 * Math.sin(angle), 2.8 * Math.cos(angle), .45];
  const target: Vec3 = [u * Math.cos(angle), -u * Math.sin(angle), v];
  const difference = target.map((value, d) => value - origin[d]), norm = Math.hypot(...difference);
  const direction = difference.map(value => value / norm) as unknown as Vec3;
  // Intersect the actual viewing ray with the training cube; samples outside it are never queried.
  let near = 0, far = Infinity;
  for (let d = 0; d < 3; d++) {
    if (Math.abs(direction[d]) < 1e-12) { if (Math.abs(origin[d]) > 1.2) return { origin, direction, near: 0, far: 0 }; continue; }
    const a = (-1.2 - origin[d]) / direction[d], b = (1.2 - origin[d]) / direction[d];
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
  }
  return { origin, direction, near, far: Math.max(near, far) };
}
export function renderFieldRay(field: (point: Vec3) => { density: number; color: Vec3 }, yaw: number, u: number, v: number, count: number, densityScale = 1) {
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(densityScale) || densityScale < 0) throw new RangeError('Число образцов должно быть положительным, масштаб σ — неотрицательным.');
  const ray = cameraRay(yaw, u, v), delta = (ray.far - ray.near) / count;
  const points: Vec3[] = [], depths: number[] = [];
  const samples: VolumeSample[] = Array.from({ length: count }, (_, i) => {
    const depth = ray.near + (i + .5) * delta, position = ray.origin.map((value, d) => value + depth * ray.direction[d]) as unknown as Vec3;
    points.push(position); depths.push(depth);
    const value = delta === 0 ? { density: 0, color: [0, 0, 0] as Vec3 } : field(position);
    return { density: value.density * densityScale, color: value.color, delta };
  });
  return { ...ray, points, depths, ...compositeVolume(samples) };
}
