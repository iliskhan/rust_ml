import { activate, mse, sharedGraph, type Activation } from './math.ts'

export type ActionCheck = { passed: boolean; feedback: string }
export type NeuronPracticeState = { x1: number; x2: number; w1: number; w2: number; bias: number; kind: Activation }
export const NEURON_PRACTICE_START: NeuronPracticeState = { x1: 1, x2: 2, w1: 1, w2: -1, bias: 0, kind: 'relu' }
export const MSE_PRACTICE_START = [0.5, 2.5, 2]
export const BACKPROP_PRACTICE_START = { x: 1.2, w: 0.8, target: 1, step: 0 }

const number = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 4 })
const result = (passed: boolean, feedback: string): ActionCheck => ({ passed, feedback })

export function checkNeuronPractice(state: NeuronPracticeState): ActionCheck {
  if (![state.x1, state.x2, state.w1, state.w2, state.bias].every(Number.isFinite)) return result(false, 'Нужны конечные числа во всех параметрах нейрона.')
  const fixed = ['x1', 'x2', 'w1', 'w2', 'kind'] as const
  const changed = fixed.filter(key => state[key] !== NEURON_PRACTICE_START[key])
  if (changed.length) return result(false, `Изменены ${changed.join(', ')}. В этом задании меняется только b: верните x₁ = 1, x₂ = 2, w₁ = 1, w₂ = −1 и ReLU.`)
  const z = state.x1 * state.w1 + state.x2 * state.w2 + state.bias
  const output = activate(z, state.kind)
  return output > 0
    ? result(true, `ReLU включена: z = −1 + ${number(state.bias)} = ${number(z)}; a = ${number(output)} > 0. Входы и веса сохранены.`)
    : result(false, `Сейчас z = −1 + ${number(state.bias)} = ${number(z)}, поэтому a = 0. Нужно b > 1; при b = 1 выход ещё нулевой.`)
}

export function checkMsePractice(predictions: number[]): ActionCheck {
  if (predictions.length !== 3 || !predictions.every(Number.isFinite)) return result(false, 'Нужны три конечных предсказания.')
  if (predictions[0] !== MSE_PRACTICE_START[0] || predictions[1] !== MSE_PRACTICE_START[1]) return result(false, `Сейчас ŷ₁ = ${number(predictions[0])}, ŷ₂ = ${number(predictions[1])}. Верните 0,5 и 2,5: меняется только ŷ₃.`)
  const { loss, terms } = mse(predictions, [1, 2, 3])
  return result(loss < 0.2, `MSE = (0,25 + 0,25 + ${number(terms[2])}) / 3 = ${number(loss)} ${loss < 0.2 ? '< 0,2. Цель достигнута; первые два предсказания сохранены.' : '≥ 0,2. Приблизьте ŷ₃ к цели 3. Первые два вклада оставляют минимум MSE = 1/6 ≈ 0,1667.'}`)
}

export function checkBackpropPractice(state: { x: number; w: number; target: number; step: number }): ActionCheck {
  if (![state.x, state.w, state.target].every(Number.isFinite)) return result(false, 'Нужны конечные вход, вес и цель.')
  if (state.x !== BACKPROP_PRACTICE_START.x || state.target !== BACKPROP_PRACTICE_START.target) return result(false, `Сейчас x = ${number(state.x)}, y = ${number(state.target)}. Верните x = 1,2 и y = 1: подбирайте только вес w.`)
  const graph = sharedGraph(state.x, state.w, state.target)
  if (graph.values.loss >= 0.05) return result(false, `При w = ${number(state.w)} предсказание p = ${number(graph.values.p)}, L = ${number(graph.values.loss)} ≥ 0,05. В начале ∂L/∂w > 0: попробуйте уменьшить w небольшим шагом.`)
  if (state.step !== 3) return result(false, `L = ${number(graph.values.loss)} < 0,05. Теперь дойдите до шага 4 «Сумма вкладов и градиенты весов»: изменение параметра возвращает граф к прямому проходу.`)
  return result(true, `L = ${number(graph.values.loss)} < 0,05. На шаге 4 оба пути дают ∂L/∂q = ${number(graph.qContributions.square)} + (${number(graph.qContributions.identity)}) = ${number(graph.gradients.q)}. Вход и цель сохранены.`)
}
