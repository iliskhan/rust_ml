# Независимая проверка architecture training

**PASS** на проверенном снимке; actionable P1/P2 не обнаружены. Проверка read-only: исходники не изменялись. Дата: 2026-10-12 15:11 MSK (UTC+03:00).

Checkout: `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`; HEAD `035866823921e15656c87484f092d508dc194f6c`, branch `codex/ui-ux-learning-lab`. Проверенные новые файлы ещё не входили в HEAD; SHA-256 снимка:

- `learning-lab/src/architectureTrainingMath.ts`: `1A54F7EE47C0984964D9A0BAE1A5F9F686A2774A3AB6E5B7B3EFCED4E4A75CAB`.
- `learning-lab/src/ArchitectureTrainingLabs.tsx`: `E0A9C603583EADB6DE82CD0C05EAE93EDCB58D6FDD7B886432225945F7DF0ADE`.
- `learning-lab/tests/architectureTrainingMath.test.ts`: `34AE0B997DE331C04C9FC8B471F4BF32AA48E9179FC0A5A1A708AB66D2DF1112`.

## Механика и проверенные градиенты

Reverse-mode tape корректно суммирует повторные пути к параметру; softmax стабильный, detached максимум даёт верные производные. Весь параметрический массив передаётся в обычный SGD. Размеры групп соответствуют UI: ViT 40, soft-MoE 8, SSM 9, U-Net 25, DiT 128 (всего 210).

В дополнение к исходным 8 tests выполнена независимая проверка **всех 210 параметров** центральными разностями h=1e−5 на других весах и вручную заданных данных. Максимальная абсолютная ошибка `1.2763355042993973e−11` при допуске 2e−7.

Условия независимого прогона:

- Initial seed 73; каждый вес дополнительно изменён на `0.037*cos(1.17*i)`.
- ViT sample image `[[.4,-.7,.2,.8],[-.6,.3,.9,-.2],[.1,.8,-.5,.2],[-.9,.7,-.2,.6]]`, label=1.
- MoE sample batch `(x,target)=[(-1.2,1.5),(.15,-.2),(1.4,.8)]`, balance=.43.
- SSM input `[.3,-.2,.5,-.1]`, target=.37; длина 4 вместо исходных шести шагов.
- Denoisers t=7, noisy[i]=`.9*sin(.8*i+.2)`, noise target[i]=`.7*cos(.45*i-.1)`. FD проверяет objective для произвольных конечных входов; этот sample специально не считается реализацией forward diffusion.

Независимые ручные расчёты:

- ViT с нулевыми весами: CE=ln(2), head-bias gradients `[.5,-.5]`, все остальные gradients=0 на выбранном sample.
- MoE параметры `[0,0,0,0,2,1,-1,-.4]`, x=.3, target=1: expert outputs 1.6 и −.7, soft output=.45, MSE=.3025, balance=0; router-bias derivatives `[−.6325,.6325]`, router-slope `[−.18975,.18975]`. Совпали с tape.
- SSM четыре шага: последний output совпал с `Σ Cj*Bj*.7*tanh(aj)^3` для отдельно заданных девяти весов.
- У обоих denoisers при нулевом epsilon predictor весь DDIM процесс даёт `x0 = 10*x8`, поскольку alphaBar8=.01. Совпало для всех 16 координат с допуском 1e−10.
- При фиксированных входе и весах outputs обоих denoisers различаются для t=1 и t=8: time conditioning действительно участвует в forward.

## Objective, split и sampling

- **ViT:** patch/position/QKV/FFN/head участвуют в loss и меняются в обучении. Squared pooling, отсутствие CLS/LayerNorm и ограничения синтетической задачи явно подписаны. Train/validation имеют новые noise/amplitude realization для знакомых ориентаций; это не заявлено как generalization на новые классы.
- **MoE:** loss = MSE + lambda*(2*sum(mean p)^2−1). Это importance balance, не hard-load Switch auxiliary loss. Баланс даёт градиент router и не даёт прямого градиента affine experts; soft mixture и inference top-1 показаны отдельно. Train x сетка смещена от held-out на .1; exact sample overlaps 0.
- **SSM:** loss только последнего output; derivative проходит через всю рекурсию, A=tanh(a), B и C обучаются. Held-out uses separate RNG stream. Exact sample overlaps 0. Предел фиксированных six-step sequence и отсутствие selective Mamba gates указаны.
- **U-Net:** kernel/time/bias обоих conv и skip/up decoder weights реально участвуют в graph. Average pool, nearest upsample и zero padding соответствуют UI.
- **DiT:** patch/position/time-scale+shift/QKV/FFN/head реально участвуют в graph. Patch assembly корректно возвращает 16 output pixels. Отсутствие original adaLN-Zero/LayerNorm, VAE и class conditioning указано.
- **Denoisers:** train 32 и validation 16 имеют другие noise draws для тех же двух clean patterns, каждый t=1…8 присутствует. Это честно описано как новые шумы. DDIM eta=0 использует actual epsilon model на каждом из восьми iterates, правильную alphaBar текущего/предыдущего t и не обрезает вычисленные pixels. Display saturation описана отдельно.

Дополнительно для U-Net/DiT выполнены sweeps eta=.06/.2 до 1000 SGD с оценкой validation и sample seed701 после каждого optimizer step. Расчёты finite; exceptions отсутствовали. Наблюдённый максимальный |sample pixel| за sweep (включая слабые ранние веса) ≤20.0651. Этот sweep не устанавливает качество генерации и не доказывает отсутствие проблемы на каждом seed/rate; UI честно допускает плохие сэмплы.

## UI и async проверка

Source inspection: обучение дробится по четыре optimizer step через timeout. Cleanup очищает таймер на dependency change/unmount; потеря LearningActivity останавливает очередь. Stop/reset меняют remaining и очищают следующий scheduled timeout. Смена U-Net/DiT через keyed body сбрасывает hook state. Rate/balance могут менять следующий batch, история MSE при этом остаётся фактической. У ошибок обучения есть alert и остановка; семантические подписи reference/objective не перепутаны.

**Ограничение:** runtime stop/reset/unmount, реальные rendered desktop/320px, focus и визуальная читаемость не проверялись; основной агент выполняет browser QA. Полный build не запускался по границам делегирования. Source inspection не заменяет runtime UI validation. На момент проверки нет actionable source finding, требующего изменения.

## Команды и среда

Windows PowerShell, cwd `learning-lab`, Node v24.19.0:

```powershell
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/architectureTrainingMath.test.ts
```

Результат 8/8 PASS, 0 fail, duration ~417ms. Independent FD/handcalc/sweep запускались inline через `--input-type=module -e $trainingReviewScript` / `$trainingSweepScript`, импортировали только `./src/architectureTrainingMath.ts`; source/test files и сервер не менялись. После интеграционных изменений сравнить hashes и повторить затронутые проверки.
