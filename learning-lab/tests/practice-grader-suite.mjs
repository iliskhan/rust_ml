import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildBundle, buildBundles, exercises, runnerSpec } from '../grader/bundles.mjs'
import { buildExecution, rustCaseProgram } from '../grader/execution.mjs'
import { compareCase, finishResult } from '../grader/compare.mjs'
import { prepareManifests } from '../grader/publication.mjs'

const message = (testCase, value) => JSON.stringify({ protocol: 1, case_id: testCase.id, value })
const exercise = exercises.find(item => item.id === 'unit.neuron.dot.guided') ?? exercises[0]

test('runtime identity is pinned in the grading manifest digest', () => {
  const a = buildBundle(exercise, 'python', { runtimeDigest: 'sha256:' + 'a'.repeat(64) })
  const b = buildBundle(exercise, 'python', { runtimeDigest: 'sha256:' + 'b'.repeat(64) })
  assert.notEqual(a.bundle_sha256, b.bundle_sha256)
  assert.equal(a.runner_spec.runtime_digest, 'sha256:' + 'a'.repeat(64))
  assert.throws(() => buildBundle(exercise, 'python', { runtimeDigest: 'latest' }), /invalid_runtime_digest/)
  const snapshot = id => buildBundle(exercise, 'rust', { runtimeDigest: 'sha256:' + 'a'.repeat(64), snapshotId: id, toolchainSha256: 'c'.repeat(64) })
  assert.notEqual(snapshot('snp_first').bundle_sha256, snapshot('snp_second').bundle_sha256)
  assert.throws(() => buildBundle(exercise, 'rust', { snapshotId: 'snp_first' }), /invalid_snapshot_identity/)
})

test('publication refuses missing or changed published contracts', () => {
  const runtimes = Object.fromEntries(['python', 'javascript', 'rust'].map(language => [language, { digest: 'sha256:' + 'a'.repeat(64) }]))
  const rows = exercises.flatMap((item, index) => ['python', 'javascript', 'rust'].map((language, languageIndex) => ({
    id: `00000000-0000-4000-8000-${String(index * 3 + languageIndex).padStart(12, '0')}`, exercise_key: item.id, language,
    starter_code: item.starter[language], entrypoint: runnerSpec(item, language).entrypoint,
    public_tests: item.fixtures.map(f => ({ input: JSON.parse(f.input), output: JSON.parse(f.output) })),
    objective: item.title, prompt_markdown: `${item.prompt}\n\n${item.formula}`,
  })))
  assert.equal(prepareManifests(rows, runtimes).length, 1236)
  assert.throws(() => prepareManifests(rows.slice(1), runtimes), /incomplete_catalog/)
  assert.throws(() => prepareManifests([...rows, rows[0]], runtimes), /catalog_identity_mismatch/)
  for (const change of [{ starter_code: 'changed' }, { entrypoint: 'other' }, { public_tests: [] }, { objective: 'changed' }, { prompt_markdown: 'changed' }]) {
    assert.throws(() => prepareManifests([{ ...rows[0], ...change }, ...rows.slice(1)], runtimes), /published_contract_mismatch/)
  }
  assert.throws(() => prepareManifests(rows, {}), /missing_runtime/)
})

test('every authored exercise/language has a supported execution contract and public bundle', () => {
  const bundles = buildBundles()
  assert.equal(bundles.length, exercises.length * 3)
  assert.equal(exercises.length, 412)
  for (const item of exercises) for (const language of ['python', 'javascript', 'rust']) {
    const bundle = buildBundle(item, language)
    assert.ok(bundle.expected_tests > 0)
    for (const current of bundle.grading_tests) {
      const execution = buildExecution(item.starter[language], bundle.runner_spec, current)
      assert.equal(current.visibility, 'public')
      assert.ok(execution.files[execution.result_file] === undefined)
      assert.ok(execution.run.length)
      assert.ok(!JSON.stringify(execution).includes('"expected"'))
    }
  }
})

