# Исследование для пошагового курса Transformer

Проверено 2026-10-11. Реализация: `src/TransformerCourse.tsx`, `src/transformerMath.ts`, `src/transformer-course.css`. Только первичные статьи и официальная документация. Интерфейс показывает самостоятельно написанные объяснения и диаграммы; изображения из статей не копируются.

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

| Раздел | Что действительно вычисляется | Что не заявляется |
|---|---|---|
| Токены | Lookup редактируемой таблицы, повторное использование строки, добавление PE | Настоящий BPE/WordPiece, обучение embeddings |
| Attention | Редактируемые X/WQ/WK/WV, 5 промежуточных этапов, causal/padding, softmax, сумма V | Семантическое понимание подписанных слов; доказательство причинной важности attention weights |
| Головы | 4 разных Q-проекции, 1/2/4 общие KV-проекции, concat, Wᴼ, формула объёма KV | Качество MHA против GQA, преобразование pretrained checkpoint, измеренный speedup |
| Позиции | Sinusoidal PE и RoPE для 4 координат, сдвиг, расстояние, длины | Обучаемые абсолютные PE, T5 relative bias и длинноконтекстная экстраполяция |
| Блок | FFN 4→6→4 с ReLU, residual, pre/post и LN/RMS | Целый attention+FFN блок; SwiGLU только описан |
| Семейства | Self/cross projection, маска и attention на заданных состояниях | Полный encoder в этом разделе, запуск BERT/GPT/T5 |
| KV-cache | Пошаговое дописывание ключей/значений и полный контрольный путь, RoPE | Многослойный decoder, реальная производительность; браузер считает оба пути для сравнения |
| Генерация | Toy embeddings → causal attention → residual → logits; следующий токен меняет префикс; loss teacher forcing | Обученная языковая модель, обучение весов; FFN и нормы намеренно отсутствуют |

Разделы используют независимые маленькие модели. Состояние каждого раздела сохраняется при переключении внутри курса через mounted+hidden, но не сохраняется после перезагрузки страницы. Без новых зависимостей и без сетевых вызовов из учебных вычислений.

## Проверка

Рабочая копия: `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`; базовый HEAD: `9e6606aceacd9cf684996073499141b0fcd32028`, новые файлы в рабочем дереве. Windows PowerShell; bundled Node 24.19.0.

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/transformerMath.test.ts
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit
```

10 численных тестов прошли; TypeScript strict прошёл. Проверены известный численный ответ, суммы строк, маски и cache offset, большая величина logits, температура, RoPE, нормы, разделение KV, память, cached/full, sampling и teacher forcing. Визуальная проверка интегрированной страницы назначена основному агенту; успешная компиляция сама по себе не подтверждает вид на 320 px.
