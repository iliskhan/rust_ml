# RustML Learning Lab — состояние

Обновлено 2026-10-11 07:16 Europe/Moscow. Учебник находится в основном проекте:
`C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`. План интеграции и проверки всего проекта —
[../PROGRESS.md](../PROGRESS.md); `work/progress.json` — краткая проекция состояния учебника.

## Готово

Расширение математики/Transformer и рекурсивное изучение предпосылок реализованы и проверены.
Основной checkpoint — корневой PROGRESS. Рабочие заметки исполнителей — `work/ux-progress.md`,
`work/curriculum-progress.md`, `work/transformer-progress.md`.

- 30 связанных понятий и 14 типов численных демонстраций; маршрут gradient → derivative → limit/function.
- Возврат сохраняет параметры, шаг, прокрутку и фокус; посещённые уроки остаются смонтированными.
  Автообучение при уходе или погружении ставится на паузу. Состояние — до перезагрузки вкладки.
- 8 подробных разделов Transformer: embeddings, attention, MHA/GQA/MQA, PE/RoPE, residual/FFN/norm,
  encoder/decoder/cross, KV-cache, teacher forcing и sampling.
- 24 темы карты курса в 6 этапах с отметками реальной глубины; поиск понятий и тематические маршруты.
- Группировка навигации, компактные списки на mobile, постепенное раскрытие математики.

## Проверка расширения

2026-10-11, тот же основной checkout и Node24.19.0/pnpm11.25.0: `pnpm test` — **54 passed, 0 failed**;
`pnpm build` — strict typecheck и Vite без предупреждения о большом chunk. Набор зависимостей не менялся.
Четыре Astra ultra участвовали в реализации/независимом review; подтверждённых существенных дефектов
при review не осталось. Основной агент проверил production UI на desktop, 320×800 и 390×844,
возврат из понятий, паузу XOR, восемь разделов Transformer и отсутствие console errors/warnings.
Все 48 защищённых исходных файлов совпадают по SHA256; Rust-исправления сохранены.
Артефакты: [evidence/EXPANSION.md](evidence/EXPANSION.md).

## Ранее перенесённые лаборатории

- Карта цикла, нейрон/Linear/активации, MSE/BCE и общий узел backprop.
- SGD/momentum/Adam и полный цикл XOR 2→4→1.
- Dense, Conv2D, RNN/stacked/bidirectional, LSTM, GRU, Transformer/self/cross/causal attention.
- Запуск из корня Windows: `.\learn.cmd`. Node24+, pnpm11.25.0. Скрипт ставит зависимости
  по lockfile, открывает браузер на `http://127.0.0.1:5180/`; остановка Ctrl+C.
- Для другого порта: `.\learn.cmd --port 5181`. На других системах — команды из README.
- Добавлен отдельный CI job web tests/build; удалённый запуск не выполнялся.

## Проверка после переноса (до расширения, историческая)

2026-10-11, основной checkout master на базе `9e6606aceacd9cf684996073499141b0fcd32028`.
Изменения остаются незакоммиченными. Windows, Node24.19.0/pnpm11.25.0.
`pnpm install --frozen-lockfile`, `pnpm test` и `pnpm build` (включая typecheck) прошли;
22 tests, 0 failed. Код src/tests и lockfile побайтно совпадают с исходным worktree.
Rust-исправления сохранены и проверены отдельно; подробности в корневом checkpoint.

В браузере основного preview: XOR 3000 шагов, seed42, Adam eta=.03 → BCE1.02e-4, 4/4.
Decoder Q1 → [1;0;0]; desktop и viewport320 осмотрены, горизонтального overflow нет,
console error/warn отсутствуют. Launcher проверен из другого каталога; повторный запуск
на занятом порту возвращает code1 и оставляет первый сервер работающим.
[Подробности и скриншоты](evidence/INTEGRATION.md).

## История и границы

Исходная приёмка в worktree3061 (в том числе все маршруты desktop/390/320) сохранена в
`evidence/VALIDATION.md`; `evidence/source-hashes.json` содержит пути именно того checkout.
Эти исторические материалы не заменяют текущую проверку интеграции.

Расчёты самостоятельные на TypeScript, не используют Rust API. Кроме XOR демонстрируются
малые прямые проходы без обучения больших моделей; поддержанные варианты и схемы расширения
перечислены в `docs/architectures.md`. Следующий необязательный шаг — новые учебные варианты
или отдельный адаптер к стабильному Rust API. Блокеров текущей задачи нет.
