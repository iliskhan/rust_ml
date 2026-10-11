import test from 'node:test'
import assert from 'node:assert/strict'
import { sharedGraph, mse } from '../src/math.ts'
import { NEURON_PRACTICE_START, MSE_PRACTICE_START, BACKPROP_PRACTICE_START, checkNeuronPractice, checkMsePractice, checkBackpropPractice } from '../src/actionExerciseMath.ts'

test('all practice starts need an actual action before success', () => {
  assert.equal(checkNeuronPractice(NEURON_PRACTICE_START).passed, false)
  assert.equal(checkMsePractice([...MSE_PRACTICE_START]).passed, false)
  assert.equal(checkBackpropPractice(BACKPROP_PRACTICE_START).passed, false)
  assert.equal(mse(MSE_PRACTICE_START, [1, 2, 3]).loss, 0.5)
  assert.ok(Math.abs(sharedGraph(1.2, 0.8, 1).values.loss - 0.38860928) < 1e-12)
})

test('ReLU needs strictly positive preactivation while only bias changes', () => {
  for (const bias of [-2, 0, 0.9, 1]) assert.equal(checkNeuronPractice({ ...NEURON_PRACTICE_START, bias }).passed, false)
  for (const bias of [1.1, 1.5, 2]) assert.equal(checkNeuronPractice({ ...NEURON_PRACTICE_START, bias }).passed, true)
  assert.match(checkNeuronPractice({ ...NEURON_PRACTICE_START, bias: 1 }).feedback, /выход ещё нулевой/)
})

test('positive neuron output from changed inputs, weights or activation is not the requested action', () => {
  for (const override of [{ x1: 2 }, { x2: 1 }, { w1: 2 }, { w2: 0 }, { kind: 'sigmoid' as const }]) {
    assert.equal(checkNeuronPractice({ ...NEURON_PRACTICE_START, bias: 1.5, ...override }).passed, false)
  }
  assert.equal(checkNeuronPractice({ ...NEURON_PRACTICE_START, bias: NaN }).passed, false)
})

test('MSE task accepts a near target third prediction, including exact target', () => {
  for (const third of [2.7, 3, 3.3]) assert.equal(checkMsePractice([0.5, 2.5, third]).passed, true)
  for (const third of [-1, 2, 2.6, 3.4, 5]) assert.equal(checkMsePractice([0.5, 2.5, third]).passed, false)
  assert.match(checkMsePractice([0.5, 2.5, 2]).feedback, /минимум MSE = 1\/6/)
})

test('MSE goal cannot be met by correcting the forbidden first or second prediction', () => {
  for (const predictions of [[1, 2.5, 3], [0.5, 2, 3], [1, 2, 3]]) {
    assert.ok(mse(predictions, [1, 2, 3]).loss < 0.2)
    assert.equal(checkMsePractice(predictions).passed, false)
  }
  assert.equal(checkMsePractice([0.5, 2.5, Infinity]).passed, false)
  assert.equal(checkMsePractice([0.5, 2.5]).passed, false)
})

test('backprop task requires both smaller actual loss and the final graph stage', () => {
  for (const w of [0.5, 0.6]) {
    assert.ok(sharedGraph(1.2, w, 1).values.loss < 0.05)
    for (const step of [0, 1, 2]) assert.equal(checkBackpropPractice({ ...BACKPROP_PRACTICE_START, w, step }).passed, false)
    assert.equal(checkBackpropPractice({ ...BACKPROP_PRACTICE_START, w, step: 3 }).passed, true)
  }
  for (const w of [-2, 0, 0.8, 1]) assert.equal(checkBackpropPractice({ ...BACKPROP_PRACTICE_START, w, step: 3 }).passed, false)
})

test('backprop rejects low loss obtained by changing the input or the target', () => {
  const matchedTarget = sharedGraph(1.2, 0.8, 1).values.p
  const changedTarget = { ...BACKPROP_PRACTICE_START, target: matchedTarget, step: 3 }
  const changedInput = { ...BACKPROP_PRACTICE_START, x: 1, w: 0.6, step: 3 }
  assert.equal(sharedGraph(changedTarget.x, changedTarget.w, changedTarget.target).values.loss, 0)
  assert.ok(sharedGraph(changedInput.x, changedInput.w, changedInput.target).values.loss < 0.05)
  assert.equal(checkBackpropPractice(changedTarget).passed, false)
  assert.equal(checkBackpropPractice(changedInput).passed, false)
  assert.equal(checkBackpropPractice({ ...BACKPROP_PRACTICE_START, w: NaN, step: 3 }).passed, false)
})

test('backprop feedback uses both current branch contributions and actual current gradient', () => {
  const state = { ...BACKPROP_PRACTICE_START, w: 0.5, step: 3 }
  const graph = sharedGraph(state.x, state.w, state.target)
  assert.ok(Math.abs(graph.qContributions.square + graph.qContributions.identity - graph.gradients.q) < 1e-12)
  const checked = checkBackpropPractice(state)
  assert.equal(checked.passed, true)
  assert.match(checked.feedback, /−?0,048/)
  assert.match(checked.feedback, /−?0,04/)
  assert.match(checked.feedback, /−?0,088/)
})
