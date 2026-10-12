import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Chart, Exercise, Range, fmt } from './ui';
import { useLearningActive } from './learning-context';
import {
  initialArchitectureParameters, trainingGroups, architectureSgd, meanArchitectureGradients,
  visionTrainingData, vitTrainingTrace, evaluateVit, moeTrainingData, moeTrainingTrace,
  ssmTrainingData, ssmTrainingTrace, evaluateSsm, denoisingTrainingData, denoisingAlpha,
  denoiserTrainingTrace, evaluateDenoiser, sampleDenoiser,
  type TrainingFamily, type DenoiserKind,
} from './architectureTrainingMath';
import './architecture-training.css';

const visionTrain = visionTrainingData('train'), visionValidation = visionTrainingData('validation');
const moeTrain = moeTrainingData('train'), moeValidation = moeTrainingData('validation');
const memoryTrain = ssmTrainingData('train'), memoryValidation = ssmTrainingData('validation');
const noiseTrain = denoisingTrainingData('train'), noiseValidation = denoisingTrainingData('validation');
function losses(family: TrainingFamily, p: number[]) {
  if (family === 'vit') return [evaluateVit(p, visionTrain).loss, evaluateVit(p, visionValidation).loss];
  if (family === 'moe') return [moeTrainingTrace(p, moeTrain, 0, false).mse, moeTrainingTrace(p, moeValidation, 0, false).mse];
  if (family === 'ssm') return [evaluateSsm(p, memoryTrain), evaluateSsm(p, memoryValidation)];
  return [evaluateDenoiser(family, p, noiseTrain), evaluateDenoiser(family, p, noiseValidation)];
}
function trainingGradient(family: TrainingFamily, p: number[], step: number, balance: number) {
  if (family === 'vit') return meanArchitectureGradients(visionTrain.map(s => vitTrainingTrace(p, s)));
  if (family === 'moe') return moeTrainingTrace(p, moeTrain, balance).gradients;
  if (family === 'ssm') return meanArchitectureGradients(memoryTrain.map(s => ssmTrainingTrace(p, s)));
  return meanArchitectureGradients(Array.from({ length: 4 }, (_, i) => denoiserTrainingTrace(family, p, noiseTrain[(step * 4 + i) % noiseTrain.length])));
}
function newRun(family: TrainingFamily) {
  const parameters = initialArchitectureParameters(family), [train, validation] = losses(family, parameters);
  return { parameters, steps: 0, history: [{ step: 0, train, validation }] };
}
function useTraining(family: TrainingFamily, rate: number, balance = .05) {
  const active = useLearningActive(), [run, setRun] = useState(() => newRun(family));
  const [remaining, setRemaining] = useState(0), [error, setError] = useState('');
  useEffect(() => {
    if (!active) { setRemaining(0); return; }
    if (!remaining) return;
    // Yield after four optimizer steps, so Stop and the rest of the lesson remain usable.
    const timer = window.setTimeout(() => {
      try {
        const count = Math.min(4, remaining);
        let parameters = run.parameters;
        for (let i = 0; i < count; i++) parameters = architectureSgd(parameters, trainingGradient(family, parameters, run.steps + i, balance), rate);
        const [train, validation] = losses(family, parameters), steps = run.steps + count;
        setRun({ parameters, steps, history: [...run.history, { step: steps, train, validation }] });
        setRemaining(remaining - count);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Расчёт остановлен.'); setRemaining(0); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, remaining, run, family, rate, balance]);
  return { ...run, remaining, error, start: (count: number) => { setError(''); setRemaining(Math.min(count, 1000 - run.steps)); }, stop: () => setRemaining(0), reset: () => { setRemaining(0); setError(''); setRun(newRun(family)); } };
}
type Run = ReturnType<typeof useTraining>;
function Table({ title, columns, rows }: { title: string; columns: string[]; rows: ReactNode[][] }) {
  return <div className="atr-table" tabIndex={0} role="region" aria-label={`${title}. Прокручиваемая таблица`}><table className="data-table"><caption>{title}</caption>
    <thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((x, j) => j === 0 ? <th key={j} scope="row">{x}</th> : <td key={j}>{x}</td>)}</tr>)}</tbody></table></div>;
}
function Controls({ run, rate, setRate, count, label }: { run: Run; rate: number; setRate: (n: number) => void; count: number; label: string }) {
  const last = run.history.at(-1)!;
  return <>
    <Range label={`Шаг SGD ${label}`} value={rate} min={0} max={.2} step={.01} onChange={setRate} />
    <div className="button-row"><button disabled={!!run.remaining || run.steps >= 1000} onClick={() => run.start(1)}>1 шаг SGD</button><button disabled={!!run.remaining || run.steps >= 1000} onClick={() => run.start(count)}>{count} шагов SGD</button><button disabled={!run.remaining} onClick={run.stop}>Остановить</button><button onClick={run.reset}>Сбросить веса</button></div>
    <p role="status">Шаг {run.steps}{run.remaining ? ` · осталось ${run.remaining}` : ''}. Train {label === 'ViT' ? 'CE' : 'MSE'}: <strong>{fmt(last.train, 5)}</strong>; validation: <strong>{fmt(last.validation, 5)}</strong>.</p>
    {run.error && <p role="alert">{run.error}</p>}
    <Chart xLabel="Шаг SGD" yLabel={label === 'ViT' ? 'Cross-entropy' : 'MSE'} series={[{ name: 'Train', points: run.history.map(s => ({ x: s.step, y: s.train })) }, { name: 'Validation', points: run.history.map(s => ({ x: s.step, y: s.validation })), dashed: true }]} />
  </>;
}
function Weights({ family, parameters, gradients, rate }: { family: TrainingFamily; parameters: number[]; gradients: number[]; rate: number }) {
  const [groupIndex, setGroupIndex] = useState(0), [coordinate, setCoordinate] = useState(0);
  const groups = trainingGroups(family), initial = initialArchitectureParameters(family), group = groups[groupIndex], index = group.offset + coordinate;
  return <details className="atr-backward"><summary>Backward: градиенты и изменение каждой группы весов</summary>
    <p>Аналитический reverse-mode: каждое сложение, умножение, tanh и softmax сохраняет локальную производную. Обратный проход суммирует все пути к общему параметру; конечные разности нужны только в тестах. Показан градиент следующего train-батча.</p>
    <Table title="Обучается вся маленькая модель" columns={['Группа', 'Параметров', '‖θ−θ₀‖₂', '‖∂L/∂θ‖₂']} rows={groups.map(g => [g.label, g.size,
      fmt(Math.hypot(...parameters.slice(g.offset, g.offset + g.size).map((x, i) => x - initial[g.offset + i])), 5), fmt(Math.hypot(...gradients.slice(g.offset, g.offset + g.size)), 5)])} />
    <label>Группа параметров<select value={groupIndex} onChange={e => { setGroupIndex(Number(e.target.value)); setCoordinate(0); }}>{groups.map((g, i) => <option key={g.name} value={i}>{g.label}</option>)}</select></label>
    <Range label={`Координата веса ${family}`} value={coordinate} min={0} max={group.size - 1} step={1} onChange={setCoordinate} />
    <p className="formula">θ[{index}] = {fmt(parameters[index], 6)}; ∂L/∂θ = {fmt(gradients[index], 6)}<br />θ′ = θ − η·∂L/∂θ = {fmt(parameters[index] - rate * gradients[index], 6)}</p>
  </details>;
}
function ImageGrid({ pixels, title }: { pixels: number[]; title: string }) {
  return <figure className="atr-image"><figcaption>{title}</figcaption><div className="atr-pixels" role="img" aria-label={`${title}: четыре строки и четыре столбца; точные числа доступны в таблице`}>
    {pixels.map((x, i) => <span key={i} title={`[${Math.floor(i / 4)}, ${i % 4}] = ${x}`} style={{ background: `hsl(${x >= 0 ? 150 : 30} 35% ${96 - Math.min(1, Math.abs(x)) * 54}%)` }} />)}
  </div></figure>;
}

export function VitTrainingLab() {
  const [rate, setRate] = useState(.12), [example, setExample] = useState(0), run = useTraining('vit', rate);
  const sample = visionValidation[example], trace = useMemo(() => vitTrainingTrace(run.parameters, sample), [run.parameters, sample]);
  const gradients = useMemo(() => trainingGradient('vit', run.parameters, run.steps, 0), [run.parameters, run.steps]);
  const train = evaluateVit(run.parameters, visionTrain), validation = evaluateVit(run.parameters, visionValidation);
  return <section className="panel architecture-training" aria-label="Обучение ViT"><h3>ViT: обучите патчи, attention и классификатор</h3>
    <p>16 картинок 4×4: горизонтальные и вертикальные полосы с шумом, разной яркостью и инверсией контраста. Восемь отдельных картинок validation получают другой шум и не участвуют в SGD.</p>
    <p className="formula">4 патча 2×2 → E + P (d=2) → softmax(QKᵀ/√2)V + residual → tanh-FFN + residual → mean(h²) → 2 logits → CE.</p>
    <p>Все 40 параметров обучаются. Это маленький учебный вариант ViT: одна голова, FFN 2→2, без LayerNorm и CLS. Усредняются квадраты признаков, чтобы читать ориентацию при смене контраста. Начните с «80 шагов SGD».</p>
    <Controls run={run} rate={rate} setRate={setRate} count={80} label="ViT" />
    <p>Точность train: {fmt(train.accuracy * 100, 1)}%; validation: <strong>{fmt(validation.accuracy * 100, 1)}%</strong>. Это проверка на новых вариантах двух знакомых узоров, а не на естественных фотографиях.</p>
    <Range label="Картинка validation ViT" value={example} min={0} max={7} step={1} onChange={setExample} />
    <div className="atr-image-row"><ImageGrid pixels={sample.image.flat()} title={`Цель: ${sample.label === 0 ? 'вертикальные' : 'горизонтальные'} полосы`} /><div><p>P(вертикальные) = {fmt(trace.probabilities[0], 4)}</p><p>P(горизонтальные) = {fmt(trace.probabilities[1], 4)}</p><p>Положительные пиксели зелёные, отрицательные оранжевые; насыщенность ограничена |x|=1.</p></div></div>
    <Table title="Пиксели выбранной validation-картинки" columns={['Строка', 'c0', 'c1', 'c2', 'c3']} rows={sample.image.map((row, i) => [i, ...row.map(x => fmt(x, 4))])} />
    <Table title="Обученное внимание между патчами, сумма строки = 1" columns={['Запрос', 'Ключ 0', 'Ключ 1', 'Ключ 2', 'Ключ 3']} rows={trace.attention.map((row, i) => [i, ...row.map(x => fmt(x, 4))])} />
    <Weights family="vit" parameters={run.parameters} gradients={gradients} rate={rate} />
    <Exercise question="Если заморозить patch-проекцию и Q/K/V, что покажет таблица весов?" options={['Изменится только разрешённая голова', 'Все группы обязаны измениться']} correct={0} explanation="В этом опыте заморозки нет: ненулевая норма изменения Q/K/V и patch-проекции подтверждает, что училась вся малая сеть." />
    <p><a href="https://arxiv.org/abs/2010.11929">ViT: исходная архитектура</a></p>
  </section>;
}

export function MoeTrainingLab() {
  const [rate, setRate] = useState(.12), [balance, setBalance] = useState(.05), run = useTraining('moe', rate, balance);
  const trace = useMemo(() => moeTrainingTrace(run.parameters, moeTrain, balance), [run.parameters, balance]);
  const heldout = moeTrainingTrace(run.parameters, moeValidation, balance, false);
  const hardMse = heldout.rows.reduce((s, row, i) => s + (row.hardOutput - moeValidation[i].target) ** 2, 0) / heldout.rows.length;
  const winners = [0, 1].map(j => trace.rows.filter(row => row.winner === j).length);
  return <section className="panel architecture-training" aria-label="Обучение MoE"><h3>MoE: router и эксперты учатся вместе</h3>
    <p>Два линейных эксперта учатся приближать y=|x|. Router выдаёт softmax от двух affine-logit. На каждом train-примере вычисляются оба эксперта: гладкая смесь позволяет передавать градиент через router. «200 шагов SGD» показывает специализацию по знаку x.</p>
    <p className="formula">ŷ = p₁(x)·E₁(x) + p₂(x)·E₂(x)<br />L = MSE + λ·(2Σₑ mean_batch(pₑ)² − 1).</p>
    <Range label="Вес балансировки λ" value={balance} min={0} max={1} step={.05} onChange={setBalance} />
    <Controls run={run} rate={rate} setRate={setRate} count={200} label="MoE" />
    <p>Полная train-цель с балансировкой: {fmt(trace.loss, 5)}; сама балансировка: {fmt(trace.balanceLoss, 5)}. На графике только MSE, поэтому кривые сопоставимы при смене λ.</p>
    <Table title="Мягкая нагрузка и top-1 маршруты train" columns={['Эксперт', 'Средняя вероятность', 'Побед top-1', 'Обученная функция']} rows={[0, 1].map(j => [j + 1, fmt(trace.load[j], 4), `${winners[j]} / ${moeTrain.length}`, `${fmt(run.parameters[4 + j * 2])}·x + ${fmt(run.parameters[5 + j * 2])}`])} />
    <Chart xLabel="Вход x из validation" yLabel="Цель / предсказание" series={[{ name: '|x|', points: moeValidation.map(s => ({ x: s.x, y: s.target })) }, { name: 'Мягкая смесь', points: heldout.rows.map((row, i) => ({ x: moeValidation[i].x, y: row.output })) }, ...[0, 1].map(j => ({ name: `Эксперт ${j + 1}`, points: heldout.rows.map((row, i) => ({ x: moeValidation[i].x, y: row.experts[j] })), dashed: true }))]} />
    <details><summary>Все validation-маршруты и жёсткий top-1</summary><Table title="Мягкая смесь и top-1 — разные предсказания" columns={['x', 'p₁', 'p₂', 'Top-1', 'Смесь', 'Top-1 выход', 'Цель']} rows={heldout.rows.map((row, i) => [fmt(moeValidation[i].x), ...row.probabilities.map(x => fmt(x, 3)), row.winner + 1, fmt(row.output, 4), fmt(row.hardOutput, 4), fmt(moeValidation[i].target)])} /></details>
    <p>Validation MSE жёсткого top-1: <strong>{fmt(hardMse, 5)}</strong>; мягкой смеси: {fmt(heldout.mse, 5)}. При top-1 остаётся только выбранный эксперт с весом 1. Эта замена может ухудшить результат: обучали мягкую смесь. Оба эксперта считались на train, поэтому здесь нет экономии sparse-вычислений.</p>
    <Weights family="moe" parameters={run.parameters} gradients={trace.gradients} rate={rate} />
    <Exercise question="Одинаковая средняя нагрузка доказывает ли, что эксперты решают задачу хорошо?" options={['Да, балансировка заменяет MSE', 'Нет, нужны MSE и отдельная validation']} correct={1} explanation="Равномерный router может смешивать два плохих эксперта. Сравнивайте баланс, функции экспертов и ошибку на новых x." />
    <p className="note">Здесь importance penalty по средним вероятностям; это не hard-load auxiliary loss Switch Transformer. Нет capacity/drop и нелинейных FFN экспертов.</p><p><a href="https://arxiv.org/abs/2101.03961">Switch Transformers: промышленная sparse-маршрутизация</a></p>
  </section>;
}

export function SsmTrainingLab() {
  const [rate, setRate] = useState(.15), [example, setExample] = useState(0), run = useTraining('ssm', rate);
  const sample = memoryValidation[example], trace = ssmTrainingTrace(run.parameters, sample);
  const gradients = useMemo(() => trainingGradient('ssm', run.parameters, run.steps, 0), [run.parameters, run.steps]);
  return <section className="panel architecture-training" aria-label="Обучение SSM"><h3>SSM: научитесь удерживать первый сигнал</h3>
    <p>В x₀ записан сигнал; за ним идут пять небольших независимых помех. Только последний выход должен восстановить x₀. Train содержит 12 последовательностей, validation — 8 новых амплитуд и помех. Нажмите «100 шагов SGD».</p>
    <p className="formula">Aⱼ = tanh(aⱼ); hₜⱼ = Aⱼhₜ₋₁ⱼ + Bⱼxₜ; yₜ = Σⱼ Cⱼhₜⱼ; L = (y₅ − x₀)².</p>
    <p>Обучаются все девять a/B/C. Градиент последнего выхода проходит через все шесть обновлений h; обрыва BPTT нет. Ограничение |Aⱼ|&lt;1 задаёт устойчивое затухание. Это дискретная диагональная SSM без селективности Mamba.</p>
    <Controls run={run} rate={rate} setRate={setRate} count={100} label="SSM" />
    <Range label="Последовательность validation SSM" value={example} min={0} max={7} step={1} onChange={setExample} />
    <p>Цель на последнем шаге: {fmt(sample.target, 4)}; ответ: <strong>{fmt(trace.outputs.at(-1)!, 4)}</strong>. Промежуточные yₜ показаны для диагностики, loss на них не начисляется.</p>
    <Table title="Обученные параметры памяти" columns={['Компонента', 'A=tanh(a)', 'B', 'C']} rows={[0, 1, 2].map(j => [j, fmt(trace.decay[j], 5), fmt(run.parameters[j + 3], 5), fmt(run.parameters[j + 6], 5)])} />
    <Chart xLabel="Шаг последовательности t" yLabel="Компонента состояния h" series={[0, 1, 2].map(j => ({ name: `h${j}`, points: trace.states.map((row, t) => ({ x: t, y: row[j] })) }))} />
    <Table title="Вся рекурсия на новой последовательности" columns={['t', 'xₜ', 'h₀', 'h₁', 'h₂', 'yₜ']} rows={trace.states.map((row, i) => [i, fmt(sample.input[i], 4), ...row.map(x => fmt(x, 4)), fmt(trace.outputs[i], 4)])} />
    <Weights family="ssm" parameters={run.parameters} gradients={gradients} rate={rate} />
    <Exercise question="Через сколько переходов проходит влияние x₀ на h₅?" options={['Один: только последний loss', 'Пять: через A в каждом следующем шаге']} correct={1} explanation="При отсутствии помех вклад x₀ равен B·x₀·A⁵, а его производная по a содержит 5A⁴(1−A²). Именно это проверяет численный тест." />
  </section>;
}

function DenoiserBody({ kind }: { kind: DenoiserKind }) {
  const [rate, setRate] = useState(.06), [example, setExample] = useState(3), [seed, setSeed] = useState(701), [frame, setFrame] = useState(8);
  const run = useTraining(kind, rate), sample = noiseValidation[example];
  const trace = denoiserTrainingTrace(kind, run.parameters, sample);
  const gradients = useMemo(() => trainingGradient(kind, run.parameters, run.steps, 0), [kind, run.parameters, run.steps]);
  const trajectory = useMemo(() => sampleDenoiser(kind, run.parameters, seed), [kind, run.parameters, seed]);
  const selected = trajectory[8 - frame], a = denoisingAlpha(sample.time);
  const cleanEstimate = sample.noisy.map((x, i) => (x - Math.sqrt(1 - a) * trace.prediction[i]) / Math.sqrt(a));
  return <>
    <p>{kind === 'unet' ? 'U-Net: один канал, conv 3×3 → tanh → average pool 4×4→2×2 → conv 3×3 → tanh → nearest upsample → concat со skip → conv 1×1. В обе свёртки добавляется обучаемый коэффициент t; всего 25 параметров.' : 'DiT: четыре патча 2×2, d=4, обучаемые позиции, scale/shift от t, одна Q/K/V attention-голова, residual и tanh-FFN 4→4, выходные патчи шума. Все 128 параметров обучаются. Это вариант без LayerNorm/adaLN-Zero, VAE и conditioning по классу.'}</p>
    <Controls run={run} rate={rate} setRate={setRate} count={160} label={kind === 'unet' ? 'U-Net' : 'DiT'} />
    <Weights family={kind} parameters={run.parameters} gradients={gradients} rate={rate} />
    <h4>Предсказание шума на отдельном примере</h4>
    <Range label={`Пример validation ${kind}`} value={example} min={0} max={15} step={1} onChange={setExample} />
    <p>t={sample.time}; ᾱₜ={fmt(a, 5)}; MSE(ε̂, ε)={fmt(trace.loss, 5)}.</p>
    <div className="atr-image-row"><ImageGrid pixels={sample.clean} title="Чистая картинка x₀" /><ImageGrid pixels={sample.noisy} title="Зашумлённая xₜ" /><ImageGrid pixels={trace.prediction} title="Предсказанный шум ε̂" /><ImageGrid pixels={cleanEstimate} title="Оценка x̂₀ за один шаг" /></div>
    <details><summary>Числа всех 16 пикселей validation</summary><Table title="Денойзинг: точные величины без ограничения шкалы" columns={['[r,c]', 'x₀', 'xₜ', 'ε', 'ε̂', 'x̂₀']} rows={sample.clean.map((x, i) => [`[${Math.floor(i / 4)},${i % 4}]`, ...[x, sample.noisy[i], sample.noise[i], trace.prediction[i], cleanEstimate[i]].map(v => fmt(v, 5))])} /></details>
    <h4>Сэмплирование из нового шума</h4>
    <p>Восемь настоящих вызовов обученного denoiser, t=8→1. Начальный x₈~N(0,I); чистая картинка из validation в этот процесс не подаётся. Детерминированный DDIM с η=0 использует одну и ту же ε̂ для восстановления x̂₀ и следующего xₜ₋₁.</p>
    <p className="formula">x̂₀ = (xₜ − √(1−ᾱₜ)·ε̂θ(xₜ,t))/√ᾱₜ<br />xₜ₋₁ = √ᾱₜ₋₁·x̂₀ + √(1−ᾱₜ₋₁)·ε̂θ(xₜ,t).</p>
    <div className="atr-controls"><Range label="Seed начального шума" value={seed} min={1} max={999} step={1} onChange={setSeed} /><Range label="Кадр обратного процесса t" value={frame} min={0} max={8} step={1} onChange={setFrame} /></div>
    <div className="button-row"><button disabled={frame === 8} onClick={() => setFrame(frame + 1)}>← К более шумному кадру</button><button disabled={frame === 0} onClick={() => setFrame(frame - 1)}>Шаг к x₀ →</button></div>
    <div className="atr-image-row"><ImageGrid pixels={trajectory[0].pixels} title="Начальный шум x₈" /><ImageGrid pixels={selected.pixels} title={`Выбранный кадр x${selected.time}`} /><ImageGrid pixels={trajectory.at(-1)!.pixels} title="Полученный x₀" /></div>
    <p>Цвет: зелёный для x≥0, оранжевый для x&lt;0, насыщенность до |x|=1. Сам расчёт не обрезает числа; слабая модель может дать большие значения и нечёткий узор.</p>
    <Table title={`Численные пиксели сэмпла, t=${frame}`} columns={['Строка', 'c0', 'c1', 'c2', 'c3']} rows={[0, 1, 2, 3].map(r => [r, ...selected.pixels.slice(r * 4, r * 4 + 4).map(x => fmt(x, 5))])} />
    <details><summary>Все шаги обратного процесса</summary><Table title="Проверка масштаба сэмплирования" columns={['t', 'ᾱ', 'Минимум', 'Максимум', 'RMS пикселей']} rows={trajectory.map(row => [row.time, fmt(denoisingAlpha(row.time), 5), fmt(Math.min(...row.pixels), 4), fmt(Math.max(...row.pixels), 4), fmt(Math.sqrt(row.pixels.reduce((s, x) => s + x * x, 0) / 16), 4)])} /></details>
  </>;
}
export function DenoiserTrainingLab() {
  const [kind, setKind] = useState<DenoiserKind>('unet');
  return <section className="panel architecture-training" aria-label="Обучение U-Net и DiT"><h3>U-Net и DiT: обучите ε-предсказатель и запустите обратный процесс</h3>
    <p>Два чистых узора 4×4, восемь уровней шума. Train: 32 фиксированные пары; validation: 16 других шумовых реализаций тех же узоров. Каждый шаг SGD использует четыре train-пары по кругу. Это проверка новых шумов, а не новых классов изображений.</p>
    <p className="formula">ᾱₜ = 0,01^(t/8); xₜ = √ᾱₜ·x₀ + √(1−ᾱₜ)·ε; ε~N(0,I)<br />L = mean_pixels(εθ(xₜ,t)−ε)².</p>
    <label>Обучаемая архитектура<select value={kind} onChange={e => setKind(e.target.value as DenoiserKind)}><option value="unet">Маленький U-Net</option><option value="dit">Маленький DiT</option></select></label>
    <p>Смена архитектуры начинает новый опыт с исходными весами. Сравните снижение MSE после «160 шагов SGD»; ёмкость сетей разная, это не сравнительный benchmark.</p>
    <DenoiserBody key={kind} kind={kind} />
    <Exercise question="Что минимизирует обучение ε-prediction?" options={['MSE между предсказанным и добавленным шумом', 'Разницу между двумя цветными миниатюрами']} correct={0} explanation="MSE вычисляется по 16 числам ε. Цвет миниатюры ограничивает отображение, но не loss и не обратный процесс." />
    <p><a href="https://arxiv.org/abs/2212.09748">DiT</a> · <a href="https://arxiv.org/abs/2010.02502">DDIM: детерминированное сэмплирование</a></p>
  </section>;
}
