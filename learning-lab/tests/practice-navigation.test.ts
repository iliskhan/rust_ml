import test from 'node:test'
import assert from 'node:assert/strict'
import { practiceTopics, practiceRelease } from '../src/practice/all-catalog.ts'
import { practiceLessonLabels } from '../src/practice/placement.ts'
import { LocalPracticeStore, practiceStorageKey } from '../src/practice/local-progress.ts'
import { readLearningProgress } from '../src/practice/progress/learning-progress.ts'
import { findPracticeTopics, latestPracticeWork } from '../src/practice/progress/practice-navigation.ts'

test('search matches all query words across topic, exercise and course, with no empty-query results', () => {
  assert.deepEqual(findPracticeTopics(practiceTopics, '  ', practiceLessonLabels), [])
  const result = findPracticeTopics(practiceTopics, '  SOFTMAX  ', practiceLessonLabels)
  assert.ok(result.length > 0)
  assert.ok(result.every(row => `${row.topic.title} ${row.exercise.title}`.toLowerCase().includes('softmax')))
  const topic = practiceTopics[0]
  const exercise = topic.exercises[1]
  const byExercise = findPracticeTopics([topic], exercise.title, practiceLessonLabels)
  assert.equal(byExercise[0].exercise.id, exercise.id, 'a matching transfer exercise is opened directly')
  assert.equal(findPracticeTopics([topic], `${practiceLessonLabels[topic.lessonId]} ${topic.title}`, practiceLessonLabels)[0].topic.id, topic.id)
  assert.deepEqual(findPracticeTopics(practiceTopics, 'softmax неттакогослова', practiceLessonLabels), [])
})

test('continuation returns newest work across languages, scoped to owner and release, without writing', async () => {
  const values = new Map<string, string>()
  let clock = 0
  const store = new LocalPracticeStore({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) } }, async (_key, action) => action(), () => new Date(Date.UTC(2026, 9, 13, 0, 0, clock++)).toISOString())
  const topics = [practiceTopics[0]]
  const scope = { releaseId: practiceRelease, exerciseId: topics[0].exercises[0].id, language: 'python' as const }
  assert.equal(latestPracticeWork(readLearningProgress(store, topics, practiceRelease)), null)
  await store.saveDraft(scope, 'guest python', 0)
  await store.saveDraft({ ...scope, language: 'rust' }, 'guest rust', 0)
  await store.recordHelp({ ...scope, ownerId: 'account-a' }, 'solution')
  await store.saveDraft({ ...scope, releaseId: 'old-release' }, 'old', 0)
  values.set(practiceStorageKey({ ...scope, language: 'javascript' }), '{broken')
  const before = [...values]
  const guest = latestPracticeWork(readLearningProgress(store, topics, practiceRelease))!
  assert.equal(guest.scope.language, 'rust')
  assert.equal(guest.scope.ownerId, undefined)
  assert.equal(latestPracticeWork(readLearningProgress(store, topics, practiceRelease, 'account-a'))?.scope.ownerId, 'account-a')
  assert.equal(latestPracticeWork(readLearningProgress(store, topics, practiceRelease, 'account-b')), null)
  assert.deepEqual([...values], before, 'navigation never rewrites drafts, history or language preference')
})
