# Diffusion chapter handoff

Updated: 2026-10-11 09:00 +03:00, Europe/Moscow. Subtask of the existing Learning Lab extension; root agent owns integration and rendered UI checks.

## Scope and checkout
- Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`; initial HEAD `9e6606aceacd9cf684996073499141b0fcd32028`, latest observed HEAD `009a58bb525e437da7a1cd5f9dfd73b70fcffcb5` after root's checkpoint of prior work. All six diffusion files remain untracked at 09:00; this subagent has not touched Git index/config/commits.
- Writable scope: only `src/DiffusionCourse.tsx`, `src/diffusionMath.ts`, `src/diffusion-course.css`, `tests/diffusionMath.test.ts`, `research/diffusion.md`, this handoff (all under `learning-lab`). No shared files, Rust, Git edits or service restarts.
- Requirements: full Russian interactive explanation, real learned denoiser, nested ConceptLink exploration, no APIs/dependencies, state survives section switches, explicit model limits.

## Verified stage
- Implemented pure 1D DDPM math: 64-step linear/cosine schedules, seeded normal noise, real Markov forward path, exact mixture density/conditional-mean reference, 146-parameter tanh MLP, analytic gradients, bounded immutable Adam, DDPM and deterministic DDIM samplers, histogram with explicit outside-domain mass.
- Data are an equally weighted Gaussian mixture at −1.5/+1.5 with component standard deviation 0.28. Cosine beta cap is intentionally 0.25 (not the original paper's 0.999); UI/research must disclose it. Initial trainable skip predicts approximately x_t.
- Implemented named `DiffusionCourse`, five mounted/hidden sections, scoped CSS and mobile select. Timers are cleaned up and training pauses on inactive course or another section. Distribution calculations run only in the active relevant section. Source/limits disclosures and exercises present.
- `research/diffusion.md` records seven primary sources, equation references, deliberate adaptations, numerical observations, implementation/description boundaries and verification.
- Latest commands from `learning-lab`, PowerShell `login:false`, runtime PATH prepended with bundled Node/fallback bin: `node --test tests/diffusionMath.test.ts` → **12 passed, 0 failed, 565 ms**; `pnpm typecheck` → **PASS**. Includes all 146 finite-difference gradients, independent hand-calculated MLP forward, manual posterior arithmetic, t endpoints, score identity, DDIM distinction, immutable deterministic training, trained generation of both modes for BOTH schedules, independent reverse noise and histogram accounting.
- At 2 000 updates (lr=.003), fixed validation MSE: linear 1.0496949314571253 → 0.32428440591671986; cosine 1.4471604736919428 → 0.42498358001744957. Of 256 DDPM samples (seed 120), 240/232 lie within .6 of either ±1.5 versus 8/9 before training. These are seeded observations, not guarantees of monotone loss or image quality.
- `git rev-parse` needs per-command `-c safe.directory=C:/Users/lomaster/Desktop/dev/rust_ml`; no Git configuration was changed.

## Remaining / next action
- Implementation and numerical checks complete. Root must finish integration of named `DiffusionCourse`, register concept IDs, run combined regressions/build, and inspect actual desktop/mobile rendering. No rendered UI pass has been claimed by this subagent.
- Useful CUA flow: section 2 → «Обучить ещё 2 000» → section 4 → switch DDPM/DDIM → change reverse seed (DDIM unchanged) → change initial noise (trajectory changes, separate histogram unchanged) → section 5 (explicit analytic CFG). Check training pause and state restoration on leaving/reopening section, schedule reset, and nested ConceptLink return.
- Shared concept IDs: `gaussian`, `kl-divergence`, `conditional-expectation`, `noise-schedule`, `score-function`, `markov-chain`; existing `probability`, `variance`, `loss`, `backpropagation`, `learning-rate`, `gradient` are also referenced.
- All CSS selectors are rooted at `.diffusion-course`. No legacy modules/shared styles changed. No service stopped or restarted.
