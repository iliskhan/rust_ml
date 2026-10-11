# Проверка интеграции учебника

2026-10-11, Europe/Moscow. Основной checkout `C:/Users/lomaster/Desktop/dev/rust_ml`,
master поверх `9e6606aceacd9cf684996073499141b0fcd32028`, изменения незакоммичены.

Перенесены 42 файла из worktree3061 с проверкой SHA256; caches/build artifacts не копировались.
До переноса сохранены хеши 51 файла основного проекта. После интеграции 48 файлов остались
побайтно прежними, включая весь Rust/Cargo/tests; изменены только README, PROGRESS и CI.
12 файлов учебника (src/tests/lockfile) совпадают с источником.

## Команды и результаты

Среда: Windows, Rust1.87.0 MSVC, Node24.19.0, pnpm11.25.0. Путь `learning-lab/` ниже относится
к основному checkout, а не к прежнему worktree.

- `pnpm install --frozen-lockfile` в learning-lab: успешно, lockfile не изменён.
- `pnpm test`: 22 passed, 0 failed.
- `pnpm build`: tsc --noEmit и Vite прошли. JS index-BzADj5rC.js, 327279 bytes;
  CSS index-DkDGr1zI.css, 13749 bytes — совпадают с исходной сборкой.
- `cargo test --workspace --all-features --locked --offline`: 52 tests+5 doctests.
- Та же Cargo-команда с `--release`: 52 tests+5 doctests.
- `cargo fmt --all -- --check`, strict workspace Clippy all-targets/all-features,
  rustdoc с RUSTDOCFLAGS=-D warnings прошли.
- Корневой learn.cmd успешно запущен по абсолютному пути из соседнего каталога.
- Повторный learn.cmd на занятом5180 корректно вернул code1; первый сервер продолжил работу.
- `node_modules`, `.pnpm-store`, `dist` проверены через git check-ignore и исключены из Git.

Новый JS job CI проверяет frozen install, numerical tests и build. Удалённый GitHub CI не запускался.
Полные журналы этой локальной сессии — `integration-*.log` в каталоге
`C:/Users/lomaster/.codex/visualizations/2026/10/11/01a128c0-1c6b-71f1-a9b2-e8bdef9e4f32/work/`;
они не обязательны для запуска проекта. Команды выше воспроизводят проверку.

## Браузер основного проекта

Использован поддерживаемый Codex browser, `http://127.0.0.1:5180/`.
XOR: 30 нажатий «100 шагов», seed42/Adam eta=.03 → 4/4, BCE1.02e-4.
Transformer: Decoder-only, Q1 → causal weights [1;0;0].
При viewport320 document clientWidth=scrollWidth=305; осмотренный интерфейс читаем.
Ошибок/предупреждений консоли не наблюдалось. Временный viewport сброшен.

- [Обученная XOR](integration-xor.png)
- [Узкий экран](integration-mobile.png)
- [Наблюдения](integration-browser.json)

Математика и интерфейс учебника при переносе не менялись. Исходная более широкая приёмка
всех маршрутов и семейств сохранена в [VALIDATION.md](VALIDATION.md).

## Особенности проверочной среды

Стандартный node/pnpm в sandbox попадал в Volta shim без права создавать его каталог;
проверки использовали доступный bundled Node/pnpm через временный PATH. В repository
нет зависимости от абсолютного пути Codex. Пользовательскому запуску нужны Node24+ и pnpm11.25.0 в PATH.

Sandbox заблокировал registry fetch; установка прошла после разрешённого сетевого запуска.
Первый запуск dev в sandbox завершился Access denied у esbuild при чтении родительского каталога;
тот же launcher с разрешённым запуском вне sandbox работает. Проверки безопасности lockfile не отключались.
Во время браузерного теста использован --no-open, чтобы осмотр выполнялся в поддерживаемом браузере;
обычный запуск использует --open. Исходный сервер worktree на5177 не останавливался.