test('trusted comparison rejects wrong values, shape, NaN, fake verdict, duplicate keys and oversized/deep output', () => {
  const bundle = buildBundle(exercise, 'javascript'), current = bundle.grading_tests[0], spec = bundle.runner_spec
  assert.equal(compareCase(message(current, current.expected), current, spec).passed, true)
  for (const raw of [message(current, null), message(current, {}), 'null', '[]', '{"passed":true}',
    JSON.stringify({ protocol: 1, case_id: 'wrong', value: current.expected }),
    `{"protocol":1,"case_id":${JSON.stringify(current.id)},"value":0,"value":${JSON.stringify(current.expected)}}`,
    '{"protocol":1,"case_id":"public-0","value":NaN}',
    message(current, Array.from({ length: 17000 }, () => 0)),
    message(current, Array.from({ length: 20 }).reduce(value => [value], 0)),
    ' '.repeat(65537)]) assert.equal(compareCase(raw, current, spec).passed, false, raw.slice(0, 100))
  assert.equal(compareCase(message(current, Infinity), current, spec).passed, false)
  assert.throws(() => runnerSpec(exercise, 'shell'), /unsupported_language/)
  assert.throws(() => buildExecution('x'.repeat(65537), spec, current), /source_limit/)
})

test('learner errors cannot claim infrastructure; trusted transport determines resource failures', () => {
  const bundle = buildBundle(exercise, 'javascript'), current = bundle.grading_tests[0]
  const run = error => finishResult(bundle, bundle.grading_tests.map(() => ({ error })))
  assert.equal(run('infrastructure').outcome, 'infrastructure')
  for (const error of ['compile_error', 'runtime_error', 'time_limit', 'memory_limit', 'output_limit']) {
    assert.equal(run(error).outcome, 'fail'); assert.equal(run(error).error, error)
  }
  assert.equal(compareCase(JSON.stringify({ protocol: 1, case_id: current.id, error: 'infrastructure' }), current, bundle.runner_spec).error, 'runtime_error')
  assert.throws(() => finishResult({ ...bundle, bundle_sha256: '0'.repeat(64) }, []), /bundle_digest_mismatch/)
})

