# Публикация практики RustML

Состояние 2026-10-12: исходники, локальная практика, Auth/PKCE клиент, SQL migrations
и Pages workflow подготовлены. Hosted frontend/backend ещё не подтверждены.
Серверный зачёт кода отключён, платных ресурсов не создавали.

## Frontend: GitHub Pages

Репозиторий `iliskhan/rust_ml` public; GitHub connector подтвердил права push/admin.
Бесплатные Pages для public repo поддерживают deployment из GitHub Actions:
[официальная инструкция](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
Workflow `.github/workflows/learning-lab-pages.yml` собирает `learning-lab/dist`
с `VITE_BASE_PATH=/rust_ml/`, выполняет тесты и публикует artifact.

В обычном авторизованном GitHub:

1. Открыть [Settings → Pages](https://github.com/iliskhan/rust_ml/settings/pages)
   и выбрать Source **GitHub Actions**. Для ветки `codex/practice-implementation`
   при необходимости разрешить deployment в environment `github-pages`.
2. После push открыть [Actions](https://github.com/iliskhan/rust_ml/actions), дождаться
   зелёных build/deploy и открыть URL из deployment result.
3. Предполагаемый адрес project site — `https://iliskhan.github.io/rust_ml/`.
   Пока deployment и HTTP/browser проверка не пройдены, этот адрес не считается рабочим.

Frontend доступен без Supabase: локальные черновики, помощь и self-check history.
Аккаунт активируется только после настройки backend ниже и новой сборки.

## Backend: выбранный Supabase Free project

Нужны обычный вход владельца и выбранный **Free** project; пароль БД и service-role
ключ в чат или Git не передаются. Проект пока не выбран/не создан этим чатом.

1. В SQL Editor применить по порядку три файла `supabase/migrations/*.sql`.
   Это новая схема практики; повторно опубликованный release не редактировать.
   Для существующего проекта сначала проверить отсутствие конфликтующих `practice_*` объектов.
2. В [GitHub OAuth provider](https://supabase.com/docs/guides/auth/social-login/auth-github)
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

## Другой бесплатный frontend

[Cloudflare Pages Free](https://developers.cloudflare.com/pages/platform/limits/)
подходит для того же статического `dist`: 500 builds/месяц, одна сборка одновременно,
asset до 25 MiB. Для размещения в корне `pages.dev` использовать `VITE_BASE_PATH=/`.
Новый аккаунт, соглашения и платный upgrade этим чатом не оформлялись.

## Исполнение кода

Ни GitHub Pages, ни Supabase draft API не исполняют Python/Rust ученика.
`practice_submit` отвечает `grading_unavailable`. Выбор и проверка изолированного
runner остаются отдельным незавершённым этапом; см. `practice-execution.md`.
