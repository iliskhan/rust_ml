import test from 'node:test'
import assert from 'node:assert/strict'
import { createSupervisor, runtimeKey } from '../grader/supervisor.mjs'
import { createGradeHandler } from '../grader/http-handler.mjs'
import { canonical, sha256, buildBundle, exercises } from '../grader/bundles.mjs'
import { createRecoveryHandler, recoverQueue } from '../grader/recovery.mjs'

const owner = '10000000-0000-4000-8000-000000000001'
const attemptId = '20000000-0000-4000-8000-000000000001'
const sessionId = '30000000-0000-4000-8000-000000000001'
const key = '40000000-0000-4000-8000-000000000001'
const token = '50000000-0000-4000-8000-000000000001'
const jobId = '60000000-0000-4000-8000-000000000001'
const digest = 'sha256:' + 'a'.repeat(64)
const image = 'trusted/runtime@' + digest
const item = exercises[0]
function job() {
  const bundle = buildBundle(item, 'javascript')
  bundle.runner_spec = { ...bundle.runner_spec, runtime_digest: digest }
  bundle.bundle_sha256 = sha256(canonical({ grading_tests: bundle.grading_tests, runner_spec: bundle.runner_spec }))
  return { ...bundle, attempt_id: attemptId, job_id: jobId, lease_token: token, lease_generation: 1,
    runtime_digest: digest, source: item.starter.javascript, source_sha256: sha256(item.starter.javascript),
    limits: { vcpus: 1, memory_mb: 2048, case_timeout_ms: 45000, stdout_bytes: 16384, result_bytes: 65536 } }
}
function harness(options = {}) {
  const calls = [], active = job(), executions = [], stopped = []
  const db = { async query(sql, values) {
    calls.push({ sql, values: [...values] })
    if (sql.includes('claim_practice_job')) return { rows: [{ job: options.claim === undefined ? active : options.claim }] }
    if (sql.includes('practice_execution_contract')) return { rows: [{ contract: options.badContract ? null : {
      language: active.language, entrypoint: active.runner_spec.entrypoint, input_language: 'python', input_starter: item.starter.python,
    } }] }
    if (sql.includes('renew_practice_job')) return { rows: [{ renewed: options.renew ?? true }] }
    if (sql.includes('finish_practice_job')) {
      if (options.lostFinish && calls.filter(call => call.sql.includes('finish_practice_job')).length === 1) throw Error('network lost after commit secret-source')
      return { rows: [{ status: values[3] === 'infrastructure' ? 'queued' : 'graded' }] }
    }
    throw Error('unexpected SQL')
  } }
  const provider = {
    async executeCase(request) {
      executions.push(request)
      if (options.execute) return options.execute(request)
      const current = active.grading_tests[executions.length - 1]
      return { raw: JSON.stringify({ protocol: 1, case_id: current.id, value: options.wrong ? null : current.expected }) }
    }, async stopAttempt(scope) { stopped.push(scope); if (options.cleanupFailure) throw Error('secret provider context') },
  }
  const runtimes = { [runtimeKey('javascript', digest)]: { image, language: 'javascript', caseTimeoutMs: 45000 } }
  const run = createSupervisor({ db, provider, runtimes, heartbeatMs: 5, operationMs: 50,
    maxJobMs: options.maxJobMs ?? 1000, cleanupMs: 50 })
  return { calls, active, executions, stopped, runtimes, run }
}

test('supervisor exact claim, trusted compare, cleanup and same-payload finish retry', async () => {
  const state = harness({ lostFinish: true })
  assert.deepEqual(await state.run(attemptId), { status: 'graded' })
  assert.deepEqual(state.calls[0].values, [attemptId])
  assert.equal(state.executions.length, state.active.expected_tests)
  assert.equal(state.stopped.length, 1)
  for (const execution of state.executions) {
    assert.equal(execution.runtime.image, image)
    assert.equal(Object.hasOwn(execution, 'grading_tests'), false)
    assert.ok(!JSON.stringify(execution.execution).includes('expected'))
  }
  const finishes = state.calls.filter(call => call.sql.includes('finish_practice_job'))
  assert.equal(finishes.length, 2); assert.deepEqual(finishes[0].values, finishes[1].values)
  assert.deepEqual(finishes[0].values.slice(0, 3), [jobId, token, 1])
  assert.equal(finishes[0].values[3], 'pass')
})

