# GNN и Reinforcement Learning: проверенные механизмы

Проверено 2026-10-11. Реализация — две самостоятельные React-главы по пять разделов, вычисления JavaScript number в браузере, без API и новых зависимостей. Округление только при отображении.

## Первичные источники и соответствие реализации

| Источник | Подтверждённое содержание | Как используется |
|---|---|---|
| [Kipf & Welling, GCN, 2017](https://arxiv.org/html/1609.02907v4), §2 eq.2, §3, appendix A | A+I, симметричная нормализация степенями, общая W по узлам, supervised loss на размеченной части графа; tanh также есть в appendix A | Обучаемая двухслойная GCN S·tanh(SXW₁)·W₂, softmax/CE. Выбрана tanh, без bias/dropout/regularization; это учебная конфигурация, не воспроизведение бенчмарка. |
| [Veličković et al., GAT, 2018](https://arxiv.org/html/1710.10903v3), §2.1 eq.1–4 | Общая линейная проекция, аддитивный attention, LeakyReLU slope .2, softmax по соседям включая self | Standalone-числа одной scalar-головы. Проекция z=x₁+.5x₂, вручную редактируемые a_self/a_neighbor; обучения GAT нет. |
| [Hamilton et al., GraphSAGE, 2017](https://arxiv.org/html/1706.02216v4), §3.1–3.3 | Генерация embedding по локальным признакам, симметричные агрегаторы, mean, concatenation своего состояния с соседским; inductive протокол | Standalone mean-соседи + self concatenation + фиксированная W + tanh. Нет sampling и L2-нормализации, это явно указано. Изолированному узлу определён нулевой соседский mean. |
| [Li et al., Deeper Insights into GCN, 2018](https://arxiv.org/abs/1801.07606) | Сглаживание представлений и ограничения глубины | Отдельный опыт SᵏX. Для симметричной нормализации визуализируем дисперсию hᵢ/√d̃ᵢ, не обещаем равенство сырых hᵢ; связанные и несвязные графы различены. |
| [Xu et al., How Powerful are GNNs?, 2019](https://arxiv.org/abs/1810.00826) | Ограниченная различающая способность neighborhood-aggregation GNN | Краткое ограничение в тексте, без запуска GIN. |
| [Alon & Yahav, Bottleneck of GNNs, 2021](https://arxiv.org/abs/2006.05205) | Сжатие множества далёких сообщений в ограниченное представление | Oversquashing отделён от oversmoothing. |
| [Watkins & Dayan, Q-learning, 1992, авторская копия](https://www.gatsby.ucl.ac.uk/~dayan/papers/cjch.pdf), §2 pp.280–282 | Q по sampled transitions, target r+γmaxQ, табличная сходимость с условиями посещений и шагов | Реальное ε-greedy Q-learning; нет утверждения о доказанной сходимости за 1000 эпизодов с постоянной α. |
| [OpenAI Spinning Up, Key Concepts](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html) | MDP, policies, returns, value/Q, Bellman | Среда 4×3 с истинными вероятностями переходов; известная модель в value iteration отделена от опыта Q-learning. |
| [OpenAI Spinning Up, Policy Optimization](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html) | Log-probability gradient, reward-to-go, action-independent baseline | Для отдельной двухдействийной задачи реализован точный dJ/dθ=p(1−p)(rR−rL). Это не выдается за sampled REINFORCE. |
| [Mnih et al., Human-level control, 2015](https://www.nature.com/articles/nature14236) | Deep Q approximation, experience replay, target network | Только объяснение DQN; нет выдуманных обученных сетей. |
| [Schulman et al., PPO, 2017](https://arxiv.org/abs/1707.06347), [официальное описание PPO](https://spinningup.openai.com/en/latest/algorithms/ppo.html) | Clipped surrogate objective и ratio новой/старой политики | Только формула/объяснение, без гарантии строгого trust region и без запуска PPO. |
| [Gymnasium, Handling Time Limits](https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/) | Termination и внешнее truncation имеют разный bootstrap | Настоящий терминал маскирует future Q; внешний cap 80 шагов не маскирует. Метрики усечений отдельно, G при cap — наблюдённый префикс. |

[Sutton & Barto, Reinforcement Learning, 2nd ed.](http://incompleteideas.net/book/the-book-2nd.html) — основная учебная библиография, главы 3–4, 6, 13. Издатель: [MIT Press](https://mitpress.mit.edu/9780262039246/reinforcement-learning/). Авторский сайт и проверенные университетские PDF-зеркала в этой сессии не отдали полный текст (timeout/inaccessible), поэтому не заявляется прочтение PDF. Формулы сверены по доступной статье Watkins–Dayan, официальным Spinning Up и независимым ручным тестам. Не использовались пересказы форумов.

## Конкретные вычисления и ограничения

- GCN: 6 узлов, бинарный неориентированный A, 2 входных признака. W₁ 2×3, tanh, W₂ 3×2 — все 12 чисел обучаются. A,C,D,F — training labels; B,E — held-out labels, но их признаки/связи доступны (transductive). Изменение A/X сбрасывает историю и веса. Диагональ пользовательского A=0; self-loop добавляется моделью. Предел 1000 шагов.
- Перестановка одновременно меняет обе оси A и строки X. Численно сравнивается f(ΠAΠᵀ,ΠX) с Πf(A,X). Рисунок не является входом сети.
- RL: 12 клеток, 4 действия; цель 3, ловушка 7, старт 8. Slip — суммарная вероятность перпендикулярных команд, по половине каждой. Стена оставляет на месте. Вход в терминал даёт отдельную терминальную награду вместо step reward; последующие награды и V терминала нулевые.
- Value iteration читает старую V синхронно, точность residual 1e-10, cap 2000, флаг converged честно отражает результат. UI различает V терминала и entry reward. γ максимум .99; положительная step reward может поощрять цикл.
- Q-learning получает отдельные sampled transitions, ε-greedy, случайные tie-breaks, seed42. Cap 80 шагов/эпизод, 1000 эпизодов. Проверка — 100 эпизодов с α=0, ε=0, отдельным seed90210, без изменения Q; slip сохраняется. Grid при tie показывает первую стрелку и объясняет это.
- Нет таймеров или фонового обучения. Кнопки запускают ограниченное количество итераций; training-disabled при неактивном LearningContext. Состояние при смене раздела сохраняется. Изменение правил MDP явно сбрасывает Bellman/Q; policy-bandit независим.
- CSS ограничен `:is(.gnn-course, .rl-course)`; shared files/legacy modules не менялись агентом.

## Проверки

Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`, исходный HEAD при начале `9e6606aceacd9cf684996073499141b0fcd32028`, совместный working tree новых файлов. Node24 из bundled runtime, PowerShell `login:false`, рабочая директория `learning-lab`.

```
$env:PATH = 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback;' + $env:PATH
node --test tests/gnnMath.test.ts tests/rlMath.test.ts
pnpm typecheck
```

15 тестов passed: ручные агрегаты и степени, изоляты, все 12 central-difference gradients (tolerance 1e-8), mask held-out labels, loss reduction, permutation equivariance, GAT uniform attention, deterministic и stochastic hand-solved Bellman, синхронность/terminal masking, положительные rewards/cycles, manual Q arithmetic, truncation bootstrap, seeded replay/learning, policy gradient derivative, boundary rejects.

Default вычисления: CE 0.5862131520445004 → 0.013440060573005798 за 200 шагов η=.2. Q после 200 эпизодов α=.2 ε=.2 seed42: 100/100 целей в отдельной fixed-seed проверке; Bellman V*(8)=0.46222549122072765. Это один воспроизводимый учебный опыт, не утверждение качества при любых правилах.

Визуальный desktop/mobile QA выполняет root через поддерживаемый браузер. Эти unit/type checks не являются подтверждением визуального вида.
