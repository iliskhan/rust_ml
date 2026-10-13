import test from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeCloud, validateCloudConfig, type CloudAttempt } from '../src/practice/cloud.ts'
import { createGrading, gradeMessage, validateGradeAttempt } from '../src/practice/grading.ts'
const locks = { request: async <T,>(_name: string, options: LockOptions | (() => T | PromiseLike<T>), callback?: () => T | PromiseLike<T>) =>
  (typeof options === 'function' ? options : callback!)() } as Pick<LockManager, 'request'>
const owner = '10000000-0000-4000-8000-000000000001', session = '20000000-0000-4000-8000-000000000001'
const variant = '30000000-0000-4000-8000-000000000001', release = '40000000-0000-4000-8000-000000000001', attempt = '50000000-0000-4000-8000-000000000001'
const config = { url: 'https://practice.supabase.co', publishableKey: 'sb_publishable_test', graderUrl: 'https://grader.test/api/practice-grade' }
const scope = { ownerId: owner, releaseId: '2026-10-v1', exerciseId: 'unit.test.guided', language: 'javascript' as const }
function memory(): Storage {
  const data = new Map<string, string>()
  return { get length() { return data.size }, clear() { data.clear() }, getItem(k) { return data.get(k) ?? null }, setItem(k, v) { data.set(k, v) }, removeItem(k) { data.delete(k) }, key(i) { return [...data.keys()][i] ?? null } }
}
async function setup(options: { lost?: boolean; pending?: boolean; foreign?: boolean; expires?: boolean; postCode?: string } = {}) {
  const storage = memory(), posts: Record<string, unknown>[] = []
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('code')))].map(x => x.toString(16).padStart(2, '0')).join('')
  const record: CloudAttempt = { id: attempt, user_id: owner, session_id: session, variant_id: variant, release_id: release,
    draft_revision: 3, source_sha256: hash, status: options.pending ? 'queued' : 'graded', verdict: options.pending ? null : 'pass',
    expected_tests: 1, passed_tests: options.pending ? null : 1, assistance: 'hint', error_kind: null }
  let accepted = false, acceptedKey: unknown, refreshes = 0
  const auth = { access_token: 'access', refresh_token: 'refresh', expires_at: options.expires ? 1 : Date.now() / 1000 + 3600, user: { id: owner } }
  const cloud = createPracticeCloud(config, { storage, fetch: async (input, init) => {
    const url = String(input)
    if (url.includes('/verify')) return Response.json(auth)
    if (url.includes('grant_type=refresh_token')) { refreshes++; return Response.json({ ...auth, expires_at: Date.now() / 1000 + 3600, access_token: 'renewed' }) }
    if (url.includes('practice_attempts')) {
      const filter = new URL(url).searchParams.get('idempotency_key')
      return Response.json(accepted && (!filter || filter === `eq.${acceptedKey}`) ? [{ ...record, ...(options.foreign ? { user_id: 'other' } : {}) }] : [])
    }
    if (url === config.graderUrl) {
      const body = JSON.parse(init!.body as string) as Record<string, unknown>; posts.push(body)
      if (body.action === 'submit') {
        if (options.lost && posts.length === 1) throw Error('lost response')
        if (options.postCode && posts.length === 1) return Response.json({ code: options.postCode }, { status: options.postCode === 'draft_conflict' ? 409 : 429 })
        accepted = true; acceptedKey = body.key
      }
      assert.equal((init!.headers as Record<string, string>).apikey, undefined)
      assert.equal(init?.redirect, 'error')
      return Response.json({ attempt_id: attempt, status: record.status })
    }
    throw Error('unexpected URL ' + url)
  } })
  await cloud.verifyEmailCode('a@example.com', '123456')
  return { cloud, storage, posts, record, get refreshes() { return refreshes } }
}
const snapshot = async () => ({ sessionId: session, variantId: variant, releaseId: release, revision: 3 })
test('grading is disabled without configured endpoint and rejects insecure endpoint', () => {
  const cloud = createPracticeCloud({ url: config.url, publishableKey: config.publishableKey }, { storage: memory(), fetch: async () => Response.json({}) })
  assert.equal(cloud.gradingAvailable, false)
  for (const graderUrl of ['http://evil.test/api', 'https://user:secret@grader.test/api', 'https://grader.test/api#token']) assert.throws(() => validateCloudConfig({ ...config, graderUrl }))
  assert.equal(validateCloudConfig({ ...config, graderUrl: 'http://localhost:3000/api' }).graderUrl, 'http://localhost:3000/api')
})
test('lost POST response persists key/revision, retries without saving newer editor source', async () => {
  const state = await setup({ lost: true }), controller = createGrading({ cloud: state.cloud, storage: state.storage, locks })
  let prepared = 0
  const prepare = async () => { prepared++; return snapshot() }
  await assert.rejects(controller.run(scope, 'code', prepare, new AbortController().signal, () => {}), /Сеть недоступна/)
  const recovered = createGrading({ cloud: state.cloud, storage: state.storage, locks })
  const result = await recovered.run(scope, 'new editor code', prepare, new AbortController().signal, () => {})
  assert.equal(result.id, attempt); assert.equal(prepared, 1)
  assert.deepEqual(state.posts[0], state.posts[1])
  assert.match(gradeMessage(result), /открытой помощью/)
})
test('CAS conflict prevents submit; expired JWT refreshes inside cloud client; wrong owner rejected', async () => {
  const conflict = await setup(), controller = createGrading({ cloud: conflict.cloud, storage: conflict.storage, locks })
  await assert.rejects(controller.run(scope, 'code', async () => { throw Error('draft_conflict') }, new AbortController().signal, () => {}), /draft_conflict/)
  assert.equal(conflict.posts.length, 0)
  const refreshed = await setup({ expires: true })
  await createGrading({ cloud: refreshed.cloud, storage: refreshed.storage, locks }).run(scope, 'code', snapshot, new AbortController().signal, () => {})
  assert.equal(refreshed.refreshes, 1)
  const foreign = await setup({ foreign: true })
  await assert.rejects(createGrading({ cloud: foreign.cloud, storage: foreign.storage, locks }).run(scope, 'code', snapshot, new AbortController().signal, () => {}), /не соответствует/)
})
test('pending attempt polling/resume is bounded and abort preserves recovery', async context => {
  const state = await setup({ pending: true })
  const startedAt = Date.now()
  let elapsed = 0
  context.mock.method(Date, 'now', () => startedAt + elapsed)
  const grading = createGrading({ cloud: state.cloud, storage: state.storage, locks, pollMs: 1, deadlineMs: 5000 })
  let updates = 0
  await assert.rejects(grading.run(scope, 'code', snapshot, new AbortController().signal, () => {
    updates++; elapsed = 5001
  }), /Проверка продолжается/)
  assert.equal(updates, 1)
  assert.equal(state.posts.filter(body => body.action === 'submit').length, 1)
  assert.equal(state.posts.filter(body => body.action === 'resume').length, 1)
  assert.equal(grading.hasPending(scope), true)
  const control = new AbortController(); control.abort()
  await assert.rejects(grading.run(scope, 'code', snapshot, control.signal, () => {}), /продолжается/)
  assert.equal(grading.hasPending(scope), true)
})
test('owner change after awaited Auth/REST request cannot display another account result', async () => {
  const state = await setup()
  const grading = createGrading({ cloud: state.cloud, storage: state.storage, locks })
  await assert.rejects(grading.run(scope, 'code', async () => {
    state.storage.setItem(state.cloud.storageKey, JSON.stringify({ access_token: 'other', refresh_token: 'other', expires_at: Date.now()/1000+3600, user: { id: 'another' } }))
    return snapshot()
  }, new AbortController().signal, () => {}), /Аккаунт изменился/)
  assert.equal(state.posts.length, 0)
})

