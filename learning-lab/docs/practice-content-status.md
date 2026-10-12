# Авторская практика: проверенный базовый каталог

Checkpoint 2026-10-12 17:17 Europe/Moscow. Общий план — PLAN.md / PROGRESS.md.
Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, исходная revision `212a6ef4d3baebb83b41bd20a53a069f4358a2e4`.

`src/practice/catalog.ts`, release `2026-10-v1`: **26 тем, 82 упражнения, 146 открытых fixtures**.
Это все **23 исходных units** маршрутов neuron/loss/backprop/optimizers/network/transformer
плюс три дополнительные микротемы: `concept.dot-product`, ReLU и softmax.
У каждого исходного unit есть guided, transfer A, transfer B; составные навыки получают
дополнительные отдельные фрагменты. Dot product расположен в lessonId=`math`.

| Блок | Проверяемые фрагменты |
|---|---|
| Neuron (3 units) | Affine и bias, ReLU/sigmoid/tanh и derivatives, batch Linear и оси |
| Loss (2) | Mean MSE/gradient, stable logit BCE/gradient, duplicate batch, class symmetry |
| Backprop (2) | Shared graph base/A/B, independent central differences, забытая ветвь |
| Optimizers (3) | SGD, momentum state, Adam moments/correction/epsilon scaling |
| Network (5) | Train-only fit/transform + group split, logistic batch + weight-only L2, tanh features, XOR forward/backward17params + update, confusion/threshold |
| Transformer (8) | Lookup + positional contribution; scaled masked attention; MHA/GQA/MQA mapping/storage + grouped V mixing; RoPE + sinusoidal; LN/RMSNorm/residual backward + scalar FFN; self/causal/cross; KV append + full last-query mix; sampling/CDF + teacher forcing + head gradients |
| Три anchors | Softmax/shared-node/SGD: guided + A/B, формулы, крайние случаи, hints, explanations, starters/solutions трёх языков |

Каждое упражнение имеет конкретный quiz, формулу, границы входа, подсказки, объяснение,
открытые numerical fixtures и отдельные starters/solutions Python/JavaScript/Rust.
В первом блоке plain Rust std/f64 и предоставленные внутри snippets InputError/structs;
JSON transport и compiler infrastructure не являются задачей ученика.

Проверено на Node `v24.19.0`, Python `3.10.11`, Rust `1.87.0`:

- `node --test tests/practice-catalog.test.ts`: **15/15**, включая opt-in audit всех языков.
  Все 146 fixtures реально исполнены доверенными авторскими solutions Python/JS/Rust.
- Независимые pairwise-ratio softmax oracle, shift/permutation/underflow и mutations;
  forward finite differences для трёх shared graphs; coordinate SGD и quadratic growth.
- Независимые finite differences MSE/BCE gradients, всех17 XOR params, logistic batch+L2,
  multiclass output head; mask/normalization/RoPE/cache/sampling properties.
- Rust sampling tie сравнивает +0 и −0 как равные числа; при равенстве выбирает меньшийID.
- Первичный `tsc --noEmit` прошёл на раннем блоке. Общий final typecheck/build проводит root;
  эта запись не переносит старое typecheck evidence на поздние изменения.

Полная воспроизводимая проверка из `learning-lab` в PowerShell:

```powershell
$env:PRACTICE_VERIFY_ALL_LANGUAGES='1'
$env:PRACTICE_RUSTC='C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe'
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/practice-catalog.test.ts
```

Обычный rustc shim пытался sync toolchain и упирался в `.rustup/tmp`; прямой установленный
compiler выдал `rustc1.87.0` и скомпилировал все references. Этот обход актуален, пока
локальный pinned shim не работает. Windows command-line limit обойдён временными `.mjs`/
`.py`/`.rs`: процессы читают файлы, а не длинные `-e`/`-c` arguments.

**Границы доказательств.** Код ученика не исполняется в браузере или tests. Harness берёт
только импортированные authored solutions, никогда drafts/user submissions. Открытая
ручная self-check и локальный quiz не дают server pass/mastery. Это public formative
контент, а не production private bundles или доказательство самостоятельности.
A/B проверяют новые контексты и named subskills; их server requirement equivalence
потребует отдельного авторского mapping и private bundles, кроме подробно спроектированных
anchors. Reference fixtures не доказывают педагогическую эффективность.

Attention проверяет одну query-строку; grouped mix принимает уже нормированные weights;
FFN/residual — scalar/diagonal fragments; cache append требует invalidation от вызывающего
кода при изменении prefix/weights; XOR проверяет example gradients/step, а не качество
обученной сети. Эти ограничения указаны в условиях, а не скрыты за названием unit.

Этот модуль закрыт для интеграции root. Architectures, advanced/frontiers/generation/GNN/RL
и математические concepts дописываются отдельными модулями; **83 units / 51 concepts этим
файлом не объявляются полностью готовыми**. Следующее действие: root aggregate/imports,
общие typecheck/build/regression и настоящая desktop/mobile UI проверка.
