# Local data preservation — 2026-10-13

## Scope and checkout

- Worktree: `C:/Users/lomaster/.codex/worktrees/01db/rust_ml`.
- Branch: `codex/local-data-preservation`; clean starting HEAD: `1e3ba80b9056489ec2aceacfdfaef383b52d8936`.
- Parent owns `PLAN.md` / `PROGRESS.md`, integration and deploy. This checkpoint records only the delegated local-data scope.
- Changed production files: `BoundaryPlayground.tsx`, `boundaryExperiment.ts`, `practice/local-progress.ts`. No runtime pins, grader, contracts, migrations, external settings or credentials changed.

## Changes and verified mechanisms

1. Boundary autosave uses a Web Lock around reading the exact prior bytes and writing the new validated record. `BoundaryStorageWriter` updates its expected bytes only after a successful write. A stale reader is refused instead of replacing another reader's current experiment or A/B. Its in-memory experiment remains usable/exportable. Explicit retry also refuses a stale baseline; export and reload are the recovery path. Cancelled effect callbacks skip queued writes.
2. Account primary language reads its validated learning-language receipt first, falling back to the existing primary key only when no receipt exists. Account set/merge writes one receipt under the existing language lock. A quota error cannot change one half of a pair; no rollback or deletion is needed. Guest primary keys keep their existing behavior. Old keys remain untouched. Checked callers: `PracticePanel`, local learning progress readers, `syncLearningProgress`, preference collection/merge tests.
3. Boundary import captures a workspace version and checks it after `file.text()`. Layout-effect changes/unmount invalidate it when experiment, threshold, probe or slots change. User controls remain available; late import cannot replace newer work. File size/schema/numeric validation remains intact.

## Validation

Environment: Windows, Node `24.19.0`, pnpm `11.25.0`, TypeScript `5.9.3`, Vite `7.3.7`.
All commands below ran in this worktree's `learning-lab`, on the production patch in this branch.
Node path: `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
pnpm path: `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs`.

- `node pnpm.mjs install --frozen-lockfile`: PASS; lockfile unchanged. Initial sandbox registry EACCES resolved with tool escalation.
- `$env:PRACTICE_VERIFY_ALL_LANGUAGES='1'; node --test tests/*.test.ts`: **538/538 PASS**, 0 failed/skipped. Includes all Python/Rust/JavaScript reference checks and five new deterministic local-data tests. Log is untracked/ignored at `work/local-data-test.log`.
- `node pnpm.mjs build`: PASS (`tsc --noEmit && vite build`, 177 transformed modules). Existing large-chunk warning remains. Sandbox esbuild denied config/dependency directory reads; escalated run passed without changing settings.
- `git diff --check`: PASS.
- New deterministic tests: shared serial lock and two Boundary writers; simultaneous writes; stale retry; own queued saves; quota recovery; cancellation; foreign-key/slot preservation; no-Web-Lock refusal; delayed file resolution with invalidated generation; two language stores, targeted receipt quota, legacy fallback and owner/release isolation.

## Real browser evidence

Own dev server: `node pnpm.mjs dev --port 6974 --strictPort`. Browser CUA, standard desktop viewport; no global resize.
Fixture: [local-data-browser.html](../../tests/local-data-browser.html). Two actual app iframes share one origin/storage, with toolbar controls for showing each reader and delaying/resolving `File.text()` in B. Overrides exist only in the test fixture. No production test hooks.

Observed sequence:

1. Both readers restored step 0, threshold 0.6 and slots A/B step 0. A performed `1 шаг` (step 1). B changed threshold to 0.7.
2. B displayed `В другой вкладке сохранён новый опыт или A/B` and stopped autosave. Fixture inspection read saved threshold **0.6**, A **0**, B **0** from both frames. B's new threshold **0.7** remained in memory.
3. Fixture started a delayed valid file import in B with imported threshold **0.9**. B performed `1 шаг` while the read waited, then the fixture completed the read.
4. B displayed `Импорт отменён ... Опыт изменился во время чтения файла`. Actual rendered B still showed **step 1**, **96 examples**, threshold **0.7**. Both failures were visible; controls remained usable.

Screenshot: [local-data-browser.jpg](local-data-browser.jpg), captured after this sequence. Browser work finished; viewport released to parent at 20:52 Moscow time.

Limits: desktop checked here; parent owns combined 390/320 mobile verification. CAS intentionally reports conflicts, without automatic merging of divergent experiments. Mixed old/new application versions are not protected from old code that does not take the lock. Root merge, root validation and deploy are outside this delegated branch. No remote services contacted by the browser test.

## Handoff

Implementation and delegated checks complete. Next action for parent: integrate the pushed branch, run affected combined checks/mobile inspection and deploy under the parent plan. Commit/push identity is reported in the final chat response; this file belongs to that commit.
