# Практика после каждой темы: учебный контракт

Это подробный проект, не внедрение. Решение пользователя: основной язык выбирает ученик; Python, JavaScript и Rust дают одинаковые учебные результаты, а освоение дополнительных языков — отдельные достижения. Существующие уроки, вычисления и Rust-ядро сохраняются. Ни аккаунты, ни исполнение кода, ни новые проверочные пакеты этим документом не заявлены работающими.

## Проверенное покрытие и границы счёта

Инвентаризация выполнена по checkout `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, revision `827b443c32fc09411d9d2c326c410f4f54051b93`, 12 октября 2026 года. Машинный реестр — [practice-topic-inventory.json](practice-topic-inventory.json). Источник состава маршрутов — `src/App.tsx`; глав — массивы `CHAPTERS`, `SECTIONS`, `chapters` и переключатель семейств; понятий — `concepts.ts` и `advancedConcepts.ts`; карты — `curriculum.ts` и `frontierTopics.ts`.

| Уровень | Проверенное количество | Как используется |
|---|---:|---|
| Маршруты App | 17 | 14 учебных; map, curriculum, sources — ориентиры и справка |
| Переключаемые главы курсов | 59 | Transformer 8, Advanced 10, Frontiers 16; VAE/GAN/Diffusion/GNN/RL по 5 |
| Дополнительные единицы основ | 15 | Нейрон 3, loss 2, backprop 2, optimizers 3, network 5 |
| Семейства и вложенные лаборатории | 9 | 6 семейств плюс обучение CNN, сдвиг CNN, BPTT |
| Единицы практики учебных маршрутов | 83 | 59 + 15 + 9; каждая имеет objective, prerequisites, locator и четыре части задания |
| Отдельные справочные понятия | 51 | Не дополнительные главы; собственная практика после overlay-разбора |
| Карточки карты curriculum | 45 | Агрегируют темы; не добавляются к количеству глав |
| Контуры частей заданий | 332 + 204 | 4 × 83 и 4 × 51; это проекты частей, не готовые задания или проверенные test bundles |

Карточка карты может вести к нескольким главам. В частности, `architecture-training` включает четыре разные лаборатории, а `optimizer-path` объединяет SGD, momentum и Adam. Нельзя по количеству карточек утверждать, что практика покрывает каждую реальную главу. Аналогично нельзя превращать один dropdown архитектур в один зачёт без отдельных проверок CNN, RNN, LSTM, GRU и Dense.

В inventory перечислены все 83 единицы и все 51 понятие. Для каждой указан порядок `formula → implementation → edge_case → transfer`, конкретная функция или вычислительный фрагмент и проверяемый перенос. Числа 332/204 не обещают столько независимых редакторов: несколько частей могут использовать один редактор и один сохранённый solution с отдельными проверочными целями. Общие примитивы переиспользуются, но контекстный checkpoint проверяет именно новую идею.

Текущий route — только `#transformer`, `#advanced` и аналогичные hash. Номер главы, family и section в inventory — фактический локатор внутри существующего интерфейса, не работающий deep link. При внедрении понадобится сохранить выбранную тему и раскрывать её по semantic ID. Нельзя использовать индекс массива или русский заголовок как постоянный database ID. В `prerequisite_concept_ids` хранятся действующие IDs исходного словаря (`gradient`), а `reference_concepts.id` — canonical proposed ID (`concept.gradient`); связь однозначна через `current_id`, canonical form равна `concept.` + current_id. Карточки curriculum сохраняют свои существующие ID и не являются новой identity темы.

## Что означает «после каждой темы»

После содержательного раздела: сначала короткое предсказание по формуле, затем небольшой кодовый фрагмент, потом пограничный случай и самостоятельное применение. Вкладки и главы имеют собственный блок практики. Подразделы `LN/RMSNorm/residual`, `SSM/DeltaNet`, `U-Net/DiT`, `MHA/GQA/MQA` остаются в существующей главе, но должны иметь разные проверочные цели; одна успешная функция LN не подтверждает residual или RMSNorm. При выпуске автор разбивает соответствующую implementation/edge/transfer часть на упражнения каждой названной цели, а release-аудит запрещает пропускать часть составного названия.

