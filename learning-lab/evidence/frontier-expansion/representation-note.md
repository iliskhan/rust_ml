# Representation frontier: проверенные механизмы

Снимок 2026-10-12 15:04 MSK (UTC+03:00). Авторитетный план остаётся в `PLAN.md` и `PROGRESS.md`; этот файл — доказательства отдельного делегированного блока, не второй план.

## Checkout и область

- Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`.
- Ветка: `codex/ui-ux-learning-lab`; базовый HEAD `035866823921e15656c87484f092d508dc194f6c`.
- Изменения блока — новые `learning-lab/src/representationFrontierMath.ts`, `learning-lab/src/RepresentationFrontierLabs.tsx`, `learning-lab/src/representation-frontier.css`, `learning-lab/tests/representationFrontierMath.test.ts` и этот note. В общем дереве одновременно работают другие агенты; общий Git checkpoint выполняет основной агент.
- UI экспортирует `ClipLab`, `InterpretabilityLab`, `JepaLab`, `KanLab` без props. CSS импортируется самим UI модулем. Rust-ядро не менялось.

## Реализовано

**CLIP.** Четыре бинарных паттерна 3×3 и четыре one-hot описания. Обучаемые проекторы 3×9 и 3×4, L2 normalization, symmetric row/column contrastive CE с temperature; все 39 градиентов аналитические. Матрица косинусных сходств, row softmax, retrieval в обе стороны, loss trajectory, расстояние от начальных параметров, optional Scene3D с настоящими компонентами R³ и численные embedding/weight таблицы. Учебный forward опыт меняет temperature при фиксированных весах. Нет language encoder и демонстрации zero-shot.

**Interpretability.** Реально обучаемый tied-W autoencoder 5→2→5 с ReLU reconstruction и weighted MSE на 160 воспроизводимых sparse samples. Частота признака меняет выборку и сбрасывает обучение. Показаны направления столбцов W в R², probe одного/двух признаков и ложные восстановления. Отдельный фиксированный tanh classifier 2→3→1 действительно заменяет выбранную hidden activation: ablation в clean проходе (zero/reference-mean baseline), patch clean activation в corrupted проходе. Δlogit/Δloss всегда имеют явно выбранный reference: clean для ablation, corrupted для patch. Это локальный causal intervention, не объявление attention причинным.

**JEPA.** 20 synthetic изображений из четырёх патчей с двумя признаками и постоянным bias input. Context видит только pooled признаки трёх visible patch. Двухмерный target кодирует masked patch, predictor читает context latent+one-hot target position. Context/predictor SGD использует stop-gradient target; затем target ← m·target+(1−m)·context,new. Есть loss к текущей движущейся цели, loss к исходной фиксированной цели и target variance по 20 изображениям при одной позиции mask. Zero initialization реально даёт loss=variance=0 и не обучается. Нет ViT, contextual target attention, pixel reconstruction или downstream оценки.

**KAN.** Одна additive KAN φx(x)+φy(y)+b: два обучаемых degree-1 B-spline ребра на фиксированных 3–15 узлах. Сравнение с аналитически обучаемой MLP 2→6→1 tanh; общие 49 train grid samples, 36 interleaved held-out samples, eta и MSE. Аддитивная цель sin(πx)+0.5y² и вариант +0.6xy. Узлы, edge functions, train/held-out, fixed-y slice, numerical query и optional настоящая f(x,y) Scene3D. Опыт mixed corner difference показывает архитектурное ограничение additive KAN. Нет grid adaptation, cubic splines, deeper KAN или утверждения общего превосходства.

## Проверено

Среда: Windows PowerShell, Node v24.19, executable `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

Из `learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/representationFrontierMath.test.ts
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit
```

- 12/12 numeric tests passed after the near-zero normalization correction below; typecheck passed on the shared tree at the initial snapshot.
- Independent central finite differences cover every parameter of both CLIP projectors, tied autoencoder, JEPA context/predictor, KAN and MLP. ReLU test points stay away from its kink.
- Hand-calculated checks: uniform CLIP loss ln(4); weighted zero-reconstruction MSE 0.2 for x=[1,0,0,0,0]; exact selected-unit readout deltas; linear B-spline boundary/interpolation/partition of unity; BCE stability.
- Training checks confirm parameter changes and improvement, rather than checking only predetermined chart arrays.
- CLIP default 200 SGD: CE 1.613637→0.005774, retrieval 4/4 both directions.
- Sparse default 600 SGD: weighted MSE 0.024999→0.008268.
- JEPA default 300 SGD: current MSE 0.095181→0.000080, target variance 0.575129. Fixed-initial-target MSE remains 0.065631, making target movement visible.
- KAN/MLP default 600 SGD, K=7: KAN train ≈4.15e−13 / held-out 0.009168; MLP train 0.051672 / held-out 0.027537. With interaction, KAN train remains >0.06 because additive edges cannot represent xy.
- Boundary sweeps of UI settings remained finite: CLIP eta=.15, tau=.05/1, 500 steps; sparse p=.05/1, 1000; JEPA mask=1/4, eta=.1, EMA=.9, 500; KAN K=15, eta=.14, both tasks, 1500. These are observed sweeps, not a proof for every setting.

## Условия и следующий шаг

Rendered desktop/mobile verification is pending and belongs to the main agent after route integration. Verify all four controls at 320px, optional CLIP/KAN scenes, table scrolling, keyboard Range/select controls, causal ablation/patch, JEPA collapsed initialization and KAN task change. Numeric tests and DOM/type checks do not establish rendered appearance.

No server, browser session, Git commit or push was started by this delegated agent. Main agent integrates routes/curriculum and records overall validation in `PLAN.md`/`PROGRESS.md`, then performs authorized commit/push.

Independent review correction (2026-10-12): CLIP normalization uses `max(1e−12, ||raw||)`. Below that floor the denominator is constant, so the derivative is `dUnit/1e−12`, without the usual projection subtraction. Corrected that branch and added a regression testing all 27 image-projector gradients for weights scaled by 1e−13, using central differences h=1e−17 and relative tolerance 1e−5. Representation suite now passes 12/12. Normal initialization/training uses the unchanged ordinary normalization derivative.

Durable lesson (2026-10-12): KAN with more knots can fit the train grid while leaving intermediate knots underdetermined. Observed K=15 held-out error was 0.163510 on the additive task despite ≈zero train MSE. UI explicitly invites comparing held-out rather than promising improvement with knot count. This finding is specific to the fixed grid and initial zero edge values; recheck if sampling, basis or regularization changes.
