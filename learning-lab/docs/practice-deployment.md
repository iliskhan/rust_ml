# Публикация практики RustML

Актуально 2026-10-16, 15:17:10 UTC: серверная проверка работает в production.
Полный адрес `https://rustml-grader.vercel.app/api/practice-grade` сохранён
в GitHub variable `VITE_PRACTICE_GRADER_URL`. SQL007 применена в 15:16:22 UTC:
`enabled=true`, `billing_period_end=infinity`, продление по дате не требуется.
При переходе сохранены 24 создания и 720000 CPU-ms без обнуления. Лимиты
1000 созданий и 1 CPU-час учитываются по закрытому журналу резервов до execution
deadline + 31 день; legacy-резерв действует 31 день + 210 секунд после перехода.
Это консервативный бюджет приложения, не счётчик биллинга провайдера.
Развёртывание Vercel и runtime не менялись. Read-only запрос существующего
trusted snapshot `snap_It6mVj2cPSWSKzj0OCukNncSEHDK` в 15:17:10 UTC
подтвердил `expiresAt=null`, без даты истечения.
[Приёмка непрерывного режима](../evidence/grading/continuous-2026-10-16/README.md).
Первоначальная [production-приёмка 16 октября](../evidence/grading/production-2026-10-16/README.md)
подтвердила 3 языка/4 настоящих grades, SQL fencing32/32, restricted logins,
isolation, cron cleanup и public desktop/mobile.
Ниже сохранена датированная история первоначального развёртывания 13 октября.


