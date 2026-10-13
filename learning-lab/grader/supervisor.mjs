import { canonical, sha256 } from './digest.mjs'
import { buildExecution } from './execution.mjs'
import { finishResult } from './compare.mjs'

export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
// Include every immutable runtime pin so old snapshot editions remain addressable.
export const runtimeKey = (language, digest, snapshotId, toolchainSha256) => JSON.stringify([language, digest, snapshotId ?? null, toolchainSha256 ?? null])
const infrastructure = () => ({ outcome: 'infrastructure', passed: null, error: 'infrastructure', feedback: 'Проверка временно недоступна.' })
const abortError = () => new Error('execution_aborted')
function untilAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise((resolve, reject) => {
    const aborted = () => reject(abortError())
    signal.addEventListener('abort', aborted, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted))
  })
}
function deadlineBound(promise, milliseconds) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('operation_timeout')), milliseconds) })]).finally(() => clearTimeout(timer))
}

// Only trusted DB/provider dependencies run here. Neither this module nor its tests
// execute editor source on the host. Provider owns VM isolation and signal cleanup.
export function createSupervisor({ db, provider, runtimes, now = Date.now,
  heartbeatMs = 15000, maxJobMs = 210000, operationMs = 5000, cleanupMs = 5000 }) {
  if (!db?.query || !provider?.executeCase || !provider?.stopAttempt || !runtimes ||
    heartbeatMs <= 0 || maxJobMs <= 0 || maxJobMs > 210000) throw Error('invalid_supervisor_config')

  return async function runAttempt(attemptId, options = {}) {
    if (!isUuid(attemptId)) return { status: 'unavailable', code: 'invalid_attempt' }
    let claim
    try {
      const response = await deadlineBound(db.query('select private.claim_practice_job($1::uuid) as job', [attemptId]), operationMs)
      claim = response.rows[0]?.job
    } catch { return { status: 'unavailable', code: 'infrastructure' } }
    if (!claim) return { status: 'idle' }
    if (claim.attempt_id !== attemptId || !isUuid(claim.job_id) || !isUuid(claim.lease_token) ||
      !Number.isSafeInteger(claim.lease_generation) || claim.lease_generation < 1) return { status: 'unavailable', code: 'invalid_claim' }

    const scope = Object.freeze({ attemptId, jobId: claim.job_id, leaseGeneration: claim.lease_generation })
    const fence = [claim.job_id, claim.lease_token, claim.lease_generation]
    const control = new AbortController()
    let leaseLost = false, deadlineReached = false, stopped = false, heartbeatTimer, heartbeatWork
    let wallDeadline = Math.min(now() + maxJobMs, options.deadline ?? Infinity)
    if (claim.claim_deadline_at) wallDeadline = Math.min(wallDeadline, Date.parse(claim.claim_deadline_at))
    if (!Number.isFinite(wallDeadline)) wallDeadline = now()
    const deadlineTimer = setTimeout(() => { deadlineReached = true; control.abort() }, Math.max(0, wallDeadline - now()))
    const externalAbort = () => { leaseLost = true; control.abort() }
    options.signal?.addEventListener('abort', externalAbort, { once: true })
    if (options.signal?.aborted) externalAbort()
    const heartbeat = () => {
      heartbeatTimer = setTimeout(() => {
        if (stopped || control.signal.aborted) return
        heartbeatWork = deadlineBound(db.query('select private.renew_practice_job($1::uuid,$2::uuid,$3::integer) as renewed', fence), operationMs)
          .then(response => { if (response.rows[0]?.renewed !== true) { leaseLost = true; control.abort() } })
          .catch(() => { leaseLost = true; control.abort() })
          .finally(() => { if (!stopped && !control.signal.aborted) heartbeat() })
      }, heartbeatMs)
    }
    heartbeat()
    let verdict = infrastructure()
    try {
      const spec = claim.runner_spec, runtime = runtimes[runtimeKey(spec?.language, claim.runtime_digest, spec?.snapshot_id, spec?.toolchain_sha256)]
      if (typeof claim.source !== 'string' || Buffer.byteLength(claim.source) > 65536 ||
        sha256(claim.source) !== claim.source_sha256 || !runtime || runtime.language !== spec?.language ||
        !/^sha256:[0-9a-f]{64}$/.test(claim.runtime_digest) || spec?.runtime_digest !== claim.runtime_digest ||
        typeof runtime.image !== 'string' || !runtime.image.endsWith('@' + claim.runtime_digest) ||
        spec.snapshot_id !== runtime.snapshotId || spec.toolchain_sha256 !== runtime.toolchainSha256 ||
        (runtime.snapshotId !== undefined && (typeof runtime.snapshotId !== 'string' || !runtime.snapshotId)) ||
        (runtime.toolchainSha256 !== undefined && !/^[0-9a-f]{64}$/.test(runtime.toolchainSha256)) ||
        spec.enabled !== true || spec.protocol !== 1 || spec.adapter !== 'rustml-public-values-v1' ||
        !Array.isArray(claim.grading_tests) || claim.expected_tests !== claim.grading_tests.length ||
        claim.expected_tests < 1 || claim.expected_tests > 4 ||
        !Number.isSafeInteger(spec.result_bytes) || spec.result_bytes < 1 || spec.result_bytes > 65536 ||
        !Number.isFinite(spec.atol) || spec.atol < 0 || !Number.isFinite(spec.rtol) || spec.rtol < 0 ||
        sha256(canonical({ grading_tests: claim.grading_tests, runner_spec: spec })) !== claim.bundle_sha256) throw Error('invalid_pinned_job')
      const limits = claim.limits
      if (!limits || limits.vcpus !== 1 || limits.memory_mb !== 2048 ||
        !Number.isSafeInteger(limits.case_timeout_ms) || limits.case_timeout_ms < 1000 || limits.case_timeout_ms > 45000 ||
        limits.stdout_bytes !== 16384 || limits.result_bytes !== 65536 ||
        !Number.isSafeInteger(runtime.caseTimeoutMs) || runtime.caseTimeoutMs <= 0 ||
        runtime.caseTimeoutMs > limits.case_timeout_ms) throw Error('invalid_reserved_runtime_profile')
      const results = []
      for (const current of claim.grading_tests) {
        if (control.signal.aborted || now() >= wallDeadline) { deadlineReached = !leaseLost; throw abortError() }
        const execution = buildExecution(claim.source, spec, current)
        const result = await untilAbort(provider.executeCase({ execution, runtime, scope,
          deadline: Math.min(wallDeadline, now() + runtime.caseTimeoutMs), signal: control.signal }), control.signal)
        // Provider results are transport envelopes, never verdicts from guest stdout.
        if (!result || typeof result !== 'object' || !['raw', 'error'].includes(Object.keys(result).sort().join(',')) || (result.error ?
          !['infrastructure', 'compile_error', 'runtime_error', 'time_limit', 'memory_limit', 'output_limit'].includes(result.error) :
          typeof result.raw !== 'string')) throw Error('invalid_provider_result')
        results.push(result)
      }
      if (control.signal.aborted || now() >= wallDeadline) { deadlineReached = !leaseLost; throw abortError() }
      verdict = finishResult(claim, results)
    } catch {
      // Deadline/invocation failure is infrastructure unless provider proves a
      // learner resource limit. No raw DB/SDK/source context escapes this module.
      verdict = infrastructure()
    } finally {
      stopped = true
      clearTimeout(heartbeatTimer); clearTimeout(deadlineTimer)
      options.signal?.removeEventListener('abort', externalAbort)
      control.abort()
      if (heartbeatWork) await heartbeatWork
      try { await deadlineBound(provider.stopAttempt(scope), cleanupMs) } catch { verdict = infrastructure() }
    }
    if (leaseLost) return { status: 'aborted', code: 'lease_lost' }
    if (deadlineReached) verdict = infrastructure()
    const payload = [...fence, verdict.outcome, verdict.passed, verdict.error, verdict.feedback]
    // Unknown finish outcome: retry the exact same arguments, never regrade.
    for (let retry = 0; retry < 2; retry++) {
      try {
        const response = await deadlineBound(db.query('select private.finish_practice_job($1::uuid,$2::uuid,$3::integer,$4::text,$5::integer,$6::text,$7::text) as status', payload), operationMs)
        const status = response.rows[0]?.status
        if (!['queued', 'graded', 'error'].includes(status)) return { status: 'unavailable', code: 'infrastructure' }
        return { status }
      } catch (error) {
        if (typeof error?.message === 'string' && error.message.includes('stale_lease')) return { status: 'aborted', code: 'lease_lost' }
      }
    }
    return { status: 'unavailable', code: 'infrastructure' }
  }
}
