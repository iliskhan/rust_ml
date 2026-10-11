# Проверенный trace сети XOR 2→4→1

Снимок: 2026-10-11 14:16 Europe/Moscow. Авторитетный план и общий checkpoint:
[`../../PLAN.md`](../../PLAN.md), [`../../PROGRESS.md`](../../PROGRESS.md).

Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, исходный и текущий
HEAD `a41e784c65a1541f029b525c431dd6aa1c304c51`. Собственные новые файлы:
`learning-lab/src/networkTrace.ts`, `learning-lab/tests/network-trace.test.ts`
и эта запись. В общем дереве также есть параллельные изменения root/reviewer;
агент trace их не менял. Commit/push выполняет root после общей приёмки.

## Контракт и проверенная математика

- `traceNetwork(parameters, input, target): NetworkTrace` использует существующие
  `activate` и `bceLogit`; архитектура и порядок 17 параметров совпадают с `math.ts`.
- `hidden.index` и `networkParameterName` используют индексы с нуля:
  `W1[0,0]` … `W1[3,1]`, `b1[0]` … `b1[3]`, `W2[0]` … `W2[3]`, `b2`.
- `inputContributions` — два слагаемых `W1[h,x] * input[x]`, без bias.
  `outputContributions[h] = W2[h] * activation[h]`, без `b2`.
- `dLossDActivation = (p - y) * W2[h]`,
  `dLossDPreactivation = dLossDActivation * (1 - activation²)`.
  `parameterGradient` содержит все 17 производных **одного примера**, без `/4`.
  `inputGradient` суммирует вклад четырёх скрытых нейронов в каждый из двух входов.
- Target допускает `[0,1]`, как исходная BCE. Неверные формы, нечисловые/нефинитные
  значения и арифметическое переполнение отклоняются через `RangeError`.

## Доказательства

Среда: Windows PowerShell `login:false`, Node `v24.19.0`.
Рабочий каталог команд: `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`.

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/math.test.ts tests/network-trace.test.ts
```

Результат: **19/19 PASS**, включая 7 новых тестов trace и действующее обучение XOR
на четырёх seed за 3000 шагов. Новые проверки:

- Forward строго совпадает с `predictNetwork` для 3 seed × 5 входов.
- Все 17 производных параметров и обе производные входа совпадают с центральными
  разностями при epsilon `1e-5`, tolerance `1e-7` на 3 различных наборах параметров,
  входах и target `0`, `1`, `0.35`. Численная loss вычисляется независимым путём
  `bceProbability(predictNetwork(...), target)`, без вызова trace.
- Четыре `dLossDActivation` и четыре `dLossDPreactivation` отдельно проверены
  центральными разностями через выходной линейный слой и BCE, подставляя сначала
  активации, затем preactivation с применением tanh.
- Среднее четырёх sample loss и gradient совпадает с `networkLossGradient`
  для seed `1`, `7`, `42`, `1337`.
- Ручная нулевая сеть: `p=0.5`, `loss=ln(2)`, все градиенты нулевые,
  кроме `dLoss/db2=0.5-target` для одного примера.
- При логите ±1000 и target `0`, `0.25`, `1` BCE и градиенты конечны.
- Формы, NaN/Infinity, дырявые массивы, неверный target и переполнение отклоняются.

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --types node --skipLibCheck src/networkTrace.ts tests/network-trace.test.ts
```

Результат: **PASS**, exit 0. Это изолированная проверка trace и его тестов;
общий build и UI-проверки остаются за root.

SHA256 проверенных файлов:

- `src/networkTrace.ts`: `E24D2801B425706098A4E2C543905561C104B8166B4C6275B9FA42BDF9565D2B`.
- `tests/network-trace.test.ts`: `6631D2649A4C3F6812B97A9589D326868337D2652BE42EA854DD2C52A7FD195C`.

Следующий шаг: интегрировать trace в пошаговый UI и выполнить общий test/build,
desktop/mobile приёмку и commit/push. Блокеров модуля нет; `math.ts`, Rust,
зависимости и службы не менялись.
