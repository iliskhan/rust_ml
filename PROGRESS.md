# Прогресс RustML

### Word2Vec — реализовано и локально проверено, 2026-10-23

Запрос пользователя: добавить Word2Vec как полезную тему учебника.
Срез B12/R01/R02/R04/R06, U02/U04/U05/U07; основа master `9c7e8e2`, дерево чистое.
Добавлен открытый `#word2vec` перед Transformer, карточка каталога, ссылка из lookup.
Skip-gram реально обучает две таблицы d=2 с полным softmax; два корпуса, окна 1/2,
выбор пары, прогноз до шага, снимок p/CE, loss history, координаты и косинусы.
Различены статические векторы и контекстный Transformer; CBOW/negative sampling
описаны с честными границами. Есть новый пример без требования программировать.

14 целевых тестов PASS (4 численных + 10 каталог/placement), tsc PASS,
production build с `/rust_ml/` PASS, diff --check PASS. В настоящем браузере
desktop1440/mobile390/320 пройдены обучение обоих корпусов, сброс окна,
Range/точный ввод с клавиатуры, прогноз, помощь/Esc, карта и возврат из lookup.
На default2000 η=.1 CE `2.1971→.9800`, cos(кот,пёс) `.8727→.9998`;
transport/window2 η=.05/200 шагов `2.3013→2.2435`. DocumentWidth375 при390 и305 при320,
широкие таблицы прокручиваются внутри региона; console warn/error0.

[Команды, снимки, доказательства и ограничения](learning-lab/evidence/word2vec-2026-10-23/VALIDATION.md).
Новых зависимостей, изменений Rust, stable practice IDs и пользовательских данных нет.
Задача готова к commit и обычному push текущей master; итоговый SHA сообщается после отправки.

Не запускались полный набор тестов, screen reader, реальные mobile, формальный WCAG
и исследование с учениками. CBOW/negative sampling — пояснения, не trainer;
показанная близость не подтверждает обобщение. U00/U07 и весь B12 этим не закрыты.

### Playground — реализовано и локально проверено, 2026-10-19

Прямое разрешение пользователя: «Сделай всё нужное и залей». Основа master4730658,
основной checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, исходно чистое дерево.
B12/B13, R01/R02/R04/R05/R06, U02/U04/U05/U06/U07/U08; план — секция Playground
в PLAN.md. Выполнены два no-code опыта, отдельное локальное хранение, данные24/48/96,
ошибки train-меток, radial feature, v3/legacy, итоговая оценка frozen модели.

Финальная проверка 19.10: **653PASS/5opt-in skipped, fail0 (658всего)**,
tsc --noEmit PASS, Vite build `/rust_ml/` PASS. После review закрыты CAS race двух
вкладок (Web Locks), преждевременный показ помощи/ответа (persisted barrier),
restoreA/film receipts, safe seed error и неверные формулировки линейности при radial.
10 targeted no-code tests включают pending lock/quota/queued stale draft;
44 targeted core tests включают реальный legacy-v1 exact continuation, data/radial/v3.
Desktop1280 и mobile390 baseline сохранены в `learning-lab/evidence/playground-2026-10-19/`.
Реальные UI действия подтвердили 24/32 точки,5исправленныхметок,4параметра radial,
100→101шаг, независимое влияние порога/пробы/обучения, reload черновика/экспозиции,
frozen final test после обучения и restoreA с remembered exposure, безопасную ошибку
коллизии seed. Финальный production опыт через настоящий UI: circles,0→1слой8tanh,
700обновлений,raw96/32,Adam.02,seed42 дал validation16/32,BCE.709627→32/32,BCE.010751;
frozen test32/32,BCE.006684. Help→Esc вернул шаг700/прогноз/снимки.
Final mobile320 documentWidth305 без выходящих контролов; снимки390/320 сохранены.
После чистой загрузки production консоль error/warn0. Подготовка JSON через UI
подтверждена; фактическое завершение скачивания инструментом не подтверждалось.

