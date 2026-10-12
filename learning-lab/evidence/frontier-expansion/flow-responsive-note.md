# FlowPlane: измеряемый viewport и горизонтальные checkbox

2026-10-12, Europe/Moscow. Изменены `learning-lab/src/FlowGeometryLabs.tsx`, `flow-geometry.css` и по дополнительному разрешению `representation-frontier.css`. Математические модули не изменены.

Основной агент воспроизвёл на 320px viewport: SVG шириной 233.2px с фиксированным viewBox 420 уменьшал подписи 15px до 8.33 экранных px (`m02-flow-before.jpg`). Новый FlowPlane измеряет фактическую content width через ResizeObserver; SVG viewBox имеет ту же ширину, единицы SVG соответствуют CSS px. У области построения квадратная форма и одинаковый scale для x/y; поля 32px слева и 16px справа, 3 подписи −2/0/2 на ось, шрифт 12px. ClipPath, grid, стрелки и частицы используют те же вычисленные границы. Размеры маркеров и отступы также остаются в экранных px. Нулевая ширина скрытой панели игнорируется; observer отключается при unmount.

Рамка перенесена на отдельный контейнер `.fg-plane-view`: измеряемая content width исключает border и совпадает с шириной SVG. При ширине SVG 233.2px plot side=185.2px; при 420px plot side=372px. Реальный extent данных остаётся [−3.2,3.2]². В существующем CSS grid-line stroke был задан только для `.chart`, поэтому FlowPlane получил собственную область действия для сетки.

Общая причина вертикального checkbox подтверждена чтением `styles.css`: `label { display:flex; flex-direction:column }`. Прежние `.fg-check` и `.frontier-check` задавали display:flex, но сохраняли column. Теперь `.flow-geometry-lab .fg-check` и `.representation-frontier-lab .frontier-check` явно задают `flex-direction:row`. Вторая правка добавлена по наблюдению основного агента (`m10-jepa-collapse.jpg`); JSX и math представлений не менялись.

Проверка: Node v24.19.0, cwd `learning-lab`, команда:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit
```

**PASS** после изменения TSX. Последующее изменение `representation-frontier.css` затрагивает только CSS-направление. Браузер, сервер и общий build не запускались по указанию основного агента; подтверждение реальных 12px и desktop/mobile screenshots остаётся за его проверкой. Математические тесты не повторялись: эта правка не меняет модель, данные, ODE или обработку событий обучения.