test('supervisor rejects source/manifest/runtime pin before execution, reports safe infrastructure', async () => {
  for (const mutate of [state => { state.active.source += '\nchanged' }, state => { state.active.bundle_sha256 = 'b'.repeat(64) },
    state => { state.runtimes[runtimeKey('javascript', digest)].image = 'trusted/runtime:latest' }, state => { state.active.runner_spec.runtime_digest = 'sha256:' + 'b'.repeat(64) },
    state => { state.active.limits.case_timeout_ms = 30000 }, state => { state.active.limits.vcpus = 2 },
    state => { state.active.runner_spec.snapshot_id = 'snap_unapproved' },
    state => { state.runtimes[runtimeKey('javascript', digest)].snapshotId = 'snap_missing_manifest' }]) {
    const state = harness(); mutate(state)
    assert.deepEqual(await state.run(attemptId), { status: 'queued' })
    assert.equal(state.executions.length, 0)
    assert.equal(state.calls.at(-1).values[3], 'infrastructure')
    assert.equal(state.stopped.length, 1)
  }
  const bad = harness({ claim: { ...job(), attempt_id: owner } })
  assert.equal((await bad.run(attemptId)).code, 'invalid_claim')
  assert.equal(bad.calls.length, 1)
})

test('one pinned OCI image supports separate language entries and exact optional snapshot/toolchain pins', async () => {
  for (const language of ['javascript', 'python']) {
    const state = harness(), bundle = buildBundle(item, language)
    Object.assign(state.active, bundle, { source: item.starter[language], source_sha256: sha256(item.starter[language]) })
    state.active.runner_spec = { ...bundle.runner_spec, runtime_digest: digest, snapshot_id: 'snap_verified', toolchain_sha256: 'c'.repeat(64) }
    state.active.bundle_sha256 = sha256(canonical({ grading_tests: state.active.grading_tests, runner_spec: state.active.runner_spec }))
    state.runtimes[runtimeKey(language, digest, 'snap_verified', 'c'.repeat(64))] = { image, language, caseTimeoutMs: 45000, snapshotId: 'snap_verified', toolchainSha256: 'c'.repeat(64) }
    assert.deepEqual(await state.run(attemptId), { status: 'graded' })
    assert.equal(state.executions[0].runtime.language, language)
  }
})

test('two immutable snapshot editions of one language/base image remain simultaneously executable', async () => {
  const first = harness(), second = harness()
  const runtimes = first.runtimes
  for (const [state, snapshot, hash] of [[first, 'snap_old', 'b'.repeat(64)], [second, 'snap_new', 'c'.repeat(64)]]) {
    state.active.runner_spec.snapshot_id = snapshot
    state.active.runner_spec.toolchain_sha256 = hash
    state.active.bundle_sha256 = sha256(canonical({ grading_tests: state.active.grading_tests, runner_spec: state.active.runner_spec }))
    runtimes[runtimeKey('javascript', digest, snapshot, hash)] = { image, language: 'javascript', caseTimeoutMs: 45000, snapshotId: snapshot, toolchainSha256: hash }
  }
  Object.assign(second.runtimes, runtimes)
  assert.deepEqual(await Promise.all([first.run(attemptId), second.run(attemptId)]), [{ status: 'graded' }, { status: 'graded' }])
  assert.equal(first.executions[0].runtime.snapshotId, 'snap_old')
  assert.equal(second.executions[0].runtime.snapshotId, 'snap_new')
  const mismatch = harness()
  mismatch.active.runner_spec.snapshot_id = 'snap_old'
  mismatch.active.runner_spec.toolchain_sha256 = 'b'.repeat(64)
  mismatch.active.bundle_sha256 = sha256(canonical({ grading_tests: mismatch.active.grading_tests, runner_spec: mismatch.active.runner_spec }))
  mismatch.runtimes[runtimeKey('javascript', digest, 'snap_old', 'b'.repeat(64))] = { image, language: 'javascript', caseTimeoutMs: 45000, snapshotId: 'snap_new', toolchainSha256: 'c'.repeat(64) }
  assert.deepEqual(await mismatch.run(attemptId), { status: 'queued' })
  assert.equal(mismatch.executions.length, 0)
})

test('lease loss aborts provider and never publishes stale verdict; deadline aborts infrastructure', async () => {
  const waitForAbort = ({ signal }) => new Promise(resolve => signal.addEventListener('abort', () => resolve({ error: 'time_limit' }), { once: true }))
  const lost = harness({ renew: false, execute: waitForAbort })
  assert.deepEqual(await lost.run(attemptId), { status: 'aborted', code: 'lease_lost' })
  assert.equal(lost.stopped.length, 1)
  assert.equal(lost.calls.some(call => call.sql.includes('finish_practice_job')), false)
  const deadline = harness({ maxJobMs: 15, execute: waitForAbort })
  assert.deepEqual(await deadline.run(attemptId), { status: 'queued' })
  assert.equal(deadline.stopped.length, 1)
  assert.equal(deadline.calls.at(-1).values[3], 'infrastructure')
})

