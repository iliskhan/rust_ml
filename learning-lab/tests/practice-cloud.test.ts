import test from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeCloud, PracticeCloudError, validateCloudConfig } from '../src/practice/cloud.ts'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return { get length() { return values.size }, clear() { values.clear() }, getItem(key) { return values.get(key) ?? null }, key(index) { return [...values.keys()][index] ?? null }, removeItem(key) { values.delete(key) }, setItem(key, value) { values.set(key, value) } }
}
const config = { url: 'https://practice.supabase.co', publishableKey: 'sb_publishable_test' }
const auth = { access_token: 'access', refresh_token: 'refresh', expires_at: Date.now() / 1000 + 3600, user: { id: 'user-a' } }

test('browser configuration refuses server secrets and unsafe origins', () => {
  assert.deepEqual(validateCloudConfig(config), config)
  for (const publishableKey of ['sb_secret_example', 'service_role', 'invalid']) assert.throws(() => validateCloudConfig({ ...config, publishableKey }), /Серверные ключи/)
  const token = ['e30', Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url'), 'sig'].join('.')
  assert.throws(() => validateCloudConfig({ ...config, publishableKey: token }), /Серверные ключи/)
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path']) assert.throws(() => validateCloudConfig({ ...config, url }))
})

test('save uses authenticated RPC, keeps expected revision, rejects conflict without retry', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  const client = createPracticeCloud(config, { storage: memoryStorage(), fetch: async (url, init) => {
    calls.push({ url: String(url), init })
    return String(url).includes('/verify') ? Response.json(auth) : Response.json({ message: 'draft_conflict_or_not_found', details: 'PRIVATE DETAILS' }, { status: 400 })
  } })
  await client.verifyEmailCode('a@example.com', '123456')
  await assert.rejects(client.saveDraft('session', 7, 'my source'), (error: unknown) => {
    assert.ok(error instanceof PracticeCloudError)
    assert.equal(error.code, 'draft_conflict'); assert.equal(error.status, 409)
    assert.ok(!error.message.includes('PRIVATE'))
    return true
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].url, config.url + '/rest/v1/rpc/practice_save_draft')
  assert.deepEqual(JSON.parse(calls[1].init!.body as string), { p_session: 'session', p_revision: 7, p_source: 'my source', p_origin: 'editor' })
  assert.equal((calls[1].init!.headers as Record<string, string>).Authorization, 'Bearer access')
})

test('restoring session verifies user with Auth and refreshes expired tokens', async () => {
  const storage = memoryStorage()
  storage.setItem(`rustml-auth:${config.url}`, JSON.stringify({ ...auth, expires_at: 1 }))
  const requests: string[] = []
  const client = createPracticeCloud(config, { storage, fetch: async (url) => {
    requests.push(String(url))
    return String(url).includes('grant_type=refresh_token') ? Response.json(auth) : Response.json(auth.user)
  } })
  assert.equal((await client.restoreSession())?.user.id, 'user-a')
  assert.equal(requests.length, 2)
  assert.ok(requests[0].includes('grant_type=refresh_token')); assert.ok(requests[1].endsWith('/auth/v1/user'))
})

test('sign out clears browser token even if server is offline', async () => {
  const storage = memoryStorage()
  const client = createPracticeCloud(config, { storage, fetch: async (url) => {
    if (String(url).includes('/verify')) return Response.json(auth)
    throw new Error('offline')
  } })
  await client.verifyEmailCode('a@example.com', '123456')
  await assert.rejects(client.signOut(), /Сеть недоступна/)
  assert.equal(client.session, null)
  assert.equal(storage.getItem(`rustml-auth:${config.url}`), null)
})

test('public catalogue exposes only authored fields; write requires login', async () => {
  let requested = ''
  const client = createPracticeCloud(config, { storage: memoryStorage(), fetch: async (url) => { requested = String(url); return Response.json([]) } })
  await client.catalog()
  assert.ok(new URL(requested).searchParams.get('select')?.includes('practice_releases(release_key)'))
  assert.ok(!requested.includes('private'))
  await assert.rejects(client.saveDraft('x', 0, 'code'), /Сначала войдите/)
})

test('catalogue pages beyond API row limits with stable ordering; scope uses inner foreign filters', async () => {
  const requests: URL[] = []
  const client = createPracticeCloud(config, { storage: memoryStorage(), fetch: async (url) => {
    const parsed=new URL(String(url));requests.push(parsed)
    const count=parsed.searchParams.get('offset')==='0'?500:1
    return Response.json(Array.from({length:count},(_,i)=>({id:String(i)})))
  } })
  assert.equal((await client.catalog()).length,501)
  assert.deepEqual(requests.map(u=>u.searchParams.get('offset')),['0','500'])
  assert.ok(requests.every(u=>u.searchParams.get('order')==='id.asc'))
  requests.length=0
  await client.catalog({releaseKey:'2026-10-v1',exerciseKey:'concept.loss.guided',language:'rust'})
  const query=requests[0].searchParams
  assert.equal(query.get('practice_exercises.exercise_key'),'eq.concept.loss.guided')
  assert.equal(query.get('practice_releases.release_key'),'eq.2026-10-v1')
  assert.equal(query.get('language'),'eq.rust')
  assert.ok(query.get('select')?.includes('practice_exercises!inner(exercise_key)'))
  assert.ok(query.get('select')?.includes('practice_releases!inner(release_key)'))
})

