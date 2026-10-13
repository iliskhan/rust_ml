# Rust ReLU / seeded MLP: implementation evidence

Рабочий каталог: `C:/Users/lomaster/Desktop/dev/rust_ml`, исходная ревизия
`430cdc5` ветки `master`; результаты ниже получены на изменённом рабочем дереве
2026-10-14. Основной план остаётся в `PLAN.md` / `PROGRESS.md`.

Реализованы `Variable::relu()` (CPU, shape-preserving, f32/f64, empty/scalar;
производная 0 при signed zero, NaN в forward и local derivative; IEEE gradient
multiplication) и `Linear::with_seed(in,out,seed)` (фиксированный SplitMix64,
53 старших бита на sample, He uniform, zero bias). Разные seeds нужны для
независимого начального состояния слоёв. Существующий `Linear::new` сохранён.
Обновление параметров требует освободить все графы и aliases.

В `examples/xor_mlp.rs` непосредственно составлены Linear/ReLU/Linear/MSE/SGD;
дополнительных зависимостей, Module/Sequential и optimizer state нет. Выход —
raw score, порог 0.5, не вероятность. За 2000 full-batch шагов SGD (eta=0.05,
seeds 42/43, f64, архитектура 2→8→1) MSE `0.706369 → 1.220e-23`, accuracy 4/4.
Это проверенный фиксированный пример, не обещание сходимости для любого seed.

## Проверка

Окружение Windows, MSVC stable Rust 1.87. Команды выполнялись из указанного
checkout с:

```powershell
$env:RUSTUP_TOOLCHAIN='stable'
$env:RUSTC='C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe'
$env:RUSTDOC='C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustdoc.exe'
$env:PATH='C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin;' + $env:PATH
& C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustfmt.exe --edition 2021 rustml-autograd/src/ops.rs rustml-autograd/src/graph.rs rustml-autograd/tests/activations.rs rustml-nn/src/lib.rs rustml-nn/tests/nonlinear.rs examples/xor_mlp.rs
& C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/cargo.exe test -p rustml-autograd --test activations -p rustml-nn --test nonlinear
& C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/cargo.exe run -p rustml-nn --example xor_mlp
& C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/cargo.exe clippy -p rustml-autograd -p rustml-nn --all-targets -- -D warnings
```

Scoped rustfmt, 5 activation tests + 3 nonlinear tests, example и strict Clippy
PASS. Последний test/Clippy запуск выполнен после pin первых четырёх samples
seed42. Проверены конечные разности ReLU и всех 9 параметров составной сети
вдали от kink (tolerance 1e-9), точная повторяемость XOR training, CPU gating
даже для empty/untracked unavailable CPU, saved-value ownership, NaN/inf,
shape/dtype/zero/overflow edges. Read-only review не нашёл существенных проблем;
уточнение dtype rounding в документации внесено.

Ранее обнаруженная ошибка компиляции теста (неуказанный dtype у untracked
Variable) устранена явным `Variable::<f32>`; последующие проверки PASS.

Родительская приёмка: workspace debug/release — 77 tests + 8 doctests в каждом
режиме, strict Clippy/rustdoc, fmt и все шесть examples PASS. После pin4samples
повторно проверены nonlinear release и workspacefmt. README содержит исполняемый
пример через facade; CI запускает XOR на Windows/Linux. Команды соответствуют
перечисленным выше, с workspace/all-features/locked/offline и release для второго
прогона. Полный список с exitCode0: `work/comprehensive-improvements/mlp-rust-results.json`.
Git-доставка и CI фиксируются в корневом PROGRESS.md. Подзадача Git не меняла.
