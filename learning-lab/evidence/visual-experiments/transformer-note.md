# Transformer visual experiments — delegated implementation

2026-10-12. Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, supplied base `646605b97c505b262cd10ab521df46d648232330`, branch `codex/ui-ux-learning-lab`.

Implemented three requested experiences, integrated into existing block/head lessons:

- `NormalizationGeometryLab.tsx`: independent 3-feature base (editable components -2…2, initial `[-1,.5,2]`), shift/scale/positive epsilon, real x₁/x₂/x₃ coordinates, equal ranges -6…6 in both LN/RMS scenes, sum-zero plane and limiting sphere √3, actual norm/radius numeric alternative. Uses existing `normalizationTrace`; no affine gamma/beta training (γ=1, β=0). Prediction restores the fixed base, sets a concrete fixed shift scenario and records both norms before/after.
- `HeadGeometryLab.tsx`: receives current parent's W,b, mask, rate and frozen h. Every SGD trigger calls parent `train(1)`. Two selectable logit planes, one probe's full six logits/probabilities, 20×20 argmax preview and numeric tables; h coordinates are real, not PCA. Pair equality is explicitly distinguished from multiclass boundary. Probe prediction performs one current SGD with a historical numeric comparison and does not promise each position improves.
- `ResidualGradientLab.tsx`: actual scalar F(h)=a·tanh(h), ordinary vs residual forward states, local derivatives, reverse steps including incoming gradient and identity/branch contributions, a visual numeric fork into both paths and back to their sum, full numeric table and derivative chart. Includes exact cancellation scenario h=0,a=-1 showing residual gradient zero; fixed positive-weight prediction experiment makes no general guarantee.

All experiences keep their settings in existing retained lesson components. Their bodies wait for first expansion; expensive scenes/charts mount only while open and learning activity is active. No dependencies, servers, browser actions, Git actions or shared document edits were performed by this delegate.

Verification observed in this checkout:

`C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test tests/transformer-visual-experiments.test.ts` (cwd `learning-lab`): 3 passed, 0 failed, 2026-10-12.

Tests independently check affine/softmax numbers, live head consistency after SGD, pairwise tie with a third-class winner, zero-sum LN/epsilon radius/shift behavior and both stack derivatives against centered finite differences including cancellation.

TypeScript `transpileModule` syntax check for the three new `.tsx` labs also passed. This is a syntax check, not a whole-project typecheck or rendered verification. A read-only `git diff --check` attempt failed with `Not a git repository`; `.git` points to the main checkout's external metadata, so the parent must perform Git verification in its permitted environment.

Requested follow-up completed before browser review: editable base controls and fixed-scenario reset, visual backward forks, and persistent head prediction card at the 499→500 SGD limit (action disabled through parent's optional `PredictionExperiment.disabled`). Own numerical tests passed again (3/3), and three TSX syntax checks passed. No further code edits until the parent requests them.

Remaining parent verification: TypeScript/build + full suite, actual desktop/mobile rendered UI, keyboard controls, root PLAN/PROGRESS checkpoint and commit/push with remote equality. The parent has updated Scene3D's equal-scale caption; this delegate did not modify Scene3D.
