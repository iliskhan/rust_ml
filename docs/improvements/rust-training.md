# Первая обучаемая модель RustML

Checkpoint: 2026-10-13, Europe/Moscow (UTC+3). Авторитетный объём — этап 2
корневого `PLAN.md`; этот файл сохраняет доказательства отдельного worktree.
Корневые `PLAN.md`, `PROGRESS.md` и README обновляет родительский чат при объединении.

## Checkout и реализация

- Worktree: `C:/Users/lomaster/.codex/worktrees/305f/rust_ml`.
- Ветка: `codex/rust-training`; исходный HEAD `1e3ba80b9056489ec2aceacfdfaef383b52d8936`.
- Добавлены `Variable::matmul` (строго 2D), `Variable::mean` (все элементы),
  вычитание Variable с существующим broadcasting и корректными редукциями градиента.
- `rustml-nn`: `Linear`, `mse_loss`, `Sgd`; фасад экспортирует их и модуль `nn`.
- `Linear`: вход `[batch, in_features]`, веса `[in_features, out_features]`,
  bias `[out_features]`; нулевая либо явно переданная инициализация.
- MSE требует точного совпадения форм и непустого результата. Градиенты
  prediction и target поддерживаются.
- SGD использует накопленный autograd-градиент и `Variable::data_mut`.
  Сначала освобождаются loss, prediction и остальные ссылки графа/клоны;
  каждый успешный шаг очищает градиент обновлённого параметра.
- `examples/linear_regression.rs` — детерминированное full-batch обучение
  `y = 2x + 1`, без ручного вычисления градиентов и новых внешних зависимостей.
  Cargo.lock изменён только связями между существующими workspace crates.

## Проверено перед commit

Windows x86_64 MSVC; direct stable Rust 1.87.0. Для команд Cargo установлены
`RUSTC` и `RUSTDOC` в executables
`C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/`;
для fmt/Clippy этот каталог поставлен первым в PATH.
Все команды выполнялись из указанного worktree перед implementation commit
`4f355bfb8fdb4abd56e2e6a9ca37843ebb144872`; после проверок код не изменялся.

- `cargo run -p rustml-nn --example linear_regression --offline` — PASS:
  100 шагов, loss `9.000000 -> 4.150e-20`, `w=2.0000000000`, `b=0.9999999998`.
- `cargo test --workspace --all-features --locked --offline` — PASS:
  69 unit/integration tests и 7 doctests; 0 failures/ignored.
- `cargo test --workspace --all-features --release --locked --offline` — PASS:
  те же 69 unit/integration tests и 7 doctests; 0 failures/ignored.
- `cargo fmt --all -- --check` — PASS.
- `cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings` — PASS.
- `RUSTDOCFLAGS="-D warnings" cargo doc --workspace --all-features --no-deps --locked --offline` — PASS.
- `cargo run -p rustml-tensor --example basic_tensor_ops --locked --offline` — PASS.
- `cargo run -p rustml-autograd --example autograd_test --locked --offline` — PASS.
- `cargo run -p rustml-autograd --example milestone_check --locked --offline` — PASS.
- `cargo run -p rustml-autograd --example scalar_demo --locked --offline` — PASS.
- `cargo run -p rustml-nn --example linear_regression --locked --offline` — PASS,
  результат совпал с первым запуском; новых изменений кода после проверок нет.
- `git diff --check` — PASS.
- Отдельные 10 autograd tests проверяют f64 finite differences прямоугольного
  matmul и составного MSE, все формы градиентов, shared operands/branches,
  repeated backward, empty axes, ошибки формы/устройства и запрет мутаций.
- 6 nn tests проверяют аналитическую рекурсию каждого из 100 SGD шагов,
  отсутствие stale graph/градиентов, f32 multi-feature Linear, настоящую MSE,
  shape errors и сохранение значения/градиента при rejected SGD.
- 2 facade tests, включая реальный training step. Существующие integer overflow
  регрессии и shared graph safety прошли без изменений Rust-ядра/tensor.

## Ограничения и следующий шаг

Все локальные проверки PASS. Implementation commit
`4f355bfb8fdb4abd56e2e6a9ca37843ebb144872` отправлен обычным
`git push -u origin codex/rust-training`; `git rev-parse HEAD` и
`git ls-remote --heads origin codex/rust-training` совпали, worktree чистый.
Этот последующий checkpoint меняет только документацию; итоговый SHA ветки
сообщается в финальном ответе после его commit/push и повторной сверки.
Родительскому чату нужно проверить/объединить ветку и обновить
общие PLAN/PROGRESS/README: старое описание этапа 2 там намеренно не изменялось.
SGD обновляет один параметр за вызов; цикл по параметрам не транзакционный.
Нет batched/general-broadcast matmul, reductions по выбранным осям, random init,
Module/MLP, momentum или serialization. Mean суммирует по существующим IEEE 754
правилам tensor ops; overflow/NaN могут распространяться в loss, SGD отвергает
нефинитный результат обновления. Только CPU; Windows validation не заменяет Linux CI.
Merge/deploy, frontend, grader, Supabase/Vercel, published IDs/runtime pins не затронуты.