После overlay-понятия — собственное упражнение основания. Например, после «скалярного произведения» ученик пишет `dot`, после «softmax» — устойчивую нормировку, после «Bayes» — пересчёт дискретного posterior. После attention эти функции переиспользуются для задачи с маской и смешиванием V. Успешный `dot` не заменяет attention checkpoint, а успешный attention не должен автоматически закрывать не пройденные понятия.

Чтение, ответ на тест, действия в симуляторе и код — разные виды доказательств. Открытие страницы не означает понимание. Одна train loss не подтверждает обобщение. У пространственной темы остаются численная таблица или плоское представление, клавиатурное управление и подписи настоящих величин. Batch, номер канала и timestep не превращаются в физическую xyz или дополнительную embedding-координату.

Понятия «предел», «переобучение», «test split» не сводятся к запуску нейросети. Для предела код проверяет ошибки секущих на конкретном примере, а вопрос проверяет границу такого наблюдения. Для утечки данных код проверяет fit/transform на train, а перенос — изменение held-out данных без изменения fitted statistics. Для PPO в текущей главе достаточно понять clipped objective и роли old policy/value; проект не выдаёт этот фрагмент за полноценный PPO trainer.

## Минимальный фрагмент вместо задания «напишите сеть»

У каждого задания есть неизменяемая версия: semantic ID, цель умения, prerequisites, вид задачи, публичный statement, допустимые входы, функция, шаблоны трёх языков, public examples, private test bundle, диагностические коды, правила сравнения, уровни подсказок и принадлежность requirement-группе. Версия задания фиксирует также формулу, reduction, оси, конвенции ворот/индексации и RNG-контракт. Исправление ответа или tolerance выпускает новую version; уже полученное доказательство хранит старую version.

Типичный шаг реализует одну функцию на 5–25 содержательных строк, а не целую библиотеку. Бюджет строк — редакционный ориентир, не условие проверки. Допустимы циклы, comprehension и стандартная библиотека; одинаковая математическая семантика важнее одинакового стиля кода. Нельзя оценивать понимание по имени переменных, краткости, стилометрии или похожести на эталон.

Функции берут проверенные предыдущие примитивы: affine → activation → loss → local backward → shared accumulation → optimizer. В attention используются dot и softmax; в CLIP — normalize/CE; в graph attention — тот же softmax по иной оси. «Три языка» означает три согласованных шаблона и проверки одного умения, а не три обязательных повторения одинакового примера.

Python использует обычный `float` и стандартную библиотеку, JavaScript — `Number`, Rust — `f64`. В первом ядре практики без NumPy, PyTorch, TensorFlow, autograd или сторонних NN-библиотек. Подготовка toolchain, владение slices и транспорт JSON объясняются в отдельной языковой разминке и не становятся скрытым математическим препятствием. Rust-шаблон уже содержит структуры ошибок и сериализацию. Типизированная функция ниже вызывается через общий runner-adapter `solve(input JSON) → output JSON`; ученик решает математику, а не пишет протокол.

## Учебные тесты и тесты приложения

Тест знаний проверяет смысл: предсказать эффект, выбрать ось, найти ошибку рассуждения, объяснить отличие двух формул. Для вопроса нужны distractors, соответствующие реальным заблуждениям, и обратная связь по выбранному заблуждению. Короткий выбор дополняется новым численным примером или проверяемой программой; один очевидный ответ не подтверждает владение.

Public unit tests помогают отладить собственный фрагмент. Private assessment tests подтверждают contract на иных входах, формы, edge cases и перенос; они находятся в доверенном supervisor, не в JS bundle, source map или DOM. Property tests проверяют утверждение формулы; metamorphic tests — связанное преобразование входа и выхода. Не все свойства самостоятельные: «softmax sum=1» пропускает всегда uniform-ответ, поэтому обязательно сравнивать также неравные logits и разные argmax.

