import { useMemo, useState, type ReactNode } from 'react';
import { Chart, Range, fmt } from './ui';
import { PredictionExperiment } from './PredictionExperiment';
import { Scene3D, type SceneAxes, type Vec3 } from './ThreeD';
import { useLearningActive } from './learning-context';
import {
  CLIP_PAIRS, clipInitial, clipObjective, trainClip,
  FEATURE_IMPORTANCE, superpositionInitial, superpositionTrace, trainSuperposition,
  CAUSAL_WEIGHTS, CAUSAL_READOUT, causalIntervention,
  JEPA_IMAGES, jepaInitial, jepaTrace, trainJepa,
  kanEdge, kanPredict, regressionTarget, regressionMlpPredict, trainKanComparison,
  frontierParameterDistance, type FrontierMatrix, type RegressionTask,
} from './representationFrontierMath';
import './representation-frontier.css';

const vector = (values: readonly number[]) => `[${values.map(v => fmt(v, 5)).join('; ')}]`;
const colors = ['#27694e', '#b75d24', '#6a52a0', '#2a7293', '#a74867'];
function Table({ label, children }: { label: string; children: ReactNode }) {
  return <div className="frontier-table" tabIndex={0} role="region" aria-label={`${label}. Таблица с горизонтальной прокруткой`}>{children}</div>;
}
function Matrix({ values, title, rowLabels, columnLabels }: { values: FrontierMatrix; title: string; rowLabels?: string[]; columnLabels?: string[] }) {
  return <Table label={title}><table className="data-table"><caption>{title}</caption><thead><tr><th scope="col">Строка</th>{values[0].map((_, j) => <th scope="col" key={j}>{columnLabels?.[j] ?? `${j + 1}`}</th>)}</tr></thead>
    <tbody>{values.map((row, i) => <tr key={i}><th scope="row">{rowLabels?.[i] ?? `${i + 1}`}</th>{row.map((v, j) => <td key={j}>{fmt(v, 5)}</td>)}</tr>)}</tbody></table></Table>;
}
function TrainButtons({ steps, setSteps, limit = 1000 }: { steps: number; setSteps: (n: number) => void; limit?: number }) {
  return <><div className="button-row">{[1, 50, 200].map(count => <button type="button" key={count} disabled={steps >= limit} onClick={() => setSteps(Math.min(limit, steps + count))}>+{count} SGD</button>)}<button type="button" onClick={() => setSteps(0)}>Сбросить веса</button></div><p role="status">Выполнено полных шагов SGD: {steps} / {limit}. Начальное состояние и выборка фиксированы; сброс воспроизводит опыт.</p></>;
}
function Source({ url, children }: { url: string; children: ReactNode }) { return <p className="note">Источник: <a href={url} target="_blank" rel="noreferrer">{children}</a>.</p>; }
const clipAxes: SceneAxes = [1, 2, 3].map(k => ({ label: `Компонента embedding z${k} (безразмерная)`, min: -1.1, max: 1.1 })) as unknown as SceneAxes;
function Pattern({ pixels, name }: { pixels: number[]; name: string }) {
  return <div className="frontier-pattern" role="img" aria-label={`${name}: три строки ${[0, 1, 2].map(row => pixels.slice(row * 3, row * 3 + 3).join('')).join(', ')}`}>
    {pixels.map((v, i) => <span key={i} className={v ? 'filled' : ''} />)}</div>;
}

