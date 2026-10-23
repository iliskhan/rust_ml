import { createHash, timingSafeEqual } from 'node:crypto'
import { isUuid } from './supervisor.mjs'

// Discovery is private and bounded; every attempt still needs its budgeted/fenced claim.
export async function recoverQueue({ db, runExactAttempt, deadline, signal, now = Date.now }) {
  if (!db?.query || typeof runExactAttempt !== 'function' || !Number.isFinite(deadline)) throw Error('invalid_recovery_config')
  const { rows } = await db.query('select attempt_id from private.practice_due_attempts()', [])
  if (!Array.isArray(rows) || rows.length > 20 || rows.some(row => !isUuid(row.attempt_id)) ||
    new Set(rows.map(row => row.attempt_id)).size !== rows.length) throw Error('invalid_recovery_queue')
  const result = { discovered: rows.length, attempted: 0, completed: 0, deferred: 0, failed: 0 }
  let next = 0
  async function consume() {
    while (next < rows.length && !signal?.aborted && now() < deadline) {
      const id = rows[next++].attempt_id
      result.attempted++
      try {
        const value = await runExactAttempt(id, { deadline, signal })
        if (value?.status === 'graded' || value?.status === 'error') result.completed++
        else if (value?.status === 'idle' || value?.status === 'queued') result.deferred++
        else result.failed++
      } catch { result.failed++ }
    }
  }
  await Promise.all([consume(), consume()])
  result.deferred += rows.length - result.attempted
  return result
}

export function createRecoveryHandler({ secret, recover }) {
  const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  return async request => {
    if (request.method !== 'GET') return reply({ code: 'method_not_allowed' }, 405)
    if (typeof secret !== 'string' || secret.length < 32 || secret.length > 1024) return reply({ code: 'recovery_unavailable' }, 503)
    const supplied = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
    if (!supplied || supplied.length > 1024 || !timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(secret).digest())) return reply({ code: 'forbidden' }, 403)
    try {
      const result = await recover({ signal: request.signal })
      const keys = ['discovered', 'attempted', 'completed', 'deferred', 'failed']
      if (!result || keys.some(key => !Number.isSafeInteger(result[key]) || result[key] < 0 || result[key] > 20)) throw Error('invalid_recovery_result')
      return reply(Object.fromEntries(keys.map(key => [key, result[key]])))
    } catch { return reply({ code: 'recovery_unavailable' }, 503) }
  }
}
