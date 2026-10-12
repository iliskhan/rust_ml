# ViT, MoE, U-Net → DiT: локальный checkpoint

Дата: 2026-10-12 12:17 MSK (UTC+03:00).
Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`.
Базовая ревизия: `417fb4ffb9ffe1139498ec64b67e876d11c17703`.

Готовые именованные экспорты `VisionTransformerLab`, `MixtureExpertsLab`,
`ImageDenoiserLab` находятся в `learning-lab/src/VisionRoutingLabs.tsx`.
Математика: `visionRoutingMath.ts`; scoped CSS: `vision-routing-labs.css`.
Новые зависимости не добавлены. Использованы существующие операции Transformer
и компоненты Range/Exercise/fmt.

- ViT: редактируемые 16 пикселей, четыре патча, одна общая проекция, реальные
  координаты row/column для позиции, Q/K/V, attention, residual и mean pooling.
  Выбор патча подсвечивает именно его четыре исходных пикселя. Матрицы доступны
  таблицами. Внимание не заявлено доказательством причинной важности.
- MoE: четыре редактируемых токена, три отдельных FFN 2→3→2, scores/softmax,
  top-1/top-2, capacity 0…4, tie по меньшему номеру эксперта. Порядок capacity —
  по токенам 1→4; overflow отбрасывает маршрут без reroute. Оставшиеся маршруты
  перенормируются; при нуле маршрутов выход [0,0], без residual. Подсчитаны
  действительные 60 параметров: router 9 + три FFN по 17, а также использованные
  для выбранного токена параметры (9/26/43 после capacity).
- U-Net: вычисляемые convolution/tanh, pooling 4→2→1, nearest upsample 1→2→4,
  два настоящих concat [up, skip], два decoder и ε-readout. Skip можно отключить.
- DiT: реальная patch projection, spatial position, timestep embedding,
  Q/K/V attention, residual, FFN и 2→4 readout с обратной укладкой патчей.
  Оба предиктора используют одно xₜ и показывают ε̂, известную цель, MSE и
  алгебраическую оценку x̂₀. Все веса ручные; обучения/генерации не заявлено.
  DiT здесь упрощён до аддитивного времени, это не полная adaLN-архитектура статьи.

Проверка из `learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/visionRoutingMath.test.ts
```

Результат: **11/11 pass**, 0 fail (145.7 ms). Проверены независимые точные
fixtures: раскладка патчей 0…15; uniform ViT attention=1/4 и output=[3.2,-.4];
FFN и weighted MoE; tie/полный и частичный overflow/renormalization; zero-padding,
pooling, upsample; skip contribution; влияние времени при фиксированном xₜ;
diffusion input/inversion/MSE; отсутствие мутаций входа и недопустимые аргументы.

Следующий шаг основного агента: интеграция в уроки, TypeScript/build и общие
тесты, desktop/mobile browser-проверка, источники, PLAN/PROGRESS, commit/push.
Браузерную проверку и общий build этот подагент по согласованной области не запускал.
