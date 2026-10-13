import test from 'node:test'
import assert from 'node:assert/strict'
import { LocalPracticeStore, PracticeStorageError, practiceStorageKey, type PracticeLock, type PracticeScope, type StorageLike } from '../src/practice/local-progress.ts'

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()
  quota = false
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { if (this.quota) throw new Error('QuotaExceededError'); this.values.set(key, value) }
}
const lock: PracticeLock = async (_name, action) => action()
const at = () => '2026-10-12T13:00:00.000Z'
const scope: PracticeScope = { releaseId: 'v1', exerciseId: 'softmax-a', language: 'python' }
const setup = () => { const storage = new MemoryStorage(); return { storage, store: new LocalPracticeStore(storage, lock, at) } }

test('draft revision is CAS; two clients from revision zero cannot silently overwrite', async () => {
  const { storage, store } = setup()
  const otherTab = new LocalPracticeStore(storage, lock, at)
  const results = await Promise.allSettled([store.saveDraft(scope, 'first code', 0), otherTab.saveDraft(scope, 'second code', 0)])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult
  assert.equal(rejected.reason.kind, 'conflict')
  assert.equal(rejected.reason.current.code, 'first code')
  assert.equal(store.read(scope).draft?.revision, 1)
  const draft = await store.saveDraft(scope, 'explicitly merged', 1)
  assert.equal(draft.revision, 2)
  assert.equal((await store.saveDraft(scope, 'explicitly merged', 2)).revision, 2)
})

test('release, exercise and language have distinct drafts and formative histories', async () => {
  const { store } = setup()
  await store.saveDraft(scope, 'python-code', 0)
  await store.recordQuiz(scope, 1, true)
  for (const separate of [{ ...scope, language: 'rust' as const }, { ...scope, releaseId: 'v2' }, { ...scope, exerciseId: 'softmax-b' }]) {
    assert.equal(store.read(separate).draft, null)
    assert.deepEqual(store.read(separate).history, [])
    await store.saveDraft(separate, 'other-code', 0)
  }
  assert.equal(store.read(scope).draft?.code, 'python-code')
  assert.equal(store.read(scope).history.length, 1)
})

test('guest and different accounts isolate draft, help, history and primary language; legacy guest records stay guest', async () => {
  const {store,storage}=setup()
  const a={...scope,ownerId:'user-a'},b={...scope,ownerId:'user-b'}
  await store.saveDraft(scope,'guest code',0)
  await store.recordHelp(scope,'solution')
  await store.recordQuiz(scope,1,true)
  await store.setPrimaryLanguage('v1','javascript')
  await store.saveDraft(a,'private a',0)
  await store.recordHelp(a,'hint-0')
  await store.setPrimaryLanguage('v1','rust','user-a')
  assert.deepEqual(store.read(b),{version:1,draft:null,help:[],history:[]})
  assert.equal(store.getPrimaryLanguage('v1','user-b'),'python')
  assert.equal(store.getPrimaryLanguage('v1','user-a'),'rust')
  assert.equal(store.getPrimaryLanguage('v1'),'javascript')
  assert.deepEqual(store.read(a).help.map(h=>h.kind),['hint-0'])
  assert.equal(store.read(a).history.length,0)
  assert.equal(store.read(scope).draft?.code,'guest code')
  assert.equal(storage.getItem(`rustml-practice:v1:${JSON.stringify(['v1','softmax-a','python'])}`),JSON.stringify(store.read(scope)))
  assert.notEqual(practiceStorageKey(a),practiceStorageKey(b))
})

test('help is idempotent and survives editing and a fresh store instance', async () => {
  const { storage, store } = setup()
  await store.recordHelp(scope, 'hint-0')
  await store.recordHelp(scope, 'hint-0')
  await store.recordHelp(scope, 'solution')
  await store.saveDraft(scope, 'own correction', 0)
  const loaded = new LocalPracticeStore(storage, lock, at).read(scope)
  assert.deepEqual(loaded.help.map(h => h.kind), ['hint-0', 'solution'])
  assert.equal(loaded.draft?.revision, 1)
  assert.equal(loaded.help[0].openedAt, at())
})

