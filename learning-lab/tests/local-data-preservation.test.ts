import test from 'node:test'
import assert from 'node:assert/strict'
import { BoundaryStorageWriter, boundaryStorageKey, createBoundaryExperiment, encodeBoundaryWorkspace, initialBoundarySettings, readBoundaryImport, readBoundaryStorage, saveBoundaryRun } from '../src/boundaryExperiment.ts'
import { LocalPracticeStore, primaryLanguageKey, type PracticeLock } from '../src/practice/local-progress.ts'
import { readLanguagePreference, type LearningEvent } from '../src/practice/progress-sync.ts'

function memory() {
  const values = new Map<string, string>()
  let rejectKey: string | null = null
  const writes: string[] = []
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {
    writes.push(key)
    if (key === rejectKey) throw new Error('quota')
    values.set(key, value)
  } }
  return { values, writes, storage, reject: (key: string | null) => { rejectKey = key } }
}
function serialLock(): PracticeLock {
  let pending = Promise.resolve<unknown>(undefined)
  return (_name, action) => {
    const result = pending.then(action)
    pending = result.catch(() => {})
    return result
  }
}
const run = () => saveBoundaryRun(createBoundaryExperiment(initialBoundarySettings), .5, [.5, .5])

test('Boundary stale tabs cannot erase A/B, current state or foreign keys, including explicit retry', async () => {
  const m = memory(), current = run(), slots = { A: null, B: null }, lock = serialLock()
  m.values.set('foreign', 'keep')
  const a = new BoundaryStorageWriter(m.storage, null, lock), b = new BoundaryStorageWriter(m.storage, null, lock)
  await a.save(current, { A: current, B: { ...current, threshold: .7 } })
  const saved = m.values.get(boundaryStorageKey)
  await assert.rejects(b.save({ ...current, threshold: .6 }, slots), /другой вкладке/)
  await assert.rejects(b.save({ ...current, threshold: .6 }, slots), /другой вкладке/)
  assert.equal(m.values.get(boundaryStorageKey), saved)
  assert.equal(readBoundaryStorage(m.storage)!.slots.A!.threshold, .5)
  assert.equal(readBoundaryStorage(m.storage)!.slots.B!.threshold, .7)
  assert.equal(m.values.get('foreign'), 'keep')
})

test('Boundary lock serializes simultaneous writers; own queued saves and quota recovery retain baseline', async () => {
  const m = memory(), current = run(), slots = { A: null, B: null }, lock = serialLock()
  const a = new BoundaryStorageWriter(m.storage, null, lock), b = new BoundaryStorageWriter(m.storage, null, lock)
  const results = await Promise.allSettled([a.save(current, slots), b.save({ ...current, threshold: .6 }, slots)])
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected'])
  await Promise.all([a.save({ ...current, threshold: .7 }, slots), a.save({ ...current, threshold: .8 }, slots)])
  const saved = m.values.get(boundaryStorageKey)
  m.reject(boundaryStorageKey)
  await assert.rejects(a.save(current, slots), /quota/)
  assert.equal(m.values.get(boundaryStorageKey), saved)
  m.reject(null)
  await a.save(current, slots)
  assert.equal(readBoundaryStorage(m.storage)!.current.threshold, .5)
  assert.equal(await a.save({ ...current, threshold: .9 }, slots, () => false), false)
  assert.equal(readBoundaryStorage(m.storage)!.current.threshold, .5)
})

test('Boundary preserves exact legacy/corrupt storage bytes and refuses persistence without a lock', async () => {
  const m = memory(), current = run(), slots = { A: null, B: null }
  m.values.set(boundaryStorageKey, '{broken')
  await assert.rejects(new BoundaryStorageWriter(m.storage, null, serialLock()).save(current, slots), /другой вкладке/)
  assert.equal(m.values.get(boundaryStorageKey), '{broken')
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
    await assert.rejects(new BoundaryStorageWriter(m.storage, '{broken').save(current, slots), /безопасное сохранение/)
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
    else Reflect.deleteProperty(globalThis, 'navigator')
  }
  assert.equal(m.values.get(boundaryStorageKey), '{broken')
})

test('delayed Boundary import cannot apply after newer settings, reset, training, threshold, probe, slots or unmount', async () => {
  const current = run(), slots = { A: current, B: null }, text = encodeBoundaryWorkspace(current, slots)
  for (const action of ['settings', 'reset', 'training', 'threshold', 'probe', 'slots', 'unmount']) {
    let version = 0, resolve!: (text: string) => void, applied = false
    const initial = version
    const pending = readBoundaryImport({ size: text.length, text: () => new Promise<string>(r => { resolve = r }) }, () => version === initial).then(() => { applied = true })
    version++
    resolve(text)
    await assert.rejects(pending, /изменился/, action)
    assert.equal(applied, false, action)
  }
  assert.deepEqual(await readBoundaryImport({ size: text.length, text: async () => text }, () => true), JSON.parse(text))
})

test('account language has one atomic receipt: quota preserves legacy/current preference and foreign scopes', async () => {
  const m = memory(), lock = serialLock(), release = 'v1', owner = 'owner-a'
  const key = `rustml-practice:learning-language:v1:${JSON.stringify([release, owner])}`
  const a = new LocalPracticeStore(m.storage, lock, () => '2026-10-13T08:00:00Z'), b = new LocalPracticeStore(m.storage, lock)
  m.values.set(primaryLanguageKey(release, owner), 'javascript')
  m.values.set(primaryLanguageKey(release, 'owner-b'), 'python')
  m.values.set(primaryLanguageKey(release), 'python')
  m.values.set('foreign', 'keep')
  m.reject(key)
  const before = new Map(m.values)
  await assert.rejects(a.setPrimaryLanguage(release, 'rust', owner), /не сохранён/)
  assert.deepEqual(m.values, before)
  assert.equal(b.getPrimaryLanguage(release, owner), 'javascript')
  m.reject(null)
  await a.setPrimaryLanguage(release, 'python', owner)
  const receipt = readLanguagePreference(m.storage, release, owner)!
  assert.equal(m.values.get(primaryLanguageKey(release, owner)), 'javascript')
  m.reject(key)
  const saved = new Map(m.values)
  await assert.rejects(a.setPrimaryLanguage(release, 'rust', owner), /не сохранён/)
  const newer: LearningEvent = { ...receipt, language: 'rust', occurred_at: '2026-10-13T09:00:00Z' }
  await assert.rejects(a.mergePrimaryLanguage(release, owner, [newer]), /quota/)
  assert.equal(b.getPrimaryLanguage(release, owner), 'python')
  assert.deepEqual(readLanguagePreference(m.storage, release, owner), receipt)
  assert.deepEqual(m.values, saved)
  m.reject(null)
  await b.mergePrimaryLanguage(release, owner, [])
  assert.equal(b.getPrimaryLanguage(release, owner), 'python')
  await b.mergePrimaryLanguage(release, owner, [newer])
  assert.equal(a.getPrimaryLanguage(release, owner), 'rust')
  assert.equal(m.values.get('foreign'), 'keep')
  assert.equal(a.getPrimaryLanguage(release, 'owner-b'), 'python')
  assert.equal(a.getPrimaryLanguage(release), 'python')
  assert.equal(a.getPrimaryLanguage('v2', owner), 'python')
})
