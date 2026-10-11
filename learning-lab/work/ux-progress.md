# UX / recursive learning — рабочая запись

Root, 2026-10-11 07:18 MSK: интеграция и приёмка завершены. Параметры, точное восстановление
прокрутки/фокуса, Escape, приостановка XOR и desktop/mobile подтверждены в готовой сборке.
Общие 54 tests и build прошли. Текущий итог — `../evidence/EXPANSION.md`; запись ниже историческая.

2026-10-11 06:51 MSK (UTC+03:00). Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, base HEAD `9e6606aceacd9cf684996073499141b0fcd32028`; изменения текущего рабочего дерева.

Сделано: исследованы первичные W3C/WAI источники и Freeman 2014, сохранены ссылки/границы вывода в `research/ux.md`. Реализованы `learning-navigation.ts`, `learning-context.tsx`, `KnowledgeExplorer.tsx`: нативное модальное окно, path+visited, сохранение mounted состояния каждого понятия, scroll/focus, cycles, depth=8. App сохраняет посещённые уроки и прокрутку, добавляет curriculum/transformer, группирует desktop nav и использует mobile select. Зелёно-кремовый стиль сохранён; текст/контролы/таблицы укрупнены. Дублирующая панель предпосылок удалена: основной агент добавляет contextual ConceptLinks непосредственно в старые уроки.

Проверено: Node 24.19, команда `& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/learning-navigation.test.ts` из `learning-lab` — 4/4 pass (06:45 MSK). Общий build не запускался: соседние агенты ещё пишут ConceptLesson/CurriculumView/TransformerCourse.

Контракт: `ConceptLink({concept,children?})`, `LearningProvider`, `LearningActivity({active,children})`, `useLearningActive()`. ConceptLesson импортируется как `{ ConceptLesson }`, принимает `{id}`; его заголовок выводит Explorer. В диалоге Esc закрывает весь разбор; back — один уровень. Один кэш состояния на concept id за вкладку, reload сбрасывает. Нативный dialog управляет инертностью фона. Таймеры Optimizer и XOR адаптирует основной агент.

Дополнено после code review: закрытие при внешнем hashchange не восстанавливает focus/scroll прежнего урока, если origin уже другой; позицию нового раздела восстанавливает App. Breadcrumbs используют короткие названия до двоеточия и одну горизонтально прокручиваемую строку, чтобы глубокий путь не вытеснял содержимое на mobile. В низком viewport header ужимается. Sources содержит новую навигацию, границы временного сохранения и первичные ссылки; footer явно говорит «до перезагрузки страницы».

Следующий шаг: дождаться соседних файлов, typecheck у root, визуальная и клавиатурная проверка desktop/mobile у root; исправить подтверждённые integration/UX проблемы. Особо проверить возврат scroll после ResizeObserver скрытого графика. Мои файлы: App.tsx, styles.css, learning-context.tsx, KnowledgeExplorer.tsx, learning-navigation.ts, tests/learning-navigation.test.ts, research/ux.md, work/ux-progress.md.
