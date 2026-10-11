# Сохранность Rust и прежней математики после добавления 3D

Проверка: 2026-10-11, Europe/Moscow (UTC+03:00). Общий план остаётся в `../../PLAN.md` и `../../PROGRESS.md`; эта заметка хранит доказательства регрессии.

## Результат

- **43/43** SHA256 Rust workspace, examples, manifests/lockfile/toolchain, `.cursor/rules`, CI и корневого `.gitignore` совпадают с `../evidence/advanced-baseline-hashes.json`.
- **29/29** защищённых файлов веб-части совпадают с `../evidence/advanced-validated-hashes.json`: девять математических модулей, navigation/context, `ui.tsx`, `main.tsx`, все 12 прежних test-файлов, package/lock/workspace/tsconfig.
- **14/14** прежних math/navigation/UI/test SHA дополнительно совпадают с историческим `advanced-baseline-hashes.json`. Этот набор пересекается с предыдущим; его нельзя прибавлять как 14 новых файлов.
- Полная сверка 52 путей `advanced-validated-hashes.json`: 44 совпадают, 8 ожидаемых файлов интерфейса изменены: `App.tsx`, `ArchitectureLesson.tsx`, `ConceptLesson.tsx`, `DiffusionCourse.tsx`, `Experiments.tsx`, `Foundations.tsx`, `TransformerCourse.tsx`, `VAECourse.tsx`. Это изменения текущей 3D-интеграции, отдельно от защищённой математики.
- **Rust fmt, Clippy, debug/release tests, docs и четыре примера прошли.** В каждом профиле 52 unit/integration tests и 5 doctests, ни одного сбоя.

Точные SHA и последний timestamp: `../evidence/3d-protected-hashes.json`. SHA повторно проверены после Rust-команд. Набор файлов внутри пяти Rust crates и `examples/` также совпадает с baseline.

## Checkout и окружение

`C:/Users/lomaster/Desktop/dev/rust_ml`, HEAD `refs/heads/master`, ревизия **35942ec6c2d43628b8517f35efaf5c13a28034b5**. HEAD/ref прочитаны напрямую из `.git`; Git-команды, index и refs не менялись. Веб-интеграция выполнялась параллельно. Проверка относится к SHA указанного снимка, а не автоматически к будущему commit.

Исторический baseline JSON записан на `009a58bb525e437da7a1cd5f9dfd73b70fcffcb5`; validated snapshot — `2026-10-11T09:27:46.7547931+03:00`. Они дают эталон содержимого соответствующих защищённых файлов, а текущая рабочая ревизия зафиксирована отдельно.

Windows, PowerShell `login: false`; `rustc 1.87.0 (17067e9ac 2025-05-09)`, Cargo `1.87.0 (99624be96 2025-05-06)`, host `x86_64-pc-windows-msvc`, LLVM 20.1.1. В текущем процессе `CARGO_HOME` не задан. Локального `.cargo/config.toml` нет. Использован существующий `target`, `cargo clean` не выполнялся. Подробности: `../evidence/3d-rust-environment.log`.

Для каждой команды:

```powershell
$env:PATH = 'C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin;' + $env:PATH
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
$env:RUSTC = 'C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe'
$env:RUSTDOC = 'C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustdoc.exe'
```

## Команды и наблюдённые результаты

Все команды выполнялись последовательно из корня проекта. Полные stdout/stderr, начало, exit code и измеренное время сохранены в `../evidence/3d-rust-*.log`.

| Команда | Результат | Время | Лог |
| --- | --- | --- | --- |
| `cargo fmt --all -- --check` | exit 0, diff отсутствует | 1,338 с | `3d-rust-fmt.log` |
| `cargo test --workspace --all-features --locked --offline` | 52 + 5 doctests passed | 4,287 с | `3d-rust-debug.log` |
| `cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings` | exit 0 | 0,240 с | `3d-rust-clippy.log` |
| `cargo test --workspace --all-features --release --locked --offline` | 52 + 5 doctests passed | 2,361 с | `3d-rust-release.log` |
| `$env:RUSTDOCFLAGS='-D warnings'; cargo doc --workspace --all-features --no-deps --locked --offline` | exit 0 | 0,153 с | `3d-rust-doc.log` |
| `cargo run -p rustml-tensor --example basic_tensor_ops --locked --offline` | exit 0 | 0,595 с | `3d-rust-example-basic.log` |
| `cargo run -p rustml-autograd --example autograd_test --locked --offline` | exit 0 | 0,648 с | `3d-rust-example-autograd.log` |
| `cargo run -p rustml-autograd --example milestone_check --locked --offline` | exit 0 | 0,895 с | `3d-rust-example-milestone.log` |
| `cargo run -p rustml-autograd --example scalar_demo --locked --offline` | exit 0 | 0,847 с | `3d-rust-example-scalar.log` |

`cargo fmt` не принимает `--locked --offline`; остальные команды запускались с обоими флагами. `RUSTDOCFLAGS=-D warnings` был установлен перед docs и оставался в окружении следующих четырёх запусков примеров.

В первом проходе PowerShell-формирование массива лога свернуло stdout/stderr в строку `System.Object[]`. Проверки уже были успешны, но такое сохранение не является полным доказательством. Запись исправлена, команды повторены один раз, проверено фактическое содержимое новых логов; таблица приводит результаты повторного прохода, кроме не затронутого fmt.

## Границы проверки и следующий шаг

Исходники не изменялись; записаны только эта заметка, SHA-снимок и Rust-логи, Cargo обновлял свои штатные build artifacts. Сервисы и браузер не использовались. Web tests/build не повторялись: root уже сообщил 128 passed и успешную сборку, и отдельно проверяет desktop/mobile. Этот отчёт сам по себе не подтверждает внешний вид или полноту 3D-UX.

Основному агенту завершить browser-проверку и общий checkpoint. Перед commit достаточно повторить SHA защищённых путей; Rust-команды повторяются, если изменятся Rust-код, manifests/lockfile/toolchain либо окружение.
