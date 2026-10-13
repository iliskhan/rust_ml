import { buildBundle, canonical, exercises, languages } from './bundles.mjs'

// The rows come from the published database catalog. No new edition may silently
// replace the learner's original statement, starter contract or public examples.
export function prepareManifests(rows, runtimes, edition = 1) {
  if (!Array.isArray(rows) || !Number.isSafeInteger(edition) || edition < 1) throw Error('invalid_publication')
  const catalog = new Map(exercises.map(exercise => [exercise.id, exercise]))
  const seen = new Set()
  const variantIds = new Set()
  const manifests = rows.map(row => {
    const exercise = catalog.get(row.exercise_key)
    const key = `${row.exercise_key}/${row.language}`
    if (!exercise || !languages.includes(row.language) || seen.has(key) ||
      typeof row.id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(row.id) || variantIds.has(row.id)) throw Error('catalog_identity_mismatch')
    seen.add(key); variantIds.add(row.id)
    const runtime = runtimes[row.language]
    if (!runtime || !/^sha256:[0-9a-f]{64}$/.test(runtime.digest)) throw Error('missing_runtime')
    const bundle = buildBundle(exercise, row.language, { runtimeDigest: runtime.digest,
      snapshotId: runtime.snapshotId, toolchainSha256: runtime.toolchainSha256 })
    const tests = exercise.fixtures.map(fixture => ({ input: JSON.parse(fixture.input), output: JSON.parse(fixture.output) }))
    if (row.starter_code !== exercise.starter[row.language] || row.entrypoint !== bundle.runner_spec.entrypoint ||
      canonical(row.public_tests) !== canonical(tests) || row.objective !== exercise.title ||
      row.prompt_markdown !== `${exercise.prompt}\n\n${exercise.formula}`) throw Error('published_contract_mismatch:' + key)
    return { variant_id: row.id, edition, manifest_sha256: bundle.bundle_sha256,
      runtime_digest: runtime.digest, expected_tests: bundle.expected_tests,
      grading_tests: bundle.grading_tests, runner_spec: bundle.runner_spec }
  })
  if (seen.size !== exercises.length * languages.length) throw Error('incomplete_catalog')
  return manifests
}
