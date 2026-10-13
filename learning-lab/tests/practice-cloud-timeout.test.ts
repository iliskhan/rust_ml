import test from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeCloud, PracticeCloudError } from '../src/practice/cloud.ts'

const config = { url: 'https://practice.supabase.co', publishableKey: 'sb_publishable_test' }
const storageKey = `rustml-auth:${config.url}`
const auth = { access_token: 'access', refresh_token: 'refresh', expires_at: Date.now() / 1000 + 3600, user: { id: 'user-a' } }
const refreshed = { ...auth, access_token: 'new-access', refresh_token: 'new-refresh' }
function memoryStorage(seed?: typeof auth): Storage {
  const values = new Map<string, string>(seed ? [[storageKey, JSON.stringify(seed)]] : [])
  return { get length() { return values.size }, clear() { values.clear() }, getItem(key) { return values.get(key) ?? null }, key(index) { return [...values.keys()][index] ?? null }, removeItem(key) { values.delete(key) }, setItem(key, value) { values.set(key, value) } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const hasCode = (code: string) => (error: unknown) => {
  assert.ok(error instanceof PracticeCloudError)
  assert.equal(error.code, code)
  assert.equal(error.status, 0)
  assert.ok(!error.message.includes('PRIVATE'))
  return true
}

test('deadline bounds fetch ignoring abort and permits the next request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0, signal: AbortSignal | undefined
  const client = createPracticeCloud(config, { storage: memoryStorage(), fetch: async (_, init) => {
    signal = init?.signal ?? undefined
    return ++calls === 1 ? new Promise<Response>(() => {}) : Response.json([])
  } })
  const pending = assert.rejects(client.catalog(), hasCode('request_timeout'))
  t.mock.timers.tick(30_000)
  await pending
  assert.equal(signal?.aborted, true)
  assert.equal(calls, 1)
  assert.deepEqual(await client.catalog(), [])
})

test('deadline bounds a JSON body ignoring abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const started = deferred<void>()
  const client = createPracticeCloud(config, { storage: memoryStorage(), fetch: async () => ({ ok: true, status: 200, json: () => {
    started.resolve(); return new Promise(() => {})
  } } as Response) })
  const pending = assert.rejects(client.catalog(), hasCode('request_timeout'))
  await started.promise
  t.mock.timers.tick(30_000)
  await pending
})

test('already aborted caller does not start a request or refresh', async () => {
  let calls = 0
  const client = createPracticeCloud(config, { storage: memoryStorage({ ...auth, expires_at: 1 }), fetch: async () => { calls++; return Response.json([]) } })
  const controller = new AbortController()
  controller.abort('PRIVATE caller reason')
  await assert.rejects(client.saveDraft('session', 7, 'code', 'editor', controller.signal), hasCode('request_aborted'))
  assert.equal(calls, 0)
})

for (const stage of ['fetch', 'body'] as const) {
  test(`caller abort bounds an uncooperative ${stage} and keeps the session`, async () => {
    const storage = memoryStorage(auth), controller = new AbortController(), started = deferred<void>()
    let signal: AbortSignal | undefined
    const client = createPracticeCloud(config, { storage, fetch: async (_, init) => {
      signal = init?.signal ?? undefined
      if (stage === 'fetch') { started.resolve(); return new Promise<Response>(() => {}) }
      return { ok: true, status: 200, json: () => { started.resolve(); return new Promise(() => {}) } } as Response
    } })
    const pending = assert.rejects(client.saveDraft('session', 7, 'code', 'editor', controller.signal), hasCode('request_aborted'))
    await started.promise
    controller.abort('PRIVATE caller reason')
    await pending
    assert.equal(signal?.aborted, true)
    assert.equal(storage.getItem(storageKey), JSON.stringify(auth))
  })
}

test('timeout during shared refresh keeps the old session and late tokens cannot replace it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const old = { ...auth, expires_at: 1 }, storage = memoryStorage(old), response = deferred<Response>()
  let calls = 0
  const client = createPracticeCloud(config, { storage, fetch: async () => { calls++; return response.promise } })
  const pending = assert.rejects(client.restoreSession(), hasCode('request_timeout'))
  t.mock.timers.tick(30_000)
  await pending
  response.resolve(Response.json(refreshed))
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(storage.getItem(storageKey), JSON.stringify(old))
  assert.equal(calls, 1, 'no retry and no user request after timed-out refresh')
})

