# Проверка интеграции Auth и прогресса — 13 октября 2026

Публикация интеграции `46235ac` подтверждена: CI38381096306 и Pages38381096383
SUCCESS; публичный desktop/mobile без overflow/duplicateIDs и ошибок консоли.
Сводка — [hosted-publication.json](hosted-publication.json).
Свежий local PGlite13.10 после правила eol=lf — [12403 PASS](sql-recheck.json).
Его исходная команда указана в текущем PROGRESS.md; embedded command report
содержит default output path, а фактический task output затем был перенесён.
Hosted Supabase по-прежнему не подключён: браузер исходного чата сохраняет site block.

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, база
`e45127662c7a5e0c61d30d40d5a3ea4d439876ab` плюс изменения этой задачи.
Проверенные исходники/тесты записаны в `source-hashes.json`. Rust-ядро и SQL migrations
не менялись. Auth автора уже pushed в `dc98372`/`e451276`; Progress автора до
остановки прошёл targeted21/21 и входит в общую проверенную интеграцию.

## Команды и результаты

Node24.19.0, Python3.12.14, direct rustc1.87.0; Windows, cwd `learning-lab`.

```powershell
$env:PRACTICE_VERIFY_ALL_LANGUAGES='1'
$env:PRACTICE_PYTHON='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PRACTICE_RUSTC='C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe'
node --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
$env:VITE_BASE_PATH='/rust_ml/'
node node_modules/vite/bin/vite.js build --configLoader native --outDir ../work/practice-integration/pages/rust_ml
```

- Full suite **464/464 PASS, 0 skipped**: [лог](full-tests.log).
- Typecheck exit0; build exit0: [лог сборки](build-pages.log).
- Сохранилось предупреждение о main chunk >500kB. Ошибкой сборки оно не является.
- Final independent review только чтением не нашёл нового подтверждённого дефекта;
  browser и full suite выполнял основной чат.

## Настоящий браузер

IAB production `127.0.0.1:5233/rust_ml/#practice`, без cloud config:
desktop1280×720, mobile390×844 и 320×568. Ширины документа1265,375,305 соответственно;
горизонтального переполнения и duplicate IDs не найдено. Code → reload → «Продолжить»
сохранил черновик и фокус редактора. В прежних уроках neuron/network практика
отрендерилась (4/5 panels в наблюдённом DOM), console error/warn=[].
Это проверка production-артефакта до публикации, не hosted deployment.

Снимки: [desktop](production-desktop.png), [mobile390](production-mobile.png),
[320px](production-320.png).

Локальный интеграционный стенд `5231/5232` использует реальные компоненты и клиент,
но синтетические аккаунты/токены/серверные числа. Все запросы идут в local HTTP fixture;
он не обращается к Supabase и не записывает пароли в логи.

- Guest/A/B и Python/Rust дают отдельные черновики/счётчики.
- Открытие transfer A из прогресса выбрало точные exercise/language; Enter перевёл
  фокус в textarea. Код, hint и quiz receipt восстановились после reload.
- Обычный cloud save оставил languageChanges=0; явная кнопка Rust дала1.
- Foreground `/user` задержан, same-tab запрос обновил token, старый `/user` получил401:
  refreshes=1/stale401=1, account A и код сохранились.
- Повреждённая Auth-запись показала ошибку, локальный экран сохранился, повторный
  вход работал без reload. Безопасный getter устранил наблюдённое исключение
  React dev prop logger; строгие authenticated reads остаются обязательными.
- Обнуление синтетических токенов fixture вернуло форму входа.
- Mobile390×844 без overflow; [desktop fixture](desktop-progress.png),
  [mobile fixture](mobile-progress.png). Это не доказательство hosted Auth/RLS.

Для повторения: запустить `node tests/fixtures/practice-integration.mjs`, затем Vite
с `VITE_SUPABASE_URL=http://127.0.0.1:5232`, key `sb_publishable_fixture`, порт5231.
Открыть `/tests/fixtures/practice-integration.html`. Все данные одноразовые;
страница стенда не включается в production entry.

## Незавершённый hosted шаг

Dashboard Supabase Free `phnjcmahugetofwvnbto` прочитан: Healthy/Frankfurt;
practice_* отсутствуют, Email/Confirm email включены, GitHub disabled,
Site URL localhost:3000, redirect list пуст. Publishable key прочитан без раскрытия
secret key. Выполнение первой миграции отклонено auto-review, запрошено прямое
разрешение. Позднее владелец прямо разрешил подключение в исходном чате, который
взял hosted migrations/settings. База, Auth settings и Pages variables этим чатом
не изменены; удалённые изменения не выполняются параллельно.
Настоящие JWT/OAuth/PostgREST/RLS/CAS двух аккаунтов и доставка писем остаются
обязательными. Grading/isolated runner отключён и в эту реализацию не входит.
