# Transformer course — реализация и приёмка завершены

Root, 2026-10-11 07:18 MSK: все 8 разделов проверены в production UI, включая desktop/320/390.
Сохранение embedding, переключатели MHA/GQA/MQA, RoPE, нормы, cross, cache и sampling подтверждены.
Общие 54 tests и build прошли; `../evidence/EXPANSION.md` содержит доказательства.
Ниже — историческая запись передачи реализации.

2026-10-11, Europe/Moscow. Рабочая копия: `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`.

- Изучены существующие `architectures.ts`, `ArchitectureLesson.tsx`, `math.ts`, `ui.tsx`; без новых зависимостей.
- Первичные источники проверены: Transformer, BERT, GPT, T5, RoFormer, MQA/GQA, RMSNorm, Pre/Post-LN; официальные HF cache/generation docs.
- Реализованы pure functions для trace attention, editable projections, RoPE, MHA/GQA/MQA, FFN+norm, настоящего append-only KV-cache, toy causal language head и sampling.
- Созданы `TransformerCourse.tsx` и `transformer-course.css`: 8 разделов, 5 шагов внутри attention, редактируемые matrices, probability bars, RoPE SVG, KV-строки, sampling ribbon. Состояния разделов сохраняются при переключении (`mounted + hidden`).
- `node --test tests/transformerMath.test.ts`: 10/10 meaningful numerical tests PASS.
- `node node_modules/typescript/bin/tsc --noEmit`: PASS на текущем общем рабочем дереве.
- Runtime: `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`, Node 24.19.0. Base HEAD `9e6606aceacd9cf684996073499141b0fcd32028`, файлы ещё не закоммичены. Git read через `-c safe.directory=C:/Users/lomaster/Desktop/dev/rust_ml`, без изменения git config.
- Полное исследование и границы экспериментов записаны в `research/transformers.md`. Формулы не обещают смысловое обучение, настоящее pretrained-семейство или измеренную скорость.
- Следующий шаг root: подключить `export function TransformerCourse()`, проверить реальные desktop/mobile поверхности всех 8 разделов, nested ConceptLink и сохранение вводов. Особенно проверить таблицы при 320 px: у каждой есть локальный горизонтальный scroll. Свои numerical tests готовы; visual validation пока не объявлена пройденной.

Границы: только файлы `src/TransformerCourse.tsx`, `src/transformerMath.ts`, `src/transformer-course.css`, `tests/transformerMath.test.ts`, `research/transformers.md`, этот handoff. Без обучения весов, внешних моделей и новых зависимостей.