test('one deadline covers refresh, fetch and body rather than restarting after refresh', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const storage = memoryStorage({ ...auth, expires_at: 1 }), refresh = deferred<Response>(), bodyStarted = deferred<void>()
  const client = createPracticeCloud(config, { storage, fetch: async url => {
    if (String(url).includes('refresh_token')) return refresh.promise
    return { ok: true, status: 200, json: () => { bodyStarted.resolve(); return new Promise(() => {}) } } as Response
  } })
  const pending = assert.rejects(client.restoreSession(), hasCode('request_timeout'))
  t.mock.timers.tick(20_000)
  refresh.resolve(Response.json(refreshed))
  await bodyStarted.promise
  t.mock.timers.tick(10_000)
  await pending
  assert.equal(storage.getItem(storageKey), JSON.stringify(refreshed))
})

test('aborting one refresh waiter leaves another live waiter able to accept the shared result', async () => {
  const storage = memoryStorage({ ...auth, expires_at: 1 }), refresh = deferred<Response>(), controller = new AbortController()
  let refreshCalls = 0, saveCalls = 0
  const client = createPracticeCloud(config, { storage, fetch: async url => {
    if (String(url).includes('refresh_token')) { refreshCalls++; return refresh.promise }
    if (String(url).includes('save_draft')) saveCalls++
    return Response.json([])
  } })
  const cancelled = assert.rejects(client.saveDraft('session', 7, 'code', 'editor', controller.signal), hasCode('request_aborted'))
  const live = client.progress()
  controller.abort()
  await cancelled
  assert.equal(storage.getItem(storageKey), JSON.stringify({ ...auth, expires_at: 1 }))
  refresh.resolve(Response.json(refreshed))
  assert.deepEqual(await live, [])
  assert.equal(refreshCalls, 1)
  assert.equal(saveCalls, 0)
  assert.equal(storage.getItem(storageKey), JSON.stringify(refreshed))
})

test('concurrent live refresh waiters share a single rotation', async () => {
  const storage = memoryStorage({ ...auth, expires_at: 1 }), refresh = deferred<Response>()
  let refreshCalls = 0
  const client = createPracticeCloud(config, { storage, fetch: async (url, init) => {
    if (String(url).includes('refresh_token')) { refreshCalls++; return refresh.promise }
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer new-access')
    return Response.json([])
  } })
  const first = client.progress(), second = client.progress()
  refresh.resolve(Response.json(refreshed))
  assert.deepEqual(await Promise.all([first, second]), [[], []])
  assert.equal(refreshCalls, 1)
})

test('a caller joining between refresh resolution and token persistence shares the same rotation', async () => {
  // Cover the resolution/acceptance boundary without real timers or network.
  for (let microtasks = 0; microtasks <= 24; microtasks++) {
    let refreshCalls = 0
    const client = createPracticeCloud(config, { storage: memoryStorage({ ...auth, expires_at: 1 }), fetch: async url => {
      if (String(url).includes('refresh_token')) {
        refreshCalls++
        return Response.json({ ...refreshed, access_token: `access-${refreshCalls}`, refresh_token: `refresh-${refreshCalls}` })
      }
      return Response.json([])
    } })
    const first = client.progress()
    for (let tick = 0; tick < microtasks; tick++) await Promise.resolve()
    const second = client.progress()
    assert.deepEqual(await Promise.all([first, second]), [[], []], `microtasks=${microtasks}`)
    assert.equal(refreshCalls, 1, `microtasks=${microtasks}`)
  }
})

test('abort at refresh continuation boundaries cannot persist tokens or start a cancelled save', async () => {
  for (let microtasks = 0; microtasks <= 40; microtasks++) {
    const storage = memoryStorage({ ...auth, expires_at: 1 }), controller = new AbortController()
    let abortedWrites = 0, abortedSaves = 0
    const setItem = storage.setItem.bind(storage)
    storage.setItem = (key, value) => {
      if (controller.signal.aborted) abortedWrites++
      setItem(key, value)
    }
    const client = createPracticeCloud(config, { storage, fetch: async (url, init) => {
      if (String(url).includes('refresh_token')) return Response.json(refreshed)
      if (init?.signal?.aborted) abortedSaves++
      return new Promise<Response>(() => {})
    } })
    const pending = assert.rejects(client.saveDraft('session', 7, 'code', 'editor', controller.signal), hasCode('request_aborted'))
    for (let tick = 0; tick < microtasks; tick++) await Promise.resolve()
    controller.abort()
    await pending
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(abortedWrites, 0, `microtasks=${microtasks}`)
    assert.equal(abortedSaves, 0, `microtasks=${microtasks}`)
  }
})

for (const stage of ['fetch', 'body'] as const) {
  test(`late sign-in ${stage} after timeout cannot install a session`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const storage = memoryStorage(auth), started = deferred<void>(), response = deferred<Response>(), body = deferred<unknown>()
    const client = createPracticeCloud(config, { storage, fetch: async () => {
      if (stage === 'fetch') { started.resolve(); return response.promise }
      return { ok: true, status: 200, json: () => { started.resolve(); return body.promise } } as Response
    } })
    const pending = assert.rejects(client.signInWithPassword('a@example.com', 'password'), hasCode('request_timeout'))
    await started.promise
    t.mock.timers.tick(30_000)
    await pending
    response.resolve(Response.json(refreshed)); body.resolve(refreshed)
    await new Promise<void>(resolve => setImmediate(resolve))
    assert.equal(storage.getItem(storageKey), JSON.stringify(auth))
  })
}

