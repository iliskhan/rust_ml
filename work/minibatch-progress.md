# Mini-batch и L2 — checkpoint

2026-10-12 06:26 Europe/Moscow. Авторитетный план: `PLAN.md`, запись проверок: `PROGRESS.md`.

- Worktree: `C:/Users/lomaster/.codex/worktrees/minibatch-l2/rust_ml`.
- Ветка: `codex/minibatch-l2`, база `490162fb8fb4c6ec8ff29cb6d7b640caf790431d`; код `6d13646327f5524e3a3909f1d79dc31236a8de4e`.
- Реализованы batch1..96, независимые seed данных/init/order, λ0..1 и objective BCE+λ/2ΣW² без bias.
- RNG/cursor не сохраняются отдельно: `optimizer.step` определяет эпоху/позицию; seeded permutation эпохи восстанавливается без Math.random. Последний пакет короткий. Batch96 сохраняет старый порядок суммирования.
- JSON v2 требует новые поля; v1 мигрирует в batch96,λ0,init/order=старыйseed. Ключ localStorage `rustml-boundary-v1` сохранён. Все current/A/B валидируются до записи; невалидная запись при запуске сохраняется, автосохранение выключается прежним UI.
- UI: точные Range-вводы, обработанные примеры/обновления/эквивалентные эпохи, абсолютная цель1..40эпох, A/B по примерам или обновлениям, отдельные rawBCE/L2/objective. Все настройки опыта сбрасывают обучение; цель бюджета не сбрасывает.
- Проверено на этой копии: `pnpm test` 204/204; `pnpm typecheck`; `pnpm build` PASS. Node 24.19.0, pnpm 11.25.0, Vite 7.3.7. Manifest/lock неизменны, новых зависимостей нет.
- Финальные tests/build после guard v1 и исправления warning A/B прошли; проверенные исходники соответствуют code commit выше. Логи: `work/minibatch-tests.log`, `work/minibatch-build.log`; `git diff --check` PASS.
- Независимый read-only review: все размеры 1..96 по 3 эпохи; точный restore→next step для SGD/Momentum/Adam при batch 1/7/33/95/96, λ=.17; ручной штраф [1,2,3bias] λ=.1. Findings core отсутствуют. В UI logic исправлено некорректное утверждение о единственном отличии λ; расчёты бюджетов/осей/objective и переходы состояния без найденных дефектов.
- Browser desktop/mobile320px, keyboard, CSS200%, import/reload/pause: **pending координатору**. Серверы и браузер в дочернем чате не запускались. Озвучивание отменено пользователем.
- Следующий шаг этого чата: отдельный commit документов, обычный push и local/remote SHA. Следующий шаг координатора: cherry-pick code commit и реальная UI-приёмка после объединения.

## Источники (проверены web, 2026-10-12)

- [Deep Learning §8.1.3](https://www.deeplearningbook.org/contents/optimization.html): обновление оценивает средний градиент подвыборки train.
- [Dive into Deep Learning §3.7](https://en.d2l.ai/chapter_linear-regression/weight-decay.html): λ/2||W||², производнаяλW; bias обычно не регуляризуют. Здесь L2 именно входит в gradient objective, включая Adam, без decoupled AdamW.

## Интеграция и проверка родителем

Компонент уже подключён в `learning-lab/src/Experiments.tsx:11`:

```tsx
const BoundaryPlayground = lazy(() => import('./BoundaryPlayground').then(module => ({ default: module.BoundaryPlayground })));
```

Он рендерится в `Experiments.tsx:134` как `<BoundaryPlayground />`; дополнительных imports/routes не требуется.
`BoundaryPlayground.tsx:4` импортирует `BoundaryComparison`, строка 179 рендерит `<BoundaryComparison slots={slots} />`.
Cherry-pick только code commit, затем объединить documentary checkpoint по необходимости.

Приёмка UI: открыть лабораторию сети → «Данные и сеть», batch 7, λ=.1, три seed 42/9/1337;
сделать 13 шагов (91 пример), сохранить JSON/A, следующий короткий batch 5 до шага 14 (96 примеров).
Reload/import A → следующий шаг должен дать те же weights/probe. Сравнить A batch 7 до 2 эпох
(28 updates / 192 examples), B batch 96 до 2 эпох (2 updates / 192 examples); ось examples, затем updates.
Invalid JSON в любом A/B не заменяет опыт. При уходе в понятие/другой урок — пауза.
