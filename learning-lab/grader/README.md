# Проверка открытых примеров в изолированном исполнителе

Эти модули не запускают код ученика на хосте и не создают sandbox.
`execution.mjs` создаёт файлы/argv; выбранный backend обязан создать отдельный
изолированный runtime, выполнить их и убрать все ресурсы. Авторские тесты
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
   fixed argv без shell, ограничивает resources/время/вывод и читает только
   фиксированный result.json (проверяя symlink/type/size вне guest).
   Nonzero compile -> `compile_error`, nonzero run -> `runtime_error`;
   provider timeout/OOM/output -> соответствующая категория. Ошибка provision,
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
Память, CPU/process/output limits, no-network/no-secrets и watchdog являются
обязанностью выбранного provider; эти файлы не являются границей безопасности.

## Проверка

```text
node --test learning-lab/tests/practice-grader.test.ts
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
