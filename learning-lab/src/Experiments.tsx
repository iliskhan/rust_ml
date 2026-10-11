import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createNetwork, createOptimizerState, networkLossGradient, optimizerStep, quadratic, XOR_DATA, type OptimizerKind, type OptimizerState } from './math';
import { Chart, Exercise, Range, fmt } from './ui';
import { ConceptLink, LearningActivity, useLearningActive } from './learning-context';
import { Scene3D } from './ThreeD';
import { functionSurface, quadraticHeight, networkHeight } from './lessonSceneMath';

const NetworkFlow3D = lazy(() => import('./NetworkFlow3D').then(module => ({ default: module.NetworkFlow3D })));
const DecisionBoundaryLesson = lazy(() => import('./DecisionBoundaryLesson').then(module => ({ default: module.DecisionBoundaryLesson })));
const BoundaryPlayground = lazy(() => import('./BoundaryPlayground').then(module => ({ default: module.BoundaryPlayground })));

const kinds: OptimizerKind[] = ['sgd', 'momentum', 'adam'];
const names = { sgd: 'SGD', momentum: 'Momentum', adam: 'Adam' };
const colors = { sgd: '#27694e', momentum: '#b75d24', adam: '#6a52a0' };
type Track = { state: OptimizerState; path: { x: number; y: number }[]; losses: { x: number; y: number }[]; grad: number[]; delta: number[]; stopped: boolean };
function makeTracks(): Record<OptimizerKind, Track> {
  return Object.fromEntries(kinds.map(kind => [kind, { state: createOptimizerState([-3, 1.5]), path: [{ x: -3, y: 1.5 }], losses: [{ x: 0, y: 13.5 }], grad: [-3, 12], delta: [0, 0], stopped: false }])) as Record<OptimizerKind, Track>;
}

