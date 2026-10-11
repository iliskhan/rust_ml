# Независимое ревью поиска и практики

2026-10-11. Read-only ревью в `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, ветка `codex/ui-ux-learning-lab`, текущие незакоммиченные изменения. Проверены `ConceptSearch.tsx`, `searchConcepts.ts`, `concept-search.css`, `App.tsx`, `ActionExercise.tsx`, `actionExerciseMath.ts`, интеграция в `Foundations.tsx`; для механизма прочитаны `KnowledgeExplorer.tsx`, `learning-context.tsx`, `main.tsx`, соответствующие существующие тесты и таймеры `Experiments.tsx`.

## Результат

Подтверждённых actionable defects в проверенной области не найдено. Исходники не изменены. Тесты/build/browser повторно не запускались по заданию; это проверка механизма, а не доказательство визуального поведения.

## Проверенные механизмы

- Поиск (`ConceptSearch.tsx:40–68`) запоминает origin/scroll/overflow, открывает native modal, фокусирует input; отмена и выбор результата закрывают его через состояние. При выборе в той же React-итерации Search в header закрывается до расположенного после main KnowledgeExplorer (`App.tsx:85,93`); восстановленный scroll/overflow становится начальной точкой Explorer. Его закрытие возвращает lesson focus через переданный оригинальный trigger. `fromLesson` предохраняет от восстановления позиции предыдущего урока при смене hash.
- Search→concept не включает обучение на промежуточном кадре: `LearningActivity` требует одновременно `!searchOpen` и пустой `navigation.path` (`App.tsx:89`). Таймеры обучающих уроков зависят от active, очищаются и снимают running (`Experiments.tsx:118–122`).
- Текущее приложение монтирует Search постоянно с `searchOpen=false` (`App.tsx:44,85`), Explorer — с пустым navigation.path. Поэтому StrictMode replay начальных layout effects не воспроизводит случай «initially-open dialog без повторного захвата overflow»; handlers Start/check не являются effects и не дублируют изменение настроек.
- Native dialog обеспечивает modal focus scope; у поиска доступны название, label, role=status, кнопка закрытия и Esc. Результаты — обычные native buttons, так что их модель клавиатурного управления не требует combobox/active-descendant.
- Все три Start сбрасывают только явно перечисленные параметры к состоянию, не удовлетворяющему цели. `ActionExercise.tsx:13,20–26` не показывает старый результат для изменённого stateKey и не предоставляет Check до Start. Завершение практики не меняет числа и возвращает фокус на сохраняющуюся кнопку Start.
- Проверки берут актуальные параметры и реальные вычисления: ReLU строго требует a>0 с фиксированными входами/весами/активацией, MSE — loss<0.2 с фиксированными первыми двумя предсказаниями, backprop — loss<0.05, неизменные x/y и финальный step=3. Backprop resetOnChange сбрасывает step при изменении x/w/y. stateKey покрывает все параметры каждой проверки; epsilon исключён обоснованно, он не участвует в цели.

## Осталось подтвердить браузером у root

1. Из прокрученного урока и сфокусированного точного input: Ctrl+K → результат поиска → вложенное понятие → Esc; проверить исходные input, scrollY, отсутствие оставшегося body overflow lock и паузу обучения.
2. Native close/Esc в поиске без выбора; затем повторное открытие. Отдельно browser Back при открытом поиске/понятии — новый lesson heading и его сохранённая прокрутка.
3. Start → Check failure → допустимое изменение → Check success → изменение фиксированного параметра (старый success скрыт, новая проверка ошибочна). Backprop после изменения w должен требовать повторного прохождения шагов.
4. Mobile 320px: поиск с длинным результатом, доступность Close/последнего результата без page overflow; фиксируется визуальной проверкой, не данным ревью.
