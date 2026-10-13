# Practice backend — проверенный полный релиз

> Обновление архитектуры, 2026-10-13: ниже сохранён исторический отчёт 12 октября.
> Auth и синхронизация уже опубликованы; актуальная hosted-приёмка — в PROGRESS.md.
> SQL006 добавляет grading editions для прежних variant IDs, с выключенным по
> умолчанию admission. Новый учебный release для первого зачёта тех же открытых
> примеров не требуется. Реальный sandbox и production grading ещё не проверены.

2026-10-12 17:56 Europe/Moscow. Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`,
branch `codex/practice-implementation`, base `212a6ef4d3baebb83b41bd20a53a069f4358a2e4`.
Проверено рабочее дерево реализации до общего commit. Внешние проекты не менялись.

## Результат

После сообщения root `CATALOG FROZEN` seed перестроен из `src/practice/all-catalog.ts`.
Первичная миграция 003 ещё нигде не развёрнута; её историческое имя
`202610120003_anchor_content.sql` сохранено, содержимое теперь охватывает весь каталог.

| Сущность | Проверенное количество |
|---|---:|
| Темы | 136: 83 исходных unit, 51 математическая тема, 2 дополнительных unit |
| Упражнения | 412: 140 guided и 272 transfer |
| Обязательные requirement-группы | 276: 140 pass и 136 independent A/B |
| Языковые варианты | 1236: Python / JavaScript / Rust |
| Открытые fixtures | 758 до размножения по языкам |

Каждый guided имеет отдельную группу, поэтому прохождение одного упражнения не
скрывает остальные пробелы. Явные авторские пары `.transfer-a`/`.transfer-b`
закрывают одну независимую группу. Генератор также поддерживает одиночный transfer
как optional/pass; в текущем frozen каталоге все 272 transfer образуют 136 пар.

Auth-bound public RPC получают owner только из `auth.uid()`. Session/draft/help
защищены RLS, сохранение использует ожидаемую revision, help выдаётся вместе с
receipt. `explanation` — отдельная помощь, которую нельзя обойти перезапуском
сессии. Private bundles и worker API клиенту недоступны. Для текущих операций
используется Supabase Auth + PostgREST; custom Edge gateway не нужен.

**Grading отключён в private/public submit.** Runtime digest отсутствует,
expected_tests=0, grading_tests=[], runner_spec.enabled=false. Bundle SHA256
соответствует реальному JSON авторской помощи, не runner image. Публичные примеры
и открытые авторские решения не выдаются за hidden grading evidence. Код ученика
не исполняется в browser cloud client, SQL или Edge. Для включения проверки нужны
проверенный sandbox/runtime/harness и новая миграция. Текущий этап проверяет только
открытые примеры; закрытое покрытие не заявляется. SQL006 сохраняет release и
создаёт отдельную immutable grading edition, не меняя опубликованное условие.

## Реальная проверка SQL

Node v24.19.0: `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Disposable `@electric-sql/pglite@0.3.15` в ignored `work/backend-smoke` исполняет
PostgreSQL 17.5 WASM (Emscripten 3.1.74). Production package/lock не менялись.

Команды из корня checkout:

```text
node learning-lab/supabase/generate-seed.mjs
node learning-lab/supabase/tests/rls-smoke.mjs work/backend-smoke/node_modules/@electric-sql/pglite/dist/index.js learning-lab/supabase/tests/rls-smoke-result.json
```

**Все три миграции выполнены на fresh schema; 12403 assertions PASS.** Проверены:

- Полное соответствие каталога и requirement-групп, всех 1236 starters, public
  fixtures, hints, solutions/explanations и author-help bundle hashes.
- Два владельца: чужие sessions/drafts/help/progress не читаются; чужие writes/help
  отклоняются; stale CAS и oversized source отклоняются; help идемпотентен.
- Запрет direct grade writes, private/worker доступа, anon и null-owner RPC.
- Неизменяемость опубликованных release/variant/private solution.
- Отключение submit даже для practice_api; attempts остаются нулевыми.
- Старт настоящего authored variant, выдача его starter/help только владельцу,
  отсутствие фиктивного завершения от открытия помощи.

Первый расширенный smoke обнаружил различие представления `-0` и `0` в одном
public fixture. Seed использует JSON.stringify, который нормализует `-0` в `0`.
Сравнение исправлено на точное сериализованное JSON-представление seed; числа,
условия и эталоны каталога не изменялись. После этого полный smoke прошёл.

Seed SHA256:
`e8686b2c2de9313bdae282494d8b5c38ab32cb814e765ee16ca8b8963d85fa83`.

Машиночитаемое доказательство с UTC timestamp, checkout/revision, runtime,
командой, counts и SHA256 всех миграций:
`learning-lab/supabase/tests/rls-smoke-result.json`.

Root отдельно сообщил результаты текущего frozen каталога: полный suite
**422/422, 0 skipped** (Node 24.19 / Python 3.12.14 / Rust 1.87), cloud tests
**11/11** и local tests **11/11**. Этот backend этап не перезапускал общий suite
или TypeScript; UI/build проверку и общий commit/push выполняет root.

## Граница доказательств

PGlite — реальный PostgreSQL engine, но auth.uid в smoke — тестовый stub.
Hosted Supabase JWT/Auth, PostgREST embedding/pagination, GitHub PKCE redirects,
SMTP/email, многопроцессные race/locks и hosted deployment **не проверены**.
Supabase project и пользовательский login не предоставлены, внешние ресурсы и
credentials не создавались. Это не hosted smoke и не запуск безопасного runner.

Следующий внешний шаг: применить миграции в выделенном Supabase проекте,
настроить provider/allowlist/email и выполнить hosted two-account проверки.
`private` не должен быть exposed schema. Будущие правки развёрнутого контента
выпускаются новым immutable release, без перезаписи опубликованной миграции.
