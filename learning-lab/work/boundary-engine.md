# Настраиваемая сеть границы решения — численная проверка

Снимок: 2026-10-11 16:14 MSK. Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`,
ветка `master`, базовый HEAD `4ad0dddaf8bfbb051e8407c9342f0115a697282b`.
Авторитетные общий план и итог остаются в корневых `PLAN.md` / `PROGRESS.md`.
Scope этой подзадачи: `src/boundaryNetworkMath.ts`, `tests/boundary-network.test.ts`, эта заметка.
Остальные изменённые файлы принадлежат координатору и параллельным агентам.

## Контракт и состояние

- Реализованы circles/moons/spiral с 96 train и 32 validation, каждый split сбалансирован по классам.
  Validation использует отдельный детерминированный поток PRNG; координатный шум равномерен ±0.018,
  метки неизменны. Данные лежат в `[0,1]²`; вход сети центрирован как `2x−1`.
- Архитектура: 0–3 скрытых слоя, ширина каждого 1–16, tanh/ReLU/sigmoid; выход всегда sigmoid.
  Раскладка каждого слоя — row-major `W[out,in]`, затем `b[out]`; максимум 609 параметров.
- Инициализация: He uniform для ReLU, Glorot uniform для tanh/sigmoid, bias равны нулю.
- BCE вычисляется устойчиво из logits. Backward возвращает средние градиенты всех параметров.
  Порог применяется только в accuracy; обучение его не принимает.
- Старые `math.ts`, XOR и Rust не изменены. Использованы существующие активации, BCE и Adam.
- Возобновлённый исходник движка прошёл проверки без исправлений. Добавлены численные тесты.

## Проверено

Windows PowerShell, Node `v24.19.0`, рабочий каталог `learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/boundary-network.test.ts
```

Результат: 9/9, exit 0, 725.2872 ms. Проверены ручной ответ 0-hidden сети с центрированием,
раскладка двух hidden units, все параметры при 0–3 слоях центральными разностями,
ReLU с гарантированным запасом до излома, BCE при logits ±1000, влияние порога,
He/Glorot bounds и масштаб, нулевые bias, воспроизводимость и отдельные split,
отсутствие мутаций, отклонение неверных форм/NaN/Infinity/sparse arrays/переполнений affine sum.

Отдельный воспроизводимый численный прогон и включённый regression test:
`2→8(tanh)→8(tanh)→1`, seed 42 для данных и параметров, Adam lr=0.03, 700 полных train-шагов.

| Набор | Train BCE | Validation BCE | Верных train / validation |
| --- | ---: | ---: | --- |
| circles | 0.000103127518 | 0.000432264740 | 96/96 / 32/32 |
| moons | 0.000139051464 | 0.000118389311 | 96/96 / 32/32 |
| spiral | 0.000125572401 | 0.000300930411 | 96/96 / 32/32 |

Это проверка выбранного малого примера, не гарантия сходимости всех разрешённых настроек.
Validation не передаётся обучающему циклу. Начальные train BCE: 0.703968160566,
0.733743992093, 0.673329228785 соответственно.

SHA256 проверенных файлов:

- `src/boundaryNetworkMath.ts`: `ECF52440F9AA462CBFB0FFBDF2CE8A94AF500556819AD345C563C8084D6E4B65`
- `tests/boundary-network.test.ts`: `077E1DB5D4E9F8139A09C000EC4A85E274664D3869B4CBF74BAFAA29C0212A6D`
- Неизменённый `src/math.ts`: `7417FAE9CA3F9052EBCDEDD84B6A7FD34F48F235DBAFCD9B83AE578609375943`

## Следующий шаг

Координатор интегрирует UI/сетку, запускает общие tests/typecheck/build, проверяет настоящий
desktop/mobile, обновляет PLAN/PROGRESS и выполняет commit/push. Здесь общие checks и Git-запись
не выполнялись. В sandbox чтение Git требует отдельного `-c safe.directory=...`; global config
не изменялся. Оптимизация вычисления сетки пока не нужна без измерения в UI.
