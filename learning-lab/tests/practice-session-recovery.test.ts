import test from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeCloud, PracticeCloudError } from '../src/practice/cloud.ts'

test('a corrupt session is safe to inspect, denies requests, and can be replaced by explicit login', async () => {
  const config = { url: 'https://practice.supabase.co', publishableKey: 'sb_publishable_test' }
  const key = `rustml-auth:${config.url}`, values = new Map([[key, '{broken']])
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } as unknown as Storage
  let calls = 0
  const session = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600, user: { id: 'fixture-a' } }
  const cloud = createPracticeCloud(config, { storage, fetch: async () => { calls++; return Response.json(session) } })
  const snapshot = () => cloud.session
  assert.equal(snapshot(), null)
  assert.equal(values.get(key), '{broken')
  await assert.rejects(cloud.restoreSession(), (error: unknown) => error instanceof PracticeCloudError && error.code === 'invalid_session')
  await assert.rejects(cloud.progress(), (error: unknown) => error instanceof PracticeCloudError && error.code === 'invalid_session')
  assert.equal(calls, 0)
  await cloud.signInWithPassword('a@example.test', 'fixture-only-password')
  assert.equal(snapshot()?.user.id, 'fixture-a'); assert.equal(calls, 1)
})