test('timed-out save POST is never retried and keeps the CAS payload', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const storage = memoryStorage(auth), calls: RequestInit[] = []
  const client = createPracticeCloud(config, { storage, fetch: async (_, init) => { calls.push(init!); return new Promise<Response>(() => {}) } })
  const pending = assert.rejects(client.saveDraft('session', 7, 'my source'), hasCode('request_timeout'))
  t.mock.timers.tick(30_000)
  await pending
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].body as string), { p_session: 'session', p_revision: 7, p_source: 'my source', p_origin: 'editor' })
  assert.equal(storage.getItem(storageKey), JSON.stringify(auth))
})

test('network failure during refresh keeps the session and releases refresh for explicit recovery', async () => {
  const old = { ...auth, expires_at: 1 }, storage = memoryStorage(old)
  let offline = true
  const client = createPracticeCloud(config, { storage, fetch: async url => {
    if (offline) throw new Error('PRIVATE network details')
    return Response.json(String(url).includes('refresh_token') ? refreshed : auth.user)
  } })
  await assert.rejects(client.restoreSession(), hasCode('network_error'))
  assert.equal(storage.getItem(storageKey), JSON.stringify(old))
  offline = false
  assert.equal((await client.restoreSession())?.access_token, 'new-access')
})

test('timed-out refresh releases its slot for a later explicit restore', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const old = { ...auth, expires_at: 1 }, storage = memoryStorage(old)
  let calls = 0
  const client = createPracticeCloud(config, { storage, fetch: async url => {
    if (++calls === 1) return new Promise<Response>(() => {})
    return Response.json(String(url).includes('refresh_token') ? refreshed : auth.user)
  } })
  const pending = assert.rejects(client.restoreSession(), hasCode('request_timeout'))
  t.mock.timers.tick(30_000)
  await pending
  assert.equal(calls, 1)
  assert.equal((await client.restoreSession())?.access_token, 'new-access')
  assert.equal(calls, 3)
})

test('late Auth rejection body after timeout cannot clear a valid session', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const storage = memoryStorage(auth), body = deferred<unknown>(), started = deferred<void>()
  const client = createPracticeCloud(config, { storage, fetch: async () => ({ ok: false, status: 401, json: () => { started.resolve(); return body.promise } } as Response) })
  const pending = assert.rejects(client.restoreSession(), hasCode('request_timeout'))
  await started.promise
  t.mock.timers.tick(30_000)
  await pending
  body.resolve({ code: 'bad_jwt', message: 'PRIVATE server data' })
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(storage.getItem(storageKey), JSON.stringify(auth))
})

test('abort synchronously triggered by injected fetch remains bounded without leaking a rejection', async () => {
  const controller = new AbortController()
  const client = createPracticeCloud(config, { storage: memoryStorage(), fetch: async () => {
    controller.abort('PRIVATE reason')
    throw new Error('PRIVATE transport error')
  } })
  await assert.rejects(client.catalog(undefined, controller.signal), hasCode('request_aborted'))
  await new Promise<void>(resolve => setImmediate(resolve))
})

test('grader submit timeout keeps the caller idempotency key and does not retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls: RequestInit[] = []
  const client = createPracticeCloud({ ...config, graderUrl: 'https://grader.example.com' }, { storage: memoryStorage(auth), fetch: async (_, init) => {
    calls.push(init!); return new Promise<Response>(() => {})
  } })
  const pending = assert.rejects(client.gradeSubmit('session', 'stable-key', 7), hasCode('request_timeout'))
  t.mock.timers.tick(30_000)
  await pending
  assert.equal(calls.length, 1)
  assert.equal(calls[0].redirect, 'error')
  assert.deepEqual(JSON.parse(calls[0].body as string), { action: 'submit', session: 'session', key: 'stable-key', revision: 7 })
})

test('successful request clears its timeout and removes the caller listener', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const controller = new AbortController(), remove = t.mock.method(controller.signal, 'removeEventListener')
  let signal: AbortSignal | undefined
  const client = createPracticeCloud(config, { storage: memoryStorage(), fetch: async (_, init) => { signal = init?.signal ?? undefined; return Response.json([]) } })
  assert.deepEqual(await client.catalog(undefined, controller.signal), [])
  t.mock.timers.tick(30_000)
  controller.abort()
  assert.equal(signal?.aborted, false)
  assert.equal(remove.mock.calls.length, 1)
})
