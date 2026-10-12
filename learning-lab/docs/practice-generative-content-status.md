# Генеративные модели, GNN и RL: авторская практика

Checkpoint 2026-10-12 17:12 +03:00, Europe/Moscow. Checkout `C:/Users/lomaster/Desktop/dev/rust_ml`,
branch `codex/practice-implementation`, base `212a6ef4d3baebb83b41bd20a53a069f4358a2e4`.

В `src/practice/generative-catalog.ts` подготовлены 25 inventory units маршрутов
vae/gan/diffusion/gnn/rl, 75 упражнений (guided + transfer A/B), каждый с численным
fixture, quiz, формулой, контрактом, подсказками и самостоятельными Python/JS/Rust
starters и solutions. Это локальная формативная практика; grading не включён,
прохождение quiz не означает authoritative mastery.

Границы фрагментов явно указаны: VAE train — четыре локальные производные по
mu/log variance/decoder w,b (observation sigma=1, NLL без постоянной); GAN — affine
модели вместо полного MLP; GNN train — masked binary CE и dlogits; Bellman — один
state с двумя действиями и двумя исходами; PPO — один clipped objective term.
Эти units имеют опубликованный поднавык, но полный capstone каждой темы не заявлен.
Graph self-loop convention: простой бинарный граф, диагональ устанавливается в 1;
существующие loops не удваиваются (в отличие от буквального weighted A+I).

Проверено на этом рабочем дереве до общего commit:

- `node --test learning-lab/tests/practice-generative.test.ts` с
  `PRACTICE_VERIFY_ALL_LANGUAGES=1`: **12/12 PASS**, без skipped. Все 75 публичных
  fixtures выполнены JavaScript, Python и Rust; по каждой теме реально выполнены
  nonfinite и отдельный domain-error case (Python/JS 50 cases, Rust 150, поскольку
  проверяются все три автономных исходника каждой темы).
- Независимые central finite differences VAE по mu/log variance/w/b, GAN по g/b
  и двухступенчатому D→G update, epsilon-MSE и masked CE по predictions/logits;
  exact mixture moments; posterior DDPM oracle через коэффициенты x0/xt;
  final-step recovery, DDIM skip composition, CFG affine identity; GNN relabeling
  equivariance и sqrt-degree fixed point; terminal/truncated combinations;
  REINFORCE exact expectation/variance при разных baselines, signed PPO clipping.
- JS harness дополнительно проверяет отсутствие mutation входов. Исполняется только
  импортированный авторский код, harness не принимает learner draft.
- Исправлены неверная сумма одного VAE fixture и Rust iterator reference в coverage.
  DDPM contract сужен до beta∈[1e−6,1−1e−6], previous_bar∈[1e−6,1], чтобы положительный
  beta=1e−20 не округлял 1−beta до 1 и не создавал деление на ноль; этот вход реально
  отклоняется всеми тремя solutions.

Команда из корня checkout (PowerShell):

```powershell
$env:PRACTICE_VERIFY_ALL_LANGUAGES='1'
$env:PRACTICE_PYTHON='C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:PRACTICE_RUSTC='C:/Users/lomaster/.rustup/toolchains/stable-x86_64-pc-windows-msvc/bin/rustc.exe'
& 'C:/Users/lomaster/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test learning-lab/tests/practice-generative.test.ts
```

Runtime: Node v24.19.0, Python 3.12.14, Rust 1.87.0 (установленный direct compiler).
Следующий шаг: root подключает `generativePracticeTopics` в aggregate, повторяет
единый tsc/full suite и browser QA. Общие PLAN/PROGRESS, UI, Git commit/push ведёт root.
