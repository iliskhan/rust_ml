# CNN и RoPE: интеграция 3D

2026-10-11, 13:26 MSK (UTC+3). Scope этой ветки: `src/ArchitectureLesson.tsx`, `src/TransformerCourse.tsx`, `src/spatialSceneMath.ts`, `tests/spatial-scene.test.ts`, эта заметка. Общий план и финальное commit/push — у ведущего агента; Rust, Git, сервисы и общий build здесь не трогаются.

- CNN: добавлена раскрываемая 3D-стопка с 25/50 реальными входными точками, плоскостями каналов, отдельными рамками девяти sample-позиций каждого канала; padding показан пунктиром. Формулы окна и вклады теперь общие для существующей 2D-таблицы и 3D. Подпись явно различает канал и третью пространственную ось.
- RoPE: раскрываемые пути двух фиксированных исходных пар Q/K используют существующую `rope`; текущие p/distance/shift/pair определяют маркеры. Dot/norm существующего 2D-разбора не изменены. Позиционная ось не объявляется embedding-координатой.
- Камера сохраняется после закрытия details; первый mount происходит только при раскрытии, memo пропускает обновления закрытой сцены. Нового animation loop нет.
- Численные tests написаны: padding/dilation, все поддержанные сочетания CNN + независимая сверка с `conv2d`, известный поворот RoPE, радиус/пара/позиции и full-dot без фиктивной координаты.
- Статус: численная проверка и TypeScript готовы, browser QA ожидается у ведущего агента. Пользовательские 2D-матрицы, dot product и нормы сохраняются. Исходники вне scope не менялись.

Зависимость от Scene3D: согласованный `showLegend?: boolean` внесён renderer-агентом и принят TypeScript; CNN использует false, свою короткую легенду и прежние полные матрицы.

## Проверка

Workspace: `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`; переданный baseline `master@35942ec`, общий checkout параллельно изменяется агентами. Node `v24.19.0`; точные команды:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/spatial-scene.test.ts
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit
```

Обе команды завершились exit 0; 6 tests passed, TypeScript без diagnostics. В `spatialSceneMath.ts` нет `setInterval`, `requestAnimationFrame` или `setTimeout` (поиск `rg` не нашёл совпадений; exit 1 — ожидаемое отсутствие строк).

| Файл | SHA-256 после проверки |
|---|---|
| `src/ArchitectureLesson.tsx` | `13695A9CE73034E8508AD36F81964E0F7BDD957A4E6940F2F983FAB0A23B2BAA` |
| `src/TransformerCourse.tsx` | `ED609D50A8C3116948F614F95AC61DF6DA6989A26E874F9E24D1D7FF9CB164FF` |
| `src/spatialSceneMath.ts` | `644A6F2002E855C102206460051D4CFC50FAF589D2D5E7690708481F6561C2A2` |
| `tests/spatial-scene.test.ts` | `63D8DFA27CFD4EC2F6ED5C8F9FB7A5BB800BAD1EA517C48A5995849100EBA4D7` |

Следующее действие: browser QA у ведущего агента. Раскрыть «3D: каналы и выбранное окно свёртки», проверить два канала + padding=1, затем dilation=2; раскрыть «3D: как пара RoPE вращается вдоль позиции», менять pair/distance/shift. Проверить сохранение камеры после закрытия/открытия, native keyboard controls, touch/page scroll и ширину 320px. После этой проверки ведущий агент выполняет общий test/build и Git checkpoint.
