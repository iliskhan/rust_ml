import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createPracticeCloud, PracticeCloudError } from '../src/practice/cloud.ts'

const config = { url: 'https://practice.supabase.co', publishableKey: 'sb_publishable_test' }
const key = `rustml-auth:${config.url}`
const redirect = 'https://rustml.example/learning/'
const auth = { access_token: 'access-a', refresh_token: 'refresh-a', expires_at: Date.now() / 1000 + 3600, user: { id: 'user-a', email: 'a@example.com' } }
const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')
before(() => Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: new URL(redirect).origin } }))
after(() => { if (locationDescriptor) Object.defineProperty(globalThis, 'location', locationDescriptor); else Reflect.deleteProperty(globalThis, 'location') })

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return { get length() { return values.size }, clear() { values.clear() }, getItem(k) { return values.get(k) ?? null }, key(i) { return [...values.keys()][i] ?? null }, removeItem(k) { values.delete(k) }, setItem(k, value) { values.set(k, value) } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const changedAccount = (error: unknown) => error instanceof PracticeCloudError && error.code === 'account_changed'

test('logout uses the UI owner even when a storage read already observed another account', async () => {
  const storage = memoryStorage()
  const client = createPracticeCloud(config, { storage, fetch: async () => Response.json(auth) })
  await client.signInWithPassword('a@example.com', 'password')
  const other = { ...auth, user: { id: 'user-b' }, access_token: 'access-b', refresh_token: 'refresh-b' }
  storage.setItem(key, JSON.stringify(other))
  assert.equal(client.session?.user.id, 'user-b')
  await assert.rejects(client.signOut('user-a'), changedAccount)
  assert.equal(storage.getItem(key), JSON.stringify(other))
})

test('known Auth failures have actionable messages without echoing server details', async () => {
  for (const code of ['invalid_credentials', 'email_not_confirmed', 'weak_password', 'over_email_send_rate_limit']) {
    const storage = memoryStorage()
    const client = createPracticeCloud(config, { storage, fetch: async () => Response.json({ error_code: code, message: 'PRIVATE DETAILS', password: 'secret' }, { status: 400 }) })
    await assert.rejects(client.signInWithPassword('a@example.com', 'password'), (error: unknown) => error instanceof PracticeCloudError && error.code === code && !error.message.includes('PRIVATE') && !error.message.includes('secret'))
    assert.equal(storage.getItem(key), null)
  }
})

test('offline, rate-limited and server-error refresh preserve the session for retry', async () => {
  for (const failure of ['offline', 429, 500] as const) {
    const storage = memoryStorage(), expired = JSON.stringify({ ...auth, expires_at: 1 })
    storage.setItem(key, expired)
    const client = createPracticeCloud(config, { storage, fetch: async () => {
      if (failure === 'offline') throw new Error('PRIVATE NETWORK DETAILS')
      return Response.json({ code: 'refresh_token_not_found', message: 'PRIVATE DETAILS' }, { status: failure })
    } })
    await assert.rejects(client.restoreSession(), (error: unknown) => error instanceof PracticeCloudError && error.code !== 'unauthenticated' && !error.message.includes('PRIVATE'))
    assert.equal(storage.getItem(key), expired)
  }
})

test('failed user validation clears only the exact access token used, including after refresh', async () => {
  for (const replacement of [false, true]) {
    const storage = memoryStorage(), started = deferred<void>(), response = deferred<Response>()
    storage.setItem(key, JSON.stringify({ ...auth, expires_at: 1 }))
    const refreshed = { ...auth, access_token: 'refreshed-access', refresh_token: 'refreshed-refresh' }
    const newer = { ...auth, access_token: 'newest-access', refresh_token: 'newest-refresh' }
    const client = createPracticeCloud(config, { storage, fetch: async url => {
      if (String(url).includes('grant_type=refresh_token')) return Response.json(refreshed)
      started.resolve(); return response.promise
    } })
    const pending = client.restoreSession()
    await started.promise
    if (replacement) storage.setItem(key, JSON.stringify(newer))
    response.resolve(Response.json({ code: 'bad_jwt' }, { status: 401 }))
    await assert.rejects(pending, (error: unknown) => error instanceof PracticeCloudError && error.code === 'unauthenticated')
    assert.equal(storage.getItem(key), replacement ? JSON.stringify(newer) : null)
  }
})

test('signup refuses redirects off this site before sending a credential or creating a verifier', async () => {
  const storage = memoryStorage()
  const client = createPracticeCloud(config, { storage, fetch: async () => { assert.fail('no credential request for an invalid redirect') } })
  for (const url of ['https://other.example/', redirect + '?x=1', redirect + '#token']) await assert.rejects(client.signUpWithPassword('a@example.com', 'password', url), (error: unknown) => error instanceof PracticeCloudError && error.code === 'invalid_redirect')
  assert.equal(storage.length, 0)
})

test('password login sends exact credentials and persists only session fields', async () => {
  const storage = memoryStorage(), password = '  secret-password-do-not-store  '
  const client = createPracticeCloud(config, { storage, fetch: async (url, init) => {
    assert.equal(String(url), `${config.url}/auth/v1/token?grant_type=password`)
    assert.equal(init?.method, 'POST')
    assert.deepEqual(JSON.parse(init!.body as string), { email: 'a@example.com', password })
    assert.equal((init!.headers as Record<string, string>).apikey, config.publishableKey)
    return Response.json({ ...auth, password, user: { ...auth.user, user_metadata: { password } } })
  } })
  assert.deepEqual(await client.signInWithPassword(' a@example.com ', password), auth)
  assert.deepEqual(JSON.parse(storage.getItem(key)!), auth)
  for (let i = 0; i < storage.length; i++) assert.ok(!storage.getItem(storage.key(i)!)!.includes(password))
})

for (const immediate of [false, true]) test(`signup ${immediate ? 'accepts an immediate session' : 'waits for confirmation without persisting a user as a session'}`, async () => {
  const storage = memoryStorage()
  const client = createPracticeCloud(config, { storage, fetch: async (url, init) => {
    const endpoint = new URL(String(url)), body = JSON.parse(init!.body as string)
    assert.equal(endpoint.pathname, '/auth/v1/signup')
    assert.equal(endpoint.searchParams.get('redirect_to'), redirect)
    assert.equal(init?.method, 'POST')
    const verifier = storage.getItem(`${key}:pkce`)!
    assert.ok(verifier.length >= 43)
    assert.deepEqual(body, { email: 'a@example.com', password: 'secret-password', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 's256' })
    return Response.json(immediate ? auth : auth.user)
  } })
  const result = await client.signUpWithPassword(' a@example.com ', 'secret-password', redirect)
  assert.deepEqual(result, immediate ? auth : null)
  assert.deepEqual(client.session, immediate ? auth : null)
  assert.equal(storage.getItem(`${key}:pkce`) === null, immediate)
  if (!immediate) assert.equal(storage.getItem(key), null)
})

test('resend creates a fresh PKCE flow without credentials or a session', async () => {
  const storage = memoryStorage()
  storage.setItem(`${key}:pkce`, 'older-verifier')
  const client = createPracticeCloud(config, { storage, fetch: async (url, init) => {
    const endpoint = new URL(String(url)), verifier = storage.getItem(`${key}:pkce`)!
    assert.equal(endpoint.pathname, '/auth/v1/resend')
    assert.equal(endpoint.searchParams.get('redirect_to'), redirect)
    assert.notEqual(verifier, 'older-verifier')
    assert.deepEqual(JSON.parse(init!.body as string), { email: 'a@example.com', type: 'signup', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 's256' })
    return Response.json({})
  } })
  await client.resendConfirmation(' a@example.com ', redirect)
  assert.equal(client.session, null)
  assert.ok(storage.getItem(`${key}:pkce`))
})

for (const method of ['password', 'signup', 'resend'] as const) {
  for (const change of ['logout', 'account', 'verifier'] as const) test(`late ${method} cannot undo ${change}`, async () => {
    const storage = memoryStorage(), started = deferred<void>(), response = deferred<Response>()
    const client = createPracticeCloud(config, { storage, fetch: async () => { started.resolve(); return response.promise } })
    const pending = method === 'password' ? client.signInWithPassword('a@example.com', 'password') : method === 'signup' ? client.signUpWithPassword('a@example.com', 'password', redirect) : client.resendConfirmation('a@example.com', redirect)
    await started.promise
    if (change === 'logout') await client.signOut()
    else if (change === 'account') {
      storage.setItem(key, JSON.stringify({ ...auth, user: { id: 'user-b' }, access_token: 'access-b', refresh_token: 'refresh-b' }))
      storage.setItem(`${key}:pkce`, 'verifier-b')
    } else storage.setItem(`${key}:pkce`, 'new-verifier')
    const stored = storage.getItem(key), verifier = storage.getItem(`${key}:pkce`)
    response.resolve(Response.json(method === 'resend' ? {} : auth))
    await assert.rejects(pending, changedAccount)
    assert.equal(storage.getItem(key), stored)
    assert.equal(storage.getItem(`${key}:pkce`), verifier)
  })
}

for (const replacement of [false, true]) test(`invalid refresh ${replacement ? 'preserves a newer session for the same user' : 'clears the expired session even on HTTP 400'}`, async () => {
  const storage = memoryStorage(), started = deferred<void>(), response = deferred<Response>()
  storage.setItem(key, JSON.stringify({ ...auth, expires_at: 1 }))
  const client = createPracticeCloud(config, { storage, fetch: async url => {
    assert.ok(String(url).endsWith('/auth/v1/token?grant_type=refresh_token'))
    started.resolve(); return response.promise
  } })
  const pending = client.restoreSession()
  await started.promise
  const newer = { ...auth, access_token: 'new-access', refresh_token: 'new-refresh' }
  if (replacement) storage.setItem(key, JSON.stringify(newer))
  response.resolve(Response.json({ code: 'refresh_token_not_found', message: 'PRIVATE AUTH DETAILS' }, { status: 400 }))
  await assert.rejects(pending, (error: unknown) => error instanceof PracticeCloudError && error.code === 'unauthenticated' && !error.message.includes('PRIVATE'))
  assert.deepEqual(client.session, replacement ? newer : null)
})

test('logout clears locally before the network completes, and its late failure preserves a new login', async () => {
  const storage = memoryStorage(), logout = deferred<Response>()
  let signingInAgain = false
  const newer = { ...auth, access_token: 'new-access', refresh_token: 'new-refresh' }
  const client = createPracticeCloud(config, { storage, fetch: async (url, init) => {
    if (String(url).includes('/logout')) {
      assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer access-a')
      return logout.promise
    }
    return Response.json(signingInAgain ? newer : auth)
  } })
  await client.signInWithPassword('a@example.com', 'password')
  const pending = client.signOut()
  assert.equal(client.session, null)
  signingInAgain = true
  await client.signInWithPassword('a@example.com', 'new-password')
  logout.resolve(Response.json({ message: 'offline upstream' }, { status: 503 }))
  await assert.rejects(pending)
  assert.deepEqual(client.session, newer)
})

test('concurrent authenticated reads share one refresh and use its new access token', async () => {
  const storage = memoryStorage(), response = deferred<Response>(), started = deferred<void>()
  storage.setItem(key, JSON.stringify({ ...auth, expires_at: 1 }))
  let refreshCount = 0, readCount = 0
  const client = createPracticeCloud(config, { storage, fetch: async (url, init) => {
    if (String(url).includes('grant_type=refresh_token')) {
      refreshCount++; started.resolve()
      assert.deepEqual(JSON.parse(init!.body as string), { refresh_token: auth.refresh_token })
      return response.promise
    }
    readCount++
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer refreshed-access')
    return Response.json([])
  } })
  const first = client.progress(), second = client.progress()
  await started.promise
  response.resolve(Response.json({ ...auth, access_token: 'refreshed-access', refresh_token: 'refreshed-token' }))
  assert.deepEqual(await Promise.all([first, second]), [[], []])
  assert.equal(refreshCount, 1)
  assert.equal(readCount, 2)
})

for (const value of [null, {}, { ...auth, access_token: 123 }, { ...auth, refresh_token: '' }, { ...auth, user: { id: '' } }, { ...auth, expires_at: 'tomorrow' }]) {
  test(`malformed login response is not persisted: ${JSON.stringify(value)}`, async () => {
    const storage = memoryStorage()
    const client = createPracticeCloud(config, { storage, fetch: async () => Response.json(value) })
    await assert.rejects(client.signInWithPassword('a@example.com', 'password'), (error: unknown) => error instanceof PracticeCloudError && error.code === 'invalid_session')
    assert.equal(storage.getItem(key), null)
  })
}

test('malformed signup response is rejected and leaves no pending verifier', async () => {
  const storage = memoryStorage()
  const client = createPracticeCloud(config, { storage, fetch: async () => Response.json({ id: '' }) })
  await assert.rejects(client.signUpWithPassword('a@example.com', 'password', redirect), (error: unknown) => error instanceof PracticeCloudError && error.code === 'invalid_session')
  assert.equal(storage.getItem(key), null)
  assert.equal(storage.getItem(`${key}:pkce`), null)
})
