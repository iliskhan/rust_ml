import { canonical, sha256 } from './digest.mjs'
import { practiceTopics } from '../src/practice/all-catalog.ts'
import { signature, orderedArguments } from './parameters.mjs'
export { canonical, sha256 } from './digest.mjs'

export const languages = ['python', 'javascript', 'rust']
export const exercises = practiceTopics.flatMap(topic => topic.exercises)
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/

export function runnerSpec(exercise, language) {
  if (!languages.includes(language)) throw Error('unsupported_language')
  const starter = exercise.starter[language]
  const authored = signature(starter, language)
  const { entrypoint } = authored
  // Public fixture keys use the Python contract; JavaScript has a few camelCase aliases.
  const parameters = language === 'javascript' ? signature(exercise.starter.python, 'python').parameters : authored.parameters
  if (parameters.length !== authored.parameters.length) throw Error('input_signature_mismatch')
  if (!entrypoint || !identifier.test(entrypoint)) throw Error('unsupported_entrypoint')
  const tolerance = exercise.tolerance ?? (exercise.topicId === 'unit.backprop.check' ? { atol: 1e-7, rtol: 1e-6 } : { atol: 1e-12, rtol: 1e-10 })
  if (!Number.isFinite(tolerance.atol) || tolerance.atol < 0 || !Number.isFinite(tolerance.rtol) || tolerance.rtol < 0) throw Error('invalid_tolerance')
  const spec = { enabled: true, protocol: 1, adapter: 'rustml-public-values-v1', language, entrypoint, parameters,
    visibility: 'public', result_bytes: 65536, source_bytes: 65536, max_depth: 16,
    atol: tolerance.atol, rtol: tolerance.rtol }
  if (language === 'rust') {
    spec.structs = [...starter.matchAll(/pub struct (\w+)\s*\{([^}]+)\}/g)].map(([, name, fields]) => ({ name,
      fields: fields.split(',').map(field => field.trim()).filter(Boolean).map(field => {
        const match = field.match(/^pub\s+(\w+)\s*:\s*(.+)$/)
        if (!match || !identifier.test(match[1]) || !['f64', 'bool', 'Vec<f64>', 'Vec<Vec<f64>>'].includes(match[2])) throw Error('unsupported_rust_field:' + field)
        return match[1]
      }) }))
  }
  return spec
}

export function buildBundle(exercise, language, { runtimeDigest, snapshotId, toolchainSha256 } = {}) {
  const runner_spec = runnerSpec(exercise, language)
  if (runtimeDigest !== undefined) {
    if (!/^sha256:[0-9a-f]{64}$/.test(runtimeDigest)) throw Error('invalid_runtime_digest')
    runner_spec.runtime_digest = runtimeDigest
  }
  if (snapshotId !== undefined || toolchainSha256 !== undefined) {
    if (!runtimeDigest || typeof snapshotId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(snapshotId) ||
      typeof toolchainSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(toolchainSha256)) throw Error('invalid_snapshot_identity')
    runner_spec.snapshot_id = snapshotId
    runner_spec.toolchain_sha256 = toolchainSha256
  }
  const grading_tests = exercise.fixtures.map((fixture, index) => ({
    id: 'public-' + index, visibility: 'public', input: JSON.parse(fixture.input), expected: JSON.parse(fixture.output),
  }))
  if (!grading_tests.length) throw Error('empty_grading_bundle')
  for (const test of grading_tests) orderedArguments(runner_spec, test.input)
  const manifest = { grading_tests, runner_spec }
  return { exercise_key: exercise.id, language, ...manifest, expected_tests: grading_tests.length,
    bundle_sha256: sha256(canonical(manifest)) }
}

export function buildBundles() {
  return exercises.flatMap(exercise => languages.map(language => buildBundle(exercise, language)))
}
