# Матосновы и охват курса

Проверка источников: 2026-10-11. Это исследовательская записка к расширению учебника, не отдельный план проекта. Основная приёмка остаётся в плане root.

## Учебное решение

Короткий урок отвечает на пять вопросов: какая одна идея; какой маленький численный пример; что изменить и наблюдать; как записать точно; где пример перестаёт работать. Пререквизиты открываются через общий `ConceptLink`. Состояние и путь возврата обслуживает `LearningProvider`/`KnowledgeExplorer`, а не отдельный механизм этих карточек.

Реестр `concepts.ts` содержит 30 непустых записей. Цепь `gradient → derivative → function` открыта напрямую; для дополнительного углубления есть `slope`, `limit`, `partial-derivative`, `vector`, `dot-product`. Граф именно пререквизитов не содержит циклов. Тематические ссылки вправо могут возвращать к уже известному понятию; их обработка принадлежит общей навигации.

`ConceptLesson.tsx` реализует 14 видов небольших экспериментов: функция; секущая/касательная; градиент на контурах; цепочка; векторы; матрица; распределение Бернулли; exp/ln; softmax/CE; нормализация; MSE; learning rate; backprop с двумя путями; подгонка к шумной метке. Несколько родственных карточек используют один эксперимент с разными вопросами и текстом.

Уровни карты различаются явно:

- **Интерактив**: есть реальный численный пересчёт либо ссылка на существующую лабораторию.
- **Разбор**: содержательное объяснение с конкретным примером; обучение этого механизма не заявляется.
- **Следующий уровень**: ориентир и рабочая внешняя ссылка на первичный материал. Полная локальная реализация отсутствует.

Карта содержит 24 темы в 6 этапах: математика, данные, обучение, архитектуры, оценка качества, продолжения. Фильтры оставляют осмысленные маршруты «с нуля», «обучение», «до Transformer», «после базового курса». Это карта входа, не полный перечень всех существующих сетей.

## Первичные материалы и проверенные решения

### Производная, предел, градиент