[Приёмка, команды, снимки и границы](learning-lab/evidence/playground-2026-10-19/VALIDATION.md).
Финальные source SHA записаны рядом; Rust/зависимости/замороженные film fixtures
не менялись. Релиз `9a70d072c221e434f9ef804dbd6053983d1853d4` отправлен обычным push,
local=remote, дерево после выпуска чистое. [CI39265813723](https://github.com/iliskhan/rust_ml/actions/runs/39265813723)
и [Pages39265813702](https://github.com/iliskhan/rust_ml/actions/runs/39265813702) SUCCESS.
Публичный `https://iliskhan.github.io/rust_ml/#network` в IAB подтвердил новые режимы,
пять переходов и final evaluation; консоль error/warn0.
[DOM и журнал](docs/research/learning-lab-2026-10-14/playground-public-2026-10-19.json),
[снимок](docs/research/learning-lab-2026-10-14/screenshots/playground-public-2026-10-19.jpg).
После commit все17sourceSHA совпали. Закрывающий checkpoint меняет лишь документы и
публичные свидетельства; его Git SHA сообщается после отправки. Собственные preview
5193/5194 остановлены после проверки, временный viewport сброшен.
UI/математика реализованы; образовательная эффективность
и соответствие WCAG не заявлены. Исследование с учениками, реальные мобильные
устройства и экранный чтец не проверялись.

### Playground — проверка основы и проектирование, 2026-10-19

Запрос: тщательно продумать расширение существующей лаборатории.
Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, master,
`ca843d8d0c4c034bcad0b81f90f81f070246794b`; до работы дерево чистое.
Подготовлено [уточнение в PLAN](PLAN.md#развитие-playground--проектирование-2026-10-19):
B12/R01/R02/R04/R06, U02/U04/U05/U07/U08; следующий срез данных — B13/R02/R05,
контекст — B06/U06, наблюдение учеников — B08/R07/U09. Новые функции не реализованы.

Два независимых read-only review: учебные сценарии и техническая совместимость.
Подтверждены уже работающие A/B/batch/L2/hidden representations/диагностика;
первый выпуск — два учебных опыта поверх них. Новые данные и признаки отложены до
соответствующей численной проверки и совместимого workspace v3.
Генератор делает независимые balanced draws 96/32 с coordinate jitter ±.018,
не split общего массива и не повреждение меток (`boundaryNetworkMath.ts:20–58`).
Decoder регенерирует данные, проверяет финальную BCE и численное состояние
(`boundaryExperiment.ts:124–190`); film replay зависит от legacy defaults.
Эти ограничения включены в план. Ни итоговый test, ни новый учебный зачёт не заявлены.
Финальный review выявил отдельный пробел: `PredictionExperiment.tsx:11` и
`learning-context.tsx:25` хранят состояние в памяти. Инженерный
`practice/local-progress.ts:4–8` требует language/code и не подходит напрямую.
План уточнён: маленький отдельный локальный no-code record с проверяемой схемой,
экспозицией, помощью и scope; boundary workspace первого среза остаётся v2.
Оба read-only review завершены, замечания внесены; локальные Markdown-пути
четырёх документов проверены (81/81), `git diff --check` прошёл.

На этой основе bundled Node выполнил команду из корня:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test learning-lab/tests/boundary-network.test.ts learning-lab/tests/boundary-experiment.test.ts learning-lab/tests/boundary-minibatch.test.ts learning-lab/tests/boundary-legacy-export.test.ts learning-lab/tests/boundaryDiagnostics.test.ts learning-lab/tests/foundations-topic-films.test.ts
```

**40/40 PASS**, 0 skipped, exit0. Обычный `node` через PATH не запустился из-за
попытки Volta создать недоступный каталог AppData; bundled Node обошёл shim,
глобальные установки не менялись. Это targeted baseline, не полный suite/build.

Отдельный probe текущего движка: `circles`, seeds 7/42/1337 для данных/init/batch,
0/1/2 скрытых слоя, каждый шириной8/tanh, Adam η=.02, batch96, λ=0,
`advanceBoundaryExperiment(createBoundaryExperiment(settings),700)`.

| Seed | Без скрытых: train / validation | Один слой: train / validation | Два слоя: train / validation |
|---|---|---|---|
| 7 | 57/96 · 14/32 | 96/96 · 32/32 | 96/96 · 32/32 |
| 42 | 52/96 · 16/32 | 96/96 · 32/32 | 96/96 · 32/32 |
| 1337 | 60/96 · 15/32 | 96/96 · 32/32 | 96/96 · 32/32 |

Все девять запусков без численной ошибки. Например, seed42: validation BCE
.709627 → .010751 → .000281 для глубины0/1/2. Это результаты данных конфигураций,
не гарантия сходимости, превосходства глубины или понимания учеником.
Probe исполнялся из `learning-lab` через bundled Node `--input-type=module`,
импортируя `boundaryExperiment.ts` и `boundaryNetworkMath.ts`, без правок исходников.

Проверены первичные страницы Playground и Google ML Crash Course; ссылки в PLAN.
Продуктовый UI в этой документационной задаче не менялся и заново не проверялся;
исследование с учениками, новый U00 и WCAG-проверка не выполнялись.
Следующий шаг реализации: свежий baseline `#network`, затем первый опыт
«Зачем скрытый слой?» вместе с новым вопросом и сохранностью учебного контекста.
Изменения этой задачи ограничены документацией; commit/push фиксируются в ответе
после проверки совпадения HEAD с origin/master.

### Анимации остальных тем — опубликовано и проверено, 2026-10-17

Основной checkout master4065f9f исходно чистый. Добавлены63сцены рядом с
соответствующими лабораториями: основы4,core21,frontier16,generative/graph/RL22.
Полный реестр71вместе с прежними8 — [COVERAGE](learning-lab/evidence/all-topic-animations-2026-10-16/COVERAGE.md).
После замечаний пользователя переработаны все71: геометрия и движение,
Georgia/MathTex, короткие подписи, без голосовой дорожки; captionsdisabled.
Сохраняются численные альтернативы, локальные прогнозы и новый случай,
перенос примера/возврат параметров и остановка автообучения.

Финальный замороженный Python/fixture/narration sourcehash
58bf33ea1abcedbc04cfa8a513f8278f0f0ed8481fa8c2603cc49233714d30a4.
Последовательный native batch:71/71inspect+renderexit0,497selectedsamples;
получены новые720pMP4 и постеры. Layout и отдельный визуальный/численный
review исправили плотные схемы, маски, SwiGLU, MLA и ViT;6Coreсмысловых
замечаний повторно просмотрены. Media71/71PASS:1280×720,нетsounтреков,
source40/44/50s,encodedдобавляет1–2кадра, допуск2/30s явно записан.
BundledNode24.19:78/78целевых;full640tests=635PASS/0fail/5opt-inSKIP.
tsc--noEmit ифинальныйVitebuild сVITE_BASE_PATH=/rust_ml/PASS.
213/213distMP4/PNG/VTTсовпали сpublicSHA256.

Первоначальная браузерная проверка16октября ограничилась71mount/metadata
и66mobileблоками: поздние click/keyboard не срабатывали даже на details,
а часть restore-сравнений не подтверждала промежуточного действия. Этот
ограниченный отчёт сохранён исторически; причина не объявлялась appbug.
17октября доступный Chrome подтвердил74наблюдения для всех71ролика:
Restore включается после Apply; повтор не затирает первую копию;74/74точно
возвращают видимые контролы;74/74главы открывают ожидаемый кадр на паузе,
720p/captionsdisabled. У10наблюдений before!=applied,64уже начинались
с чисел примера. Dense1.3→0.7→1.3 проверен отдельно.
Mobile390: добавлены5семейных блоков, итоговая геометрия71по двум срезам,
0pageoverflow/0outviewport, главы≥44px. Нейрон1.5→1→1.5 и глава34черезEnter;
активацияnaturalplay4→pause9.032651s→ответEnter/Верно→seek30sзакрывает
вопрос и оставляет паузу. Нейрон/активации также320px; реальные экраны и
границы — [VALIDATION](learning-lab/evidence/all-topic-animations-2026-10-16/VALIDATION.md).
После сверки новой геометрии обновлены8прежнихVTT;11/11затронутых
регрессионных тестов повторены. Финальный tsc/buildexit0,213/213SHAсовпали.
Релиз63930f3bc890059e4afb96db145cc8cf395c9030 отправлен обычнымpush,
local=remote; [CI38963965181](https://github.com/iliskhan/rust_ml/actions/runs/38963965181)
и[Pages38963965078](https://github.com/iliskhan/rust_ml/actions/runs/38963965078)
SUCCESS. HTTPHEAD16октября20:42:38UTC:71/71публичныхMP4HTTP200/video/mp4,
Content-Length совпал с финальными локальными файлами. Это проверка доставки
и размеров, не удалённый SHA. Публичный нейрон:1280×720/44.033s,
autoplayfalse,captionsdisabled; consoleerrors/warnings0, реальный экран
сохранён. Checkpoint23e0c2f91a9ee1e477f45b65fd2c0bed17a96a0b также имеет
SUCCESS [CI38964444506](https://github.com/iliskhan/rust_ml/actions/runs/38964444506)
и[Pages38964444487](https://github.com/iliskhan/rust_ml/actions/runs/38964444487),
проверено17октября. Новая Chrome-приёмка относится к нему и снимает прежнее
ограничение фиксированного click-сценария. Источники/медиа не менялись.
Финальный checkpoint меняет только журнал/доказательства; его SHA/local=remote
проверяются послеpush. Собственные5191/5192 остановлены, слушающих портов нет.
Временная viewport-эмуляция сброшена, публичный урок оставлен на паузе34s.
Весь B12/U00/U07,real-device/screen-reader и эффект обучения не закрыты.

### Постоянная работа grader — production проверен, 2026-10-16

SQL007 SHA2567d79a60ba931b4ac43bfafe7d241d451a2d30235c3c250c56b2f2bf214d8b497
применена единожды15:16:22UTC: enabled=true/end=infinity; baseline24/720000
перенесён без reset. Остальные миграции, manifests и Vercel runtime9a78fa5
не менялись. Release checkoutgrader-continuous отa648708 изолировал работу
от текущих анимаций в основном checkout.

Bundled Node24.19: continuous-grading-smoke131PASS15:14:13UTC;
grading-manifests-smoke89PASS15:14:10UTC. Команды и точный модуль PGlite — в
[local-validation.json](learning-lab/evidence/grading/continuous-2026-10-16/local-validation.json).
Независимый review/повтор131PASS15:15:36UTC; ACL/fencing/pins сохранены.
Hosted rehearsalPASS с подтверждённым ROLLBACK; actual apply COMMITacknowledged.
Hosted rollback probe15:23:25UTC: over-cap lifetime/expired ledger admit,
активный лимит запрещает без списания, immutable ledger; все изменения откатились.
Один реальный JS grade2/2PASS через production API; exact ledger1claim,
2creations/60000cpu-ms, expiry=deadline+31d. Lifetime26/780000. Тестовый Auth
GET404, DB fixtures0, собственных VM0; reservation сохранён после удаления.
Snapshotget15:17:10UTC: прежний trustedID,expiresAt=null,statuscreated.
Публичный1280×720 UI: доступная кнопка, pageoverflowfalse; drafts не менялись.

Доказательства — [continuous-2026-10-16](learning-lab/evidence/grading/continuous-2026-10-16/README.md).
Ручное продление больше не нужно. Caps1h/1000 и остальные ограничения сохранены;
скользящий учёт консервативен и не является provider billing meter. Прежняя
запись ниже о сроке15ноября описывает предыдущую конфигурацию и заменена SQL007.
Секреты оставались в локальной памяти; admin key не передавался в Vercel/Git.
Доставка checkpoint завершается обычным push master; SHA/Actions проверяются
после него и сообщаются в итоговом ответе без включения чужой текущей работы.


### Пять сцен, озвучка и учебные действия — готово, 2026-10-16

Объём по прямому запросу:5 новых роликов + улучшение3 существующих, см.PLAN.
Checkout master/a648708, исходное дерево чистое. Проверены текущие player,
лаборатории и установленный голос Microsoft Irina Desktop Russian.
Числа новых сцен экспортированы из math.ts/transformerMath.ts. Пять сцен
отрендерены720p; inspect10/10/10/10/9 выбранных кадров PASS после исправления
наложений. Все8MP4 содержат декодируемую ненулевую mono аудиодорожку:
backprop/neuron44.033с, остальные50.033с. Голос локальный SAPI Irina;
native ManimGX0.1.1 создал AAC без внешнего FFmpeg. Raw WAV игнорируются.
Node24:48/48 релевантных тестов PASS, tsc и финальная Vite production-сборка
PASS. Transfer/restore и локальные вопросы/новые случаи добавлены во все8.
Браузер: Chrome baseline сохранён; соединение Chrome перестало отвечать,
проверка продолжена во встроенном Chromium. Возврат b1.7/sigmoid нейрона,
траекторий шага2/η.2 оптимизаторов и XOR seed7/шага100/предсказаний PASS.
Повторный apply не затирает исходную копию. Нейрон останавливается22.986с
перед ответом, выбор даёт feedback; продолжение вручную и пауза при открытии
нового случая проверены. В production preview `/rust_ml/` дополнительно
прошли transfer/repeat/restore входа/режима/головы heads, позиций/пары/Q RoPE,
префикса/cache/RoPE, w.7/шага3 backprop и X/query/T/mask/scale/этапа attention.
Вес backprop3 корректно представлен ползунком[−3;3]. Mobile390/320:
page overflow0, главы≥44px, таблицы и локальный ответ про сменившийся префикс
проверены. Скриншоты фактического UI сохранены. Финальный tsc повторён(exit0);
24/24 dist MP4/PNG/VTT совпали с public по SHA256. Полная приёмка и ограничения —
[VALIDATION](learning-lab/evidence/animation-expansion-2026-10-16/VALIDATION.md).
Во время приёмки master получил соседний commit891be2f о grader; изменения
math/player/сцен этой задачи им не затронуты. Все изменения задачи сохранены
последующими release commits.
Первый releasee9d5e4d отправлен local=remote; CI38924902864 и
Pages38924902925 SUCCESS. В дополнительном сценарии XOR найдено, что поздняя
глава не закрывала прежний вопрос. Исправлено закрытие на любом seek; браузер
подтвердил pause14.054с→глава37с/questionOpen=false. Ещё6player-тестов,
tsc/build PASS; media24/24 не изменились. Перемотка назад повторно включает
вопрос14.078с; явный пропуск запускает видео. Финальный release
e9b555f100f5546f089a5d4e84d670678ba39d5f отправлен local=remote.
[CI38926262487](https://github.com/iliskhan/rust_ml/actions/runs/38926262487) и
[Pages38926262496](https://github.com/iliskhan/rust_ml/actions/runs/38926262496)
SUCCESS. Все8публичных MP4:HTTP200/video/mp4, bytes совпали с media-verification.
Публичный Chromium после финального deploy: heads/XOR1280×720/50.033с,
autoplay=false; XOR остановился14.021с, переход37с закрыл question и сохранил
паузу. Это наблюдение проверяет именно опубликованное исправление.
Собственные dev/preview5186/5187 остановлены. Закрывающий commit меняет только
этот журнал и PLAN; его SHA/local=remote сообщаются в итоговом ответе.
Полный B12/U00/U07, real-device/screen-reader и эффективность обучения
этими проверками не закрываются. Следующая работа требует отдельного выбора;
данный согласованный объём завершён.

### Анимации нейрона и attention — готово, 2026-10-16

Основной checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, master; исходные
экраны обоих уроков сохранены перед интеграцией. Срез B12/R01/R04/R06 и
U02/U04/U05/U07/U08. Нейрон: x=[1,2],w=[1,−1],b0→2,ReLU0→1.
Attention: query1,causal,T1,веса≈[0,412521;0,587479;0],смесь
V≈[0,7062605;0,587479]. Fixtures получены из расчётов лабораторий.
Node24: `--test tests/lesson-animations.test.ts tests/backprop-animation.test.ts
tests/transformerMath.test.ts` —14/14 PASS. Neuron inspect13 кадров PASS после
исправления6 проблем; MP444с720p30 и poster34с созданы ManimGX0.1.1/Python3.13.2.
Attention inspect14 кадров PASS, финальный MP450с720p30/poster40с созданы.
Расширенная проверка Node38/38 PASS, tsc/build PASS. Общий player прошёл
Chrome desktop1440/mobile390/320: главы/keyboard, pause/возврат/текст,
fallback/retry, живые расчёты; production preview `/rust_ml/` и backprop PASS.
[Полные свидетельства и ограничения](learning-lab/evidence/neuron-attention-2026-10-16/VALIDATION.md).
Первый commit1c8b3dd local=remote; CI38911718961/Pages38911719216 SUCCESS.
Дополнительно исправлена траектория точки ReLU: два участка через0 вместо
прямой над графиком. Финальный inspect16 кадров, включая29.3/29.6/29.9s,
PASS; новый ролик создан. Исправление9ea1a48c34eb619230c0ec72b066d47c7f261f61
отправлено обычным push; local=remote, дерево чистое.
[CI38912396954](https://github.com/iliskhan/rust_ml/actions/runs/38912396954) и
[Pages38912397018](https://github.com/iliskhan/rust_ml/actions/runs/38912397018)
SUCCESS. Публичный Chrome загрузил neuron1280×720/duration44.033333,
attention1280×720/duration50.033333; главы34/40с открываются на паузе,
autoplay=false. HTTP HEAD нейрона:200/video/mp4/475909bytes — финальный MP4.
Viewport восстановлен, собственные локальные серверы остановлены.
Закрывающий commit меняет только этот журнал и PLAN; SHA/local=remote
сообщаются в итоговом ответе. Все проверки исходников относятся к релизу9ea1a48.

### Пилот ManimGX backprop — 2026-10-16

По прямому поручению пользователя реализован отдельный пилот B12 с R01/R04/R06
и U02/U04/U05/U07/U08. Начальный HEAD `3b6dd02`, master основного checkout;
параллельные изменения других задач сохраняются. [Полная проверка](learning-lab/evidence/backprop-pilot-2026-10-16/VALIDATION.md).

Нативный ManimGX0.1.1/Python3.13.2 создал 44с720p30 MP4 и постер; VTT и
видеоблок подключены перед лабораторией. Есть ручной запуск, ключевые кадры,
пауза при уходе/разборе, текст/таблица и ручной путь восстановления видео.
Ползунки и существующий расчёт не заменены; просмотр не засчитывает освоение.
Экспорт fixture из `sharedGraph`, numerical21/21 PASS, typecheck/build PASS;
inspect14 выбранных кадров PASS после исправления наложений формул и captions.
Реальный UI осмотрен desktop/mobile; действия проверены в Chrome после
воспроизведения ограничения ввода встроенного браузера на контрольной странице.

Результаты относятся к файлам пилота; полный Rust/grader suite и исследование
с учениками не повторялись. Browser-сверка закончена в указанном в evidence
объёме; финальные commit/push и Pages проверяются при доставке и сообщаются
в итоговом ответе. Исторический отчёт ниже сохраняет свой первоначальный статус.

Доставка реализации `70f04e97644a47a3609f89a1189578437e9c73d4` подтверждена:
обычный push, local=remote, чистое дерево;
[CI38907090264](https://github.com/iliskhan/rust_ml/actions/runs/38907090264) и
[Pages38907090162](https://github.com/iliskhan/rust_ml/actions/runs/38907090162) SUCCESS.
На публичном [уроке backprop](https://iliskhan.github.io/rust_ml/#backprop)
Chrome загрузил MP4 с1280×720/duration44,033333, autoplay=false;
кнопка четвёртой части открыла38s на паузе. Закрывающий checkpoint меняет
только PLAN/PROGRESS, его local/remote SHA сообщается в итоговом ответе.

### Production grader: включён и проверен — 2026-10-16

Пользователь разрешил production env rustml-grader и вход Supabase через GitHub.
Два restricted DB URL и CRON_SECRET сохранены только в production; admin/owner
ключи в Vercel не передавались. Migration001–006 не повторялись.
Код grader9a78fa5 в READY deployment dpl_4Q2md3L5USs5viDSAq6DBPU81qsA;
GitHub variable VITE_PRACTICE_GRADER_URL содержит полный /api/practice-grade URL.

[Сводка и evidence](learning-lab/evidence/grading/production-2026-10-16/README.md).
Реальные Python4/4, JS2/2, Rust4/4 и неверный Python0/4 дали ожидаемые grades;
свежий клиент прочитал оценки, immutable revision/help/RLS проверены. SQL-only
fencing32/32 PASS с rollback и replay после admission OFF; dedicated TLS2+
18 deny probes PASS. Isolation3/3 и настоящий cron eligible1/deleted1/failed0
PASS. Test Auth GET404, DB fixtures0, own VM0, trusted snapshot сохранён.

Исправлены три наблюдаемых проблемы: чужой resume attempt_not_found→404;
новый пользователь без practice profile→общий404; reaper list limit100→50
по настоящему API ограничению. Старый монолитный test FAIL на SET ROLE сохранён:
owner этого не может; отдельный owner-function SQL probe прошёл без новых grants.
Единичный client network_error предыдущего запуска не воспроизвёлся, причина
не установлена. Все4 real grades были затем подтверждены без retries.

Windows/Node24.19/direct Python/Rust1.87, release9a78fa5:562/562 tests PASS0skip,
typecheck/build PASS. Frontend41fe463 убирает устаревшую надпись о недоступности;
typecheck/build объединённого checkout PASS. Публичные desktop/mobile390/320
осмотрены: server button enabled, page overflow нет, screenshot evidence рядом.
Пользовательские код/помощь/история через UI не изменялись; реальные отправки
выполнялись только на disposable QA identities.

Admission включён13:19:25UTC с сохранением24creations/720000cpu-ms reservations.
Hobby не имеет billing cycle; bounded app window заканчивается15Nov12:48:07.965Z,
лимиты1000creations/3600000cpu-ms. Перед продлением проверить rolling usage,
не сбрасывать reservations. Это не автоматический provider quota reset.
Отдельный backprop-pilot70f04e9 сохранён в общем master. Этот checkpoint
меняет только документы/evidence; его commit/push/merge и CI/Pages текущего SHA
проверяются при окончательной доставке, без рекурсивной записи собственного SHA.

Доставка evidence283be1591b051cd60fd4fabd8605a5b138aa8739 проверена:
master local=remote, дерево чистое, git branch --no-merged master пуст.
[CI38908384001](https://github.com/iliskhan/rust_ml/actions/runs/38908384001)
и [Pages38908383408](https://github.com/iliskhan/rust_ml/actions/runs/38908383408)
SUCCESS. Runtime и UI побайтово соответствуют проверенному41fe463 (кроме документов).
Закрывающий commit меняет только PLAN/PROGRESS; его точный local/remote SHA,
CI и Pages сверяются в итоговом ответе без записи собственного SHA в файл.

### ManimGX для учебника — 2026-10-16

Исследование по запросу о визуализациях как у 3Blue1Brown завершено:
[отчёт, сравнение вариантов и сценарий backprop](docs/research/manimgx-2026-10-16.md).
Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, исходный HEAD
`b0778b1c784fb9be1c42b926d1b01f35fd11b829`; до работы дерево чистое.
Два независимых read-only исследования проверили код интеграции и первичные
источники движка. Выбран предложенный пилот MP4 + действующая лаборатория;
browser WebGPU оставлен для отдельной проверки.
За время работы HEAD обновился до `9683759` (объединение прежних планов).
Новые AGENTS и единая карта перечитаны; проверенные frontend/math файлы
совпали с исходным HEAD. Привязка предложения: B12, R01/R04/R06,
U02/U04/U05/U07/U08; очередность A–D и незавершённый U00 сохранены.

Windows / bundled Node24.19.0 / cwd `learning-lab`:
`node --test tests/math.test.ts tests/math-snapshot.test.ts` — 20/20 pass,
0 fail/skip, exit 0. В том числе finite differences и fixture backprop:
`q=6, p=42, L=800`, вклады `480+40=520`. Это проверка математики пилота,
не доказательство работоспособности ManimGX. Эта задача runtime-исходники не меняла.

Доступный bundled Python3.12.14 не содержит manimgx и ниже его требования
Python3.13+. GPU-запрос в sandbox отказан. Установка, рендер, загрузка runtime,
mobile/UI-приёмка новых сцен не выполнялись. Это границы исследования;
следующий шаг — один пилот по приёмке из отчёта. Прежний blocker grader этой задачей
не затронут.

В этой задаче изменены только отчёт и PLAN/PROGRESS. При финальной сверке найдены
посторонние правки `learning-lab/grader/http-handler.mjs` и
`learning-lab/tests/practice-grader-supervisor-suite.mjs`; они исключены из её commit.
Финальный commit/push и совпадение
local/remote SHA проверяются при доставке и сообщаются в итоговом ответе;
собственный SHA документа не записывается рекурсивно.

### Аудит всей локальной работы и доставки — 2026-10-14

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, master; исходная локальная
вершина `c95dca4`, затем fetch/fast-forward до удалённого `78e664f`.
Последний уже содержал исследовательскую документацию с другого компьютера;
его CI38494053471 SUCCESS подтверждён через GitHub API.

Проверены 12 рабочих копий и 12 локальных веток. Все их вершины совпали с
GitHub через `git ls-remote --heads origin`; открытых PR не найдено.
У четырёх лабораторий код ранее включён через `8571351`, но вершины веток
ещё не были предками master. Математика/тесты идентичны, UI позже расширен;
merge `b6a7a9b` фиксирует их включение и сохраняет текущую реализацию.
После него `git merge-base --is-ancestor` прошёл для всех 12 веток.

В detached `3061` оставались 42 старых файла: 26 совпадают с master,
5 точных версий уже есть в его истории, 11 оригиналов сохранены в
[историческом архиве](docs/archive/local-delivery-2026-10-14/README.md).
Там же сохранены четыре notes, два старых лога и mock preview: всего 19 файлов.
Два независимых read-only аудита подтвердили перенос функциональности и архив;
SHA256/размеры всех 19 Git blobs совпали с исходниками и manifest.
Scoped `.gitattributes` сохраняет точные байты, включая CRLF. Runtime/config diff
`git diff --exit-code 78e664f HEAD -- crates learning-lab .github` пустой.
Новые исходники продукта не добавлялись; старые логи не являются новыми тестами.
Локальные оригиналы preview и вложения чата сохранены на диске; preview имеет
Git-копию в архиве, attachments исключены из публичного репозитория.

Обычный push `d0c74114fff3f88f6d89d278115000d7eefef264` выполнен;
`git ls-remote` подтвердил local=remote.
[CI38560444697](https://github.com/iliskhan/rust_ml/actions/runs/38560444697) SUCCESS:
Node24, Rust1.87 Windows/Linux и current stable.
[Pages38560452709](https://github.com/iliskhan/rust_ml/actions/runs/38560452709) SUCCESS;
адрес [RustML](https://iliskhan.github.io/rust_ml/).
Публичный настоящий browser показал работающие карту, вход и практику;
после новой публикации выполнен reload, осмотр mobile320/390, загрузка practice
и проверка document scrollWidth/clientWidth: горизонтального переполнения нет.
Console errors/warnings — 0; кнопка серверной проверки выключена.
Пользовательские решения и самопроверки не отправлялись. Это smoke/визуальная
проверка доставки; новый полный usability-аудит не проводился.

Закрывающий checkpoint меняет только PLAN/PROGRESS. Итоговые SHA, результаты CI
и публикации итогового коммита фиксируются в
`work/comprehensive-improvements/local-delivery.json` и итоговом ответе;
они не записываются в собственный commit рекурсивно.

Отдельный прежний blocker grader перепроверен: точный GET
`https://rustml-grader.vercel.app/api/practice-grade` вернул
503 `grading_unavailable`. Конкретный запрос на передачу
PRACTICE_API_DATABASE_URL, PRACTICE_WORKER_DATABASE_URL и нового CRON_SECRET
только production-env Vercel-проекта rustml-grader отправлен повторно.
Ответ пока не получен; secrets/admission/миграции этой задачей не менялись.
Остальная Git/Pages-доставка выполняется независимо. Следующий серверный шаг
после разрешения — подготовленный provision-env, redeploy и hosted-приёмка.

### Исследование педагогики и план развития учебника — 2026-10-14

Локальная копия создана в `C:/Users/iliskhan/Documents/Codex/2026-10-14/rust-ml`
из `https://github.com/iliskhan/rust_ml.git`, исходный master
`c95dca43195a7c166b1054956406011d50d284d3`. Регистрацию этой папки в списке проектов
приложения владелец решил выполнить позже; наличие уже существующего удалённого проекта
не считается регистрацией новой локальной копии.

Три исследователя `gpt-6.1-sol / ultra` подготовили самостоятельные направления:
наука об обучении; математические основания; интерактивность, аналогии и доступность.
Оркестратор сопоставил их с кодом и реальным публичным путём новичка, проверил ключевые
источники и составил [синтез](docs/research/learning-lab-2026-10-14/README.md)
и [план](docs/research/learning-lab-2026-10-14/implementation-plan.md).
Отдельно сохранены [аудит](docs/research/learning-lab-2026-10-14/audit.md), шесть просмотренных
снимков desktop/mobile, [протокол оценки](docs/research/learning-lab-2026-10-14/evaluation-protocol.md)
и [критическая проверка](docs/research/learning-lab-2026-10-14/review.md).

Главное решение: новый вход от арифметики к модели, без обязательного программирования;
постепенное введение математики; свободный пропуск, повторение и продолжение для знающих
читателей. Восемь первых миссий, 18 модулей оснований, 14 приоритетных задач реализации.
Показатель результата — самостоятельное объяснение/применение и сохранение знания,
а не клики или просмотр. Учтено последнее уточнение владельца о независимых знаниях
математики, нейросетей и программирования.

Это целевой обзор литературы и выборочный UX-аудит, не систематический обзор,
не исследование с детьми и не подтверждение WCAG. Пилот только спроектирован;
участники и их данные не собирались. Frontend/Rust и production-настройки не менялись,
runtime-тесты не запускались: изменения касаются документации и исследовательских снимков.
Проверены UTF-8, парность code fences и существование локальных Markdown-ссылок
во всех 12 затронутых документах; сломанных ссылок нет. Арифметические примеры плана
пересчитаны, шесть PNG сохранены и просмотрены. Итоговый commit/push и совпадение
local/remote сообщаются при доставке; новый код или учебный эффект этими проверками не заявляются.

### Нелинейный MLP опубликован и проверен — 2026-10-14

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, master, база `430cdc5`.
Следующий этап PLAN.md: `Variable::relu`, `Linear::with_seed` и пример XOR 2→8→1.
За 2000 шагов SGD0.05, seeds42/43: MSE0.706369→1.220e-23, ответы4/4.
Это проверка фиксированного учебного примера; сходимость любого seed не заявлена.

Два агента разделили реализацию и read-only review. Проверены производные всех
9 параметров составной сети, NaN/signed-zero/empty/CPU, владение графом и
воспроизводимость. Существенных findings нет; уточнено округление seed samples
к dtype. Родитель обновил README/doctest, учебный guide, status, roadmap и CI.
CI теперь исполняет XOR example на Windows/Linux. Новых зависимостей нет.

Windows/Rust1.87: `cargo fmt --all -- --check`, strict workspace Clippy,
`cargo test --workspace --all-features --locked --offline` debug/release,
strict rustdoc и запуск всех6examples PASS: **77 тестов +8 doctests** в каждом режиме.
После последнего pin4RNG samples отдельно повторены nonlinear debug/release,
focused Clippy и workspacefmt. Подробные команды: `docs/improvements/mlp-implementation.md`;
логи родителя: `work/comprehensive-improvements/mlp-rust-*.log`.

Runtime commit `83628fa13697f4a7c4f0eeecfedac507cd8b0388` отправлен обычным push,
local=remote подтверждено. [CI38475789454](https://github.com/iliskhan/rust_ml/actions/runs/38475789454)
SUCCESS: Rust1.87 Windows/Linux, current stable и frontend Node24.
Закрывающий checkpoint меняет только документацию; его итоговый SHA, remote и CI
фиксируются в `work/comprehensive-improvements/mlp-delivery.json` и итоговом ответе.
Frontend-код не менялся; GitHub Pages обслуживает предыдущую проверенную сборку.
Ранее зафиксированный отдельный blocker production-env grader сохраняется.

### Пять веток объединены и опубликованы — 2026-10-13, 21:15 MSK

Runtime commit **`8d747ac086c6a88cf9c1cd876026f64db6666aa0`** отправлен в master;
`git ls-remote` подтвердил local=remote. Все пять новых веток включены merge commits,
история сохранена. Финальный merge добавил только evidence: SHA256 пяти local-data
файлов совпали с общим проверенным снимком. Изменения закрывающего checkpoint —
только документация; финальный SHA доставки фиксируется в
`work/comprehensive-improvements/git-delivery.json` и итоговом ответе.

GitHub **CI38444605895 SUCCESS**: Node24, Rust1.87 Windows/Linux и current stable.
**Pages38444605966 SUCCESS**. Адрес: https://iliskhan.github.io/rust_ml/#practice.
Публичный reload восстановил вошедший аккаунт; новая строка SOFTMAX нашла2темы,
Enter открыл упражнение. Automatic/manual progress sync завершились, карта
аккаунта и история136тем/412упражнений загрузились. Console errors/warnings0.
Никаких новых пользовательских черновиков на сервер для этой проверки не писали.
Grader остаётся disabled: это прежний отдельный blocker, описанный ниже.

Итоговая локальная приёмка: **561 frontend-тест**, production build/typecheck,
**69 Rust tests +7 doctests** в debug/release, fmt, strict Clippy/rustdoc и пять
examples PASS. Mobile320/390 без переполнения страницы; отдельные drafts и reload
проверены. Initial JS402831 B/124834 B gzip против1019011/304572; −59% gzip.
Подробности, screenshots и следующие приоритеты: `docs/improvements/integrated-review.md`.
Следующая самостоятельная функция Rust — ReLU/MLP с воспроизводимой инициализацией;
следующая эксплуатационная задача — ранее подготовленный hosted grader после
конкретного согласия на его production-env. Чужие attachments/preview не включены.

### Интеграция проверена, публикация в работе — 2026-10-13, 21:08 MSK

Объединены loading `5cf8c2d`, practice UX `6bdb5ee`, Rust `f7440b1`, cloud
`6a8a791`; local-data `5cd4e5b` прошёл в общем снимке, сверяется перед merge.
Родительский checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, master.
Полные команды, доказательства и дальнейшие приоритеты: `docs/improvements/integrated-review.md`.

Node24.19/direct Python/rustc1.87: **561/561 frontend PASS**, 0 skipped; production
build/typecheck PASS. Rust debug/release: **69 tests +7 doctests** в каждом режиме;
fmt, strict Clippy/rustdoc и пять запущенных examples PASS. Linear за100 шагов:
loss9→4.150e-20, w2, b0.9999999998. Начальный JS402831 B /124834 B gzip.
Reviewer нашёл две refresh-гонки; исправлены и независимо перепроверены в80 порядках.
Root исправил listener нового receipt языка, проверил в двух настоящих вкладках
без сети: изменение primary вA обновляетB, console0. Desktop, mobile390/320,
поиск/Enter, Continue, разделение языковых drafts/reload PASS. Viewport восстановлен.
Текущая публикация/CI/hosted smoke ещё не объявлены готовыми; следующий шаг — push.

### Пять отдельных worktree для комплексного улучшения — 2026-10-13

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, база `1e3ba80`.
Аудит выбрал измеримое ускорение загрузки, практику и первый Rust training path.
Независимый read-only аудит дополнительно воспроизвёл потерю Boundary A/B между
вкладками, частичную запись языка при quota и зависание cloud fetch. Поздний
file.text также может перезаписать новые действия (проверено по механизму кода).
`pnpm audit --json`: 132 зависимости, 0 известных уязвимостей всех уровней.

Пользователь поручил новые чаты/worktree с последующим объединением и deploy:

- Loading: чат `01a1364b-9a2b-78d0-ad0d-42dd97d236fc`, worktree `f782`.
- Practice UX: чат `01a1364c-3358-7dd0-bbf8-ed4641be7773`, worktree `6eed`.
- Rust training: чат `01a1364c-8c89-7f93-a155-eb74243848c7`, worktree `305f`.
- Cloud timeout: чат `01a13651-49c3-7991-b5da-d9faabb2f7c5`, worktree `8e9e`.
- Local data: чат `01a13652-a9cb-7771-9c30-b7acca2bc081`, worktree `01db`.

Все пять работают от `1e3ba80`, с раздельными файлами и ветками `codex/*`.
Родитель проверяет diff, объединяет готовые commits и выполняет общие frontend,
Rust и desktop/mobile проверки. Дочерние локальные результаты ещё не означают
готовность интегрированной версии. Следующий шаг: review и объединение веток.
Итоговые доказательства — `learning-lab/evidence/improvements/` и
`docs/improvements/`. Чужие attachments и practice preview исключены.

Прежняя hosted-активация grader остаётся отдельным незавершённым пунктом:
конкретный запрос на DB URLs/CRON_SECRET в Vercel пока не получил ответа.
Новые чаты не меняют secrets, admission, миграции, provider settings и runtime pins.

### Реальный runtime проверен; остаётся окружение Vercel — 2026-10-13, 19:40 MSK

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, база `b2c6a95`.
Локальные проверки этого набора выполнены до commit; итог обычного push и
сверка local/remote SHA записываются в `work/practice-grader/git-delivery.json`.
CLI Vercel63.1.2 успешно авторизован: открыли `/oauth/device` без query-параметра,
ввели новый код вручную и подтвердили Allow Access. Причина неактивной кнопки
на прежней форме не установлена. Просьба завершить вход пользователю устарела.
Проект `rustml-grader` / `iliskhans-projects` связан; API подтвердил Hobby.
Карта, платный тариф и дополнительные платные ресурсы не подключались.

Реальный SDK3.7.0 runtime: Node24.21.0, Python3.14.4, Rust1.90.0. Все три
reference-примера PASS; гостевой UID1001, ограниченное окружение, deny-all,
CPU/process/file/output limits, compile_error/output_limit проверены.
Trusted snapshot `snap_It6mVj2cPSWSKzj0OCukNncSEHDK` сохранён (1 463 374 209 B);
шесть case VM и одна prep VM удалены, GET resume:false подтвердил 404.
Подробности и границы: `learning-lab/evidence/grading/runtime-2026-10-13.json`.
Allowlist SHA256 `f6e5d7f8d499fa5b9407cf1a1118e2b5a35ed87e2e15091633dff39548bc40a1`;
LF закреплён в .gitattributes, поскольку evidence проверяет точные байты.

Supabase SQL001–006 уже применены; повторно не выполнять. Созданы отдельные
LOGIN rustml_api/rustml_worker с ограниченными правами и connection limit3;
owner/service_role для Vercel не используются. 28 private-table, 84 public-write,
119 function assertions PASS; настоящие TLS-подключения и 22 проверки запретов
PASS. Пробные транзакции откачены. Доказательства: `database-logins-2026-10-13.json`.
Опубликованы 1236 immutable manifests edition1 после сверки условий и starter;
`manifests-2026-10-13.json` подтверждает admission OFF, окно NULL, reservations0,
pending jobs0/attempts0. История и опубликованные variant IDs не менялись.

Vercel API развёрнут: https://rustml-grader.vercel.app. Первая сборка отклонила
includeFiles-array, заменили на строковый glob. Первый запуск дал
ERR_MODULE_NOT_FOUND all-catalog.ts через bundles.mjs; canonical/sha256 вынесены
в digest.mjs, runtime imports больше не тянут author catalog. Регрессия запускает
API с отключённым TypeScript stripping и проверяет fail-closed 503. Deploy
`dpl_3SpjhVBtapcFJEBXzKrNc6xu5NU2` READY; public GET grade503 JSON с точным CORS,
reap503 JSON. Это проверка запуска без конфигурации, не рабочая проверка решений.

Node24.19 / bundled Python / direct stable rustc1.87: весь набор
`PRACTICE_VERIFY_ALL_LANGUAGES=1 node --test tests/*.test.ts` — 533/533 PASS,
0 skipped (`work/practice-grader/final-tests-owner-fixed.log`). TypeScript и
Vite production build PASS. Первые запуски ограниченной песочницы получили
Access is denied для rustup/esbuild, повтор выполнен под владельцем с direct
rustc. Пойман отдельный flaky тест двух вкладок: deadline15ms истекал до
crypto digest; тест теперь ждёт polling обеих вкладок и отменяет явно.
Смежные проверки настоящего deadline сохранены. Независимый review grader
не нашёл ошибок; это не заменяет незавершённую hosted HTTP-приёмку.

Блокер: автоматическая проверка отклонила передачу двух новых dedicated DB URL
и CRON_SECRET в production-env Vercel, потребовав отдельного согласия на эти
секреты и конкретное назначение. Вопрос отправлен, ответа ещё нет. Отклонённая
команда не исполнилась; env и CRON_SECRET не созданы. Prepared helper:
`work/practice-grader/provision-env.ps1`; запускать только после этого ответа.
Повторные commit/push, вход CLI и обычное создание Sandbox уже разрешены.

Следующий шаг: после согласия записать ограниченные env → redeploy → проверить
актуальную бесплатную квоту/окно и временно включить admission → hosted приёмка.
`work/practice-grader/hosted-acceptance/run-root.ps1 -ExecuteRoot` и CHECKPOINT
подготовлены, local mock selfcheck PASS; удалённо не запускались. Admin key для
двух тестовых Auth-аккаунтов передаётся прежним разрешённым RSA transport только
в память локального процесса; runner выключает admission и проверяет удаление
своих пользователей/записей/VM. Затем hosted fencing/reaper, включение production
и Actions `VITE_PRACTICE_GRADER_URL`, commit/push, CI/Pages и desktop/mobile.
Сейчас серверная кнопка выключена; общий запрос пользователя ещё не завершён.

Последняя ранее проверенная публикация frontend: `8671b44`, CI38426710204 и
Pages38426710243 SUCCESS, public reload/sync-ready и console0. Старые записи
ниже — история этапов, актуальный статус находится в этом checkpoint.

### SQL006 применена; проект Vercel создан — 2026-10-13, 18:58 MSK

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, база `e47f639`, `master`.
Пользователь разрешил пропустить предложение отдельной Vercel 2FA; `Skip
securing my account` выполнено, предложение исчезло. Создан отдельный проект
`rustml-grader` команды `iliskhans-projects`, Hobby. Карта и платные ресурсы
не подключались. Dashboard Usage показывает Sandbox creations 0/5000,
CPU 0s/5h, memory 0/420 GB-hours, snapshots 0/15 GB за выбранные Last 30 Days;
это ещё не доказательство lifetime остатка snapshots или реального запуска VM.

Vercel CLI63.1.2 / Node24.19 запущен через штатный device login. Встроенный
браузер показывает `Allow Access` disabled, без пояснения; reload и показ формы
не помогли, console warnings/errors отсутствуют. Причина не установлена.
Пользователю отправлена просьба завершить вход обычным браузером; CLI завершился
exit1 без выдачи credentials, старый device code не считать действующим.
Нужно начать новый login, когда пользователь сможет подтвердить его. Повторное
согласие на пропуск 2FA и отключение обучения не требуется.

Supabase preflight: 1236 published variants, pending jobs 0, attempts 0, SQL006
absent. SQL006 `daac23c832ecca6192906b2c03b9cbd99b87a49ef3e28a6ef44c0afeb2a6e5c5`
применена ровно один раз; повторно **не выполнять**, как и SQL001–005.
Admission OFF, billing window NULL, reservations 0; manifests/runtime pins и
dedicated logins пока не созданы. Первая postcheck ошибочно ожидала отсутствие
всех административных прав service_role на learning_events. Read-only diagnostic
подтвердил только прежние REFERENCES/TRIGGER/TRUNCATE на этой таблице (SQL004);
права не менялись. Исправленная проверка: 20 private-table assertions,
60 public-write assertions, 85 function assertions PASS, без dedicated logins.

Cleanup provider теперь всегда сохраняет snapshots, включая unknown-create
recovery и повтор cleanup; cases persistent:false. 17/17 targeted provider
tests PASS на Node24.19, 0 skipped; это SDK mocks, не hosted isolation.
Подготовлены ignored deployment helpers и checkpoints:
`work/practice-grader/runtime-prep/`, `work/practice-grader/db-deploy/`.
Официальный SHA256 Rust1.90.0 скачан; local-check построил adapters трёх языков.
Hosted runtime receipt отсутствует, allowlist пуст; frontend grader выключен.
Следующий шаг: Vercel CLI login → link rustml-grader → проверить бесплатную VM
и lifetime storage → trusted snapshot/hosted acceptance → minimal DB logins/env,
immutable publication, включение после тестов. Общая задача не завершена.

### Подготовка grader сохранена; frontend опубликован — 2026-10-13, 18:10 MSK

Runtime `4cb5a08a8c3454d27b03c449f56145371ecc979c` отправлен обычным push
в `master` под общим Git-lock; local/remote SHA совпали. CI `38419210175`
и Pages `38419210352` SUCCESS. Новый public bundle `index-B2VIeTyF.js`
проверен на https://iliskhan.github.io/rust_ml/#practice: прежний аккаунт
восстановлен, automatic/manual sync-ready, desktop1280/mobile390 без
overflow/alerts/console warnings/errors. Grader ожидаемо отключён.
Скриншоты `work/practice-grader/hosted-desktop.png`, `hosted-mobile.png`.
Локальные preview этой задачи 6963–6965 остановлены; чужие untracked attachments
и прежние preview-файлы не включены в commit. Credential-marker scan изменённых
файлов не нашёл секретов; public CA и publishable config являются публичными.

Общая задача НЕ завершена: реальный Vercel Sandbox, hosted SQL006 и включение
проверки кода ожидают продолжения после ответа на уже отправленный вопрос
`Skip securing my account`. Автоматическая проверка требует отдельного согласия
на пропуск предложения 2FA; браузерная вкладка сохранена. Передачу данных для
обучения уже отключили, повторное разрешение на неё не нужно. Инструкции и
следующие шаги — в checkpoint ниже; повторно применять SQL001–005 нельзя.

### Серверная проверка реализована локально; Vercel ожидает решения по 2FA — 2026-10-13, 18:00 MSK

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, HEAD `47de654`.
Изменения grader подготовлены к checkpoint. Реализованы SQL006 с immutable grading
editions для прежних variant IDs, owner-only API, fenced supervisor, Vercel
provider и клиент с CAS/idempotency/recovery. Проверяются открытые примеры;
hidden coverage не заявляется. Runtime allowlist пуст, admission выключен;
SQL006 в Supabase НЕ применена, backend НЕ развёрнут.

Пользователь разрешил Vercel Hobby без карты и платежей, вход через GitHub
выполнен. Передача кода/чатов для обучения отключена после отдельного согласия.
Vercel предложил добавить собственную 2FA; автоматическая проверка отклонила
кнопку `Skip securing my account` как неподтверждённое ослабление защиты.
Отдельный вопрос отправлен, ответ ещё не получен. Браузер находится на странице
Sandbox с этим предложением. Реальная доступность создания Sandbox без карты
ещё не доказана; другие сервисы и платные ресурсы не подключались.

Локальная проверка Node24.19 с bundled Python/direct stable rustc:
`PRACTICE_VERIFY_ALL_LANGUAGES=1 node --test tests/*.test.ts` — 530/530 PASS,
0 skipped; TypeScript и Vite production build PASS. Запуск внутри песочницы
дал 515/516 из-за esbuild Access is denied при чтении зависимостей; повтор
с доступом завершился успешно. Preview точной Pages-конфигурации
`VITE_BASE_PATH=/rust_ml/`, `VITE_PRACTICE_AUTH_PROVIDER=github` осмотрен при
1280×720 и 390×844: вход только GitHub, grader отключён, overflow/alerts/console
warnings/errors отсутствуют. Это проверка неактивного интерфейса, а не hosted
исполнения. Скриншоты: `work/practice-grader/local-desktop*.png`,
`work/practice-grader/local-mobile-editor.png`.

SQL006 локально в PGlite: 89 новых проверок PASS; существующие RLS12403 и sync49
PASS. Provider SDK transport/mocks не заменяют реальную проверку изоляции.
Review обнаружил коллизию snapshot editions при одном base OCI digest и
неограниченное ожидание prepare внутри Web Lock; обе причины исправлены,
регрессии включены в 530 тестов. Дополнительная регрессия reaper на сохранение
referenced snapshot проверена после общего suite: 12/12 targeted PASS.
SQL006 SHA256: `daac23c832ecca6192906b2c03b9cbd99b87a49ef3e28a6ef44c0afeb2a6e5c5`.
Ежедневный reaper подключён к `vercel.json`, GET защищён `CRON_SECRET`; без
конфигурации оба API вернули ожидаемые 503. Это локальная проверка маршрутов.
Final production build: `index-BP78-NMR.js`; стандартное предупреждение о
размере основного chunk остаётся. Реальная UI-приёмка активных состояний
выполнена на локальном стенде с подставленными ответами: running/pass/error,
редактор доступен во время проверки, помощь заблокирована до результата,
повторная проверка после ошибки доступна, desktop1280/mobile390 без overflow
и ошибок консоли. Скриншоты `work/practice-grader/ui-*.png`. Настоящие hosted
запуски не выполнялись и этой UI-приёмкой не заменяются.

Следующий внешний шаг: после ответа на вопрос 2FA продолжить Vercel и проверить
Sandbox на Hobby без карты. Затем получить доверенные runtime/snapshot pins,
подготовить отдельные least-privilege DB logins, применить только SQL006,
проверить реальные Python/JavaScript/Rust, limits/egress/cleanup и два аккаунта,
включить admission и public `VITE_PRACTICE_GRADER_URL`, проверить Pages.
DPAPI пароль БД остаётся в прежнем ignored secret location; owner/service-role
ключ не должен передаваться Vercel. SDK provider pinSession предотвращает
автоматический resume, transport не повторяет неизвестный create POST.
Подробные implementation/review notes: `work/practice-grader/`.

### Синхронизация опубликована; бесплатный executor ожидает подключения — 2026-10-13, 16:12 MSK

Runtime `6b97845abca3e36d006ff4794783bbb5ec23d7d8` отправлен обычным push
в `master` под Git-lock, local/remote SHA совпали. CI `38402567929` и Pages
`38402567784` SUCCESS. Публичный [сайт](https://iliskhan.github.io/rust_ml/#practice)
загрузил новый `index-Be80u9cX.js`: существующая GitHub-сессия сохранилась,
автоматическая и ручная синхронизация показывают успех, reload снова приводит
к signed-in/sync-ready. Панель «Мой прогресс» показывает историю аккаунта;
desktop1280/mobile390 осмотрены без overflow, alerts и console warnings/errors.
Скриншоты и точные проверки перечислены в
[переносимом отчёте](learning-lab/evidence/progress-sync/hosted-20261013.json).
Пользовательские самопроверки для этой UI-приёмки не создавались.

Первая часть задачи завершена: история вопросов, помощь, основной язык и
продолжение работы синхронизируются через Supabase. Код сохраняется явно
кнопкой «Сохранить в аккаунте», прежний CAS защищает облачный черновик.
Серверный grader пока НЕ подключён; кнопка проверки кода остаётся выключенной.
Подготовлены и проверены только adapters/bundles/comparator открытых примеров.
Бесплатный кандидат — Vercel Sandbox Hobby; no-card activation ещё предстоит
подтвердить. В браузере открыта регистрация, запрос согласия с условиями Vercel
отправлен и не получен. Карта/платная подписка не подключались.

Следующий шаг после ответа: войти/создать Vercel Hobby через GitHub в
подготовленной вкладке, проверить возможность Sandbox без карты; затем
реализовать isolated worker, admission/lease/quota и привязку graded edition
без потери существующей истории. Исследование для продолжения:
`work/practice-grader/design-review.md`, `work/practice-grader/worker-plan.md`.
Перед подключением нового secret destination проверять действующий scope;
старый одноразовый ключ теста уже удалён и не является credential для Vercel.

### Синхронизация прошла hosted-приёмку — 2026-10-13, 16:06 MSK

На базовом `f3f9efe`, `master`, текущие изменения прошли полный suite Node24.19:
484/484 PASS, 0 skipped, с bundled Python и прямым stable rustc;
`tsc --noEmit` и production build PASS. Проверки SQL004/005: 49/49 PASS.
Миграция 005 применена в 12:58:48 UTC, SHA256
`32b46bcfd356758f894821cac04fb278a78576aac3ec9f65b80b2d10caf90b7f`.
Она согласует основной язык profile/enrollment с LWW событием, включая offline
и старый RPC. Исправлены metadata в повторной отправке языка и обновление
открытой панели после cloud merge; регрессия проходит.

Реальные Auth JWT двух одноразовых пользователей прошли 8 hosted-групп:
две независимые memory storage одного аккаунта обменялись самопроверками,
помощью, языком и последней активностью; код не заменялся. Потерянный после
реального commit ответ повторён без дубля. Foreign read пуст, direct write
403, anon RPC401. Получены все 509 событий через границу страницы 500, local
history ограничена 100; graded evidence не создано. Profile/enrollment язык
проверен при смене на Rust и JavaScript. Оба тестовых Auth user удалены;
одноразовые public key/ciphertext файлы отсутствуют после finally.
Это проверка независимых хранилищ, а не двух физических устройств.

Локальный production UI осмотрен при 1280×720 и 390×844 без overflow.
Переносимый отчёт: [hosted-20261013.json](learning-lab/evidence/progress-sync/hosted-20261013.json).
Pages runtime пока старый; следующий шаг — commit/push, CI/Pages и hosted UI.

Пользователь уточнил ограничение executor: только бесплатно, без карты и своего
сервера. Vercel Sandbox Hobby по [официальным условиям](https://vercel.com/docs/sandbox/pricing)
имеет ежемесячную квоту и остановку вместо доплат; no-card activation ещё не
проверена в аккаунте. Открыта регистрация, ожидается обязательное подтверждение
условий нового сервиса. Grader в production остаётся выключенным.

### Синхронизация прогресса и серверная проверка — в работе, 2026-10-13, 15:51 MSK

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, базовый HEAD
`f3f9efe5ec16a502faa8c74e501b86a202e1c315`. Новые изменения ещё не закоммичены.
Реализованы отдельные события истории самопроверок, помощи, активности и языка,
RPC с own-read RLS, immutable retries, курсор страниц и слияние на устройстве.
Черновики кода используют прежнее явное сохранение/CAS; formative события не
дают серверный зачёт. Локально 33 адресных теста, typecheck и 25 SQL-проверок
PASS. Review обнаружил повторную отправку cloud metadata в настройке языка
после reload; исправление и регрессия выполняются перед полной проверкой.

13.10 в 12:49:53 UTC применена только миграция `202610130004_progress_sync.sql`,
SHA256 `76597cdc37bb753007b8a6ba15133667612021902c644d96d24ef114ae19e6e8`.
Preflight подтвердил отсутствие её таблицы/RPC; после применения RLS включён,
authenticated имеет только SELECT. Evidence:
`work/practice-progress-cloud/hosted-learning-migration.json`.
001–003 повторно не применялись; HTTP приёмка настоящими JWT ещё ожидает.

Подготовлены provider-independent bundles/adapters/comparator для 412 упражнений
на 3 языках; 6 grader-тестов PASS со всеми toolchains. Это открытые примеры,
не hidden coverage. Runtime isolation и production worker ещё не развёрнуты.
Supabase Compute в dashboard явно недоступен (private alpha). Выбор отдельного
сервера/Modal ожидает ответа пользователя; подключение карты не выполнялось.
Следующий шаг: hosted двухаккаунтная проверка двух независимых хранилищ,
полный suite и desktop/mobile, затем commit/push и Pages для готовой части.

### Предыдущая завершённая приёмка Auth и облачных черновиков

Финальный review не нашёл материальных проблем Auth/RLS/CAS. В сопровождающем
checkpoint исправлен только текст `missing_verifier`: он предлагает повторить
вход без предположения об email/password. После этой правки 43 адресных теста
auth/cloud/account/progress и `tsc --noEmit` PASS. Полные 465 тестов и browser
приёмка относятся к runtime `ce1d3b6`; поведение этим текстовым уточнением не меняется.

### Публичная практика: browser cloud-приёмка прошла — 2026-10-13, 15:20 MSK (UTC+3)

Опубликованный runtime `ce1d3b648b75b8c7d631ce6eaf5d20d94d66ec78`
проверен в настоящем браузере после успешных CI38394725524 и Pages38394725921.
GitHub signup/login → Supabase callback → Pages PKCE привёл к подключённому
аккаунту. Облачное сохранение тестового комментария дало version 1; reload
сохранил сессию. После другого локального изменения сравнение показало серверный
вариант и сохранило локальный текст; явная замена восстановила облачный код.
Исходный starter code затем восстановлен и сохранён в cloud как version 2.
После logout UI показал гостя и отключил cloud save; повторный GitHub login прошёл,
cloud load вернул точный starter без тестовых маркеров.

Панель прогресса различает локальные 1 тему/1 черновик и серверные 136/136 тем
для Python; 0/276 требований остаются ожидаемыми, потому что grading выключен.
Desktop 1280×720 и mobile 390×844 осмотрены: горизонтального overflow нет,
console warnings/errors 0, alerts 0. Переносимые результаты, deployment runs
и имена скриншотов — в [отчёте](learning-lab/evidence/auth-progress/hosted-20261013.json).
Граница текущего облака — черновики,
предпочтение языка, помощь и собственный прогресс. Локальные самопроверки остаются
на устройстве; production grader disabled.

Серверная приёмка 10/10 hosted групп и браузерная приёмка завершены.
Документальные доказательства включены в сопровождающий checkpoint; SHA его
push сообщается в итоговом отчёте. Проверенный runtime — `ce1d3b6`.

### Исторический checkpoint: серверная приёмка прошла, browser-проверки ожидали — 2026-10-13, 15:12 MSK (UTC+3)

В `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, commit
`ce1d3b648b75b8c7d631ce6eaf5d20d94d66ec78` отправлен обычным push под
Git-lock; local/remote SHA совпали. GitHub CI `38394725524` завершил все четыре
jobs успешно, Pages `38394725921` завершил build и deploy успешно
(`work/practice-supabase-connect/ci-ce1d3b6.json`). Публичный `/rust_ml/#practice`
действительно показывает только GitHub-вход. В реальном браузере пройдены GitHub
authorize со scope `user:email` → Supabase callback → Pages PKCE; `?code` удалён
из адреса, UI показал «Вы вошли» и подключённый аккаунт.

Два одноразовых аккаунта, созданных для приёмки через Auth Admin API, прошли
10/10 hosted групп (`hosted-auth-acceptance-result.json`): настоящие JWT проверены
`/auth/v1/user`; own/foreign RLS и inner embeds, одновременный HTTP CAS с одним
победителем и одним конфликтом, запрет прямой записи, idempotent help,
408 изолированных строк прогресса на аккаунт и независимый выбор основного языка,
отключённый grading, refresh и logout с отзывом refresh tokens. Оба тестовых
аккаунта удалены; одноразовый зашифрованный credential file и временный public key
после запуска отсутствуют. Это серверная проверка созданных через Admin API
аккаунтов; публичная GitHub-регистрация отдельно подтверждена браузером.

Третий этап остаётся в работе: проверить облачное save/load/reload/logout в UI,
затем финальный mobile-осмотр. После него обновить документы по итоговым данным,
создать отдельный документальный commit/push и сверить SHA. Серверный зачёт кода
остаётся выключенным.

### Исторический checkpoint: схема и GitHub Auth настроены — 2026-10-13, 15:03 MSK (UTC+3)

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, базовый HEAD
`ab1f83f9180dac1694754dc7d8e52151ce908fba`; рабочее дерево содержит
незафиксированные изменения workflow, GitHub UI и теста, а также посторонние
untracked файлы. В старых разделах ниже описаны состояния на указанные даты;
запрет browser и ожидание миграций более не являются текущими блокерами.

13.10 тот же исходный чат успешно открыл Supabase dashboard поддержанным browser.
Для проекта `phnjcmahugetofwvnbto` pristine preflight проверил отсутствие
`practice_*`, конфликтующих ролей и использования `private`. Через pg 8.23.1 и
Frankfurt session pooler с проверкой TLS по официальному CA применены целиком
`202610120001_practice.sql` → `002_practice_rpc.sql` → `003_anchor_content.sql`.
CLI migration ledger при прямом SQL-применении не появился. Файлы и SHA256:
`work/practice-supabase-connect/hosted-migrations-20261013.json`.

Независимый hosted catalog smoke (`hosted-schema-smoke-20261013.json`) проверил
17 SQL-наборов: 14 relations, 16 functions, 20 seed checks PASS; 13 RLS-таблиц,
12 policies, 6 triggers, без выявленных ACL-нарушений таблиц, столбцов и функций.
Публичный anon HTTP (`public-api-result.json`) прочитал опубликованный каталог;
попытки доступа к собственным данным/RPC без входа дали HTTP401, к `private`
через Data API — HTTP406 `PGRST106`. Это не подтверждает пользовательский JWT/RLS.

Auth Site URL и единственный точный redirect сохранены как
`https://iliskhan.github.io/rust_ml/`. Создан GitHub OAuth app RustML Learning Lab
`3928667`; secret сохранён только в настройках provider. GitHub provider включён:
последующий `/auth/v1/settings` вернул `githubEnabled=true` (`public-api-github-settings-result.json`).
Пользователь выбрал GitHub вход вместо email/SMTP. Repository variables
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` сохранены; workflow локально
задаёт `VITE_PRACTICE_AUTH_PROVIDER=github`. Секреты в frontend/Git не записаны.

Локальный suite с явно заданными bundled Python и stable Rust: 465/465 PASS,
0 skipped (`work/practice-supabase-connect/test-suite-github-verified.log`);
production build PASS после разрешённого чтения esbuild parent executable.
Локальный production UI осмотрен в браузере при desktop 1280×720 и mobile
390×844: одна кнопка GitHub, email fields отсутствуют, overflow не обнаружен.
Эти проверки относятся к незакоммиченному срезу поверх `ab1f83f` и не доказывают
работу опубликованного Pages. Остались реальный OAuth callback, две учётные записи,
JWT/REST/RPC/RLS/CAS, refresh/logout, desktop/mobile в браузере, Pages deploy,
commit/push и local/remote SHA match. Серверный зачёт кода по-прежнему выключен.

### Исторический checkpoint: запрет чата сохранялся — 2026-10-13, 13:58 MSK (UTC+3)

Новое прямое поручение — устранить запрет исходного чата и закончить подключение.
Checkout общий, master `bf49ebfc13455ce0474a70591951154f8d105795` до этой записи;
tracked дерево было чистым, три посторонних untracked пути сохранены.
Текущие четыре этапа обновлены в PLAN; восстановление доступа — блокер,
облачные migrations/Auth, реальная приёмка и Pages cloud config — ожидают.

Независимая read-only проверка установленного UI app26.1007.2314.0:
Settings→Browser содержит Remove custom permissions for {origin}, но
`app.asar` asset `browser-use-origin-state-queries-9679b4061212.js` вызывает
`browserUsePermissions.updateOriginRules`; `main-BklS_2Y2.js` направляет его
в `browser/config.toml`. Параметров conversation/session у операции нет.
Повторный global reset не является решением найденного conversation deny.
Browser API/management не предоставляют подтверждённого reset чата;
plugin_management.update_app_permissions меняет режим ChatGPT-плагина.
Browser plugin26.1007.21434 `scripts/browser-service.mjs:1036` описывает
persisted_user_denied как retryable=false и запрещает workaround/alternate
surfaces/policy circumvention. Настройки, удалённая БД и Auth не изменены.
Оснований утверждать, что владелец нажимал «Запретить», нет.

Для обращения в поддержку подготовлены точные данные: исходный чат
`01a13055-8c77-7293-95a4-ac6e884eb382`, app26.1007.2314.0,
browser26.1007.21434, код persisted_user_denied; global allow Supabase верен,
session deny остаётся, требуется штатный сброс разрешения этого чата.
Доступные инструменты не выполняют такой сброс. Координационное сообщение
исходному чату запрошено у владельца и до ответа не отправлялось.

Независимый review migrations/приёмки на bf49ebf не обнаружил подтверждённого
блокирующего дефекта. До DDL обязательно проверить также роли practice_api/
practice_worker и использование существующей private: миграция создаёт роли
без IF NOT EXISTS и отзывает grants ко всей private. После целых001→002→003
нужен существующий read-only smoke, затем реальные JWT/RLS и два одновременных
CAS запроса. Клиент нормализует draft_conflict к status409; raw HTTP409
PostgREST не проверен. Уточнения внесены в deployment/data-model.
Для полной email-приёмки нужны два контролируемых аккаунта/ящика и подходящая
доставка SMTP; DB password/service_role/worker credentials браузеру не нужны.
Изменения этого checkpoint только документальные; runtime не менялся.

### Причина browser-блокера подтверждена локально — 2026-10-13, 13:37 MSK (UTC+3)

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, master `35586f5` до этой записи.
Read-only диагностика исходного чата независимо проверена по точечным локальным
строкам: `C:/Users/lomaster/.codex/config.toml:185–186` содержит Supabase
`access="allow"`; `browser/config.toml:13–14` содержит сайт в allowed и пустой
denied. В `browser/sessions/01a13055-8c77-7293-95a4-ac6e884eb382.toml:2`
сохранён отдельный deny для `https://supabase.com`.
В browser plugin26.1007.21434 `scripts/browser-service.mjs:4469` этот deny
имеет приоритет при выборе решения, а строка1104 связывает его источник с
`persisted_user_denied`. Вывод относится к этой установленной версии.

Настройки не менялись; браузер и сеть для диагностики не использовались.
Подтверждённого штатного UI/action снятия conversation deny пока не найдено;
эффект перезапуска не проверен. Повторное добавление global allow не является
следующим шагом. Hosted-подключение остаётся заблокированным до штатного
разрешения этого состояния; локальная интеграция и её проверки сохраняются.

### Интеграция опубликована; hosted Supabase остаётся заблокирован — 2026-10-13

Итоговый checkpoint `5c15a9348254da65da1e6d0858c5f3a85c9dae6f` committed/pushed;
local/remote master SHA совпали под Git-lock. Его CI38382326428 и Pages38382326404
SUCCESS, включая Windows job. Последующее завершение записи меняет только PLAN/PROGRESS;
runtime hashes прежние, проверки ниже сохраняют применимость.

Общая интеграция committed/pushed в `46235ac4feaa9f6262186088e9add60064cc8e28`;
под FileShare.None Git-lock подтверждён local=remote master. Source hash snapshot
после commit совпал для всех38 файлов. CI38381096306 SUCCESS, Pages38381096383
build/deploy SUCCESS (наблюдены jobs115241417819/115241758357). На публичном
`https://iliskhan.github.io/rust_ml/#practice` работает «Мой прогресс»;
desktop1280x720 и mobile390x844 без overflow/duplicateIDs, console error/warn=[].
Локальная production/reload/keyboard приёмка и full suite464/464 остаются применимы:
runtime source после неё не менялся. Подключения cloud config в Pages ещё нет.

Исходный чат исправил воспроизведённый SQL smoke отказ: CRLF в literal seed-коде
не совпадал с LF импортированного TS каталога. `.gitattributes` закрепил
`learning-lab/supabase/migrations/*.sql text eol=lf`, commit
`3df41d3505f619865323800b7dc68825c1ed77f3` обычно pushed; local/remote match проверен
тем чатом под общим lock. SQL Git content не изменён.
Свежий PGlite17.5/Node24.19, checkout общий, base e451276+dirty worktree,
2026-10-13T10:05:54.759Z: **12403 PASS**, включая полный каталог136/276/412/1236.
Точная исходная команда:
`node learning-lab/supabase/tests/rls-smoke.mjs work/backend-smoke/node_modules/@electric-sql/pglite/dist/index.js work/root-supabase-connect/rls-smoke-result.json`.
Исходный чат затем перенёс evidence в ignored `work/practice-supabase-connect/`;
portable копия report сохранена в `learning-lab/evidence/auth-progress/sql-recheck.json`.
Это auth.uid stub, не hosted JWT/PostgREST/OAuth или реальные concurrent connections.

Владелец прямо разрешил подключение; global allow настроен правильно, но browser
исходного чата вернул `A saved user permission setting blocks this action`.
Причина уточнена в checkpoint выше: отдельный conversation deny имеет приоритет.
Этот чат не использует своё ранее работавшее подключение для обхода того отказа.
Удалённая БД/Auth settings не изменены; hosted Auth/RLS/CAS двух реальных аккаунтов
и доставка писем ещё не проверены. После штатного разрешения browser-блокера
исходный чат применяет целые migrations и выполняет hosted приёмку.

Рабочая копия содержит посторонние .codex-remote-attachments и два author preview
файла; они не включены в commit. После LF-нормализации `git status` также показывал
M у трёх migration файлов при пустом content diff; эти файлы принадлежат исходному
чату и не staging этого чата. Runner/grading остаётся disabled.

### Auth/Progress: общая локальная интеграция проверена — 2026-10-13, 13:01 MSK

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, база
`e45127662c7a5e0c61d30d40d5a3ea4d439876ab` плюс текущие изменения интеграции.
Auth уже committed/pushed в `dc98372`/`e451276`; авторский Progress остановлен
после targeted21/21 и входит в проверенную интеграцию. Оба авторских чата idle;
их source scopes приняты основным чатом. Посторонние .codex-remote-attachments
и два learning-lab/work/practice-progress-preview файла не включаются в commit.

Общий UI открывает «Мой прогресс», использует проверенный owner из provider,
читает карту тем через публичный release-filtered API и продолжает точное
упражнение/язык с фокусом textarea. Сохранение кода не меняет cloud primary;
он меняется только по явной команде. Исправлен provider stale401 после same-tab
refresh; повреждённая Auth-запись безопасна для UI getter, строгие restore/RPC
сохраняют проверку сессии. Наблюдённый React dev prop logger error устранён.

Node24.19 / Python3.12.14 / direct rustc1.87, cwd learning-lab:
**464/464 PASS, 0 skipped** с PRACTICE_VERIFY_ALL_LANGUAGES=1 и точными runtime paths;
typecheck и Pages build native loader PASS. Production IAB5233/rust_ml:
desktop1280x720/mobile390x844/320x568, без overflow/duplicateIDs, keyboard/reload PASS,
прежние neuron/network practice panels отрендерились, console error/warn=[].
Local fixture5231/5232: guest/A/B, Python/Rust, transfer navigation, hint/quiz reload,
late401 после refresh, explicit language, malformed/revoked session PASS.
Это synthetic Auth, не hosted JWT/RLS. Доказательства/команды/границы/hash snapshot:
`learning-lab/evidence/auth-progress/README.md`. Rust-ядро и migrations не менялись.
Финальный read-only review не нашёл нового подтверждённого дефекта.

В исходном чате владелец прямо разрешил подключить Supabase; исходный чат взял
dashboard/migrations/settings. Здесь удалённая база и настройки параллельно не
меняются. Hosted Auth/JWT/PostgREST/RLS/CAS двух реальных аккаунтов и доставка
писем ещё ожидают проверенных результатов. Grading disabled. Следующий локальный
шаг — serialized commit/push, SHA match и Pages deployment.

Первая техническая escalation commit/push отклонена auto-review: remote не был
признан доверенным. Назначение перепроверено GitHub connector: public repo
`iliskhan/rust_ml`, owner id30693661 совпал с authenticated profile, admin/push=true;
`git remote get-url origin` совпал с clone_url. Первая попытка не создала staged diff.
Повторная попытка использует тот же narrow file list и Git-lock, без обхода проверки.

### Supabase: доступ восстановлен, миграции ожидают разрешения — 2026-10-13, 02:25 MSK

Прямое человеческое поручение «создал проект, проверяй» найдено чтением исходного
чата `01a13055-8c77-7293-95a4-ac6e884eb382`. Повторный browser вызов к тому же
dashboard разрешён. Проект `phnjcmahugetofwvnbto` — `rustml-learning-lab`, Free,
Healthy, Central EU Frankfurt, Nano. SELECT из pg_class/pg_namespace вернул
`Success. No rows returned`: объектов practice_* в public/private ещё нет.

Первая миграция 202610120001 подготовлена в SQL Editor. Editor предупредил о RLS;
исходный SQL включает его динамическим loop для public-таблиц и явно для двух private.
Запуск через кнопку Run without RLS отклонён auto-review: поручение «проверяй»
признано разрешением только на чтение, а не на удалённую миграцию. База не изменена.
Отдельное разрешение на три миграции и настройку практики запрошено у владельца.
Экран конкретного действия сохранён в ignored
`work/practice-integration/supabase-migration-approval.png`; dashboard помечен handoff.

Auth-файлы уже committed в `dc98372`; окончание автора/push ещё не подтверждены.
Progress продолжает собственные проверки. Общий suite и UI-интеграция пока ожидают.
Фактические permissions этого чата остаются авторитетными. Глобально сохранено
`progress-widget enabled=false`; новые виджеты не публикуются, native plan сохранён.
Hosted JWT/Auth/RLS/CAS двух настоящих аккаунтов ещё не проверены.

### Продолжение основного чата — 2026-10-13, 02:13 MSK

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, ветка `master`,
readiness checkpoint `add184e02b224c5a78dd17c34282dd596aeb58f0`.
Файл `work/practice-chat-handoff/ready-20261013.json` подтверждает окончание передачи,
обычный push исходного чата и local/remote SHA match. До readiness общий источник
и документы основным чатом не изменялись. Auth и Progress активны в своих scopes;
их изменения ещё не являются проверенной общей интеграцией.

Фактический shell нового основного чата — `CodexSandboxOffline`: обычный `git status`
отклонён из-за dubious ownership, read-only команды прошли с command-scoped
`git -c safe.directory=C:/Users/lomaster/Desktop/dev/rust_ml`. Запись `.git`
этим чатом ещё не проверялась. Сообщение о danger-full-access относилось к исходному
чату; профиль нового чата проверяется отдельно по его действующим permissions.

Browser `cua.createBrowserTab('iab', dashboard)` отклонён auto-review:
не найдено прямое разрешение на приватный Supabase-проект `phnjcmahugetofwvnbto`.
Запрошено прямое разрешение владельца; обход через CLI/API/другой браузер не выполнялся.
Backend/JWT/OAuth/PostgREST/RLS/CAS двух настоящих аккаунтов пока не проверены.
Серверный grading остаётся disabled. Следующий локальный шаг — дождаться окончания
авторов, интегрировать общие UI-контракты и выполнить актуальный suite/UI-приёмку.

### Передача в три новых чата — 2026-10-13

Пользователь попросил перенести работу в новый основной чат и запустить отдельные
чаты для регистрации/входа Supabase и отслеживания прогресса. Передача сохраняет
существующие PLAN.md/PROGRESS.md как авторитетные документы; секретные значения
в новые prompts не передаются. Созданный владельцем project ref: `phnjcmahugetofwvnbto`.
Предыдущая попытка create_thread для Auth была отвергнута до создания: «MCP tool call
requires approval, but approval policy is never». Тогда новых чатов/ID не было.
В исходном чате пользователь переключил профиль на danger-full-access:
filesystem/network unrestricted, approval policy never; обычный exec там работал
как lomaster. Это наблюдение исходного чата, а не гарантия профиля созданных чатов.
Повторное создание succeeded, без обхода:

- основной `01a13261-d4bd-7170-9a0b-eb1e8db01e0c`;
- Auth `01a13260-77c8-79d1-af8e-b94b8f436859`;
- Progress `01a13261-4efe-7693-a7ba-78aecdbe254c`.

Секреты не передавались. Initial prompts содержат актуальное уточнение профиля,
историю проверок, boundaries файлов, критерии приёмки и known traps. Основной чат
дождётся ready-20261013.json перед записью общих файлов; Auth/Progress имеют disjoint scopes.
Полные briefs сохранены и проверены как локальные ignored task artifacts:
`work/practice-chat-handoff/main.txt`, `auth.txt`, `progress.txt`. Их нужно передать
соответствующим новым локальным чатам проекта; initial prompts уже отправлены при создании.
Checkpoint до этого уточнения: `5fecf49abf68fdf9c7ccd193b450e76a70404aec`,
обычный push и local/remote master SHA match подтверждены. Новых source изменений нет.
Backend ещё не подключён и не проверен: browser tool дважды отклонил чтение dashboard
из-за saved permission block для supabase.com. Ошибка самого Supabase не наблюдалась.

Причина запросов прав Git в прежнем профиле проверена непосредственно: обычный sandbox `git add`
получил Permission denied на `.git/index.lock`; вне sandbox команда прошла.
Прежний sandbox process работал как `CodexSandboxOffline`, обычный Windows user — `lomaster`.
Профиль разрешений команд и browser permissions независимы. Новый чат не доказывает
устранение этих ограничений. Постоянное разрешение на commit/push основного branch
явно сохранено в AGENTS.md, commit `a3a1946`; дополнительные вопросы о намерении
commit/push main/master не нужны. В исходном чате sandbox был отключён и команды
выполнялись обычно. Отдельные browser permissions и профиль новых чатов этим
доказательством не подтверждаются.

Перед передачей проверены документы/JSON, commit `7f5cfd09def8b5bdc308514fbb6f770ae7b7ef40`
обычно pushed, local/remote master SHA совпали. Runtime срез публичной публикации
не изменился; полный предыдущий suite422/422 и hosted desktop/mobile proofs применимы
в обозначенных границах. Новые Auth/Progress проверки ещё не выполнялись.
Не включать посторонний untracked `.codex-remote-attachments/` в commit.

Разделение файлов записано в PLAN.md. В общей local копии авторы не меняют ветку,
не правят чужие файлы и сериализуют Git через эксклюзивный FileShare.None handle
`work/practice-coordination/git.lock` на время add/commit/push/SHA verification;
чужие staged изменения не коммитят. Основной чат интегрирует общие UI/migrations
после окончания авторов и затем проводит общий suite и настоящую браузерную приёмку.
Статус learner grading остаётся disabled; успешная самопроверка не означает server pass.

### Внедрение практики — checkpoint 2026-10-13, 00:54 MSK

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, текущая ветка `master`,
база `212a6ef4d3baebb83b41bd20a53a069f4358a2e4`. Реализация committed и pushed:
`76693f6993dfbe04884e0d9d1bffe44a4c8aa6f4`; `git ls-remote` подтвердил совпадение SHA.
Исправление CI committed/pushed: `3a0a72a42c89c285ff2ef07a6caff2d654df9cb4`,
локальный/remote SHA совпали. Source, tests, migrations и Rust-ядро совпадают с проверенным SHA.
Пользователь отдельно разрешил fast-forward `master`: `0082796` → `fe5ccac`,
22 коммита/415 файлов. Remote master перепроверена; локальный fast-forward выполнен,
затем workflow `[master]` committed/pushed в `3e036d70157672bbda36df52eefb03a7bbd0be58`.
Local/remote master SHA совпали; feature branch сохранена. Документы и screenshots
публичной публикации сохранены в `6430151e00d784d1085f891c2d35185e1140938d`;
его local/remote master SHA совпали, рабочая копия перед текущим уточнением была чистой.
Текущее уточнение меняет только документы результатов; runtime и tests не меняются.
Rust-ядро не менялось. Исходный checkout `worktrees/6209` не затронут.

- Собран полный каталог: 83 исходные учебные темы, 51 математическое понятие и два
  дополнительных подраздела ReLU/softmax; 136 панелей-тем, 412 упражнений,
  1236 языковых вариантов, 758 открытых fixtures. Полнота semantic IDs проверена.
- Реализован редактор с основным языком на выбор, отдельными черновиками Python/JS/Rust,
  durable help receipts и локальной историей самопроверок. CAS и Web Locks защищают
  локальные версии; неправильное/недоступное storage не перезаписывается молча.
- Практика встроена в восемь переключаемых курсов по семантическим ID главы,
  в архитектуры, после конкретных тем базовых уроков и внутри математических разборов;
  есть общий маршрут `#practice`.
- Supabase migrations и Auth/PKCE клиент готовы локально. Полный seed выполнен fresh:
  PostgreSQL17.5 через disposable PGlite, **12403 assertions PASS** для всех 1236
  variants и requirement mappings, RLS двух пользователей, CAS, help и immutable release.
  Это не проверка hosted JWT/PostgREST, OAuth или реального конкурентного DB-сеанса.
- Общий suite: **422/422 PASS, 0 skipped**, Node24.19 / Python3.12.14 / rustc1.87;
  включён `PRACTICE_VERIFY_ALL_LANGUAGES=1`, оба runtime указаны полными путями.
  Лог: `learning-lab/evidence/practice/tests-final.log`. Авторские JS/Python/Rust
  реально исполнялись; есть независимые FD, вероятностные, геометрические и domain проверки.
  После последней языковой редактуры и переносимых runtime defaults затронутые
  advanced/concept-advanced проверки повторены: **22/22 PASS**.
- Security review исправлен: guest/A/B имеют отдельные code/help/history/primary scopes;
  CAS выполняется даже при совпадении с cached source; поздние Auth body/OAuth/refresh/logout
  не заменяют новый аккаунт или свежие токены. Cloud11 + local11 = 22/22 PASS;
  последний read-only review не нашёл новой воспроизводимой ошибки в этих исправлениях.
- Реальный IAB браузер `127.0.0.1:5194`: desktop 1440×1000 и mobile 390×844,
  черновик+помощь+история пережили reload; на mobile горизонтальный overflow не найден.
  Дополнительно сохранены реальные desktop1280×720 и mobile390×844 screenshots:
  три inline панели нейрона без duplicate IDs/overflow, точная смена Adam/SGD/Momentum,
  пять тем Network; математическая практика внутри mobile modal. Итоговый production
  browser regression выполнен на production с `/rust_ml/`: сохранение кода, hints и
  history после reload; modal375/375, Escape возвращает фокус на источник. Text stress
  200% CSS: 320×568, p28px, page305/305; это не native zoom. Typecheck и две сборки
  root/Pages PASS; предупреждение main chunk>500kB сохранено. Переносимые доказательства:
  `learning-lab/evidence/practice/README.md`, hashes, logs, screenshots.
- Начальный full suite 345/345 PASS относится к раннему срезу, не к итоговому каталогу:
  `learning-lab/evidence/practice-tests-initial.log`. Runtime Node24.19; ранний Python3.10.11
  относится к author-agent PATH. Текущий bundled Python проверен командой `--version`:
  3.12.14, 17:34 MSK; прямой rustc1.87 из stable toolchain
  (rustup shim требует недоступное скачивание).
- GitHub Pages workflow и base `/rust_ml/` подготовлены. Repo public, connector
  подтвердил push/admin права. До первого входа browser GitHub не был авторизован.
  Первый Actions run `38268067306`:
  build job `114875201446` полностью PASS (языки, tests, build, artifact); deploy
  `114875585648` получил HTTP404 с указанием проверить включение Pages. Само состояние
  настройки Pages без входа не прочитано. На `3a0a72a` повторный Pages run
  `38268999579`: build `114878283434` PASS; deploy `114878584001` FAIL.
  Новый проект Supabase Free разрешён пользователем; на тот момент ещё не создан.
  В этих ранних запусках frontend/backend ещё не заявлялись рабочими;
  последующая успешная публикация Pages записана ниже.
- CI run `38268066995`, learning-lab job `114875200270`: 415 PASS / 3 FAIL / 4 SKIP.
  Три Rust checks вызвали auto-install отсутствующего 1.87.0 через rustup proxy;
  log содержит конфликты установки `bin/cargo`, rust-std и `bin/rust-gdb`.
  До тестов добавлена последовательная установка toolchain и абсолютные Python3/rustc
  paths, как в прошедшем Pages build; включены все языковые проверки.
  Исправленный CI `38268999625` на `3a0a72a` полностью PASS: учебник
  `114878282759`, Rust Ubuntu `114878282957`, stable `114878283021`,
  Rust Windows `114878283054`. Учебник в Linux: **422/422 PASS, 0 skipped**,
  typecheck/build PASS. Rust fmt, Clippy, debug/release/doc и примеры PASS.
  Rust-ядро не изменялось.
- Grading disabled: ни браузер, ни SQL не выдают pass без изолированного runner.
  Piston public API с 2026-02-15 требует авторизации по README; бесплатный произвольный
  Python/Rust runner пока не подтверждён. Платных ресурсов не создавали.

После входа пользователя оба сервиса проверены в IAB. Pages действительно был disabled;
Source=GitHub Actions сохранён. Rerun `38298431308`, attempt2: build PASS, deploy
`114983283228` отвергнут до steps: feature branch не разрешена средой `github-pages`.
Настройка среды прочитана: разрешена только `master`; правила не менялись.
Первый fast-forward отклонён auto-review из-за широкого изменения default ветки.
После конкретного ответа пользователя разрешение получено и fast-forward выполнен.

Последний доступный осмотр Supabase: личная организация `iliskhan's Org` Free,
форма `rustml-learning-lab`, Europe, Automatically expose new tables=false;
при этом осмотре проект ещё не был создан. Затем владелец сообщил о создании проекта
`phnjcmahugetofwvnbto`. Повторная проверка созданного проекта отвергнута browser tool:
сохранённая настройка разрешений запрещает доступ к supabase.com. Обход не выполнялся.
Правило browser hand-off требует, чтобы новый пароль и отправку формы выполнил владелец;
его сообщение о создании получено, hosted состояние ещё не проверено.
По прямому запросу владельца пароль сохранён локально с Windows DPAPI CurrentUser для
`lomaster`: `work/practice-secrets/supabase-database-password.dpapi`; decrypt round-trip PASS,
`git check-ignore` подтвердил исключение файла. Plaintext в файлы проекта не записывался.
Prepared hosted SELECT-only smoke: `work/practice-hosted-verification/`; локальная
проверка fresh migrations PASS, 20/20 counts, 6/6 triggers, 0 ACL violations.
Это не hosted Auth/JWT/OAuth или concurrency-тест.

Дополнительный личный Site опубликован: `appgprj_6acd3df3debc8191a838981ae6b52d20`,
URL `https://rustml-iliskhan-learning-lab.comet-bison-6441.chatgpt.site`, owner-only
(один разрешённый пользователь, без групп/внешних посетителей). Native deployment
`appgdep_6acd3fafc14481918581f5ccb0173a7b` succeeded в 20:15:38UTC; saved version
`appgprj_6acd3df3debc8191a838981ae6b52d20~appgver_b56f5eafdee48191bc957eabf106ed3b`.
Отдельный Sites source SHA `76fd4e937968028f05a4dc5639c2ad79163743b0`, compiled из fe5ccac
с base `/`; архив SHA256 `2a0068aa98e96b66844d21b2a1fa3b84e92ddeafe04109f2a1d5ef4e4edc8199`
перенесён после save в ignored `work/practice-sites-artifacts/`. Никаких secrets в файлах.
Обычная автоматизационная вкладка IAB дошла до ChatGPT login gate; этот вход не проверен.
Отдельный native Codex viewer показал учебник: открыта «Практика и прогресс», видны 136 тем,
редактор и banners отключённых cloud/grading, console=[]; desktop screenshot сохранён
в task-owned ignored visualization directory как `sites-native-practice.png`.
Mobile и persistence именно этого личного Sites-предпросмотра не проверялись.
Ownership mismatch исправлен process-local safe.directory для отдельного Sites repo;
упаковщик использовал установленный Git Bash вместо отсутствующего WSL-диска,
process-local Node PATH/TMPDIR внутри workspace и TAR_OPTIONS=--force-local.
Настройки системы и Git global config не менялись.

Raw source hashes обновлены после checkout master→fe5ccac: 38 disk digests изменились.
29 совпали с прежними после нормализации CRLF→LF; ещё 8 source/test/SQL файлов
смешанных line endings совпали с Git HEAD blobs после той же нормализации.
Оставшееся содержательное изменение — только workflow branch `[master]`.
Исторические local/SQL logs сохраняют hashes своего проверенного среза.

Публичный Pages опубликован: `https://iliskhan.github.io/rust_ml/`, HTTP200.
Run `38304016680`: build `114993540239` и deploy `114993855883` PASS.
CI `38304016667` на том же SHA полностью PASS: learning-lab `114993540057`,
Rust Windows `114993540378`, stable `114993540416`, Rust Ubuntu `114993540507`.
В Linux422/422 PASS,0skipped; typecheck/build PASS.
Реальный IAB: desktop1280×720, document1265/1265; Python QA code, hint receipt и
1 formative history сохранились после reload. Mobile390×844: math concept.evaluation
встроен в dialog, client/scroll375/375; Tab фокусирует exercise selector, Escape
закрывает open dialog и возвращает фокус на source button. Console error/warn=[];
код ученика не исполнялся. Переносимые proofs/screenshots:
`learning-lab/evidence/practice/hosted-publication.json`, hosted-pages-*.png.

На checkpoint `6430151` CI `38306271930` и Pages `38306271862` полностью SUCCESS;
эти изменения затрагивали только документы и доказательства.

Следующий шаг для продолжения backend: владелец снимает сохранённый browser запрет
для supabase.com. Затем проверить созданный им project `phnjcmahugetofwvnbto`, его
готовность и отсутствие конфликтующих `practice_*` объектов; применить три migrations
и выполнить настоящие hosted Auth/RLS/CAS проверки. До этого cloud/backend/runner
не заявляются рабочими. Предыдущее отклонённое чтение Git credentials не выполнялось;
Pages настроен через обычный авторизованный браузер. Секреты в чат/Git не передаются.

### Передача: практика, Supabase и бесплатное развёртывание — 2026-10-12

База `827b443c32fc09411d9d2c326c410f4f54051b93`, checkout
`C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, ветка `codex/ui-ux-learning-lab`,
remote `https://github.com/iliskhan/rust_ml.git`. Исходное дерево было чистым.
Проектные документы добавлены тремя агентами в непересекающихся файлах;
все агенты прекратили изменения перед передачей. Основной чат сохраняет их commit/push.

**Последние поручения пользователя (они расширяют прежний design-only scope):**
1. Основной язык на выбор, остальные — отдельные достижения.
2. Реализовать практику после каждой темы, распределив части между агентами/чатами.
3. Сразу развернуть проект; backend — Supabase, frontend на бесплатном хостинге;
   объяснить, что требуется от пользователя. Пользователь назвал GitHub Pages
   и попросил альтернативы. Платные ресурсы не заказывались и не разрешены.
4. Создать новый чат со всем нужным контекстом; вся основная разработка продолжается там.

**Что подготовлено:**
- [Общая спецификация](learning-lab/docs/practice-system.md): UX, аккаунт, offline,
  помощь, доступность, интеграция и пять этапов внедрения.
- `practice-curriculum.md` + `practice-topic-inventory.json`: 83 учебных раздела,
  51 математическая микротема, 45 навигационных карточек, 536 контуров заданий.
  Это не 536 готовых bundles. Softmax, shared-node backward, SGD расписаны подробно
  с Python/JavaScript/Rust сигнатурами, числами и ловимыми ошибками.
- `practice-data-model.md` + `practice-schema.sql`: 13 таблиц, 11 функций, 1 view;
  immutable releases, RLS/grants, draft CAS, help receipts, attempts, SQL jobs,
  lease/fencing/idempotency. Требования объединяют равноценные упражнения через OR:
  guided `pass`, transfer `independent`; минимум A/B для independent. Банк конечный.
- `practice-execution.md`: API и отдельный изолированный runner; code-only grade.
  Conceptual quiz пока formative/local. Submit берёт уже сохранённый draft revision.
  `/runs`, retirement релиза, rich result JSON и полноценный compute ledger пока
  не поддержаны proposed DDL; явные границы описаны. Внешние ключи/права нужно проверить.

**Проверки этого пакета:** Python 3, Windows, этот checkout/база; разобран JSON,
проверены уникальные unit/concept/task IDs, 51 current concept ID по исходникам,
prerequisite refs, существование source paths, Markdown-ссылки/ограждения;
независимо пересчитаны 7 fixtures softmax/backprop/SGD — PASS.
Текст SQL прочитан и договоры API приведены в соответствие. Это не execution SQL.
`git diff --cached --check` выполняется перед commit, delivery SHA передаётся в новый чат.
Новых runtime/bundles/UI/auth/RLS проверок не было. Прежние 331/331, tsc/build,
desktop/mobile относятся к последней функциональной реализации ниже.
Локальные PostgreSQL/Supabase CLI не найдены; Docker daemon недоступен
(`docker_engine` pipe отсутствует). Новых аккаунтов, Supabase-проекта, секретов,
облачных ресурсов и работающего backend не создано. Приложение/Rust не менялись.

**Бесплатное размещение, проверено по официальным страницам 2026-10-12:**
- [Cloudflare Pages](https://www.cloudflare.com/products/pages/) — рекомендация
  для статического React/Vite. [Free limits](https://developers.cloudflare.com/pages/platform/limits/):
  500 builds/месяц, 1 одновременная сборка, asset ≤25 MiB. Проверить тяжёлые WASM,
  если появятся. Поддомен pages.dev позволяет обойтись без покупки домена.
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
  бесплатен для public repo на GitHub Free; для project site требуется Vite base
  `/rust_ml/`. Наличие public доступа репозитория отдельно не проверено.
- [Supabase Free](https://supabase.com/pricing): подойдёт для первого аккаунта/прогресса
  в пределах лимитов. [Малоактивные проекты могут приостанавливаться](https://supabase.com/docs/guides/platform/free-project-pausing).
  Не утверждать, что свободный слот free project у аккаунта пользователя уже есть.
- Пользовательский Python/JS/Rust не запускать в Supabase Edge. Нужен отдельный
  доказанно изолированный runner; его бесплатный непрерывный хостинг пока не найден.
  Не заменять его eval в приложении или поддельным «серверным успехом».

**Что может потребоваться от пользователя:** вход/подключение Cloudflare (если
выбран Pages) и Supabase, выбор существующего или создание бесплатного проекта,
регион и разрешение GitHub-интеграции на rust_ml. URL и publishable key допустимы
в frontend; DB password/service_role/secret/PAT вводить через защищённый login/secret
механизм, не в чат и не в Git. Для email OTP потребуется SMTP; для бесплатного старта
рассмотреть GitHub OAuth, согласовав изменение предложенного UX. Никаких текущих
доступов к Supabase/Cloudflare не подтверждено; подключённого Supabase tool нет.

**Следующее действие нового чата:** прочитать этот checkpoint и шесть документов,
проверить текущий checkout/ветку/dirty state. Брать актуальную отправленную ветку
`origin/codex/ui-ux-learning-lab`, а не устаревшую default branch. Сохранённый проект
Codex указывает на `C:/Users/lomaster/Desktop/dev/rust_ml`; там сначала проверить
пользовательские изменения. Ветка текущего чата занята worktree6209 — нельзя force
переключать/сбрасывать её. При необходимости создать свою codex-ветку/изолированный
worktree от подтверждённого commit, сохранив чужую работу. Затем параллельно:
контент первых трёх anchors, UI/локальный прогресс, Supabase/RLS/инфраструктура.
Подготовить и проверить frontend deploy, запросить только реальные недостающие
доступы, продолжая независимые части. Не выдавать план за работающий сайт.

Рабочие команды: из learning-lab запускать Node напрямую
`C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`
с `--test tests/*.test.ts`, `node_modules/typescript/bin/tsc --noEmit`,
`node_modules/vite/bin/vite.js build`. Python находится рядом в
`dependencies/python/python.exe`; на Windows для Unicode нужен `-X utf8`.
В learning-lab пока нет vite.config.ts; GitHub Pages base/config ещё не настраивались.
Секреты никогда не переносить в VITE_* кроме public URL/publishable key.
Для UI обязательны настоящий desktop/mobile, клавиатура и 200% text/reflow;
Narrator пропущен пользователем, не возобновлять без нового запроса.
После изменений: meaningful tests, commit, обычный push и local/remote SHA.

### После шестнадцати лабораторий — исследование завершено, 2026-10-12

Текущий запрос — найти оставшиеся темы и визуальные опыты. Проверена чистая
база `56a5f9228aaeec4f7822e5c13186d875972e5376`, checkout `6209/rust_ml`,
ветка `codex/ui-ux-learning-lab`. Реестр/исходники, независимый read-only аудит
и первичные статьи дали 14 рекомендаций в PLAN.md: четыре углубления и десять
новых механизмов/семейств. Приоритет: калибровка, дистилляция, RealNVP, VQ-VAE;
следующий пространственный опыт — PointNet, далее Gaussian Splatting/FNO.
Отдельно отмечены TTT/Titans, TRM и world models и границы малых реализаций.
Уже готовые ODE-интеграция и oversmoothing исключены из списка новых пробелов.
Это исследование, новые функции не реализовывались; предыдущий принятый пакет
завершён. Изменяются только PLAN.md/PROGRESS.md. Проверка документации —
`git diff --check`; тесты/браузер не перезапускались без изменений кода.
Следующий функциональный шаг — отдельная реализация выбранного нового объёма;
текущий запрос рассматривается как рекомендации, не как согласие на все новые идеи.

### Новые темы и обучение архитектур — завершено, 2026-10-12

Пользователь принял весь список из 12 направлений и обучение ViT/MoE/SSM/U-Net/DiT.
База `035866823921e15656c87484f092d508dc194f6c`, начальное дерево чистое,
checkout `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, ветка `codex/ui-ux-learning-lab`.
Контракты/порядок в PLAN.md. Все 16 лабораторий реализованы и подключены к
`#frontiers`, карта обучения и навигация обновлены. Три независимых review
проверили градиенты и распределения; исправлена производная CLIP при норме
ниже epsilon, добавлена регрессия. Общий suite 331/331 PASS, TypeScript и
production build PASS. Все 16 лабораторий проверены в IAB на 1280×720 и 320×800
с настоящими действиями обучения, sampling, клавиатурой и крайними случаями.
Исправлены масштаб подписи Flow (8,33→12 экранных px) и направление checkbox;
после правок повторены TypeScript/build и затронутые browser-сценарии.
Console warn/error=[]; общей горизонтальной прокрутки нет; viewport сброшен.
Журналы, независимые review, скриншоты и границы проверок:
[итоговая приёмка](learning-lab/evidence/frontier-expansion/README.md).
Code commit `2be6a31406d8f8b9ec1d12f6c273206136a0f692` отправлен обычным push.
`rev-parse HEAD` и `ls-remote origin refs/heads/codex/ui-ux-learning-lab`
вернули этот одинаковый SHA; после code commit рабочее дерево чистое.
Этот delivery-checkpoint сохраняется отдельным doc commit. Обязательных работ
по принятому пакету не осталось. Rust-ядро не менялось.
Озвучивание пропущено по решению пользователя.

### Следующие визуальные темы — исследование завершено, 2026-10-12

Запрос: найти оставшиеся темы и подходящие визуальные опыты после десяти расширений.
Проверена чистая база `905ccec7a925d73705b7ac0f374a0e3c26c12bd4`, checkout
`C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, ветка `codex/ui-ux-learning-lab`.
Независимый read-only аудит и проверка первичных статей дали 12 направлений в PLAN.md;
отдельно выделено обучение уже имеющихся ручных ViT/MoE/SSM/U-Net/DiT.
Главный пространственный приоритет — EGNN и NeRF. Полный tiny Transformer уже есть.
Новые функции не добавлялись; меняются только PLAN.md и этот checkpoint.
Проверки: чтение curriculum/architectures и профильных исходников; поиск терминов
через rg; первичные статьи arXiv. Найденные устаревшие UI-тексты о Transformer
записаны в PLAN.md для следующей правки. Тесты/браузер повторно не запускались:
текущая задача исследовательская, прошлые 293 теста не выдаются за новый прогон.
Перед commit: `git -c safe.directory=C:/Users/lomaster/.codex/worktrees/6209/rust_ml diff --check`.
Следующий функциональный шаг — принять объём из нового списка; текущий запрос
разрешает рекомендации, а предыдущий принятый пакет уже полностью реализован.

### Десять расширений архитектур — завершено, 2026-10-12

Пользователь принял все десять направлений из PLAN.md. Начальная чистая база
`417fb4ffb9ffe1139498ec64b67e876d11c17703`, checkout `6209/rust_ml`,
ветка `codex/ui-ux-learning-lab`. Контракты новых компонентов разделены между
тремя агентами и основным чатом; общие файлы меняет только основной чат.
Все десять модулей подключены к `#advanced`, карта обучения и переходы обновлены.
Первый общий запуск: 292/292 тестов, tsc --noEmit, Vite production build PASS.
Independent review подтверждает 624 дополнительные finite-difference проверки tiny
Transformer, 324 attention, 50 gated-delta, 216 MoE, 36 MLA fixtures и 24 граничных
LoRA-запуска. Два P3 исправлены: подпись масштаба MLA и underflow нормировки MoE
после capacity; добавлена регрессия. После исправлений нужна итоговая общая проверка.
Итоговый suite **293/293 PASS**, strict TypeScript и Vite production build PASS.
После последнего полного suite менялись только UI/CSS и документация; финальные
tsc/build повторены. Браузер IAB, production preview5183: все десять глав проверены
на 1280×720 и 320×800, с реальными действиями и клавиатурой. Исправлены контраст
attention-плитки, положение causal-checkbox, перенос числовых векторов в таблицах
и подсказка reset для упражнения LoRA. Таблицы прокручиваются локально с клавиатуры;
общей горизонтальной прокрутки нет, console warn/error=[]; viewport сброшен.
Результаты и скриншоты: [отчёт](learning-lab/evidence/architecture-expansion/README.md).
Озвучивание пропущено по повторному решению пользователя во время задачи.
Code commit `1e51996f9bd7f7682cbf31e35a71117e2723c733` отправлен обычным push.
`rev-parse HEAD` и `ls-remote origin refs/heads/codex/ui-ux-learning-lab` вернули
этот одинаковый SHA. Этот delivery-checkpoint сохраняется отдельным doc commit.
Функциональных работ по принятому пакету не осталось. Rust не менялся.

Обновлено: 2026-10-12. Учебная цель и порядок развития — [PLAN.md](PLAN.md).
Этот файл — текущий checkpoint; результаты прошлых запусков не заменяют проверку изменённого кода.

## Текущая задача и результат

### Следующие архитектуры — исследование завершено, 2026-10-12

На чистой базе `7d5e1bb45254525b3ee16d41a3d00e81fde2fcfc` проверен текущий охват
Transformer и семейств сетей; независимый read-only аудит подтвердил пробелы.
В PLAN.md сохранены 10 ранжированных направлений, первичные источники, конкретные
опыты и границы заявлений. Первая очередь: полный backward/обучаемый tiny Transformer,
BPE, SwiGLU, LoRA, ViT и MoE. Это рекомендации к следующему этапу, новые функции
в этой задаче не реализованы. Исправлено устаревшее описание охвата CNN/RNN
в docs/architectures.md по уже работающим режимам обучения.
Проверки этой задачи: чтение кода, поиск повторяющихся ограничений, первичные
статьи/официальная документация и diff --check. Численные тесты и браузер повторно
не запускались: меняется только документация, предыдущие 260 тестов относятся
к реализованному пакету ниже. Следующее действие — выбрать/подтвердить объём реализации.

### Восемь визуальных опытов — завершено, 2026-10-12

Чистая начальная база `646605b97c505b262cd10ab521df46d648232330`, checkout
`C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, ветка `codex/ui-ux-learning-lab`.
Scope и авторитетный порядок записаны в PLAN.md. Три агента получили
непересекающиеся файлы; основной чат реализовал RL и PredictionExperiment.
Реализованы все восемь опытов и общий PredictionExperiment. Новые вычисления
переиспользуют нормализацию, convolution, BPTT, текущую голову и Boundary APIs.
260/260 тестов, tsc --noEmit и Vite production build прошли в этом checkout.
Логи: learning-lab/evidence/visual-experiments/{test-output,build-output}.txt.
Build предупреждает о главном chunk 500,43 kB; это не ошибка сборки.
Независимый review проверил 82 дополнительных случая; найденное исчезновение
карточки прогноза головы на шаге 499→500 исправлено и проверено в браузере.
Все восемь опытов проверены в IAB на 1280×720 и 320×800, включая реальные
действия прогнозов, клавиатуру и численные альтернативы. Исправлены мобильные
подписи SVG-карт (теперь 12 экранных px), размещение CNN на всю ширину и
сравнимые цветовые шкалы матриц. Общей горизонтальной прокрутки нет.
Снимок loss не меняется при дальнейшем обучении основной сети. Консоль без
warn/error. Последняя сборка после визуальных правок успешна, 126 модулей.
Полные наблюдения и скриншоты: [отчёт](learning-lab/evidence/visual-experiments/README.md).
Code commit `bfa7763efcbe7c30e97e8d8eb668432381a6c438` отправлен обычным push;
`rev-parse HEAD` и `ls-remote origin refs/heads/codex/ui-ux-learning-lab` дали
одинаковый SHA. Рабочее дерево после code commit чистое, diff --check пройден.
Этот checkpoint сохраняется отдельным doc commit; функциональных работ по пакету не осталось.
Озвучивание по прежнему решению пользователя не входит в этот пакет.

### Четыре лаборатории обучения — завершено, 2026-10-12

Checkout `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, ветка
`codex/ui-ux-learning-lab`, чистая база `490162fb8fb4c6ec8ff29cb6d7b640caf790431d`.
Пользователь разрешил все предложенные направления и дополнительные полезные
варианты параллельно в нескольких чатах. Общий порядок — в PLAN.md.

- BPTT: `01a12e18-d719-7081-87d3-f1b979d8f443`; новые BpttLab/bpttMath/test.
- CNN: `01a12e19-6a1b-7692-9e3f-07147597017e`; новые CnnTrainingLab/math/test.
- Mini-batch/L2: `01a12e19-7df0-71b0-a833-763e58420bf3`; Boundary math/state/UI/tests.
- Transformer head: `01a12e19-e166-7233-8535-32b2de7792c4`; новый head lab/math/test.

Четыре чата завершили работу в отдельных managed worktree, создали code/doc commits
и подтвердили обычный push с совпадением SHA. В общую ветку приняты code commits
`6a9001c` (BPTT), `e9135da` (CNN), `6d13646` (mini-batch/L2), `9e15a77` (head).
Интеграционный code commit `8571351b762dc072c04b17657be6a3d866c77fda`:
239/239tests PASS; typecheck/build PASS (108модулей; Node24.19.0/pnpm11.25.0/Vite7.3.7).
Rust, зависимости, lockfile и основной checkout не изменены.

В IAB проверены desktop1280×720/mobile320×568, клавиатура, практики и CSS200%.
BPTT: L0,555983→0,439410 за1SGD; CNN:MSE2/3→0,0000277256 за100SGD;
head:CE1,585117→1,003971 за20SGD, max|Δh|=0. Практики до действия не проходят.
Посещённые семейства/режимы и главы сохраняют state; новые опыты грузятся лениво.
Реальный v1 (шаг450,A100/B100) продолжился побитно; v2 export/import сохранил
следующий шаг11/212 и p0,499614. Для batch20/96 бюджет192примеров достигнут
за10/2обновления. Неверный импорт не заменил текущий опыт и A/B. После ухода
автообучение Boundary остановилось на шаге20 и не продолжалось в скрытом уроке.

Независимый review выявил фоновую серию CNN в hidden-панели: теперь деактивация
отменяет token/busy, каждый chunk проверяет activeRef. Исправление повторно
проверено review. Формулы gW/gb разделены. В реальной раскладке исправлены переносы
чисел ползунков, численных ячеек/подписей таблиц и номеров sidebar при200%.
Общего горизонтального overflow нет; широкие таблицы прокручиваются клавиатурой.
Финальные обычная и CSS-вкладка: console warn/error0. CSS-серверы5184–5187
остановлены; viewport override снят, обычный preview5183 оставлен пользователю.

Озвучивание пропущено пользователем; native/text-only zoom не подтверждён и
не подменяется CSS200%. Открытых подтверждённых дефектов нет.
Код `8571351` и доказательства `dd5aa5c05960656f77c74eb6f29613acd3ce2945`
отправлены обычным push в `origin/codex/ui-ux-learning-lab`; local/remote SHA
`dd5aa5c05960656f77c74eb6f29613acd3ce2945` совпали. Этот документальный checkpoint
фиксируется отдельно; его итоговый SHA и чистота checkout проверяются в завершении.
Обязательных следующих действий в этом пакете нет; дальнейшее расширение — новая задача.
Сценарии и доказательства: [приёмка](learning-lab/evidence/training-labs/README.md).

### Доступность — исправления проверены; озвучивание пропущено, 2026-10-12

База `9a5680cdbc52f1ad72ebb7b0f17c390e2a2748bc`, чистый worktree6209,
ветка `codex/ui-ux-learning-lab`. Пользователь просит завершить проверки
скринридером и увеличенным текстом и исправить найденное. Порядок: проверить
окружение → увеличенный текст → скринридер → повторная проверка и Git delivery.
В настоящем IAB исправлены и повторно проверены Enter→focus BODY после
невалидного точного ввода, ползунок камеры0.6px при 320×568, обрезка диалога
и осей при CSS200%, переполнение заголовков/карты/чисел inspector. Chart имеет
раскрываемую таблицу всех исходных точек; Enter/Esc и прокрутка работают
с клавиатуры. Live-status Boundary/XOR остаётся постоянным во время обучения,
после паузы сообщает итоговый шаг. Это DOM-проверка, не прослушивание.
192/192 tests PASS, финальный build с typecheck PASS (Node24.19.0/pnpm11.25.0/
Vite7.3.7); независимый обзор новых P1/P2 не выявил. Rust/math не менялись.
В CSS200% у15 разделов нет общей горизонтальной прокрутки при 320px;
диалог даёт199px для содержимого вместо23px, камера233.2px вместо0.6px.
Проверены320×568 и1280×720; Console warn/error0 в финальной вкладке.
Первые запросы запуска Narrator/Edge истекли. После явного разрешения пользователя
оба приложения запущены. Computer Use затем остановил сеанс: при чтении окна Edge
инструмент не смог надёжно определить URL для проверки правил доступа.
2026-10-12 пользователь попросил пропустить озвучивание: проверка скринридером
исключена из условий завершения и не считается пройденной. Chrome через Browser Use
недоступен. Обход ограничений не выполнялся. CSS stress-test200% не считается
проверкой native/text-only zoom. Сценарии, снимки, команды и ограничения:
[приёмка](learning-lab/evidence/accessibility/README.md).
Код и приёмка отправлены обычным push:
`fbd22aed35f49776543ad627b225c7f50ae1617d`; local/remote SHA совпали,
рабочая копия была чистой (2026-10-12 02:18 Europe/Moscow).
Предыдущий документальный checkpoint `c3d1bc5e7a7f8876a00a71c2aef58be202fef740`
отправлен; при возобновлении изменён только файл статуса этой задачи.
Текущие изменения — только документы и статус; исходники с момента успешных
192 тестов и build/typecheck не менялись, повторный запуск этих проверок не нужен.
Порядок завершения: зафиксировать пропуск озвучивания и границы проверки →
проверить документы, создать commit и отправить текущую ветку с проверкой SHA.
Штатный/text-only zoom остаётся неподтверждённым ограничением. Возобновлять
озвучивание автоматически не нужно. SHA этого checkpoint сообщается в чате.
Временные CSS-test серверы5184–5187 остановлены; обычный preview5183 оставлен.

### Сохраняемые опыты и учебная практика — проверено, 2026-10-11 22:47 Europe/Moscow

Начало с чистого `fd19da780d8bb3800853894d8f3af6c2b97c40c5` в worktree6209,
ветка `codex/ui-ux-learning-lab`; предыдущий push подтверждён в чате.
Три агента реализовали Boundary saving/comparison, attention geometry/practice
и foundational action tasks в раздельных файлах; root — поиск, интеграцию,
браузер и мобильные исправления. Новых зависимостей нет; Rust и math core не менялись.
Пять направлений приняты:192/192 теста, typecheck и build PASS
(Node24.19.0 / pnpm11.25.0 / Vite7.3.7; финальная сборка около22:43 MSK).
Два независимых review без подтверждённых кодовых дефектов. Настоящий IAB:
desktop1280, mobile320, reflow640; JSON скачан и импортирован; повреждённый
формат отклонён без замены current/A/B. После восстановления A100 следующий шаг
даёт ту же пробу0.2750037843055549; reload сохраняет101/A100/B101 на паузе.
Практика ReLU/MSE/backprop/causal, search→concept→lesson с точным focus/scroll,
пауза обучения, клавиатурный выбор ключей и прокрутка A/B проверены.
В сравнении Adam/SGD при одинаковых seed42, сети2→8→8→1, η.02 и100 шагах
validation BCE соответственно0.128654/0.528794; это один опыт, не общий рейтинг.
Mobile исправления подтверждены screenshots: карты A/B207.6px вместо99.8px,
деления attention≈11.37screenpx. Console warn/error0 после восстановления IAB.
Полноценный screen-reader, text-only zoom200% и живые начинающие не проверялись;
границы и сценарий исследования — в [приёмке](learning-lab/evidence/learning-upgrades/README.md).
Один раз инструмент потерял браузерную сессию при скачивании; повторный export/import
прошёл, результат до повтора не засчитывался. Код доставлен обычным push:
`d4f1c52401f34136d6ae10a8b667b6452cc19ebb`; local/remoteSHA совпали,
рабочая копия была чистой перед этой записью результата. Этот checkpoint — отдельное
документирование доставки без изменений кода; его итоговый SHA сообщается в чате.
Следующий продуктовый шаг — ручная проверка доступности и исследование по сценарию
в приёмке, прежде чем расширять сохранение на другие уроки. Merge/deploy не выполнялись.

### UI/UX Learning Lab — проверено, 2026-10-11 19:48 Europe/Moscow

Checkout `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`: исходно чистый detached
HEAD `00827968ac6f4fd2624b7540e0f582a54d38c695`. Изменения только этой задачи.
Ветка `codex/ui-ux-learning-lab`, отдельный production preview
`http://127.0.0.1:5183/`; основной checkout, master и чужой порт5182 не менялись.
Готовы точный ввод рядом с Range, явный первый опыт и ранний словарь,
переходы внутри нейрона/сети, результат рядом с контролами, компактная подготовка
Boundary и обучение возле карты. Три Astra ultra работали в раздельных scope;
root интегрировал изменения и исправил два замечания независимого ревью.
В текущем checkout повторно:171/171 tests, typecheck и build PASS
(Node24.19.0 / pnpm11.25.0 / Vite7.3.7,19:46–19:47 MSK).
Настоящий IAB: desktop1440/1050, mobile390/320;22 записанных проверки PASS,
включая точный ввод/валидацию, вложенный attention, MLP snapshot/pause,
клавиатуру3D, сохранение дробной камеры и прежний XOR4/4. Console warn/error0.
319 tracked-файлов вне UI/doc allowlist неизменны, включая математику, Rust,
dependencies/toolchain/CI/tests. Исходники после final review не менялись.
[Приёмка, before/after и пределы проверки](learning-lab/evidence/ui-ux/README.md).
Git delivery этого предыдущего этапа завершён: `fd19da780d8bb3800853894d8f3af6c2b97c40c5`,
обычный push ветки `codex/ui-ux-learning-lab`, local/remoteSHA совпали; это база
текущей задачи выше. Merge не выполнялся.

### Разбор чисел и скрытые признаки MLP — реализация принята, 2026-10-11

Baseline: чистая master, `d358291586a728d2b396850acbd43f6402c1dbe9`, основной checkout.
Два Astra ultra реализовали разбор текущих чисел и скрытые признаки в раздельных
файлах; третий независимо проверил математику и интеграцию. Root повторно проверил
результат, добавил optional shape/hollow в существующий Scene3D и поправил
таблицы длинных чисел на mobile. Зависимости не добавлялись.
Кнопка «Разобрать мои числа» передаёт точный неизменяемый снимок нейрона,
attention q·k/softmax или выбранного нейрона MLP; свободное демо остаётся отдельно.
Карты показывают реальные скрытые активации тех же 96 train + 32 validation-точек
и общую пробу; выбор слоя/разных координат, честные 1D/2D/3D и полные векторы.
Новые проверки в этом checkout: 171/171 tests, typecheck и production build PASS
(Node 24.19.0, pnpm 11.25.0, Vite 7.3.7). В реальном Codex IAB проверены desktop
1050×668 и mobile 390/320×844, keyboard/camera, вложенный возврат с сохранением
снимка/шага/параметров/фокуса/scroll, остановка автообучения и прежний XOR 4/4.
Сверка DOM с математикой: 7 случаев, 13 карт, 1664 точки и 129 3D-маркеров PASS.
75 защищённых baseline-файлов, включая 28 Rust/Cargo, совпали по SHA-256;
Rust/CI/toolchain/lockfiles/launcher/package config не менялись.
Доказательства и пределы проверки: [приёмка](learning-lab/evidence/context-representations/README.md).
Оставшийся шаг этого checkpoint — commit, обычный push master и сверка SHA/clean;
его результат root сообщает в завершении чата. Исторические результаты ниже
не подменяют перечисленные новые проверки.

### Аудит дальнейших визуализаций — отчёт проверен, 2026-10-11

Запрос: запустить Astra для поиска полезных новых визуализаций, 3D и улучшений.
Baseline: чистая `master`, `09506e5008b7e603a8ee397af3f1f15e42024063`, основной checkout.
Astra ultra завершил инвентаризацию и исследование первичных источников:
[12 ранжированных предложений](learning-lab/work/visualization-coverage-audit.md),
отдельная таблица настоящих осей3D, сценарии, примеры, приёмка и ограничения.
Root сверил основные границы реализации, контекст math и численные примеры,
осмотрел настоящий UI. Source/tests/config/Rust не меняются.
Осмотрены шесть состояний production preview: сеть, вход в Transformer,
attention/softmax, вложенная математика, RoPE3D и маршрут. Desktop1050×668,
mobile390×844; возврат сохранил attention step4/query2, mobile overflow не
наблюдался, console warn/error0. Скриншоты сохранены и осмотрены в
[browser audit](learning-lab/evidence/visualization-audit/BROWSER_AUDIT.md).
Viewport сброшен, пользовательская вкладка возвращена к сети со шагом300.
Это выборочный аудит, не полная повторная приёмка. Исторические154 tests/build
не заявляются как новые проверки этой задачи. `git diff --check` PASS;
сверка с baseline показала0 изменённых runtime/test/config файлов. Рекомендованы
контекстная математика, скрытые признаки, BPTT, обучение CNN и сравнение запусков.
На момент аудита новые функции не реализовывались; отдельного поручения тогда не было.
Последующий запрос на контекстную математику и скрытые признаки выполнен выше.
Этот checkpoint сохраняет законченный аудит перед Git-фиксацией. Итоговый commit,
обычный push и совпадение local/remote SHA проверяет root и сообщает в завершении чата.

### Настраиваемые границы решений — готово и отправлено, 2026-10-11

Baseline: `master`, `4ad0dddaf8bfbb051e8407c9342f0115a697282b`, основной checkout.
Задача: круги/полумесяцы/спираль; слои 0–3, ширина 1–16 и активации;
реальное обучение, 2D/3D, простые объяснения и математический возврат.
Новая лаборатория независима от прежнего фиксированного XOR-разбора.
После прерывания продолжены частичные результаты; три Astra ultra выполнили
движок/численные тесты, интерфейс и независимое review в раздельных файлах.
Старые источники разрешено менять только в Experiments.tsx (подключение)
и decisionBoundaryMath.ts (общий probabilityGrid с сохранением XOR validation).
Начальная сверка: 72 web + 43 Rust/config совпали; это проверка содержимого.
Движок: 9/9 targeted tests; все градиенты 0–3 слоёв и смешанных активаций сверены
с центральными разностями; независимое review max|Δ|=9.14e−11. Три набора обучаются
при проверенных 2×8 tanh, seed42, Adam .03, 700 шагах; это не гарантия всех настроек.
Общий probabilityGrid: 3 новых + 7 прежних тестов PASS. UI подключён через lazy;
общие 154/154 tests, strict TypeScript и итоговая production build PASS.
Production1280/320/390: смена настроек, auto/pause, cap4000, probe/threshold,
вложенный math return и camera close/open PASS; overflow/clipping/console errors0.
CUA доступ восстановлен после ручного открытия пользователем работающего адреса;
первоначальная остановка по browser policy устранена без обхода запрета.
11 DOM cases: 11979 p/fill, 1408 samples, 2072 концов контура, 2048 граней3D,
6 вершин threshold plane, 320 линий и 129 точек независимо сверены — PASS.
Прежний XOR1+100 шагов даёт4/4; прежние3Dflow/boundary/surface открываются,
новый запуск сохраняет свои веса. Финальные115 protected SHA совпали;
80 source/config SHA зафиксированы. Rust и зависимости не менялись.
Приёмка: [learning-lab/evidence/BOUNDARY_PLAYGROUND.md](learning-lab/evidence/BOUNDARY_PLAYGROUND.md).
Код и приёмка отправлены обычным push в origin/master:
`366877e3ee8136c008431c545498805d725b9c93`. Remote SHA совпал с локальным HEAD,
дерево после push чистое; все80 source/config SHA повторно совпали.
Дополнительная фиксация этого статуса меняет только документы и проекцию прогресса.
Обязательной незавершённой работы нет. Запуск `.\learn.cmd` → «Сеть целиком».

### Граница решений в 2D/3D — готово и отправлено, 2026-10-11

Baseline: чистая `master`, `a52273cdf3e67593aadb3a69cbfe6086166dcd18`, основной checkout.
Добавлены интерактивные классы p<τ / p≥τ, контур p=τ, проба и точные числа;
3D показывает текущую вероятность, плоскость порога, сечение и проекцию на пол.
Обучение 100/1 шагов использует общую XOR; настройки и камера сохраняются.
Вложенные пути градиент→производная и логарифм→экспонента с возвратом проверены.
Три Astra ultra выполнили математику/UI/независимое review; root интегрировал,
перепроверил исходники, запустил общие checks и осмотрел production1280/320/390.
142/142 tests, strict TypeScript и production build PASS; console warn/error — 0.
Независимая сверка actual DOM: 1681 цветов, probe/corners до 6 знаков, 168 концов
2D (невязка≤4.45e−16), 168 линий 3D (≤1.14e−13 px) и 6 вершин плоскости (ошибка0).
69 прежних web и 43 Rust/config SHA совпали; старый код менялся только в интеграции
Experiments.tsx. Предыдущая 3D-сеть и поверхность XOR работают. Новых зависимостей нет.
Явно обозначены сеточное приближение хорд/седла, возможные пропуски петель/касаний,
приближённые SVG-перекрытия и отсутствие оценки обобщения. Primary sources прочитаны.
Приёмка: [learning-lab/evidence/DECISION_BOUNDARY.md](learning-lab/evidence/DECISION_BOUNDARY.md).
Код и приёмка отправлены обычным push в origin/master:
`c5e0173865f469b21f20c4c9810c78cc4e34390a`. Remote SHA совпал с локальным HEAD,
дерево после push чистое, все 74 source/config SHA повторно совпали. Дополнительная
фиксация этого статуса меняет только документы и проекцию прогресса.
Обязательной незавершённой работы нет.
Запуск `.\learn.cmd` → «Сеть целиком» → «Граница решений» и её 3D-блок.

### Сама нейросеть в 3D — готово и отправлено, 2026-10-11

Запрос: нейроны, связи, прохождение данных, обратный проход градиентов и обучение
по шагам с простыми объяснениями; проверить, commit и push. Исходное состояние:
чистая `master`, `a41e784c65a1541f029b525c431dd6aa1c304c51`, основной checkout.
Используем текущую XOR 2→4→1 и её 17 параметров. Отдельный trace показывает градиент
одного примера; реальное обучение сохраняет усреднение четырёх примеров и состояние
SGD/momentum/Adam. Положение узлов в 3D — наглядная схема, не дополнительные входы.
Три Astra ultra выполнили trace/tests, пошаговый UI и независимое review/сверку;
root интегрировал lesson и осмотрел настоящий production desktop/mobile. Десять фаз,
7 нейронов, 12 связей, 5 bias, карточки и таблица всех параметров; явная кнопка делает
один общий шаг, остальные кнопки фаз веса не меняют. Lazy загружает схему после открытия.
Вложенный возврат, закрытие/открытие, камера, pause, seed/rate/sample reset и предел
4000 проверены. После browser QA исправлены обрезка крайних узлов и наложение bias
на мобильном экране. Итоговые 320/390/1280 px: clipping/overlap/overflow — 0.
135/135 `pnpm test`, strict TypeScript и production build PASS. 1020 показанных
числовых ячеек двух шагов SGD/Momentum/Adam совпали с прежним trainer. Старый XOR
решает 4/4 за 3000 шагов; при 4000 шагов обе кнопки обновления отключены.
64 прежних web и 43 Rust/config SHA сохранены; Rust и зависимости не менялись.
Один дополнительный browser batch прервался таймаутом; после восстановления связь
с вкладкой возобновлена, предел/сброс/прежняя поверхность подтверждены отдельно.
Приёмка: [learning-lab/evidence/NETWORK_FLOW.md](learning-lab/evidence/NETWORK_FLOW.md).
Код и приёмка отправлены обычным push в origin/master:
`5874c5df5ee9e15d888acf66424787e0b7742a25`. `ls-remote` подтвердил совпадение
с локальным HEAD; дерево после push было чистым, все70 source/config SHA приёмки
повторно совпали. Дополнительная фиксация этого статуса меняет только документы
и проекцию прогресса. Обязательной незавершённой работы нет.
Запуск `.\learn.cmd` → «Сеть целиком» → «3D: нейроны, связи и обучение по шагам».

### 3D-визуализации и постоянное правило Git — готово и отправлено, 2026-10-11

Исходное состояние: `master`, `35942ec6c2d43628b8517f35efaf5c13a28034b5`, рабочее дерево чистое.
Правило самостоятельных commit/push после проверенного завершения сохранено в глобальном
`C:/Users/lomaster/.codex/AGENTS.md` и версионируемом корневом `AGENTS.md`.
Область: реальные поверхности нейрона/MSE/оптимизаторов/градиента/XOR, условные плотности
VAE, плотность diffusion по времени, каналы CNN и вращение пары RoPE по позиции.
3D остаётся дополнительным видом; исходные числа, плоские графики и обучение сохраняются.
Три Astra ultra выполнили исследование, renderer, генеративные/CNN/RoPE сцены и независимые
проверки; основной агент интегрировал части и осмотрел настоящий production UI.
Последний общий проход 13:48 MSK: `pnpm test` 128/128, `pnpm build` с typecheck — PASS.
Все девять сцен проверены на 320/390/1280 px; overflow/console errors — 0. Вращение,
обучение, закрытие/открытие блоков и математический возврат подтверждены. После review
исправлен сброс камеры VAE/diffusion; новый build и affected production QA прошли.
43 Rust/config и 29 прежних web math/navigation/tests/config SHA совпали с эталоном.
Rust fmt/clippy/docs/examples и debug/release по 52 tests + 5 doctests — PASS.
Полная приёмка: [learning-lab/evidence/THREE_DIMENSIONAL.md](learning-lab/evidence/THREE_DIMENSIONAL.md).
Rust-код и прежние математические модули не изменены, новых зависимостей нет.
Реализация и приёмка отправлены обычным push в `origin/master`:
`399cbf6a1b7cba6bcc9812bc4cb8be163927db9b`. `ls-remote` подтвердил совпадение с HEAD,
рабочее дерево после push было чистым. В 13:54 MSK все 65 source/config SHA финальной
приёмки повторно совпали. Дополнительная фиксация этого статуса меняет только документы
и проекцию прогресса. Обязательная работа завершена. Запуск `.\learn.cmd`.

### Интерактивные VAE / GAN / diffusion / GNN / RL — готово и отправлено

Пользователь запросил пять полноценных глав и push всех изменений после проверки.
Три Astra ultra реализуют непересекающиеся группы файлов: VAE/GAN, diffusion, GNN/RL.
Основной агент расширяет математические предпосылки, интегрирует маршруты и независимо проверяет итог.
Главы включают реальные малые обучаемые модели/табличное RL, простые объяснения, визуализации,
упражнения и общий механизм математического погружения с сохранением состояния.
Новые зависимости и серверные API не требуются. По дополнительному запросу пользователя прежняя
проверенная версия отдельно сохранена и отправлена в origin/master: `009a58bb525e437da7a1cd5f9dfd73b70fcffcb5`.
Проверено совпадение remote SHA. Новые главы не вошли в этот commit; текущая работа идёт поверх него.
Перед checkpoint 32 прежних source/tests/config совпали с сохранёнными SHA256. Commit включает
исправления Rust и первую/расширенную версии учебника. Единственная техническая поправка при
проверке staged diff — удаление лишней конечной пустой строки LICENSE-APACHE, без изменения текста.
Автоматическая проверка отклонила первый commit до исправления whitespace; после исправления
`git diff --cached --check` прошёл. После приёмки новых глав будет отдельный commit/push.

| Этап новых глав | Статус | Проверяемый результат |
|---|---|---|
| Исследование и математические основы | Готово | Первичные источники; 51 понятие, 10 новых типов численных опытов |
| VAE и GAN | Готово | По 5 разделов, настоящее обучение, desktop/mobile и численные тесты |
| Diffusion | Готово | Denoiser, DDPM/DDIM, аналитический CFG и пауза при углублении проверены |
| GNN и RL | Готово | GCN, Bellman/Q-learning/policy gradient; адаптивный граф исправлен |
| Независимая приёмка | Готово | 102 web tests/build; Rust 52+5 debug/release; 52 SHA без изменений |
| Commit и push | Готово | Главы: 121cfa0, обычный push; remote master SHA подтверждён |

Git remote: origin https://github.com/iliskhan/rust_ml.git. Сетевой push с разрешённым запуском прошёл.
Снимок SHA256 прежних файлов — learning-lab/evidence/advanced-baseline-hashes.json.
Полный протокол: [learning-lab/evidence/ADVANCED.md](learning-lab/evidence/ADVANCED.md).
Все 25 разделов проверены в настоящем production UI на desktop, 320 и 390px.
8 уровней предпосылок доступны; возврат восстанавливает параметры, фокус и scroll.
Изначальные расчёты, навигация и Rust не менялись. Новые зависимости не добавлены.
Пять Astra ultra участвовали в реализации/независимом review/проверке регрессий;
основной агент интегрировал общую математику и самостоятельно осмотрел интерфейс.
Новые главы и приёмка отправлены в `origin/master`:
`121cfa0c576c57c82c74d17d3894b8a792bba8c7`, remote SHA совпал с HEAD.
Контрольная версия до новых глав — `009a58bb525e437da7a1cd5f9dfd73b70fcffcb5`.
Дополнительная фиксация этого статуса меняет только документы/проекцию прогресса.
Перед отправкой повторно проверены 128 неизменённых baseline-файлов: SHA совпадают;
все исходники финальной сборки записаны в `advanced-validated-hashes.json`.
Обязательная работа завершена. Запуск из корня: `.\learn.cmd` (Node 24+, pnpm).
Будущее развитие выбирается отдельно; три темы next не выдаются за реализованные.

### Углубление учебника — проверено, 2026-10-11

Новый запрос: подробный Transformer и варианты, понятные объяснения, исследование UX,
связанные математические основы с возвратом к прежнему месту и состоянию эксперимента.
Три исполнителя Astra ultra подготовили математические основы, Transformer и навигацию;
четвёртый Astra ultra независимо проверил итоговый код. Основной агент объединил части,
повторил общие проверки и осмотрел реальный интерфейс. Rust-ядро не менялось.

| Этап расширения | Статус | Критерий |
|---|---|---|
| Исследование и карта курса | Готово | Первичные источники записаны в research; покрытие явно размечено |
| Математические основы | Готово | 30 понятий, 14 типов демонстраций; численные тесты и реальный UI проверены |
| Transformer подробно | Готово | 8 разделов; MHA/GQA/MQA, RoPE, нормы, cache и генерация проверены |
| Рекурсивная навигация и UX | Готово | Состояние, точная прокрутка, фокус, пауза обучения и mobile подтверждены |
| Независимая приёмка | Готово | 54 tests, typecheck/build, desktop/320/390; 48 защищённых файлов совпадают |

Исходный интерфейс снят в `learning-lab/evidence/expansion-before-overview.png`.
Рабочая среда и checkout те же, что при интеграции ниже; изменения незакоммичены.
В `learning-lab/` повторно прошли `pnpm test` (54/54), `pnpm build` (strict typecheck + Vite).
Отдельная загрузка Transformer убрала предупреждение о размере chunk без новых зависимостей.
Production-проверка выполнена на порту 5182; основной запуск по-прежнему `.\learn.cmd`, порт 5180.
Все 10 основных страниц и 8 разделов Transformer проверены на 320 px, Transformer также на 390 px;
горизонтального overflow страницы нет, console error/warn — 0. Сохранение настроек и возврат
проверены на desktop и mobile, в том числе через производную к пределу.
Отчёт, скриншоты, логи и SHA256: [learning-lab/evidence/EXPANSION.md](learning-lab/evidence/EXPANSION.md).

Границы остаются явными: состояние до перезагрузки вкладки; 8 уровней одного пути; обучается XOR,
остальные модели — небольшие численные демонстрации. Карта содержит 24 темы (13 интерактивных,
3 разбора, 8 направлений продолжения), а не все опубликованные архитектуры. VAE/GAN/diffusion/GNN/RL
пока ведут к первичным материалам, без локальных лабораторий. Следующий необязательный этап —
выбрать одно из этих направлений для полноценной главы; обязательных блокеров текущего расширения нет.

### Интеграция учебника — 2026-10-11

Пользователь разрешил перенос `learning-lab/` из worktree в основной checkout и удобный запуск.
Исходная точка: 51 файл основного checkout сохранён в SHA256-снимке сессии; прежние Rust-исправления
остаются незакоммиченными. Перенесены 42 файла учебника, без dependency/build caches.
После переноса хеши 48 прежних файлов совпали; изменены только корневые README/PROGRESS и CI.
Rust-исходники, Cargo manifests/lockfile, прежние тесты и настройки сохранены побайтно.

| Этап интеграции | Статус | Критерий |
|---|---|---|
| Сохранность Rust и перенос | Готово | Хеши 48 файлов совпадают; 12 файлов src/tests/lock учебника совпадают с источником |
| Удобный запуск и документация | Готово | learn.cmd, Node 24+, pnpm 11.25.0, отдельная JS-проверка CI |
| Проверки Rust и учебника | Готово | Rust 52+5 debug/release, fmt/Clippy/rustdoc; web 22 tests + typecheck/build |
| Проверка браузера и итог | Готово | Main preview 5180, XOR 4/4, causal mask, 320 px, console без ошибок |

Запуск из корня: `.\learn.cmd`. Он устанавливает зависимости по lockfile, запускает loopback-сервер
и открывает браузер; другой порт — `.\learn.cmd --port 5181`. Скрипт проверен из каталога вне repository.
Занятый порт завершает запуск с code 1 и не трогает работающий сервер. Текущий сервер основного
checkout: `http://127.0.0.1:5180/`, owned exec session 57009. Исходный worktree сохранён.

Проверки интеграции выполнены 2026-10-11 в основном checkout (master поверх 9e6606a, изменения
незакоммичены): команды Rust из таблицы ниже повторены для debug/release, fmt, strict Clippy и rustdoc.
В `learning-lab/` выполнены `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build` (включает typecheck).
Node 24.19.0 / pnpm 11.25.0; lockfile не изменился. Browser-проверки: XOR после 3000 шагов, seed42,
Adam eta=.03 дал BCE 1.02e-4 и 4/4; causal Q1=[1;0;0]; при viewport320 clientWidth=scrollWidth=305.
Скриншоты и подробности — [learning-lab/evidence/INTEGRATION.md](learning-lab/evidence/INTEGRATION.md).
Новый CI job настроен для web tests/build, GitHub запуск пока не выполнялся.

При локальной установке sandbox не смог обратиться к npm registry; установка прошла с разрешённым
сетевым доступом. Запуск esbuild из sandbox завершался Access denied для родительского каталога;
тот же launcher с разрешённым запуском вне sandbox работает. Глобальные настройки не менялись.
В проверочных командах использовался bundled Node/pnpm через временный PATH; обычному пользователю
достаточно Node 24+ и pnpm 11.25.0 в PATH. Установленные caches игнорируются вложенным .gitignore.

Результаты предыдущих этапов ниже сохраняются как проверенная история до интеграции.

Подтверждённые дефекты CPU-ядра исправлены, решения сверены с первичными источниками Rust/ML.
Пользователь явно разрешил реализацию исправлений. Новые NN/GPU-возможности Rust-библиотеки
не входили в исправление; первая версия интерактивного учебника создана отдельным чатом,
затем по запросу пользователя перенесена в основной проект с сохранением исправлений ядра.

| Этап | Статус | Проверенный результат |
|---|---|---|
| Исследование практик | Готово | Первичные источники и границы рекомендаций записаны в PLAN.md |
| Tensor/core | Готово | Broadcasting, формы, checked integer arithmetic, устройства и регрессии |
| Autograd | Готово | Однократный обход DAG, безопасные изменения, gradient checks f64 |
| Настройки и документация | Готово | Facade, конфигурация CI, закреплённый toolchain, lockfile, достоверные примеры |
| Общая локальная проверка | Готово | Debug/release, doctests, examples, fmt, strict Clippy, rustdoc |

## Checkout и окружение

- Каталог: `C:/Users/lomaster/Desktop/dev/rust_ml`.
- Ветка: `master`; исходный commit: `9e6606aceacd9cf684996073499141b0fcd32028`.
- Перед исправлениями рабочее дерево было чистым; результат находится в незакоммиченных изменениях поверх этого commit.
- Проверено 2026-10-11 на Windows x86_64 MSVC, rustc/cargo 1.87.0.
- Toolchain разработки: 1.87.0; это проверенный минимум проекта, не самая новая stable.
- Cargo-зависимости для итоговых проверок взяты из локального cache с `--locked --offline`.
- Локальные результаты не доказывают выполнение GitHub CI, Linux или самой новой stable: эти jobs только настроены.

## Что исправлено

- Формы выравниваются справа без вычитания `usize` с underflow; broadcasting учитывает нулевые оси.
- Все четыре поэлементных оператора действительно расширяют совместимые формы через ndarray.
- Размеры формы, ограничения layout/bytes, integer arithmetic и integer matmul проверяются до небезопасного результата.
  Добавлены `try_zeros`/`try_ones`; удобные constructors имеют документированный panic-контракт.
- Операции сохраняют device metadata и отклоняют недоступные/неподдерживаемые вычислители.
- Variable clone разделяет одно значение и градиент; отслеживание находится только в Variable с floating dtype.
- Backward обходит уникальные узлы DAG, складывает новые вклады, сокращает broadcast-градиент до исходной формы.
  Повторный backward не распространяет заново ранее накопленные градиенты.
- Мутация данных и tracking доступна только уникальному листу; захваченные графом значения защищены.
  `detach()` создаёт независимую переменную.
- Независимое ревью нашло дополнительный случай unavailable seed/leaf: теперь оба устройства проверяются
  до записи градиента. Регрессии проверяют сохранение как пустого, так и уже накопленного градиента.
- Facade реэкспортирует рабочий API; шаблонные NN-функции и публичный неработающий graph scaffolding удалены.
- Добавлены лицензии, CI, lockfile и фиксированный toolchain; убраны неиспользуемые зависимости.
- README, план, учебное руководство и правила проекта приведены к реальным возможностям.

Изменения API: Tensor больше не содержит requires_grad; Variable требует FloatDType;
`data_mut` и `set_requires_grad` возвращают Result и требуют уникального leaf.
Пользовательские реализации DType должны предоставить checked arithmetic.

## Итоговые проверки

Все команды ниже завершились с exit code 0 на указанном выше checkout после исправления устройств.

| Команда | Результат |
|---|---|
| `cargo fmt --all -- --check` | Прошла |
| `cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings` | Без предупреждений |
| `cargo test --workspace --all-features --locked --offline` | 52 unit/integration tests и 5 doctests; 0 ignored |
| `cargo test --workspace --all-features --release --locked --offline` | Те же 52 tests и 5 doctests прошли |
| `RUSTDOCFLAGS="-D warnings" cargo doc --workspace --all-features --no-deps --locked --offline` | Все пять crates; без предупреждений |
| `cargo run -p rustml-tensor --example basic_tensor_ops --locked --offline` | Main выполнен, assertions прошли |
| `cargo run -p rustml-autograd --example autograd_test --locked --offline` | Main выполнен, assertions прошли |
| `cargo run -p rustml-autograd --example milestone_check --locked --offline` | Main выполнен, assertions прошли |
| `cargo run -p rustml-autograd --example scalar_demo --locked --offline` | Main выполнен, assertions прошли |
| `git diff --check` | Нет whitespace errors; Git сообщает только настройку будущего LF→CRLF |

Значимые регрессии: конечные разности f64 для общего broadcast-графа; повторный backward;
цепь из 30 удвоений с 31 уникальным узлом; пустые оси и scalar shapes; переполнения всех
поддерживаемых integer widths; неверный seed; alias/mutation/detach; недоступные устройства.
Это не измерение покрытия и не доказательство отсутствия всех ошибок.

Локальные журналы этой сессии: каталог
`C:/Users/lomaster/.codex/visualizations/2026/10/11/01a128c0-1c6b-71f1-a9b2-e8bdef9e4f32/work/`,
файлы `final-debug.log`, `final-release.log`, `final-clippy.log`, `final-rustdoc.log`, `final-examples.log`.
Они не часть переносимого repository; команды выше позволяют воспроизвести проверку.

## Ограничения и следующий шаг

1. Следующая реализация: autograd matmul → MSE → Linear → SGD → обучение `y = 2x + 1`.
2. GPU, NN-слои, higher-order derivatives, model serialization и performance claims не заявлены.
3. Перед публикацией crates сделать README/examples локальными для каждого пакета и проверить архивы:
   facade сейчас включает `../../README.md`, а examples tensor/autograd лежат в общем каталоге.
   `cargo package/publish` и docs.rs build не выполнялись; workspace не равен готовому пакету.
4. Обход backward итеративный, но разрушение исключительно глубокой цепи Arc не заявлено stack-safe.
   Конкурентный backward вместе с zero_grad/мутацией не является поддержанным учебным сценарием.

## Интерактивный учебник: происхождение и текущий запуск

- Чат: «Интерактивный учебник RustML», id `01a128d7-dd64-7982-8d30-febcf5522fcb` (host local).
- Исходный worktree: `C:/Users/lomaster/.codex/worktrees/3061/rust_ml`.
- При создании исполнитель работал только в `learning-lab/`. Последующий перенос в основной checkout
  явно разрешён пользователем; текущий каталог — `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`.
- Требования: русский React/TypeScript учебник, реальные браузерные вычисления, визуальные объяснения
  оптимизаторов/loss/backprop/training и Dense/CNN/RNN/LSTM/GRU/Transformer.
- Поддерживаемые варианты должны быть перечислены; расширение через простой registry и параметры.
  Нельзя обещать все существующие архитектуры как уже готовые или выдавать схему за расчёт.
- Критерии: numerical tests, build/typecheck, реальные desktop/mobile browser проверки и README запуска.
- Первая версия завершена и принята 2026-10-11 06:19 Europe/Moscow. Checkout по-прежнему detached
  на `9e6606aceacd9cf684996073499141b0fcd32028`; `git status --short` показывает только `?? learning-lab/`.
  Tracked Rust и корневые документы исходного worktree не изменены. Проверки переноса приведены выше.
- Исполнитель выполнил `pnpm typecheck`, `pnpm test`, `pnpm build`: 22 теста прошли, production bundle создан.
  Среда: Windows, Node 24.19.0, pnpm 11.25.0. Итоговые журналы — `learning-lab/evidence/VALIDATION.md`,
  `tests.log`, `build.log`; координатор прочитал их и подтвердил совпадение SHA256 всех 11 файлов
  исходников/тестов с `source-hashes.json`. Повторные сборки координатор не запускал.
- Проверены математические примеры и градиенты всех 17 параметров XOR конечными разностями.
  При seed 42, Adam eta=0.03 и 3000 шагах production-пример дал 4/4 и BCE 0.0001015905.
  Исполнитель проверил desktop/390/320 px и отсутствие console error/warn;
  координатор дополнительно открыл текущую страницу и осмотрел desktop и сохранённый mobile attention screenshot.
- Независимая read-only проверка кода Dense/CNN/RNN/LSTM/GRU/Transformer существенных ошибок не нашла.
  Работают малые forward-демонстрации и перечисленные варианты; Conv1D/3D, некоторые другие варианты
  и обучение больших моделей не реализованы. Точные границы — `learning-lab/docs/architectures.md`.
- Текущий preview основного проекта: `http://127.0.0.1:5180/`. Повторный запуск из корня:
  `.\learn.cmd` (Node 24+, pnpm 11.25.0); исходный порт5177 относится к прежнему worktree.
  Все инструкции и дальнейшее развитие — в README/PROGRESS самого учебника.
- Пользователь разрешил исходному чату отвечать на необходимые вопросы исполнителя по лучшим практикам.
- Heartbeat «Сопровождение учебника RustML», automation id `rustml`, остановлен после приёмки:
  tool подтвердил `PAUSED` 2026-10-11 06:19 Europe/Moscow. Обязательных незавершённых этапов нет.

## Условные особенности среды

В sandbox rustup proxy завершался ошибкой удаления `rustup-init.exe`. Для проверок использовался
установленный toolchain напрямую, без изменения глобальной установки:

```powershell
$toolchain = 'C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin'
$env:PATH = "$toolchain;$env:PATH"
$env:RUSTC = "$toolchain/rustc.exe"
$env:RUSTDOC = "$toolchain/rustdoc.exe"
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-msvc'
& "$toolchain/cargo.exe" test --workspace --all-features --locked --offline
```

Это обход ограничения среды, не требование проекта. Он перестаёт быть нужен, когда обычный
`cargo -V` работает в этом окружении. Не меняйте глобальные Git-настройки ради sandbox:
для чтения этого checkout достаточно `git -c safe.directory=C:/Users/lomaster/Desktop/dev/rust_ml ...`.

## История

- 2025-10: созданы tensor и первые операции autograd.
- 2026-01-08: добавлены CPU matmul и transpose.
- 2026-10-11: выполнены ревью, исправления ядра и настройки, исследование практик и локальная проверка;
  отдельно запущена разработка интерактивного учебника.
