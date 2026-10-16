import { writeFileSync } from 'node:fs';
import { activate, activationDerivative, linear } from '../../src/math.ts';

const inputs = [1, 2];
const weights = [1, -1];
const activation = 'relu' as const;
const state = (bias: number) => {
  const z = linear([inputs], [weights], [bias])[0][0];
  return { bias, z, output: activate(z, activation), derivative: activationDerivative(z, activation) };
};
const fixture = {
  activation,
  inputs,
  weights,
  contributions: inputs.map((input, i) => linear([[input]], [[weights[i]]], [0])[0][0]),
  initial: state(0),
  final: state(2),
  curve: [-2, 0, 2].map(z => ({ z, output: activate(z, activation) })),
};
writeFileSync(new URL('./fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('Exported neuron fixture from linear, activate and activationDerivative.');
