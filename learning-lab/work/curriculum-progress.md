# Матосновы и карта курса — рабочая заметка

Root, 2026-10-11 07:18 MSK: общие 54 tests, typecheck/build и browser-приёмка завершены.
Проверены поиск, mobile и derivative → limit → возврат с сохранённым h.
Текущий итог — `../evidence/EXPANSION.md`; запись исполнителя ниже историческая.

Обновлено: 2026-10-11 06:59 Europe/Moscow (UTC+03:00).

Задача делегирована из основного расширения учебника; общий план и приёмка остаются у root.
Рабочая копия: `C:/Users/lomaster/Desktop/dev/rust_ml`, ветка `master`, HEAD `9e6606a`.
Весь `learning-lab/` пока untracked; в Rust и корневых документах уже есть чужие изменения. Они не затрагиваются.

Сделано; численные и содержательные проверки пройдены, отрисовку проверяет root:
- `concepts.ts`: 30 содержательных понятий, включая function → slope/limit → derivative → partial-derivative → gradient; первичные источники и границы каждого примера.
- `conceptMath.ts`: переиспользование текущих math/architectures плюс устойчивый CE, ожидание/дисперсия/энтропия, секущая и наглядный overfitting.
- `ConceptLesson.tsx`: реальные ползунки/графики для 14 видов экспериментов, рекурсивные ConceptLink, без дублирования h2.
- Исследованы MIT OCW, D2L, PyTorch, scikit-learn, CS231n 2025 и оригинальные статьи расширенной карты.
- `curriculum.ts` и `CurriculumView.tsx`: 24 темы / 6 этапов / 5 фильтров маршрута, словарь 30 понятий, отдельные уровни «интерактив / разбор / следующий уровень». Все локальные назначения согласованы с root; #transformer подтверждён.
- `concept-lessons.css` — только собственные concept-/curriculum- классы; импортируется компонентами. Исходные уроки, ui.tsx и styles.css не менялись.
- `research/curriculum.md`: проверенные первичные ссылки, решения, ограничения и точная проверочная команда.
- `tests/conceptMath.test.ts` и `tests/curriculum.test.ts`: 16/16 passed, 0 failed; повторный прогон после финальных уточнений источников — 06:59 UTC+03:00.

Команда: `node --test tests/conceptMath.test.ts tests/curriculum.test.ts` из `learning-lab`, явный bundled Node 24.19.0. Проверены finite differences, CE/softmax-стабильность и температурный градиент, normalization, actual train/validation MSE, все ссылки, непустое содержимое и prerequisite DAG.

Далее у root: общий typecheck/build и проверка реальной отрисовки, включая mobile и сохранение настроек в gradient → derivative → function → назад. Собственные назначенные файлы завершены. Блокеров нет.
Сервер и общий build запускает только root. Исполняемый Node: `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Git read-only: `git -c safe.directory=C:/Users/lomaster/Desktop/dev/rust_ml …`; глобальный config не изменять.
