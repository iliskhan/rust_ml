# Проверка сохранности Rust и старых лабораторий

Снимок: 2026-10-11 08:58:33 Europe/Moscow (UTC+03:00).
Основной план и общий статус остаются в `../../PLAN.md` и `../../PROGRESS.md`.

## Результат

Защищённые файлы сохранены: **52/52 SHA256 совпадают**, расхождений нет.
Это 33 файла Rust workspace, manifest/lockfile/toolchain и примеров, а также
19 файлов старых учебных модулей и их тестов. Проверены baseline
`../evidence/advanced-baseline-hashes.json` и отсутствие Git diff этих путей
относительно `009a58bb525e437da7a1cd5f9dfd73b70fcffcb5`.

Rust: fmt, Clippy без предупреждений, debug/release тесты, документация без
предупреждений и четыре примера CI прошли. Старые веб-тесты: **47 passed, 0 failed**.

Проверка выполнена в `C:/Users/lomaster/Desktop/dev/rust_ml`, ветка `master`,
HEAD `009a58bb525e437da7a1cd5f9dfd73b70fcffcb5`. В момент проверки шла параллельная
интеграция новых уроков, поэтому checkout был dirty. Изменения App, ConceptLesson,
concepts, curriculum, CurriculumView, curriculum tests и корневых документов
ожидаемы и не входили в список неизменяемых файлов. Новые веб-модули, общий
build/test и внешний вид проверяет основной агент. Этот отчёт не подтверждает
визуальную регрессию и не относится к будущему commit без повторной сверки файлов.

## Окружение и команды

Windows, PowerShell, `login: false`. Установленный toolchain
`stable-x86_64-pc-windows-msvc` фактически содержит Rust/Cargo **1.87.0**:
`rustc 1.87.0 (17067e9ac 2025-05-09)`, Cargo `1.87.0 (99624be96 2025-05-06)`,
host `x86_64-pc-windows-msvc`, LLVM 20.1.1. Версия совпадает с `rust-toolchain.toml`.
Локального `.cargo/config.toml` и пользовательского Cargo config не обнаружено.
Существующий `CARGO_HOME=C:\Users\lomaster\.cargo`, существующие build artifacts
в `target`; clean не выполнялся. Все команды с зависимостями — locked/offline.

Каждая Rust-команда запускалась с этим префиксом:

```powershell
$env:PATH = 'C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin;' + $env:PATH
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
$env:RUSTC = 'C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe'
$env:RUSTDOC = 'C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustdoc.exe'
```

| Команда | Результат | Измеренное время |
| --- | --- | --- |
| `cargo fmt --all -- --check` | exit 0, diff отсутствует | 2,887 с вместе с выводом версий |
| `cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings` | exit 0 | 1,082 с |
| `cargo test --workspace --all-features --locked --offline` | 52 unit/integration + 5 doctests passed; 0 failed | 4,267 с |
| `cargo test --workspace --all-features --release --locked --offline` | 52 unit/integration + 5 doctests passed; 0 failed | 4,773 с |
| `$env:RUSTDOCFLAGS = '-D warnings'; cargo doc --workspace --all-features --no-deps --locked --offline` | exit 0, docs для 5 crates | 0,212 с |
| `cargo run -p rustml-tensor --example basic_tensor_ops --locked --offline` | exit 0 | 0,917 с |
| `cargo run -p rustml-autograd --example autograd_test --locked --offline` | exit 0 | 0,776 с |
| `cargo run -p rustml-autograd --example milestone_check --locked --offline` | exit 0 | 0,772 с |
| `cargo run -p rustml-autograd --example scalar_demo --locked --offline` | exit 0 | 0,838 с |

Состав 52 тестов в каждом профиле: public API 1, autograd unit 2, gradients 10,
core 8, tensor 31. Пять doctests: facade 2, autograd 2, tensor 1.
`cargo fmt` не принимает Cargo resolution flags `--locked --offline`; остальные
перечисленные Cargo-команды выполнены с обоими флагами.

Из `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --version
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/math.test.ts tests/conceptMath.test.ts tests/architectures.test.ts tests/transformerMath.test.ts tests/learning-navigation.test.ts
```

Node **v24.19.0**, 47 tests passed, 0 failed/cancelled/skipped/todo;
встроенный test-runner сообщил **356,431 мс** (внешняя команда 0,677 с).

## Доказательство сохранности

SHA256 самого baseline JSON:
`6381AC97D868F31CB85DBE9BF3634DC433EF90E6E1B7F93305AA28C8E09D22FA`.
SHA256 агрегата списка защищённых `path + ' ' + sha256`, отсортированного
PowerShell `Sort-Object path`, разделённого LF и кодированного UTF-8 без BOM,
**одинаков для baseline и текущего checkout**:
`7B8AFAE7098A9A079B24A1AFBB2632BDE35A10EB61663D8D86FC8AACAE9FEEBD`.

Проверка снимка выполнена в 08:55:50 и повторно в 08:58:33 MSK. Точный выбор
файлов и проверка для повторного выполнения из корня:

```powershell
$baseline = Get-Content -LiteralPath 'learning-lab/evidence/advanced-baseline-hashes.json' -Raw | ConvertFrom-Json
$protected = @($baseline.files | Where-Object {
  $_.path -match '^(rustml(?:-[^/]+)?/|examples/|Cargo\.(toml|lock)$|rust-toolchain\.toml$)' -or
  $_.path -match '^learning-lab/(src/(math\.ts|conceptMath\.ts|architectures\.ts|transformerMath\.ts|learning-navigation\.ts|learning-context\.tsx|ui\.tsx|ArchitectureLesson\.tsx|Experiments\.tsx|Foundations\.tsx|KnowledgeExplorer\.tsx|TransformerCourse\.tsx|main\.tsx|transformer-course\.css)|tests/(math|conceptMath|architectures|transformerMath|learning-navigation)\.test\.ts)$'
} | Sort-Object path)
$mismatches = @($protected | Where-Object {
  (Get-FileHash -LiteralPath $_.path -Algorithm SHA256).Hash -ne $_.sha256
})
$protected.Count # 52
$mismatches.Count # 0
git -c safe.directory=C:/Users/lomaster/Desktop/dev/rust_ml diff --exit-code 009a58bb525e437da7a1cd5f9dfd73b70fcffcb5 -- $protected.path
```

Первый Git read столкнулся с `dubious ownership` из-за sandbox-пользователя.
Повторные чтения успешно выполнены с одноразовым `-c safe.directory=...`;
глобальная конфигурация Git, index и refs не менялись. Исходники не редактировались;
агент создал только эту заметку и стандартные Cargo build artifacts. Сервисы
5180/5177 и браузер не использовались.

## Следующий шаг

Основному агенту завершить общую интеграцию, build/test и браузерную проверку.
Перед commit повторить короткую SHA/Git сверку выше; повтор Rust-тестов требуется
при изменении защищённого Rust-кода/manifest/lockfile/toolchain либо окружения.
