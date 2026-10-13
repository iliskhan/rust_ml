import test from 'node:test'
import assert from 'node:assert/strict'
import { practiceTopics, practiceRelease } from '../src/practice/all-catalog.ts'
import { LocalPracticeStore, practiceStorageKey, primaryLanguageKey, type PracticeScope, type StorageLike } from '../src/practice/local-progress.ts'
import { readLearningProgress, readAccountProgress } from '../src/practice/progress/learning-progress.ts'

const subset = [{ ...practiceTopics[0], exercises: practiceTopics[0].exercises.slice(0, 2) }]
const scope: PracticeScope = { releaseId: practiceRelease, exerciseId: subset[0].exercises[0].id, language: 'python' }
function setup() {
  const values = new Map<string, string>()
  let clock = 0
  const storage: StorageLike = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) } }
  const store = new LocalPracticeStore(storage, async (_name, action) => action(), () => new Date(Date.UTC(2026, 9, 13, 0, 0, clock++)).toISOString())
  return { values, storage, store }
}
const python = (store: LocalPracticeStore, ownerId?: string) => readLearningProgress(store, subset, practiceRelease, ownerId).languages[0]
const catalog = { releaseKey: practiceRelease, releaseId: 'release-uuid', topicIds: { 'semantic-topic': 'topic-uuid' } }
const row = { user_id: 'owner-a', release_id: catalog.releaseId, topic_id: 'topic-uuid', language: 'python', is_primary_language: true, required_total: 2, required_completed: 0, required_passed: 0 }

test('current complete catalog supplies 136 topics and 412 exercises separately for each language', () => {
  const { store, values } = setup()
  const result = readLearningProgress(store, practiceTopics, practiceRelease)
  assert.equal(result.primaryLanguage, 'python')
  assert.deepEqual(result.languages.map(language => language.language), ['python', 'javascript', 'rust'])
  for (const language of result.languages) {
    assert.equal(language.topics.length, 136)
    assert.deepEqual(language.counts, { exercisesTotal: 412, drafts: 0, helped: 0, quizExercises: 0, latestCorrect: 0, quizAttempts: 0, unreadable: 0 })
    assert.equal(language.topicsStarted, 0)
    assert.equal(language.continueWith, null)
  }
  assert.equal(values.size, 0, 'summary does not initialize or migrate storage')
})

test('subset and release filter out removed exercises and older release records', async () => {
  const { store } = setup()
  await store.saveDraft(scope, 'current', 0)
  await store.recordQuiz({ ...scope, releaseId: 'older-release' }, 0, true)
  await store.saveDraft({ ...scope, exerciseId: 'removed-exercise' }, 'old content', 0)
  const current = python(store)
  assert.equal(current.counts.exercisesTotal, 2)
  assert.equal(current.counts.drafts, 1)
  assert.equal(current.counts.quizAttempts, 0)
  const old = readLearningProgress(store, subset, 'older-release').languages[0]
  assert.equal(old.counts.drafts, 0)
  assert.equal(old.counts.quizAttempts, 1)
})

test('guest, accounts and languages remain isolated after reload, including primary preference', async () => {
  const { store, storage, values } = setup()
  await store.saveDraft(scope, 'guest', 0)
  await store.recordQuiz(scope, 0, true)
  await store.setPrimaryLanguage(practiceRelease, 'javascript')
  const ownerScope = { ...scope, ownerId: 'owner-a', language: 'rust' as const }
  await store.saveDraft(ownerScope, 'private rust', 0)
  await store.recordHelp(ownerScope, 'solution')
  await store.recordQuiz(ownerScope, 1, false)
  await store.setPrimaryLanguage(practiceRelease, 'rust', 'owner-a')
  const before = [...values.entries()]
  const reload = new LocalPracticeStore(storage)
  const guest = readLearningProgress(reload, subset, practiceRelease)
  assert.equal(guest.primaryLanguage, 'javascript')
  assert.equal(guest.languages[0].counts.latestCorrect, 1)
  assert.equal(guest.languages[2].counts.drafts, 0)
  const a = readLearningProgress(reload, subset, practiceRelease, 'owner-a')
  assert.equal(a.primaryLanguage, 'rust')
  assert.equal(a.languages[0].counts.drafts, 0)
  assert.deepEqual(a.languages[2].counts, { exercisesTotal: 2, drafts: 1, helped: 1, quizExercises: 1, latestCorrect: 0, quizAttempts: 1, unreadable: 0 })
  assert.equal(a.languages[2].continueWith?.scope.ownerId, 'owner-a')
  assert.deepEqual(a.languages[2].continueWith?.helpKinds, ['solution'])
  const b = readLearningProgress(reload, subset, practiceRelease, 'owner-b')
  assert.equal(b.primaryLanguage, 'python')
  assert.ok(b.languages.every(language => language.counts.drafts === 0 && language.counts.quizAttempts === 0 && language.counts.helped === 0))
  assert.deepEqual([...values.entries()], before, 'read-only reload retains all owners unchanged')
})

