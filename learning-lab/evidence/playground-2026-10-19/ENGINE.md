# Playground engine handoff — 2026-10-19

Authoritative task: `PLAN.md`, Playground extension, B12/B13, R02/R04/R05, U04/U06/U08.
Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, master at
`4730658c5b5b96f04660748027efa83744ce3a74`. Working tree contains coordinated engine,
UI and lesson-agent changes; no commit created by engine agent.

Implemented in `boundaryNetworkMath.ts`, `boundaryExperiment.ts`,
`boundaryDiagnosticsMath.ts`, new `boundaryEvaluation.ts` and
`tests/boundary-playground.test.ts`:

- `BoundarySettings.data?: {version:2,trainSize:24|48|96,labelNoise:number}`.
  Clean balanced nested subsets preserve original 96-point pool/order; validation
  stays exactly legacy. Corruption uses separate RNG, `Math.round(size*noise)` labels.
- `BoundaryConfig.features?: 'raw'|'radial'`, default legacy/raw. Radial input is
  `(u,v,u²+v²)`; dimensions, gradients, trace, diagnostics and domain bounds agree.
- Workspace writes v3 only for new fields/receipts; legacy v1/v2 continue exactly.
- Frozen final model includes settings, params, step, threshold, selection criterion.
  Test is 32 clean examples from its own stream; explicit seeded-stream collisions
  with selected model's train/validation are rejected. Dataset identity is
  `boundary-final-v1:<kind>:<testSeed>`, independent of model/threshold.
- `evaluationReceipts` persist across replacement/import through
  `mergeBoundaryEvaluationReceipts(workspace, previousWorkspaceOrReceipts)`.
  A previously viewed dataset sets `reused:true`; no implicit metrics reveal occurs.
  Guarded writer also merges stored receipts. Root must retain receipts in memory,
  pass them to encode/save, merge imports, and preserve finalResult on reset.

API: `freezeBoundaryEvaluation(experiment,threshold,criterion,testSeed,receipts=[])`,
`revealBoundaryEvaluation(result)`, `makeBoundaryFinalTest(kind,testSeed)`.
`encodeBoundaryWorkspace(current,slots,receipts=[])`;
`BoundaryStorageWriter.save(current,slots,isCurrent=()=>true,receipts=[])`.

Verification (bundled Node 24 runtime, same checkout + engine edits):

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test learning-lab/tests/boundary-network.test.ts learning-lab/tests/boundary-experiment.test.ts learning-lab/tests/boundary-minibatch.test.ts learning-lab/tests/boundary-legacy-export.test.ts learning-lab/tests/boundaryDiagnostics.test.ts learning-lab/tests/boundary-playground.test.ts
```

44/44 passed. Covers exact real v1 import/next step, legacy batch96 summation,
all optimizers, radial finite differences at 0–3 mixed hidden layers, nested data,
v3 malformed input/continuation, frozen evaluation and receipts after stale imports.
Film tests/fixtures were not changed; root runs full suite/build/browser checks.
`node node_modules/typescript/bin/tsc --noEmit` in `learning-lab` passed after
explicitly typing the feature-name decoder union; this check includes the shared
UI files present at that point.

Numerical prototype: circles, train24, 20% label corruption (5 labels),
16 tanh +16 tanh, Adam .02, full batch24, init/batch seed equal data seed.
At λ0, all three fixed seeds give lower train BCE but higher validation BCE:

| Seed | train @100 | train @1000 | validation @100 | validation @1000 | validation @1000 λ=.01 |
|---|---|---|---|---|---|
| 7 | .0771602851 | .0002263082 | 1.4247695635 | 3.6078174569 | .4531949080 |
| 42 | .1373929870 | .0002909047 | 1.2768697032 | 2.4186591912 | .3526594144 |
| 1337 | .1120259488 | .0006969190 | .5824077624 | 1.9275870039 | .3596028015 |

This is a reproducible demonstration, not a general L2 improvement guarantee.
The fixed λ0 observation is now a numerical regression test. Prototype command:

```powershell
@'
import {createBoundaryExperiment,advanceBoundaryExperiment} from './learning-lab/src/boundaryExperiment.ts';
import {boundaryMetrics} from './learning-lab/src/boundaryNetworkMath.ts';
for (const seed of [7,42,1337]) for (const lambda of [0,.001,.01]) {
let e=createBoundaryExperiment({kind:'circles',seed,config:{layers:[{width:16,activation:'tanh'},{width:16,activation:'tanh'}]},method:'adam',lr:.02,data:{version:2,trainSize:24,labelNoise:.2},lambda});
const points=[];
for(const target of [100,300,1000,2000]) {e=advanceBoundaryExperiment(e,target-e.optimizer.step);points.push({step:target,train:e.history.at(-1).train,validation:e.history.at(-1).validation,correct:boundaryMetrics(e.optimizer.params,e.settings.config,e.dataset.validation).correct});}
console.log(JSON.stringify({seed,lambda,points,error:e.error}));
}
'@ | & 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module
```

Integration, final full checks/film replay and browser evidence are recorded in
[VALIDATION.md](VALIDATION.md). This note preserves the engine API and numerical commands;
the authoritative release status remains in root PLAN.md/PROGRESS.md.