test('shared auth storage: logout in one client stops authenticated writes in another; account B is not overwritten', async () => {
  const storage=memoryStorage(), calls:string[]=[]
  const request:typeof fetch=async(url)=>{calls.push(String(url));return String(url).includes('/verify')?Response.json(auth):String(url).includes('/auth/v1/user')?Response.json(auth.user):Response.json(null)}
  const a=createPracticeCloud(config,{storage,fetch:request}),other=createPracticeCloud(config,{storage,fetch:request})
  await a.verifyEmailCode('a@example.com','123456');await other.restoreSession()
  await a.signOut();const before=calls.length
  await assert.rejects(other.saveDraft('session',1,'stale'),(e:unknown)=>e instanceof PracticeCloudError&&e.code==='account_changed')
  assert.equal(calls.length,before,'no stale-token network write')
  await a.verifyEmailCode('a@example.com','123456');await other.restoreSession()
  const b={...auth,access_token:'access-b',refresh_token:'refresh-b',user:{id:'user-b'}}
  storage.setItem(`rustml-auth:${config.url}`,JSON.stringify(b))
  storage.setItem(`rustml-auth:${config.url}:pkce`,'verifier-b')
  await assert.rejects(other.signOut(),(e:unknown)=>e instanceof PracticeCloudError&&e.code==='account_changed')
  assert.equal(JSON.parse(storage.getItem(`rustml-auth:${config.url}`)!).user.id,'user-b')
  assert.equal(storage.getItem(`rustml-auth:${config.url}:pkce`),'verifier-b')
})

test('late refresh cannot restore an account after another tab signed out; errors never claim local backup', async () => {
  const storage=memoryStorage()
  storage.setItem(`rustml-auth:${config.url}`,JSON.stringify({...auth,expires_at:1}))
  let releaseRefresh:(r:Response)=>void=()=>{}
  const refresh=new Promise<Response>(resolve=>{releaseRefresh=resolve})
  const client=createPracticeCloud(config,{storage,fetch:async()=>refresh})
  const restoring=client.restoreSession()
  storage.removeItem(`rustml-auth:${config.url}`);releaseRefresh(Response.json(auth))
  await assert.rejects(restoring,(e:unknown)=>e instanceof PracticeCloudError&&e.code==='account_changed')
  assert.equal(storage.getItem(`rustml-auth:${config.url}`),null)
  const offline=createPracticeCloud(config,{storage,fetch:async()=>{throw Error('offline')}})
  await assert.rejects(offline.catalog(),(e:unknown)=>{assert.ok(e instanceof PracticeCloudError);assert.equal(e.code,'network_error');assert.ok(!e.message.includes('черновик сохранён'));return true})
})

test('late Auth JSON body cannot replace a different account or roll back refreshed tokens', async () => {
  for(const sameUser of [false,true]){
    const storage=memoryStorage();storage.setItem(`rustml-auth:${config.url}`,JSON.stringify(auth))
    let releaseBody:(v:unknown)=>void=()=>{},readingBody:()=>void=()=>{}
    const started=new Promise<void>(r=>{readingBody=r}),body=new Promise(r=>{releaseBody=r})
    const client=createPracticeCloud(config,{storage,fetch:async()=>({ok:true,status:200,json:()=>{readingBody();return body}} as Response)})
    const restoring=client.restoreSession();await started
    const newer={...auth,access_token:'new-access',refresh_token:'new-refresh',user:{id:sameUser?'user-a':'user-b'}}
    storage.setItem(`rustml-auth:${config.url}`,JSON.stringify(newer));releaseBody(auth.user)
    if(sameUser){assert.equal((await restoring)?.access_token,'new-access')}
    else await assert.rejects(restoring,(e:unknown)=>e instanceof PracticeCloudError&&e.code==='account_changed')
    assert.equal(storage.getItem(`rustml-auth:${config.url}`),JSON.stringify(newer))
  }
})

test('late OAuth or email verification never replaces a newer account, verifier or local logout', async () => {
  const storageKey=`rustml-auth:${config.url}`
  for(const method of ['oauth','email'] as const){
    for(const change of ['account','verifier','logout'] as const){
      const storage=memoryStorage();storage.setItem(storageKey+':pkce','verifier-a')
      let releaseBody:(v:unknown)=>void=()=>{},readingBody:()=>void=()=>{}
      const started=new Promise<void>(r=>{readingBody=r}),body=new Promise(r=>{releaseBody=r})
      const client=createPracticeCloud(config,{storage,fetch:async()=>({ok:true,status:200,json:()=>{readingBody();return body}} as Response)})
      const pending=method==='oauth'?client.completeOAuth('code-a'):client.verifyEmailCode('a@example.com','123456')
      await started
      if(change==='account')storage.setItem(storageKey,JSON.stringify({...auth,user:{id:'user-b'}}))
      else if(change==='verifier')storage.setItem(storageKey+':pkce','verifier-b')
      else await client.signOut()
      const stored=storage.getItem(storageKey),verifier=storage.getItem(storageKey+':pkce')
      releaseBody(auth)
      await assert.rejects(pending,(e:unknown)=>e instanceof PracticeCloudError&&e.code==='account_changed')
      assert.equal(storage.getItem(storageKey),stored)
      assert.equal(storage.getItem(storageKey+':pkce'),verifier)
    }
  }
})

test('current OAuth callback accepts its session and consumes only its verifier', async () => {
  const storage=memoryStorage(),storageKey=`rustml-auth:${config.url}`
  storage.setItem(storageKey+':pkce','verifier-a')
  const client=createPracticeCloud(config,{storage,fetch:async()=>Response.json(auth)})
  assert.equal((await client.completeOAuth('code-a')).user.id,'user-a')
  assert.equal(storage.getItem(storageKey+':pkce'),null)
  assert.equal(client.session?.user.id,'user-a')
})
