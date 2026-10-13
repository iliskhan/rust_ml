# Loading improvements — 2026-10-13, 20:40 MSK

Checkout: `C:/Users/lomaster/.codex/worktrees/f782/rust_ml`; branch
`codex/loading-recovery`; base `1e3ba80b9056489ec2aceacfdfaef383b52d8936`.
Scope/authoritative overall plan: parent chat `01a13055-8c77-7293-95a4-ac6e884eb382`,
root PLAN.md/PROGRESS.md (unchanged here). No merge, deploy, settings, migration,
contract/fixture/catalog changes. Grader remains disabled.

## Implemented and verified

1. App's Foundations, Experiments and CurriculumView use React.lazy. The explorer
   first mounts when a concept is visited; afterwards it remains mounted, even
   when closed, preserving the existing visited-concept state model. Visited
   lesson components also remain mounted. Named exports share their source chunk.
2. useLearningSync imports all-catalog inside the authenticated run's existing
   try/catch; it rechecks the owner after awaiting the import and before remote
   catalog/sync. Guest startup does not import this catalog. Auth provider stays
   eagerly mounted, keeping restoration and account lifecycle unchanged.
3. Each lesson and explorer has an error boundary around lazy descendants. A
   failed load exposes a reload button and a warning about transient experiment
   settings. Reload clears the failed React.lazy/module instance and fetches the
   current asset URLs. Saved drafts/progress are not cleared. Explorer loading/error
   remains a modal with close/Escape and focus restoration, including scrollable
   fallback content. There is no reload loop or automatic page refresh.

## Production measurement and import graph

Same checkout, locked dependencies, default env with no Supabase configuration,
production mode, base `/`, `pnpm build --manifest`, Node24.19.0, Vite7.3.7,
TypeScript5.9.3, React19.3.0. Manifest's entry plus recursive static JS imports:

| Metric | Before | Final after |
|---|---:|---:|
| Initial JS, bytes | 1,019,011 | 402,801 |
| Initial JS, gzip bytes | 304,572 | 124,830 |

Initial JS reduced 60.47% raw / 59.01% gzip. Source/bundle hashes, all emitted
chunks and their static/dynamic imports: loading.before.json / loading.after.json.
`loading-measure.mjs` reproduces the measurement from the build manifest.

Before: main.tsx → App → Foundations/Experiments (lessons, math/ui/3D helpers),
CurriculumView (curriculum), KnowledgeExplorer → ConceptLesson/SnapshotAnalysis,
and PracticeCloudProvider → useLearningSync → all-catalog → six authored catalogs
were reachable by static imports on the map route.
After: these lesson/explorer edges are dynamic; all-catalog is a 456,971 B /
134,269 B gzip dynamic/shared chunk loaded by authenticated sync or practice.
The entry still contains React, shell/navigation/search, concept metadata,
learning-context/math-snapshot helpers and cloud/auth/progress coordination.
No arbitrary manualChunks, dependency additions or warning suppression.
This measures the anonymous map entry, not a claim that authenticated startup or
deep-linked lessons avoid their required practice catalog.

## Commands/results

Working directory for frontend commands: `<checkout>/learning-lab`. In PowerShell:

```powershell
$env:PATH='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;'+$env:PATH
$node='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$pnpm='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.mjs'
& $node $pnpm install --frozen-lockfile
& $node $pnpm build --manifest
& $node evidence/improvements/loading-measure.mjs evidence/improvements/loading.after.json
$env:PRACTICE_VERIFY_ALL_LANGUAGES='1'
$env:PRACTICE_RUSTC='C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe'
$env:PRACTICE_PYTHON='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
& $node --test tests/*.test.ts
```

Final build includes `tsc --noEmit`: PASS. Full suite: 534/534 PASS, 0 skipped,
22,306.8814 ms. Related subset (section-loading, content-links, account-panel,
progress-sync, auth, cloud): 57/57 PASS; isolated new recovery test: 1/1 PASS.
`git diff --check`: PASS. Summary and final source hashes: loading.validation.json.

Environment recovery: restricted install returned registry EACCES, and esbuild
could not read ancestor directories; authorized owner execution passed. Bundled
Node must lead PATH to avoid Volta. First full test command mistakenly used
`RUSTC`, while tests read `PRACTICE_RUSTC`; it hit rustup component-download errors.
Final run uses the supported direct compiler variable above and passes. Existing
account-panel SSR test emits Vite dependency-scan shutdown warnings; assertions
pass. New test disables its unnecessary dependency discovery.

## Actual browser acceptance

Codex in-app Chromium, default desktop viewport (screenshots 1265×712; no resize),
own port6971, test-only production server `loading-server.mjs`:

- All 18 routes opened through UI; 17 rows in loading.routes.json plus the separately
  checked practice workspace. Visible headings and no recovery errors.
- `--fail-once=Foundations`: one 503, visible error UI, reload button restores neuron.
  A saved Python dot-product draft with `# loading recovery sentinel` remains exact
  after this reload and reopening practice.
- First concept open loads explorer; normal Escape restores focus to gradient link,
  closes modal and restores body overflow.
- `--fail-once=KnowledgeExplorer`: one 503, modal error UI; Escape restores the
  gradient-link focus; reopening error and clicking reload, then opening gradient,
  succeeds. Focus/overflow return verified again. Final screenshots saved.
- Full route checks and Foundations recovery ran before a final layout-only change
  that wrapped explorer fallback in its existing scrollable viewport classes;
  final build/typecheck/full suite and explorer failure/recovery ran after that change.

Screenshots: loading.error-desktop.png / loading.recovered-desktop.png,
loading.explorer-error-desktop.png / loading.explorer-recovered-desktop.png.
The test server's initial missing-favicon handler crashed by writing 404 after
headers; the test-only helper was fixed (read before writeHead) and acceptance rerun.

## Remaining parent acceptance

Mobile UI, authenticated hosted restore/sync, and integration with sibling cloud.ts
deadlines require parent verification after merge. No hosted account/secret used here.
Retry intentionally reloads: saved drafts/progress survive, but transient lesson
settings restart. No claim of preserving unsaved in-memory values on reload.
Parent merges this branch, updates root records, and publishes. Commit/push delivery
SHA and remote equality are reported by this chat after verification.
