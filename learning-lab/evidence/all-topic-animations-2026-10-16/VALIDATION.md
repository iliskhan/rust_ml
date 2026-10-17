# Проверка замороженного набора анимаций — 16–17 октября 2026

Первичная сверка: 16 октября, 23:36 MSK; дополнено после публикации 23:44 MSK. Chrome-приёмка: 17 октября, 14:10–14:31 MSK (11:10–11:31 UTC), включая финальные mobile/keyboard/question наблюдения.

Подтверждены исходники сцен, native render, численные тесты, production-сборка и публикация; 17 октября Chrome проверил фиксированный сценарий управления всеми 71 роликом публичного релиза `23e0c2f`. Границы браузерной приёмки приведены ниже. Область работ: B12 с применимыми R01/R02/R04/R06 и U02/U04/U05/U07/U08; этот документ не закрывает исследования с учениками или весь UI/UX backlog.

## Срез и воспроизводимость

- Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, ветка `master`, baseline/HEAD на момент native-проверки `4065f9f565e45c5320a068a3619f25ab0f1356ba`. Тогда проверялось грязное рабочее дерево с изменениями задачи, а не содержимое одного baseline commit. Новый Chrome-прогон относится к опубликованному `23e0c2f91a9ee1e477f45b65fd2c0bed17a96a0b`.
- Набор: 71 сцена — 63 новые и 8 прежних. [COVERAGE.md](COVERAGE.md) сопоставляет сцены с маршрутами, лабораториями и DOM-якорями; реестр подключения сам по себе не доказывает работоспособность UI.
- Native environment: Python 3.13.2, ManimGX 0.1.1, Windows; команды запускаются из корня checkout, `PYTHONUTF8=1`. GPU-проход выполнялся последовательно.
- SHA-256 дерева исходников: `58bf33ea1abcedbc04cfa8a513f8278f0f0ed8481fa8c2603cc49233714d30a4`. При составлении документа хеш заново совпал с отчётом для 292 файлов. Алгоритм: сортировка путей в `learning-lab/animations`, выбор всех `.py`, `fixture.json`, `narration.ru.json`; последовательное хеширование относительного POSIX-пути UTF-8 и байтов файла без разделителя. TSX, VTT и медиа в этот хеш не входят. Алгоритм и per-scene SHA сохранены в [native-batch-script.txt](native-batch-script.txt) и [native-verification.json](native-verification.json).

## Подтверждённые результаты

| Проверка | Наблюдаемое свидетельство |
|---|---|
| Native construct / layout / render | 71/71 `inspect.exit=0`, `render.exit=0`; 71 inspect-log, всего 497 выборочных кадров без обнаруженных layout-проблем. [Отчёт](native-verification.json), [логи и PNG](native/). Проверка выборочная, она не доказывает отсутствие дефектов на каждом кадре. |
| Медиа | 71 MP4: 1280×720, положительное число encoded samples, длительность в пределах допуска `2/30 + 1e-6` с относительно manifest, `audio_track=null`. Озвучки в файлах нет. [media-verification.json](media-verification.json) содержит команду, SHA-256 каждого MP4 и фактическую длительность. |
| Копирование в production | После финальной правки восьми VTT заново сравнены 213 пар `public/animations` ↔ `dist/animations`: все SHA-256 совпали. [Отчёт](build-media-copy.json). Это локальная копия сборки, не проверка опубликованного сайта. |
| Полный набор тестов | [full-tests.log](full-tests.log): 640 тестов, 635 pass, 0 fail, 5 skip. Пропущены opt-in проверки с внешними Python/Rust toolchain; их нельзя считать выполненными. |
| Целевые проверки анимаций | [targeted-tests.log](targeted-tests.log): 78 pass, 0 fail, 0 skip. Покрывают fixtures/численную математику и контракты взаимодействия; не заменяют браузерную приёмку. |
| TypeScript и production build | Финальный `tsc --noEmit` exit0. [build.log](build.log): Vite 7.3.7, 261 модуль, `built in 3.03s`, exit0 после финальных VTT. |
| Визуальный review | Сохранены [core](core-visual-review.md) и [frontier](frontier-visual-review.md) наблюдения по actual PNG. По повторному review root шесть семантических Core P2 исправлены; native-проход относится к итоговому хешу выше. |
| Финальные субтитры | Восемь прежних VTT сверены с новой геометрией: исправлены смены состояний neuron, проценты attention, обе плоскости RoPE, подписи generation и мысленный случай XOR. После правки `node --test tests/lesson-animations.test.ts tests/extended-animations.test.ts`:11/11PASS. [Лог](captions-regression-tests.log). Видео и frozen sourcehash не менялись. |
| Независимый code review | Проверены targets всех63новых mount, сохранение/повторное применение/возврат параметров и training history, остановка async обучения, пауза player, локальные вопросы без зачёта. Подтверждённых P1/P2 не найдено; это чтение кода, а не браузерный тест. |

