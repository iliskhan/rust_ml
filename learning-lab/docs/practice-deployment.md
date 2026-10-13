# Публикация практики RustML

Состояние 2026-10-13: личный предпросмотр Sites опубликован с доступом только владельца.
GitHub Pages [опубликован](https://iliskhan.github.io/rust_ml/#practice) из `master`:
build/deploy/CI PASS, HTTP200 и desktop/mobile проверены.
Supabase project `phnjcmahugetofwvnbto` проверен в dashboard 13.10: Free,
`rustml-learning-lab`, Healthy, Frankfurt. Browser доступ восстановлен после проверки
прямого исходного поручения владельца «создал проект, проверяй».
SELECT из pg_catalog вернул 0 существующих `practice_*` объектов.
Применение первой миграции отклонено auto-review как удалённое изменение без
отдельного прямого разрешения; оно запрошено. SQL Editor показывает предупреждение
о RLS, хотя исходная миграция явно включает RLS для всех 13 таблиц. База не изменена.
Auth/PKCE клиент и SQL migrations проверены локально; облачное подключение ещё не выполнено.
Серверный зачёт кода отключён. Платный upgrade не подключали.

Позднее 13.10 владелец прямо разрешил подключение в исходном чате
`01a13055-8c77-7293-95a4-ac6e884eb382`; он взял hosted migrations/settings.
Чат локальной интеграции не меняет удалённую базу параллельно и ожидает его
проверенные результаты. Отказ выше — история первой попытки, а не новое требование
повторить разрешение. Hosted готовность пока не подтверждена.
Read-only диагностика13.10 подтвердила: global allow Supabase настроен правильно;
в browser session исходного чата сохранён отдельный conversation deny.
В установленном browser plugin26.1007.21434 этот deny имеет приоритет при выборе
решения и приводит к `persisted_user_denied`; точечные источники записаны в
[PROGRESS.md](../../PROGRESS.md). Повторно добавлять global allow не требуется.
Штатный способ снятия conversation deny пока не найден; эффект перезапуска
не проверен. Следующий шаг — штатное разрешение этого browser-состояния.
Удалённая база этим workflow ещё не изменена; другое браузерное подключение
не используется для обхода.

Текущая проверка Auth settings: Email и новые регистрации включены, Confirm email
включён, GitHub отключён. Site URL остаётся `http://localhost:3000`, redirect allowlist
пуст. Существующий publishable key прочитан; secret key не раскрывался. Публичную
конфигурацию в Pages ещё не добавляли: сначала нужны migrations и hosted приёмка.
Локальный клиент email/password и экран прогресса интегрированы и проверены;
доказательства — [Auth/Progress](../evidence/auth-progress/README.md).

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
   В этой публикации работают локальные задания, помощь и черновики; backend ещё не подключён.

Frontend доступен без Supabase: локальные черновики, помощь и self-check history.
Аккаунт активируется только после настройки backend ниже и новой сборки.

## Backend: выбранный Supabase Free project

При последнем доступном осмотре вход владельца был подтверждён; в личной организации
**Free** была подготовлена форма проекта
`rustml-learning-lab`, регион Europe, без автоматической выдачи доступа новым таблицам.
Затем владелец сообщил о создании проекта. Dashboard проекта `phnjcmahugetofwvnbto`
открыт 13.10 по найденному прямому поручению; запрет не обходился через CLI/API/другой
браузер. Миграция подготовлена в SQL Editor, но её первое выполнение отклонено
auto-review. Позднее прямое разрешение на миграции и настройку получено;
текущее препятствие — conversation deny браузера, описанный выше.
Программа не должна создавать новый дубликат проекта. Секреты не добавляются в Git
или frontend. Новый пароль и отправку формы по правилу browser hand-off выполняет владелец.

1. В SQL Editor применить по порядку три файла `supabase/migrations/*.sql`.
   Это новая схема практики; повторно опубликованный release не редактировать.
   Для существующего проекта сначала проверить отсутствие конфликтующих `practice_*` объектов.
2. В Email provider проверить email/password и подтверждение адреса. Клиент
   поддерживает регистрацию, вход и повторное письмо; PKCE callback должен
   возвращаться в тот же браузер. Подтверждение email сохраняется; его не отключать
   для обхода проблем доставки. На hosted проектах оно включено по умолчанию:
   [официальное описание](https://supabase.com/docs/guides/auth/passwords).
   Для регистрации посетителей нужен настроенный SMTP: встроенный сервис доставляет
   только адресам команды проекта и сейчас ограничен двумя письмами в час.
   Это ограничение сервиса, а не доказанный отказ нашего проекта:
   [официальное описание SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
   Новый SMTP credential вводит владелец; платный сервис не подключать без поручения.
   В [GitHub OAuth provider](https://supabase.com/docs/guides/auth/social-login/auth-github)
   настроить OAuth app: callback `https://<project-ref>.supabase.co/auth/v1/callback`.
   OAuth secret остаётся в настройках Supabase.
3. В Auth URL Configuration добавить site URL `https://iliskhan.github.io/rust_ml/`
   и разрешить этот точный redirect. PKCE клиент использует текущие origin+pathname.
4. В GitHub repository variables добавить `VITE_SUPABASE_URL` и
   `VITE_SUPABASE_PUBLISHABLE_KEY` из проекта. Это публичная browser-конфигурация;
   `sb_secret_*` и JWT `service_role` запрещены клиентом и не нужны frontend.
5. Пересобрать Pages. В двух разных аккаунтах проверить вход, save/load draft,
   CAS conflict и отсутствие доступа к чужим черновикам. Проверить sign-out/refresh,
   прямой REST/RPC bypass и отсутствие доступа к private bundle.

Локальный SQL smoke использует PostgreSQL WASM и `auth.uid` stub. Он проверяет DDL,
RLS, ownership, CAS, receipts и immutable publication; он **не** проверяет реальный
JWT, OAuth, hosted PostgREST, refresh и конкурентные транзакции двух DB connections.
Эти сценарии остаются обязательными после выбора проекта.

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

Ни GitHub Pages, ни Supabase draft API не исполняют Python/Rust ученика.
`practice_submit` отвечает `grading_unavailable`. Выбор и проверка изолированного
runner остаются отдельным незавершённым этапом; см. `practice-execution.md`.
