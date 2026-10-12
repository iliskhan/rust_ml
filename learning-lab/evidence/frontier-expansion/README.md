# Проверка шестнадцати лабораторий `#frontiers`

2026-10-12, Europe/Moscow. Checkout
`C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, ветка `codex/ui-ux-learning-lab`.
Чистая база `035866823921e15656c87484f092d508dc194f6c`; проверки выполнялись
с рабочими изменениями этого пакета. Точный финальный снимок исходников/тестов —
`source-hashes.json`; история Git определяет содержащий его commit.

Принятый объём выполнен: 12 новых направлений и четыре лаборатории обучения
ViT, MoE, SSM, U-Net/DiT. Курс, навигация, карта тем и документация связаны.
Это маленькие самостоятельные TypeScript-модели в браузере; Rust не менялся.

## Автоматические проверки

Windows, bundled Node **v24.19.0**:
`C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`.
Рабочая папка всех команд — `learning-lab`.

| Команда с указанным Node | Результат |
|---|---|
| `--test tests/*.test.ts` | **331/331 PASS**, 0 skipped/fail; `test-output.txt` |
| `node_modules/typescript/bin/tsc --noEmit` | PASS, exit 0 |
| `node_modules/vite/bin/vite.js build` | PASS; `build-output.txt` |
| `--test tests/curriculum.test.ts` после уточнения ограничений | 6/6 PASS; `docs-note.md` |
| `git diff --check` из корня | PASS |

Полный suite выполнен после математических исправлений. После него изменялись
только адаптивный SVG, направление checkbox, пояснения и ссылка из `#advanced`;
финальные TypeScript/build повторены. Новых зависимостей нет. У сборки остаётся
предупреждение о главном chunk 523,85 kB (158,54 kB gzip); новые главы загружаются
лениво. Это не замер скорости устройства или гарантированный performance budget.

Независимые проверки: [representation/geometry](representation-geometry-review.md),
[inference](inference-review.md), [обучаемые архитектуры](training-review.md).
Помимо основных тестов проверяющие использовали независимые формулы, дополнительные
конечные разности, случайные 3D-преобразования, лучи и распределения генерации.
Их числа и границы применимости сохранены в отчётах, без подмены старого снимка новым.

Исправления:

- CLIP: для `||x|| < epsilon` Jacobian теперь `g/epsilon`; обычная unit-ветка
  сохраняет вычитание радиальной проекции. Регрессия проверяет 27 производных
  почти нулевых image-весов конечными разностями. Полный suite включает её.
- Тест masked denoiser теперь меняет собственный входной токен позиции и проверяет,
  что её logits от него не зависят; устранена бесполезная проверка значения с самим собой.
- Карточка учебного плана ссылалась на несуществующее понятие `activation`;
  заменено существующим `function`, registry-тесты проходят.
- FlowPlane на 320 px уменьшал подписи до 8,33 экранного px. Теперь ResizeObserver
  задаёт viewBox по ширине контейнера, подписи остаются **12 экранных px**.
  [До](m02-flow-before.jpg) / [после](m02-flow-after.jpg), desktop повторно проверен.
- Общий `label { flex-direction:column }` разворачивал checkbox над подписью.
  Локальные правила Flow/EGNN и representation задают `row`;
  [JEPA](m19-jepa-checkbox-after.jpg), [EGNN](m20-egnn-checkbox-after.jpg).

## Настоящий браузер

Codex IAB, production preview `http://127.0.0.1:5185/#frontiers`, **1280×720** и
**320×800**. Скриншоты ниже просмотрены, а действия выполнены через настоящий UI.
Первый обход использовал production build перед финальными адаптивными правками;
после последней сборки страница перезагружена, затронутые Flow/JEPA/EGNN и переход
`#advanced` → `#frontiers` перепроверены. Временный viewport затем сброшен.

| Лаборатория | Действие и наблюдаемый результат | Desktop / mobile |
|---|---|---|
| CLIP | 200 SGD, retrieval 4/4; включено настоящее R³. После переходов сохранились веса, на mobile шаг стал 201 | [desktop](01-clip-desktop.jpg), [mobile](m01-clip.jpg) |
| Flow matching | 500 Adam: held-out MSE 2,13798 → 1,21455. Ползунок t изменён клавиатурой | [desktop](18-flow-desktop-after.jpg), [mobile](m02-flow-after.jpg) |
| Интерпретируемость | 200 SGD; patch дал Δlogit 2,09238, Δloss −1,06844. На mobile выполнена ablation | [desktop](03-interpret-desktop.jpg), [mobile](m03-interpret.jpg) |
| EGNN | Поворот Z клавиатурой и отражение: ошибки порядка 1e−16. Добавление абсолютного X нарушило симметрию; 3D-камера доступна с клавиатуры | [desktop](04-egnn-desktop.jpg), [mobile](m04-egnn.jpg) |
| Neural field | 500 Adam: held-out MSE 0,098288 → 0,001565. При σ=0 RGB=[1,1,1], T=1, веса луча 0 | [desktop](05-field-desktop.jpg), [mobile](m05-field-zero.jpg) |
| DPO | 50 шагов: loss 0,18017, KL 0,64021; ещё один шаг на mobile | [desktop](06-dpo-desktop.jpg), [mobile](m06-dpo.jpg) |
| Квантизация | 100 SGD адаптера: train 0,01837 / held-out 0,01456. Смена 4→2 бит сбрасывает адаптер | [desktop](07-quant-desktop.jpg), [mobile](m07-quant-table.jpg) |
| Speculative decoding | 20 000 выборок: частоты 9,8/60,3/19,8/10,1% при target 10/60/20/10%; принятие 78,56%. При fidelity=0 новый блок принял один токен и выдал коррекцию Б | [desktop](08-speculative-desktop.jpg), [mobile](m08-speculative.jpg) |
| Длинный контекст | 100 SGD, сила 4,9146, train CE 0,03781. На длине24 найден ключ7; окно1 исключило его, p=0 и CE=∞ явно подписаны | [desktop](09-context-desktop.jpg), [mobile](m09-context-masked.jpg) |
| JEPA | 200 SGD: latent MSE 2,49e−4, variance 0,507009. Нулевая инициализация и 50 шагов показывают предупреждение о коллапсе | [desktop](10-jepa-desktop.jpg), [mobile](m10-jepa-collapse.jpg) |
| Masked text | 100 SGD, CE 0,31723; из подсказки В последовательно восстановлено А·Б·В·Г. Полная маска с четырьмя одновременными решениями дала Б·Б·А·А, демонстрируя несовместимость | [desktop](11-masked-desktop.jpg), [mobile](m11-masked-parallel.jpg) |
| KAN | 200 SGD: held-out KAN 0,010356, MLP 0,183535 на данной аддитивной задаче. Включена поверхность реальной f(x,y) | [desktop](12-kan-desktop.jpg), [mobile](m12-kan-surface.jpg) |
| Обучение ViT | 80 SGD: validation CE 0,07123; ещё один шаг на mobile | [desktop](13-vit-desktop.jpg), [mobile](m13-vit.jpg) |
| Обучение MoE | 200 SGD: validation MSE 0,00569; ещё один шаг на mobile | [desktop](14-moe-desktop.jpg), [mobile](m14-moe.jpg) |
| Обучение SSM | 100 SGD: validation MSE 0,00658; смена validation-последовательности клавиатурой | [desktop](15-ssm-desktop.jpg), [mobile](m15-ssm.jpg) |
| Обучение U-Net / DiT | По 160 SGD: validation MSE 0,14104 / 0,1783. U-Net прошёл8 шагов DDIM до t=0; mobile DiT t8→7, переключение на U-Net и SGD | [U-Net](16-unet-desktop.jpg), [DiT](17-dit-desktop.jpg), [mobile DiT](m16-dit-sampling.jpg), [mobile U-Net](m17-unet.jpg) |

Обучение DiT остановлено кнопкой на шаге 244. Новый запуск и уход в CLIP остановили
его на 324; повторное чтение после возврата подтвердило те же 324 и отсутствие
оставшейся очереди. CLIP при этом сохранил 200 шагов. После выхода во внешний
`#advanced` возврат по новой ссылке сохраняет активную главу Flow и её 500 обновлений.

Во всех 16 главах mobile `document.documentElement.scrollWidth=305` при
`innerWidth=320`: общей горизонтальной прокрутки нет. Широкие численные таблицы
прокручиваются локально. На SSM клавиши ArrowRight переместили scrollLeft до 50,4 px
при clientWidth 232 / scrollWidth 309; [снимок](m18-keyboard-table.jpg).
`mobile-dom-bounds.json` также хранит измерения SVG до/после. Финальный Flow имеет
viewBox 231,59375 при ширине 231,60 на mobile и 396,1875/396,20 на desktop; текст 12 px.
`browser-console.json` содержит `[]` для warn/error.

Озвучивание скринридером пропущено по решению пользователя, эта проверка не заявлена.
Отдельный реальный 200% text-zoom в этом пакете не выполнялся; mobile/reflow и
клавиатура не выдаются за полную сертификацию доступности. Рендер изученных сценариев
и численные тесты не означают качество промышленных моделей или обучение на реальных данных.

## Точные границы моделей

Полная таблица — [architectures.md](../../docs/architectures.md).
CLIP обучает четыре синтетические пары; JEPA — маленькие проекции с EMA;
KAN — две аддитивные линейные B-spline функции. Причинный классификатор отдельный,
фиксированный. EGNN — фиксированный эквивариантный блок. Neural field обучается
по синтетическим sigma/RGB координатам, не по фотографиям и без view-dependent radiance.
Uniform integer quantization не называется NF4; адаптер не выдаётся за полную QLoRA.
DPO использует три logits, не reward-model/PPO. Speculative сохраняет распределение,
не обещает одинаковый текст или измеренное ускорение. Long context — тест одного
attention-механизма; masked text — категориальный предиктор, не полноразмерный LLaDA.
Обучаемый MoE использует мягкую смесь обоих экспертов, SSM не имеет селективности
Mamba, ViT/DiT/U-Net намеренно малы. Пространственные оси показывают реальные
embedding-компоненты, физические xyz либо f(x,y); время и индекс канала не оси пространства.

## Доставка

Code commit `2be6a31406d8f8b9ec1d12f6c273206136a0f692` отправлен обычным push
в `origin/codex/ui-ux-learning-lab`. Локальный `rev-parse HEAD` и
`ls-remote origin refs/heads/codex/ui-ux-learning-lab` вернули одинаковый SHA.
Рабочее дерево после code commit чистое. Эта запись сохраняется отдельным
документационным commit без изменения проверенных исходников.