export function ClipLab() {
  const [steps, setSteps] = useState(0), [temperature, setTemperature] = useState(.2), [eta, setEta] = useState(.08), [query, setQuery] = useState(0), [geometry, setGeometry] = useState(false);
  const active = useLearningActive();
  const trained = useMemo(() => trainClip(steps, eta, temperature), [steps, eta, temperature]);
  const before = useMemo(() => clipObjective(clipInitial(), temperature), [temperature]);
  const current = trained.metrics, names = CLIP_PAIRS.map(pair => pair.name);
  const parameterChange = frontierParameterDistance([...trained.parameters.image.flat(), ...trained.parameters.text.flat()], [...clipInitial().image.flat(), ...clipInitial().text.flat()]);
  const queryProbabilities = current.imageToText[query], selected = queryProbabilities.indexOf(Math.max(...queryProbabilities));
  function restart(change: () => void) { change(); setSteps(0); }
  return <section className="representation-frontier-lab" aria-label="Лаборатория контрастивных представлений CLIP">
    <h3>CLIP: сблизить верные пары в общем пространстве</h3>
    <p>Четыре картинки 3×3 и четыре описания проходят через разные обучаемые проекторы: Wᵢ[3×9] и Wₜ[3×4]. Их выходы нормируются до длины 1. Сходство — скалярное произведение настоящих трёхмерных embedding, а не расстояние между номерами классов.</p>
    <div className="frontier-pairs">{CLIP_PAIRS.map(pair => <figure key={pair.name}><Pattern pixels={pair.image} name={pair.name} /><figcaption>{pair.name}</figcaption></figure>)}</div>
    <div className="lab-grid">
      <section className="panel controls"><h3>Обучение двух проекторов</h3>
        <Range label="Температура τ" value={temperature} min={.05} max={1} step={.05} onChange={value => restart(() => setTemperature(value))} />
        <Range label="Скорость SGD η" value={eta} min={.01} max={.15} step={.01} onChange={value => restart(() => setEta(value))} />
        <TrainButtons steps={steps} setSteps={setSteps} limit={500} />
        <p className="formula">sᵢⱼ = zᵢ · tⱼ / τ<br />L = (CE по строкам + CE по столбцам) / 2<br />Цель каждой строки и каждого столбца — совпадающая пара на диагонали.</p>
        <p>||θ − θ₀||₂ = {fmt(parameterChange, 5)}; обучаемых весов 27 + 12 = 39. Используются аналитические градиенты, включая производную нормировки.</p>
      </section>
      <section className="panel"><h3>До и после обучения</h3>
        <Table label="Контрастивная ошибка и поиск"><table className="data-table"><caption>Фиксированные четыре пары</caption><thead><tr><th scope="col">Состояние</th><th scope="col">L</th><th scope="col">Картинка → текст</th><th scope="col">Текст → картинка</th></tr></thead><tbody>{[['Начало', before], ['Сейчас', current]].map(([name, metrics]) => { const m = metrics as typeof current; return <tr key={name as string}><th scope="row">{name as string}</th><td>{fmt(m.loss, 6)}</td><td>{m.imageAccuracy * 4} / 4</td><td>{m.textAccuracy * 4} / 4</td></tr>; })}</tbody></table></Table>
        <Chart xLabel="Шаг SGD (индекс)" yLabel="Симметричный contrastive CE" series={[{ name: 'Текущая температура', points: trained.history.map(h => ({ x: h.step, y: h.loss })) }]} />
      </section>
    </div>
    <section className="panel"><h3>Все совпадения и один поисковый запрос</h3>
      <Matrix title="Косинусное сходство: строки — картинки, столбцы — описания" values={current.similarity} rowLabels={names} columnLabels={names} />
      <label>Картинка для поиска<select value={query} onChange={event => setQuery(Number(event.target.value))}>{names.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label>
      <p role="status">Первое описание: «{names[selected]}». {selected === query ? 'Совпадает с заданной парой.' : 'Пара пока перепутана.'} Softmax по строке: {vector(queryProbabilities)}.</p>
      <p className="note">Softmax показывает конкуренцию четырёх описаний в этом наборе. Это не калиброванная вероятность того, что описание истинно. Температура меняет CE и распределение, но при фиксированных весах не меняет порядок сходств.</p>
      <div className="button-row"><button type="button" aria-pressed={geometry} onClick={() => setGeometry(!geometry)}>{geometry ? 'Скрыть' : 'Показать'} 3D embedding</button></div>
      {geometry && active && <Scene3D title="Картинки и описания в R³" description="Каждая ось — реальная компонента обученного embedding. Круги — картинки; треугольники — описания. Отрезок соединяет заданную пару; индекс класса не является координатой. Числа доступны ниже." axes={clipAxes}
        points={names.flatMap((name, i) => [{ name: `Картинка: ${name}`, position: current.imageEmbeddings[i] as unknown as Vec3, color: colors[i] }, { name: `Описание: ${name}`, position: current.textEmbeddings[i] as unknown as Vec3, shape: 'triangle' as const, color: colors[i] }])}
        lines={names.map((name, i) => ({ name: `Пара: ${name}`, points: [current.imageEmbeddings[i] as unknown as Vec3, current.textEmbeddings[i] as unknown as Vec3], color: colors[i] }))} />}
      <details><summary>Численные координаты и веса</summary><Matrix title="Embedding картинок: z₁, z₂, z₃" values={current.imageEmbeddings} rowLabels={names} /><Matrix title="Embedding описаний: t₁, t₂, t₃" values={current.textEmbeddings} rowLabels={names} /><Matrix title="Обученный Wᵢ" values={trained.parameters.image} /><Matrix title="Обученный Wₜ" values={trained.parameters.text} /></details>
    </section>
    <PredictionExperiment question="При τ=1 фиксированные веса дают менее резкий softmax, чем при τ=0,05. Изменится ли первое найденное описание?" options={['Нет, порядок сходств тот же', 'Да, температура меняет embedding']} run={prediction => {
      const hot = clipObjective(trained.parameters, 1), cold = clipObjective(trained.parameters, .05);
      const top = (values: number[]) => values.indexOf(Math.max(...values));
      return { correct: prediction === 0, before: `τ=1: top «${names[top(hot.imageToText[query])]}», max p=${fmt(Math.max(...hot.imageToText[query]), 5)}`, after: `τ=0,05: top «${names[top(cold.imageToText[query])]}», max p=${fmt(Math.max(...cold.imageToText[query]), 5)}`, explanation: 'Проведены два настоящих forward на одинаковых весах. Деление сходств на положительную температуру сохраняет их порядок. Обучение при другой температуре уже может дать другие веса.' };
    }} />
    <p className="note">Описания здесь кодируются четырьмя one-hot признаками: языкового encoder нет. Опыт учит механизм симметричного контрастивного обучения и запоминает четыре пары; он не демонстрирует понимание языка, zero-shot качество или обучение оригинального CLIP на большом корпусе.</p>
    <Source url="https://arxiv.org/abs/2103.00020">Radford et al., Learning Transferable Visual Models From Natural Language Supervision</Source>
  </section>;
}

export function InterpretabilityLab() {
  const [steps, setSteps] = useState(0), [frequency, setFrequency] = useState(.15), [first, setFirst] = useState(0), [second, setSecond] = useState(1), [pair, setPair] = useState(false), [strength, setStrength] = useState(.8);
  const [signal, setSignal] = useState(.8), [nuisance, setNuisance] = useState(-.5), [neuron, setNeuron] = useState(0), [baseline, setBaseline] = useState<'zero' | 'mean'>('zero'), [corruption, setCorruption] = useState<'flip' | 'zero'>('flip'), [operation, setOperation] = useState<'none' | 'ablation' | 'patch'>('none');
  const trained = useMemo(() => trainSuperposition(steps, frequency), [steps, frequency]);
  const probe = Array.from({ length: 5 }, (_, i) => (i === first || (pair && i === second)) ? strength : 0), trace = superpositionTrace(trained.parameters, probe);
  const directions = [0, 1, 2, 3, 4].map(i => trained.parameters.weights.map(row => row[i]));
  const empirical = trained.data.flat().filter(v => v !== 0).length / (trained.data.length * 5);
  const causal = causalIntervention([signal, nuisance], [corruption === 'flip' ? -signal : 0, nuisance], neuron, baseline);
  const measured = operation === 'ablation' ? causal.ablated : operation === 'patch' ? causal.patched : null;
  const reference = operation === 'patch' ? causal.corrupt : causal.clean;
  function causalChange(action: () => void) { action(); setOperation('none'); }
  return <section className="representation-frontier-lab" aria-label="Лаборатория суперпозиции и причинных вмешательств">
    <h3>Пять признаков в двух координатах: суперпозиция</h3>
    <p>Обучаем tied autoencoder: h = Wx, x̂ = ReLU(Wᵀh + b), W[2×5]. Пять независимых разреженных признаков делят только две скрытые координаты. Веса важности [1; 0,8; 0,6; 0,4; 0,2] делают ошибку первого признака дороже ошибки пятого.</p>
    <div className="lab-grid">
      <section className="panel controls"><h3>Разреженность и обучение</h3>
        <Range label="Вероятность ненулевого признака p" value={frequency} min={.05} max={1} step={.05} onChange={n => { setFrequency(n); setSteps(0); }} />
        <TrainButtons steps={steps} setSteps={setSteps} />
        <p>160 фиксированных примеров; ненулевые значения от 0,2 до 1. Наблюдаемая частота в выборке: {fmt(empirical, 3)}. SGD η=0,3; 15 обучаемых параметров.</p>
        <p className="formula">L = ΣₙΣⱼ importanceⱼ(x̂ₙⱼ − xₙⱼ)² / (5N)<br />L сейчас = {fmt(trained.loss, 6)}<br />||W − W₀||F = {fmt(frontierParameterDistance(trained.parameters.weights.flat(), superpositionInitial().weights.flat()), 5)}</p>
        <Chart xLabel="Шаг SGD (индекс)" yLabel="Взвешенная ошибка восстановления" series={[{ name: 'Train', points: trained.history.map(h => ({ x: h.step, y: h.loss })) }]} />
      </section>
      <section className="panel"><h3>Настоящие направления признаков в R²</h3>
        <Chart xLabel="Вклад в h₁ при xⱼ=1" yLabel="Вклад в h₂ при xⱼ=1" series={directions.map((v, i) => ({ name: `Признак ${i + 1}`, color: colors[i], points: [{ x: 0, y: 0 }, { x: v[0], y: v[1] }] }))} />
        <Matrix title="Столбцы W: направления признаков (численная альтернатива)" values={directions} rowLabels={directions.map((_, i) => `Признак ${i + 1}`)} columnLabels={['h₁', 'h₂']} />
        <p className="note">Это плоское пространство из двух координат. Отдельного «третьего измерения признака» нет. Не каждый neuron соответствует одному признаку; здесь признаки — известные входные переменные, а не найденные понятия реальной сети.</p>
      </section>
    </div>
    <section className="panel"><h3>Проверьте интерференцию на одном входе</h3>
      <div className="frontier-controls"><label>Первый признак<select value={first} onChange={e => setFirst(Number(e.target.value))}>{directions.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
        <label className="frontier-check"><input type="checkbox" checked={pair} onChange={e => setPair(e.target.checked)} />Добавить второй признак</label>
        <label>Второй признак<select value={second} disabled={!pair} onChange={e => setSecond(Number(e.target.value))}>{directions.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
        <Range label="Величина активного признака" value={strength} min={.1} max={1} step={.05} onChange={setStrength} />
      </div>
      <p>h = {vector(trace.hidden)}. При одинаковом номере первый и второй переключатели задают один признак, без удвоения.</p>
      <Table label="Восстановление признаков"><table className="data-table"><caption>Признак, важность, вход и восстановление</caption><thead><tr><th scope="col">Признак</th><th scope="col">Важность</th><th scope="col">x</th><th scope="col">x̂</th><th scope="col">x̂ − x</th></tr></thead><tbody>{probe.map((v, i) => <tr key={i}><th scope="row">{i + 1}</th><td>{FEATURE_IMPORTANCE[i]}</td><td>{fmt(v)}</td><td>{fmt(trace.output[i], 5)}</td><td>{fmt(trace.output[i] - v, 5)}</td></tr>)}</tbody></table></Table>
      <p className="note">Ненулевое восстановление отсутствующего признака — наблюдаемая интерференция. Сравните одиночный и совместный входы. На этой выборке и после конечного числа SGD геометрия не обязана совпадать с рисунками статьи.</p>
    </section>
    <section className="panel controls"><h3>Причинный опыт: ablation и activation patching</h3>
      <p>Отдельный фиксированный классификатор h=tanh(Ax+b), logit=v·h−0,15 имеет три neuron. Он читает сигнал x₁ и помеху x₂; метка = 1, если исходный x₁ ≥ 0. Эта сеть специально мала и не обучается в данном опыте. Вмешательство действительно заменяет одну скрытую активацию до readout.</p>
      <div className="frontier-controls"><Range label="Чистый сигнал x₁" value={signal} min={-1} max={1} step={.05} onChange={n => causalChange(() => setSignal(n))} /><Range label="Помеха x₂" value={nuisance} min={-1} max={1} step={.05} onChange={n => causalChange(() => setNuisance(n))} />
        <label>Повреждение сигнала<select value={corruption} onChange={e => causalChange(() => setCorruption(e.target.value as 'flip' | 'zero'))}><option value="flip">Заменить x₁ на −x₁</option><option value="zero">Заменить x₁ на 0</option></select></label>
        <label>Выбранный neuron<select value={neuron} onChange={e => causalChange(() => setNeuron(Number(e.target.value)))}>{[0, 1, 2].map(i => <option key={i} value={i}>{i + 1}</option>)}</select></label>
        <label>Baseline для ablation<select value={baseline} onChange={e => causalChange(() => setBaseline(e.target.value as 'zero' | 'mean'))}><option value="zero">Нулевая активация</option><option value="mean">Среднее на четырёх reference входах</option></select></label></div>
      <p>Baseline h{neuron + 1} = {fmt(causal.baselineValue, 5)}. Reference для среднего: (−1,−1), (−1,1), (1,−1), (1,1). Исходная метка {causal.label} сохраняется при повреждении и вмешательстве.</p>
      <div className="button-row"><button type="button" onClick={() => setOperation('ablation')}>Ablation: заменить h в чистом проходе</button><button type="button" onClick={() => setOperation('patch')}>Patch: перенести чистое h в повреждённый проход</button><button type="button" onClick={() => setOperation('none')}>Убрать вмешательство</button></div>
      <Table label="Измерения причинного вмешательства"><table className="data-table"><caption>Readout и BCE с одной исходной меткой</caption><thead><tr><th scope="col">Проход</th><th scope="col">h₁, h₂, h₃</th><th scope="col">Logit</th><th scope="col">BCE loss</th></tr></thead><tbody>{[['Чистый', causal.clean], ['Повреждённый', causal.corrupt], ...(measured ? [[operation === 'patch' ? 'После patch' : 'После ablation', measured]] : [])].map(([name, values]) => { const row = values as typeof causal.clean; return <tr key={name as string}><th scope="row">{name as string}</th><td>{vector(row.hidden)}</td><td>{fmt(row.logit, 5)}</td><td>{fmt(row.loss, 5)}</td></tr>; })}</tbody></table></Table>
      <p role="status">{measured ? `Δlogit = ${fmt(measured.logit - reference.logit, 5)}, Δloss = ${fmt(measured.loss - reference.loss, 5)} относительно ${operation === 'patch' ? 'повреждённого' : 'чистого'} прохода. Отрицательная Δloss означает улучшение на этом входе.` : 'Выберите вмешательство, чтобы измерить его эффект.'}</p>
      <details><summary>Все веса фиксированного классификатора</summary><Matrix title="A: 3×2" values={CAUSAL_WEIGHTS} /><p>b = [0,1; −0,2; 0,15], v = {vector(CAUSAL_READOUT)}, readout bias = −0,15.</p></details>
      <p className="note">Ablation зависит от baseline; patch зависит от чистого и повреждённого входов. Измеренный эффект относится к этому вмешательству в этой сети. Визуальное внимание, корреляция и большая активация сами по себе не доказывают причинность; patch одного neuron может лишь частично восстановить результат.</p>
    </section>
    <PredictionExperiment question="При patch одного neuron какие скрытые активации повреждённого прохода изменятся?" options={['Только выбранная', 'Все три']} run={prediction => {
      setOperation('patch');
      return { correct: prediction === 0, before: `h повреждённого: ${vector(causal.corrupt.hidden)}`, after: `h после patch: ${vector(causal.patched.hidden)}; Δlogit=${fmt(causal.patched.logit - causal.corrupt.logit, 5)}`, explanation: 'Выбранная активация заменена чистой, остальные взяты из повреждённого прохода. Изменение readout вычислено по настоящему вектору после замены.' };
    }} />
    <Source url="https://arxiv.org/abs/2209.10652">Elhage et al., Toy Models of Superposition</Source>
    <Source url="https://arxiv.org/abs/2202.05262">Meng et al., Locating and Editing Factual Associations in GPT</Source>
  </section>;
}

export function JepaLab() {
  const [steps, setSteps] = useState(0), [mask, setMask] = useState(1), [ema, setEma] = useState(.99), [eta, setEta] = useState(.05), [collapsed, setCollapsed] = useState(false), [sample, setSample] = useState(12);
  const trained = useMemo(() => trainJepa(steps, mask, eta, ema, collapsed), [steps, mask, eta, ema, collapsed]);
  const image = JEPA_IMAGES[sample], trace = jepaTrace(trained.parameters, image, mask), initial = jepaInitial(collapsed), metrics = trained.metrics;
  function restart(action: () => void) { action(); setSteps(0); }
  return <section className="representation-frontier-lab" aria-label="Лаборатория предсказания скрытых представлений JEPA">
    <h3>JEPA: предсказать скрытый патч в пространстве представлений</h3>
    <p>Вместо восстановления пикселей context encoder видит три патча из четырёх. Predictor получает два context latent и one-hot позицию скрытого патча. Его цель — два latent target encoder для скрытого патча; target получает полный образец и не получает градиент loss.</p>
    <div className="lab-grid">
      <section className="panel controls"><h3>Маска, SGD и EMA</h3>
        <Range label="Скрытый патч (индекс)" value={mask + 1} min={1} max={4} step={1} onChange={n => restart(() => setMask(n - 1))} />
        <Range label="Скорость SGD η" value={eta} min={.01} max={.1} step={.01} onChange={n => restart(() => setEta(n))} />
        <Range label="Коэффициент EMA m" value={ema} min={.9} max={1} step={.005} onChange={n => restart(() => setEma(n))} />
        <label className="frontier-check"><input type="checkbox" checked={collapsed} onChange={e => restart(() => setCollapsed(e.target.checked))} />Начать с нулевых encoder и predictor (коллапс)</label>
        <TrainButtons steps={steps} setSteps={setSteps} limit={500} />
        <p className="formula">L = Σₙ ||predictionₙ − stopgrad(targetₙ)||² / (2N)<br />θcontext ← θcontext − η∇L<br />θpredictor ← θpredictor − η∇L<br />θtarget ← mθtarget + (1−m)θcontext,new</p>
        <p>20 фиксированных изображений; 6 context + 12 predictor = 18 обучаемых весов. Шесть target весов обновляются только EMA. При m=1 цель заморожена.</p>
      </section>
      <section className="panel"><h3>Ошибка и проверка коллапса</h3>
        <p className="formula">Текущий latent MSE = {fmt(metrics.loss, 6)}<br />MSE к исходной фиксированной цели = {fmt(metrics.fixedLoss, 6)}<br />Средняя дисперсия target latent = {fmt(metrics.targetVariance, 6)}</p>
        <p role="status">{metrics.targetVariance < 1e-6 ? 'Коллапс: целевые представления одинаковы для всех 20 изображений. Нулевая loss здесь не означает полезное обучение.' : 'Целевые представления различаются между изображениями. Ненулевая дисперсия проверяет разнообразие, но не доказывает смысл или качество представлений.'}</p>
        <Chart xLabel="Шаг SGD (индекс)" yLabel="MSE latent" series={[{ name: 'Текущая EMA цель', points: trained.history.map(h => ({ x: h.step, y: h.loss })) }, { name: 'Исходная фиксированная цель', dashed: true, points: trained.history.map(h => ({ x: h.step, y: h.fixedLoss })) }]} />
        <Chart xLabel="Шаг SGD (индекс)" yLabel="Средняя дисперсия target latent" series={[{ name: 'Разнообразие 20 образцов', points: trained.history.map(h => ({ x: h.step, y: h.targetVariance })) }]} />
      </section>
    </div>
    <section className="panel"><h3>Проследить один forward</h3>
      <Range label="Образец (индекс)" value={sample + 1} min={1} max={20} step={1} onChange={n => setSample(n - 1)} />
      <div className="frontier-patches" aria-label="Четыре патча и выбранная маска">{image.map((features, i) => <div key={i} className={i === mask ? 'masked' : ''}><strong>Патч {i + 1}</strong><span>{i === mask ? 'Маска context' : 'Видим context'}</span><span>Яркость {fmt(features[0], 3)}</span><span>Контраст {fmt(features[1], 3)}</span></div>)}</div>
      <p>Показанные признаки маски доступны target encoder и таблице для проверки; context их не читает. Context получает только среднее признаков трёх видимых патчей и константу 1: {vector(trace.pooled)}.</p>
      <Table label="Предсказание latent"><table className="data-table"><caption>Настоящие компоненты скрытого представления</caption><thead><tr><th scope="col">Компонента</th><th scope="col">Context latent</th><th scope="col">Predictor</th><th scope="col">Target (stopgrad)</th><th scope="col">Разность</th></tr></thead><tbody>{[0, 1].map(k => <tr key={k}><th scope="row">z{k + 1}</th><td>{fmt(trace.context[k], 5)}</td><td>{fmt(trace.prediction[k], 5)}</td><td>{fmt(trace.target[k], 5)}</td><td>{fmt(trace.prediction[k] - trace.target[k], 5)}</td></tr>)}</tbody></table></Table>
      <p>||θcontext − θcontext,0||F = {fmt(frontierParameterDistance(trained.parameters.context.flat(), initial.context.flat()), 5)}; ||θtarget − θtarget,0||F = {fmt(frontierParameterDistance(trained.parameters.target.flat(), initial.target.flat()), 5)}.</p>
      <details><summary>Данные, параметры и точная мера коллапса</summary><p>Изображения строятся из двух переменных a∈[−1; −0,5; 0; 0,5; 1], b∈[−1; −⅓; ⅓; 1]. Патч i: [a+oᵢ; b+oᵢ²; 1], o=[−0,6; −0,2; 0,2; 0,6]. Это два числовых признака патча, не пиксельный ViT. Target encoder линейно кодирует каждый патч; никакого контекстного внимания внутри него нет.</p>
        <p>Дисперсия = ΣₙΣₖ(targetₙₖ − meanₖ)²/(2N) по 20 изображениям при одной фиксированной позиции маски. Различия позиций не могут скрыть коллапс по изображениям.</p>
        <Matrix title="Context encoder 2×3" values={trained.parameters.context} /><Matrix title="Target encoder 2×3, только EMA" values={trained.parameters.target} /><Matrix title="Predictor 2×6: context z₁,z₂ и позиция 1–4" values={trained.parameters.predictor} />
      </details>
    </section>
    <PredictionExperiment question="Что покажет нулевая loss, если оба encoder и predictor начать с нулей?" options={['Полезные различимые представления', 'Коллапс: все target latent одинаковы']} run={prediction => {
      const result = trainJepa(50, mask, eta, ema, true);
      return { correct: prediction === 1, before: 'Все начальные веса = 0.', after: `После 50 SGD: L=${fmt(result.metrics.loss, 6)}, variance=${fmt(result.metrics.targetVariance, 6)}, ||target||F=${fmt(Math.hypot(...result.parameters.target.flat()), 6)}`, explanation: 'Отдельный настоящий запуск остался в нулевом состоянии: ошибка и градиенты нулевые. Поэтому одной loss недостаточно. Это контрольный вырожденный случай маленькой модели, а не утверждение о коллапсе оригинального I-JEPA.' };
    }} />
    <p className="note">Здесь реализованы маскирование, predictor, stop-gradient и EMA. Нет ViT, блочных масок, positional attention, pixel decoder и оценки downstream качества. Две переменные генератора специально делают задачу предсказуемой. Уменьшение ошибки к движущейся цели может отражать и дрейф encoder; фиксированная цель и дисперсия помогают это увидеть.</p>
    <Source url="https://arxiv.org/abs/2301.08243">Assran et al., Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture</Source>
  </section>;
}

export function KanLab() {
  const [steps, setSteps] = useState(0), [knots, setKnots] = useState(7), [eta, setEta] = useState(.08), [task, setTask] = useState<RegressionTask>('additive'), [x, setX] = useState(.2), [y, setY] = useState(.3), [surface, setSurface] = useState<'none' | 'kan' | 'mlp' | 'target'>('none');
  const active = useLearningActive(), trained = useMemo(() => trainKanComparison(steps, knots, eta, task), [steps, knots, eta, task]);
  const grid = Array.from({ length: 61 }, (_, i) => -1 + i / 30), metrics = trained.metrics;
  const target = regressionTarget(x, y, task), kan = kanPredict(trained.kan, [x, y]), mlp = regressionMlpPredict(trained.mlp, [x, y]).output;
  const surfaceData = useMemo(() => {
    if (surface === 'none') return [];
    const axis = Array.from({ length: 17 }, (_, i) => -1 + i / 8);
    const predict = (a: number, b: number) => surface === 'kan' ? kanPredict(trained.kan, [a, b]) : surface === 'mlp' ? regressionMlpPredict(trained.mlp, [a, b]).output : regressionTarget(a, b, task);
    return axis.map(a => axis.map(b => [a, b, predict(a, b)] as Vec3));
  }, [surface, trained.kan, trained.mlp, task]);
  const heights = surfaceData.flat().map(point => point[2]), low = Math.min(-1.6, ...heights), high = Math.max(1.6, ...heights);
  function restart(action: () => void) { action(); setSteps(0); }
  return <section className="representation-frontier-lab" aria-label="Лаборатория KAN и MLP на общей регрессии">
    <h3>KAN: учить функцию на ребре, а MLP — вес перед активацией</h3>
    <p>Маленькая KAN считает f̂(x,y)=φₓ(x)+φᵧ(y)+b. Каждое ребро φ — обучаемый сплайн первой степени: линейная интерполяция значений в узлах. MLP 2→6→1 обучает обычные матрицы и bias с фиксированным tanh. Обе сети получают одни данные и полную MSE.</p>
    <div className="lab-grid">
      <section className="panel controls"><h3>Общая задача</h3>
        <label>Истинная функция<select value={task} onChange={e => restart(() => setTask(e.target.value as RegressionTask))}><option value="additive">sin(πx) + 0,5y²</option><option value="interaction">sin(πx) + 0,5y² + 0,6xy</option></select></label>
        <Range label="Узлов на каждом ребре KAN" value={knots} min={3} max={15} step={1} onChange={n => restart(() => setKnots(n))} />
        <Range label="Общая скорость SGD η" value={eta} min={.02} max={.14} step={.01} onChange={n => restart(() => setEta(n))} />
        <TrainButtons steps={steps} setSteps={setSteps} limit={1500} />
        <p>Параметров KAN: 2K+1 = {2 * knots + 1}; MLP: 12+6+6+1 = 25. Больше узлов увеличивает разрешение функций и число весов, но само по себе не добавляет взаимодействие x·y.</p>
        <p className="note">49 train точек — декартова сетка 7×7, включая границы. 36 held-out — середины ячеек сетки. Held-out не участвует в градиенте. При большем числе узлов отдельные значения могут остаться слабо определены train сеткой: проверьте, не растёт ли held-out ошибка. Одинаковая η не выравнивает скорость сходимости разных параметризаций.</p>
      </section>
      <section className="panel"><h3>Ошибка на тех же данных</h3>
        <Table label="KAN и MLP ошибки"><table className="data-table"><caption>Полная MSE на фиксированных выборках</caption><thead><tr><th scope="col">Модель</th><th scope="col">Train</th><th scope="col">Held-out</th></tr></thead><tbody><tr><th scope="row">KAN</th><td>{fmt(metrics.kanTrain, 6)}</td><td>{fmt(metrics.kanHeldout, 6)}</td></tr><tr><th scope="row">MLP</th><td>{fmt(metrics.mlpTrain, 6)}</td><td>{fmt(metrics.mlpHeldout, 6)}</td></tr></tbody></table></Table>
        <Chart xLabel="Шаг SGD (индекс)" yLabel="MSE" series={[{ name: 'KAN train', color: colors[0], points: trained.history.map(h => ({ x: h.step, y: h.kanTrain })) }, { name: 'KAN held-out', color: colors[0], dashed: true, points: trained.history.map(h => ({ x: h.step, y: h.kanHeldout })) }, { name: 'MLP train', color: colors[1], points: trained.history.map(h => ({ x: h.step, y: h.mlpTrain })) }, { name: 'MLP held-out', color: colors[1], dashed: true, points: trained.history.map(h => ({ x: h.step, y: h.mlpHeldout })) }]} />
      </section>
    </div>
    <section className="panel"><h3>Узлы и функции на рёбрах</h3>
      <Chart xLabel="Вход ребра x или y (безразмерный)" yLabel="Вклад ребра φ в выход" xDomain={[-1, 1]} series={[{ name: 'φₓ(x)', color: colors[0], points: grid.map(v => ({ x: v, y: kanEdge(trained.kan, 0, v) })) }, { name: 'φᵧ(y)', color: colors[1], points: grid.map(v => ({ x: v, y: kanEdge(trained.kan, 1, v) })) }]} />
      <Table label="Значения узлов KAN"><table className="data-table"><caption>Обучаемые значения в фиксированных узлах</caption><thead><tr><th scope="col">Координата узла</th><th scope="col">φₓ</th><th scope="col">φᵧ</th></tr></thead><tbody>{trained.kan.edges[0].map((value, i) => <tr key={i}><th scope="row">{fmt(-1 + 2 * i / (knots - 1), 5)}</th><td>{fmt(value, 5)}</td><td>{fmt(trained.kan.edges[1][i], 5)}</td></tr>)}</tbody></table></Table>
      <p>Общий bias b={fmt(trained.kan.bias, 5)}. Между соседними узлами uⱼ и uⱼ₊₁: φ(u)=(1−t)cⱼ+t cⱼ₊₁, t=(u−uⱼ)/(uⱼ₊₁−uⱼ). Узлы фиксированы, значения c обучаются аналитическим SGD.</p>
      <p className="note">Разложение φₓ+φᵧ+b неоднозначно: константу можно перенести между рёбрами и bias без изменения f̂. Сравнивайте суммарный выход, а не требуйте от отдельного ребра точного совпадения с одной формулой цели.</p>
    </section>
    <section className="panel"><h3>Предсказание, плоский срез и необязательная поверхность</h3>
      <div className="frontier-controls"><Range label="Запрос x" value={x} min={-1} max={1} step={.05} onChange={setX} /><Range label="Запрос y и положение среза" value={y} min={-1} max={1} step={.05} onChange={setY} /></div>
      <p role="status">Цель {fmt(target, 5)}; KAN {fmt(kan, 5)} (ошибка {fmt(kan - target, 5)}); MLP {fmt(mlp, 5)} (ошибка {fmt(mlp - target, 5)}).</p>
      <Chart xLabel="x при фиксированном y" yLabel={`f(x, y=${fmt(y, 2)})`} xDomain={[-1, 1]} series={[{ name: 'Цель', color: colors[2], points: grid.map(v => ({ x: v, y: regressionTarget(v, y, task) })) }, { name: 'KAN', color: colors[0], points: grid.map(v => ({ x: v, y: kanPredict(trained.kan, [v, y]) })) }, { name: 'MLP', color: colors[1], points: grid.map(v => ({ x: v, y: regressionMlpPredict(trained.mlp, [v, y]).output })) }]} />
      <label>3D поверхность<select value={surface} onChange={e => setSurface(e.target.value as typeof surface)}><option value="none">Скрыта — использовать график и числа</option><option value="target">Истинная функция</option><option value="kan">Выход KAN</option><option value="mlp">Выход MLP</option></select></label>
      {surface !== 'none' && active && <Scene3D title={`Поверхность ${surface === 'target' ? 'цели' : surface.toUpperCase()}`} description="Оси X и Y — два настоящих входа регрессии; Z — значение f(x,y). Узлы, номер модели и шаг обучения не являются пространственными координатами. Для проверки используйте плоский срез и численные предсказания выше." axes={[{ label: 'Вход x', min: -1, max: 1 }, { label: 'Вход y', min: -1, max: 1 }, { label: 'Выход f(x,y)', min: low - .1, max: high + .1 }]} surfaces={[{ name: surface, rows: surfaceData, color: surface === 'kan' ? colors[0] : surface === 'mlp' ? colors[1] : colors[2], opacity: .65 }]} points={[{ name: 'Текущий запрос', position: [x, y, surface === 'kan' ? kan : surface === 'mlp' ? mlp : target], color: '#263c32' }]} />}
    </section>
    <PredictionExperiment question="Может ли эта однослойная аддитивная KAN точно представить слагаемое 0,6xy?" options={['Да, достаточно больше узлов', 'Нет, нужно взаимодействие между входами']} run={prediction => {
      const predictionAt = (a: number, b: number) => kanPredict(trained.kan, [a, b]);
      const delta = predictionAt(1, 1) - predictionAt(1, -1) - predictionAt(-1, 1) + predictionAt(-1, -1);
      const targetDelta = regressionTarget(1, 1, 'interaction') - regressionTarget(1, -1, 'interaction') - regressionTarget(-1, 1, 'interaction') + regressionTarget(-1, -1, 'interaction');
      return { correct: prediction === 1, before: 'Проверяем смешанную разность в четырёх углах.', after: `У текущей KAN Δxy=${fmt(delta, 6)}; у цели с взаимодействием Δxy=${fmt(targetDelta, 6)}.`, explanation: 'Для суммы двух функций одного входа смешанная разность всегда равна нулю. В цель с xy она равна 2,4. Более глубокая KAN может иметь взаимодействия; ограничение относится только к показанной архитектуре.' };
    }} />
    <p className="note">Это KAN с двумя рёбрами, линейными B-spline и фиксированной сеткой; оригинальная работа рассматривает более глубокие сети и более гладкие сплайны. Аддитивная задача специально удобна для этой архитектуры. Опыт не доказывает преимущество KAN над MLP в целом; переключите задачу с xy и проверьте ограничение.</p>
    <Source url="https://arxiv.org/abs/2404.19756">Liu et al., KAN: Kolmogorov–Arnold Networks</Source>
  </section>;
}
