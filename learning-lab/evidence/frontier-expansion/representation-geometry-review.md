# Независимая проверка representation / flow / geometry

2026-10-12, Europe/Moscow. Read-only review четырёх исходных файлов; запись этого отчёта — единственное изменение проверяющего агента. Браузер, общий build, shared-файлы и commit/push не выполнялись.

Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`; HEAD `035866823921e15656c87484f092d508dc194f6c`. Проверены незакоммиченные файлы. SHA256 снимка:

| Файл в learning-lab/src | SHA256 |
|---|---|
| representationFrontierMath.ts | 9B954B1AD331D09657FA6100E35923095BDB3E83C9E6C60E1E294A8491B25D08 |
| RepresentationFrontierLabs.tsx | 4FA591DB76128A07C5A236AD7D4A9D79E16E52B8BB32B0B8CB3724AB1229604A |
| flowGeometryMath.ts | DC5442C9211FC8732BA2B7DB894501223887D459CCD73A9ED057F7BD4F98AA07 |
| FlowGeometryLabs.tsx | 4B94FD5F0E8F6AC43D72923CEF7BD703EAE4DA395E4FB44DB46804F7E6AE551A |

## Findings

**Закрыто после review:** Jacobian epsilon-ветки исправлен; отдельная регрессия
проверяет 27 почти нулевых image-параметров, итоговый suite 331/331 PASS.
Ниже сохранено исходное finding и хеш проверенной на тот момент версии.
Финальные хеши и browser-проверка — в README.md этого каталога.

**P3 — неверный Jacobian CLIP-нормировки при срабатывании epsilon floor.**

`representationFrontierMath.ts:26` вычисляет `y=x/max(1e-12, ||x||)`. Строка 44 всегда применяет производную обычной unit-нормировки `(g−y(y·g))/length`. На ветке `||x||<1e-12` знаменатель постоянный: верная производная `g/1e-12`, без вычитания проекции. Это воспроизводимый математический дефект, но обычные исходные веса и предоставленные UI-контролы его не вызвали. Отдельно: на floor-ветке embeddings не имеют длину 1, что нормально для защитного clamp, однако это исключение к общей формулировке UI.

Воспроизведение (cwd `learning-lab`, Node v24.19): взять `clipInitial()`, умножить все `image` веса на `1e-13`, `text` оставить исходным, вызвать `clipObjective(p)`. Для image[0][4] analytic = `-2579360170.194824`; central differences с h=`1e-18` = `-1907474733.7199936`. Нормы выданных embeddings: `[0.0568717080, 0.0202362209, 0.0772778396, 0.0474767176]`.

Минимальное исправление: сохранить исходную норму или признак floor и на этой ветке использовать `dUnit/length`. Проверить finite differences при маленьком, но ненулевом encoder; точка самой границы max недифференцируема и для такого теста не подходит. Finding передан основному агенту немедленно. В этом отчёте исправление не подтверждено; при изменении хеша требуется повторный targeted test.

Серьёзных ошибок обучения, заявлений о несуществующих вычислениях или ложного обобщения benchmark в проверенном снимке не обнаружено.

## Выполненные проверки

Среда: Windows PowerShell; `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`, Node v24.19.0. Cwd: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml/learning-lab`.

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/representationFrontierMath.test.ts tests/flowGeometryMath.test.ts
```

**20/20 tests PASS**, 1.24 s. Проверены finite differences обоих MLP output activations, всех 39 CLIP weights, tied superposition, JEPA context/predictor, KAN/MLP; изменение весов и loss; flow held-out + sample geometry; E(3)/permutation; density training; Beer–Lambert и лучи камеры.

Дополнительно выполнен независимый inline Node probe без записи исходников:

- CLIP: явное вычисление `−Σ(log P_image[i,i]+log P_text[i,i])/8` совпало с loss; положительное масштабирование image/text проекторов сохраняет loss; радиальный dot(weights, gradient)≈0 отдельно у каждого проектора на обычной unit-ветке.
- JEPA: изменение только masked patch на +99 не меняет context/prediction, но меняет target. Target точно сохраняется при `ema=1` после 500 SGD. Ненулевой постоянный latent `[.7,−.4]` с identity predictor имеет loss=0 и target variance≈0: детектор проверяет коллапс по изображениям, а не только нулевые веса.
- Patching: оба знака исходной метки, все три neuron и zero/mean baselines; `Δlogit=v_j(h_clean,j−h_corrupt,j)` и BCE совпали с независимо записанной формулой. Действительно меняется одна скрытая активация.
- KAN: 303 дополнительных значений для 3/7/15 knots; неотрицательная partition of unity, не более двух ненулевых hat basis. UI корректно раскрывает аддитивность и невозможность представить xy одной суммой двух одномерных рёбер.
- MSE/backprop: нулевая сеть с target `[2,4]` даёт loss=10 и выходные bias gradients `[-2,−4]`, что независимо подтверждает нормировку по двум outputs.
- ODE: midpoint для time-only поля `[t,t²]` за 32 шага дал `x=.5`, `y=1/3−1/(12·32²)`, как в точной формуле ошибки midpoint quadrature.
- EGNN: 100 независимых Rodrigues rotations вокруг случайной 3D-оси, отражения, переносы; используемый probe не вызывал `orthogonalVector`/`equivarianceTrace`. Максимальная компонентная ошибка векторной эквивариантности `1.6653345369377348e-16`. Скаляры также инвариантны. Структурная причина — distance-based scalar messages и относительные векторы; отсутствие chirality/нечётных признаков не выдаётся за полную модель молекул.
- Volume: неравномерные sigma и delta подтвердили `T=exp(−Σsigma·delta)`; постоянный цвет дал `(1−T)c+T·background`.
- Camera: 375 лучей (25 yaw × 5 u × 3 v), единичные направления, sample positions внутри куба; для densityScale=1.7 результат `T_scaled=T_base^1.7` совпал. Ray distance, sigma units и alpha/weight normalization соответствуют UI.

Итог независимого probe: PASS. Одна первоначальная команда floor-probe была запущена из корня repo вместо `learning-lab`, дала `ERR_MODULE_NOT_FOUND` без математического выполнения; исправлен cwd, повторный запуск выявил P3 выше. Это не отказ проверяемого модуля.

## Оценка соответствия UI реальному механизму

CLIP открыто использует четыре one-hot text features и запоминает четыре пары; zero-shot и естественный язык не обещаются. Superposition обучает tied W и bias; причинный классификатор отдельный и фиксированный, что написано прямо. JEPA stop-gradient не обновляет teacher градиентом, EMA использует новый student; fixed-target loss и target variance показывают движение цели и вырожденный нулевой контроль. KAN — именно linear B-splines на фиксированной сетке, общая train/held-out выборка с MLP, без заявления об общем превосходстве.

Flow learning regresses conditional straight-path velocity; generation интегрирует только learned vθ по текущей ODE-точке. UI различает conditional и marginal trajectories и не называет descriptive shape error расстоянием распределений. EGNN демонстрирует фиксированный equivariant блок, не выдает ручные коэффициенты за обученную молекулярную модель. Neural field действительно обучает 340 MLP weights по координатным sigma/RGB образцам и рендерит learned field; reference source отделён. Ограничения по обучению без фотографий/направления взгляда явно обозначены.

## Пределы результата

Это математический и содержательный source review, не визуальное одобрение desktop/mobile. Синхронное обучение и рендер-производительность в браузере не замерялись. Проверены заданные корректные UI-входы и указанные probes; произвольные некорректные публичные вызовы helpers, очень большие веса и все возможные floating-point пределы не охватывались. Источники и shared-файлы не изменялись.
