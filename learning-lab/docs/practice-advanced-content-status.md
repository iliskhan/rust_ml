# Практика advanced/frontiers: проверенный авторский checkpoint

2026-10-12 17:11 Europe/Moscow. Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`,
branch `codex/practice-implementation`, base `212a6ef4d3baebb83b41bd20a53a069f4358a2e4`.
Проверено рабочее дерево до общего commit; общий план и итоговые проверки ведёт root
в существующих PLAN.md / PROGRESS.md.

`src/practice/advanced-catalog.ts` экспортирует `advancedPracticeTopics`: все 26
exact inventory IDs маршрутов #advanced (10) и #frontiers (16). Это 78 упражнений
(guided + transfer A/B), 234 языковых вариантов и 234 открытых fixtures.
В каждом упражнении runnable `solve(values)` на Python/JavaScript/Rust, конкретная
формула, контракт входов/выходов, подсказки, trace, quiz и явная граница subskill.
Каждая тройка переносит одну функцию в разные контексты; решения одинаковы,
публичные три fixtures упорядочены начиная с соответствующего variant case.

Покрытие означает небольшую практику после всех 26 тем, а не полную реализацию
исходных моделей. Например, full-transformer проверяет локальный residual+tanh
backward, ViT — фиксированную patchification, MLA — shared rank-1 content projection,
MoE — top-2 одного token с capacity 0/1, training units — конкретные gradients head,
router, impulse decay и scalar epsilon predictor. Полные QKV/norm/backward,
encoder training, batching/routing, reverse sampling и качество моделей не заявлены.
Остальные ограничения перечислены в каждом prompt/explanation. CLIP получает
готовые similarities, masked CE получает готовые target probabilities.

Команда из checkout:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test learning-lab/tests/practice-advanced.test.ts
```

Результат **11/11 PASS**, ~3.3 секунды. Harness выполняет только импортированные
доверенные авторские solutions; learner drafts не принимает и не исполняет.
Все 234 public fixtures выполнены на каждом из JS/Python/Rust: 702 сравнений.
Python — bundled `dependencies/python/python.exe`; Rust — прямой установленный
`C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe`
с `--edition=2021` (pinned rustup shim может пытаться писать в запрещённый tmp).
Переменные `PRACTICE_PYTHON` / `PRACTICE_RUSTC` переопределяют runtime paths.

Проверены независимые finite differences девяти локальных gradient fragments;
cross-language parity этих probes; existing source mechanisms для BPE, SiLU,
patch order, addressed memory, speculative correction и spline basis; online
attention vs independent exponential-ratio oracle и перестановки; EGNN перенос,
поворот, отражение и conserved center; volume homogeneous split; CLIP symmetric
permutation, masked reduction, quantization tie/clipping, stop-target/freeze,
display clipping и importance-balance. Все три языка отвергают malformed inputs
и constrained domain violations. MoE numeric tie включает signed zero: Rust
`partial_cmp` сохраняет ту же numeric equality, что Python/JS; `total_cmp` различал
бы +0 и −0 и потому был заменён до checkpoint.

Общий `tsc --noEmit` на совместном дереве на 17:09 показал только sibling diagnostic
`tests/practice-generative.test.ts:237:99` (unknown → number | number[]); в этих
advanced файлах diagnostics не было. Root повторяет общий tsc после исправления.
Browser UI, aggregation и commit/push — вне writable scope этого subagent, выполняет root.

Эта практика formative: quiz/fixtures не дают серверный pass/mastery. Runner и
private assessment не добавлены; grading остаётся отключённым.
