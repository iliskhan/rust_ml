# Приёмка VAE / GAN / diffusion / GNN / RL

2026-10-11 09:24 Europe/Moscow. Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`,
ветка `master`, проверенная рабочая копия поверх `009a58bb525e437da7a1cd5f9dfd73b70fcffcb5`.
Контрольная версия была отдельно отправлена в origin/master **до включения новых глав**;
её remote SHA подтверждён. Этот отчёт относится к исходникам в `advanced-validated-hashes.json`.

## Реализованный охват

Пять глав по пять разделов: VAE, GAN, diffusion, GNN, RL. Каждая содержит объяснение,
изменяемые расчёты, упражнения, источники и границы. Математический словарь расширен
с 30 до 51 понятия; добавлено 10 типов экспериментов. Карта: 24 темы, из них
18 interactive, 3 reading и 3 next. Основные маршруты загружают главы отдельно;
математические эксперименты новых карточек загружаются по запросу.

Работает настоящее маленькое обучение: linear Gaussian VAE (6 параметров),
GAN (две MLP 1→4→1), diffusion MLP (146 параметров, Adam), GCN (12 параметров),
Q-table episodes и точный градиент бинарной политики. Conditional GAN/WGAN,
image/latent diffusion/DiT, DQN/PPO/actor-critic объясняются с явными ограничениями.
CFG использует отдельный аналитический oracle. Все генеративные данные одномерны.

## Команды и окружение

Node v24.19.0, pnpm 11.25.0, Vite 7.3.7, Windows PowerShell `login:false`.
Из `learning-lab`, PATH включает bundled Node и fallback:

- `pnpm test`: **102 passed, 0 failed**, 685.9 ms; старые тесты также сохранены.
- `pnpm build`: strict TypeScript + production bundle; **без предупреждений**.
  Основной chunk 488.52 kB / 147.67 kB gzip, новые главы — отдельные chunks.
- `pnpm preview --port 5182 --strictPort`: loopback production QA; процесс принадлежит этой задаче.
- Прямой Rust/Cargo 1.87.0: fmt, Clippy all-targets/all-features `-D warnings`,
  debug/release по **52 теста + 5 doctests**, rustdoc `-D warnings`, четыре CI-примера — PASS.
  Cargo dependency commands `--locked --offline`; точные команды в `../work/legacy-regression.md`.

52 защищённых файла (33 Rust/manifests/examples, 19 старых учебных source/tests)
побайтно совпадают с checkpoint; diff этих путей пуст. App/карта/реестр понятий
намеренно расширены, старые вычисления, навигация, контекст, ui и CSS не менялись.

## Проверка настоящего интерфейса

Root CUA, production `http://127.0.0.1:5182/`, финальные assets `index-oIDUEiTV.js`.
Desktop при обычном viewport: все 25 разделов; mobile 320×800 и 390×844:
все 25 разделов открыты через штатную навигацию. Переполнения страницы и NaN/Infinity
в видимом тексте не обнаружены. После последней сборки повторены 25 разделов на desktop
и 390, прежние семь уроков и все восемь разделов Transformer на mobile.
Console error/warn: **0**. Числа интерфейса округлены; screenshots и наблюдения лежат рядом.

- VAE, 100 steps: NLL 0.795, KL 0.712, цель 1.507; веса реально изменяются.
- GAN, 50 cycles D:G=2: 100/50 updates; LD 1.306, LG 0.805, sample W₁ 0.446.
- Denoiser после 2000 updates обучен; новый запуск остановлен переходом к математике
  на шаге **2250**. После вложенных gradient/derivative счётчик остался 2250.
  Последняя фиксированная проверка на шаге 2200: MSE 0.328.
- DDIM η=0: разные unused reverse seeds дали одинаковый конечный x₀=1.435.
- GCN, 200 steps: loss **0.58621 → 0.01344**.
- Q-learning, 200 episodes; отдельная frozen оценка 100 episodes:
  цель **100/100**, ловушка 0, time limit 0, mean G 0.4717.
- Политика, 20 updates: θ=2.29266, J=0.87157.
- Все 10 новых видов math-experiments открыты и изменены на 320px.
  Диалоги помещаются в ширину, численные результаты конечны.
- Реальный путь **Bellman → conditional expectation → Bayes → likelihood → Gaussian →
  variance → expectation → probability** достиг уровня 8.
  Возврат к Bellman сохраняет p=1; Escape возвращает focus к исходной кнопке
  и window scroll **422.39999 → 422.39999** (320px).

При mobile QA обнаружено уменьшение GNN-подписей до 7.2px экранной высоты.
Исправлено: ResizeObserver + viewBox фактической ширины, на узком экране четыре ряда;
повторно проверено при 320px: SVG width≈241.6, viewBox width≈241.59,
font 18px имена / 12px признаки, экранная высота glyph 24px / 16px. Рёбра и числа
видны в `advanced-gnn-mobile.png`. Математика не менялась; повторные 102 tests/build PASS.
GAN KDE ограничен [−3.5,3.5], подписи предупреждают об отсечённых хвостах;
W₁ и доля считают все samples.

## Независимая проверка

Три Astra ultra реализовали непересекающиеся главы. Ещё Astra ultra независимо
проверил формулы, 81 ELBO-комбинацию, extreme training settings и цепочки предпосылок;
отдельный Astra ultra проверил Rust и SHA. В `../work/advanced-review.md`
сохранены условия и четыре исправленных текстовых замечания. Мобильную проблему
root обнаружил и перепроверил отдельно. Исследования: `../research/advanced-foundations.md`,
`vae-gan.md`, `diffusion.md`, `gnn-rl.md`.

## Git-передача

После приёмки: обычные commit/push в `origin/master`, без force/reset/stash.
Точный отправленный SHA фиксируется в корневом PROGRESS и сопроводительном сообщении
после подтверждения remote. CI на GitHub отдельно не объявляется успешным без наблюдения.
