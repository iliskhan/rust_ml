# Исправления 12 замечаний ревью — 2026-10-23

Основа: `master` / `32e053fe0fd36abf2733c0c09deba6e36c523b6d`.
Три независимых направления исправлялись параллельно: grader/очередь,
навигация/RL/3D, учебные контракты. Интегратор исправил Rust и синхронизацию,
собрал UI и выполнил общие проверки. Срез B06/B09/B12, R02/R04/R06/R08,
U02/U05/U06/U08; это исправления существующего учебника, не новый выпуск заданий.

## Покрытие замечаний

| № | Исправление | Проверка |
|---|---|---|
| 1 | Аргументы JS/Python/Rust берутся по `parameters[].name`, независимо от порядка JSONB. Legacy JS/Python получают контракт из immutable опубликованного starter через закрытый SQL008 helper. | Все 1236 контрактов проходят публикационную сверку; 35 execution payloads через настоящий JSONB → claim, provider mock; hashes/ACL сохранены. Реальные локальные адаптеры исполняет Node suite. |
| 2 | После worker выполняется ограниченный обход очереди; заполненная очередь валидной сессии тоже запускает восстановление. Защищённый cron восстанавливает работу без вкладки. Квоты, leases и fencing сохранены. | Supervisor/recovery/HTTP tests: deadline, максимум 20 IDs, concurrency 2, запрет recursion, auth/redaction; SQL smoke завершает исчерпанную третью lease без новой reservation. |
| 3 | `Tensor::reshape` нормализует ndarray layout перед изменением формы. | Regression сравнивает логически равные C/F layouts; полный Rust workspace на 1.87. |
| 4 | Решение и подсказка раскрываются только после сохранения receipt; параллельная отправка кода блокируется до завершения записи помощи. | Настоящий PracticePanel, локальный quota fixture: ответ скрыт при ошибке, прежний draft сохранён, после восстановления записи повтор успешен. |
| 5 | UI отправляет единственное исходное событие выбора языка через общий sync; поздний legacy RPC больше не создаёт второе событие. | Два устройства, старый запрос приходит после нового: сохраняются исходные IDs/timestamps и новый язык. |
| 6 | Ошибка upload не блокирует pull; неподтверждённые события остаются для retry. Ошибки owner/validation/storage по-прежнему прекращают небезопасное merge. | Quota upload + успешный pull, потерянный ответ после commit, cursor replay, account switch, idempotence. |
| 7 | RL apply/restore сбрасывает результаты соседнего Bellman/Q, сохраняя собственный snapshot фильма. | Браузер: Environment restore вернул reward2 и walk1/reward−.04; Bellman восстановил 20 проходов; Q — 200 шагов/188 достижений цели. Соседние результаты сброшены. |
| 8 | Ссылка практики содержит стабильный topic; выбирает нужную главу и восстанавливает focus/scroll, включая тот же hash. | LoRA из поиска → advanced, глава4, heading focus; повторный click/Enter; desktop/mobile390. Route/placement tests. |
| 9 | Статическая 3D-сцена остаётся смонтированной при поиске; активное обучение по-прежнему приостанавливается. | SSM yaw80 → Ctrl+K → Esc: yaw80, тот же input focus и scroll на desktop и mobile390; горизонтального overflow нет. |
| 10 | 141 упражнение в 47 темах помечено как повторение. UI и SQL009 не выдают общий известный банк за самостоятельный перенос. История и raw passes сохраняются. | SQL: Gaussian 2 raw pass/2 completed/1 independent → 2/1/0; BPTT не изменён; snapshots attempts/drafts/receipts/enrollments/sessions идентичны; чужой owner видит 0. Браузерный legacy-response fixture также не показывает ложное mastery. |
| 11 | 27 архитектурных упражнений задают структурированные `atol=1e-10, rtol=1e-9`; grader и отображаемый контракт используют один источник. | Тест пограничной точности и всех опубликованных условий; применяется при публикации новой manifest edition. |
| 12 | Fit стандартизации ограничивает ненулевой scale снизу `1e-12`, чтобы его выход принимал transform; константная выборка сохраняет scale1. | JS/Python/Rust: tiny variance, fit→transform, строгий transform guard; видимый contractNote без изменения опубликованного условия. |

## Общие проверки

- Node 24.18.1: `node --test tests/*.test.ts`, `PRACTICE_VERIFY_ALL_LANGUAGES=1`,
  явные Python 3.11 и Rust 1.87.0 — **682 PASS, 0 FAIL, 0 SKIP**.
- `tsc --noEmit` и `vite build --base=/rust_ml/` — PASS.
- Rust 1.87.0: `cargo test --workspace --all-features --locked` —
  **86 тестов PASS**, включая doctests; `cargo fmt --all -- --check` — PASS.
- Локальный PostgreSQL WASM (PGlite), реальные migrations 001–009 и SQL003 seed:
  `review-grading-smoke.mjs` — **56 checks**, 1236 manifests, 35 execution payloads с provider mock;
  `review-learning-smoke.mjs` — PASS, сохранность данных и RLS.
- `git diff --check` — PASS. Новых production dependencies нет.

Первый общий запуск обнаружил забытый старый provider fixture без `parameters`;
он исправлен, затем весь набор прошёл на закреплённом MSRV. Первоначальный offline
Cargo не нашёл lockfile dependency в кэше; после загрузки закреплённых зависимостей
проверки прошли. Эти первые запуски не считаются успешными.

Браузерные проверки выполнялись в IAB на локальном Vite `127.0.0.1:5194`.
Quota/progress fixtures использовали реальные React-компоненты, отдельный локальный
owner и fake cloud без запросов в production; временные HTML удалены из checkout.

Снимки: [quota](fix-04-quota-blocked-solution.png),
[LoRA mobile](fix-08-lora-return-mobile390.png),
[камера desktop](fix-09-search-camera-desktop.png),
[камера mobile](fix-09-search-camera-mobile390.png),
[прогресс со старым ответом сервера](fix-10-legacy-progress-repeat.png).

## Оставшийся backlog и границы

1. **Production rollout backend ещё не выполнен.** Применить SQL008/009 от migration
   owner (старые 001–007 повторно не запускать), затем развернуть API с recovery cron
   и существующим `CRON_SECRET`. Сверить опубликованный каталог через `prepareManifests`
   и добавить новую свободную edition с текущими pinned runtimes; старые hashes/history
   не обновлять. После этого проверить hosted JS/Python/Rust и закрытую вкладку.
   Порядок и ограничения — [grader README](../../grader/README.md).
2. Daily cron в существующем Hobby-плане — резерв после гибели всех workers.
   Без новых submit аварийная job может ждать следующего дня и задержки scheduler;
   полный drain иногда требует нескольких запусков. Для восстановления за минуты
   нужен отдельно настроенный scheduler; платный план не подключался.
3. 47 банков честно дают повторение; новых независимых заданий эта правка не создаёт.
   До отдельного content release самостоятельный перенос этих тем не подтверждается.
4. Не выполнялись hosted Sandbox/deployment smoke, проверка всех 3D-сцен, screen reader,
   реальный мобильный аппарат и наблюдение с учениками. Browser viewport390 не выдаётся
   за аппаратную проверку; U07 целиком и B08/R07/U09 этим не закрываются.
