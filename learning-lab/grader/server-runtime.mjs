import { readFileSync } from 'node:fs'
import pg from 'pg'
import { attachDatabasePool } from '@vercel/functions'
import { createSupervisor } from './supervisor.mjs'
import { createVercelProvider } from './vercel-provider.mjs'

export function databasePool(name, login) {
  const connection = new URL(process.env[name] ?? '')
  if (connection.protocol !== 'postgresql:' || connection.hostname !== 'aws-1-eu-central-1.pooler.supabase.com' ||
    connection.port !== '5432' || connection.pathname !== '/postgres' || connection.search || connection.hash ||
    decodeURIComponent(connection.username) !== `${login}.phnjcmahugetofwvnbto` || !connection.password) throw Error('invalid_database_config')
  const ca = readFileSync(new URL('./supabase-ca.crt', import.meta.url), 'utf8')
  const value = new pg.Pool({ connectionString: connection.href, ssl: { ca, rejectUnauthorized: true },
    max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 4000 })
  value.on('error', () => {})
  attachDatabasePool(value)
  return value
}

let worker
export function workerRuntime() {
  if (worker) return worker
  const runtimes = JSON.parse(readFileSync(new URL('./runtimes.json', import.meta.url), 'utf8'))
  if (!Object.keys(runtimes).length) throw Error('runtime_not_verified')
  const db = databasePool('PRACTICE_WORKER_DATABASE_URL', 'rustml_worker')
  worker = { db, runAttempt: createSupervisor({ db, provider: createVercelProvider(), runtimes }) }
  return worker
}