test('saved history is bounded, latest answer controls formative counts, and newest activity guides continuation', async () => {
  const { store } = setup()
  await store.saveDraft(scope, 'unverified code', 0)
  await store.recordHelp(scope, 'solution')
  for (let index = 0; index < 105; index++) await store.recordQuiz(scope, index % 2, index < 104)
  let result = python(store)
  assert.equal(result.counts.quizAttempts, 100)
  assert.equal(result.counts.quizExercises, 1)
  assert.equal(result.counts.latestCorrect, 0)
  assert.equal(result.continueWith?.latestQuizCorrect, false)
  const other = { ...scope, exerciseId: subset[0].exercises[1].id }
  await store.recordQuiz(other, 1, true)
  result = python(store)
  assert.equal(result.counts.latestCorrect, 1)
  assert.equal(result.counts.quizAttempts, 101)
  assert.equal(result.topicsStarted, 1)
  assert.equal(result.continueWith?.scope.exerciseId, other.exerciseId)
  assert.equal(result.continueWith?.lastActivityAt, store.read(other).history.at(-1)?.at)
  assert.ok(!('completed' in result.counts) && !('passed' in result.counts) && !('mastered' in result))
  assert.equal(readAccountProgress([row], catalog, 'owner-a')[0].completed, 0, 'local answers/help/drafts cannot close server requirements')
})

test('corrupt records and corrupt primary language remain unchanged and explicitly incomplete', async () => {
  const { store, values } = setup()
  const brokenKey = practiceStorageKey(scope)
  values.set(brokenKey, '{broken')
  values.set(primaryLanguageKey(practiceRelease), 'unknown-language')
  await store.saveDraft({ ...scope, exerciseId: subset[0].exercises[1].id }, 'readable', 0)
  const before = [...values.entries()]
  const result = readLearningProgress(store, subset, practiceRelease)
  assert.equal(result.primaryLanguage, 'python')
  assert.match(result.primaryError!, /повреждена/)
  assert.equal(result.languages[0].counts.unreadable, 1)
  assert.equal(result.languages[0].counts.drafts, 1)
  assert.match(result.languages[0].topics[0].exercises[0].error!, /повреждена/)
  assert.deepEqual([...values.entries()], before)
})

test('denied storage yields visible read failures without writes or fabricated activity', () => {
  let writes = 0
  const store = new LocalPracticeStore({ getItem() { throw new Error('SecurityError') }, setItem() { writes++ } })
  const result = readLearningProgress(store, subset, practiceRelease)
  assert.match(result.primaryError!, /прочитать/)
  for (const language of result.languages) {
    assert.equal(language.counts.unreadable, 2)
    assert.equal(language.counts.exercisesTotal, 2)
    assert.equal(language.topicsStarted, 0)
    assert.equal(language.continueWith, null)
  }
  assert.equal(writes, 0)
})

test('account results filter owner, release and unknown topics, preserve SQL counts and ignore client mastery flags', () => {
  const rows = [
    { ...row, user_id: 'owner-b', required_total: 'malformed' },
    { ...row, release_id: 'old-release', required_total: 'malformed' },
    { ...row, topic_id: 'unknown-topic', required_total: 'malformed' },
    { ...row, required_passed: 1, completed: true, mastered: true },
    { ...row, language: 'rust', is_primary_language: false, required_total: 2, required_completed: 2, required_passed: 2 },
  ]
  assert.deepEqual(readAccountProgress(rows, catalog, 'owner-a'), [
    { topicId: 'semantic-topic', language: 'python', isPrimary: true, total: 2, completed: 0, passed: 1 },
    { topicId: 'semantic-topic', language: 'rust', isPrimary: false, total: 2, completed: 2, passed: 2 },
  ], 'A/B is already an OR group in SQL; assisted pass is not independent completion')
})

test('account response rejects malformed selected rows, unsafe counts and duplicate topic/language rows', () => {
  for (const invalid of [null, undefined, 'row', 1]) assert.throws(() => readAccountProgress([invalid], catalog, 'owner-a'), /Некорректный ответ/)
  for (const changes of [
    { language: 'go' }, { is_primary_language: 'true' },
    { required_total: -1 }, { required_total: 1.5 }, { required_total: Number.MAX_SAFE_INTEGER + 1 },
    { required_total: Infinity }, { required_total: NaN }, { required_total: '2' },
    { required_completed: 1, required_passed: 0 }, { required_passed: 3 },
    { required_completed: -1 }, { required_passed: -1 }, { required_completed: undefined },
  ]) assert.throws(() => readAccountProgress([{ ...row, ...changes }], catalog, 'owner-a'), /Некорректные числа/)
  assert.throws(() => readAccountProgress([row, { ...row }], catalog, 'owner-a'), /повторную запись/)
})

test('empty account data and zero requirements do not fabricate completion', () => {
  assert.deepEqual(readAccountProgress([], catalog, 'owner-a'), [])
  assert.deepEqual(readAccountProgress([{ ...row, required_total: 0 }], catalog, 'owner-a'), [
    { topicId: 'semantic-topic', language: 'python', isPrimary: true, total: 0, completed: 0, passed: 0 },
  ])
  assert.throws(() => readAccountProgress([{ ...row, required_total: 0, required_passed: 1 }], catalog, 'owner-a'), /Некорректные числа/)
})