test('terminal infrastructure error permits a new key for the same source; definitive rejection releases stale revision', async () => {
  const state = await setup()
  Object.assign(state.record, { status: 'error', verdict: null, passed_tests: null, error_kind: 'infrastructure' })
  const grading = createGrading({ cloud: state.cloud, storage: state.storage, locks })
  await grading.run(scope, 'code', snapshot, new AbortController().signal, () => {})
  let prepared = 0
  await grading.run(scope, 'code', async () => { prepared++; return snapshot() }, new AbortController().signal, () => {})
  assert.equal(prepared, 1)
  assert.equal(state.posts.length, 2)
  assert.notEqual(state.posts[0].key, state.posts[1].key)
  for (const postCode of ['draft_conflict', 'grading_budget_exhausted']) {
    const rejected = await setup({ postCode }), controller = createGrading({ cloud: rejected.cloud, storage: rejected.storage, locks })
    await assert.rejects(controller.run(scope, 'code', snapshot, new AbortController().signal, () => {}))
    assert.equal(controller.hasPending(scope), false)
    let preparedAgain = 0
    await controller.run(scope, 'code', async () => { preparedAgain++; return snapshot() }, new AbortController().signal, () => {})
    assert.equal(preparedAgain, 1)
    assert.notEqual(rejected.posts[0].key, rejected.posts[1].key)
  }
})

