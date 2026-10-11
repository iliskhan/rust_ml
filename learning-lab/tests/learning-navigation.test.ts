import test from 'node:test';
import assert from 'node:assert/strict';
import { initialNavigation, learningNavigation, MAX_CONCEPT_DEPTH } from '../src/learning-navigation.ts';

test('recursive path returns to the right level and retains every visited experiment', () => {
  let state = initialNavigation;
  for (const id of ['gradient', 'derivative', 'limit']) state = learningNavigation(state, { type: 'open', id });
  assert.deepEqual(state.path, ['gradient', 'derivative', 'limit']);
  state = learningNavigation(state, { type: 'back' });
  assert.deepEqual(state.path, ['gradient', 'derivative']);
  assert.deepEqual(state.visited, ['gradient', 'derivative', 'limit']);
  state = learningNavigation(state, { type: 'jump', index: 0 });
  assert.deepEqual(state.path, ['gradient']);
  state = learningNavigation(state, { type: 'close' });
  assert.deepEqual(state.path, []);
  state = learningNavigation(state, { type: 'open', id: 'derivative' });
  assert.deepEqual(state.path, ['derivative']);
  assert.deepEqual(state.visited, ['gradient', 'derivative', 'limit']);
});

test('cycles reuse an existing level; repeated opens never duplicate a frame', () => {
  let state = learningNavigation(initialNavigation, { type: 'open', id: 'gradient' });
  state = learningNavigation(state, { type: 'open', id: 'derivative' });
  state = learningNavigation(state, { type: 'open', id: 'gradient' });
  assert.deepEqual(state.path, ['gradient']);
  assert.deepEqual(state.visited, ['gradient', 'derivative']);
  assert.match(state.message, /Вернулись/);
  state = learningNavigation(state, { type: 'open', id: 'gradient' });
  assert.deepEqual(state.path, ['gradient']);
  assert.match(state.message, /уже открыто/);
});

test('depth limit explains the blocked transition without discarding states or path', () => {
  let state = initialNavigation;
  for (let i = 0; i < MAX_CONCEPT_DEPTH; i++) state = learningNavigation(state, { type: 'open', id: `concept-${i}` });
  const previous = state;
  state = learningNavigation(state, { type: 'open', id: 'too-deep' });
  assert.deepEqual(state.path, previous.path);
  assert.deepEqual(state.visited, previous.visited);
  assert.match(state.message, /сохранятся/);
  state = learningNavigation(state, { type: 'open', id: 'concept-0' });
  assert.deepEqual(state.path, ['concept-0']);
});

test('invalid breadcrumb jumps are ignored; returning from root closes the explorer', () => {
  const state = learningNavigation(initialNavigation, { type: 'open', id: 'gradient' });
  for (const index of [-1, 1, 0.5, NaN]) assert.equal(learningNavigation(state, { type: 'jump', index }), state);
  assert.deepEqual(learningNavigation(state, { type: 'back' }).path, []);
  assert.deepEqual(learningNavigation(initialNavigation, { type: 'back' }).path, []);
});
