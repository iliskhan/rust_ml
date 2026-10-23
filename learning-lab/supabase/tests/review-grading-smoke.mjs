import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareManifests } from '../../grader/publication.mjs'
import { exercises, canonical, sha256 } from '../../grader/bundles.mjs'
import { createSupervisor, runtimeKey } from '../../grader/supervisor.mjs'
import { buildExecution } from '../../grader/execution.mjs'
import { recoverQueue } from '../../grader/recovery.mjs'

// Same explicit PGlite loader as the other SQL smoke scripts; no hosted DB access.
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href)
const db = new PGlite()
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`)
for (const file of ['202610120001_practice.sql','202610120002_practice_rpc.sql','202610120003_anchor_content.sql',
  '202610130004_progress_sync.sql','202610130005_learning_language.sql','202610130006_grading_manifests.sql',
  '202610160007_continuous_grading.sql','202610230008_review_grading.sql']) {
  await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
}
const q = async (sql, values = []) => (await db.query(sql, values)).rows[0]
const role = async name => db.exec(name ? `reset role; set role ${name}` : 'reset role')
const rows = (await db.query(`select v.id,v.language,v.starter_code,v.entrypoint,v.public_tests,e.exercise_key,e.objective,e.prompt_markdown
  from public.practice_variants v join public.practice_exercises e on e.id=v.exercise_id
  join public.practice_releases r on r.id=v.release_id where r.status='published'`)).rows
const digest = 'sha256:' + 'a'.repeat(64)
const runtimeByLanguage = Object.fromEntries(['javascript','python','rust'].map(language => [language, { digest }]))
const manifests = prepareManifests(rows, runtimeByLanguage, 2)
assert.equal(manifests.length, 1236)
let executions = 0, checks = 1
for (const name of ['anon','authenticated','service_role','practice_api']) {
  await role(name)
  await assert.rejects(db.query('select private.practice_execution_contract($1)', [randomUUID()]), /permission denied/)
  checks++
}
await role()
await db.exec("update private.practice_grading_settings set enabled=true,billing_period_start=now()-interval '1 day',billing_period_end='infinity'")
for (const key of ['unit.backprop.shared.guided','unit.optimizer.sgd.guided','unit.architecture.bptt.transfer-a']) {
  for (const language of ['javascript','python','rust']) {
    const row = rows.find(row => row.exercise_key === key && row.language === language)
    const manifest = manifests.find(manifest => manifest.variant_id === row.id)
    const item = exercises.find(item => item.id === key)
    const versions = language === 'rust' ? [manifest] : [
      { ...manifest, edition: 1, runner_spec: Object.fromEntries(Object.entries(manifest.runner_spec).filter(([key]) => key !== 'parameters')) }, manifest]
    for (const edition of versions) {
      const hash = sha256(canonical({ grading_tests: edition.grading_tests, runner_spec: edition.runner_spec }))
      await db.query(`insert into private.practice_grading_manifests(variant_id,edition,manifest_sha256,runtime_digest,expected_tests,grading_tests,runner_spec)
        values($1,$2,$3,$4,$5,$6,$7)`, [row.id,edition.edition,hash,digest,edition.expected_tests,JSON.stringify(edition.grading_tests),JSON.stringify(edition.runner_spec)])
      const user = randomUUID()
      await db.query('insert into auth.users values($1)', [user])
      await role('authenticated')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
      const session = (await q('select public.practice_start($1) as id', [row.id])).id
      await q('select public.practice_save_draft($1,0,$2,$3)', [session,item.solution[language],'editor'])
      await role('practice_api')
      const attempt = (await q('select private.submit_practice($1,$2,$3,1) as id', [user,session,randomUUID()])).id
      await role('practice_worker')
      let index = 0
      const run = createSupervisor({ db, runtimes: { [runtimeKey(language,digest)]: {
        image: 'trusted/runtime@' + digest, language, caseTimeoutMs: 30000,
      } }, provider: { async executeCase({ execution }) {
        // PostgreSQL has already reordered JSONB objects in this real claim.
        assert.deepEqual(execution, buildExecution(item.solution[language], manifest.runner_spec, manifest.grading_tests[index]))
        const current = manifest.grading_tests[index++]
        executions++
        return { raw: JSON.stringify({ protocol: 1, case_id: current.id, value: current.expected }) }
      }, async stopAttempt() {} } })
      assert.equal((await run(attempt)).status, 'graded')
      await role()
      assert.equal((await q('select bundle_sha256 from public.practice_attempts where id=$1', [attempt])).bundle_sha256, hash)
      await assert.rejects(db.query('update private.practice_grading_manifests set edition=99 where variant_id=$1', [row.id]), /grading_manifest_is_immutable/)
      checks += 3
    }
  }
}
// A crashed third lease is discovered and terminalized without another VM/reservation.
const variant = rows.find(row => row.exercise_key === 'unit.backprop.shared.guided' && row.language === 'javascript')
const user = randomUUID()
await db.query('insert into auth.users values($1)', [user])
await role('authenticated')
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
const session = (await q('select public.practice_start($1) as id', [variant.id])).id
await role('practice_api')
const abandoned = (await q('select private.submit_practice($1,$2,$3,0) as id', [user,session,randomUUID()])).id
for (let generation = 1; generation <= 3; generation++) {
  await role('practice_worker')
  const job = (await q('select private.claim_practice_job($1) as job', [abandoned])).job
  assert.equal(job.lease_generation, generation)
  await role()
  await db.query("update private.practice_jobs set lease_until=now()-interval '1 second',claim_deadline_at=now()-interval '1 second' where id=$1", [job.job_id])
}
const before = await q('select reserved_creations,reserved_cpu_ms from private.practice_grading_settings')
await role('practice_worker')
const runExactAttempt = createSupervisor({ db, runtimes: {}, provider: {
  executeCase: () => assert.fail('exhausted job must not launch'), stopAttempt: async () => {},
} })
assert.equal((await recoverQueue({ db,runExactAttempt,deadline:Date.now()+1000 })).attempted, 1)
await role()
assert.equal((await q('select status from public.practice_attempts where id=$1', [abandoned])).status, 'error')
assert.deepEqual(await q('select reserved_creations,reserved_cpu_ms from private.practice_grading_settings'), before)
checks += 6
await db.close()
console.log(JSON.stringify({ status: 'passed', checks, publishedManifests: manifests.length, executionCases: executions,
  scope: 'local PostgreSQL WASM: publication, JSONB, claim, execution, legacy editions and helper ACLs; provider mocked' }))
