# CNN training — checkpoint

Обновлено: 2026-10-12 06:31 Europe/Moscow.
План задачи хранится в PLAN.md; эта записка — подробный handoff модуля.

- Worktree: `C:/Users/lomaster/.codex/worktrees/cnn-filter-training/rust_ml`.
- Ветка: `codex/cnn-filter-training`; база `490162fb8fb4c6ec8ff29cb6d7b640caf790431d`.
- Scope: только новые CnnTrainingLab.tsx, cnnTrainingMath.ts, cnn-training-lab.css,
  tests/cnn-training.test.ts и эта записка; PLAN/PROGRESS обновляются отдельно от кода.
- Code commit: `e9135da1e6a780caf1a23808a0b2d69eb90f8c04` (четыре новых файла).
- Реализована математика: существующая conv2d без изменения; общий 3×3 фильтр,
  valid cross-correlation, средняя MSE, backward по w/b/x с суммой окон, чистый SGD.
- Проверено: `node --test tests/cnn-training.test.ts` — 7/7 PASS на Node24.19.0.
  Ручные ответы, центральные разности всех весов/bias/входов на трёх формах,
  воспроизводимость, снижение MSE, ошибки форм/nonfinite/overflow.
- UI реализован: карты вход/цель/ответ/ошибка, Range вход/выбранный w/b/η,
  поле выбранного выхода, все вклады в общий вес, sensitivity и backward x,
  lastSGD before/after10parameters, практика и история MSE. Кнопки1/10/100,
  yield после5 шагов, бюджет1000; reset/unmount отменяет продолжение.
- `pnpm test` 199/199 PASS; `pnpm typecheck` PASS, повторены после финальных правок.
- `pnpm build` PASS. Отдельная library build нового entry+CSS PASS:

```powershell
node --input-type=module -e 'import { build } from "vite"; await build({ configFile: false, build: { outDir: "dist/cnn-module", lib: { entry: "src/CnnTrainingLab.tsx", formats: ["es"], fileName: "cnn-training" }, rollupOptions: { external: ["react", "react/jsx-runtime"] } } });'
```

- MSE после100 шагов η=.05: `0.00002772558807552571` (старт2/3).
  Фильтр на одной карте не уникален: успешная подгонка не доказывает обобщение.
- Независимое Astra/high review и delta review: открытых P1/P2 нет. Найденный
  P2 выхода w/b за Range[-2,2] исправлен: домен расширяется по floor/ceil текущего
  параметра. Браузерный сценарий: исходный вход; w=[[2,-2,-2],[0,0,0],[0,0,0]],
  b=0, η=.1 → один SGD → w[1,1]=2.1333333333333333, max ползунка должен быть3.
- Практика требует уменьшения loss относительно начала текущей истории;
  ручной идеальный фильтр + SGD с нулевым изменением не проходит regression.
- `git diff --cached --check` для code commit PASS.
- Установка: `pnpm install --offline --frozen-lockfile --store-dir
  C:/Users/lomaster/.codex/worktrees/6209/rust_ml/learning-lab/.pnpm-store` — PASS,
  reused24/downloaded0. Первый offline install без store-dir обнаружил отсутствующий
  tarball; причина устранена выбором существующего cache из .modules.yaml базы.
- UI desktop/mobile/320px/CSS200%/клавиатура: PENDING у родителя после интеграции.
  В этой задаче не управлять браузером, не запускать серверы и Narrator.
- Доставка: code commit и отдельный docs commit
  `eb2b854183966a9b44f5f1764d564ca91d527f26` отправлены обычным push.
  В06:31 local/remote SHA совпали на eb2b854; worktree был чистым.
  SHA этого финального документального checkpoint сообщается в чате.
- Следующий шаг родителя: cherry-pick только code commit, интеграция и настоящий UI.

Первичные источники проверены web 2026-10-12:

- https://d2l.ai/chapter_convolutional-neural-networks/conv-layer.html —
  cross-correlation, явная целевая карта края и обучение ядра squared error.
- https://cs231n.github.io/convolutional-networks/#conv — shared weights/bias,
  сумма градиентов пространственных позиций, receptive field.
- https://cs231n.github.io/optimization-2/ — chain rule, произведение и
  накопление вкладов. Формулы нашего среднего MSE проверены независимыми тестами;
  пример d2l использует sum loss, поэтому наш коэффициент 1/N явный.

Точные строки интеграции (вне scope этой ветки):

```tsx
import { CnnTrainingLab } from './CnnTrainingLab';
```

ArchitectureLesson.tsx:173: заменить только CNN-ветку ternary, добавив компонент
сразу после существующего `<CnnLab />`:

```tsx
family === 'cnn' ? <><CnnLab /><CnnTrainingLab /></> :
```