Команды численных и сборочных проверок: cwd `learning-lab`, Node 24 по пути `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` (ниже — `$node`). Результаты выше взяты из сохранённых запусков; при написании документа тесты и рендеры заново не запускались.

```powershell
$node='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
& $node --test tests/*.test.ts
& $node --test tests/foundations-topic-films.test.ts tests/core-topic-films.test.ts tests/frontier-topic-films.test.ts tests/generative-topic-films.test.ts tests/backprop-animation.test.ts tests/lesson-animations.test.ts tests/extended-animations.test.ts tests/animationInteraction.test.ts
& $node node_modules/typescript/bin/tsc --noEmit
$env:VITE_BASE_PATH='/rust_ml/'
& $node node_modules/vite/bin/vite.js build
```

Native inspect для новой сцены: `work/backprop-pilot/venv/Scripts/manimgx.exe inspect learning-lab/animations/<slug>/<slug>.py TopicScene -t 4,9,15,22,30,37,end -o <output.png>`. Для прежних восьми классы и времена иные: точная карта в `native-batch-script.txt`. Render: `work/backprop-pilot/venv/Scripts/python.exe learning-lab/animations/<slug>/render-assets.py`. Полная команда `verify-media.py` со всеми 71 именами находится в поле `command` медиаотчёта. Существующий narration manifest используется для длительности; это не свидетельство наличия звуковой дорожки.

## Chrome: фиксированный сценарий для всех 71 ролика

[chrome-controls-2026-10-17.json](chrome-controls-2026-10-17.json) относится к публичному релизу `23e0c2f91a9ee1e477f45b65fd2c0bed17a96a0b`. Содержит 74 наблюдения для 71 уникального slug: дополнительный Dense с x₁ = 1.3 и recurrent в вариантах LSTM/GRU. Список slug независимо сопоставлен с 71 ожидаемым UI-примером.

Во всех 74 наблюдениях:

- после Apply кнопка Restore включилась; после повторного Apply и Restore контролы точно совпали с исходным снимком, а Restore снова выключилась;
- четвёртая кнопка главы (`nth(3)`, нулевой индекс) установила фактический `currentTime`, равный ожидаемому frame из fixture/TSX; видео осталось на паузе;
- metadata: 1280×720; captions: `disabled`.

При сверке JSON подтверждено `before == restored` в 74/74 случаях. В 10/74 `applied` отличается от `before`; в остальных 64 исходные числа уже совпадали с примером. Отдельный Dense подтверждает диапазонный и числовой контролы 1.3 → 0.7 → 1.3. Поэтому отчёт подтверждает этот фиксированный сценарий и переходы состояний кнопок для всего набора, но не изменение каждого параметра каждой лаборатории. JSON содержит снимки before/applied/restored; повторный Apply входит в описанную root последовательность helper, отдельный снимок после него не сохранялся.

Helper ожидает DOM commit и фактические состояния disabled/enabled и `aria-current`, а не читает их немедленно после dispatch. У XOR ранняя проверка `isEnabled` сначала дала false, после commit — true; итоговая запись в отчёте успешна. Проверка выполнена в Chrome, не на физических мобильных устройствах.

## Исторические наблюдения 16 октября

[browser-checks.json](browser-checks.json) фиксировал 71 mount и metadata. Его `restored: true` само по себе не доказывало применение и возврат: часть проверок сравнивала равенство до/после без подтверждённого промежуточного действия. Для сценария выше этот слабый отчёт заменён новой Chrome-приёмкой с состояниями кнопок и глав.

[mobile-checks.json](mobile-checks.json): production `/rust_ml/`, viewport 390×844, 66 уникальных видимых медиаблоков; у проверенных маршрутов нет горизонтального page overflow, плееры внутри viewport, chapter buttons не ниже 44 px, captions `disabled`. Пять семейных медиаблоков тогда не переключены из-за ограничения click-ввода. Дополнительно root проверил attention на 320×760: metadata 1280×720, горизонтального overflow нет. Снимки: [390 px](attention-mobile-390.jpg), [320 px](attention-mobile-320.jpg). Эти исторические результаты подтверждают геометрию и медиа в указанном объёме.

