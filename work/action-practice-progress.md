# Практические задания Foundations

Дата: 2026-10-11, Europe/Moscow. Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, исходная ревизия `fd19da780d8bb3800853894d8f3af6c2b97c40c5`, ветка `codex/ui-ux-learning-lab`.

Реализованы три задания, которые проверяют текущие реальные параметры урока:

- Нейрон: x₁=1, x₂=2, w₁=1, w₂=−1, b=0, ReLU; изменить только b до a>0. Порог b=1 ещё не даёт успеха.
- MSE: начальные предсказания [0,5; 2,5; 2]; изменить только третье до MSE<0,2.
- Backprop: x=1,2, w=0,8, y=1, шаг 1; изменить только вес до L<0,05 и открыть шаг 4 с суммой двух вкладов.

`ActionExercise` используется тремя уроками; явно начинает задание и меняет перечисленные параметры только по кнопке. Выход оставляет текущие значения и возвращает фокус на кнопку начала. Проверка повторно читает state урока, численно объясняет успех/ошибку и показывает изменённые фиксированные параметры. После изменения state старая обратная связь скрыта. Существующие quiz, formulas, ConceptLink, AnalyzeNumbers и 3D сохранены; persistence не добавлена.

Контракт компонента: `title`, `goal`, `startingConditions`, `hint`, `onStart(): void`, `check(): ActionCheck`, `stateKey: string`. Проверяется сохранение фиксированных параметров в текущем состоянии; их возврат к начальным значениям позволяет продолжить задание без перезапуска.

Проверка: Node 24.19.0 / pnpm 11.25.0, PowerShell `login:false`; runtime bin dirs из родительского brief добавлены в PATH. `node --test tests/action-exercise.test.ts` в `learning-lab`: 8/8 PASS, 275 ms. Покрыты неуспешные начальные значения, отрицательные/нулевые ReLU, достижение целей и запрет достижения через другие параметры, невалидные числа/формы, реальный loss графа и его две ветви.

`pnpm typecheck` пока завершился ошибкой в независимых новых файлах ConceptSearch: конфликт имён `ConceptSearch.ts`/`conceptSearch.ts` по регистру, отсутствует экспорт `ConceptSearch` в импортируемом файле. Родитель уведомлён; проверки Foundations не сообщили TS-ошибок. Следующий шаг: родитель исправляет search-интеграцию, запускает итоговый typecheck/build и проверяет задания в браузере desktop/mobile 320px, затем выполняет общий commit/push. Агент не запускает сервисы и не коммитит.

Отдельная проверка TypeScript для Foundations, его импортов и теста успешно пройдена: `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --jsx react-jsx --strict --skipLibCheck --esModuleInterop --allowImportingTsExtensions --types node src/Foundations.tsx tests/action-exercise.test.ts` (exit 0). `pnpm exec tsc` в текущем окружении не находит бинарник, поэтому применён прямой вызов локального компилятора через Node.
