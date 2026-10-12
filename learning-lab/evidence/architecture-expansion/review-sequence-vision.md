# Независимый review: sequence / vision

Дата: 2026-10-12, Europe/Moscow. Checkout:
`C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, HEAD `417fb4f`, Node `v24.19.0`.
Проверены текущие незакоммиченные `efficientSequenceMath.ts`,
`EfficientSequenceLabs.tsx`, `visionRoutingMath.ts`, `VisionRoutingLabs.tsx`.
Эти четыре файла не менялись ревьюером. Browser и общий build не запускались.

## Вывод

P1/P2 в математике и подписях на доступных диапазонах интерфейса не обнаружены.
Существующие 18 targeted tests прошли. Независимые дополнительные проверки:
324 конфигурации online attention, 50 неосевых gated-delta fixtures,
216 конфигураций MoE из диапазонов UI, 36 конфигураций MLA.

### P3: потеря устойчивости MoE при capacity и underflow вне диапазона UI

Место: `src/visionRoutingMath.ts:68-71` (нормировка `selectedWeight / keptMass`).
Функция принимает произвольные конечные входы, но при полном underflow вероятности
оставшегося после capacity маршрута вычисляет `0/0`. Возможен принятый маршрут с
NaN-весом и неверным `fullyDropped=true`.

Воспроизведение из `learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module -e "import {mixtureExpertsTrace} from './src/visionRoutingMath.ts'; const t=mixtureExpertsTrace([[0,2000],[2000,0]],2,1).tokens[1]; console.log(t.routes.map(r=>({expert:r.expert,accepted:r.accepted,weight:r.weight})),t.output,t.fullyDropped);"
```

Наблюдение: expert 0 отклонён, expert 2 принят с `weight: NaN`, output
`[NaN, NaN]`, `fullyDropped: true`. Первый токен занимает capacity экспертов 1 и 0;
у второго остаётся эксперт 2, чья вероятность softmax округлилась до нуля.
Корректная нормировка принятого единственного маршрута равна 1.

Минимальное исправление при расширении API: вычислить устойчивый softmax заново
по **scores принятых маршрутов**, а `fullyDropped` определять по числу принятых.
В интерфейсе признаки и router bias ограничены [-2; 2], поэтому этот случай
сейчас недостижим обычными controls и не блокирует лабораторию.

### P3: схема MLA опускает коэффициент выбранного масштаба

`src/EfficientSequenceLabs.tsx:19` всегда показывает `c = xW_down`, хотя
`src/efficientSequenceMath.ts:66` вычисляет `c = scale · xW_down`.
Воспроизведение: выбрать масштаб 0 — вся таблица c становится нулевой, формула
остаётся прежней. Ползунок назван честно, основной расчёт правильный; для точной
связи схемы с экспериментом достаточно написать `c = s · xW_down`.

## Проверенные механизмы

- **MLA:** для row-vector convention `(c U_K)·q = c·(q U_Kᵀ)`;
  `Σ a_j(c_j U_V) = (Σ a_j c_j)U_V`. Content и RoPE имеют по две координаты,
  поэтому denominator `√(2+2)=2` верен. Общий RoPE key остаётся отдельным,
  будущие позиции получают нулевые веса. Максимальная разница двух способов
  вычисления в 36 дополнительных fixtures: `4.440892098500626e-16`.
  Это проверка заданной factorization, не lossless-сжатия любых MHA весов.
  Подпись UI прямо сохраняет это ограничение. Основание:
  [DeepSeek-V2, §2.1 и Appendix C](https://arxiv.org/html/2405.04434v5).
- **Кэш:** latent 4 скаляра/токен = c(2)+RoPE(2); expanded 12 = две головы ×
  (content K(2)+RoPE K(2)+V(2)). Это корректно для явно объявленного развёрнутого
  baseline. Если отдельно переиспользовать общий RoPE в expanded baseline,
  ему хватило бы 10 скаляров; текущий UI не заявляет минимальность baseline
  и прямо печатает свою формулу. Оценки не выдаются за фактический heap.
- **Online attention:** отдельно пересчитанный полный softmax совпал на
  324 комбинациях Nq∈{1,3,7}, Nk∈{1,4,9}, d∈{1,2,5}, dv∈{1,3},
  tile∈{1,2,5}, causal∈{false,true}. Детерминированные случайные Q имели
  масштаб 100; max error `2.220446049250313e-16`. Рескейлинг старых l/z при
  росте m верен. Оценка live scalars явно идеализирована и исключает trace.
- **SSM:** `expm1(Δa)/a · Bx` — правильный интеграл ZOH при постоянных на
  шаге параметрах; `exp(Δa)` — decay. Все a отрицательны и ненулевые.
  Полное Mamba не заявляется. График/3D используют три реальные компоненты h.
- **SSD / gated delta:** размерность S — value×key. Развёрнутая формула
  `αS(I−βkkᵀ)+βvkᵀ` совпала с 50 независимыми fixtures с произвольным
  единичным k, а не только coordinate-axis keys. Ошибка читается после decay,
  как в [Gated Delta Networks, Eq.10](https://arxiv.org/html/2412.06464v2).
  SSD recurrence также соответствует §2.1 этой статьи. Гибрид подписан как
  собственная смесь 1/2 delta + 1/2 attention, без заявления реализации Qwen.
- **ViT:** patchify действительно покрывает пиксели без перекрытия;
  проекция общая, позиции зависят от координат, внимание немаскированное,
  residual действительный. Заявлен только ручной мини-проход, без обучения
  распознавания, CLS или полного ViT. Attention не объявляется causal attribution.
- **MoE:** параметры пересчитаны по массивам: router `2×3+3=9`,
  эксперт `2×3+3+3×2+2=17`, всего `9+3×17=60`. Active 26/43 при свободной
  capacity корректны. 216 комбинаций controls дали конечные выходы,
  loads≤capacity и сумму принятых весов 1 (или 0 при полном drop).
  Порядок токенов, tie-break, отбрасывание без перенаправления, повторная
  нормировка и отсутствие residual при полном drop честно описаны.
- **U-Net / DiT:** реально вычисляются две ступени pool и upsample,
  concat [up, encoder] и decoder с коэффициентами skip. DiT реально делает
  patchify, time addition, QKV attention, residual FFN, readout и unpatchify.
  Оба меняют выход от t при фиксированном noisy input. Shared x_t,
  epsilon target, MSE и algebraic x0 estimate правильны. Веса ручные,
  генерация и обучение не заявлены; DiT явно назван подобным блоком без adaLN.

## Запуск и границы

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/efficientSequenceMath.test.ts tests/visionRoutingMath.test.ts
```

Результат: 18/18 passed, exit 0. Дополнительные fixtures выполнены отдельным
inline Node script через stdin; seed=19, LCG 1664525/1013904223, atol=1e-9.

SHA256 проверенных файлов (порядок: sequence math, sequence UI, vision math, vision UI):

```text
5E083227D23D14A04FEC53D2C5F5080FC0E23324AB660224C86E2C4BD7162540
33A31E40AD63864C84D299002349D4746E63E12E8B21578582F962088E0B3E96
FF1D98E7CF6728355EEFAFE22E6B6A0670F7305794A66E8556F0DBB0A432C8F3
A028606DB533334DC9C46E708DF7925113A11CBB29C90E7AFB5C93EB6C831C3B
```

Review ограничен математикой и правдивостью текста. Отображение, клавиатурная
навигация, mobile layout и общая интеграция остаются ответственностью основного агента.
