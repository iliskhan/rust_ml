import { readFileSync } from 'node:fs'
import pg from 'pg'
import { attachDatabasePool, getDeadline, waitUntil } from '@vercel/functions'
import { createGradeHandler } from '../grader/http-handler.mjs'
import { createSupervisor } from '../grader/supervisor.mjs'
import { createVercelProvider } from '../grader/vercel-provider.mjs'

const origin = 'https://iliskhan.github.io'
let handler
function configuredHandler() {
  if (handler) return handler
  const runtimes = JSON.parse(readFileSync(new URL('../grader/runtimes.json', import.meta.url), 'utf8'))
  if (!Object.keys(runtimes).length) throw Error('runtime_not_verified')
  const ca = readFileSync(new URL('../grader/supabase-ca.crt', import.meta.url), 'utf8')
  function pool(name, login) {
    const connection = new URL(process.env[name] ?? '')
    if (connection.protocol !== 'postgresql:' || connection.hostname !== 'aws-1-eu-central-1.pooler.supabase.com' ||
      connection.port !== '5432' || connection.pathname !== '/postgres' || connection.search || connection.hash ||
      decodeURIComponent(connection.username) !== `${login}.phnjcmahugetofwvnbto` || !connection.password) throw Error('invalid_database_config')
    const value = new pg.Pool({ connectionString: connection.href, ssl: { ca, rejectUnauthorized: true },
      max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 4000 })
    value.on('error', () => {})
    attachDatabasePool(value)
    return value
  }
  const api = pool('PRACTICE_API_DATABASE_URL', 'rustml_api')
  const worker = pool('PRACTICE_WORKER_DATABASE_URL', 'rustml_worker')
  const run = createSupervisor({ db: worker, provider: createVercelProvider(), runtimes })
  handler = createGradeHandler({ supabaseUrl: 'https://phnjcmahugetofwvnbto.supabase.co',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY, origins: [origin], db: api, waitUntil,
    runAttempt: id => run(id, { deadline: (getDeadline()?.getTime() ?? Date.now() + 240000) - 20000 }) })
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