test('wrong guest values fail; provider throw/cleanup failure do not expose raw context', async () => {
  const wrong = harness({ wrong: true })
  assert.equal((await wrong.run(attemptId)).status, 'graded')
  assert.equal(wrong.calls.at(-1).values[3], 'fail')
  for (const options of [{ execute: async () => { throw Error('SECRET runtime context') } }, { cleanupFailure: true }]) {
    const state = harness(options)
    assert.deepEqual(await state.run(attemptId), { status: 'queued' })
    assert.ok(!JSON.stringify(state.calls.at(-1).values).includes('SECRET'))
    assert.equal(state.calls.at(-1).values[3], 'infrastructure')
  }
})

test('legacy pinned editions resolve arguments from immutable published starters without changing the digest', async () => {
  for (const badContract of [false, true]) {
    const state = harness({ badContract })
    delete state.active.runner_spec.parameters
    state.active.bundle_sha256 = sha256(canonical({ grading_tests: state.active.grading_tests, runner_spec: state.active.runner_spec }))
    const original = structuredClone(state.active)
    assert.equal((await state.run(attemptId)).status, badContract ? 'queued' : 'graded')
    assert.deepEqual(state.active, original)
    assert.equal(state.executions.length, badContract ? 0 : original.expected_tests)
    assert.ok(state.calls.some(call => call.sql.includes('practice_execution_contract')))
  }
})

test('trusted recovery drains a bounded due snapshot with at most two exact claims and no recursive sweeps', async () => {
  const ids = Array.from({ length: 20 }, (_, index) => `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`)
  let discovered = 0, active = 0, peak = 0
  const claimed = []
  const result = await recoverQueue({ db: { async query(sql, values) {
    assert.equal(sql, 'select attempt_id from private.practice_due_attempts()'); assert.deepEqual(values, [])
    discovered++; return { rows: ids.map(attempt_id => ({ attempt_id })) }
  } }, deadline: Date.now() + 1000, runExactAttempt: async (id, options) => {
    claimed.push(id); active++; peak = Math.max(peak, active)
    assert.ok(options.deadline > Date.now())
    await new Promise(resolve => setImmediate(resolve)); active--
    return { status: claimed.length % 2 ? 'queued' : 'graded' }
  } })
  assert.equal(discovered, 1); assert.equal(peak, 2)
  assert.deepEqual(claimed, ids); assert.equal(result.attempted, 20)
  assert.equal(result.completed + result.deferred, 20); assert.equal(result.failed, 0)
})

test('recovery respects deadlines, rejects malformed discovery, authenticates cron and redacts output', async () => {
  const db = { async query() { return { rows: [{ attempt_id: attemptId }] } } }
  const raw = await recoverQueue({ db, runExactAttempt: () => assert.fail('expired invocation must not claim'), deadline: 1, now: () => 2 })
  assert.equal(raw.attempted, 0); assert.equal(raw.deferred, 1)
  await assert.rejects(recoverQueue({ db: { async query() { return { rows: [{ attempt_id: 'secret-invalid' }] } } },
    runExactAttempt: () => assert.fail('invalid queue must not claim'), deadline: Date.now() + 1000 }), /invalid_recovery_queue/)
  const secret = 's'.repeat(32), calls = []
  const handler = createRecoveryHandler({ secret, recover: async () => { calls.push(1); return { ...raw, source: 'SECRET', owner: owner } } })
  const request = value => new Request('https://backend.test/api/practice-recover', { headers: { Authorization: `Bearer ${value}` } })
  assert.equal((await handler(request('wrong'))).status, 403); assert.equal(calls.length, 0)
  const response = await handler(request(secret))
  assert.deepEqual(await response.json(), raw); assert.equal(calls.length, 1)
  const missing = createRecoveryHandler({ recover: () => assert.fail('missing cron secret must not run') })
  assert.equal((await missing(request(secret))).status, 503)
})

