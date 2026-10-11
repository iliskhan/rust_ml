# Attention geometry / action practice checkpoint

2026-10-11, checkout `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, baseline `fd19da780d8bb3800853894d8f3af6c2b97c40c5`, branch `codex/ui-ux-learning-lab`.

Implemented, awaiting rendered validation after shared preview build:
- Optional 2D Q/K on attention step 2; optional V mixture on steps 4/5. Uses existing trace, query, selected key, mask and T. No edits to transformerMath, snapshot logic or arithmetic ordering.
- Square real-coordinate domain, numeric axis ticks/labels, Q/K arrows, V points, permitted convex hull and Y arrow. Forbidden keys dashed/crossed and explicit in numeric table. Native buttons synchronize selected key with existing detailed calculation/snapshot.
- Local action task starts only on click; documented settings reset selects query/key 0, disables causal/padding, T=1, step 5. Keeps X/W/scale. Requires actual causal exclusion, weights [1,0,0], Y=V0. Feedback is invalidated when experiment settings change.
- Four independent tests: triangle mixture (.5,1), mask zero contribution, zero/negative domains, actual challenge failure/success.

Verified commands (Node 24.19, existing runtime PATH, `learning-lab` cwd):
- `node --test tests/attention-geometry.test.ts`: 4/4 PASS.
- `pnpm typecheck`: PASS.

Browser: opened own background CUA tab at `http://127.0.0.1:5183`, navigated Transformer → Attention. Server currently serves baseline dist (new task absent), so no claim of rendered verification yet. Root notified; next step is shared build followed by desktop/mobile visual and task interactions. Do not start/stop shared server.

Files: `learning-lab/src/AttentionGeometry.tsx`, `attention-geometry.css`, `attentionGeometryMath.ts`, edits to `TransformerCourse.tsx`, `learning-lab/tests/attention-geometry.test.ts`. Root owns PLAN/PROGRESS/commit/push.
