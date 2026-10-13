import test from 'node:test'
import assert from 'node:assert/strict'
import { practiceTopics, practiceRelease } from '../src/practice/all-catalog.ts'
import { LocalPracticeStore, practiceStorageKey, type PracticeLock, type StorageLike } from '../src/practice/local-progress.ts'
import { collectLearningEvents, mergeLearningEvents, recordLanguagePreference, readLanguagePreference, syncLearningProgress, validateLearningEvents, type CloudLearningEvent, type LearningEvent } from '../src/practice/progress-sync.ts'

const topics = [{ ...practiceTopics[0], exercises: practiceTopics[0].exercises.slice(0, 1) }]
const scope = { ownerId: 'owner-a', releaseId: practiceRelease, exerciseId: topics[0].exercises[0].id, language: 'python' as const }
const at = '2026-10-13T08:00:00.000Z'
const lock: PracticeLock = async (_name, action) => action()
function setup() {
  const values = new Map<string, string>()
  const storage: StorageLike = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) } }
  return { values, storage, store: new LocalPracticeStore(storage, lock, () => at) }
}
const cloudRows = (events: LearningEvent[]): CloudLearningEvent[] => events.map((event, index) => ({ ...event, user_id: scope.ownerId, release_id: 'cloud-release', sequence: index + 1 }))

test('two devices merge same-time distinct selfchecks and help without duplicating retries or replacing drafts', async () => {
  const a = setup(), b = setup()
  await a.store.saveDraft(scope, 'a draft', 0)
  await b.store.saveDraft(scope, 'b draft', 0)
  await a.store.recordQuiz(scope, 1, true)
  await b.store.recordQuiz(scope, 1, true)
  await a.store.recordHelp(scope, 'hint:0')
  await b.store.recordHelp(scope, 'solution')
  const ae = await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId)
  const be = await collectLearningEvents(b.store, topics, practiceRelease, scope.ownerId)
  const union = [...ae, ...be]
  await a.store.mergeLearning(scope, union)
  await b.store.mergeLearning(scope, [...union].reverse())
  assert.deepEqual(a.store.read(scope).history, b.store.read(scope).history)
  assert.equal(a.store.read(scope).history.length, 2)
  assert.equal(a.store.read(scope).draft?.code, 'a draft')
  assert.equal(b.store.read(scope).draft?.code, 'b draft')
  const before = a.store.read(scope)
  await a.store.mergeLearning(scope, union)
  assert.deepEqual(a.store.read(scope), before)
  assert.deepEqual(before.help.map(h => h.kind), ['hint:0', 'solution'])
  assert.equal('mastered' in before, false)
  assert.equal('passed' in before, false)
})

test('legacy receipts acquire stable identities, including identical repeated quiz answers', async () => {
  const a = setup()
  const quiz = { answer: 0, correct: true, at, draftRevision: 0 }
  a.values.set(practiceStorageKey(scope), JSON.stringify({ version: 1, draft: null, help: [], history: [quiz, quiz] }))
  const first = await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId)
  assert.equal(first.length, 2)
  assert.notEqual(first[0].event_id, first[1].event_id)
  assert.deepEqual(await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId), first)
  await a.store.mergeLearning(scope, first)
  assert.deepEqual(await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId).then(e => e.filter(v => v.kind === 'quiz').sort((a,b) => a.event_id.localeCompare(b.event_id))), first.sort((a,b) => a.event_id.localeCompare(b.event_id)))
  assert.equal(a.store.read(scope).history.length, 2)
})

test('guest/account/release data is isolated in uploads and untrusted cloud owner rows fail closed', async () => {
  const a = setup()
  await a.store.recordQuiz({ ...scope, ownerId: undefined }, 0, true)
  await a.store.recordQuiz({ ...scope, ownerId: 'owner-b' }, 0, true)
  await a.store.recordQuiz({ ...scope, releaseId: 'old' }, 0, true)
  assert.deepEqual(await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId), [])
  await assert.rejects(collectLearningEvents(a.store, topics, practiceRelease, ''), /аккаунт/)
  await a.store.recordQuiz(scope, 0, true)
  const rows = cloudRows(await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId))
  assert.deepEqual(validateLearningEvents(rows, scope.ownerId, 'cloud-release'), rows)
  for (const row of [{ ...rows[0], user_id: 'owner-b' }, { ...rows[0], release_id: 'old' }, { ...rows[0], sequence: '1' }, { ...rows[0], payload: { ...rows[0].payload, passed: true } }]) {
    assert.throws(() => validateLearningEvents([row], scope.ownerId, 'cloud-release'), /Некорректный/)
  }
  assert.throws(() => validateLearningEvents([rows[0], rows[0]], scope.ownerId, 'cloud-release'), /Некорректный/)
})

