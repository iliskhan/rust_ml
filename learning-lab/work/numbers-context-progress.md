# Разбор своих чисел: изолированная часть задачи

- База: master `d358291586a728d2b396850acbd43f6402c1dbe9`, checkout `C:/Users/lomaster/Desktop/dev/rust_ml`.
- Реализованы `MathSnapshot`, `copyMathSnapshot`, `analyzeMathSnapshot`, явная кнопка `AnalyzeNumbers`, отдельная `SnapshotAnalysis` перед самостоятельным `ConceptLesson`.
- Снимок создаётся и проверяется по нажатию; массивы копируются и замораживаются. Обычная ссылка из урока, закрытие и возврат из корневого понятия очищают снимок. Вложенные ссылки и хлебные крошки сохраняют его. Существующие mounted visited frames и собственные controls демонстраций сохранены.
- Интеграции: «Нейрон и слои» (dot product + bias + activation), attention/шаг 2 (q·k до scale), attention/шаг 4 (finite scaledScores, исходная T, отдельная маска true=allowed). Detail сохраняет выбранный запрос/ключ/шаг и настройки.
- Для MLP поддержан `accumulation: 'bias-first'` (по умолчанию bias-last), чтобы повторять порядок сложения исходной сети.
- Softmax использует одну формулу для exponentials/denominator/probabilities. Если разность двух конечных противоположных экстремумов переполняется, деление на T выполняется до вычитания; общий transformer helper не менялся. Переполнение dot product отклоняется явной ошибкой.
- Проверка 2026-10-11: `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe --test tests/math-snapshot.test.ts` из `learning-lab`; 8/8 PASS, включая bias-first, sparse-array regressions, known answers, все сочетания causal/scale/T/selected row с точным совпадением attention probabilities и согласованность p=e/Σe на конечных экстремумах.
- Root выполняет общие tests/build и настоящий browser QA desktop/mobile (nested/back/breadcrumb/Esc, controls, focus, scroll, снимок vs самостоятельные demos), затем Git commit/push. Здесь эти проверки и Git не запускались.
