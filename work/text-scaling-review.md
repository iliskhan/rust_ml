# Проверка исходников для text enlargement / reflow

Read-only аудит 2026-10-12, checkout `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, исходная ревизия задачи `9a5680c`, ветка `codex/ui-ux-learning-lab`. Рендер и настоящий screen reader этим агентом не запускались. Ниже — механизмы и сценарии для основной браузерной проверки, **не подтверждённые визуальные дефекты**. Исторические 192 tests/typecheck/build не являются приёмкой этой задачи.

## Продолжение: исправление воспроизведённой камеры

Root в настоящем IAB на320×568 воспроизвёл «Сеть → 3D нейроны → Поворот»: slider width `0.6000000238px`. Переданный root screenshot: `learning-lab/evidence/accessibility/camera-mobile-before.jpg`. Это превращает сценарий2 ниже в наблюдаемый дефект; остальные исходные сценарии сохраняют статус гипотез до проверки root.

По дополнительному поручению изменены только `learning-lab/src/network-flow3d.css` и `learning-lab/src/range-control.css`:

- Camera становится одной колонкой при viewport≤600px.
- Range inputs используют `flex-wrap`, slider `flex:1 1 80px`, точное число `flex:0 1 6.25rem;width:6.25rem;max-width:100%`. При rootfont16 и ширине Range≥192px прежние100px поля и12px gap сохраняются; при нехватке места поле переходит на следующую строку. При rootfont32 база числового поля200px, поэтому рост текста не отнимает остаток slider.
- Все `font-size` и размеры текста в `font` shorthand этих двух файлов заменены px→rem относительно16px. Layout px, borders, SVG coordinates и математика не менялись.

Статическая проверка `rg` подтверждает отсутствие font px в двух файлах и наличие responsive camera/flex rules. Этот агент не запускал браузер, тесты, build, сервер или Git. Состояние — **На проверке** у root: slider≥80px на320, точные значения не обрезаны при настоящем browser text enlargement200%, desktop вид сохранён. SVG node/caption теперь тоже растут с browser font; их фактические границы требуют визуальной проверки. Ниже зафиксированы исходные механизмы до этого patch.

## Приоритетные сценарии

1. **P1, возможное схлопывание содержимого диалога.** `learning-lab/src/styles.css:101,104,121–122,129`: `.knowledge-explorer` имеет ограниченную viewport высоту и `overflow:hidden`; `.explorer-header` и `.explorer-footer` — `flex-shrink:0`; `.explorer-viewport` — `min-height:0;flex:1;overflow:hidden`, а прокрутка есть лишь у `.explorer-frame`. Рост текста может оставить frame без доступной высоты. `KnowledgeExplorer.tsx:60–66` содержит одновременно название урока, длинную кнопку закрытия, breadcrumb, кнопку назад и status message. Проверить при реальном text-only zoom 200% на 1280×720 и 320×568: открыть понятие, перейти ещё на два уровня, вызвать сообщение, добраться до начала/конца урока и закрытия клавиатурой. Измерить header/footer/frame clientHeight и видимые границы. Минимальное исправление после воспроизведения: дать всему диалогу один доступный вертикальный scroll fallback и снять жёсткую 100% высоту frame в этом режиме; `.explorer-topline` разрешить перенос. Не увеличивать фиксированную высоту viewport.

2. **P1, узкий ползунок в сетке камеры.** `learning-lab/src/network-flow3d.css:50` оставляет `.network-flow-camera` в двух колонках; mobile-правило на строке 93 меняет лишь gap. `learning-lab/src/range-control.css:19–24` резервирует 100px для точного числа и 12px gap независимо от доступной ширины. При камере шириной примерно 248px каждый Range получает около 120px и оставляет slider порядка 8px. Проверить раздел Network Flow на 320px: оба ползунка камеры, ввод -65/45, Tab и стрелки. При 200% текста проверить видимость чисел/спиннера. Минимально: mobile camera в одну колонку; точный ввод через ширину в em/rem или перенос inputs в одну колонку при недостаточной ширине, без JS breakpoints.

3. **P2, подписи SVG не имеют запасов для роста текста.** `learning-lab/src/ui.tsx:73–98`: фиксированные left58/top18/bottom226, viewBox height276, xLabel baseline269, повёрнутый yLabel x14. `.chart svg text` в `styles.css:2` — 12px. При фактическом увеличении шрифта до24px длинная xLabel или y ticks могут выйти из viewport; вертикальная подпись имеет лишь14px до края. Конкретно: «Нейрон», активация с xLabel «Взвешенная сумма z», а также Boundary loss. Проверить getBBox/text bounds относительно viewBox и настоящий скриншот на320px, затем 200% text-only. Минимально подтверждённый проблемный label перенести в HTML figcaption/axis key либо резервировать поля от фактического размера шрифта. Один `overflow:visible` может дать перекрытие соседнего блока и не является достаточной проверкой.

4. **P2, 3D clipping с фиксированными отступами.** `learning-lab/src/Scene3D.tsx:75,110–112` рисует текст внутри clipPath, clamp x к17px/10px, y к14px; `scene3d.css:9–10` задаёт tick11px/name12px. После text enlargement длинный числовой tick может быть обрезан по краю даже при anchor middle. Проверить rotation/scale extremes, Front/Top, отрицательные диапазоны на320px и200%. HTML `.scene3d-axis-key` уже даёт диапазоны и `.scene3d-data` — числа: сохранять их. Минимальное исправление при воспроизведении — поля с учётом размера шрифта/вынесенный текстовый слой, не менять физические/embedding координаты.

5. **P2, геометрия Attention и A/B.** `AttentionGeometry.tsx:33–43` размещает heading y17, нижнюю подпись y350 при viewBox height355, а label ключей с фиксированным 14px шагом; `attention-geometry.css:2` допускает overflow visible, а mobile строки23–26 увеличивают SVG font до16px. При200% text-only проверить верхнюю подпись, соседние k/v labels и отсутствие перекрытия абзаца/таблицы. В BoundaryComparison.tsx:25 верхняя подпись y12, SVG viewBox260×275; `boundary-playground.css:23` font11px, mobile14px. Проверить A/B оба варианта и оси. Имеющиеся HTML таблицы — полезная альтернатива, но сами по себе не доказывают, что увеличенные видимые подписи не теряют текст.

## Что не выглядит самостоятельным дефектом по исходникам

- `action-exercise.css:1–16` уже имеет min-width0, overflow-wrap:anywhere, перенос кнопок и max-width100%;320px даёт кнопки полной ширины. У `ActionExercise.tsx` нет fixed height. Нужен реальный сценарий start/check/finish, однако добавлять layout fix без воспроизведения не требуется.
- `concept-search.css:5–16`: dialog max-height без overflow:hidden, header flex-wrap, результаты block и overflow-wrap:anywhere. Проверить начало/конец results и возврат фокуса; на основании исходников преждевременно обвинять fixed-height search в clipping.
- min-height у buttons/inputs задаёт нижнюю границу, поэтому само по себе не обрезает увеличенный текст. Fixed-height visual canvas отличается от fixed-height текстового блока.
- Горизонтальная прокрутка таблицы и breadcrumbs не равна горизонтальной прокрутке всей страницы; проверять отдельно область scroll и page scrollWidth.

## Контракт честной проверки увеличения

Большинство font-size в styles/search/boundary задано в px; Transformer преимущественно rem. Изменение только `html {font-size:200%}` или браузерного default font с16 на32 не увеличит px-шрифты. Такой запуск нельзя объявлять полноценным text-only200% без измерения фактически увеличившихся элементов. Нужна настоящая функция браузера text-only zoom либо явно описанная тестовая подмена computed font-size всех текстовых элементов, включая SVG; второе является стресс-тестом, а не свидетельством работы настоящего browser text-only zoom. Полный browser zoom200% — отдельная проверка. Для каждой фиксировать viewport, режим, исходные/новые font-size и screenshot.

Screen-reader claims требуют наблюдаемого вывода настоящего SR. DOM/ARIA и browser accessibility tree полезны для диагностики, но не подтверждают произнесённую последовательность или live announcement.

## Воспроизводимый CSS stress200% стенд

По дополнительному поручению добавлен `learning-lab/evidence/accessibility/prepare_text_scale.py`, Python stdlib. Автор агент **не запускал** скрипт, сборку или сервер; последующий запуск и браузерная приёмка — root.

Пример из корня checkout:

```powershell
python learning-lab/evidence/accessibility/prepare_text_scale.py learning-lab/dist work/a11y-text-before
```

Скрипт требует production `index.html` и **новый** output внутри текущего worktree, вне source dist. Existing directories не удаляются и не перезаписываются. CSS преобразуется перед копированием; при отсутствии CSS/absolute font sizes запуск отклоняется. Source dist остаётся неизменным. JSON stdout содержит source/output, число CSS файлов, изменённых деклараций и удвоенных absolute size literals.

В копии font-size px/pt/vw умножаются на2 (включая значения в clamp/calc); в shorthand `font` меняется лишь размер шрифта, а line-height и остальные размеры сохраняются. В CSS добавляется `html{font-size:200%!important}`, поэтому rem/em получают рост через корневой шрифт, без повторного умножения относительных единиц. CSS comments не меняются.

Это **CSS text stress test в настоящем браузере**, не доказательство native text-only zoom. Inline style/HTML, JavaScript, SVG `font-size` attributes и custom properties скрипт не меняет. Размеры в других единицах (например vh/ch) не масштабируются отдельно. Настоящие browser font preferences и speech output настоящего screen reader требуют своей проверки; стенд не заменяет их и не обходит отказ/таймаут Computer Use permission. Для before/after использовать разные output directories, тот же viewport и фиксировать счётчики/фактические computed font-size/скриншоты.