test('merged history stays last 100 while new-device resume uses activity without fabricating a draft', async () => {
  const a = setup(), b = setup()
  for (let index = 0; index < 105; index++) await a.store.recordQuiz(scope, index, index % 2 === 0)
  await a.store.touchActivity(scope)
  const events = await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId)
  await b.store.mergeLearning(scope, events)
  const record = b.store.read(scope)
  assert.equal(record.history.length, 100)
  assert.equal(record.draft, null)
  assert.equal(record.activityAt, at)
  assert.equal(new Set(record.history.map(h => h.syncId)).size, 100)
})

test('explicit language preference converges and remote merge does not create a new preference event', async () => {
  const a = setup(), b = setup()
  await a.store.setPrimaryLanguage(practiceRelease, 'rust', scope.ownerId)
  const event = readLanguagePreference(a.storage, practiceRelease, scope.ownerId)!
  assert.equal(event.language, 'rust')
  await b.store.mergePrimaryLanguage(practiceRelease, scope.ownerId, [event])
  assert.equal(b.store.getPrimaryLanguage(practiceRelease, scope.ownerId), 'rust')
  assert.deepEqual(readLanguagePreference(b.storage, practiceRelease, scope.ownerId), event)
  const newer = recordLanguagePreference(b.storage, practiceRelease, scope.ownerId, 'javascript', '2026-10-13T08:01:00.000Z')
  await b.store.mergePrimaryLanguage(practiceRelease, scope.ownerId, [event])
  assert.equal(b.store.getPrimaryLanguage(practiceRelease, scope.ownerId), 'javascript')
  await a.store.mergePrimaryLanguage(practiceRelease, scope.ownerId, [newer, event])
  assert.equal(a.store.getPrimaryLanguage(practiceRelease, scope.ownerId), 'javascript')
  assert.equal(b.store.getPrimaryLanguage(practiceRelease, 'owner-b'), 'python')
})

test('conflicting receipt identities and corrupt preferences preserve local data', async () => {
  const a = setup()
  await a.store.recordQuiz(scope, 1, true)
  const events = await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId)
  const original = a.store.read(scope)
  await assert.rejects(mergeLearningEvents(original, scope, [{ ...events[0], payload: { answer: 2, correct: false, draftRevision: 0 } }]), /Конфликт/)
  assert.deepEqual(a.store.read(scope), original)
  const event = recordLanguagePreference(a.storage, practiceRelease, scope.ownerId, 'python', at)
  const key = [...a.values.keys()].find(k => k.includes('learning-language'))!
  a.values.set(key, JSON.stringify({ ...event, language: 'go' }))
  await assert.rejects(collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId, a.storage), /повреждена/)
})

test('Postgres timestamp normalization retains quiz/help/activity identities on replay', async () => {
  const a = setup()
  await a.store.recordQuiz(scope, 0, true)
  await a.store.recordHelp(scope, 'solution')
  await a.store.touchActivity(scope)
  const events = await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId)
  await a.store.mergeLearning(scope, events.map(e => ({ ...e, occurred_at: '2026-10-13T08:00:00+00:00' })))
  const after = await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId)
  assert.deepEqual(after.map(e => e.event_id).sort(), events.map(e => e.event_id).sort())
  assert.equal(a.store.read(scope).history.length, 1)
})

function fakeCloud() {
  const rows: CloudLearningEvent[] = []
  let loseResponse = false
  const cloud = { async syncLearning(_release: string, events: readonly LearningEvent[], after: number): Promise<unknown> {
    for (const event of events) if (!rows.some(e => e.event_id === event.event_id)) rows.push({ ...event, user_id: scope.ownerId, release_id: 'cloud-release', sequence: rows.length + 1 })
    if (loseResponse) { loseResponse = false; throw new Error('offline after commit') }
    return rows.filter(e => e.sequence > after).slice(0, 500)
  } }
  return { cloud, rows, loseNext: () => { loseResponse = true } }
}
const syncOptions = (a: ReturnType<typeof setup>, cloud: ReturnType<typeof fakeCloud>['cloud']) => ({ cloud, store: a.store, storage: a.storage, topics, releaseKey: practiceRelease, releaseId: 'cloud-release', ownerId: scope.ownerId })

test('ambiguous offline commit is retried idempotently; cursor and local events are durable', async () => {
  const a = setup(), b = setup(), server = fakeCloud()
  await a.store.recordQuiz(scope, 1, true)
  server.loseNext()
  await assert.rejects(syncLearningProgress(syncOptions(a, server.cloud)), /offline/)
  assert.equal(server.rows.length, 1)
  assert.ok(![...a.values.keys()].some(k => k.includes('learning-cursor')))
  await syncLearningProgress(syncOptions(a, server.cloud))
  assert.equal(server.rows.filter(e => e.kind === 'quiz').length, 1)
  await syncLearningProgress(syncOptions(b, server.cloud))
  assert.equal(b.store.read(scope).history.length, 1)
  await syncLearningProgress(syncOptions(b, server.cloud))
  assert.equal(b.store.read(scope).history.length, 1)
})

