# Общий SVG-рендерер 3D

2026-10-11. Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, baseline `master` / `35942ec`.

Согласованный API реализован в `src/ThreeD.tsx` (ленивый wrapper), типы — `src/scene3dMath.ts`. Реальный renderer — `src/Scene3D.tsx`; отдельный CSS ограничен `.scene3d`.

Дополнение API: `showLegend?: boolean`, по умолчанию `true`; используется для сцен со своей сжатой внешней легендой. При узком viewport ticks сокращаются до двух; для почти направленной в камеру оси — до одного. Полные min/max остаются в ключе осей.

Готово: независимая нормализация заданных диапазонов осей; Z вертикальная; yaw/pitch camera; clipSegment/clipPolygon по кубу; общая сортировка surface/line/point по глубине; native range + drag, zoom/reset/front/top; touch pan-y; SVG по измеренной положительной ширине; легенда с разными символами, таблица до 24 отмеченных точек; явное объяснение масштабов, отсечения и приближённой видимости.

Ограничение: средняя глубина примитивов — painter approximation, пересекающиеся грани могут показывать артефакты. Поверхности линейно соединяют переданные образцы. Нулевой/нечисловой диапазон оси показывает сообщение об ошибке вместо SVG.

Проверки на этом checkout с bundled Node PATH: `node --test tests/scene3d.test.ts` — 9/9 passed; `pnpm typecheck` — passed. Known-answer tests покрывают оси, front/yaw/top, dot/norm, viewport/zoom, clipping, sorting, NaN gaps и invalid axes. Следующий шаг — root проверяет реальные встроенные сцены desktop/mobile; визуальная проверка здесь пока не выполнена.
