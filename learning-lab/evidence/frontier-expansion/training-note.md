# Обучение существующих архитектур — передача интегратору

Дата: 2026-10-12, Europe/Moscow. Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`, исходная ревизия `0358668`, ветка `codex/ui-ux-learning-lab`.

## Файлы и интеграция

Созданы только согласованные файлы:

- `learning-lab/src/architectureTrainingMath.ts`
- `learning-lab/src/ArchitectureTrainingLabs.tsx`
- `learning-lab/src/architecture-training.css`
- `learning-lab/tests/architectureTrainingMath.test.ts`
- эта запись.

UI exports: `VitTrainingLab`, `MoeTrainingLab`, `SsmTrainingLab`, `DenoiserTrainingLab`. CSS импортируется компонентом. Общие маршруты, источники, PLAN/PROGRESS, commit/push выполняет основной агент; существующие math/lab не изменены. Используется существующий `imagePatches`.

## Что именно обучается

Все модели используют аналитический scalar reverse-mode autodiff и обычный SGD. Tape хранит локальные производные суммы, произведения, tanh, exp, log и reciprocal; параметры суммируют все повторные пути backward. Конечные разности используются только для независимой проверки в тестах. Это локальный малый tape: существующий Transformer tape закрыт в своём модуле, общий модуль менять не разрешено. Новых зависимостей нет.

- **ViT, 40 параметров**: 4 патча 2×2 изображения 4×4, patch projection 4→2, позиции 4×2, Q/K/V 2×2, residual attention, tanh-FFN 2→2+bias с residual, pooling mean(h²), head 2→2+bias, CE. Нет LayerNorm/CLS; quadratic pooling — явно описанное учебное отличие. Train 16 и validation 8 независимых амплитуд/шумов двух ориентаций полос; проверяется знакомое правило, не естественные изображения.
- **MoE, 8 параметров**: affine router с двумя logits, два affine эксперта, soft mixture. Обучается MSE для |x| + λ·(2Σ mean(p_e)²−1). Balance — importance penalty, НЕ Switch hard-load auxiliary loss. На train оба эксперта вычисляются; sparse savings отсутствуют. В UI отдельно показываются soft-load, число top-1 побед, обе экспертные функции, soft и hard-top-1 validation MSE. Hard top-1 — только сравнительный inference, не подмена процедуры обучения.
- **SSM, 9 параметров**: диагональные A=tanh(a), B, C по три компоненты; h_t=A h_prev+B x_t, y_t=C h_t. Loss только на последнем из шести выходов, цель — первый сигнал, последующие входы — малые помехи. Полный BPTT через шесть обновлений; no truncation. Train 12, validation 8 независимых последовательностей. Это дискретная диагональная SSM без input-dependent selective Mamba gates.
- **U-Net, 25 параметров**: один канал, 3×3 zero-padding convolution+t+bias → tanh; average pool 4×4→2×2; bottleneck 3×3 convolution+t+bias → tanh; nearest upsampling; concatenation с encoder skip; learned 1×1 decoder (два веса+bias). Все kernels/time/decoder обучаются.
- **DiT, 128 параметров**: четыре патча 2×2, d=4, patch/position, learned time-dependent scale/shift, QKV attention + residual, tanh-FFN 4→4+bias + residual, output patch projection 4→4+bias. Нет LayerNorm/adaLN-Zero, VAE или class conditioning. Обучается весь вариант.

Оба denoiser предсказывают ε из x_t; αbar_t=.01^(t/8), t=1…8. Train 32 фиксированных pairs, validation 16 других Gaussian noise realizations для тех же двух чистых узоров. Batch 4 по кругу. Independent validation означает новые шумы, не новые классы. Обратный процесс — 8 детерминированных DDIM eta=0 шагов от нового Gaussian noise, с новым epsilon prediction на каждом шаге. В математике clipping отсутствует; только цвет пикселей насыщается при |x|≥1, рядом точные числа. Слабые веса могут давать плохой сэмпл: UI это поясняет.

## Проверенные результаты

Среда: Windows PowerShell; Node `C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` v24.19.0; cwd `learning-lab`.

Команды:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/architectureTrainingMath.test.ts
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit
```

Финальный прогон: 8/8 tests PASS, 0.50 s; TypeScript PASS. Проверяются все 210 параметрических градиентов central differences; для SSM дополнительно явная формула производной импульса B·x0·A⁵, для affine MoE и нулевых denoisers — аналитические формулы градиентов. Проверяются изменение каждой группы параметров, held-out improvement, soft/hard difference, balance gradient, finite/reproducible DDIM и явная формула каждого reverse step.

Детерминированные результаты defaults (отдельный вычислительный прогон тех же учебных шагов):

| Модель | Шагов | η | Validation до | Validation после |
|---|---:|---:|---:|---:|
| ViT | 80 | 0.12 | CE 0.693563; accuracy 50% | CE 0.071233; accuracy 100% |
| MoE | 200 | 0.12 | MSE 0.335979 | MSE 0.005689 |
| SSM | 100 | 0.15 | MSE 0.516541 | MSE 0.006578 |
| U-Net | 160 | 0.06 | noise MSE 1.016632 | noise MSE 0.141037 |
| DiT | 160 | 0.06 | noise MSE 0.942317 | noise MSE 0.178302 |

## Интерфейс и оставшаяся проверка

Русский текст, обычные native buttons/select/Range, train/validation curves с численными данными, выбор validation sample, backward inspector каждого параметра, изображения/матрицы/точные числа, кнопки train/stop/reset. Обучение разбивается по 4 шага через setTimeout(0), останавливается при unmount или потере LearningActivity; лимит 1000 шагов. При смене denoiser архитектуры веса сбрасываются, это указано в UI.

На момент записи browser desktop/mobile, проверка встроенных маршрутов и общий build остаются за интегратором. Эта запись не утверждает визуальную валидацию. Нужны rendered screenshots/controls at desktop и 320px, проверка обеих архитектур denoiser и stop/reset.

## Источники и пределы

Прочитаны primary abstracts 2026-10-12: [ViT](https://arxiv.org/abs/2010.11929), [Switch Transformers](https://arxiv.org/abs/2101.03961), [DDIM](https://arxiv.org/abs/2010.02502), [DiT](https://arxiv.org/abs/2212.09748). UI ссылается на них как на исходные семейства; приведённые выше сети — собственные явно обозначенные малые учебные варианты, а не reproduction этих промышленных моделей или их published benchmark.
