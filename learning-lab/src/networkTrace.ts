import { activate, bceLogit } from './math.ts';

export type NetworkTrace = {
  input: [number, number];
  target: number;
  hidden: Array<{
    index: number;
    z: number;
    activation: number;
    activationSlope: number;
    outputWeight: number;
    dLossDActivation: number;
    dLossDPreactivation: number;
    inputContributions: [number, number];
  }>;
  logit: number;
  probability: number;
  loss: number;
  dLossDLogit: number;
  outputContributions: number[];
  parameterGradient: number[];
  inputGradient: [number, number];
};

function finite(values: number[]) {
  if (!values.every(Number.isFinite)) throw new RangeError('Разбор XOR: нужны конечные числа без переполнения');
}

/** Zero-based names, in the same W1 [4,2], b1 [4], W2 [1,4], b2 order as math.ts. */
export function networkParameterName(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 17) throw new RangeError('Индекс параметра XOR должен быть от 0 до 16');
  if (index < 8) return `W1[${Math.floor(index / 2)},${index % 2}]`;
  if (index < 12) return `b1[${index - 8}]`;
  if (index < 16) return `W2[${index - 12}]`;
  return 'b2';
}

/** Trace one example. Gradients are not divided by the four-example XOR batch size. */
export function traceNetwork(parameters: number[], input: [number, number], target: number): NetworkTrace {
  if (!Array.isArray(parameters) || parameters.length !== 17 || !Array.isArray(input) || input.length !== 2) {
    throw new RangeError('Разбор XOR: нужны 17 параметров сети 2→4→1 и два входа');
  }
  finite([...parameters, ...input]);
  const hidden: NetworkTrace['hidden'] = Array.from({ length: 4 }, (_, index) => {
    const inputContributions: [number, number] = [parameters[2 * index] * input[0], parameters[2 * index + 1] * input[1]];
    const z = inputContributions[0] + inputContributions[1] + parameters[8 + index];
    finite([...inputContributions, z]);
    const activation = activate(z, 'tanh');
    return {
      index, z, activation, activationSlope: 1 - activation * activation,
      outputWeight: parameters[12 + index], inputContributions,
      dLossDActivation: 0, dLossDPreactivation: 0,
    };
  });
  const outputContributions = hidden.map(h => h.outputWeight * h.activation);
  const logit = outputContributions.reduce((sum, contribution) => sum + contribution, parameters[16]);
  const { loss, grad: dLossDLogit } = bceLogit(logit, target);
  const parameterGradient = Array<number>(17).fill(0);
  const inputGradient: [number, number] = [0, 0];
  parameterGradient[16] = dLossDLogit;
  for (const h of hidden) {
    h.dLossDActivation = dLossDLogit * h.outputWeight;
    h.dLossDPreactivation = h.dLossDActivation * h.activationSlope;
    parameterGradient[12 + h.index] = dLossDLogit * h.activation;
    parameterGradient[8 + h.index] = h.dLossDPreactivation;
    for (const x of [0, 1] as const) {
      parameterGradient[2 * h.index + x] = h.dLossDPreactivation * input[x];
      inputGradient[x] += h.dLossDPreactivation * parameters[2 * h.index + x];
    }
  }
  finite([...parameterGradient, ...inputGradient]);
  return {
    input: [...input], target, hidden, logit, probability: activate(logit, 'sigmoid'),
    loss, dLossDLogit, outputContributions, parameterGradient, inputGradient,
  };
}