test('two tabs serialize read/prepare/write and share one pending key while polling stays outside lock', async () => {
  const state = await setup({ pending: true })
  let tail: Promise<unknown> = Promise.resolve(), prepared = 0
  const serial = { request: <T,>(_name: string, options: LockOptions | (() => T | PromiseLike<T>), callback?: () => T | PromiseLike<T>) => {
    const body = typeof options === 'function' ? options : callback!
    const current = tail.then(body); tail = current.catch(() => {}); return current
  } } as Pick<LockManager, 'request'>
  const first = createGrading({ cloud: state.cloud, storage: state.storage, locks: serial, pollMs: 1, deadlineMs: 5000 })
  const second = createGrading({ cloud: state.cloud, storage: state.storage, locks: serial, pollMs: 1, deadlineMs: 5000 })
  const prepare = async () => { prepared++; return snapshot() }
  const controls = [new AbortController(), new AbortController()]
  const observed = new Set<number>()
  let ready!: () => void
  const bothPolling = new Promise<void>(resolve => { ready = resolve })
  const update = (tab: number) => (message: string) => {
    assert.match(message, /Ожидаем серверную проверку/)
    observed.add(tab)
    if (observed.size === 2) ready()
  }
  const finished = Promise.allSettled([
    first.run(scope, 'code', prepare, controls[0].signal, update(0)),
    second.run(scope, 'code', prepare, controls[1].signal, update(1)),
  ])
  await Promise.race([bothPolling, finished.then(() => { throw Error('both tabs must reach polling before cancellation') })])
  controls.forEach(control => control.abort())
  const outcomes = await finished
  assert.deepEqual([...observed].sort(), [0, 1])
  for (const outcome of outcomes) {
    assert.equal(outcome.status, 'rejected')
    if (outcome.status === 'rejected') assert.match(outcome.reason.message, /Проверка продолжается/)
  }
  assert.equal(prepared, 1)
  assert.equal(new Set(state.posts.filter(body => body.action === 'submit').map(body => body.key)).size, 1)
  assert.equal(first.hasPending(scope), true)
  assert.equal(second.hasPending(scope), true)
})

test('unresolved prepare releases Web Lock on abort/deadline and late completion cannot write pending', async () => {
  for (const abort of [true, false]) {
    const state = await setup()
    let tail: Promise<unknown> = Promise.resolve(), held = 0
    const serial = { request: <T,>(_name: string, options: LockOptions | (() => T | PromiseLike<T>), callback?: () => T | PromiseLike<T>) => {
      const body = typeof options === 'function' ? options : callback!
      const current = tail.then(async () => { held++; try { return await body() } finally { held-- } })
      tail = current.catch(() => {}); return current
    } } as Pick<LockManager, 'request'>
    const grading = createGrading({ cloud: state.cloud, storage: state.storage, locks: serial, deadlineMs: abort ? 5000 : 1000 })
    const control = new AbortController()
    let finishPrepare!: (value: Awaited<ReturnType<typeof snapshot>>) => void
    let entered!: () => void
    const entry = new Promise<void>(resolve => { entered = resolve })
    const neverReady = new Promise<Awaited<ReturnType<typeof snapshot>>>(resolve => { finishPrepare = resolve })
    const pending = grading.run(scope, 'code', prepareSignal => {
      assert.equal(prepareSignal.aborted, false); entered(); return neverReady
    }, control.signal, () => {})
    const rejected = assert.rejects(pending, /Проверка продолжается/)
    await Promise.race([entry, rejected.then(() => { throw Error('prepare must start before cancellation') })])
    if (abort) control.abort()
    let watchdog!: ReturnType<typeof setTimeout>
    try {
      await Promise.race([rejected, new Promise((_, reject) => { watchdog = setTimeout(() => reject(Error('prepare lock hung')), 5000) })])
    } finally { clearTimeout(watchdog) }
    await tail
    assert.equal(held, 0)
    assert.equal(grading.hasPending(scope), false)
    assert.equal(state.posts.length, 0)
    const next = createGrading({ cloud: state.cloud, storage: state.storage, locks: serial })
    assert.equal((await next.run(scope, 'code', snapshot, new AbortController().signal, () => {})).id, attempt)
    const preserved = Array.from({ length: state.storage.length }, (_, index) => {
      const key = state.storage.key(index)!; return [key, state.storage.getItem(key)]
    })
    finishPrepare(await snapshot())
    await new Promise(resolve => setTimeout(resolve, 1))
    assert.deepEqual(Array.from({ length: state.storage.length }, (_, index) => {
      const key = state.storage.key(index)!; return [key, state.storage.getItem(key)]
    }), preserved)
  }
})

test('catalogue/session/help/draft prepare requests accept the shared cancellation signal', async () => {
  const storage = memory(), observed: RequestInit[] = [], control = new AbortController()
  const cloud = createPracticeCloud(config, { storage, fetch: async (input, init) => {
    const url = String(input)
    if (url.includes('/verify')) return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_at: Date.now()/1000+3600, user: { id: owner } })
    observed.push(init!)
    if (url.includes('practice_variants')) return Response.json([])
    if (url.includes('/rpc/practice_start')) return Response.json(session)
    if (url.includes('practice_sessions?')) return Response.json([{ id: session, variant_id: variant, release_id: release }])
    if (url.includes('practice_drafts?')) return Response.json([{ session_id: session, source: 'code', revision: 3 }])
    return Response.json(url.includes('practice_save_draft') ? 4 : 'help')
  } })
  await cloud.verifyEmailCode('a@example.com', '123456')
  await cloud.catalog(undefined, control.signal)
  await cloud.startSession(variant, control.signal)
  await cloud.openHelp(session, 'solution', control.signal)
  await cloud.saveDraft(session, 3, 'code', 'editor', control.signal)
  assert.equal(observed.length, 6)
  assert.ok(observed.every(init => init.signal === control.signal))
})