Регрессионные тесты приложения отдельно защищают существующие лаборатории, маршрутизацию, сохранение и numerical kernels. Существующие результаты проекта, включая ранее прошедшие математические тесты, не являются доказательством работы новых заданий. Для новых bundles до выпуска нужны эталон, независимый oracle, намеренно неправильные реализации и одинаковый результат во всех трёх языках.

Все сравнения сначала проверяют форму/тип, затем finite согласно конкретному contract, затем `abs(actual-expected) ≤ atol + rtol*abs(expected)`. Нельзя принимать NaN из-за ложного результата сравнения. Не использовать округлённое отображение UI как expected. Малые точные полиномиальные anchors ниже: `atol=1e-12`, `rtol=1e-10`; softmax — те же параметры на контролируемых bounded inputs, а не универсальное обещание точности любого kernel. Finite difference использует `atol=1e-7`, `rtol=1e-6`, центральную разность и h от 1e-4 до 1e-6 на ограниченных smooth inputs; вблизи ReLU-кинка такой тест не применяется. Автор фиксирует диапазон и tolerance в version и проверяет mutation coverage перед публикацией.

Для задач с логарифмом нулевой вероятности mathematical result +∞ объясняется отдельно; JSON transport не передаёт невалидный Infinity/NaN. Версия должна выбрать typed domain result/error или считать loss из конечных logits. Стохастический тест не должен иногда случайно проваливать правильный ответ: inject epsilon/u, exact enumeration или детерминированный seed и заранее обоснованный bound. Частоты 20 000 выборок в текущей демонстрации — исследовательское наблюдение, а не автоматический сертификат умения.

## Anchor 1: устойчивый softmax

ID группы: `unit.transformer.attention.softmax`; основание — `concept.softmax`. Цель: получить распределение из logits, сохранить общую сдвиговую симметрию и избежать overflow. Prerequisites: exp, вероятности, векторы. Допустимые входы: непустой список конечных float, максимум 64 элемента, значения в пределах ±10 000; результат такой же длины. В рамках этого задания запрещённые attention keys ещё не передаются как −∞: mask — отдельная следующая часть.

1. Предсказать вероятности для [0,0] и эффект прибавки +1000 ко всем logits; объяснить, почему деление на сумму самих logits неверно.
2. Реализовать `stable_softmax`: вычесть max, экспоненцировать, сложить и нормировать. Return new vector, исходный input не менять.
3. Обработать singleton, extreme finite logits, empty и non-finite inputs: последние два — явная ошибка заданного вида.
4. Transfer A: нормировать logits пяти классов и проверить common shift. Transfer B: получить attention weights для иной строки scores, переставить keys и сопоставить веса после permutation. Это отдельные alternative exercises одной independent requirement, с конечным банком A/B.

```python
def stable_softmax(logits: list[float]) -> list[float]: ...
# Invalid contract: ValueError; TypeError допускается только для wrong types.
```

```javascript
/** @param {number[]} logits @returns {number[]} */
function stableSoftmax(logits) { /* TODO */ }
// Empty/non-finite: RangeError; input remains unchanged.
```

```rust
fn stable_softmax(logits: &[f64]) -> Result<Vec<f64>, InputError> { todo!() }
// InputError и JSON adapter уже предоставлены шаблоном.
```

Публичные численные fixtures:

| Вход | Expected |
|---|---|
| [0,0] | [0.5,0.5] |
| [1,2,3] | [0.09003057317038046, 0.24472847105479764, 0.6652409557748218] |
| [1000,1001] | [0.2689414213699951, 0.7310585786300049] |
| [-1000] | [1] |

Private bundle хранит иные finite arrays, смешанные знаки, permutation/shift-пары, неравные максимум/минимум и валидирует тип ошибки empty/non-finite. Property: p≥0, sum≈1, одинаковые logits дают одинаковые weights; largest logit получает largest weight. Metamorphic: перестановка inputs переставляет output; common shift сохраняет output в заданном диапазоне точности; mutation input запрещена. Fixtures с extremely small exp могут законно underflow к нулю: не требовать строгую положительность каждой компоненты.

