# Комплексное улучшение RustML — 2026-10-13

Поручение выполнено в пяти новых чатах и отдельных worktree от `1e3ba80`.
Родительский checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, ветка `master`.
Общий план и состояние доставки — в корневых PLAN.md/PROGRESS.md.

## Выбранные изменения

| Направление | Проверяемый результат | Ветка и итоговый SHA |
|---|---|---|
| Загрузка | Lazy-разделы и восстановление после ошибки; начальный JS уменьшен | `codex/loading-recovery`, `5cf8c2db26edb603b9cc2eeb057fd1595276ce4a` |
| Практика | Поиск по 136 темам, продолжение последней работы, явное локальное сохранение | `codex/practice-ux-navigation`, `6bdb5eef934e3ae69aa2beb24910f31f8a38540e` |
| Rust | 2D matmul autograd, mean/sub, Linear, MSE, SGD и обучение y=2x+1 | `codex/rust-training`, `f7440b1d496002064690f1364e57dd9c5fe4e6dc` |
| Облако | Общий предел 30 секунд на refresh/fetch/body, отмена и защита поздних ответов | `codex/cloud-request-deadline`, `6a8a7913ea099a24717d79e4295a565b99e5c3cb` |
| Данные | CAS/Web Lock Boundary, атомарная настройка языка, отмена устаревшего импорта | `codex/local-data-preservation`, `5cd4e5b035765f72cb1683f2b932012f3a063337` |

Независимое review выявило две гонки общего refresh: преждевременное освобождение
результата и отмену между await и записью токенов. Обе исправлены; независимые
80 вариантов порядка microtasks и 20 timeout-тестов прошли. Review Rust формул,
графа и SGD замечаний не выявило; это дополнение к выполненным численным тестам.

При интеграции нового receipt языка найден пропущенный listener PracticePanel.
Ключ `languagePreferenceKey` экспортирован из progress-sync; listener учитывает
оба формата. Это сохраняет отображение основного языка в другой вкладке offline.

## Общая проверка до публикации

Срез: родительский HEAD `e53313a` плюс root integration diff и snapshot пяти файлов
из local-data worktree (перед окончательным merge). Их SHA256 сверяются с финальной
веткой; никаких последующих изменений runtime без повторной проверки.

Окружение: Windows, Node24.19.0, pnpm11.25.0, Rust1.87.0 stable executable.
Frontend команды из `learning-lab`; Rust команды из корня.

- `PRACTICE_VERIFY_ALL_LANGUAGES=1 node --test tests/*.test.ts`: **561/561 PASS**,
  0 failed/cancelled/skipped. PRACTICE_PYTHON и PRACTICE_RUSTC указывают на
  bundled Python и direct stable rustc; имена переменных важны.
- `pnpm build --manifest`: typecheck и production build PASS.
- `cargo fmt --all -- --check`, strict Clippy для всех workspace targets/features,
  `cargo test --workspace --all-features --locked --offline` и такой же release:
  **69 unit/integration + 7 doctests**, PASS в обоих режимах.
- `RUSTDOCFLAGS=-D warnings cargo doc --workspace --all-features --no-deps --locked --offline`: PASS.
- Пять `cargo run --locked --offline` examples: basic_tensor_ops, autograd_test,
  milestone_check, scalar_demo, linear_regression — PASS. Последний даёт
  `loss 9 -> 4.150e-20`, `w=2.0000000000`, `b=0.9999999998` за 100 шагов.
- CI дополнен выполнением linear_regression на Windows/Linux. README, guide,
  milestone status и roadmap больше не называют этот API отсутствующим.
- `pnpm audit --json`: 132 зависимости, 0 известных уязвимостей всех уровней.
  Это результат registry audit, а не доказательство отсутствия всех проблем безопасности.

Итоговая production-сборка без Supabase env, base `/`: initial JS **402831 B**,
gzip **124834 B**, против исходных **1019011 B / 304572 B**. Это −60,47% raw /
−59,01% gzip для анонимной начальной карты; authenticated sync и практика всё
ещё загружают необходимый каталог. Полный manifest: `integrated-bundle.json`.

