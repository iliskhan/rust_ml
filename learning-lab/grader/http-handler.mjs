import { isUuid } from './supervisor.mjs'

class RequestError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code } }
const answer = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
} })
async function boundedBody(request, limit) {
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new RequestError(413, 'body_limit')
  const reader = request.body?.getReader()
  if (!reader) throw new RequestError(400, 'invalid_body')
  const chunks = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new RequestError(413, 'body_limit') }
      chunks.push(value)
    }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) }
    catch { throw new RequestError(400, 'invalid_body') }
  } finally { reader.releaseLock() }
}
function sqlError(error) {
  const message = typeof error?.message === 'string' ? error.message : ''
  if (message.includes('profile_not_found')) return new RequestError(404, 'session_not_found')
  for (const [code, status] of [['grading_unavailable',503], ['submission_limit',429], ['grading_budget_exhausted',429], ['grading_capacity',429],
    ['invalid_submission',400], ['invalid_attempt',400], ['draft_conflict',409], ['idempotency_key_reused_with_different_request',409], ['session_not_found',404], ['attempt_not_found',404]]) {
    if (message.includes(code)) return new RequestError(status, code)
  }
  return new RequestError(503, 'infrastructure')
}

// Config and dependencies stay server-side. Response never includes private job,
// source, manifest, owner identifier, auth token, raw SQL or provider diagnostics.
export function createGradeHandler({ supabaseUrl, publishableKey, origins, db, runAttempt,
  waitUntil, fetch: requestFetch = globalThis.fetch, bodyLimit = 4096, authTimeoutMs = 5000 }) {
  const url = new URL(supabaseUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    typeof publishableKey !== 'string' || !publishableKey || !Array.isArray(origins) || !origins.length ||
    !db?.query || typeof runAttempt !== 'function' || typeof waitUntil !== 'function') throw Error('invalid_handler_config')
  const allowed = new Set(origins)
  return async function handle(request) {
    const origin = request.headers.get('origin')
    if (!origin || !allowed.has(origin)) return answer(403, { code: 'origin_denied' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin',
    } })
    if (request.method !== 'POST') return answer(405, { code: 'method_not_allowed' }, origin)
    try {
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new RequestError(415, 'content_type')
      const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1]
      if (!token || token.length > 16384) throw new RequestError(401, 'unauthenticated')
      const body = await boundedBody(request, bodyLimit)
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RequestError(400, 'invalid_body')
      const keys = Object.keys(body).sort().join(',')
      const submit = body.action === 'submit' && keys === 'action,key,revision,session' &&
        isUuid(body.key) && isUuid(body.session) && Number.isSafeInteger(body.revision) && body.revision >= 0
      const resume = body.action === 'resume' && keys === 'action,attempt_id' && isUuid(body.attempt_id)
      if (!submit && !resume) throw new RequestError(400, 'invalid_body')
      let auth
      try { auth = await requestFetch(`${url.origin}/auth/v1/user`, { headers: { apikey: publishableKey, Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(authTimeoutMs) }) }
      catch { throw new RequestError(503, 'auth_unavailable') }
      if (!auth.ok) throw new RequestError(auth.status === 401 || auth.status === 403 ? 401 : 503, auth.status === 401 || auth.status === 403 ? 'unauthenticated' : 'auth_unavailable')
      let owner
      try { owner = (await auth.json()).id } catch { throw new RequestError(503, 'auth_unavailable') }
      if (!isUuid(owner)) throw new RequestError(503, 'auth_unavailable')
      let attemptId = body.attempt_id, attempt
      try {
        if (submit) {
          const result = await db.query('select private.submit_practice($1::uuid,$2::uuid,$3::uuid,$4::bigint) as id', [owner, body.session, body.key, body.revision])
          attemptId = result.rows[0]?.id
          if (!isUuid(attemptId)) throw Error('invalid_submit_result')
        }
        const result = await db.query('select private.practice_attempt_for_owner($1::uuid,$2::uuid) as attempt', [owner, attemptId])
        attempt = result.rows[0]?.attempt
      } catch (error) { throw sqlError(error) }
      if (!attempt) throw new RequestError(404, 'attempt_not_found')
      if (attempt.id !== attemptId || !['queued', 'running', 'graded', 'error'].includes(attempt.status)) throw new RequestError(503, 'infrastructure')
      if (attempt.status === 'queued' || attempt.status === 'running') {
        // waitUntil must retain the promise; never launch an untracked task.
        waitUntil(Promise.resolve().then(() => runAttempt(attemptId)).catch(() => ({ status: 'unavailable' })))
      }
      return answer(attempt.status === 'graded' || attempt.status === 'error' ? 200 : 202,
        { attempt_id: attemptId, status: attempt.status }, origin)
    } catch (error) {
      const safe = error instanceof RequestError ? error : new RequestError(503, 'infrastructure')
      return answer(safe.status, { code: safe.code }, origin)
    }
  }
}