Состояние 2026-10-13: личный предпросмотр Sites опубликован с доступом только владельца.
GitHub Pages [опубликован](https://iliskhan.github.io/rust_ml/#practice) из
`master` commit `ce1d3b6`: CI38394725524 (4 jobs) и Pages38394725921
(build/deploy) успешно завершены. Публичный экран показал только GitHub-вход;
реальный GitHub authorize → Supabase callback → Pages PKCE завершился входом,
а `?code` был удалён из URL. Browser cloud save/load/reload/logout, повторный вход
и mobile-осмотр прошли. Серверный зачёт кода выключен.

Supabase project `phnjcmahugetofwvnbto` — Free, `rustml-learning-lab`, Healthy,
Frankfurt. Исходный browser-доступ восстановлен. Pristine preflight не нашёл
конфликтующих practice объектов, ролей и использования `private`; все три миграции
применены целиком через pg 8.23.1 и session pooler с проверкой TLS по CA проекта.
Прямой SQL-запуск не создал CLI migration ledger. Независимый hosted smoke
проверил 17 SQL-наборов, 13 RLS-таблиц и seed; anon Data API читает каталог,
запрещает собственные данные/RPC без входа (401) и `private` schema (406 PGRST106).
Миграции, SQL, API, Auth, браузер и deployment сведены в
[переносимом отчёте](../evidence/auth-progress/hosted-20261013.json).

Владелец выбрал вход через GitHub вместо email/SMTP. GitHub OAuth app `3928667`
создан, secret сохранён только в Supabase provider; provider включён и подтверждён
`/auth/v1/settings`. Site URL и единственный redirect — точный
`https://iliskhan.github.io/rust_ml/`. Repository variables `VITE_SUPABASE_URL` и
`VITE_SUPABASE_PUBLISHABLE_KEY` сохранены; локальный workflow задаёт GitHub-only UI.
Локальный production UI осмотрен в браузере при desktop 1280×720 и mobile
390×844: одна кнопка GitHub, без email fields и overflow.
Серверная приёмка двух временных аккаунтов через Auth Admin API прошла 10/10 групп:
реальные JWT, own/foreign RLS, CAS, запрет прямой записи, изоляция прогресса,
refresh/logout и отключённый grading. Аккаунты удалены после проверки.
Реальный GitHub OAuth вход на опубликованном Pages проверен отдельно. В браузере
cloud save дал version 1, reload сохранил сессию, сравнение после локальной правки
сохранило локальный текст, а явная замена вернула серверный. Starter восстановлен
и сохранён как version 2; logout показал гостя и отключил cloud save, повторный
login и load вернули точный starter без тестовых маркеров. Desktop 1280×720 и
mobile 390×844 без горизонтального overflow; console warnings/errors и alerts — 0.
История первого auto-review отказа и browser deny есть в
[PROGRESS.md](../../PROGRESS.md); они уже сняты и не блокируют текущую работу.

## Frontend: GitHub Pages

Репозиторий `iliskhan/rust_ml` public; GitHub connector подтвердил права push/admin.
Бесплатные Pages для public repo поддерживают deployment из GitHub Actions:
[официальная инструкция](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
Workflow `.github/workflows/learning-lab-pages.yml` собирает `learning-lab/dist`
с `VITE_BASE_PATH=/rust_ml/`, выполняет тесты и публикует artifact.

В обычном авторизованном GitHub:

1. В [Settings → Pages](https://github.com/iliskhan/rust_ml/settings/pages)
   уже выбран Source **GitHub Actions**. Environment `github-pages` разрешает только
   `master`; workflow публикует эту ветку. Защита среды сохранена.
2. После push открыть [Actions](https://github.com/iliskhan/rust_ml/actions), дождаться
   зелёных build/deploy и открыть URL из deployment result.
3. Рабочий адрес project site — [RustML](https://iliskhan.github.io/rust_ml/).
   Cloud build/deploy `ce1d3b6` прошёл; GitHub OAuth на публичной странице работает.

Frontend доступен без Supabase: локальные черновики, помощь и self-check history.
Аккаунт активен после проверенного GitHub OAuth входа.

## Backend: выбранный Supabase Free project

Проект `phnjcmahugetofwvnbto` существует; новый дубликат не создавать. Секреты
не добавлять в Git или frontend. Первая попытка SQL Editor была отклонена
auto-review, но последующее прямое разрешение владельца и проверенные миграции
сняли это прежнее препятствие. Приёмка пользователя и нового frontend пройдена.

1. Миграции `supabase/migrations/*.sql` уже применены целиком в порядке 001→003;
   повторно их не запускать. Каталог, anon API и hosted RLS с двумя настоящими
   JWT проверены; `private` через Data API недоступна.
2. [GitHub OAuth provider](https://supabase.com/docs/guides/auth/social-login/auth-github)
   включён; callback приложения —
   `https://phnjcmahugetofwvnbto.supabase.co/auth/v1/callback`. Настоящий вход и
   возврат PKCE в ту же вкладку проверены. Email/SMTP не требуются для выбранного
   GitHub входа.
3. Auth Site URL и точный redirect уже сохранены как
   `https://iliskhan.github.io/rust_ml/`; клиент использует текущие origin+pathname.
4. Public repository variables `VITE_SUPABASE_URL` и
   `VITE_SUPABASE_PUBLISHABLE_KEY` уже сохранены. Локальный workflow задаёт
   `VITE_PRACTICE_AUTH_PROVIDER=github`; production UI проверен.
   `sb_secret_*` и JWT `service_role` запрещены клиентом и не нужны frontend.
5. Серверная проверка двух одноразовых аккаунтов выполнила save/load draft,
   CAS conflict, запрет доступа к чужим черновикам, refresh/logout и прямой
   REST/RPC bypass. Одновременный HTTP CAS дал ровно один успех, один конфликт
   и итоговую revision 1. Эти аккаунты созданы через Admin API и затем удалены.
   В браузере с GitHub-аккаунтом cloud save/load/reload/logout и mobile вид
   проверены; после явного возврата к starter облачная версия 2 не содержит
   тестового комментария. Клиент нормализует SQL `draft_conflict_or_not_found`
   к status409 для UI; raw HTTP-код отдельно не заявляется как 409.

Локальный SQL smoke использует PostgreSQL WASM и `auth.uid` stub. Он проверяет DDL,
RLS, ownership, CAS, receipts и immutable publication; он **не** проверяет реальный
JWT, OAuth, hosted PostgREST, refresh и конкурентные транзакции двух DB connections.
Hosted-проверки перечислены выше и в
[переносимом отчёте](../evidence/auth-progress/hosted-20261013.json).
Панель прогресса в публичном UI показала локальные 1 тему/1 черновик и серверные
136/136 тем Python, 0/276 требований при выключенном grading. Облачная граница:
черновики, предпочтение языка, помощь и собственный прогресс; локальные
самопроверки остаются на устройстве. Отчёт содержит имена desktop/mobile
скриншотов; сами изображения сохранены в рабочем checkpoint проверки.

## Дополнительное размещение

Личный [предпросмотр Sites](https://rustml-iliskhan-learning-lab.comet-bison-6441.chatgpt.site)
уже опубликован (owner-only). Для открытия нужен вход владельца через ChatGPT.
Native deployment подтвердил `succeeded`. Обычная автоматизационная вкладка IAB дошла
до страницы входа; этот вход не проверен. В отдельном native Codex viewer учебник
и практика открылись: 136 тем, редактор, cloud/grading disabled, console без ошибок.
Mobile и persistence именно Sites-предпросмотра не проверялись. Supabase в этой сборке
не подключён.

[Cloudflare Pages Free](https://developers.cloudflare.com/pages/platform/limits/)
подходит для того же статического `dist`: 500 builds/месяц, одна сборка одновременно,
asset до 25 MiB. Для размещения в корне `pages.dev` использовать `VITE_BASE_PATH=/`.
Новый аккаунт, соглашения и платный upgrade этим чатом не оформлялись.

## Исполнение кода

Серверная проверка Python/JavaScript/Rust реализована через доверенный supervisor
и отдельные Vercel Sandbox; GitHub Pages и Supabase draft API пользовательский
код не исполняют. Browser RPC `practice_submit` по-прежнему закрыт:
авторизованные submit/resume идут через `/api/practice-grade`, а закрытый SQL
резервирует квоту перед запуском. SQL007 убрала дату отключения с сохранением
лимитов и fencing. [Устройство исполнителя](../grader/README.md) и
[приёмка непрерывного режима](../evidence/grading/continuous-2026-10-16/README.md).