function httpHarness(options = {}) {
  const calls = [], background = [], authCalls = [], launched = []
  const handler = createGradeHandler({ supabaseUrl: 'https://project.supabase.co', publishableKey: 'public-key', origins: ['https://rustml.test'],
    bodyLimit: options.bodyLimit ?? 131072,
    fetch: async (url, init) => {
      authCalls.push({ url, init })
      if (options.authFailure) throw Error('secret provider token')
      return new Response(JSON.stringify({ id: owner }), { status: options.authStatus ?? 200 })
    }, db: { async query(sql, values) {
      calls.push({ sql, values })
      if (options.sqlFailure) throw Error(options.sqlFailure === true ? 'secret postgres connection' : options.sqlFailure)
      if (sql.includes('submit_practice')) return { rows: [{ id: attemptId }] }
      return { rows: [{ attempt: options.foreign ? null : { id: attemptId, status: options.status ?? 'queued' } }] }
    } }, runAttempt: async id => { launched.push(id); return { status: 'graded' } }, recover: options.recover,
    waitUntil: promise => background.push(promise),
  })
  return { handler, calls, background, authCalls, launched }
}
const submitBody = { action: 'submit', session: sessionId, key, revision: 2 }
function request(body = submitBody, options = {}) {
  return new Request('https://backend.test/api/practice-grade', { method: options.method ?? 'POST',
    headers: { Origin: options.origin ?? 'https://rustml.test', 'Content-Type': options.contentType ?? 'application/json',
      Authorization: options.authorization ?? 'Bearer verified.jwt.token' },
    ...(options.method === 'GET' || options.method === 'OPTIONS' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
}

test('HTTP verified auth submit/retry and owner resume schedule only exact attempt', async () => {
  const state = httpHarness()
  for (const body of [submitBody, submitBody, { action: 'resume', attempt_id: attemptId }]) {
    const response = await state.handler(request(body))
    assert.equal(response.status, 202)
    assert.deepEqual(await response.json(), { attempt_id: attemptId, status: 'queued' })
  }
  await Promise.all(state.background)
  assert.deepEqual(state.launched, [attemptId, attemptId, attemptId])
  assert.equal(state.authCalls[0].url, 'https://project.supabase.co/auth/v1/user')
  assert.equal(state.authCalls[0].init.headers.Authorization, 'Bearer verified.jwt.token')
  assert.equal(state.authCalls[0].init.redirect, 'error')
  const submits = state.calls.filter(call => call.sql.includes('submit_practice'))
  assert.equal(submits.length, 2)
  assert.deepEqual(submits[0].values, [owner, sessionId, key, 2])
  assert.deepEqual(submits[0].values, submits[1].values)
  const denied = httpHarness({ foreign: true })
  assert.equal((await denied.handler(request({ action: 'resume', attempt_id: attemptId }))).status, 404)
  assert.equal(denied.background.length, 0)
  const missing = httpHarness({ sqlFailure: 'attempt_not_found' })
  const missingResponse = await missing.handler(request({ action: 'resume', attempt_id: attemptId }))
  assert.equal(missingResponse.status, 404)
  assert.deepEqual(await missingResponse.json(), { code: 'attempt_not_found' })
  assert.equal(missing.background.length, 0)
  const finished = httpHarness({ status: 'graded' })
  assert.equal((await finished.handler(request({ action: 'resume', attempt_id: attemptId }))).status, 200)
  assert.equal(finished.background.length, 0)
})

test('HTTP fresh authenticated account without practice profile receives generic session denial', async () => {
  for (const reason of ['profile_not_found', 'session_not_found']) {
    const state = httpHarness({ sqlFailure: reason }), response = await state.handler(request())
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { code: 'session_not_found' })
    assert.equal(state.calls.length, 1)
    assert.equal(state.background.length, 0)
    assert.equal(state.launched.length, 0)
  }
})

test('authorized submit blocked by a full queue schedules private recovery without exposing other attempts', async () => {
  let sweeps = 0
  const state = httpHarness({ sqlFailure: 'submission_limit', recover: async () => { sweeps++ } })
  const response = await state.handler(request())
  assert.equal(response.status, 429); assert.deepEqual(await response.json(), { code: 'submission_limit' })
  await Promise.all(state.background)
  assert.equal(sweeps, 1); assert.deepEqual(state.launched, [])
  const denied = httpHarness({ sqlFailure: 'session_not_found', recover: () => assert.fail('foreign session cannot wake queue') })
  await denied.handler(request()); assert.equal(denied.background.length, 0)
})

test('HTTP rejects origin/body/auth/client controls and redacts infrastructure errors', async () => {
  for (const [body, settings, status] of [[submitBody, { origin: 'https://evil.test' }, 403],
    [submitBody, { method: 'GET' }, 405], [submitBody, { contentType: 'text/plain' }, 415],
    [submitBody, { authorization: 'Basic no' }, 401], [{ ...submitBody, user_id: owner }, {}, 400],
    [{ ...submitBody, image }, {}, 400], [{ ...submitBody, revision: -1 }, {}, 400], ['{broken', {}, 400]]) {
    const state = httpHarness(), response = await state.handler(request(body, settings))
    assert.equal(response.status, status); assert.equal(state.calls.length, 0)
  }
  const large = httpHarness({ bodyLimit: 16 })
  assert.equal((await large.handler(request(submitBody))).status, 413)
  for (const [options, status, code] of [[{ authStatus: 401 }, 401, 'unauthenticated'], [{ authFailure: true }, 503, 'auth_unavailable'],
    [{ sqlFailure: true }, 503, 'infrastructure'], [{ sqlFailure: 'grading_budget_exhausted secret' }, 429, 'grading_budget_exhausted']]) {
    const state = httpHarness(options), response = await state.handler(request())
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { code })
    assert.equal(state.background.length, 0)
  }
  const preflight = await httpHarness().handler(request(null, { method: 'OPTIONS' }))
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://rustml.test')
})
