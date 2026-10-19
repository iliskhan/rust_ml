# Playground — проверка 19 октября 2026

Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, baseline
`4730658c5b5b96f04660748027efa83744ce3a74`; исходно чистое дерево.
Область: B12/B13, R01/R02/R04/R05/R06, U02/U04/U05/U06/U07/U08.
План и статус — корневые PLAN.md/PROGRESS.md. Windows, bundled Node24.19.0.
Результаты относятся к исходникам с SHA256 из `source-hashes.json`.

## Что выпущено

- Два открытых no-code опыта: скрытый слой и порог/применение/обучение.
  Прогноз до действия, численные снимки, объяснение без автооценки,
  объективные вопросы, новые ID и отдельная история раскрытия/помощи.
- Отдельные локальные записи по guest/account scope, версия формы, Web Locks,
  очередь быстрых вводов, CAS и монотонные disclosure receipts. Решение и помощь
  открываются только после успешной записи; отказ сохраняет черновик в памяти.
- Train24/48/96 как вложенные сбалансированные подмножества; corruption0/10/20%
  затрагивает только train labels, с видимым фактическим числом. Validation32 неизменна.
- Входы raw(u,v) / radial(u,v,u²+v²), согласованные layout/градиенты/trace/диагностика.
- Frozen модель/порог/основание выбора, затем test32 отдельного потока; история
  раскрытий переживает reset/A/B/import/film restore. Новые сохранения v3,
  legacy-v1/v2 продолжаются точно. Test identity не зависит от выбранной модели.

## Воспроизводимые проверки

Bundled runtime:
`C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Обычный PATH node использует недоступный в sandbox Volta shim. Vite config bundle
через esbuild пытался читать недоступный родительский каталог; использован штатный
`--configLoader native`. Глобальные настройки и зависимости не менялись.

Из `learning-lab` (вместо `node` ниже — указанный полный путь):

```powershell
node --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
$env:VITE_BASE_PATH='/rust_ml/'
node node_modules/vite/bin/vite.js build --configLoader native
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5194 --strictPort --configLoader native
```

**658 tests:653PASS,0FAIL,5opt-in skipped**, exit0; typecheck/build exit0.
[Tests](tests.log), [build](build.log); пустой `typecheck.log` соответствует exit0.
Full suite включает замороженные film replay и прежние лаборатории; fixtures
и Rust-код не изменены. Все три оптимизатора и реальные старые v1 exports проверены.
Новые тесты покрывают mixed-layer radial finite differences, вложенные
данные/изоляцию RNG, v3 continuation/rejection, test/validation collision,
frozen result, reused receipts, pending/failed/parallel no-code writes.

[Точные команды ядра и численный прототип](ENGINE.md) дают проверенный пример
переобучения для seed7/42/1337. При24train,20%corruption,16tanh+16tanh,Adam.02,
λ0 от100 до1000шагов train BCE уменьшается, validation растёт во всех трёх случаях.
Для seed42: train.137392987→.000290905; validation1.276869703→2.418659191;
при λ.01 на1000шаге validation.352659414. Это конкретные условия, не гарантия L2.

## Настоящий браузер

CUA IAB, штатные select/buttons/number inputs и клавиатура; evaluate только читает
DOM. React state, localStorage, handlers и DOM программно не подменялись.

Baseline dev: `http://127.0.0.1:5193/#network`, source4730658 до UI edits.
[Desktop1280](before-desktop.jpg), [mobile390](before-mobile-390.jpg).
Dev изменённого UI:24train/32validation,5повреждённыхметок,radial0hidden=4параметра,
цель10эпох=240примеров. После100обновлений:

| Действие | Шаг | p пробы | τ | BCE train | BCE validation |
|---|---|---|---|---|---|
| До |100|.60724|.50|.61477|.54360|
| Только порог |100|.60724|.65|.61477|.54360|
| Только x₁→.25 |100|.39905|.65|.61477|.54360|
| Один gradient step |101|.39914|.65|.61394|.54236|

Снимки, черновики, objective answers и exposed status восстановились после reload.
Переход в diagnostics раскрывает details, фокусирует нужный блок и сохраняет #network.
Frozen evaluation step101 сохраняет числа после шага102; загрузка A, сделанного до
reveal, сохраняет seen/reused и не вычисляет ответ до нового явного открытия.
Seed, создающий совпадающий с train поток, даёт локальную ошибку без падения страницы.

Финальная production: `http://127.0.0.1:5194/rust_ml/#network`, с тем же base path,
что Pages. У preview переменная VITE_BASE_PATH также должна быть `/rust_ml/`.
Через UI выполнены оба700-update запуска hidden опыта (семь кнопок100шагов каждый):
circles,seed42,Adam.02,batch96,λ0,raw. Линейная модель:52/96train,16/32validation,
BCE.689047/.709627;8tanh:96/96,32/32,BCE.004986/.010751. Снимки совпали с числами.
Help→Esc сохранил шаг700/прогноз/снимки. Frozen clean test:32/32,BCE.006684.

Production1280,390×844,320×800 просмотрены. На320 documentWidth305 (скроллбар15),
контролов за правой границей не найдено. Клавиатурный Tab до summary итогового
набора, Enter применения чисел, Esc помощи, focus внутренних переходов проверены.
Таблицы имеют горизонтальную прокрутку; 3D остаётся факультативным.

- [Финальный desktop](after-desktop.jpg)
- [Урок390](after-lesson-mobile-390.jpg), [урок320](after-lesson-mobile-320.jpg)
- [Настройки320](after-settings-mobile-320.jpg), [итоговая оценка320](after-final-mobile-320.jpg)
- [Обученная модель и итоговая оценка](after-final-desktop.jpg)
- [Чистая загрузка, консоль и DOM](browser-final.json):0error/warn после reload.

Экспорт через UI подтвердил подготовку JSON. Ожидание download event в IAB
завершилось timeout; физическое завершение скачивания и OS file chooser не заявлены.
Roundtrip, повреждённый импорт и точное продолжение покрыты численными тестами.
Во время координированных dev edits были HMR ошибки отсутствующих/переименованных
модулей; к финальной production-проверке они устранены. Windows collision имён
BoundaryLessons.tsx/boundaryLessons.ts устранена именем boundaryLessonMath.ts.

## Ограничения

Нет исследования самостоятельного обучения, настоящего мобильного устройства,
NVDA/VoiceOver или полной проверки WCAG. Не измерялись field Web Vitals/INP и
производительность на всех устройствах. Локальные истории доступны пользователю,
не являются защитой от подделки/очистки браузера; успех на32точках не гарантирует
качество в реальном мире. UI не выдаёт просмотр/подсказку за освоение.
Все blocker findings независимого review исправлены и перепроверены до выпуска.
