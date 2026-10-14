# Transformer output head — рабочий checkpoint

2026-10-12 Europe/Moscow. Авторитетный план: PLAN.md / PROGRESS.md.
Worktree: C:/Users/lomaster/.codex/worktrees/transformer-output-head/rust_ml
Ветка: codex/transformer-output-head-lab; база 490162fb8fb4c6ec8ff29cb6d7b640caf790431d.

Scope: новые TransformerHeadLab.tsx, transformerHeadMath.ts, transformer-head-lab.css,
transformer-head.test.ts. Общие исходники и Rust не менять. UI интегрирует и проверяет родитель.

Изучены toyLanguageForward, teacher forcing [0,1,2,4] -> [1,2,4,5].
Реализованы fused stable CE, p-onehot, outer product h*dlogits, masked mean и immutable SGD.
Проверки кода ещё не запущены. UI desktop/mobile/200%/клавиатура pending для родителя.

Runtime: Node24.19.0, pnpm11.25.0, PATH из делегирования.
Первый offline install не прошёл: пустой локальный store, не хватает @types/react19.3.0.
Диагностика: существующий cache лежит в worktree6209/learning-lab/.pnpm-store/v11.
Скопирован только cache в собственную копию; родительский checkout не изменяется.
Следующий шаг: UI и независимые математические tests, затем test/typecheck/build/review.

Источники прочитаны 2026-10-12:
- https://d2l.ai/chapter_linear-classification/softmax-regression.html — §4.1.2.2: dlogits=p-y, CE logsumexp-target, сдвиг для устойчивости.
- https://docs.pytorch.org/docs/2.14/generated/torch.nn.CrossEntropyLoss.html — logits, integer targets, mean по учитываемым позициям.
- https://arxiv.org/html/1706.03762v7 — causal mask, linear+softmax (§3.1,3.4).

Наша модель использует текущий учебный one-head backbone; FFN/нормализация опущены.
Матрица output head отделена от embeddings; обучение всего Transformer не заявляется.

## Проверенный этап модуля — 2026-10-12 06:24 Europe/Moscow

Рабочая копия перед фиксацией: только4новых файла кода/tests и собственные документы.
Выполнено с runtime PATH из вышеуказанного окружения, в learning-lab этой копии:
- `pnpm install --offline --frozen-lockfile`: PASS после копирования existing cache; manifest/lock не изменены.
- `node --test learning-lab/tests/transformer-head.test.ts` из repo root: 10/10PASS.
- `pnpm test`: 202/202PASS (baseline192 +10новых).
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS (Vite7.3.7); новый модуль ещё не в imports общего курса.
- `node --input-type=module --eval` c `import {build} from 'vite'; await build({build:{write:false,rollupOptions:{input:'src/TransformerHeadLab.tsx'}}})`: standalone component JS/CSS bundle PASS,18modules.
- Independent read-only review gpt-6.1-sol/high: no findings; browser не запускался.

Ручной известный ответ: h=[2,-1], W=[[.5,-.5],[1,2]], b=[.25,-.25]
даёт logits[.25,-3.25], p0=1/(1+exp(-3.5)), CE(target1)=ln(1+exp(3.5)).
FusedCE для logits[1000,-1000],target1 равна2000 даже при ptarget0 от underflow.
Проверены все18градиентов с epsilon1e-5, tolerance2e-8 для full и masked mean.
20шаговη.1: L1.5851169345333105 ->1.0039712986654914. h0=[1.25,1] проверен вручную.
Backbone/input/params заморожены в regression test; SGD не изменяет переданные массивы.

UI: labels, Range exact inputs, scrollable focusable tables, selected target,
логиты/probability/CE/dlogits, W/b gradients, previewSGD и настоящие пакеты1..25;
предел500шагов, reset и практика по снижению loss .35nat. Новых таймеров нет.
Финальная языковая правка d/t не меняет математику; affected bundle перепроверяется.

Интеграция в TransformerCourse.tsx (в этом worktree НЕ менять):
1. В imports добавить `import { TransformerHeadLab } from './TransformerHeadLab';`.
2. После `<section className="panel tc-teacher">...</section>` в GenerationLesson,
   непосредственно перед существующим Exercise про causal-mask, добавить `<TransformerHeadLab />`.
3. Прежнюю фразу «Здесь показаны forward и loss; ... обновление весов не запускаются»
   ограничить teacher-forcing таблицей и сослаться на следующий output-head опыт.
4. Общий sources текст «Числа заданы вручную, веса не обучались» уточнить: backbone
   фиксирован, output head обучается в новом опыте. Полное обучение Transformer не обещать.
5. Проверить настоящий UIdesktop1280/mobile320, CSS200%, точныйRange Enter/Esc,
   checkbox last-active constraint, row/token/coordinate choice, SGD20η.1 challenge,
   сброс и возвращение в раздел без потери state; scroll tables клавиатурой.

Остаток: зафиксировать code/doc отдельно, push ветки и сверкаSHA. UIpending у родителя.

## Фиксация кода — 2026-10-12 06:25:50 Europe/Moscow

Код/styles/tests зафиксированы отдельно:
`9e15a770aaa48680a19302b7d96db863653a6d04` — feat(learning-lab): train the fixed Transformer output head.
`git diff --cached --check` PASS. Только4разрешённых новых файла,400строк.
После последней языковой правки standalone Vite bundle снова PASS (18modules,2outputs).
Математические исходники/tests после 202/202PASS не менялись.
Документы PLAN/PROGRESS и этот handoff — отдельный следующий коммит.
Обычный push и local/remoteSHA проверяются после doc commit; финальные SHA в чате.
UIdesktop/mobile/200%/keyboard остаётся pending родителю.

## Доставка подтверждена — 2026-10-12 06:27:10 Europe/Moscow

Обычный push ветки codex/transformer-output-head-lab выполнен; local/remote tip
`733e6398e840ef8530489871a2dcf45ec969b260` совпал, рабочая копия была чистой.
Код для cherry-pick: `9e15a770aaa48680a19302b7d96db863653a6d04`.
Основной handoff/docs: `733e6398e840ef8530489871a2dcf45ec969b260`.
Все исходники вне4разрешённых новых файлов неизменны относительно базы.
Этот delivery checkpoint — отдельный doc commit; его финальный SHA и совпадение
remote ещё раз сообщаются в чате. Модуль готов к интеграции.
Следующий шаг родителя: подключить компонент и выполнить UI desktop/mobile/200%/keyboard
по сценарию выше. Локальных code/test/build действий больше не осталось.
