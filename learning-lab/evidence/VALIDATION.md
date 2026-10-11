# Приёмка первой версии

Дата: 11 октября 2026 (Europe/Moscow). Worktree: `C:/Users/lomaster/.codex/worktrees/3061/rust_ml`, detached HEAD `9e6606aceacd9cf684996073499141b0fcd32028`. Все новые файлы находятся в `learning-lab/`; tracked Rust и корневые документы не менялись. Коммиты, merge и публикация не выполнялись.

## Среда и команды

Windows; Node `v24.19.0`; pnpm `v11.25.0`; TypeScript `5.9.3`; Vite `7.3.7`; React `19.3.0`. Исполнитель использовал bundled Node `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` и pnpm entry `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.cjs`; каталог Node был впереди PATH, чтобы обойти недоступный sandbox Volta shim.

Из `learning-lab/`:

| Команда | Наблюдавшийся результат |
|---|---|
| `pnpm install --store-dir .pnpm-store` | exit 0; lockfile сохранён, esbuild postinstall завершён |
| `pnpm typecheck` | `tsc --noEmit`, exit 0 |
| `pnpm test` | 22 passed, 0 failed; [tests.log](tests.log) |
| `pnpm build` | typecheck + production build, exit 0; [build.log](build.log) |
| `node scripts/numerical-summary.mjs` | [numerical-results.json](numerical-results.json) |
| HTTP GET `http://127.0.0.1:5177/` | status 200 |

Финальный bundle: `index-BzADj5rC.js`, 327.28 kB (101.40 kB gzip), CSS 13.75 kB. Хеши исходников и тестов на момент итогового checkpoint находятся в `source-hashes.json`.

## Математические доказательства

Независимые ручные числа для Linear, MSE/BCE, SGD/momentum/Adam, Conv2D/pooling и recurrent-затворов. BCE-logits конечна на ±1000. Два пути общего узла q складываются. Все 17 параметров сети сравниваются с центральной разностью; максимальная абсолютная ошибка в сводке для seed 42 — `7.33e-12`.

Adam η=0.03, 3000 шагов, полный пакет XOR:

| Seed | Начальная BCE | Итоговая BCE | Верных классов |
|---|---:|---:|---:|
| 42 | 0.705729499 | 0.000101591 | 4/4 |
| 7 | 0.729734208 | 0.000098805 | 4/4 |
| 1 | 0.723582295 | 0.000201823 | 4/4 |
| 1337 | 0.694021361 | 0.000111167 | 4/4 |

Attention проверяет суммы весов, маску будущих позиций и влияние источника в cross-attention. LayerNorm проверяется на известном примере и постоянных признаках.

## Настоящий браузер

Использован поддерживаемый `cua_repl` / Codex in-app browser. Desktop около 1265×712, narrow 390×844 и 320×800. На обеих узких ширинах все восемь маршрутов показали `documentElement.scrollWidth === clientWidth` (375 и 305 соответственно). Семейства также проверены на 390px. Матрицы имеют локальный overflow при необходимости, вся страница не выходит за экран.

Проверены карта выбора, keyboard Home/End/стрелки ползунков, sigmoid, MSE, BCE probability/logit и метка; все четыре шага backprop/сброс/новая конечная разность; SGD/momentum/Adam и параметры, реальный уход SGD при η=.4, авто/пауза; XOR 3000 шагов, reset с исходными числами, смена seed/метода, авто/пауза, выбор примера/нейрона и график на шаге 101; Dense 3×5, CNN каналы/stride/padding/dilation/окна/pooling, RNN stacked/bidirectional, LSTM/GRU затворы, Transformer modes/self/cross/mask/heads/positions/source.

При осмотре исправлены слишком мелкие подписи Dense, attention и DAG backprop; они измеряют контейнер и сохраняют читаемый текст. На узком экране Dense и DAG идут сверху вниз. Исправлена подпись источника Q в cross-attention. Автоматическое движение запускается только явной кнопкой; CSS учитывает reduced motion.

Production `dist/` обслуживался через `pnpm preview --port 5178 --strictPort`: карта отрисована, XOR повторно дал BCE `1.02e-4` / 4 из 4, decoder Q₁ дал веса `[1; 0; 0]`. Console error/warn не наблюдались (`[]`). Временный production preview после QA завершён. Рабочий dev preview остаётся на `http://127.0.0.1:5177/` (owned exec session 31713).

Наблюдения: [browser-checks.json](browser-checks.json), [production-browser.json](production-browser.json). Screenshots: [карта desktop](desktop-map.jpg), [XOR после обучения](desktop-xor-trained.jpg), [CNN](desktop-cnn.jpg), [внимание mobile](mobile-attention-diagram.jpg), [Dense mobile](mobile-dense-diagram.jpg), [исправленный DAG mobile](mobile-backprop-diagram.jpg), [карта mobile](mobile-map.jpg). Более ранний `mobile-backprop.jpg` сохранён как до исправления; актуальный граф — `mobile-backprop-diagram.jpg`.

## Границы результатов

Результаты относятся к этим исходникам, маленьким данным и настройкам; не доказывают сходимость произвольных сетей или обобщение. Кроме XOR архитектуры показывают forward, без обучения больших моделей. Conv1D/3D и ряд вариантов отмечены как схемы расширения. Полноценный аудит screen reader или отдельная ОС/браузерная матрица не проводились. Никакие Rust API этим учебником не проверялись.
