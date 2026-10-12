# Исследование для пошагового курса Transformer

Исходный курс проверен 2026-10-11; охват дополнен 2026-10-12. Базовый маршрут `#transformer`: `src/TransformerCourse.tsx`, `src/transformerMath.ts`, `src/transformer-course.css`. Новый маршрут `#advanced`: `AdvancedArchitecturesCourse.tsx` и отдельные малые математические модули. Только первичные статьи и официальная документация. Интерфейс показывает самостоятельно написанные объяснения и диаграммы; изображения из статей не копируются.

## Источники и решения

| Источник | Проверенный механизм | Решение для учебника |
|---|---|---|
| [Vaswani et al., Attention Is All You Need, §§3.1–3.5](https://arxiv.org/html/1706.03762v7) | Проекции Q/K/V, масштаб √dₖ, softmax по строкам, запрет будущих связей, concat+Wᴼ, FFN, post-norm, синусоидальные позиции | Отдельные вычисляемые шаги с редактируемыми входами/матрицами; исходная post-norm отделена от современных вариантов |
| [Devlin et al., BERT](https://arxiv.org/abs/1810.04805) | Двусторонний encoder, masked language modeling, исходная дополнительная задача NSP | BERT представлен как пример семейства, а не доступная обученная модель; `[MASK]` отличён от маски связей attention |
| [Radford et al., Improving Language Understanding by Generative Pre-Training](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) | Decoder с причинным attention и авторегрессионным языковым обучением | Семейство GPT объясняется через префикс и следующий токен; современные конфигурации GPT не приписываются статье 2018 года |
| [Raffel et al., T5](https://arxiv.org/abs/1910.10683) | Encoder–decoder, text-to-text, восстановление испорченных фрагментов | Отдельно объяснены запросы decoder к памяти encoder и возможность разных длин |
| [Su et al., RoFormer, §3.2](https://arxiv.org/html/2104.09864v5) | Блочные двумерные повороты, частоты 10000^(−2i/d), зависимость dot product от относительной позиции | Реальный RoPE для чётной ширины; SVG показывает выбранную пару; численно проверяются длина и общий сдвиг |
| [Shazeer, Fast Transformer Decoding: One Write-Head Is All You Need](https://arxiv.org/pdf/1911.02150) | Несколько Q-голов с одной K/V-головой уменьшают объём KV, читаемый при decode | MQA действительно разделяет K/V между запросами; качество и wall-clock speedup не имитируются |
| [Ainslie et al., GQA, §2.2](https://arxiv.org/html/2305.13245v3) | Группы Q-голов разделяют одну K/V-пару; G=1 даёт MQA, G=H даёт MHA | 4 Q-головы и 1/2/4 KV-группы; отдельный счётчик памяти. Выбор первых проекций обозначен как учебная конструкция, не uptraining |
| [Zhang & Sennrich, RMSNorm](https://arxiv.org/pdf/1910.07467) | Норма по среднему квадрату без вычитания среднего | LN и RMS сравниваются на одном векторе; постоянный сдвиг и центрирование явно различены |
| [Xiong et al., On Layer Normalization in the Transformer Architecture](https://arxiv.org/html/2002.04745v2) | Pre-LN и Post-LN задают разное место нормы относительно residual; в Pre-LN есть финальная норма модели | На одном вычисляемом FFN-подслое показаны оба порядка; финальная норма модели явно исключена |
| [Hugging Face Transformers, How caching works](https://huggingface.co/docs/transformers/main/cache_explanation) | Кэш по слоям, append K/V, последний Q, учёт длины прошлого в маске | Настоящий immutable append в численной функции, сверка с полным causal attention на каждом префиксе; счётчики строк, не тайминги |
| [Hugging Face Transformers, Generation strategies](https://huggingface.co/docs/transformers/main/en/generation_strategies) | Greedy и sampling как разные правила выбора токена | Управляемое число u для выборки; явные temperature, top-k, top-p и порядок фильтров |
| [Holtzman et al., The Curious Case of Neural Text Degeneration](https://arxiv.org/abs/1904.09751) | Nucleus sampling оставляет массу наиболее вероятных токенов | Минимальный префикс отсортированных кандидатов, покрывающий p, включает пороговый токен |
| [Hugging Face, Byte-Pair Encoding tokenization](https://huggingface.co/learn/llm-course/chapter6/5) | Частоты соседних пар при обучении и последовательное применение выученных merges | Отдельный символьный BPE без pre-tokenization/byte fallback; tie-break и неизвестные ID раскрыты |
| [Hendrycks & Gimpel, GELU](https://arxiv.org/abs/1606.08415); [Shazeer, GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202) | GELU и произведение двух ветвей gated FFN, одна с SiLU | Численный FFN 3→4→3 с tanh-приближением GELU, SiLU gate, локальными производными и явным числом весов |
| [Hu et al., LoRA](https://arxiv.org/abs/2106.09685) | Замороженная W₀ и обучаемое изменение BA малого ранга | Настоящий SGD LoRA/full на одной линейной задаче, начальная A≠0/B=0, held-out MSE и ограничение ранга; не benchmark LLM |
| [DeepSeek-V2](https://arxiv.org/abs/2405.04434) | KV latent и отдельный позиционный RoPE-компонент | Численный MLA KV-механизм с восстановлением K/V и поглощением проекций; query-compression и полная модель исключены |
| [Dao et al., FlashAttention](https://arxiv.org/abs/2205.14135) | Блочная обработка с устойчивым online softmax | Совпадение CPU/JS forward с полным контрольным attention и модель рабочей памяти; нет GPU kernel или замеров скорости |

## Важные математические уточнения

- Внутри реализации строки — позиции: `X[n,in] × W[in,out]`. Старый модуль `math.ts` использует другую ориентацию dense weights, поэтому его `linear` нельзя подставлять без транспонирования.
- `attentionTrace` возвращает raw scores, scaled scores, masked scores, weights и output. Наличие −∞ означает запрет до softmax. Маска не умножается на score и не заменяет запрет нулём. Это согласовано с исходной статьёй; схематичную запись `× mask` в HF cache docs не переносим в арифметику.
- В каждой строке должен оставаться хотя бы один разрешённый ключ. Softmax полностью замаскированной строки отклоняется как неопределённый в этой демонстрации; интерфейс не позволяет получить такую строку.
- Масштаб √dₖ и дополнительная температура — разные настройки. Attention temperature — учебный регулятор с default T=1; sampling temperature действует позже на logits словаря.
- RoPE реализован в adjacent-pair convention. Для ширины 4 скорости пар равны 1 и 1/100. Относительная инвариантность доказывается для фиксированных исходных q/k, не для произвольного полного запуска модели. Нет утверждения о монотонном падении score с расстоянием.
- MHA-пример намеренно имеет d_model=4, четыре головы ширины 2 и Wᴼ:8×4. Это допустимое матричное преобразование, хотя распространённое равенство d_model=h×d_head здесь не соблюдено. Размерности показаны пользователю.
- Нормализация считает статистику по признакам одной позиции. LN использует population variance. γ=1, β=0, epsilon=1e−5. RMSNorm не вычитает среднее.
- Кэш причинной головы совпадает с полным расчётом при неизменных весах/префиксе и одинаковых абсолютных RoPE-позициях. В реальных kernels возможна погрешность округления. Нельзя автоматически применять это объяснение к двустороннему encoder или изменённому префиксу.
- Teacher forcing использует вход `[<нач>, кот, спит, .]` и цели `[кот, спит, ., <кон>]`. Разрешённая диагональ не раскрывает следующий target. Численно проверены равенство parallel/prefix logits и отсутствие влияния будущих токенов на прошлые logits.
- Sampling: `softmax(logits/T) → top-k → renormalize → top-p → renormalize`. Нулевые вероятности не выбираются даже при u=0. Greedy не зависит от перечисленных sampling-параметров; tie-break — первый ID.

## Вычисляемые эксперименты и границы

Следующая таблица относится к базовому маршруту `#transformer`. Ограничения его отдельных глав не означают отсутствие соответствующего расчёта в новом `#advanced`.

| Раздел | Что действительно вычисляется | Что не заявляется |
|---|---|---|
| Токены | Lookup редактируемой таблицы, повторное использование строки, добавление PE | BPE и обучение embeddings вынесены в отдельные новые лаборатории; WordPiece не реализован |
| Attention | Редактируемые X/WQ/WK/WV, 5 промежуточных этапов, causal/padding, softmax, сумма V | Семантическое понимание подписанных слов; доказательство причинной важности attention weights |
| Головы | 4 разных Q-проекции, 1/2/4 общие KV-проекции, concat, Wᴼ, формула объёма KV | Качество MHA против GQA, преобразование pretrained checkpoint, измеренный speedup |
| Позиции | Sinusoidal PE и RoPE для 4 координат, сдвиг, расстояние, длины | Обучаемые P есть в новом маленьком Transformer; T5 relative bias и длинноконтекстная экстраполяция не реализованы |
| Блок | FFN 4→6→4 с ReLU, residual, pre/post и LN/RMS | В этой главе нет целого attention+FFN блока; его обучение и отдельный SwiGLU-расчёт есть в `#advanced` |
| Семейства | Self/cross projection, маска и attention на заданных состояниях | Полный encoder в этом разделе, запуск BERT/GPT/T5 |
| KV-cache | Пошаговое дописывание ключей/значений и полный контрольный путь, RoPE | Многослойный decoder, реальная производительность; браузер считает оба пути для сравнения |
| Генерация | Toy embeddings → causal attention → residual → logits; следующий токен меняет префикс; loss teacher forcing; отдельный SGD выходной головы на фиксированных causal-признаках | В sampling-демо FFN/нормы отсутствуют, обучение головы не меняет его веса; обучение целого блока вынесено в `#advanced`, pretrained языковой модели нет |

Разделы используют независимые маленькие модели. Состояние каждого раздела сохраняется при переключении внутри курса через mounted+hidden, но не сохраняется после перезагрузки страницы. Без новых зависимостей и без сетевых вызовов из учебных вычислений.

## Новый маршрут `#advanced`

Десять лабораторий доступны через `AdvancedArchitecturesCourse.tsx`: полное обучение маленького Transformer, BPE, ReLU/GELU/SwiGLU, LoRA/full, ViT, MoE, MLA, блочное attention, SSM/SSD/DeltaNet с гибридом и U-Net/DiT. Их точный охват собран в [docs/architectures.md](../docs/architectures.md#новые-архитектуры-и-обучение-advanced).

Маленький Transformer имеет одну causal-голову, pre-LN, d=4, FFN 4→8→4 с tanh и контекст до четырёх токенов. Скаляры в аналитическом графе суммируют градиенты по ветвям и потерям всех токенов: SGD изменяет E, обучаемые P, Q/K/V/O, обе нормы, FFN и голову. Train/validation используют разные тексты одного известного цикла; перенос на эти цели не доказывает языковое понимание.

BPE обучает символьные merges и применяет фиксированные правила к новому тексту без пересчёта его частот. Неизвестная кодовая точка сохраняется без словарного ID; промышленный byte-level tokenizer не воспроизводится. Отдельный FFN показывает обе ветви SwiGLU и производные: SiLU gate не ограничен [0;1], поэтому нельзя переносить трактовку sigmoid-затворов LSTM/GRU на SwiGLU.

LoRA/full действительно обучаются на одной задаче 8→3. В LoRA W₀ заморожена, α/r=1, A≠0 и B=0 в начале; совместный шаг использует старое состояние обоих факторов. Ранг r даёт 11r обучаемых весов против 24 full, так что r=3 уже не экономит веса. Rank-1 адаптер на rank-3 задаче оставляет наблюдаемый остаток MSE. Held-out не участвует в градиенте.

ViT/MoE/U-Net/DiT выполняют численный forward с ручными весами. ViT — патчи 4×4 изображения, без классификатора и CLS; MoE показывает top-k/capacity и реальные нагрузки, без обученной специализации. U-Net/DiT получают общие xₜ,t, предсказывают ε̂ и дают одношаговую оценку x̂₀; image denoiser не обучается и изображения не генерируются. MLA воспроизводит малый KV latent, SSM/SSD/Gated DeltaNet — рекуррентные ядра и заданную смесь с attention; это не полные DeepSeek/Mamba/Qwen-модели. Online softmax сравнивается с полным attention, но модель памяти не является измерением JS heap или GPU speedup.

## Историческая проверка базового курса

Рабочая копия: `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`; базовый HEAD: `9e6606aceacd9cf684996073499141b0fcd32028`, новые файлы в рабочем дереве. Windows PowerShell; bundled Node 24.19.0.

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/transformerMath.test.ts
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit
```

10 численных тестов прошли; TypeScript strict прошёл. Проверены известный численный ответ, суммы строк, маски и cache offset, большая величина logits, температура, RoPE, нормы, разделение KV, память, cached/full, sampling и teacher forcing. Визуальная проверка интегрированной страницы назначена основному агенту; успешная компиляция сама по себе не подтверждает вид на 320 px.

## Проверка расширения 2026-10-12

Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml/learning-lab`, база `417fb4f` с текущими рабочими изменениями; Windows PowerShell, bundled Node 24. Результат общей проверки: suite 293/293, strict `tsc --noEmit` и production build прошли. Проверяются полные и покоординатные градиенты, causal isolation, независимость held-out, Unicode BPE, SwiGLU-цепочка, LoRA rank residual, routing/patches, online/full attention, MLA reconstruction и адресная запись. [Отдельный журнал BPE/FFN/LoRA](../evidence/architecture-expansion/token-adaptation-note.md).

Все десять глав нового пакета проверены в настоящем браузере на desktop 1280×720 и mobile 320×800; подробности и скриншоты — в ../evidence/architecture-expansion/README.md. Успешные тесты и build не подтверждают внешний вид, клавиатурную работу или 320px-layout; прежние браузерные записи относятся к своим ревизиям.