test('malformed or incompatible records are reported and never overwritten by autosave', async () => {
  for (const broken of ['{broken', JSON.stringify({ version: 9, draft: null, help: [], history: [] }), JSON.stringify({ version: 1, draft: { code: 'saved', revision: -1, updatedAt: at() }, help: [], history: [] }), JSON.stringify({ version: 1, draft: null, help: [{ kind: 'solution', openedAt: 'invalid' }], history: [] })]) {
    const { storage, store } = setup()
    storage.setItem(practiceStorageKey(scope), broken)
    assert.throws(() => store.read(scope), (error: unknown) => error instanceof PracticeStorageError && error.kind === 'corrupt')
    await assert.rejects(store.saveDraft(scope, 'new', 0), (error: unknown) => error instanceof PracticeStorageError && error.kind === 'corrupt')
    assert.equal(storage.getItem(practiceStorageKey(scope)), broken)
  }
})

test('quota failure preserves previously saved code and history', async () => {
  const { storage, store } = setup()
  await store.saveDraft(scope, 'saved', 0)
  const before = storage.getItem(practiceStorageKey(scope))
  storage.quota = true
  await assert.rejects(store.saveDraft(scope, 'not persisted', 1), (error: unknown) => error instanceof PracticeStorageError && error.kind === 'unavailable')
  await assert.rejects(store.recordHelp(scope, 'solution'), PracticeStorageError)
  assert.equal(storage.getItem(practiceStorageKey(scope)), before)
})

test('64 KiB source limit measures UTF-8 bytes, not character count', async () => {
  const { store } = setup()
  await store.saveDraft(scope, 'я'.repeat(32768), 0)
  await assert.rejects(store.saveDraft(scope, 'я'.repeat(32769), 1), (error: unknown) => error instanceof PracticeStorageError && error.kind === 'too-large')
  assert.equal(store.read(scope).draft?.revision, 1)
})

test('primary language is release scoped; switching retains separate language history', async () => {
  const { store } = setup()
  assert.equal(store.getPrimaryLanguage('v1'), 'python')
  await store.recordQuiz(scope, 0, true)
  await store.setPrimaryLanguage('v1', 'rust')
  assert.equal(store.getPrimaryLanguage('v1'), 'rust')
  assert.equal(store.getPrimaryLanguage('v2'), 'python')
  assert.equal(store.read(scope).history.length, 1)
  assert.equal(store.read({ ...scope, language: 'rust' }).history.length, 0)
})

test('formative history is bounded and stores draft revision, never a mastery flag', async () => {
  const { store } = setup()
  await store.saveDraft(scope, 'unverified code', 0)
  for (let index = 0; index < 105; index++) await store.recordQuiz(scope, index % 3, index % 2 === 0)
  const record = store.read(scope)
  assert.equal(record.history.length, 100)
  assert.equal(record.history[0].answer, 5 % 3)
  assert.ok(record.history.every(h => h.draftRevision === 1))
  assert.equal('mastered' in record, false)
  assert.equal('passed' in record, false)
})

test('denied storage access is surfaced without dropping the error', () => {
  const store = new LocalPracticeStore({ getItem() { throw new Error('SecurityError') }, setItem() {} }, lock, at)
  assert.throws(() => store.read(scope), (error: unknown) => error instanceof PracticeStorageError && error.kind === 'unavailable')
})

test('successful writes notify summaries in the same tab; a failed write does not', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const target = new EventTarget()
  let changes = 0
  target.addEventListener('rustml-practice-change', () => changes++)
  Object.defineProperty(globalThis, 'window', { value: target, configurable: true })
  try {
    const { storage, store } = setup()
    await store.saveDraft(scope, 'saved', 0)
    await store.recordHelp(scope, 'hint-0')
    await store.recordQuiz(scope, 0, true)
    await store.setPrimaryLanguage(scope.releaseId, 'rust')
    assert.equal(changes, 4)
    storage.quota = true
    await assert.rejects(store.saveDraft(scope, 'not saved', 1), PracticeStorageError)
    assert.equal(changes, 4)
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('without cross-tab locks persistent writes are refused rather than pretending CAS is atomic', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
  try {
    const storage = new MemoryStorage()
    const store = new LocalPracticeStore(storage)
    await assert.rejects(store.saveDraft(scope, 'must stay in editor', 0), (error: unknown) => error instanceof PracticeStorageError && error.kind === 'unavailable')
    assert.equal(storage.getItem(practiceStorageKey(scope)), null)
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
})
