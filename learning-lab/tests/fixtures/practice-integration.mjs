// Local browser regression fixture. No Supabase requests or submitted password logs.
// node tests/fixtures/practice-integration.mjs; Vite: URL localhost:5232, key sb_publishable_fixture.
import { createServer } from 'node:http'
import { practiceTopics, practiceRelease } from '../../src/practice/all-catalog.ts'
const tokens = new Map(), variants = new Map(), sessions = new Map(), primary = new Map()
let version = 0, refreshes = 0, languageChanges = 0, stale401 = 0, holdNext = false, held = null
const user = email => ({ id: email.startsWith('b@') ? 'fixture-b' : 'fixture-a', email })
const session = owner => {
  const value = { access_token: `fixture-access-${++version}`, refresh_token: `fixture-refresh-${version}`, expires_in: 3600, user: owner }
  tokens.set(value.access_token, value); tokens.set(value.refresh_token, value); return value
}
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5231')
  res.setHeader('Access-Control-Allow-Headers', 'content-type,apikey,authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  let text = ''; for await (const chunk of req) text += chunk
  const input = text ? JSON.parse(text) : {}, url = new URL(req.url, 'http://127.0.0.1:5232')
  const send = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
  const owner = tokens.get(req.headers.authorization?.replace('Bearer ', ''))?.user
  if (url.pathname === '/fixture/stats') { send({ refreshes, languageChanges, stale401, held: Boolean(held), primary: Object.fromEntries(primary) }); return }
  if (url.pathname === '/fixture/arm') { holdNext = true; send({}); return }
  if (url.pathname === '/fixture/release') { if (held) { held({ code: 'bad_jwt' }, 401); held = null; stale401++ } send({}); return }
  if (url.pathname === '/fixture/revoke') { tokens.clear(); send({}); return }
  if (url.pathname.endsWith('/token')) {
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const known = tokens.get(input.refresh_token)
      if (!known) { send({ code: 'refresh_token_not_found' }, 400); return }
      refreshes++; send(session(known.user)); return
    }
    if (input.email?.startsWith('wrong@')) { send({ code: 'invalid_credentials' }, 400); return }
    send(session(user(input.email))); return
  }
  if (url.pathname.endsWith('/signup')) { send({ id: user(input.email).id }); return }
  if (url.pathname.endsWith('/resend') || url.pathname.endsWith('/logout')) { send({}); return }
  if (url.pathname.endsWith('/user')) {
    if (holdNext) { holdNext = false; held = send; return }
    send(owner ?? { code: 'bad_jwt' }, owner ? 200 : 401); return
  }
  if (url.pathname.endsWith('/practice_topics')) {
    send(practiceTopics.map(t => ({ id: `topic-${t.id}`, topic_key: t.id, release_id: 'fixture-release', practice_releases: { release_key: practiceRelease } }))); return
  }
  if (url.pathname.endsWith('/practice_variants')) {
    const key = url.searchParams.get('practice_exercises.exercise_key')?.slice(3), language = url.searchParams.get('language')?.slice(3)
    const exercise = practiceTopics.flatMap(t => t.exercises).find(e => e.id === key)
    if (!exercise || !['python', 'javascript', 'rust'].includes(language)) { send([]); return }
    const variant = { id: `${key}/${language}`, exercise_id: key, release_id: 'fixture-release', language, starter_code: exercise.starter[language], practice_exercises: { exercise_key: key }, practice_releases: { release_key: practiceRelease } }
    variants.set(variant.id, variant); send([variant]); return
  }
  if (!owner) { send({ code: 'bad_jwt' }, 401); return }
  if (url.pathname.endsWith('/practice_topic_progress')) {
    send(practiceTopics.flatMap(t => ['python', 'javascript', 'rust'].map(language => ({ user_id: owner.id, release_id: 'fixture-release', topic_id: `topic-${t.id}`, language,
      is_primary_language: language === (primary.get(owner.id) ?? 'rust'), required_total: 2, required_completed: 0, required_passed: 0 })))); return
  }
  if (url.pathname.endsWith('/rpc/practice_start')) {
    const variant = variants.get(input.p_variant), id = `${owner.id}:${input.p_variant}`
    if (!variant) { send({ message: 'not_found' }, 400); return }
    if (!sessions.has(id)) sessions.set(id, { id, user_id: owner.id, variant_id: variant.id, release_id: variant.release_id,
      draft: { session_id: id, source: variant.starter_code, revision: 0, origin: 'editor', updated_at: new Date().toISOString() } })
    send(id); return
  }
  const selected = sessions.get(url.searchParams.get('id')?.slice(3) ?? url.searchParams.get('session_id')?.slice(3) ?? input.p_session)
  if (url.pathname.endsWith('/practice_sessions')) { send(selected?.user_id === owner.id ? [{ id: selected.id, variant_id: selected.variant_id, release_id: selected.release_id }] : []); return }
  if (url.pathname.endsWith('/practice_drafts')) { send(selected?.user_id === owner.id ? [selected.draft] : []); return }
  if (url.pathname.endsWith('/rpc/practice_choose_language')) { primary.set(owner.id, input.p_language); languageChanges++; send(null); return }
  if (url.pathname.endsWith('/rpc/practice_open_help')) { send('fixture help'); return }
  if (url.pathname.endsWith('/rpc/practice_save_draft')) {
    if (!selected || selected.user_id !== owner.id || selected.draft.revision !== input.p_revision) { send({ message: 'draft_conflict_or_not_found' }, 400); return }
    selected.draft = { ...selected.draft, source: input.p_source, revision: input.p_revision + 1 }; send(selected.draft.revision); return
  }
  send({ message: 'fixture_not_found' }, 404)
})
server.listen(5232, '127.0.0.1', () => process.stdout.write('Local integration fixture on 127.0.0.1:5232\n'))
