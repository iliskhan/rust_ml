# Независимое review: обучение Transformer, BPE, FFN и LoRA

Дата: 2026-10-12, Europe/Moscow (UTC+03:00), проверки около 12:20–12:22.
Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`.
Базовая ревизия задачи: `417fb4ffb9ffe1139498ec64b67e876d11c17703`;
review относится к новым незакоммиченным файлам, перечисленным ниже.

## Вывод и findings

**Конкретных исправляемых ошибок P1/P2/P3 в проверенной области не найдено.**
Математические формулы, ориентация матриц и показанные численные метрики
соответствуют реализации. Production-файлы reviewer не изменял.

- Tiny Transformer: полный pre-LN causal forward и reverse-mode backward
  проходят через все 208 обучаемых коэффициентов. Mean CE делит градиент на
  число целей. Future keys отсутствуют в графе. Residual и общий embedding
  суммируют градиенты правильно. Вычитание числового максимума в softmax/CE
  допустимо: производная общей сдвиговой константы сокращается.
- `trainSteps` берёт только `TINY_TRAIN`; validation используется только в
  evaluate/trace. Разделение текстов настоящее, но переходы цикла знакомы;
  ограничение обобщения прямо указано в интерфейсе.
- BPE считает соседние пары с перекрытием, заменяет без перекрытия слева
  направо, применяет выученные правила по порядку. Unicode code points,
  отсутствие normalization/byte fallback, JSON/UTF-16 tie order и неизвестные
  ID честно обозначены. Поле ограничено именно UTF-16 единицами, как написано.
- GELU реализует и дифференцирует одно и то же tanh-приближение. SwiGLU
  использует SiLU(g) × up и обе ветви производной. Gate не выдан за вероятность;
  параметры 24/36 при одинаковой ширине, ReLU subgradient в нуле обозначен.
- LoRA использует column-vector convention: W[3×8], A[r×8], B[3×r], BA[3×8].
  Одновременное обновление A/B использует одно старое состояние; W₀ заморожена
  в LoRA. MSE нормирован на 3N. Full и LoRA видят одни train данные; held-out
  в градиент не включён. α/r=1, отсутствие bias и памяти экономии при r=3
  явно указаны. Ранг задачи 3 подтверждён ненулевым minor, а не названием.
- 3D FFN/LoRA оси — реальные три выходные компоненты; indices/epochs не
  подменяют пространственные координаты. Численная альтернатива имеется.

## Запущенные targeted tests

Из `learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/tinyTransformerMath.test.ts tests/tokenAdaptationMath.test.ts
```

**14/14 pass**, 0 fail; duration 253.2 ms. Это целевой запуск двух файлов,
не повторный запуск всей suite.

## Дополнительные независимые численные probes

Через тот же Node, `--input-type=module -e <script>`, imports из двух math-файлов:

1. Все 208 центральных разностей ε=10⁻⁵ дополнительно проверены на
   `initialTinyParameters(5), [0,0,1,0,2]` и
   `initialTinyParameters(23), [3,0]`: **416 производных**, максимальная
   абсолютная ошибка **6.658235074397112e-11** (assert < 3e-7).
2. После 120 SGD, seed по умолчанию, η=0.08, чередование train 0/1:
   train CE **0.041752448015533516**, accuracy **1**;
   validation CE **0.38736821364141677**, accuracy **0.75**;
   по 8 целей, изменены **16/16** групп.
3. Границы UI Tiny, 400 шагов: η=.01 даёт train CE .48376418970040724,
   validation CE .5822693202516961; η=.2 даёт train CE .001075214660524626,
   validation CE .007654192578080532. Параметры/метрики конечны.
   На последней модели проверены ещё **208** центральных разностей:
   max |error| **3.7860344105134815e-11**.
4. Независимый LoRA fixture: W=0, строки A выбирают x₁/x₂,
   B=[[1,2],[3,4],[5,6]], x=[3,7,0,0,0,0,0,0].
   Выход точно **[17,37,57]**, первые два столбца BA равны B.
5. `adaptationData(3).targetDelta`: determinant первых трёх столбцов
   **−0.007845782402043004**, подтверждающий rank=3.
6. `trainAdaptation(rank, taskRank, noise, eta, 1000)` для всех
   rank∈{1,2,3}, taskRank∈{1,3}, noise∈{0,.5}, eta∈{.05,1}:
   **24 запуска**, все history MSE конечны и LoRA W точно равна BASE_WEIGHT.
7. Дополнительные BPE train/apply roundtrip для ZWJ-emoji, combining accents,
   одиночных surrogate code units, null/newlines, повторных emoji и пустого
   текста: точное восстановление, совпадение train/inference токенов и
   отсутствие неизвестных ID на собственном корпусе.

Общий дополнительный объём Tiny FD: **624 коэффициентных проверки** на
трёх состояниях, включая обученное. Ни одна не заменяет browser-render проверку.

## Fingerprints проверенных файлов (SHA-256)

| Файл | SHA-256 |
|---|---|
| `tinyTransformerMath.ts` | `CABDB8CC23BB551EB3DD07386FCECC8C5998F3941F53F4FE101D23E25A2DD8FC` |
| `tokenAdaptationMath.ts` | `CD338E7D0C3BA428550074F3E7E57FE5DC81550B56C917590BE4D9FF3A6B98A1` |
| `TinyTransformerLab.tsx` | `752C45FCC947C509FF23308FEC2EFBC3A041455B4CA532CE3558D23581AE7F5D` |
| `TokenAdaptationLabs.tsx` | `6BE1DF6F0298A5E0B35E1CFE9D458FA8D79E5208753CF00EA3D896DD4919D76D` |

Ограничение review: rendered desktop/mobile, клавиатурные сценарии и общий
build/suite/commit/push остаются у основного агента. Внешние ссылки здесь
повторно не исследовались; review проверяет код и честность локальных labels.