Диагностика: `SM_OVERFLOW` — non-finite output на больших finite logits; `SM_NORMALIZATION` — сумма не 1; `SM_ORDER` — неверный порядок весов; `SM_SHIFT` — common shift изменил результат; `SM_SHAPE` — неправильная длина; `SM_INPUT_MUTATION` — изменён исходный массив. После failure дать имя нарушенного свойства и новый публичный аналог; не раскрывать private input/expected. При повторных submissions ограничить rate и сохранять audit, а не выдавать все hidden cases подряд.

## Anchor 2: backward у общего узла

ID группы: `unit.backprop.shared`; prerequisites: affine, производная, правило цепочки. Forward contract: `q=w*x+b`, `L=q*q+q`. `backward` возвращает `{q, loss, dx, dw, db}`: внешний gradient равен 1, оба пути от q к L суммируются. Входы finite в пределах ±4, scalar `f64`/float/Number; версия ограничивает диапазон, чтобы избежать overflow. Это forward и backward одного графа, не общий autograd engine.

1. Вычислить q и L вручную; назвать два локальных вклада в dL/dq: `2q` и `1`.
2. Написать forward отдельно; затем backward: `dq=2q+1`, `dx=dq*w`, `dw=dq*x`, `db=dq`.
3. Проверить q=−0.5 и x=0; сравнить конечной разностью независимого forward по x,w,b.
4. Transfer A: граф `q²+2q` с другой локальной производной. Transfer B: `q²+q+r`, где `r=w*x`, и требуется дополнительный общий путь к w/x. A/B — отдельные exercises, не сброс hint history старого задания. Формулы новых графов доступны ученику; server bundle остаётся приватным.

```python
def shared_graph_backward(x: float, w: float, b: float) -> dict[str, float]: ...
```

```javascript
/** @returns {{q:number, loss:number, dx:number, dw:number, db:number}} */
function sharedGraphBackward(x, w, b) { /* TODO */ }
```

```rust
struct GraphResult { q: f64, loss: f64, dx: f64, dw: f64, db: f64 }
fn shared_graph_backward(x: f64, w: f64, b: f64)
    -> Result<GraphResult, InputError> { todo!() }
```

Публичные fixtures:

| x,w,b | q, L | dx,dw,db |
|---|---|---|
| 2,3,1 | 7,56 | 45,30,15 |
| 1,−1,0.5 | −0.5,−0.25 | 0,0,0 |
| 0,2,1 | 1,2 | 6,0,3 |

Первый public fixture слегка выходит за общий bound результата q, но все входные scalars остаются в ±4. Forward вычисляется из входов без clipping. Private cases включают отрицательный q, ненулевые оба пути, x=0, w=0 и случаи, где один пропущенный путь заметно меняет градиент. Independent oracle forward вычисляет именно исходное выражение и central difference, не вызывает student backward и не копирует analytic derivative из него.

Property/metamorphic: dx=dq*w, dw=dq*x, db=dq; при x=0 dw=0; сохранение q заменой `b'=b-w*delta`, `x'=x+delta` сохраняет loss/db/dx при том же w, но dw ожидаемо меняется на dq*delta. Проверка только loss недостаточна. Mutation suite: забытый +1; произведение вместо суммы путей; derivative внешнего квадрата вычислена в x; перезаписанный gradient вместо +=; swapped dx/dw.

Диагностика: `BP_MISSING_BRANCH`, `BP_LOCAL_POINT`, `BP_INPUT_WEIGHT_SWAP`, `BP_ACCUMULATION`, `BP_FORWARD_MISMATCH`, `BP_FD_DISAGREEMENT`. Коды связываются с реально проверенным провалом; нельзя объявлять конкретную причину только по одному расхождению. Если механизм не различён, сообщить наблюдение «градиент по w отличается», затем предложить локальное diagnostic упражнение.

