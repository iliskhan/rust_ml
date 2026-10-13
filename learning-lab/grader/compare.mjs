import { canonical, sha256 } from './bundles.mjs'

function bounded(value, depth = 0, budget = { remaining: 16384 }) {
  if (--budget.remaining < 0 || depth > 16) throw Error('invalid_result')
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw Error('invalid_result'); return }
  if (value === null || ['string', 'boolean'].includes(typeof value)) return
  if (Array.isArray(value)) { for (const item of value) bounded(item, depth + 1, budget); return }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw Error('invalid_result')
  for (const item of Object.values(value)) bounded(item, depth + 1, budget)
}

function uniqueKeys(raw) {
  // JSON.parse validates grammar first; this pass prevents duplicate-key ambiguity.
  const tokens = /"(?:\\.|[^"\\])*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
  const stack = []
  for (const [token] of raw.matchAll(tokens)) {
    const current = stack.at(-1)
    if (token === '{') stack.push({ keys: new Set(), key: true })
    else if (token === '[') stack.push({ keys: null })
    else if (token === '}' || token === ']') stack.pop()
    else if (token === ',' && current?.keys) current.key = true
    else if (token === ':' && current?.keys) current.key = false
    else if (token.startsWith('"') && current?.keys && current.key) {
      const key = JSON.parse(token)
      if (current.keys.has(key)) throw Error('duplicate_key')
      current.keys.add(key)
    }
  }
}

export function equivalent(actual, expected, atol, rtol) {
  if (typeof expected === 'number') return typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= atol + rtol * Math.abs(expected)
  if (expected === null || typeof expected !== 'object') return actual === expected
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => equivalent(actual[index], item, atol, rtol))
  return actual !== null && typeof actual === 'object' && !Array.isArray(actual) &&
    Object.keys(actual).sort().join('\0') === Object.keys(expected).sort().join('\0') &&
    Object.keys(expected).every(key => equivalent(actual[key], expected[key], atol, rtol))
}

// Runs in the trusted supervisor. Learner JSON can supply values, never a verdict.
export function compareCase(raw, test, spec) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > spec.result_bytes) return { passed: false, error: 'output_limit' }
  let result
  try { result = JSON.parse(raw); uniqueKeys(raw); bounded(result) } catch { return { passed: false, error: 'runtime_error' } }
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { passed: false, error: 'runtime_error' }
  const keys = Object.keys(result).sort().join(',')
  if (result.protocol !== 1 || result.case_id !== test.id || !['case_id,protocol,value', 'case_id,error,protocol'].includes(keys)) return { passed: false, error: 'runtime_error' }
  if (Object.hasOwn(result, 'error')) return { passed: false, error: ['compile_error', 'runtime_error'].includes(result.error) ? result.error : 'runtime_error' }
  return { passed: equivalent(result.value, test.expected, spec.atol, spec.rtol), error: null }
}

export function finishResult(bundle, caseResults) {
  if (sha256(canonical({ grading_tests: bundle.grading_tests, runner_spec: bundle.runner_spec })) !== bundle.bundle_sha256) throw Error('bundle_digest_mismatch')
  if (caseResults.length !== bundle.expected_tests) throw Error('missing_case_results')
  const results = bundle.grading_tests.map((test, index) => {
    const transport = caseResults[index]
    // Transport errors come from the provider/supervisor, not learner JSON.
    if (transport.error) {
      if (!['infrastructure', 'time_limit', 'memory_limit', 'output_limit', 'compile_error', 'runtime_error'].includes(transport.error)) throw Error('invalid_transport_error')
      return { passed: false, error: transport.error }
    }
    return compareCase(transport.raw, test, bundle.runner_spec)
  })
  if (results.some(result => result.error === 'infrastructure')) return { outcome: 'infrastructure', passed: null, error: 'infrastructure', feedback: 'Проверка временно недоступна.' }
  const passed = results.filter(result => result.passed).length
  const error = results.find(result => result.error)?.error ?? null
  return { outcome: passed === bundle.expected_tests && !error ? 'pass' : 'fail', passed, error,
    feedback: `Открытые примеры: ${passed}/${bundle.expected_tests}.` }
}
