# Настраиваемые границы решений — приёмка 2026-10-11

Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, baseline
`4ad0dddaf8bfbb051e8407c9342f0115a697282b`. Node24.19.0, pnpm11.25.0;
bundled Node использован из-за неработающего Volta shim. Git-результат — в корневом PROGRESS.md.

## Реализация

Круги, полумесяцы и двухрукавная спираль; 0–3 скрытых слоя, ширина1–16,
ReLU/tanh/sigmoid отдельно для каждого слоя. Выход — sigmoid; средняя BCE от logits,
аналитический backward всех весов и смещений, SGD/Momentum/Adam. Вход центрируется
как 2x−1, оси рисунка сохраняют исходный [0,1]². He uniform для ReLU, Glorot для
остальных слоёв, нулевые bias. 96 train и 32 отдельных validation из двух потоков
генератора с шумом ±.018; validation не входит в градиент. Seed воспроизводит данные
и начальные веса. Новая настройка сбрасывает весь запуск; порог/проба/камера сохраняются.

Одна модель задаёт карту и поверхность p. Порог τ пересекает поверхность, контур
проецируется на пол. Точки данных стоят на z=0 с известным target, проба — на z=p.
Изменение порога не меняет веса или BCE. Сетка32×32 — аппроксимация: малые петли,
касания и соединение ветвей у седла не гарантированы; SVG-перекрытия приближённы.
Подбор по validation не заменяет окончательный test. Все настройки не обязаны сходиться.
Прежний фиксированный XOR, его пошаговая 3D-сеть и поверхности сохранены отдельно.

## Вычисления и сборка

В `learning-lab`: `pnpm test` — **154/154 PASS**, `pnpm build` — strict TypeScript
и Vite production **PASS**. Последняя сборка после финального breakpoint380px.
[Лог тестов](boundary-playground-tests.log), [сборка](boundary-playground-build.log).
9 новых тестов движка: ручной линейный ответ, layout, центральные разности всех
параметров 0–3 слоёв, устойчивость BCE при ±1000, threshold, seed/init, splits,
nonmutation и invalid inputs. 3 новых теста probabilityGrid и 7 прежних XOR PASS.
Независимое review градиентов: 62 параметра, max|Δ|=9.14e−11.
При 2×8 tanh, seed42, Adam .03 за700шагов все три набора решены на96/96 и32/32.
Это проверенная конфигурация, а не обещание любого запуска.

## Настоящий production UI

Собственный preview на `http://127.0.0.1:5182/#network`.
Первоначально CUA не видел браузер, затем политика отклонила вкладку с ошибкой
о протоколе. Пользователь вручную открыл работающий HTTP-адрес; после этого доступ
восстановлен без обхода запрета. Ни DOM, ни React state не изменялись программно:
использованы нативные select/range/buttons, read-only DOM и настоящие screenshots.

- Desktop1280×900, mobile320×800 и390×844: карта/слои/3D просмотрены. Ширина
  document совпала с clientWidth (1265/305/375); clipping подписей отсутствует.
  2D labels12px, 3D11/12px, mobile select16px и44px высотой. В итоговой3D320
  пересечений прямоугольников подписей не найдено. Console warn/error:0.
- Реальные запуски трёх наборов, глубины0/1/2/3, ширины1/8/16, три активации и
  оптимизатора, seed42/1337. Смена architecture/seed/method/rate сбрасывает шаг,
  историю и моменты. Данные при смене architecture сохраняют те же координаты.
- Круги100шагов и спираль300шагов при2×8tanh Adam.02:96/96 train,32/32 validation.
  Спираль100шагов:95/96 и31/32. Видно изменение настоящей границы, а не анимация.
- Threshold .50→.51: p/step/BCE сохраняются, классы меняются. Проба доступна
  с клавиатуры; [.23,.67] независимо сверена. Режим плавной вероятности и выключение
  проекции (0 dashed contour paths) работают. Камера после close/open сохраняет36°.
- Путь «η → градиент → производная → назад → назад → урок» сохраняет шаг100,
  τ=.51 и камеру36°. Auto/100-step queue ставятся на паузу при математике/навигации.
  Реальный cap4000 отключает1/100/Auto; reset возвращает0, сохраняя τ и камеру.
- Прежний XOR после1+100шагов: шаг101, BCE .0334,4/4; новый опыт остался300.
  Прежние forward/backward 3D, граница в3D и поверхность XOR открылись без ошибок.

## Независимая сверка отрисованных чисел

Команда: `node evidence/boundary-playground-dom-check.ts`;
[fixture](boundary-playground-browser.json), [лог](boundary-playground-dom-check.log).
Checker не импортирует новый UI или probabilityGrid. Replay использует отдельно
проверенный движок и прежнюю проекцию. **11 случаев PASS**:

- 11 979 ячеек p/fill (maxΔ5.44e−15), 1408 отметок данных, 11 проб и пар метрик.
- 2072 конца контура: max|p−τ|1.10e−14.
- 2048 граней/6144 вершин 3D: maxΔ9.38e−13px; 6 вершин τ-plane — ошибка0.
- 320 линий slice/floor (maxΔ1.14e−13px), 129 ground/probe points (5.68e−14px).

Массив граней снят двумя read-only выборками, чтобы передать все2048 элементов
при лимите результата2000; исходный DOM count2048 подтверждён отдельно.
[Review и источники](../work/boundary-extended-review.md),
[движок](../work/boundary-engine.md), [UI](../work/boundary-lab-ui.md).
72 прежних web +43 Rust/config SHA совпали,115/115; новые зависимости отсутствуют.
Два разрешённых изменения старого source — integration/intro Experiments.tsx и
общий probabilityGrid в decisionBoundaryMath.ts с сохранённой XOR validation.

## Снимки

[2D desktop](boundary-playground-after-desktop.png) · [3D desktop](boundary-playground-3d-desktop.png)
· [2D320](boundary-playground-map-mobile-320.png) · [2D390](boundary-playground-map-mobile-390.png)
· [3D320](boundary-playground-3d-mobile-320.png) · [3D390](boundary-playground-3d-mobile-390.png)
· [настройки320](boundary-playground-settings-mobile-320.png).

Запуск: `.\learn.cmd` → «Сеть целиком» → «Лаборатория границ: данные и сеть».