export function OptimizerLesson() {
  const active = useLearningActive();
  const [sceneOpened, setSceneOpened] = useState(false);
  const [lr, setLr] = useState(.12), [momentum, setMomentum] = useState(.9);
  const [beta1, setBeta1] = useState(.9), [beta2, setBeta2] = useState(.999);
  const [tracks, setTracks] = useState(makeTracks), [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<OptimizerKind>('adam');
  function step() {
    setTracks(previous => Object.fromEntries(kinds.map(kind => {
      const t = previous[kind];
      if (t.stopped || t.state.step >= 160) return [kind, t];
      const grad = quadratic(t.state.params).grad;
      const next = optimizerStep(t.state, grad, kind, { lr, momentum, beta1, beta2 });
      const [x, y] = next.params, loss = quadratic(next.params).loss;
      return [kind, { state: next, path: [...t.path, { x, y }], losses: [...t.losses, { x: next.step, y: loss }], grad, delta: next.params.map((p, i) => p - t.state.params[i]), stopped: Math.abs(x) > 50 || Math.abs(y) > 50 }];
    })) as Record<OptimizerKind, Track>);
  }
  useEffect(() => {
    if (!running || !active) return;
    const timer = window.setInterval(step, 180);
    return () => clearInterval(timer);
  }, [running, active, lr, momentum, beta1, beta2]);
  useEffect(() => { if (!active) setRunning(false); }, [active]);
  useEffect(() => { if (kinds.every(k => tracks[k].stopped || tracks[k].state.step >= 160)) setRunning(false); }, [tracks]);
  const t = tracks[selected], n = t.state.step;
  function reset() { setRunning(false); setTracks(makeTracks()); }
  function change(setter: (n: number) => void, value: number) { setter(value); reset(); }
  return <>
    <p className="lesson-intro">Оптимизатор превращает <ConceptLink concept="gradient">градиент</ConceptLink> в изменение веса. Стохастический градиентный спуск (SGD), инерция (momentum) и Adam идут из одной точки по одной функции: L = ½(x² + 8y²). Здесь градиент вычисляется точно, без случайных мини-пакетов.</p>
    <p className="note">Разберите <ConceptLink concept="learning-rate">скорость обучения</ConceptLink> или отличие <ConceptLink concept="adamw">Adam от AdamW</ConceptLink>. При углублении или смене урока автоматические шаги останавливаются; продолжить можно кнопкой «Авто».</p>
    <div className="lab-grid">
      <section className="panel"><h3>Общий эксперимент</h3>
        <Range label="Скорость обучения η" value={lr} min={.01} max={.4} step={.01} onChange={v => change(setLr, v)} />
        <details><summary>Инерция и оценки Adam</summary><div className="controls">
          <Range label="Momentum μ" value={momentum} min={0} max={.99} step={.01} onChange={v => change(setMomentum, v)} />
          <Range label="Adam β₁" value={beta1} min={0} max={.99} step={.01} onChange={v => change(setBeta1, v)} />
          <Range label="Adam β₂" value={beta2} min={.8} max={.999} step={.001} onChange={v => change(setBeta2, v)} />
        </div></details>
        <div className="button-row"><button className="primary" onClick={step} disabled={running || kinds.every(k => tracks[k].stopped || tracks[k].state.step >= 160)}>Один шаг</button><button onClick={() => setRunning(v => !v)} disabled={!running && kinds.every(k => tracks[k].stopped || tracks[k].state.step >= 160)}>{running ? 'Пауза' : 'Авто'}</button><button onClick={reset}>Сброс</button></div>
        <p className="note">Изменение настройки перезапускает все траектории. Максимум 160 шагов. Попробуйте η = 0.30: SGD начнёт удаляться по крутой оси y.</p>
        <table className="data-table"><caption>Реальные координаты и потери</caption><thead><tr><th>Метод</th><th>Шаг</th><th>x; y</th><th>L</th></tr></thead><tbody>{kinds.map(k => <tr key={k}><th>{names[k]}</th><td>{tracks[k].state.step}</td><td>{tracks[k].state.params.map(v => fmt(v)).join('; ')}</td><td>{fmt(quadratic(tracks[k].state.params).loss)}{tracks[k].stopped && ' · остановлен: уход за |50|'}</td></tr>)}</tbody></table>
      </section>
      <section className="panel"><h3>Траектории на поверхности потерь</h3>
        <div className="surface-plot"><svg viewBox="0 0 440 290" role="img" aria-label="Траектории SGD, momentum и Adam на эллиптических линиях уровня L. Общий старт: x минус 3, y 1.5.">
          <defs><clipPath id="surface-clip"><rect x="45" y="15" width="365" height="225" /></clipPath></defs>
          <g clipPath="url(#surface-clip)">
            {[1, 3, 6, 10, 16].map(level => <ellipse key={level} cx="227.5" cy="127.5" rx={Math.sqrt(2 * level) * 45.625} ry={Math.sqrt(level / 4) * 56.25} fill="none" stroke="#d1dacf" />)}
            <line x1="45" x2="410" y1="127.5" y2="127.5" stroke="#bdc9be" /><line x1="227.5" x2="227.5" y1="15" y2="240" stroke="#bdc9be" />
            {kinds.map(k => <g key={k} stroke={colors[k]} fill={colors[k]}><path d={tracks[k].path.map((p, i) => `${i ? 'L' : 'M'}${227.5 + p.x * 45.625},${127.5 - p.y * 56.25}`).join(' ')} fill="none" strokeWidth="2.2" strokeDasharray={k === 'momentum' ? '5 3' : k === 'adam' ? '2 3' : undefined} /><circle cx={227.5 + tracks[k].state.params[0] * 45.625} cy={127.5 - tracks[k].state.params[1] * 56.25} r="4" /></g>)}
          </g><text x="45" y="259">−4</text><text x="223" y="259">0</text><text x="402" y="259">4</text><text x="7" y="21">2</text><text x="4" y="240">−2</text><text x="225" y="282">Вес x</text><text transform="translate(18 152) rotate(-90)">Вес y</text><text x="235" y="119">минимум</text>
        </svg></div>
        <div className="chart-legend">{kinds.map(k => <span key={k}><i style={{ background: colors[k] }} />{names[k]} · {k === 'sgd' ? 'сплошная' : k === 'momentum' ? 'штрихи' : 'точки'}</span>)}</div>
        <p className="note">Эллипсы — одинаковые значения L; центр — минимум (0, 0). График ограничен x ∈ [−4, 4], y ∈ [−2, 2]; таблица сохраняет координаты вне окна.</p>
      </section>
    </div>
    <details className="panel" onToggle={event => { if (event.currentTarget.open) setSceneOpened(true); }}><summary>3D: высота потери и пути трёх оптимизаторов</summary>
      <p>Представьте чашу. Два веса задают место на её основании, а высота — величину ошибки. Все три метода шагают по одной чаше. Поверните её: вдоль y склон круче, поэтому большой шаг легко переносит нас на другую сторону.</p>
      {sceneOpened && <Scene3D title="Оптимизаторы на поверхности L" description="Настоящая функция L=½(x²+8y²) и координаты всех выполненных шагов. Это два веса и значение потери, а не три веса. Координаты за пределами окна остаются в таблице расчётов." axes={[{label:'Вес x',min:-4,max:4},{label:'Вес y',min:-2,max:2},{label:'Потеря L',min:0,max:24}]} surfaces={[{name:'L = ½(x² + 8y²)',rows:functionSurface([-4,4],[-2,2],quadraticHeight),opacity:.28}]} lines={kinds.map(k=>({name:names[k],color:colors[k],dashed:k!=='sgd',points:tracks[k].path.map(point=>[point.x,point.y,quadraticHeight(point.x,point.y)] as const)}))} points={kinds.map(k=>({name:`${names[k]} · текущий шаг`,color:colors[k],position:[tracks[k].state.params[0],tracks[k].state.params[1],quadraticHeight(tracks[k].state.params[0],tracks[k].state.params[1])] as const}))} />}
      <p className="note">Плоские контуры выше — взгляд на эту же функцию сверху. Масштабы весов и высоты различаются; угол на экране не измеряет величину градиента. <ConceptLink concept="gradient">Как высота связана с градиентом?</ConceptLink></p>
    </details>
    <section className="panel"><h3>Градиент и шаг — разные числа</h3>
      <label>Разберите метод <select value={selected} onChange={e => setSelected(e.target.value as OptimizerKind)}>{kinds.map(k => <option key={k} value={k}>{names[k]}</option>)}</select></label>
      <div className="formula">Градиент перед последним шагом g = [{t.grad.map(v => fmt(v)).join('; ')}]<br />Изменение параметров Δθ = [{t.delta.map(v => fmt(v)).join('; ')}]<br />{selected === 'sgd' ? 'θₜ = θₜ₋₁ − ηgₜ' : selected === 'momentum' ? 'vₜ = μvₜ₋₁ + gₜ; θₜ = θₜ₋₁ − ηvₜ' : 'mₜ = β₁mₜ₋₁ + (1−β₁)gₜ; vₜ = β₂vₜ₋₁ + (1−β₂)gₜ²'}</div>
      {selected === 'adam' && <div className="formula">{n > 0 ? <>Шаг t = {n}: m̂ₓ = {fmt(t.state.m[0])} / {fmt(1 - beta1 ** n, 6)} = {fmt(t.state.m[0] / (1 - beta1 ** n))}<br />v̂ₓ = {fmt(t.state.v[0])} / {fmt(1 - beta2 ** n, 6)} = {fmt(t.state.v[0] / (1 - beta2 ** n))}</> : 'Сделайте шаг, чтобы увидеть поправку смещения оценок.'}<br />θₜ = θₜ₋₁ − η·m̂ₜ / (√v̂ₜ + 10⁻⁸)</div>}
      <details><summary>Зачем Adam исправляет смещение оценок?</summary><p>Adam хранит экспоненциальные средние градиента m и его квадрата v. Они начинают с нуля; ранние оценки занижены. Деление на 1−β₁ᵗ и 1−β₂ᵗ исправляет это начальное смещение. Это «bias correction» оценок, отдельное понятие от bias нейрона.</p><p>Инерция здесь использует v = μv + g, как SGD без dampening и Nesterov. Adam — без weight decay и AMSGrad. Быстрый прогресс на этом примере не гарантирует сходимость на любой задаче. Для этой поверхности SGD сходится при 0 &lt; η &lt; 0.25; это следует из множителя 1−8η по оси y.</p></details>
    </section>
    <Exercise question="У SGD градиент gₓ = −3, η = 0.1. Как изменится x?" options={['На −3', 'На +0.3', 'На −0.3']} correct={1} explanation="Обновление Δx = −ηgₓ = +0.3. Градиент указывает рост потери, шаг идёт в обратную сторону." />
  </>;
}

function initialExperiment(seed: number) {
  const state = createOptimizerState(createNetwork(seed));
  return { state, history: [{ x: 0, y: networkLossGradient(state.params).loss }] };
}

export function NetworkLesson() {
  const active = useLearningActive();
  const [sceneOpened, setSceneOpened] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false), [flowVisited, setFlowVisited] = useState(false);
  const [seed, setSeed] = useState(42), [lr, setLr] = useState(.03), [kind, setKind] = useState<OptimizerKind>('adam');
  const [experiment, setExperiment] = useState(() => initialExperiment(42)), [running, setRunning] = useState(false);
  const [sample, setSample] = useState(1), [hiddenNode, setHiddenNode] = useState(0);
  const pauseTraining = useCallback(() => setRunning(false), []);
  const { state, history } = experiment, result = networkLossGradient(state.params);
  function train(count: number) {
    setExperiment(old => {
      let next = old.state;
      const history = [...old.history];
      for (let i = 0; i < count && next.step < 4000; i++) {
        next = optimizerStep(next, networkLossGradient(next.params).grad, kind, { lr });
        if (next.step % 10 === 0 || count === 1) history.push({ x: next.step, y: networkLossGradient(next.params).loss });
      }
      if (history.at(-1)?.x !== next.step) history.push({ x: next.step, y: networkLossGradient(next.params).loss });
      return { state: next, history };
    });
  }
  useEffect(() => {
    if (!running || !active) return;
    const timer = setInterval(() => train(20), 120);
    return () => clearInterval(timer);
  }, [running, active, kind, lr]);
  useEffect(() => { if (!active) setRunning(false); }, [active]);
  useEffect(() => { if (state.step >= 4000) setRunning(false); }, [state.step]);
  function reset(newSeed = seed) { setRunning(false); setExperiment(initialExperiment(newSeed)); }
  const input = XOR_DATA[sample].input;
  const j = hiddenNode, p = state.params;
  const z = p[2 * j] * input[0] + p[2 * j + 1] * input[1] + p[8 + j];
  const hidden = Array.from({ length: 4 }, (_, i) => Math.tanh(p[2 * i] * input[0] + p[2 * i + 1] * input[1] + p[8 + i]));
  const logit = hidden.reduce((sum, h, i) => sum + p[12 + i] * h, p[16]);
  return <>
    <p className="lesson-intro">Сеть учится отделять один класс от другого. Сначала меняйте данные и размер сети в лаборатории границ; ниже разберите каждый шаг на небольшом примере XOR. Это два независимых эксперимента со своими весами.</p>
    <Suspense fallback={<section className="panel"><p role="status">Загружается лаборатория границ…</p></section>}>
      <BoundaryPlayground />
    </Suspense>
    <h3>Пошаговый пример: сеть XOR 2 → 4 → 1</h3>
    <p className="lesson-intro">Теперь весь цикл работает вместе: сеть 2 → 4 → 1 учится XOR — выдавать 1, когда два бита различаются. Четыре скрытых нейрона с tanh позволяют построить нелинейную границу. Каждый шаг: прямой проход, средняя <ConceptLink concept="cross-entropy">BCE от логитов</ConceptLink>, <ConceptLink concept="backpropagation">обратный проход</ConceptLink> и изменение всех 17 параметров.</p>
    <p className="note">Здесь все четыре примера участвуют в обучении. Для новой задачи нужны <ConceptLink concept="train-validation-test">раздельные выборки</ConceptLink> и <ConceptLink concept="evaluation">проверка качества</ConceptLink>. Углубление ставит автоматическое обучение на паузу и сохраняет веса.</p>
    <details className="panel" onToggle={event => {
      const open = event.currentTarget.open;
      setFlowOpen(open);
      if (open) { setFlowVisited(true); pauseTraining(); }
    }}><summary>3D: нейроны, связи и обучение по шагам</summary>
      {flowVisited && <LearningActivity active={flowOpen}><Suspense fallback={<p role="status">Загружается пошаговая схема сети…</p>}>
        <NetworkFlow3D state={state} kind={kind} lr={lr} sample={sample} onSample={setSample} onTrainStep={() => train(1)} onPause={pauseTraining} />
      </Suspense></LearningActivity>}
    </details>
    <div className="lab-grid"><section className="panel"><h3>Обучите маленькую сеть</h3>
      <div className="controls"><label>Начальное состояние (seed)<select value={seed} onChange={e => { const v = Number(e.target.value); setSeed(v); reset(v); }}>{[42, 7, 1, 1337].map(v => <option value={v} key={v}>{v}</option>)}</select></label>
      <label>Оптимизатор<select value={kind} onChange={e => { setKind(e.target.value as OptimizerKind); reset(); }}>{kinds.map(k => <option value={k} key={k}>{names[k]}</option>)}</select></label>
      <Range label="Скорость обучения η" value={lr} min={.005} max={.1} step={.005} onChange={v => { setLr(v); reset(); }} /></div>
      <div className="button-row"><button className="primary" disabled={running || state.step >= 4000} onClick={() => train(100)}>100 шагов</button><button disabled={running || state.step >= 4000} onClick={() => train(1)}>Один шаг</button><button disabled={!running && state.step >= 4000} onClick={() => setRunning(v => !v)}>{running ? 'Пауза' : 'Автообучение'}</button><button onClick={() => reset()}>Сброс</button></div>
      <p className="result" role="status">Шаг {state.step} · BCE <strong>{fmt(result.loss, 5)}</strong> · верных классов {result.predictions.filter((v, i) => Number(v >= .5) === XOR_DATA[i].target).length}/4</p>
      <p className="note">Одинаковый seed, метод и скорость дают тот же эксперимент после сброса. При Adam, η = 0.03 все предложенные seed решают XOR за 3000 шагов. Другие настройки могут обучаться медленнее.</p>
    </section><section className="panel"><h3>Потеря по мере обучения</h3><Chart series={[{ name: 'Средняя BCE', points: history }]} xLabel="Шаг оптимизатора" yLabel="Потеря L" xDomain={[0, Math.max(1, state.step)]} yDomain={[0, Math.max(...history.map(p => p.y)) * 1.05]} /><table className="data-table"><caption>Предсказания четырёх примеров · порог 0.5</caption><thead><tr><th>Вход</th><th>Цель</th><th>p(класс 1)</th><th>Класс</th></tr></thead><tbody>{XOR_DATA.map((d, i) => <tr key={i}><th>{d.input.join('; ')}</th><td>{d.target}</td><td>{fmt(result.predictions[i], 4)}</td><td>{Number(result.predictions[i] >= .5)} {Number(result.predictions[i] >= .5) === d.target ? '✓' : '×'}</td></tr>)}</tbody></table></section></div>
    <Suspense fallback={<section className="panel"><p role="status">Загружается граница решений…</p></section>}>
      <DecisionBoundaryLesson parameters={p} step={state.step} onPause={pauseTraining} onTrain={train} />
    </Suspense>
    <details className="panel"><summary>Как устроен проход сети?</summary><p>Для каждого примера h = tanh(W₁x + b₁), z = W₂h + b₂, p = σ(z). Потеря берёт z непосредственно. Производная по z — (p−y)/4. Затем ∂L/∂W₂ⱼ = (∂L/∂z)hⱼ, а через tanh назад идёт множитель 1−hⱼ². Вклады четырёх примеров суммируются перед одним шагом.</p><p>Псевдослучайный генератор задаёт начальные веса, данные и порядок фиксированы. Здесь нет dropout, мини-пакетов, автоматического графа, GPU или интеграции с Rust API.</p></details>
    <section className="panel"><h3>Разберите текущий прямой проход</h3><div className="controls inline-controls"><label>Пример<select value={sample} onChange={e => setSample(Number(e.target.value))}>{XOR_DATA.map((d, i) => <option value={i} key={i}>[{d.input.join('; ')}], y = {d.target}</option>)}</select></label><label>Скрытый нейрон<select value={hiddenNode} onChange={e => setHiddenNode(Number(e.target.value))}>{[0, 1, 2, 3].map(i => <option key={i} value={i}>h{i + 1}</option>)}</select></label></div><div className="formula">z{j + 1} = {fmt(p[2 * j])}·{input[0]} + {fmt(p[2 * j + 1])}·{input[1]} + {fmt(p[8 + j])} = {fmt(z)}<br />h{j + 1} = tanh({fmt(z)}) = {fmt(Math.tanh(z))}<br />z выхода = {hidden.map((h, i) => `(${fmt(p[12 + i])}·${fmt(h)})`).join(' + ')} + ({fmt(p[16])}) = {fmt(logit)}<br />p = σ({fmt(logit)}) = {fmt(result.predictions[sample], 5)}</div></section>
    <details className="panel" onToggle={event => { if (event.currentTarget.open) setSceneOpened(true); }}><summary>3D: как обученная сеть изгибает свой ответ</summary>
      <p>У двух входов есть место на плоскости. Поднимем каждое место на высоту ответа сети. После обучения противоположные углы должны оказаться внизу, два других — наверху: именно этого требует XOR.</p>
      {sceneOpened && <Scene3D title="Поверхность ответа XOR" description="Два входа и настоящая вероятность класса 1 из текущих 17 параметров сети. Высота является выходом, а не третьим входом. Сеть обучается только на четырёх углах." axes={[{label:'Вход x₁',min:0,max:1},{label:'Вход x₂',min:0,max:1},{label:'Вероятность класса 1',min:0,max:1}]} surfaces={[{name:'Текущий ответ сети',rows:functionSurface([0,1],[0,1],(a,b)=>networkHeight(a,b,p))}]} points={XOR_DATA.map(d=>({name:`[${d.input.join('; ')}] · цель ${d.target}`,position:[d.input[0],d.input[1],networkHeight(...d.input,p)] as const}))} />}
      <p className="note">Нажмите «100 шагов» выше — поверхность изменится вместе с весами. Карта цветов и таблица дают те же значения без вращения.</p>
    </details>
    <Exercise question="После сброса с тем же seed и настройками что произойдёт?" options={['Другие начальные веса', 'Те же веса и траектория обучения', 'Потеря сразу станет нулевой']} correct={1} explanation="Seed воспроизводит начальные параметры. Данные, порядок и вычисления здесь тоже фиксированы, поэтому повторяется весь эксперимент." />
  </>;
}
