# Документация пакета `#frontiers`

12 октября 2026, 15:24 МСК. Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, HEAD `0358668` с рабочими изменениями нескольких участников.

- `README.md` и `docs/architectures.md` описывают двенадцать новых направлений и четыре лаборатории обучения, отдельно от десяти опытов `#advanced`.
- Уточнены границы прежних одномерных генеративных глав и ручных forward-примеров ViT/MoE/SSM/U-Net/DiT; `#frontiers` обучает отдельные малые модели на синтетических задачах.
- В `AdvancedArchitecturesCourse.tsx` добавлен переход к `#frontiers`; в `curriculum.ts` границы четырёх карточек `#advanced` указывают на отдельные лаборатории обучения.
- Первичные источники и подробные ограничения каждой темы уже находятся в `src/frontierTopics.ts`; новая таблица охвата ссылается на эти карточки, не приписывая игрушечным моделям возможности промышленных реализаций.

Проверки из `learning-lab` с `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`:

| Команда | Результат |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| `node --test tests/curriculum.test.ts` | 6 passed, 0 failed |

Общий suite, production build, браузерная проверка и Git-завершение выполняются координатором задачи после объединения всех файлов. Результаты этих проверок здесь не заявляются.
