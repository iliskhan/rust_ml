# Анимации учебника

Текущий режим — **71 немая визуализация** (63 новые и 8 прежних), без озвучки. Карта реальных подключений scene → маршрут → лаборатория и ограничения покрытия: [COVERAGE.md](../evidence/all-topic-animations-2026-10-16/COVERAGE.md).

Числа экспортируются из действующей TypeScript-математики в `*/fixture.json`; Python отвечает за представление. Переделка использует постоянную геометрию и причинное движение: перемещение векторов, изменение масс/весов, прохождение сигнала и численно заданные траектории. Короткие подписи величин и одна формула заменяют большие текстовые карточки. Общие helpers `topic_scene.py` задают Georgia для текста, MathTex для формул, почти чёрный фон и мягкие цвета. Наличие исходника не подтверждает качество изображения: обязательны реальные кадры.

## Silent native workflow

Команды из корня репозитория, в существующем окружении ManimGX 0.1.1 / Python 3.13.2. Node 24 нужен для TypeScript-экспортов. Пример одной новой сцены:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' learning-lab/animations/dense/export-fixture.ts
& work/backprop-pilot/venv/Scripts/python.exe -m py_compile learning-lab/animations/dense/dense.py
& work/backprop-pilot/venv/Scripts/manimgx.exe inspect learning-lab/animations/dense/dense.py TopicScene -t 4,9,12,22,30,37,end -o work/backprop-pilot/dense-inspect.png
& work/backprop-pilot/venv/Scripts/python.exe learning-lab/animations/dense/render-assets.py
& work/backprop-pilot/venv/Scripts/python.exe learning-lab/animations/verify-media.py dense --output work/backprop-pilot/dense-media-verification.json
```

После `inspect` просмотреть actual PNG и последующие листы (`-2.png`), сопоставить подписи, оси и состояния с fixture. Прохождение layout-проверки само по себе не подтверждает численную или педагогическую корректность. После изменения Python повторить затронутый inspect/render; старые кадры не доказывают новую версию. GPU inspect/render запускать последовательно при совместной работе.

`render-assets.py` вызывает текущий `render_support.render_scene`: native render 1280×720, 30fps; matching `poster.png` берётся из того же потока кадров, MP4 сохраняется в `public/animations/<slug>/<slug>.mp4`. Render проверяет отсутствие soundtrack. `verify-media.py` проверяет видеотрек, отсутствие `soun`, разрешение, длительность и сохраняет SHA256/окружение/ревизию. Названия классов прежних восьми отличаются от `TopicScene` — использовать класс из COVERAGE. Длительности старых сцен также отличаются от40s; проверяющий скрипт читает duration из существующего `narration.ru.json` как метаданные.

Проверка уже отрендеренных71 файлов одним запуском (без нового рендера):

```powershell
$sceneNames = Get-ChildItem learning-lab/animations -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'fixture.json') } | Select-Object -ExpandProperty Name
& work/backprop-pilot/venv/Scripts/python.exe learning-lab/animations/verify-media.py @sceneNames --output learning-lab/evidence/all-topic-animations-2026-10-16/media-verification.json
```

Без аргументов `verify-media.py` проверяет только прежние8 сцен; для всей карты передавать71 slug явно, как выше. Не считать эту команду уже выполненной по наличию документации.

## Озвучка и субтитры

SAPI, WAV, `synthesize-narration.ps1` и `assemble-narration.py` **не нужны** для текущего выпуска. Исторические narration-файлы и старые отчёты сохраняются как артефакты предыдущего режима; они не означают наличие аудио в новом MP4. Некоторые старые README пакетов ещё описывают прежний процесс — актуальный общий workflow находится здесь.

VTT остаётся доступным по выбору. В `LessonAnimation.tsx` track не имеет атрибута `default`: приложение не включает субтитры по умолчанию, браузер может учитывать собственные пользовательские настройки. Субтитры восьми прежних сцен (backprop, neuron, attention, descent, xor, rope, heads, generation) сверены 2026-10-16 с текущими Python-таймлайнами и fixtures: сохранены длительности и паузы для прогноза, убраны утверждения об отсутствующих состояниях. Это проверка согласованности текста с источником; наличие субтитров не означает озвучку. Наличие VTT не заменяет постоянные подписи величин в кадре.

## Учебные действия и границы

Плеер запускается вручную, поддерживает главы, перемотку, паузу для прогноза и явное продолжение. Новый локальный случай отличается от разобранного и не выдаёт зачёт. Текст и численные таблицы доступны независимо от видео.

«Применить числа ролика» сохраняет текущие настройки лаборатории; повторное применение не затирает сохранённое состояние. «Вернуть мои настройки» восстанавливает числа/историю и оставляет автоматическое обучение на паузе. Это контракт интерфейса, требующий браузерной проверки соответствующего mount; перечень71 сцен не является доказательством проверки всех контролов. Видео показывает фиксированный пример, а текущий эксперимент рассчитывается в лаборатории.

Данная документация описывает реализацию и проверяемый процесс. Исследование с учениками и доказанная образовательная эффективность здесь не заявляются.