## Anchor 3: один шаг SGD

ID группы `unit.optimizer.sgd`; prerequisites: gradient, вектор, learning rate. Контракт: векторы theta/g одинаковой ненулевой длины, finite значения в ±10 000, finite eta в [0,1]; return новый vector `theta-eta*g`, без mutation theta или g. Это update rule по переданному gradient, а не обучение или поиск gradient внутри optimizer.

1. По заданным theta/g/eta отдельно вычислить gradient и delta; объяснить знак шага.
2. Написать только `sgd_step`; последующий loss вычислять отдельной функцией.
3. eta=0, g=0, mixed signs и shape mismatch; выявить mutation исходного состояния.
4. Transfer A: на `L=(x²+8y²)/2` сравнить eta=.1 и .3. Transfer B: по иной диагональной quadratic подобрать шаг и проверить условие descent `0<eta<2/lambda_max` для данного quadratic; не утверждать глобальную гарантию для любой сети.

```python
def sgd_step(theta: list[float], grad: list[float], eta: float) -> list[float]: ...
```

```javascript
/** @param {number[]} theta @param {number[]} grad @param {number} eta */
function sgdStep(theta, grad, eta) { /* TODO */ }
```

```rust
fn sgd_step(theta: &[f64], grad: &[f64], eta: f64)
    -> Result<Vec<f64>, InputError> { todo!() }
```

Публичные fixtures:

| theta; grad; eta | Expected theta_new | Дополнительное observation |
|---|---|---|
| [2,1]; [2,8]; .1 | [1.8,.2] | quadratic loss 6 → 1.78 |
| [2,1]; [2,8]; .3 | [1.4,−1.4] | quadratic loss 6 → 8.82 |
| [1,−2]; [0,3]; 0 | [1,−2] | исходный input прежний |

Private bundle включает different widths, negatives, zero gradient, malformed sizes, eta bounds и shared input aliasing. Metamorphic: coordinate permutation согласованно переставляет output; при фиксированном gradient два шага eta1/eta2 совпадают с одним eta1+eta2, когда суммарная eta внутри contract; при реальном пересчёте gradient это свойство уже не применяется. Последовательность actual quadratic steps проверяется с пересчётом g. Нельзя требовать decrease для всех eta: пример .3 должен именно показать growth. Tolerance — общий малый polynomial contract выше, включая близкий к нулю компонент.

Диагностика: `SGD_SIGN`, `SGD_ETA_IGNORED`, `SGD_SHAPE`, `SGD_INPUT_MUTATION`, `SGD_GRADIENT_STEP_CONFUSION`, `SGD_FALSE_DESCENT_GUARANTEE`. Проверка «loss упала» одна пропускает неправильные, но случайно удачные updates; сначала сравнивается каждый новый параметр с update formula.

## Прогресс без произвольного балла

Тема имеет прозрачные состояния: не начато, читаю, практикую, отправлено/проверяется, проверено с помощью, самостоятельно подтверждено, нужна повторная проверка новой версии. Главный экран показывает пройденные requirement-группы, текущий шаг, язык и последний достоверный результат; процент — только отношение завершённых обязательных групп опубликованного course release, а не прогноз знаний.

`pass` requirement-группы для формулы/implementation/edge допускают hints, примеры и справку. В согласованной первой DB/API-схеме обязательный шаг формулы — тоже код: scalar-функция вычисления q/loss/коэффициента с проверенным результатом. Устное предсказание и choice quiz перед ним остаются formative local и не закрывают server requirement; отдельный durable quiz grading потребует будущего расширения модели. `independent` checkpoint требует verified pass альтернативного transfer exercise без зарегистрированной существенной подсказки/solution reveal. OR внутри requirement-группы: успешный control-A ИЛИ control-B закрывает требование. Прохождение всех требуемых групп темы в основном языке означает завершение темы; quiz/reading не заменяют code requirements. Дополнительные языки используют те же requirement IDs, но собственные language variants, sessions, attempts и достижения, не обнуляя основной прогресс.

