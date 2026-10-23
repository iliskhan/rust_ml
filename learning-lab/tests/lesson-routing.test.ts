import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonRoute, explanationHref, topicChapter, explanationAnchor, openExplanation } from '../src/lesson-routing.ts';
import { practiceChapterIds } from '../src/practice/placement.ts';
import { practiceTopics } from '../src/practice/all-catalog.ts';

test('explanation links preserve the stable topic and every placed chapter resolves exactly', () => {
  for (const [lessonId, chapters] of Object.entries(practiceChapterIds)) {
    chapters.forEach((topicId, index) => {
      assert.deepEqual(lessonRoute(explanationHref(lessonId, topicId)), { lessonId, topicId });
      assert.equal(topicChapter(lessonId, topicId), index, topicId);
    });
  }
  for (const topic of practiceTopics.filter(topic => topic.lessonId !== 'math')) {
    assert.ok(topicChapter(topic.lessonId, topic.id) >= 0, topic.id);
  }
  assert.equal(topicChapter('advanced', 'unit.advanced.lora'), 3);
  assert.equal(topicChapter('neuron', 'unit.neuron.activation.relu'), 1);
  assert.equal(topicChapter('architectures', 'unit.architecture.cnn-training'), 2);
  assert.equal(topicChapter('architectures', 'unit.architecture.cnn-shift'), 3);
  assert.equal(topicChapter('advanced', 'unrelated'), -1);
  assert.deepEqual(lessonRoute('#advanced'), { lessonId: 'advanced', topicId: null });
  assert.equal(explanationAnchor('backprop', 'unit.backprop.check'), 'backprop-check');
});

test('returning to the same explanation explicitly replays navigation; modified clicks stay native', () => {
  const hash = explanationHref('advanced', 'unit.advanced.lora');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousHashChange = Object.getOwnPropertyDescriptor(globalThis, 'HashChangeEvent');
  let navigations = 0, prevented = 0;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hash }, dispatchEvent: () => { navigations++; } } });
  Object.defineProperty(globalThis, 'HashChangeEvent', { configurable: true, value: Event });
  try {
    const event = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, currentTarget: { hash } as HTMLAnchorElement, preventDefault: () => { prevented++; } };
    openExplanation(event);
    assert.equal(navigations, 1);
    assert.equal(prevented, 1);
    openExplanation({ ...event, ctrlKey: true });
    assert.equal(navigations, 1);
    assert.equal(prevented, 1);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (previousHashChange) Object.defineProperty(globalThis, 'HashChangeEvent', previousHashChange); else Reflect.deleteProperty(globalThis, 'HashChangeEvent');
  }
});