test('paginated pull merges more than 500 events and rejects account switches before applying response', async () => {
  const a = setup(), server = fakeCloud()
  const source = setup()
  await source.store.recordQuiz(scope, 0, true)
  const event = (await collectLearningEvents(source.store, topics, practiceRelease, scope.ownerId))[0]
  for (let index = 0; index < 501; index++) server.rows.push({ ...event, event_id: crypto.randomUUID(), user_id: scope.ownerId, release_id: 'cloud-release', sequence: index + 1 })
  assert.deepEqual(await syncLearningProgress(syncOptions(a, server.cloud)), { received: 501 })
  assert.equal(a.store.read(scope).history.length, 100)
  assert.ok([...a.values.entries()].some(([k,v]) => k.includes('learning-cursor') && v === '501'))
  const switched = setup()
  let active = true
  const cloud = { async syncLearning(_release: string, _events: readonly LearningEvent[], _after: number) { active = false; return server.rows.slice(0, 1) } }
  await assert.rejects(syncLearningProgress({ ...syncOptions(switched, cloud), assertOwner: () => { if (!active) throw new Error('owner changed') } }), /owner changed/)
  assert.equal(switched.values.size, 0)
})

test('storage failure after page merge keeps cursor behind and safe replay retains every receipt', async () => {
  const a = setup(), source = setup(), server = fakeCloud()
  await source.store.recordQuiz(scope, 0, true)
  await server.cloud.syncLearning('cloud-release', await collectLearningEvents(source.store, topics, practiceRelease, scope.ownerId), 0)
  let rejectCursor = true
  const storage: StorageLike = { getItem: a.storage.getItem, setItem(key, value) { if (rejectCursor && key.includes('learning-cursor')) throw new Error('quota'); a.storage.setItem(key, value) } }
  await assert.rejects(syncLearningProgress({ ...syncOptions(a, server.cloud), storage }), /quota/)
  assert.equal(a.store.read(scope).history.length, 1)
  assert.ok(![...a.values.keys()].some(k => k.includes('learning-cursor')))
  rejectCursor = false
  await syncLearningProgress({ ...syncOptions(a, server.cloud), storage })
  assert.equal(a.store.read(scope).history.length, 1)
})

test('in-memory acknowledgements skip replay in later cycles, retaining new or unacknowledged uploads', async () => {
  const a = setup(), server = fakeCloud(), uploaded = new Set<string>()
  const sent: number[] = []
  const cloud = { async syncLearning(release: string, events: readonly LearningEvent[], after: number) { sent.push(events.length); return server.cloud.syncLearning(release, events, after) } }
  await a.store.recordQuiz(scope, 0, true)
  await syncLearningProgress({ ...syncOptions(a, cloud), uploaded })
  assert.deepEqual(sent, [1, 0])
  sent.length = 0
  await syncLearningProgress({ ...syncOptions(a, cloud), uploaded })
  assert.deepEqual(sent, [0])
  sent.length = 0
  await a.store.recordQuiz(scope, 1, false)
  await syncLearningProgress({ ...syncOptions(a, cloud), uploaded })
  assert.deepEqual(sent, [1, 0])
  assert.equal(a.store.read(scope).history.length, 2)
})

test('activity changes inside one minute share identity and resume keeps minute precision on a new device', async () => {
  const a = setup(), b = setup()
  await a.store.saveDraft(scope, 'first', 0)
  const first = await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId)
  a.values.set(practiceStorageKey(scope), JSON.stringify({ ...a.store.read(scope), activityAt: '2026-10-13T08:00:59.999Z' }))
  const later = await collectLearningEvents(a.store, topics, practiceRelease, scope.ownerId)
  assert.deepEqual(later, first)
  await b.store.mergeLearning(scope, later)
  assert.equal(b.store.read(scope).activityAt, at)
})

test('cloud language metadata never returns in uploads after reload or from an existing stored preference', async () => {
  const a = setup(), server = fakeCloud()
  const fields = ['event_id', 'exercise_key', 'kind', 'language', 'occurred_at', 'payload']
  const cloud = { async syncLearning(release: string, events: readonly LearningEvent[], after: number) {
    for (const event of events) assert.deepEqual(Object.keys(event).sort(), fields)
    return server.cloud.syncLearning(release, events, after)
  } }
  await a.store.setPrimaryLanguage(practiceRelease, 'rust', scope.ownerId)
  await syncLearningProgress({ ...syncOptions(a, cloud), uploaded: new Set() })
  const preferenceKey = [...a.values.keys()].find(key => key.includes('learning-language'))!
  assert.deepEqual(Object.keys(JSON.parse(a.values.get(preferenceKey)!)).sort(), fields)
  await syncLearningProgress({ ...syncOptions(a, cloud), uploaded: new Set() })
  assert.equal(server.rows.length, 1)

  // Recover preferences written by an earlier client which persisted the full cloud row.
  a.values.set(preferenceKey, JSON.stringify({ ...server.rows[0], received_at: at }))
  await syncLearningProgress({ ...syncOptions(a, cloud), uploaded: new Set() })
  assert.equal(server.rows.length, 1)
  assert.equal(a.store.getPrimaryLanguage(practiceRelease, scope.ownerId), 'rust')
})
