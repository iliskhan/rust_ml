# Boundary visual experiments — checkpoint

Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`.
Base revision: `646605b97c505b262cd10ab521df46d648232330`.
Implemented 2026-10-12; parent coordinates final validation, docs, commit and push.

## Implemented

- `BoundaryDiagnostics.tsx` + `boundary-diagnostics.css`: linked current-model train/validation confusion map, matrix, precision/recall, explicit undefined denominators, four distinct point shapes plus text, keyboard point selection and parent probe link. Shared threshold control pauses parent training. A prediction/action/result experiment changes that same threshold and records all counts and unchanged BCE at the same weights.
- Explicitly captured independent model/train snapshot, two selectable real weight coordinates, 9×9 loss surface (81 evaluations) with batch BCE / train BCE / train BCE+L2 heights. Other parameters are fixed, batches come from the existing deterministic batch API. Numerical nine-point surface alternative and exact selected-point losses/two gradients are available. No training loop or projected full-optimizer trajectory added.
- L2 experiment switches lambda, keeping model and batch fixed. Batch experiment moves to the next actual batch, keeping weights fixed. Each produces historical numerical results with conditions. Bias exclusion delegates to existing `boundaryL2`.
- `BoundaryPlayground.tsx` integrates the component only. Existing math, optimizer, storage versions and A/B APIs remain unchanged. Diagnostic snapshot is explicitly temporary and not saved in JSON.

## Verified

Command from `learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/boundaryDiagnostics.test.ts
```

7/7 tests passed: hand confusion fixture; equality/threshold endpoints and undefined metrics; exact weight-index/bias layout; finite differences for both coordinates in linear/hidden nets and all three loss modes; equality to existing L2 objective; deep snapshot independence and 81-cell grid purity; same batch indices as trainer including short final batch and invariant full-train gradients.

## Remaining parent checks

- Run shared typecheck/build/full tests once all writers finish.
- Browser: open both new Boundary details, test thresholds and matrix-cell emphasis, point keyboard selection, prediction/result cards; capture loss surface, switch weight coordinates/height/batch/L2, inspect numerical fallback on desktop and mobile.
- Confirm overall save/import/A-B/pause behavior under integration checks.
- Update authoritative `PLAN.md` / `PROGRESS.md`, commit, push and verify remote revision.

Intentional bound: fixed ±1 range and 9×9 surface, with exact numerical evaluation of the probe. Surface computes only after explicit snapshot capture and memoizes on frozen snapshot/pair/batch/lambda; `memo(BoundaryLossSlice)` also skips render reconstruction during main training frames. No claim that adjacent batches always have different gradients or that precision always rises with threshold.