16 октября на dev tab 7, production tab 8 и свежем production tab 9, при ширинах 390 и 1280, root наблюдал отсутствие реакции на click, Enter/Space/Return и координатный клик: глава оставалась 0, Restore — disabled; даже native `details/summary` не открывался. При этом `selectOption` доставлялся и React-маршруты менялись. У Dense поле показывало 1.3 при ползунке 0.7. Read-only аудит не доказал сброс hook или цикл ResizeObserver. Прежний блокер кликов снят успешным Chrome-прогоном 17 октября; причина прежнего наблюдения и его принадлежность приложению не установлены.

## Mobile, keyboard и вопрос перед объяснением

[chrome-mobile-2026-10-17.json](chrome-mobile-2026-10-17.json), публичный `23e0c2f`: семь записей дополняют mobile-срез 16 октября. На 390×844 проверены ранее отсутствовавшие `transformerforward`, `cnnforward`, `cnntraining`, `recurrent`, `bptt`; выбор CNN/RNN выполнен через Enter. Дополнительно `neuron` и `activations` проверены на 390×844 и 320×760. Во всех новых записях нет page overflow и выхода плеера за viewport; metadata 1280×720, chapter buttons ≥44 px, captions `disabled`. Независимо сверенное объединение старого среза 66 и нового содержит все 71 уникальный slug. Это покрытие геометрии объединяет наблюдения двух браузеров и двух дат.

[chrome-keyboard-question-2026-10-17.json](chrome-keyboard-question-2026-10-17.json), viewport 390×844:

- На `neuron` клавиатурный сценарий Apply/Restore воспроизвёл 1.5 → 1 → 1.5; клавиатурный переход главы остановил видео на 34 с.
- На `activations` root запустил естественное воспроизведение с 4 с: видео автоматически остановилось перед объяснением на 9.032651 с при questionTime=9. Правильный ответ подтверждён через Enter и дал feedback «Верно». Переход к главе на 30 с оставил видео на паузе и закрыл вопрос.

Снимки actual Chrome: [нейрон 390 px](chrome-neuron-mobile-390.png), [вопрос 390 px](chrome-question-mobile-390.png), [активация 320 px](chrome-activation-mobile-320.png). В длинной исторической сессии встречались CDP timeouts; итоговый вопрос проверен в свежей вкладке Chrome. Это не доказывает дефект приложения или причину прежних сбоев ввода.

Границы итоговой UI-приёмки: desktop — фиксированный сценарий для 71 ролика, не каждый возможный контрол лаборатории; mobile — геометрия 71 ролика по двум срезам и интерактивные проверки выбранных представителей, не интерактивность всех 71 на mobile. Физические мобильные устройства и screen reader не проверялись. Учебная эффективность этими проверками не установлена.

## Подтверждённая публикация

16 октября релиз `63930f3bc890059e4afb96db145cc8cf395c9030` отправлен обычным push в `master`; непосредственно после того push локальный HEAD и origin/master совпали, дерево было чистым. [CI 38963965181](https://github.com/iliskhan/rust_ml/actions/runs/38963965181) и [Pages 38963965078](https://github.com/iliskhan/rust_ml/actions/runs/38963965078) завершились SUCCESS.

17 октября root проверил SUCCESS для публичного `23e0c2f91a9ee1e477f45b65fd2c0bed17a96a0b`: [CI 38964444506](https://github.com/iliskhan/rust_ml/actions/runs/38964444506), [Pages 38964444487](https://github.com/iliskhan/rust_ml/actions/runs/38964444487). Новый Chrome-отчёт выше проверяет этот релиз.

[public-media.json](public-media.json): 16 октября, 20:42:38 UTC, HTTP HEAD всех 71 MP4 дал 200, `video/mp4` и Content-Length, равный тогдашнему финальному локальному файлу. Тела удалённых видео не скачивались; это не удалённая проверка SHA-256 или треков и не новый HTTP HEAD-прогон релиза `23e0c2f`. Отсутствие аудио доказано локальным медиапарсером.

[public-browser.json](public-browser.json) и [экран нейрона](public-neuron-desktop.png) сохраняют историческую проверку metadata 1280×720/44.033333 с, paused=true, autoplay=false, captions=disabled, errors/warnings=0. Тогда глава не изменила time=0; это ограничение заменено успешной проверкой глав всех 71 ролика в Chrome 17 октября.