- [MIT OCW 18.01SC: Differentiation](https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/pages/1.-differentiation/) — определение производной, пределы, цепочка, exp и обратная функция. Пример в учебнике собственный: у x² наклон секущей 2x+h; предел 2x получается без подстановки h=0 в дробь.
- [MIT OCW 18.02SC: Partial Derivatives](https://ocw.mit.edu/courses/18-02sc-multivariable-calculus-fall-2010/pages/2.-partial-derivatives/) — частные производные, касательное приближение, линии уровня, градиент и производная по направлению. Контуры урока вычисляются для L=½(x²+8y²), а не иллюстрируют неизвестную поверхность.
- [PyTorch 2.9: Autograd mechanics](https://docs.pytorch.org/docs/2.9/notes/autograd.html) — граф операций и обратный проход. Учебный граф q²+q явно суммирует вклады ветвей и сравнивается с конечной разностью.

В тексте ограничен смысл градиента: наискорейший **локальный** рост для евклидовой нормы; это не направление на глобальный минимум. При ∇L=0 нельзя автоматически объявлять минимум. Одна частная производная меняет одну координату при остальных фиксированных.

### Линейная алгебра, вероятность и потери

- [Dive into Deep Learning: Linear Algebra](https://d2l.ai/chapter_preliminaries/linear-algebra.html) — координаты, матрицы, произведения и формы. Матрица весов хранится как [out,in], согласованно с текущим `linear()`; пакет вычисляется как XWᵀ+b.
- [Dive into Deep Learning: Probability and Statistics](https://d2l.ai/chapter_preliminaries/probability.html) — распределения, ожидание и дисперсия. Пример Бернулли даёт E[X]=p, Var(X)=p(1−p); ожидание не обязано быть возможным отдельным исходом.
- [Dive into Deep Learning: Softmax Regression](https://d2l.ai/chapter_linear-classification/softmax-regression.html) — нормировка логитов и cross-entropy. Энтропия распределения отделена от штрафа по правильному классу.
- [Dive into Deep Learning: Concise Softmax Regression](https://d2l.ai/chapter_linear-classification/softmax-regression-concise.html) — переполнение exp и устойчивая связка log-softmax/CE.
- [PyTorch 2.9: CrossEntropyLoss](https://docs.pytorch.org/docs/2.9/generated/torch.nn.CrossEntropyLoss.html) — различие логитов на входе и целевого класса/распределения.
- [PyTorch 2.9: MSELoss](https://docs.pytorch.org/docs/2.9/generated/torch.nn.MSELoss.html) — среднее квадратов и масштаб редукции.
- [PyTorch 2.9: LayerNorm](https://docs.pytorch.org/docs/2.9/generated/torch.nn.LayerNorm.html) — оси нормализации, дисперсия с делением на n, ε внутри корня, обучаемые γ и β. В игрушке γ=1, β=0; дисперсия нормализованного непостоянного вектора чуть меньше 1 из-за ε.

Softmax сначала вычитает максимум, затем делит разности на температуру. Это также защищает от большого общего сдвига при T<1. CE считается из логитов как `(max−target)+log(sum(exp(z−max)))`, без `log` от округлённой вероятности. Для T≠1 градиент по исходным логитам равен `(p−onehot)/T`. Предел представления огромных конечных чисел отдельно указан: устойчивый алгоритм не превращает IEEE 754 в точную арифметику.

### Обучение, обобщение, оценка

- [Stanford CS231n: Setting up the Data and the Loss](https://cs231n.github.io/neural-networks-2/) — обработка данных, инициализация, регуляризация. Использованы механизмы, а не универсальные обещания улучшения.
- [Stanford CS231n: Learning and Evaluation](https://cs231n.github.io/neural-networks-3/) — численная проверка градиентов, monitoring train/validation и параметры обучения.
- [scikit-learn: Common pitfalls](https://scikit-learn.org/stable/common_pitfalls.html) — статистику preprocessing получают на train; независимые данные не должны участвовать в подборе.
- [PyTorch 2.9: AdamW](https://docs.pytorch.org/docs/2.9/generated/torch.optim.AdamW.html) — весовой decay отделён от накопления моментов градиента. Карточка не утверждает, что существующий XOR или сравнитель оптимизаторов уже использует AdamW.

Интерактив обобщения не рисует произвольные красивые train/validation-кривые. Он вычисляет предсказания fₐ(x)=x+0,8a(x²−1)(x²−4)/4 на пяти train и четырёх validation-точках. При a=1 полином проходит через все train-метки, включая единственную шумную (0;0,8); validation лежит на исходной прямой y=x. Это заданное семейство моделей, не запуск оптимизатора и не теорема о всех больших сетях.

## Продолжения и честная полнота

Перечень направлений сопоставлен с [Stanford CS231n Spring 2025](https://cs231n.stanford.edu/2025/schedule.html): линейные модели, оптимизация, CNN, recurrent, attention, transfer, generative и RL. Сам CS231n ориентирован на computer vision и не считается исчерпывающей картой всего ML.

Внешние ссылки открыты и прочитаны:

- [He и др.: Deep Residual Learning](https://arxiv.org/abs/1512.03385) — residual x+F(x); полной ResNet здесь нет.
- [Hugging Face: Tokenizers](https://huggingface.co/learn/llm-course/chapter2/4) — текст, токены, id; промышленный токенизатор не подключён.
- [PyTorch: Transfer Learning tutorial](https://docs.pytorch.org/tutorials/beginner/transfer_learning_tutorial.html) — фиксированные признаки против дообучения; импорта весов нет.
- [Kingma & Welling: Auto-Encoding Variational Bayes](https://arxiv.org/abs/1312.6114) — вероятностный latent и вариационное обучение; VAE не реализован.
- [Goodfellow и др.: Generative Adversarial Networks](https://arxiv.org/abs/1406.2661) — две взаимодействующие модели; GAN не реализован.
- [Ho и др.: Denoising Diffusion Probabilistic Models](https://arxiv.org/abs/2006.11239) — обучение обращения зашумления; diffusion не реализована.
- [Kipf & Welling: Graph Convolutional Networks](https://arxiv.org/abs/1609.02907) — графовая структура и соседние признаки; GNN не реализована.
- [OpenAI Spinning Up: Key Concepts in RL](https://spinningup.openai.com/en/latest/spinningup/rl_intro.html) — агент, действия, награды, ожидаемый return; среды и RL-алгоритма нет.

Для Tensor/MLP/CNN/RNN/LSTM/GRU/Transformer карта указывает конкретный текущий охват и ведёт к работающим #hash-маршрутам, согласованным с root. Формы, рекуррентные соглашения и ограничения старых архитектур не переопределены.

## Проверка и границы интеграции

Рабочая копия: `C:/Users/lomaster/Desktop/dev/rust_ml`, `master`, базовый HEAD `9e6606a`, поверх существующих изменений. `learning-lab/` пока untracked. Node `24.19.0`, без новых зависимостей.

Команда из `learning-lab`:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/conceptMath.test.ts tests/curriculum.test.ts
```

Результат 2026-10-11: **16 тестов, 16 passed, 0 failed**. Проверены независимые численные значения, аналитика против конечных разностей, температурный CE-gradient, устойчивость CE при underflow целевой вероятности, нормализация с нулевой дисперсией, математическое поведение переобучения, непустые концепты/темы, ссылки и отсутствие циклов пререквизитов.

Это не проверка внешнего HTTP-сервера и не проверка отрисованного интерфейса. Общий typecheck/build и browser-приёмка выполняются root после интеграции. Новые функции не вызывают Rust и не создают AI API, GPU или backend. Большие архитектуры по-прежнему не обучаются в этой лаборатории.