function runPackage(item, language, source) {
  const bundle = buildBundle(item, language), current = bundle.grading_tests[0]
  const execution = buildExecution(source, bundle.runner_spec, current)
  const dir = mkdtempSync(join(tmpdir(), 'rustml-author-adapter-'))
  try {
    for (const [name, value] of Object.entries(execution.files)) writeFileSync(join(dir, name), value)
    let argv = language === 'javascript' ? [process.execPath, ...execution.run.slice(1)] :
      [process.env.PRACTICE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ...execution.run.slice(1)]
    if (language === 'javascript') {
      const compile = spawnSync(process.execPath, execution.compile.slice(1), { cwd: dir, encoding: 'utf8', timeout: 15000, maxBuffer: 65536 })
      if (compile.error) throw compile.error
      if (compile.status !== 0) return { passed: false, error: 'compile_error' }
    }
    if (language === 'rust') {
      const binary = join(dir, process.platform === 'win32' ? 'solution.exe' : 'solution')
      const compile = spawnSync(process.env.PRACTICE_RUSTC || 'rustc', [...execution.compile.slice(1, -1), binary], { cwd: dir, encoding: 'utf8', timeout: 60000, maxBuffer: 65536 })
      if (compile.error) throw compile.error
      if (compile.status !== 0) return { passed: false, error: 'compile_error' }
      argv = [binary]
    }
    const result = spawnSync(argv[0], argv.slice(1), { cwd: dir, encoding: 'utf8', timeout: 15000, maxBuffer: 65536 })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    return compareCase(readFileSync(join(dir, execution.result_file), 'utf8'), current, bundle.runner_spec)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('actual JavaScript adapter: authored reference passes, controlled wrong/syntax/throw solutions fail', () => {
  const spec = runnerSpec(exercise, 'javascript')
  assert.equal(runPackage(exercise, 'javascript', exercise.solution.javascript).passed, true)
  assert.equal(runPackage(exercise, 'javascript', `function ${spec.entrypoint}(){return null}`).passed, false)
  assert.equal(runPackage(exercise, 'javascript', `function ${spec.entrypoint}(`).error, 'compile_error')
  assert.equal(runPackage(exercise, 'javascript', `function ${spec.entrypoint}(){throw Error('controlled')}`).error, 'runtime_error')
  assert.equal(runPackage(exercise, 'javascript', `function ${spec.entrypoint}(){throw new SyntaxError('controlled')}`).error, 'runtime_error')
})

test('all public fixtures: authored JavaScript references match trusted comparator', () => {
  const cases = exercises.flatMap(item => item.fixtures.map((_, index) => ({ item, index })))
  const program = 'const values=[];\n' + cases.map(({ item, index }) => {
    const bundle = buildBundle(item, 'javascript'), current = bundle.grading_tests[index]
    return `{${item.solution.javascript}\nvalues.push(${bundle.runner_spec.entrypoint}(...${JSON.stringify(Object.values(current.input))}));}`
  }).join('\n') + '\nprocess.stdout.write(JSON.stringify(values));'
  const dir = mkdtempSync(join(tmpdir(), 'rustml-author-grader-js-'))
  try {
    const file = join(dir, 'references.mjs'); writeFileSync(file, program)
    const result = spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 })
    assert.equal(result.status, 0, result.stderr)
    const values = JSON.parse(result.stdout)
    assert.equal(values.length, cases.length)
    cases.forEach(({ item, index }, n) => {
      const bundle = buildBundle(item, 'javascript'), current = bundle.grading_tests[index]
      assert.equal(compareCase(message(current, values[n]), current, bundle.runner_spec).passed, true, item.id + '/' + index)
    })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('Python and Rust authored adapters (opt-in local toolchains)', { skip: process.env.PRACTICE_VERIFY_ALL_LANGUAGES !== '1' && process.env.PRACTICE_GRADER_ALL_LANGUAGES !== '1' }, () => {
  // Only fixed imported author code runs on the host. No draft/external source is accepted.
  assert.equal(runPackage(exercise, 'python', exercise.solution.python).passed, true)
  const pySpec = runnerSpec(exercise, 'python')
  assert.equal(runPackage(exercise, 'python', `def ${pySpec.entrypoint}(:`).error, 'compile_error')
  assert.equal(runPackage(exercise, 'python', `def ${pySpec.entrypoint}(*args):\n    raise SyntaxError('controlled')`).error, 'runtime_error')
  assert.equal(runPackage(exercise, 'rust', exercise.solution.rust).passed, true)
  const rsSpec = runnerSpec(exercise, 'rust')
  assert.equal(runPackage(exercise, 'rust', `pub fn ${rsSpec.entrypoint}()->u32{0}`).error, 'compile_error')
  const structured = exercises.find(item => item.starter.rust.includes('pub struct GraphResult'))
  assert.ok(structured)
  assert.equal(runPackage(structured, 'rust', structured.solution.rust).passed, true)
  const cases = exercises.flatMap(item => item.fixtures.map((_, index) => ({ item, index })))
  const dir = mkdtempSync(join(tmpdir(), 'rustml-author-grader-all-'))
  try {
    const py = join(dir, 'references.py')
    writeFileSync(py, 'import json\nvalues=[]\n' + cases.map(({ item, index }) => {
      const bundle = buildBundle(item, 'python'), current = bundle.grading_tests[index]
      return `scope={}\nexec(${JSON.stringify(item.solution.python)},scope)\nvalues.append(scope['${bundle.runner_spec.entrypoint}'](*json.loads(${JSON.stringify(JSON.stringify(Object.values(current.input)))})))`
    }).join('\n') + '\nprint(json.dumps(values,allow_nan=False))\n')
    const result = spawnSync(process.env.PRACTICE_PYTHON || 'python', ['-X', 'utf8', py], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    const pyValues = JSON.parse(result.stdout)
    const modules = exercises.map((item, index) => rustCaseProgram(item.solution.rust, runnerSpec(item, 'rust'), buildBundle(item, 'rust').grading_tests[0], 'author_' + index))
    const rs = join(dir, 'references.rs'), binary = join(dir, process.platform === 'win32' ? 'references.exe' : 'references')
    const expressions = cases.map(({ item, index }) => rustCaseProgram('', runnerSpec(item, 'rust'), buildBundle(item, 'rust').grading_tests[index], 'author_' + exercises.indexOf(item)).expression)
    writeFileSync(rs, modules[0].serialization + modules.map(program => program.module).join('\n') + '\nfn main(){\n' + expressions.map(expression => `println!("{}",${expression}.unwrap().json());`).join('\n') + '\n}')
    const compile = spawnSync(process.env.PRACTICE_RUSTC || 'rustc', ['--edition=2021', rs, '-o', binary], { encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 })
    assert.equal(compile.status, 0, compile.stderr || compile.error?.message)
    const rust = spawnSync(binary, [], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 })
    assert.equal(rust.status, 0, rust.stderr || rust.error?.message)
    const rustValues = rust.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line))
    assert.equal(pyValues.length, cases.length); assert.equal(rustValues.length, cases.length)
    cases.forEach(({ item, index }, n) => {
      const bundle = buildBundle(item, 'rust'), current = bundle.grading_tests[index]
      assert.equal(compareCase(message(current, pyValues[n]), current, bundle.runner_spec).passed, true, 'Python ' + item.id)
      assert.equal(compareCase(message(current, rustValues[n]), current, bundle.runner_spec).passed, true, 'Rust ' + item.id)
    })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
