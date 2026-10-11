# Сохранённые опыты Boundary — рабочая заметка

Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, исходный commit `fd19da780d8bb3800853894d8f3af6c2b97c40c5`.

- Прочитаны `BoundaryPlayground`, математическое ядро, CSS, правила проекта и Ponytail.
- Добавлен модуль состояния/сериализации `src/boundaryExperiment.ts`: исходный порядок обучения сохранён, JSON v1 включает текущий опыт и A/B; валидация ограничивает размер, формы, диапазоны и проверяет численную безопасность.
- Добавлен `src/BoundaryComparison.tsx`: общие оси карт, таблица условий и метрик, кривые и явные различия условий.
- UI подключён: автоматическое локальное сохранение `rustml-boundary-v1`, пауза после восстановления/импорта, JSON export/import, независимые A/B со сравнением и загрузкой. Сброс текущего опыта сохраняет A/B, порог и пробу. Повреждённая локальная запись не перезаписывается до явного действия пользователя. Ошибка/quota останавливает автоматические записи и предлагает экспорт/повторное сохранение.
- Границы JSON v1: 2 МиБ, 0–3 скрытых слоя шириной 1–16, seed uint32, максимум 4000 шагов/4001 точка истории; векторы params/m/v соответствуют архитектуре. Числа конечны и ограничены 1e100, v неотрицательна, история упорядочена; текущая BCE сверяется с весами, следующий optimizer step и вся входная область проверяются на переполнение. Генератор данных остаётся исходным; при его будущей смене нужна новая версия формата.
- `node --test tests/boundary-experiment.test.ts tests/boundary-network.test.ts tests/hidden-representations.test.ts tests/decision-boundary.test.ts`: **31/31 PASS** (2026-10-11, около 20:35 MSK, этот checkout). Runtime PATH: `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback`.
- Новый набор из 7 тестов проверяет точный roundtrip и следующий шаг SGD/Momentum/Adam для двух архитектур и трёх seed, идентичный порядок выборки, паузу, независимость A/B и сброса, неподдерживаемые версии/формы/диапазоны/размеры/overflow, ошибку чтения и quota.
- Первый `pnpm typecheck` был заблокирован параллельными изменениями ConceptSearch (TS2305/1261/1149 из-за casing); после исправления соседней подзадачи повторный `pnpm typecheck` **PASS**. `git diff --check` **PASS** (2026-10-11, около 20:37 MSK, этот checkout).
- Браузерный desktop/mobile аудит, общий build/test и Git checkpoints выполняет родительский агент. Сервисы не запускались, commit/push не выполнялись.

Следующий шаг: интеграционная проверка родителем в preview 5183; проверить reload на паузе, A/B после дальнейшего обучения, импорт хорошего/повреждённого JSON и mobile layout. Все изменения этой подзадачи ограничены BoundaryPlayground.tsx, boundary-playground.css, boundaryExperiment.ts, BoundaryComparison.tsx, boundary-experiment.test.ts и этой заметкой.