## Реальная браузерная проверка

Родительский dev server: порт6970, обычный desktop и viewport390×844/320×760.
Временный viewport восстановлен. Скриншоты — в `learning-lab/evidence/improvements`.

- SOFTMAX: два результата; второй выбран native select, Enter открывает задание.
- Python/JavaScript черновики с разными sentinel сохранены; переход к AdamW,
  Continue и reload возвращают точный JavaScript; Python остаётся независимым.
- На320/390 ширина документа не превышает viewport; поиск16px, кнопки и строки
  помещаются, клавиатурный фокус виден. Редактор прокручивает длинный код внутри
  своего поля. Консоль обычной страницы: 0 errors/warnings.
- Настройка языка проверена в двух настоящих вкладках с одним origin и локальным
  тестовым owner, без AuthProvider/сети Supabase. Python→Rust в A немедленно меняет
  основной маршрут и marker в B. В обеих вкладках console0.
  Воспроизведение: открыть `/evidence/improvements/language-frame.html` дважды
  при запущенном Vite. Fixtures существуют только для разработки и не входят в dist.
- Предварительная iframe-версия проверки языка также обновляла DOM, но IAB
  сообщил MutationObserver error без URL; источник не установлен. Её заменяет
  успешная проверка двух обычных вкладок, приведённая выше.
- Отдельный local-data worktree подтвердил в общем storage сохранение чужих A/B,
  видимый конфликт и отмену delayed file import после нового шага обучения.
  Loading worktree проверил все18 routes, 503/reload и сохранность draft, Escape/focus.

## Публикация и приёмка

Runtime `8d747ac086c6a88cf9c1cd876026f64db6666aa0` отправлен обычным push master,
local=remote. CI [38444605895](https://github.com/iliskhan/rust_ml/actions/runs/38444605895)
и Pages [38444605966](https://github.com/iliskhan/rust_ml/actions/runs/38444605966) SUCCESS.
Все четыре CI jobs успешны, включая Windows/Linux Rust1.87 и current stable.

На https://iliskhan.github.io/rust_ml/#practice после публикации проверены:
восстановление существующей сессии, automatic/manual progress sync, поискSOFTMAX
с двумя результатами, Enter→упражнение и загрузка панели истории аккаунта.
Console errors/warnings0. Публичный screenshot — `public-preview.png` рядом с этим файлом.
Проверка не создавала новые облачные черновики и не включала grader.
Закрывающий checkpoint меняет только документацию; runtime-код после приёмки неизменен.

## Что осталось и в каком порядке

1. Включить уже подготовленный grader: нужны два dedicated DB URLs и CRON_SECRET
   в production-env Vercel, затем hosted HTTP-приёмка, ограниченное admission-окно
   и проверка cleanup. Автоматический review потребовал отдельного согласия;
   предыдущий конкретный запрос пока без ответа. Новые улучшения это не обходят.
2. Следующий Rust-сценарий: воспроизводимая инициализация, ReLU и небольшой MLP.
   Критерий — численные производные, проверенная задача обучения и воспроизведение
   результата. Не добавлять Module/Sequential до потребности реального сценария.
3. Проверить полный каталог и накопленную историю на слабом мобильном устройстве.
   Пока measured reader median4.3ms/max6.2ms на desktop с двумя drafts; это не
   input-to-paint benchmark заполненного аккаунта. Оптимизировать после измерения.
4. Перед публикацией crates — самодостаточные README/examples, `cargo package`
   и сборка архивов в изолированном каталоге. Сейчас workspace-relative пути
   проверены только внутри репозитория.
5. После реальной потребности — сохранение модели с round-trip проверкой и
   восстановлением обучения. GPU, distributed и расширяемый framework отложены.

CAS сообщает конфликт, а не объединяет разные опыты автоматически. Timeout не
доказывает отмену серверной мутации; POST не повторяется клиентом автоматически.
SGD обновляет один параметр, многопараметрная транзакционность не заявлена.
