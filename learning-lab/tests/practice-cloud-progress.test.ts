import test from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeCloud, PracticeCloudError } from '../src/practice/cloud.ts'

const config = { url: 'https://practice.supabase.co', publishableKey: 'sb_publishable_test' }
const storage = { getItem: () => null } as unknown as Storage
const topic = (i: number) => ({ id: `topic-${i}`, topic_key: `unit.${i}`, release_id: 'release-id', practice_releases: { release_key: 'current' } })

test('progress metadata comes from the published release with stable pagination', async () => {
  const requests: URL[] = []
  const client = createPracticeCloud(config, { storage, fetch: async input => {
    const url = new URL(String(input)); requests.push(url)
    return Response.json(url.searchParams.get('offset') === '0' ? Array.from({ length: 500 }, (_, i) => topic(i)) : [topic(500)])
  } })
  const catalog = await client.progressCatalog('current')
  assert.equal(catalog.releaseId, 'release-id'); assert.equal(catalog.releaseKey, 'current')
  assert.equal(Object.keys(catalog.topicIds).length, 501); assert.equal(catalog.topicIds['unit.500'], 'topic-500')
  assert.deepEqual(requests.map(url => url.searchParams.get('offset')), ['0', '500'])
  for (const url of requests) {
    assert.equal(url.pathname, '/rest/v1/practice_topics')
    assert.equal(url.searchParams.get('practice_releases.release_key'), 'eq.current')
    assert.equal(url.searchParams.get('order'), 'id.asc')
    assert.equal(url.searchParams.get('select'), 'id,topic_key,release_id,practice_releases!inner(release_key)')
  }
})

test('progress metadata rejects absent releases, mixed releases and duplicate identities', async () => {
  for (const rows of [[], [topic(0), { ...topic(1), release_id: 'other' }], [topic(0), topic(0)],
    [topic(0), { ...topic(1), id: topic(0).id }], [{ ...topic(0), practice_releases: { release_key: 'other' } }], null]) {
    const client = createPracticeCloud(config, { storage, fetch: async () => Response.json(rows) })
    await assert.rejects(client.progressCatalog('current'), (error: unknown) => error instanceof PracticeCloudError && ['invalid_catalog', 'catalog_unavailable'].includes(error.code))
  }
})
