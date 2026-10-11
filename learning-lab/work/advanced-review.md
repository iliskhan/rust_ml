# Независимое ревью расширенных глав

Снимок: 2026-10-11 09:02 Europe/Moscow. Проверка выполняется read-only, кроме этого файла. Владелец интеграции и браузерного QA — root.

## Область и состояние

- Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml`; `.git/HEAD` указывает на `master`, файл ref содержит `009a58bb525e437da7a1cd5f9dfd73b70fcffcb5`. Git-команды не выполнялись.
- Проверены VAE/GAN/GNN/RL UI, `vaeGanMath.ts`, `diffusionMath.ts`, `gnnMath.ts`, `rlMath.ts`, `advancedConcepts.ts`, `advancedConceptMath.ts`, новые тесты, сохранённый механизм nested math-return.
- После сообщения root о готовности интеграции дополнительно проверены App с 15 routes, пять interactive curriculum topics, десять AdvancedConceptLesson demos и полная DiffusionCourse. Рендер и браузер не проверялись.

## Подтверждённые замечания

1. **Исправлено root, проверено:** `src/advancedConcepts.ts:137`, `policy-gradient.observe` обещал ручной logit и sampled policy, которых нет в `RLCourse.tsx:57`–64. Теперь описывает реализованные изменения наград и точные шаги θ без случайных эпизодов.
2. **Исправлено root, проверено:** `src/advancedConcepts.ts:138` безусловно утверждал, что независимый от действия baseline снижает дисперсию. Теперь правильно уточнено «при удачном выборе может снизить». Независимость сохраняет ожидание, а снижение дисперсии зависит от выбора baseline. Контрпример: p=0.5, награды [−0.4, 1], оценка `(a−p)(r−b)`; Var=0.0225 для b=0 и 2485.0225 для b=100, expectation обоих 0.35. [Вывод policy gradient и baseline в OpenAI Spinning Up](https://spinningup.openai.com/en/latest/spinningup/rl_intro3.html).
3. **Исправлено root, проверено:** `src/advancedConcepts.ts:95`, `adjacency-matrix.observe` обещал таблицу и рисунок, хотя `Graph` demo показывает числа и передачу признаков. Теперь observe описывает изменение ребра и среднего, а за полной матрицей направляет в GNN.
4. **Исправлено root, проверено:** `src/curriculum.ts:110` обещал объяснение DCGAN, которого не было. Теперь перечислены действительно объяснённые WGAN и conditional GAN.

## Проверенные результаты

Среда: PowerShell, Node по абсолютному пути `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`. CWD всех numerical команд — `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`.

- `node --test tests/vaeGanMath.test.ts tests/diffusionMath.test.ts tests/gnnMath.test.ts tests/rlMath.test.ts tests/advancedConceptMath.test.ts` → **45 passed, 0 failed**.
- `node --test tests/*.test.ts` → **99 passed, 0 failed**. Включены прежние уроки, валидность concept-links и prerequisite DAG, четыре теста возврата по вложенному пути.
- После готовности интеграции: `node --test tests/content-links.test.ts tests/curriculum.test.ts tests/learning-navigation.test.ts tests/advancedConceptMath.test.ts` → **19 passed, 0 failed**.
- Независимый обход всех prerequisite paths новых понятий: максимальная длина **8**, равна `MAX_CONCEPT_DEPTH`. Две самые длинные цепочки: `markov-chain/bellman-equation → conditional-expectation → bayes-rule → likelihood → gaussian → variance → expectation → probability`. Все шаги открываются reducer без срезания пути; остальные новые корни имеют длину не более 7.
- Проверка ELBO UI bounds: x,μ∈{−2,0,2}, τ∈{.2,.7,2}, σ∈{.1,.7,2}, **81 комбинация**. Все значения конечны, gap≥−1e−12; максимальная ошибка `gap=KL(q||posterior)` — 2.842170943040401e−14. Параметры exact posterior всегда внутри slider bounds, и кнопка делает gap нулевым с точностью 1e−12. Малые отрицательные округления exact gap объясняют отображение через max(0,gap).
- Независимый inline numerical sweep без создания файлов: VAE по β∈{0, .25, 1, 4}, η∈{.005, .015, .06}, 2000 шагов на комбинацию — параметры и loss конечны, safeguards не остановили ни один из 12 запусков.
- Diffusion: оба расписания, η∈{.001, .003, .01, .03}, 2000 Adam updates и 64 DDPM samples на комбинацию — все конечны. `ᾱ64=0.0020746753` linear, `0.0038409759` cosine. Это близкий к N(0,1), но не точно стандартный финальный marginal.
- GCN: исходный, пустой и полный графы при η∈{.01,.2,1}, 1000 updates — все конечны. Полный граф закономерно стирает различимость классов и остаётся на CE=log(2); это не дефект оптимизатора.
- RL: γ∈{0,.9,.99}, slip∈{0,.6}, stepReward∈{−.2,.1}, по 1000 Q episodes при α=ε=1 — все конечны. При γ=.99 и положительной stepReward 2000 Bellman sweeps не достигают 1e−10, `converged=false` и UI честно показывает лимит.
- GAN: обе цели, ηD,ηG∈{.005,.1}, D:G∈{1,5}, до 2000 суммарных updates — **16 запусков** с конечными параметрами/метриками, safeguards не останавливали их.
- Проверка SHA256 по `evidence/advanced-baseline-hashes.json` на этом снимке показала изменения только `PROGRESS.md`, `src/ConceptLesson.tsx`, `src/concepts.ts`; остальные зафиксированные legacy файлы, включая Rust, не изменены. Интеграция root может позднее изменить ожидаемые shared файлы.

## Математика и заявленные пределы

- VAE: reparameterized градиенты, Gaussian KL и точный negative-ELBO gap согласованы. Single sample явно отличается от ожидания; β≠1 не называется обычной −ELBO. Генерация включает decoder noise, линейный marginal честно ограничен одним Gaussian. [Kingma & Welling, equations 1–7](https://arxiv.org/html/1312.6114).
- GAN: отдельно усредняются real/fake, замороженная D всё ещё передаёт производную по входу, minimax/non-saturating знаки правильны. W1 — только диагностика равных эмпирических выборок; модель не выдаётся за WGAN. Заданный collapsed start не выдаётся за результат обучения.
- Diffusion math: forward marginal и Markov path различаются; posterior variance использует β̃, t=1 исключает добавочный шум; DDIM eta=0 использует отдельную формулу. Аналитический `optimalEpsilon` — условное среднее, а не реализованный шум конкретного sample. [Ho et al., DDPM](https://arxiv.org/html/2006.11239).
- GCN: нормировка симметричная, не row stochastic; masked CE не использует held-out labels; обучаются обе W. Сглаживание измеряет h/√degree, а не ошибочно обещает одинаковые сырые строки. GAT и mean-GraphSAGE явно демонстрационные.
- RL: terminal reward выплачивается при входе, terminal bootstrap равен нулю, administrative truncation bootstrap сохраняется; Q evaluation использует отдельный seed и α=0. [Gymnasium: Handling Time Limits](https://gymnasium.farama.org/tutorials/gymnasium_basics/handling_time_limits/).
- Diffusion UI: effect cleanup удаляет timer, inactive/уход из секции обнуляет remaining; schedule change сбрасывает модель; чистый updater не удваивает RNG при StrictMode replay. Аналитическое CFG отдельно от обучаемой безусловной сети, true-noise режим отдельно от генерации. Histogram учитывает выход за окно без перенормировки.
- Layout source review: новые CSS scoped, секции сохраняют mount через hidden, mobile navigation native select, таблицы имеют overflow containers. `.concept-flow` поддерживает перенос. Это проверка исходников; фактическую читаемость подтверждает только отдельный rendered QA root.
- Неблокирующий предел визуализации GAN: KDE вычисляется только на [−3.5,3.5]. При minimax, ηD=.005, ηG=.1, D:G=1 после 2000 updates вне окна находятся 11/64 примеров, max |x|=3.9599746728551675. W1 считает полные выборки, а график G(z) раскрывает диапазон, но у KDE полезно явно подписать ограниченность окна; root уведомлён.

## Следующее действие

Численная и source-проверка интеграции закончена; все четыре подтверждённых текстовых замечания исправлены root и перечитаны. Открытых блокирующих дефектов не обнаружено. Root получил неблокирующее наблюдение об окне KDE. Финальные typecheck/build, actual desktop/mobile QA и commit/push остаются у root; отсутствие рендер-проверки здесь не выдаётся за её прохождение.

### Подтверждённое завершение root, 09:31 MSK

Окно GAN KDE теперь подписано во всех трёх графиках. Root проверил 25 разделов
desktop/320/390 и 10 новых math-демонстраций, реальные train/eval и return глубины 8.
GNN-подписи после найденного mobile-дефекта адаптированы без изменения расчётов.
102 tests и build PASS; console error/warn 0. Главы отправлены commit
121cfa0c576c57c82c74d17d3894b8a792bba8c7, remote SHA совпал.
Финальная сверка 52 source/config/test из validated manifest: все SHA совпали.
Полный протокол — `../evidence/ADVANCED.md`; прежние выводы выше относятся к моменту ревью.
