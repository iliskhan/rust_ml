# Проверка замороженного набора анимаций — 16 октября 2026

Первичная сверка:23:36MSK; дополнено после публикации23:44MSK (20:44UTC).

Подтверждены исходники сцен, native render, численные тесты, production-сборка и публикация релиза63930f3. Полная интерактивная UI-приёмка остаётся открытой в описанном ниже объёме. Область работ: B12 с применимыми R01/R02/R04/R06 и U02/U04/U05/U07/U08; этот документ не закрывает исследования с учениками или весь UI/UX backlog.

## Срез и воспроизводимость

- Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`, ветка `master`, baseline/HEAD `4065f9f565e45c5320a068a3619f25ab0f1356ba`. Проверялось грязное рабочее дерево с изменениями задачи, а не содержимое одного baseline commit.
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

## Браузер: подтверждённая часть и ограничение

[browser-checks.json](browser-checks.json) фиксирует 71 mount и загрузку metadata. Поля `restored: true` нельзя читать как успешную полную apply/restore-приёмку: часть проверок сравнивала равенство до/после без подтверждённого промежуточного изменения. Такое равенство совместимо с тем, что ни одно действие не сработало.

[mobile-checks.json](mobile-checks.json): production `/rust_ml/`, viewport 390×844, 66 уникальных видимых медиаблоков; у проверенных маршрутов нет горизонтального page overflow, плееры внутри viewport, chapter buttons не ниже 44 px, captions в состоянии `disabled`. Пять семейных медиаблоков на mobile не переключены из-за ограничения click-ввода. Дополнительно root проверил attention на 320×760: metadata 1280×720, горизонтального overflow нет. Снимки: [390 px](attention-mobile-390.jpg), [320 px](attention-mobile-320.jpg). Эти результаты относятся к геометрии и медиа.

Открытое наблюдение: root на dev tab 7, production tab 8 и свежем production tab 9, при ширинах 390 и 1280, проверял click, Enter/Space/Return, координатный клик и явную левую кнопку. В затронутых проверках глава оставалась 0, возврат — disabled; даже native `details/summary` не открывался. При этом `selectOption` доставлялся и React-маршруты менялись. У Dense также наблюдалось числовое поле 1.3 при ползунке 0.7. Read-only аудит Dense/CoreTopicFilm/useDiagramWidth не доказал сброс hook или цикл ResizeObserver. Причина и принадлежность дефекта приложению не установлены; доказанной appbug этот документ не заявляет.

## Ожидает: полная UI-приёмка

Нужна надёжная доставка ввода и проверка явного изменения чисел, повторного Apply с сохранением первой копии, Restore, глав, переключения семейств и клавиатуры на desktop/mobile. Наблюдение выше остаётся открытым; full click/preset/restore acceptance не завершена. Итог и новые доказательства добавляет root.

## Подтверждённая публикация

Релиз `63930f3bc890059e4afb96db145cc8cf395c9030` отправлен обычным push в `master`; непосредственно после push локальный HEAD и origin/master совпали, дерево было чистым. [CI38963965181](https://github.com/iliskhan/rust_ml/actions/runs/38963965181) и [Pages38963965078](https://github.com/iliskhan/rust_ml/actions/runs/38963965078) завершились SUCCESS.

[public-media.json](public-media.json):16октября20:42:38UTC, HTTP HEAD всех71MP4 дал200, `video/mp4` и Content-Length, равный финальному локальному файлу. Тела удалённых видео не скачивались, поэтому это не удалённая проверка SHA256 или треков. Отсутствие аудио доказано локальным медиапарсером; публичная доставка проверена отдельно.

Свежая публичная вкладка загрузила нейрон1280×720/44.033333s, paused=true, autoplay=false, captions=disabled; errors/warnings0. [Наблюдение](public-browser.json), [реальный экран](public-neuron-desktop.png). Нажатие главы снова не изменилоtime0; полная интерактивная проверка выше остаётся открытой. Следующий actionable шаг — проверить явное применение/повторное применение/возврат, главы и переключение семейства на desktop/mobile при надёжном browserinput. Закрывающий checkpoint меняет только этот журнал и доказательства; его точный SHA/local=remote сообщаются после push.
