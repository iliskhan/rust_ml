# VAE и GAN: источники, решения и проверяемые границы

Дата проверки источников: 2026-10-11. Текст объяснений написан для этого курса; числа, производные и траектории получены локальной реализацией, а не перенесены из статей.

## Первичные источники

| Источник | Проверенный механизм | Применение в главе |
| --- | --- | --- |
| [Kingma & Welling, Auto-Encoding Variational Bayes, 2013/2014](https://arxiv.org/abs/1312.6114), [PDF](https://arxiv.org/pdf/1312.6114) | §2.3–2.4: ELBO и reparameterization; §3 и Appendix B: Gaussian KL; Appendix C: Gaussian decoder и encoder с головами mean/log variance | Перепараметризованное обучение; аналитическая KL; отличие prior, approximate posterior и decoder likelihood |
| [Kingma & Welling, An Introduction to Variational Autoencoders, 2019](https://arxiv.org/abs/1906.02691) | Вероятностный взгляд на VAE, variational inference, расширения | Различие ELBO и likelihood; ограничения выбранных семейств распределений |
| [Higgins et al., β-VAE, ICLR 2017](https://openreview.net/forum?id=Sy2fzU9gl), [PDF](https://openreview.net/pdf?id=Sy2fzU9gl) | β меняет вес latent regularization относительно реконструкции | Реальный β в loss и градиенте, без обещания понятных независимых факторов при любом β. Прямой OpenReview временно выдавал browser challenge; индексированный текст оригинального PDF доступен поиском и подтверждает постановку |
| [Sohn et al., Learning Structured Output Representation using Deep Conditional Generative Models, NeurIPS 2015](https://proceedings.neurips.cc/paper/2015/hash/8d55a249e6baa5c06772297520da2051-Abstract.html) | Conditional variational model | CVAE объясняется; условный вход не реализован |
| [Goodfellow et al., Generative Adversarial Nets, 2014](https://arxiv.org/abs/1406.2661), [PDF](https://arxiv.org/pdf/1406.2661) | §3 eq.1 и Algorithm 1: чередование D/G; абзац после eq.1: non-saturating; §4: оптимальный D* и ограничения теории | Два отдельных градиента; обе цели G; условность вывода D=1/2 при равенстве распределений |
| [Mirza & Osindero, Conditional Generative Adversarial Nets, 2014](https://arxiv.org/abs/1411.1784) | Условие y передаётся G и D | Схема conditional GAN, явно обозначенная как объяснение |
| [Arjovsky, Chintala & Bottou, Wasserstein GAN, ICML 2017](https://proceedings.mlr.press/v70/arjovsky17a.html), [PDF](https://proceedings.mlr.press/v70/arjovsky17a/arjovsky17a.pdf) | Wasserstein-1, Lipschitz critic, weight clipping | WGAN объясняется отдельно от реально обучаемой BCE-GAN |
| [Gulrajani et al., Improved Training of Wasserstein GANs, 2017](https://arxiv.org/abs/1704.00028) | Gradient penalty на interpolated inputs critic | Формула WGAN-GP; нет заявления о доказанной глобальной Lipschitz-гарантии |

## Выбранные модели

### VAE

Шесть параметров `[a_mu,b_mu,a_logvar,b_logvar,w,b]`. `mu=a_mu*x+b_mu`, `logvar=a_logvar*x+b_logvar`, `z=mu+exp(logvar/2)*epsilon`, `p(x|z)=N(w*z+b, 0.4²)`, `p(z)=N(0,1)`.

Loss одной реализации: Gaussian reconstruction NLL + beta × analytic KL(q || prior). Gaussian NLL включает нормировочную константу; она может быть отрицательна для непрерывной плотности. Только ожидаемый loss при beta=1 является отрицательной ELBO. Одна случайная реализация loss сама не обязана быть bound. При beta≠1 интерфейс пишет Lβ.

Обучение: minibatch 16 из фиксированных 64 чисел, циклические индексы; новые детерминированные Box–Muller ε с seed=1009+step. Это воспроизводимый stochastic-gradient estimator. Оценка графика сделана на всей учебной выборке с **точным** ожиданием squared reconstruction residual: `(w*mu+b−x)² + w²*variance`. Это возможно только благодаря линейному Gaussian decoder.

Линейность выбрана осознанно: позволяет показать точный posterior и независимо проверить identity `−ELBO = marginal NLL + KL(q || true posterior)`. Семейство `p_theta(x)=N(b,w²+0.4²)` имеет один пик. Урок не утверждает, что этот предел присущ всем VAE. При генерации различаются mean decoder и полноценный sample с выходным Gaussian noise. Interpolation — между encoder means без добавочного шума.

### GAN

G и D — отдельные tanh MLP 1→4→1, по 13 параметров (input weight, hidden bias, output weight каждого нейрона + output bias). G выдаёт x; D выдаёт logit. Train data — 64 воспроизводимых числа из двух узких Gaussian-компонент около ±1.2. Проверочные latent samples — фиксированные 64 normal values. Это диагностика учебной выборки, не заявка на test-set generalization.

`LD = mean softplus(-D_logit(real)) + mean softplus(D_logit(fake))`: сумма двух средних, не половина; это явно отражено в UI. Для D параметры G остаются неизменны. Для G веса D зафиксированы, но `dD_logit/dx` используется в цепном правиле. Цели G: non-saturating `mean softplus(-s_fake)`, derivative `-sigmoid(-s_fake)`; minimax `-mean softplus(s_fake)`, derivative `-sigmoid(s_fake)`. Устойчивая BCE реализована через max/log1p, не через log округлённой sigmoid.

Эксперимент G/D действительно пересчитывает loss после обновлений; кривые не предзаданы. Эмпирическая W1 равных 1D выборок = mean absolute distance их отсортированных точек. Эта диагностика не входит в градиенты: модель не называется WGAN. «Почти один режим» — явно маркированный preset начальных весов, не фабрикация истории collapse. Mode coverage дополнительно описывается долей выходов слева от нуля и в промежутке между пиками; это не полноценная универсальная метрика качества.

### Общие инженерные границы

- Никаких новых dependencies, backend/API, таймеров и background training. Кнопки выполняют bounded batches, `useLearningActive()` блокирует обучение при неактивности.
- Состояние находится в родительской главе; разделы остаются смонтированы с `hidden`. Упражнения тоже остаются смонтированы. На мобильном native select вместо длинной полосы кнопок.
- CSS полностью scoped через `:is(.vae-course,.gan-course)`. Общие UI/стили/существующие уроки этот агент не менял.
- SGD ограничивает норму градиента до 10; |parameter|>30 вызывает диагностическую остановку. VAE максимум 2000 шагов; GAN максимум 2000 обновлений D+G. Хранятся последние 220/240 измерений; переключение β/objective начинает новый участок истории при сохранённых весах.
- Графики выборок — Gaussian KDE с bandwidth 0.18, явно подписанная; линии между точками не выдаются за аналитическую плотность. Точная Gaussian-плотность VAE показана отдельно.

## Проверки и наблюдения

Checkout: `C:/Users/lomaster/Desktop/dev/rust_ml/learning-lab`. Начальный прочитанный HEAD: `9e6606aceacd9cf684996073499141b0fcd32028`; root параллельно фиксирует предыдущую версию, поэтому эти проверки относятся к содержимому новых файлов в рабочей копии, а не только к HEAD.

- Bundled Node v24.19.0: `node --test tests/vaeGanMath.test.ts` — 12/12 pass.
- `pnpm typecheck` — pass после завершения обеих глав.
- Все 6 VAE gradients, 13 network gradients, input derivative, 13 discriminator gradients, 13 generator gradients для **обеих** целей — центральная разность с h=1e−5.
- Независимые ручные значения Gaussian KL, NLL, нулевого discriminator; аналитическое равенство ELBO gap и KL к точному posterior; BCE на ±1000, ненулевой маленький loss при +40.
- Реальное обучение VAE снижает точную ожидаемую цель на фиксированном seed. Separate D/G updates проверены на неизменность другой сети. Default GAN после 500 cycles при etaD=etaG=.06, D:G=2 уменьшает empirical W1; монотонность не утверждается.
- Проверка полного разрешённого горизонта: VAE beta=0/1/4 × eta=.005/.015/.06 по 2000 шагов — конечные веса/loss, clipping не понадобился. GAN обе цели × D:G=1/5 × eta=.005/.1 до суммарного лимита 2000 — конечные параметры и losses.
- Наблюдение: GAN eta=.03, D:G=2 даёт W1≈0.684 до обучения, ≈0.796 после 500 cycles, ≈0.237 после 1000; корректные градиенты не обещают монотонность. При выбранном UI default eta=.06 получены W1≈0.446 после 50 cycles, ≈0.245 после 500.
- Общий `pnpm test` в момент параллельной интеграции: 90 pass / 2 fail (`content-links`, `curriculum`) из-за расширения `.ts`, пропущенного в shared import `./advancedConcepts`; root уведомлён, shared не менялся этим агентом.
- Rendered desktop/mobile QA, вложенный concept navigation и integration build остаются за root; этот файл не заявляет визуальную проверку.
