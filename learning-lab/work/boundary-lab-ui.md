# Boundary playground UI — рабочая заметка

2026-10-11, checkout `rust_ml`, базовый commit `4ad0ddd`.

Scope: только `src/BoundaryPlayground.tsx`, `src/boundary-playground.css` и эта заметка.
Прочитаны существующие DecisionBoundaryLesson, Scene3D, ui, learning-context и math.
Используются их Chart, Range, Scene3D и OptimizerState без новых зависимостей.

В работе: единое состояние запуска (настройки, данные, веса, optimizer, реальные точки истории),
отдельные состояния порога/пробы/камеры. Новая архитектура сбрасывает только запуск.
В 3D сохранится смонтированная после первого открытия сцена; 2D измеряет настоящую ширину.
Первичная реализация и browser-проверка ещё не завершены; общие tests/build запускает root.

Следующее действие: закончить компонент с native controls, действительным обучением и картой.

Возобновление: проверен HEAD `4ad0dddaf8bfbb051e8407c9342f0115a697282b`.
Фактические имена API движка: `boundaryParameterCount`, `boundaryLossGradient`, `boundaryMetrics`.
Root добавляет `probabilityGrid`; UI использует 32×32 ячейки, исходные предсказания и
уточняемый контур. 100 шагов также считаются порциями по 10, чтобы можно было прервать.
App уже выключает `LearningActivity` при уходе из урока и открытии понятия.

Первичная реализация записана: `BoundaryPlayground` — named export без props,
native настройки 0–3 слоёв / 1–16 нейронов / ReLU, tanh, sigmoid; отдельные порог и проба.
Единый Experiment содержит settings/config, dataset, optimizer с params/m/v/step,
history и очередь. Каждый edit/reset заменяет Experiment; inactive очищает очередь/auto.
100 шагов и авто используют порции ≤10 каждые 120ms, до 4000. Численный сбой оставляет
последний корректный snapshot и видимое сообщение. Градиент использует только train96.
History хранит реальные парные BCE train/validation после каждой порции, начало step0.
2D SVG измеряет ширину и игнорирует ноль; форма/цвет/заливка различают цель и split.
3D создаётся при первом открытии и затем остаётся mounted; диапазоны x₁/x₂/p=[0,1],
128 точек на полу, p surface, τ plane, сечение, пунктирная проекция и вертикаль пробы.
DOM data-* содержит координаты и вероятности ячеек/пробы, split/target примеров и шаг.
Root уведомлён о готовности к интеграции; review-agent читает UI. Full typecheck/build,
тесты и реальная проверка desktop/mobile ещё ожидают root; это не отметка о завершении.

Финал UI-подзадачи: статический review второго агента PASS; уточнено «во всех узлах»
для плато. Заголовок «Лаборатория границ: данные и сеть», набор «Полумесяцы», mobile
select 16px, при width≤380px верхние настройки в одну колонку. Добавлен checkDomain:
перед фиксацией новых весов ограничивает абсолютные affine-суммы для всего [0,1]²,
протягивая ReLU bounds и используя |tanh|≤1, sigmoid≤1. Ошибка сохраняет прежние веса.
Root сообщил о typecheck/build PASS и 154 тестах PASS; после его сборки добавлен только
CSS breakpoint380px. Реальная проверка поверхности desktop/mobile ещё у root.

Собственная проверка guard PASS (checkout rust_ml, baseline выше, текущий файл UI):
12 инициализированных архитектур (0–3 слоя × 3 активации, ширина16), переполнение
линейного слоя, переполнение накопленного ReLU bound, безопасное ограничение sigmoid.
PATH node оказался Volta shim с недоступной директорией; команда ниже с bundled Node
сработала без смены настроек и без изменения окружения. Выполнять из learning-lab:

```powershell
@'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createBoundaryParameters } from './src/boundaryNetworkMath.ts';
const source = readFileSync('src/BoundaryPlayground.tsx', 'utf8');
const guard = source.slice(source.indexOf('function checkDomain('), source.indexOf('function advance('));
const js = ts.transpileModule(guard, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const check = new Function(js + '; return checkDomain;')();
for (const activation of ['relu','tanh','sigmoid']) for (const length of [0,1,2,3]) {
  const config = {layers: Array.from({length}, () => ({width:16, activation}))};
  check(createBoundaryParameters(config,42),config);
}
assert.throws(() => check([1e308,1e308,0],{layers:[]}));
assert.throws(() => check([1e200,0,0,1e200,0],{layers:[{width:1,activation:'relu'}]}));
check([1e200,0,0,1e200,0],{layers:[{width:1,activation:'sigmoid'}]});
console.log('PASS: domain guard');
'@ | & 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --input-type=module
```
