# RustML Learning Lab — состояние

Авторитетный план: `work/progress.json`. Область работы: только `learning-lab/` в `C:/Users/lomaster/.codex/worktrees/3061/rust_ml`; исходный HEAD `9e6606aceacd9cf684996073499141b0fcd32028`. Rust crates и корневые документы не меняются. Коммиты, публикация и merge не выполняются.

## Первая версия завершена

- Карта цикла, уроки neuron/Linear/активаций, MSE/BCE и общего узла backprop.
- Общая поверхность для SGD/momentum/Adam и детерминированный полный цикл XOR 2→4→1.
- Dense, Conv2D с каналами/stride/padding/dilation/pooling, RNN (в том числе stacked/bidirectional), LSTM/GRU и маленький Transformer с маской/головами/self/cross-attention.
- Простые SVG, React/TypeScript/Vite, данные и вычисления локально.

## Проверенная математика

2026-10-11, Windows, Node v24.19.0 / pnpm v11.25.0, этот detached checkout. Финальные команды из каталога учебника: `pnpm typecheck`, `pnpm test`, `pnpm build` — exit 0. 22 теста проходят: ручные числа, конечные разности всех 17 параметров, накопление двух ветвей, Adam, четыре seed XOR за 3000 шагов и 10 тестов архитектур. Исходники и тесты зафиксированы хешами в `evidence/source-hashes.json`; tracked Rust/root файлы неизменны, Git показывает только `?? learning-lab/`.

В поддерживаемом браузере осмотрены desktop и ширины 390/320 px. Все восемь маршрутов без горизонтального переполнения; основные контролы и все шесть семейств проверены. Исправлены подписи Q и адаптивные SVG Dense/attention/backprop. В production повторно обучен XOR: BCE=0.0001015905, 4/4, seed42, Adam η=.03; causal mask Q₁=[1;0;0]. Console error/warn не наблюдались. Подробные команды, raw наблюдения и screenshots: `evidence/VALIDATION.md`.

Установка: pnpm v11.25.0, lockfile сохранён, esbuild разрешён через `allowBuilds`. Ограничение sandbox registry решено разрешённым сетевым запуском. `tsx` исключён: нативный Node 24 запускает TypeScript тесты без этого пакета.

## Передача и продолжение

Локальный dev preview: `http://127.0.0.1:5177/`, owned exec session 31713. Временный production preview 5178 завершён после QA. Повторный запуск: Node24+, `pnpm install --frozen-lockfile`, `pnpm dev --port 5177 --strictPort`. README содержит точные команды, архитектуру, охват вариантов и ограничения.

Обязательных незавершённых этапов и блокеров нет. Возможное дальнейшее развитие — дополнительные численные варианты или отдельный адаптер к стабилизированному Rust API; это новый объём работы. Большие модели не обучаются; Conv1D/3D и ряд вариаций честно отмечены как схемы. Коммиты/merge/публикация не выполнялись.
