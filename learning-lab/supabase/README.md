# Облачные черновики практики

Миграции предназначены для **нового Supabase PostgreSQL 15+ проекта**. Существующий
проект не менялся. Применяйте файлы `migrations/*.sql` по порядку от migration owner.
Схема `private` не должна входить в exposed schemas Data API.

Реализованный API использует Supabase Auth + PostgREST и пять узких public RPC.
PostgREST проверяет JWT, SQL получает владельца только из `auth.uid()`; клиент
не передаёт `user_id`. RPC вызывает закрытую операцию с фиксированным search_path.
Это упрощает предложенную в документах Edge-прослойку: собственная Edge Function
для этих операций не требуется. Пользовательский код не исполняется в Auth, SQL,
браузерном cloud client или Edge runtime.

В браузере задаются только project URL и publishable/anon key. GitHub provider
должен быть включён в Auth; callback провайдера задаётся по настройкам Supabase,
а redirect allowlist должна содержать точный frontend origin/path. Клиент
использует OAuth PKCE, хранит session в localStorage и обновляет access token.
Выход очищает локальные Auth tokens даже при сетевой ошибке. Email OTP требует
настроенного Auth email template с кодом и SMTP для доставки реальным адресатам.
Серверный ключ, пароль БД, JWT signing secret нельзя вводить в приложение.

`catalog()` связывает локальный `2026-10-v1`, exercise ID и язык с UUID через
`practice_releases.release_key` и `practice_exercises.exercise_key`. Seed содержит
все 136 тем, 276 requirement-групп, 412 упражнений и 1236 языковых вариантов.
Из них 140 обязательных pass-групп guided и 136 независимых A/B-групп. Авторский
каталог содержит 758 публичных fixtures; это не hidden grading tests.

Сохранение — явный CAS: session + ожидаемая revision + source. Конфликт не
перезаписывает облако. UI должен предложить загрузку/сравнение обеих версий.
Help RPC принимает `hint:1`, `hint:2`, …, `explanation` и `solution`, записывая receipt перед
возвратом текста. История сохраняется между устройствами. API не выдаёт таблицу
private bundles; ссылки на открытые авторские решения в текущем учебном UI не
являются скрытыми тестами и не доказывают самостоятельность.

**Проверка решений отключена в самой БД**: и private submit, и public submit
выдают `grading_unavailable`. Runtime digest учебного варианта отсутствует,
число grading tests равно нулю, runner_spec.enabled=false. Hash bundle соответствует
только каноническому JSON авторской помощи, не несуществующему runner image.
Для включения нужны новая проверенная миграция, новый immutable release,
закрытые grading fixtures, реальные digest runtime/harness и проверенный sandbox.

Проверка fresh schema и двух владельцев:

```powershell
# Временная зависимость устанавливается вне production package/lock.
npm install --prefix work/backend-smoke --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.3.15
node learning-lab/supabase/tests/rls-smoke.mjs work/backend-smoke/node_modules/@electric-sql/pglite/dist/index.js learning-lab/supabase/tests/rls-smoke-result.json
node --test learning-lab/tests/practice-cloud.test.ts
```

PGlite выполняет настоящий PostgreSQL WASM engine. Smoke использует auth.uid stub,
не проверяет hosted Auth/JWT, SMTP/OAuth, PostgREST embedding, многопроцессные гонки
и deployment. Успех этого теста не заменяет проверку на выделенном Supabase проекте.
