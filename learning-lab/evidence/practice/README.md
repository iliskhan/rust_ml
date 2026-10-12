# Проверка практики RustML — 12 октября 2026

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, ветка `codex/practice-implementation`,
исходный revision `212a6ef4d3baebb83b41bd20a53a069f4358a2e4` + рабочее дерево этой задачи.
Снимки исходников для воспроизводимости: `source-hashes.json`. Rust-ядро не менялось.

## Итоговые локальные проверки

- Полный suite: **422/422 PASS, 0 skipped** (`tests-final.log`). Node 24.19.0,
  Python 3.12.14, rustc 1.87.0; `PRACTICE_VERIFY_ALL_LANGUAGES=1` и точные runtime paths.
- После русской редактуры метаданных и переноса runtime defaults на PATH повторены
  затронутые advanced/concept-advanced тесты: **22/22 PASS** (`editorial-check.log`).
  Формулы, код, IDs и числовые fixtures редактуры не менялись.
- `tsc --noEmit`: exit 0 (`typecheck-final.log`, пустой успешный log).
- Production build с native config loader: exit 0 (`build-final.log`).
  Сборка с `--base /rust_ml/` тоже exit 0 (`build-pages.log`). Сохраняется предупреждение
  Vite о main chunk >500 kB; оно не означает ошибку сборки. Каталог вынесен в lazy chunk.
- Fresh SQL migrations в PostgreSQL 17.5 WASM: **12403 assertions PASS**;
  полный seed 136 тем / 276 групп / 412 упражнений / 1236 вариантов.
  Переносимый отчёт: `../../supabase/tests/rls-smoke-result.json`.

Команды из `learning-lab` (Node 24; установленный Python и Rust):

```powershell
$env:PRACTICE_VERIFY_ALL_LANGUAGES='1'
$env:PRACTICE_PYTHON='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PRACTICE_RUSTC='C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe'
node --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build --configLoader native
node node_modules/vite/bin/vite.js build --configLoader native --base /rust_ml/ --outDir ../work/practice-pages-dist/rust_ml
```

`--configLoader native` обходит наблюдавшийся sandbox отказ esbuild config loader
на чтение родительского каталога. Это особенность этого окружения; обычный `pnpm build`
остаётся стандартной командой проекта и используется CI.

## Настоящий браузер

Codex IAB; dev `127.0.0.1:5194`, итоговая production-сборка с project path
`127.0.0.1:5197/rust_ml/`. Это локальная проверка, не опубликованный сайт.

| Сценарий | Наблюдение / доказательство |
|---|---|
| Desktop 1280×720 | Три inline панели нейрона; динамическая смена Adam/SGD/Momentum; пять точных Network topics; нет page overflow. `neuron-inline-desktop.jpg` |
| Mobile 390×844 | Три панели нейрона с уникальными IDs; ширина документа 375/375 px. `neuron-inline-mobile.jpg` |
| Практика текущей главы | VAE «Границы» → unit.vae.limits, «Обучение» → unit.vae.train. `chapter-vae-desktop.jpg` |
| Production persistence | Код Python, opened hint и 1 formative history entry остались после reload. `production-desktop.jpg` |
| Два локальных черновика | Новый draft revision 2 сохранён; stale revision 0 получил конфликт и сохранил код в редакторе. `draft-conflict-desktop.jpg` |
| Отдельные языки | Python revision 2 и JS revision 1 сохранены отдельно на dev origin; смена основного языка не удаляет историю |
| Production mathematical modal | concept.evaluation точно внутри разбора; dialog width 375/375; Tab видимо фокусирует selector; Escape закрывает и возвращает фокус на source button. `production-math-mobile.jpg` |
| 320×568, текст 200% | Production CSS stress copy: paragraph 28 px вместо 14; root 32 px; document width 305/305, длинные JSON примеры переносятся; code textarea сохраняет внутреннюю прокрутку. `production-text200-reflow.jpg`, `reflow-build.json` |
| Экспорт | Скачанный `concept.dot-product.guided.py` прочитан с диска: код совпал с текущим черновиком |
| Console | На итоговой production-сборке новых ошибок и предупреждений не найдено; в mobile tab log осталась ранняя dev-module ошибка с 5194 от 13:57 UTC |

200% — **CSS text stress test**, а не native browser zoom. Копия подготовлена существующим
`../accessibility/prepare_text_scale.py`; JS и SVG attributes не изменялись. Скринридер
не проверялся: пользователь ранее исключил озвучивание. Таблицы и screenshots отражают
проверенные сценарии, не сертификацию доступности или полное покрытие всех UI-состояний.

## GitHub Actions

Реализация `76693f6993dfbe04884e0d9d1bffe44a4c8aa6f4` pushed, remote SHA совпал.
Publish run `38268067306`: build job `114875201446` PASS, включая все языковые тесты,
production build и artifact. Deploy job `114875585648` вернул HTTP404 и сообщение
проверить включение Pages; состояние настройки без входа не прочитано.
CI run `38268066995`: learning-lab `114875200270` FAIL при auto-install Rust1.87,
с конфликтами общих файлов. В CI добавлены предварительная установка и точные paths;
новый запуск исправленного workflow ожидает push. Релевантные выдержки: `actions-first-run.json`.

## Непроверенные внешние условия

Hosted Supabase JWT/Auth/PostgREST, GitHub OAuth redirect, многопроцессные SQL races
и Pages deployment ещё не проверены. SQL использует реальный PostgreSQL engine и
тестовый `auth.uid` stub. Клиентские Auth races проверены deterministic mocked responses.
Код ученика не исполняется; открытые examples и quizzes не дают server mastery.
Платные ресурсы не создавались. Точные действия публикации: `../../docs/practice-deployment.md`.
