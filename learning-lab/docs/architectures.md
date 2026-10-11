# Лаборатория архитектур

Этот документ описывает раздел «Семейства сетей»: численные прямые проходы малых сетей в браузере. Каждый регулятор меняет реальный расчёт в `src/architectures.ts`; интерфейс `ArchitectureLesson.tsx` раскрывает его промежуточные значения. Это самостоятельные TypeScript-модели для обучения человека, не привязка к Rust-движку и не обученные модели.

Дополнительный раздел «Transformer по шагам» (`#transformer`) использует отдельный
`src/transformerMath.ts`: головы MHA/GQA/MQA, RoPE, варианты нормализации, KV-cache и
выбор следующего токена. Поэтому ограничения первоначального блока Transformer в таблице ниже
относятся именно к разделу «Семейства сетей», а не ко всему учебнику. Основания и границы нового
курса — [research/transformers.md](../research/transformers.md); итоговая проверка расширения —
[evidence/EXPANSION.md](../evidence/EXPANSION.md).

## Проверяемая область

| Семейство | Что действительно вычисляется | Что только объясняется |
|---|---|---|
| Dense / MLP | 2 входа; 1–3 слоя по 1–5 нейронов; изменяемые общий масштаб весов, bias, первый вход; linear/ReLU/tanh/sigmoid; веса и суммы выбранного нейрона | Residual, dropout |
| CNN | 5×5, 1–2 входных канала, один выходной канал; 3×3 фильтр и его масштаб; stride 1–2, padding 0–2, dilation 1–2; выбор позиции; ReLU и max/average pooling 2×2 | Conv1D/3D, произвольные группы/выходные каналы, обучение фильтра |
| RNN | Скалярная tanh-ячейка, 4 шага; обычный, 2-слойный и двунаправленный проходы; изменение первого входа и рекуррентного веса | Обобщение на векторные состояния |
| LSTM | Скалярные c/h, f/i/o/g, 4 шага; отдельные bias трёх ворот; вклад сохранённой памяти и записи | Stacked, bidirectional, peephole |
| GRU | Скалярные r/z/n/h, 4 шага; bias reset/update; reset-before и конвенция z=сохранение | Reset-after, stacked, bidirectional |
| Transformer | 3 позиции, 4 признака, 1/2 головы, синусоидальные позиции, Q/K/V, scaled attention, causal mask, concat+Wᴼ, residual, LayerNorm, FFN 4→6→4; encoder, decoder, encoder–decoder с отдельным численным encoder и cross-attention | Обучение, текстовый словарь, генерация, dropout, RoPE, KV-cache, глубокие стеки |

Реестр `architectureFamilies` питает переключатель и честную таблицу охвата. Новое семейство требует собственного малого расчёта и интерфейса; общего графового конструктора нет.

## Конвенции

- Dense: строки W — выходные нейроны, z=Wx+b. Выбранная активация применяется ко всем слоям, включая последний.
- Conv2D: cross-correlation без переворота ядра; нулевой padding. Вход C×H×W, ядра O×C×KH×KW. Суммируются все входные каналы. Pooling использует полные окна без padding, шаг равен размеру окна. Пустой результат показывается, если окно не помещается.
- RNN: h=tanh(wₓx+wₕh_prev+b); нулевое начальное состояние. В 2-слойном варианте второй слой получает текущий h первого; обе ячейки имеют одинаковые демонстрационные веса. В двунаправленном варианте состояния сохраняются в исходном порядке позиций, выход — конкатенация прямого и обратного состояния.
- LSTM: c=f c_prev+i g; h=o tanh(c). Отдельная память c не проходит tanh до вычисления h. Начальные c/h равны нулю.
- GRU: n=tanh(wₓx+wₕ(r h_prev)+b), h=z h_prev+(1−z)n. Это reset-before с единственным bias кандидата вне reset. PyTorch использует reset-after; в общем векторном случае порядок отличается.
- Transformer: ручной embedding e(x)=[x,x²/2,sin(x),cos(x)], позиции PE=[sin(p),cos(p),sin(p/100),cos(p/100)], p начинается с 0. Это наглядные признаки, а не обученная таблица embeddings. Все матрицы фиксированы и раскрываются в интерфейсе; encoder и decoder повторно используют одни демонстрационные матрицы.
- Transformer использует post-norm: LayerNorm(x+sublayer(x)), γ=1, β=0, epsilon=1e−5. FFN(x)=ReLU(xW₁+0.1)W₂+0.05. В decoder маска допускает текущую и прошлые позиции. Cross-attention не маскируется: Q из decoder после self-attention, K/V из полного выхода отдельного encoder-блока.
- Трассы считают с точностью JavaScript number, интерфейс округляет числа. Цвет дублируется числом и подписью; выбор шага доступен кнопками и подписанными ползунками.
- SVG измеряют ширину контейнера через ResizeObserver: координата SVG соответствует CSS-пикселю, подписи чисел имеют размер 12 px. При ширине меньше 580 px слои Dense идут сверху вниз; ширина схемы внимания и трёх узлов рассчитывается по доступному месту. Названия семейств и Q/K/V расшифрованы в начале соответствующих лабораторий; затвор определён как число от 0 до 1, регулирующее долю сигнала.

## Источники

Формулы сверены 11 октября 2026:

- [PyTorch Conv2D: определение и формула формы](https://docs.pytorch.org/docs/stable/generated/torch.nn.Conv2d.html).
- [PyTorch LSTM: ворота и состояния](https://docs.pytorch.org/docs/stable/generated/torch.nn.LSTM.html).
- [PyTorch GRU: конвенция update и отличие reset-after](https://docs.pytorch.org/docs/stable/generated/torch.nn.GRU.html).
- [Vaswani et al., Attention Is All You Need](https://arxiv.org/abs/1706.03762), разделы 3.1–3.5: self/cross attention, mask, multi-head, FFN, residual/post-norm и позиции.

## Проверки и продолжение

`tests/architectures.test.ts` использует `node:test` и встроенную поддержку TypeScript в Node 24, без tsx. Проверяет независимые ручные примеры Dense/Conv/pooling/затворов, нормировку внимания, causal isolation, реакцию cross-attention на изменение source и конечность выходов. При приёмке первой версии 11 октября 2026 общая команда `pnpm test` прошла: 22 passed, 0 failed, в том числе 10 тестов архитектур. Её `pnpm typecheck` и `pnpm build` успешны после адаптивных изменений SVG. Эти результаты исторические; новые проверки расширения записаны отдельно.

В настоящем браузере осмотрены desktop, 390px и 320px (Dense 3×5); проверены регуляторы семейств, RNN stacked/bidirectional, затворы LSTM/GRU, causal mask, изменение source в cross-attention, одна/две головы и позиции. SVG измеряют контейнер и сохраняют 12px текст; узкий Dense разворачивается вертикально. В production повторно проверены численная causal mask и отсутствие console errors. Подпись Q в cross-attention указывает на decoder после первого LayerNorm; Q/K/V по умолчанию свёрнуты. Журнал: `evidence/browser-checks.json`, `evidence/production-browser.json`; сводка — `evidence/VALIDATION.md`.
