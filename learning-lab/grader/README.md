# Проверка открытых примеров в изолированном исполнителе

Актуально 2026-10-16, 15:17:10 UTC: SQL007 применена в production
в 15:16:22 UTC. Приём включён (`enabled=true`), конец окна — `infinity`;
продление по дате больше не требуется. Накопленные резервы при переходе
сохранены: 24 создания и 720000 CPU-ms, без обнуления. Лимиты остаются
1000 созданий и 1 CPU-час: закрытый журнал учитывает каждый claim и retry
до execution deadline + 31 день. Legacy-резерв действует 31 день + 210 секунд
после перехода. Это консервативный бюджет приложения, не счётчик биллинга
провайдера. Новое развёртывание Vercel и смена runtime не требовались.
Read-only проверка прежнего trusted snapshot
`snap_It6mVj2cPSWSKzj0OCukNncSEHDK` в 15:17:10 UTC вернула
`expiresAt=null`: у него нет даты истечения. [Приёмка непрерывного режима](../evidence/grading/continuous-2026-10-16/README.md).

`execution.mjs` создаёт файлы/argv, `vercel-provider.mjs` запускает их в отдельной
Vercel Sandbox и завершает созданную среду. Код ученика на хосте не исполняется.
Авторские тесты
локально исполняют только фиксированные импортированные reference solutions
и контролируемые маленькие ошибки из этого test file.

## Доверенный поток

1. `buildBundle(exercise, language)` в `bundles.mjs` формирует private manifest
   из опубликованного author catalog. Все cases явно `visibility: public`.
   Это серверный зачёт открытых примеров; hidden coverage не заявляется.
2. `bundle_sha256 = SHA256(canonical({grading_tests,runner_spec}))`.
   Canonicalization рекурсивно сортирует ключи JSON objects, сохраняет порядок
   arrays, использует JSON.stringify для primitives. Publication и supervisor
   должны использовать этот же алгоритм и утверждённый manifest, а не hash
   старого author-help bundle. Не обещается универсальная RFC 8785 реализация.
3. Claim возвращает pinned source, runtime digest, bundle hash, tests/spec.
   Supervisor проверяет manifest digest и allowlist runtime digest до запуска.
4. Для каждого case `buildExecution(source, runner_spec, case)` возвращает
   `{files, compile?, run, result_file}`. В sandbox попадают source, текущий
   input, opaque case ID и public adapter. Expected values и final verdict
   отсутствуют. JS/Python вызывают функцию с positional input values; Rust
   использует сигнатуру/поля structs из starter. Неизвестный contract отклоняется.
5. Provider пишет только фиксированные filenames в новый workspace, выполняет
   fixed argv (SDK использует фиксированную sudo/bash-обёртку), ограничивает
   resources/время/вывод и читает только фиксированный result.json. После
   остановки процессов learner-пользователя проверяются symlink/type/size.
   Nonzero compile -> `compile_error`, nonzero run -> `runtime_error`;
   Доказанное превышение вывода -> `output_limit`; неоднозначные timeout/OOM
   остаются инфраструктурной ошибкой. Ошибка provision,
   provider/DB/lease -> `infrastructure`. Guest не выбирает transport category.
6. `finishResult(bundle, caseResults)` вне learner sandbox проверяет digest,
   количество cases и bounded values/protocol/ID/shape/numeric tolerance.
   `caseResults` имеет форму `[{raw: string}|{error: trustedCategory}]`.
   Return `{outcome,passed,error,feedback}` соответствует SQL finish arguments.
   Supervisor передаёт DB fencing token/generation и прекращает работу при
   утрате lease. Только provider/supervisor может заявлять infrastructure.

Guest `result.json` считается недоверенным. Его marker может только сообщить
ошибку; `pass`, counts, expected, test selection и неизвестные поля отвергаются.
Парсер также отвергает duplicate JSON keys, нечисловые/nonfinite values,
неверную shape, слишком глубокий/большой результат. Корректность определяется
сравнением actual value с expected вне guest. Ученик знает public fixtures и
может захардкодить их ответы; такой ограниченный зачёт не доказывает обобщение.

Production runtime должен содержать Node, CPython или rustc для соответствующего
языка. Rust использует только std и generated shim, без Cargo/dependency registry.
Граница изоляции — Vercel Sandbox. Provider создаёт непостоянную среду с
`deny-all`, 1 vCPU/2 GiB, отдельным пользователем, CPU/process/output limits,
ограниченным временем жизни и stop/delete. SDK 3.7.0 закреплён в lockfile:
автовосстановление сессии и повтор мутаций запрещены, чтобы не запускать
дополнительные незарезервированные среды.

