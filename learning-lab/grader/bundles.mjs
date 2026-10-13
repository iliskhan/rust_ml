import { createHash } from 'node:crypto'
import { practiceTopics } from '../src/practice/all-catalog.ts'

export const languages = ['python', 'javascript', 'rust']
export const exercises = practiceTopics.flatMap(topic => topic.exercises)
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/
const rustTypes = new Set(['f64', 'usize', 'u32', 'i32', 'bool', '&str', '&[f64]', '&[usize]', '&[bool]', '&[Vec<f64>]'])

// This digest covers the executable grading manifest, never the help-only v1 bundle.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
}
export const sha256 = value => createHash('sha256').update(value).digest('hex')

export function runnerSpec(exercise, language) {
  if (!languages.includes(language)) throw Error('unsupported_language')
  const starter = exercise.starter[language]
  const entrypoint = starter.match(/(?:function|def|fn)\s+(\w+)/)?.[1]
  if (!entrypoint || !identifier.test(entrypoint)) throw Error('unsupported_entrypoint')
  const spec = { enabled: true, protocol: 1, adapter: 'rustml-public-values-v1', language, entrypoint,
    visibility: 'public', result_bytes: 65536, source_bytes: 65536, max_depth: 16,
    atol: exercise.topicId === 'unit.backprop.check' ? 1e-7 : 1e-12,
    rtol: exercise.topicId === 'unit.backprop.check' ? 1e-6 : 1e-10 }
  if (language === 'rust') {
    const signature = starter.match(/pub fn \w+\(([^)]*)\)\s*->\s*Result</)
    if (!signature) throw Error('unsupported_rust_signature:' + exercise.id)
    spec.parameters = signature[1].split(',').map(parameter => {
      const match = parameter.trim().match(/^(\w+)\s*:\s*(.+)$/)
      if (!match || !identifier.test(match[1]) || !rustTypes.has(match[2].trim())) throw Error('unsupported_rust_parameter:' + parameter)
      return { name: match[1], type: match[2].trim() }
    })
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
  const manifest = { grading_tests, runner_spec }
  return { exercise_key: exercise.id, language, ...manifest, expected_tests: grading_tests.length,
    bundle_sha256: sha256(canonical(manifest)) }
}

export function buildBundles() {
  return exercises.flatMap(exercise => languages.map(language => buildBundle(exercise, language)))
}
