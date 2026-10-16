import assert from 'node:assert/strict'
import test from 'node:test'
import { crossesAnimationQuestion, saveAnimationSettings } from '../src/animationInteraction.ts'

test('film questions interrupt playback once at the crossing, never a seek or a paused chapter', () => {
  assert.equal(crossesAnimationQuestion(13.9, 14.1, 14, true, false), true)
  assert.equal(crossesAnimationQuestion(0, 24, 14, true, true), false)
  assert.equal(crossesAnimationQuestion(13.9, 14.1, 14, false, false), false)
  assert.equal(crossesAnimationQuestion(14.1, 14.3, 14, true, false), false)
  assert.equal(crossesAnimationQuestion(20, 2, 14, true, false), false)
})

test('film apply preserves the first full snapshot and does not share mutable arrays', () => {
  const original = { tracks: [{ params: [1, 2], step: 8 }], selected: 1 }
  const saved = saveAnimationSettings(null, original)
  original.tracks[0].params[0] = 9
  assert.deepEqual(saved, { tracks: [{ params: [1, 2], step: 8 }], selected: 1 })
  assert.equal(saveAnimationSettings(saved, { tracks: [{ params: [7], step: 0 }], selected: 0 }), saved)
})
