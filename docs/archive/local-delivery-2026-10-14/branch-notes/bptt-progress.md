# BPTT — checkpoint, 2026-10-12 06:27 Europe/Moscow

Авторитетный план — PLAN.md; результаты общих задач — PROGRESS.md. Этот note
хранит только независимый модуль до интеграции родителем.

- Checkout: C:/Users/lomaster/.codex/worktrees/bptt-learning-lab/rust_ml.
- Ветка: codex/bptt-scalar-learning; база 490162fb8fb4c6ec8ff29cb6d7b640caf790431d.
- Разрешённый scope: новые BpttLab.tsx, bpttMath.ts, bptt-lab.css,
  tests/bptt.test.ts и этот note; PLAN/PROGRESS — отдельный документальный commit.
- Готовы scalar tanh forward/backward, вклады всех времён в общие веса,
  dL/dh_t, dL/dx_t, dL/dh0, настоящий SGD 1/10 шагов и практика действий.
  UI использует Range, Chart, ActionExercise; таймеров нет, соседние уроки сохранены.
- 17 математических тестов PASS: независимый двухшаговый пример,
  finite differences всех весов/h0 и выбранных входов/состояний для T=1,4,9,16
  при Wh=0.7 и -1.2; суммы, рост/затухание/насыщение, стабильность,
  валидация, неизменность аргументов, воспроизводимость, снижение loss при η=0.05.
- Первый typecheck обнаружил literal type Object.freeze в тестовом accumulator;
  тип уточнён до RecurrentWeights. Повторные typecheck/build и весь suite проходят.
  Code commit: `6a9001c0c3dfd805eb196d41302e6174a8021522` (четыре новых code/test файла).
- Read-only review Sol high нашёл P2 обход практики через SGD при η=0.1
  с последующим возвратом поля к0.05. Исправлено: сохраняются стартовые веса
  всей SGD-траектории и AND допустимых реально использованных η. Ручное изменение
  данных/весов очищает доказательства. Повторный review подтвердил закрытие
  одиночного обхода, смешанных η и ручных стартовых весов; иных замечаний нет.
- Браузер desktop/mobile320px, клавиатура и 200% текст — ОЖИДАЮТ:
  родитель проверяет после интеграции. Здесь браузер и серверы не запускать.
  Screen-reader озвучивание отменено пользователем и не заявляется проверенным.

## Команды и среда

Node24.19.0, pnpm11.25.0, Windows. PATH перед каждой командой:

```powershell
$env:PATH='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback;'+$env:PATH
```

Из learning-lab: `node --test tests/bptt.test.ts` — 17/17 PASS на грязном checkout
этой ветки, 06:20 MSK. Первый `pnpm typecheck` — FAIL; после исправления PASS.
`pnpm test`:209/209 PASS; `pnpm typecheck` и `pnpm build` PASS.
Общая Vite сборка ещё не включает BpttLab: компонент подключит родитель.
Сам BpttLab дополнительно собран esbuild в памяти, без файлов/сервера:
JS332690 bytes, CSS3517 bytes; проверка после финального исправления практики PASS.
Использована уже установленная транзитивная зависимость Vite:

```javascript
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
await esbuild.build({ entryPoints: ['src/BpttLab.tsx'], bundle: true, write: false,
  outdir: 'bptt-bundle-check', platform: 'browser', format: 'esm', jsx: 'automatic' });
```

Первый bare import esbuild не найден (он не direct dependency); resolution от Vite
исправил проверку. Manifest/lockfile не менялись. Финальные `pnpm test`209/209
и `pnpm build` PASS повторены на `6a9001c0c3dfd805eb196d41302e6174a8021522`
после исправления практики (06:27 Europe/Moscow); build включает tsc --noEmit.
`git diff --check` PASS, tracked code чистый; изменены только PLAN/PROGRESS
и этот note для отдельного docs commit. Git delivery: обычный push своей ветки
после docs commit; окончательный local/remoteSHA сообщается в финале.
Обычный offline install не нашёл tarball в default store; после обнаружения
parent node_modules/.modules.yaml команда `pnpm install --frozen-lockfile --offline
--store-dir C:/Users/lomaster/.codex/worktrees/6209/rust_ml/learning-lab/.pnpm-store`
успешно переиспользовала24 пакета без download. Manifest/lockfile не менялись.
Git в sandbox требует per-command safe.directory и escalation для refs;
глобальные настройки Git не менялись.

## Первичные источники (проверены web, 2026-10-12)

- [Goodfellow, Bengio, Courville: Deep Learning, §10.2.2 и §10.7](https://www.deeplearningbook.org/contents/rnn.html):
  backward на развёрнутом графе; сумма вкладов shared weights; tanh Jacobian.
  Текст chapter получен через search; прямой open превысил размер источника.
- [Pascanu, Mikolov, Bengio: On the difficulty of training RNNs](https://arxiv.org/abs/1211.5063):
  произведения локальных Jacobian и затухание/взрыв градиентов. Наша
  scalar-конкретизация g_(t-1)=Wh(1-h_t²)g_t проверена независимо численно.
  Clipping обсуждается в статье, но в этом уроке не применяется скрыто.

## Интеграция родителем

В ArchitectureLesson.tsx добавить `import { BpttLab } from './BpttLab';`.
После текущего RecurrentLab для family==='rnn' добавить `{family === 'rnn' && <BpttLab />}`.
Компонент `export function BpttLab()` без required props; CSS подключён самим
компонентом. Общие исходники в этом worktree не редактируются.

Проверка UI для родителя: штатное задание start → all backward → η=.05 →1/10SGD
→ practice pass; неверная траектория η=.1SGD →η=.05 (и следующий .05SGD) должна
оставаться fail до restart. Ручные изменённые стартовые веса →SGD не проходят.
Range exact Enter/Esc, backward Range, все16 входов, scroll таблицы keyboard,
320px и200% text, log gradient zero/saturation и возврат в урок проверить реально.
Автоматического обучения нет, остановка таймера не нужна.
