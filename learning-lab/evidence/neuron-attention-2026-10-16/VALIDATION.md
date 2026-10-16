# ManimGX: нейрон и attention — приёмка 2026-10-16

Срез B12/R01/R04/R06 и U02/U04/U05/U07/U08, продолжение backprop-пилота.
Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, master, база проверенного
diff `f372fdbb25ca443b5f49154a5740d669fa108b05`. Доставка записывается ниже.
Существующие расчёты и самостоятельные задания сохранены; просмотр ролика
не создаёт свидетельство освоения. Общий B12 и полный U00/U07 не закрываются.

## Числа и воспроизведение

- Нейрон: `linear`/`activate`/`activationDerivative` экспортируют fixture:
  x=[1,2],w=[1,−1],вклады=[1,−2],b0→2,z−1→1,a0→1.
  Производные0/1 дополнительно сверены конечными разностями вдали от излома.
- Attention: `projectTokens`/`attentionTrace`, SMALL_INPUT/SMALL_PROJECTIONS,
  query1,causal=true,scale=true,T1. Raw scores=[0.5,1,1.5], divisor=√2;
  будущий score хранится как null с явным allowed=false, что означает−∞.
  Веса=[0.41252099916039026,0.5874790008396098,0],
  выход=[0.7062604995801951,0.5874790008396098]. Есть независимый расчёт
  softmax двух доступных ключей и покоординатной смеси V.
- Node v24.19.0, cwd=`learning-lab`:
  `node --test tests/lesson-animations.test.ts tests/backprop-animation.test.ts tests/math.test.ts tests/action-exercise.test.ts tests/attention-geometry.test.ts tests/transformerMath.test.ts`
  — **38/38 PASS**. Новые caption-тесты проверяют непрерывность VTT0–44/50с.
- `node node_modules/typescript/bin/tsc --noEmit` — PASS;
  `VITE_BASE_PATH=/rust_ml/ node node_modules/vite/bin/vite.js build` — PASS.
  Bundled Node: `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.

Python3.13.2/ManimGX0.1.1/Pillow12.3.0, окружение `work/backprop-pilot/venv`.
Команды воспроизведения — в README каждой сцены. Штатный `manimgx inspect`
после исправлений: neuron13 кадров (3,8,12,15,20,22,24.5,28,31,34,37,41,end),
attention14 кадров (6,10,11.5,16,20,22.7,24,29,33,37,40,43.8,48,end),
**layout: no problems**. Все страницы storyboard просмотрены. Проверка
выборочная, не доказательство отсутствия проблем в каждом промежуточном кадре.
Первый проход нашёл6/11 проблем, исправлены стрелки, ширина текста и дроби;
при визуальном осмотре итоговая сумма attention упрощена под субтитры.
Временный пробный mocked construct завис; его подтверждённые процессы
остановлены. Для повторения использовать штатный inspect/render.

Финальные `render-assets.py` сохраняют MP4 и постер из одного FrameSink:
neuron44с/poster34с, attention50с/poster40с;1280×720,30fps.
Chrome сообщает44.033333/50.033333с из-за закрывающего кадра.
Файлы без аудиодорожки, объяснение в русских captions и текстовой альтернативе.
Собственные сцены, без заимствованного видео/персонажей3Blue1Brown.

## Реальный браузер

Chrome через CUA, local dev `http://127.0.0.1:5186/`, production preview
`http://127.0.0.1:5187/rust_ml/`. Desktop viewport1440×900, mobile390×844
и320×800 (ширина документа375/305px с полосой прокрутки).
Исходные desktop снимки сохранены до интеграции.

Проверено наблюдением:

- Оба MP4 загрузились с1280×720, autoplay=false, русская track=showing.
  Кнопки глав открыли neuron34с/attention40с на паузе; Enter для глав работает.
  Space запускает нативное видео. На desktop формулы/captions/controls разнесены.
- Переходы к лаборатории остановили видео и установили focus соответственно
  `neuron-controls`/`attention-controls`. Открытие текста остановило attention
  на0.983831с. Переход от нейрона к backprop остановил его на34.22697с;
  смена вкладки Attention→Головы также остановила ролик.
- Живая лаборатория: neuron при w=[1,−1],b2 далz1/a1;
  attentionquery1 дал[0,706;0,587], causal=false дал[1,068;0,775].
  Ролик сохранил фиксированный пример, настройки меняли существующий расчёт.
- Ручной путь «Видео не запускается?» показал статус и кнопку повторения;
  retry вернул attention MP4 в0с на паузе. Автоматический сетевой error-path
  отдельно не симулировался; стандартный onError проверен чтением кода.
- Mobile390/320: без переполнения страницы (scrollWidth=clientWidth),
  отдельная колонка глав, фактическая высота кнопок≥46.8px. В квадратном
  контейнере кадр располагается выше субтитров/controls. На маленьком экране
  подробные векторы мелкие: полный смысл доступен в раскрываемом тексте
  и таблице; таблица attention также укладывается в ширину233/304px.
- Production preview загружает media/poster под `/rust_ml/animations/...`.
  Backprop после выделения общего player: глава4→38с на паузе, возврат
  фокусирует `backprop-walkthrough`.

Ограничения: viewport emulation, не настоящий телефон; экранный чтец,
полный zoom/WCAG-аудит и исследование с учениками не проводились. Ветка
visibilitychange сохранена в исходнике, скрытие реальной вкладки отдельно
не воспроизводилось. Пауза inactive/unmount и пользовательские пути проверены
в указанном объёме. Полный Rust/grader suite не запускался для media/UI diff.

## Доказательства

- `*-before-desktop.jpg`: исходные уроки; `*-after-desktop.jpg`: новые кадры.
- `*-after-mobile390.jpg`, `neuron-after-mobile320.jpg`,
  `attention-text-mobile320.jpg`: мобильные кадры/текст.
- `*-inspect*.png` и `*-inspect.log`: финальные выбранные кадры/layout.
- `asset-hashes.json`: SHA256 исходников сцен, fixtures, MP4/poster/VTT.
- `tests.log`, `typecheck.log`, `build.log`: вывод проверок.

## Доставка

Commit/push, CI/Pages и публичная проверка ожидают завершения; результаты
добавляются в PLAN/PROGRESS после получения подтверждения.
