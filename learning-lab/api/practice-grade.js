import { getDeadline, waitUntil } from '@vercel/functions'
import { createGradeHandler } from '../grader/http-handler.mjs'
import { databasePool, workerRuntime } from '../grader/server-runtime.mjs'
import { recoverQueue } from '../grader/recovery.mjs'

const origin = 'https://iliskhan.github.io'
let handler
function configuredHandler() {
  if (handler) return handler
  const api = databasePool('PRACTICE_API_DATABASE_URL', 'rustml_api')
  const { db, runAttempt: rawSupervisor } = workerRuntime()
  const invocationDeadline = () => (getDeadline()?.getTime() ?? Date.now() + 300000) - 20000
  // Queue workers call the unwrapped supervisor, so a sweep cannot recursively drain.
  const drain = deadline => recoverQueue({ db, runExactAttempt: rawSupervisor, deadline })
  handler = createGradeHandler({ supabaseUrl: 'https://phnjcmahugetofwvnbto.supabase.co',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY, origins: [origin], db: api, waitUntil,
    recover: () => drain(invocationDeadline()),
    runAttempt: async id => {
      const deadline = invocationDeadline()
      try { return await rawSupervisor(id, { deadline }) }
      finally { await drain(deadline) }
    } })
  return handler
}

export default {
  async fetch(request) {
    try { return await configuredHandler()(request) }
    catch { return Response.json({ code: 'grading_unavailable' }, { status: 503, headers: {
      'Cache-Control': 'no-store', ...(request.headers.get('origin') === origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    } }) }
  },
}