## Подключение

`api/practice-grade.js` проверяет JWT через Supabase Auth, принимает только
session/key/revision или собственный attempt ID и запускает supervisor через
Vercel `waitUntil`. Результат читается клиентом через own-read RLS; потерянный
ответ повторяется с прежним ключом. Исходный код берётся из сохранённой версии
в БД. Сравнение с ожидаемым ответом происходит в доверенном supervisor.

Миграция `202610130006_grading_manifests.sql` добавляет immutable editions для
существующих variant IDs, lease fencing и резервирование ограниченной квоты.
Миграции 001–005 уже применены; повторно запускать их нельзя. Новая миграция
сама не включает приём отправок. `prepareManifests` сверяет все опубликованные
условия, starter code и открытые примеры перед публикацией 1236 manifests.

`runtimes.json` содержит allowlist по JSON-ключу
`[language, runtime_digest, snapshot_id ?? null, toolchain_sha256 ?? null]`.
Старые pinned editions сохраняют свой runtime при добавлении новых snapshots.
Для подготовленного snapshot manifest дополнительно фиксирует `snapshot_id`
и SHA256 артефакта toolchain. OCI digest идентифицирует базовый образ, а ID
snapshot — сохранённую среду Vercel: он не является криптографическим хешем её
содержимого. Snapshot создаётся только из доверенной подготовки без кода ученика.

Allowlist содержит три проверенных runtime на одном trusted snapshot; доказательства
в `evidence/grading/runtime-2026-10-13.json`. Реальные Python/JavaScript/Rust,
изоляция, лимиты и удаление временных VM проверены на Hobby без карты.
SQL006 применена в Supabase 2026-10-13; повторно её не выполнять.
Опубликованы 1236 immutable manifests; созданы минимальные DB logins
`rustml_api`/`rustml_worker`, их TLS-подключения и запреты проверены.
Production-env и hosted-приёмка завершены2026-10-16; admission включён.
Реальные Python/JavaScript/Rust, wrong values, persistence, SQL fencing,
isolation и production cron проверены; [текущий evidence](../evidence/grading/production-2026-10-16/README.md). Пароли этих
logins передаются только серверному окружению; owner/service-role ключи там
не используются. Frontend активируется через `VITE_PRACTICE_GRADER_URL`.
Неизвестный исход создания или гибель serverless функции ограничены TTL среды.
`api/practice-reap.js` — ежедневная резервная очистка: только project-scoped
непостоянные `rustml-case-UUID` с полными ownership tags и возрастом более
10 минут. Она повторно проверяет метаданные, не возобновляет среды и сохраняет
snapshots. Защищена отдельным `CRON_SECRET` (не менее 32 символов); без него
возвращает 503. Hobby cron работает раз в день, поэтому немедленную остановку
обеспечивают TTL и обычный finally cleanup. Обычный cleanup проверен на семи VM;
production cron прошёл hosted-приёмку2026-10-16: eligible1/deleted1/failed0, snapshot сохранён.
Оба пути очистки сохраняют snapshots (`deleteOrphanSnapshots: false`): среды
отдельных cases непостоянны и собственных snapshots не создают.

## Проверка

```text
node --test learning-lab/tests/practice-grader.test.ts
node --test learning-lab/tests/practice-grader-provider.test.ts learning-lab/tests/practice-grader-supervisor.test.ts learning-lab/tests/practice-grading.test.ts
PRACTICE_VERIFY_ALL_LANGUAGES=1 node --test learning-lab/tests/practice-grader.test.ts
```

Opt-in toolchains задаются `PRACTICE_PYTHON` и `PRACTICE_RUSTC`.
Общий CI flag `PRACTICE_VERIFY_ALL_LANGUAGES=1` включает оба языка;
отсутствующий runtime при включённом flag завершает тест ошибкой.
Совместимый узкий flag `PRACTICE_GRADER_ALL_LANGUAGES=1` также поддерживается.
Файл `.test.ts` входит в существующий `node --test tests/*.test.ts`.
Он регистрирует ESM suite через небольшой typed import; `.d.mts` описывает
отсутствие exported API. Strict TypeScript проекта не отключается.
Проверяются все 412 exercises / 1236 adapters и все author public fixtures,
JavaScript/Python/Rust references, controlled syntax/type/wrong/throw cases,
trusted comparator и категоризация transport ошибок. Эти проверки не
подтверждают provider isolation или hosted worker deployment.