В текущем проекте банк transfer-альтернатив конечный: минимум A/B на checkpoint; каждый — отдельный exercise+variant с собственной неизменяемой историей помощи. Если A пройден с подсказкой, его guided pass сохраняется; самостоятельная попытка B может закрыть independent requirement. Самовольный сброс hint history, переоткрытие вкладки или новый seed не дают чистую попытку. После исчерпания банка ученик может продолжать чтение и guided practice; интерфейс честно показывает «самостоятельное подтверждение ожидает новый контрольный вариант». Новую альтернативу публикует автор в новом release. Бесконечные генераторы и reset sessions этим проектом не обещаны.

Критерий independent означает отсутствие зафиксированной помощи платформы в этом контрольном варианте, а не доказательство отсутствия внешней помощи. Не делать заявление «невозможно списать». Понимание поддерживается переносом, объяснением ошибок и новыми cases; invasive clipboard/key logging и stylometry не нужны. Solution reveal отмечается до передачи решения, а не после клиентского подтверждения.

Следующие темы доступны для чтения независимо от assessment, а prerequisites объясняют, что повторить. Для задач capstone рекомендованные prerequisites — реальные completed requirements, не посещение ссылок. При смене primary языка история сохраняется; новый основной language может иметь незакрытые требования. Профиль различает общий topic mastery и language achievement.

## Выпуск и критерии приёмки

1. Зафиксировать semantic IDs текущего inventory, topic/requirement связь и основную language preference; запустить верификацию полного покрытия без пропавших chapters/concepts. Для составных глав перечислить subskill requirements, включая residual/LN/RMSNorm, GQA/MQA, SSM/DeltaNet, U-Net/DiT, GAT/GraphSAGE.
2. Выпустить language onboarding и три anchor-группы с public examples, >=2 independent transfer alternatives и проверенными private bundles. Проверить правильные и mutation solutions во всех трёх языках. Правильный answer должен проходить одинаковые learning requirements при разных language syntax.
3. Поэтапно авторить остальные темы, сперва dependency kernels, затем architectures/generation/graphs/RL. Каждый release имеет список готовых заданий, coverage gaps и numerical evidence; inventory outline нельзя засчитывать как production readiness.
4. Подключить аккаунт, durable sessions, submissions и server-owned progression по общему DB/API проекту. Offline draft остаётся draft; verdict offline не закрывает requirement. Retried submit с одним idempotency key создаёт один attempt; stale result привязан к фактической version и solution.
5. Проверить desktop/mobile rendered UI, клавиатуру, numeric alternatives, понятность текущего шага, ошибки transport/timeout, историю помощи и переход к альтернативному checkpoint. Убедиться, что ответ и private expected не попадают в client assets.

Пример evidence записи для каждого опубликованного bundle: checkout/revision, runtime версии Python/JS/Rust, commands, bundle hash, reference solution hash, fixture revision, число public/private/property/metamorphic cases и mutation outcomes. Не обещать эффективность педагогики по этим engineering checks: learner pilot отдельно проверяет, понятны ли фрагменты и помогают ли они самостоятельно решать transfer.

## Durable note этого этапа

Готовы полный semantic inventory, задания-контуры всех 83 units и 51 concepts, три детальных anchor contracts и независимые публичные численные fixtures. Проверены реальные маршруты/переключатели и текущие `Exercise`/`ActionExercise`: первый хранит answer в React state и имеет correct/explanation в клиенте; второй проверяет численные действия и сбрасывает feedback при изменении stateKey. Ни один не обеспечивает аккаунт или durable independent mastery. Эти текущие механизмы годятся для само-проверки; серверный зачёт — последующий проект.

Следующее действие реализации: превратить три anchors в versioned requirements/exercises/variants по согласованной DB-схеме; авторить A/B control alternatives и private bundles; прогнать cross-language reference/mutation evidence; только затем подключать UI и progression. Рабочий PLAN/PROGRESS ведёт основной агент; этот файл — учебная спецификация, не конкурирующий план исполнения.
