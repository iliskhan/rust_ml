# Decision boundary UI handoff

2026-10-11, Europe/Moscow. Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`; started at `master`, `a52273cdf3e67593aadb3a69cbfe6086166dcd18`.

Implemented `src/DecisionBoundaryLesson.tsx` and scoped `src/decision-boundary.css`. Component contract: named export `DecisionBoundaryLesson({parameters:number[], step:number, onPause:()=>void, onTrain:(count:number)=>void})`. Uses shared parameters, `predictNetwork`, `decisionGrid`; no trainer or new dependencies. Threshold/probe, optional probability colors, and visited 3D camera survive updates and details closure. Scene is lazy-mounted on first opening and wrapped in `LearningActivity`.

2D map adapts its SVG viewbox to actual available width; labels stay 12px. Pointer click and keyboard ranges select the same exact-model probe. Four XOR target corner circles and exact-model table are distinguished from predictions. Surface intersection and 2D curve use identical boundary segments; sampled class colors are explicitly approximate. Equality selects class 1; all-threshold and no-contour messages are explicit.

Pending root checks: integrate into `Experiments.tsx`; run typecheck/build/numerical suite; inspect rendered desktop and 320/390px browser surfaces; verify training updates shared state, threshold/probe persistence, math links return correctly, 3D camera persistence and console. Renderer remains unchanged. Root coordinates all Git, plan/progress, build, and browser work.

Follow-up: scoped mobile table header and correctness labels raised from 10px to 11px; all font sizes declared in `decision-boundary.css` are now at least 11px. No other UI source changed. Independent readonly review found no substantial functional issues; rendered mobile checks remain with root.
