import { CoreTopicFilm } from './CoreTopicFilms';
import { lazy, Suspense, useState } from 'react';
import { ActionExercise } from './ActionExercise';
import { ConceptLink } from './learning-context';
import { Chart, Range, fmt } from './ui';
import { bptt, trainBptt } from './bpttMath';
import './bptt-lab.css';

const RnnGradientGeometry = lazy(() => import('./RnnGradientGeometry').then(module => ({ default: module.RnnGradientGeometry })));

const initialInput = [0.8, -0.4, 0.6, 0.1];
const initialWeights = { wx: 0.8, wh: 0.7, b: 0.1 };
const initial = () => ({ input: [...initialInput], weights: { ...initialWeights }, h0: 0.1, target: -0.5 });
type TrainingReceipt = ReturnType<typeof trainBptt> & { oldWeights: typeof initialWeights; count: number; eta: number };

export function BpttLab() {
  const [lab, setLab] = useState(initial);
  const [processed, setProcessed] = useState(1);
  const [eta, setEta] = useState(0.05);
  const [receipt, setReceipt] = useState<TrainingReceipt | null>(null);
  const [lossHistory, setLossHistory] = useState<number[]>([]);
  const [completedBackward, setCompletedBackward] = useState(false);
  const [firstWeights, setFirstWeights] = useState<typeof initialWeights | null>(null);
  const [usedRequiredEta, setUsedRequiredEta] = useState(true);
  const [error, setError] = useState('');
  const [geometryOpen, setGeometryOpen] = useState(false), [geometryVisited, setGeometryVisited] = useState(false);
  const trace = bptt(lab.input, lab.weights, lab.target, lab.h0);
  const selectedIndex = lab.input.length - processed;
  const row = trace.steps[selectedIndex];
  const seen = trace.steps.slice(selectedIndex);
  const partial = seen.reduce((sum, step) => ({ wx: sum.wx + step.dWx, wh: sum.wh + step.dWh, b: sum.b + step.db }), { wx: 0, wh: 0, b: 0 });
  const complete = processed === lab.input.length;

  function change(next: typeof lab) {
    setLab(next); setProcessed(1); setReceipt(null); setLossHistory([]); setCompletedBackward(false);
    setFirstWeights(null); setUsedRequiredEta(true); setError('');
  }
  function reveal(count: number) {
    setProcessed(count);
    if (count === lab.input.length) setCompletedBackward(true);
  }
  function train(count: number) {
    try {
      const result = trainBptt(lab.input, lab.weights, lab.target, lab.h0, eta, count);
      setReceipt({ ...result, oldWeights: { ...lab.weights }, count, eta });
      setFirstWeights(previous => previous ?? { ...lab.weights });
      setUsedRequiredEta(previous => previous && eta === 0.05);
      setLab({ ...lab, weights: result.weights });
      setLossHistory(previous => previous.length ? [...previous, ...result.losses.slice(1)] : result.losses);
      setProcessed(1); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Расчёт не выполнен.');
    }
  }
  function preset(kind: 'vanish' | 'grow' | 'saturate') {
    change({ input: Array(12).fill(0), h0: 0, target: 0.5,
      weights: { wx: 0.8, wh: kind === 'vanish' ? 0.5 : 1.6, b: kind === 'saturate' ? 2 : 0 } });
  }
  return <CoreTopicFilm slug="bptt" current={{ lab, processed, eta, receipt, lossHistory, completedBackward, firstWeights, usedRequiredEta, error, geometryOpen, geometryVisited }} example={{ lab: initial(), processed: 1, eta: .05, receipt: null, lossHistory: [], completedBackward: false, firstWeights: null, usedRequiredEta: true, error: '', geometryOpen: geometryOpen, geometryVisited: geometryVisited }} restore={value => { setLab(value.lab);setProcessed(value.processed);setEta(value.eta);setReceipt(value.receipt);setLossHistory(value.lossHistory);setCompletedBackward(value.completedBackward);setFirstWeights(value.firstWeights);setUsedRequiredEta(value.usedRequiredEta);setError(value.error);setGeometryOpen(value.geometryOpen);setGeometryVisited(value.geometryVisited); }}><section className="bptt-lab" aria-label="Обучение RNN: обратный проход по времени">
    <h3>BPTT: как ошибка последнего состояния учит общие веса</h3>
    <p>Одна скалярная tanh-ячейка проходит всю последовательность. Ошибка есть только в конце:
      L = ½(hᵀ − y)². BPTT (Backpropagation Through Time) — <ConceptLink concept="backpropagation">обратный проход</ConceptLink> по
      развёрнутой цепочке, от t=T до t=1. На каждом времени копия ячейки использует те же Wx, Wh и b.</p>
    <p className="note">Это отдельный опыт от RNN выше. Здесь нет выходного слоя или промежуточных потерь;
      h₀ и входы фиксированы во время SGD. Время t — индекс последовательности, все величины безразмерны.</p>
    <div className="lab-grid">
      <section className="panel controls"><h3>Последовательность и общая ячейка</h3>
        <Range label="Длина T" value={lab.input.length} min={4} max={16} step={1} onChange={length => change({ ...lab, input: Array.from({ length }, (_, i) => lab.input[i] ?? 0) })} />
        {(['wx', 'wh', 'b'] as const).map(key => {
          const bound = Math.max(3, Math.ceil(Math.abs(lab.weights[key])));
          return <Range key={key} label={{ wx: 'Общий входной вес Wx', wh: 'Общий рекуррентный вес Wh', b: 'Общее смещение b' }[key]}
            value={lab.weights[key]} min={-bound} max={bound} step={0.001} onChange={value => change({ ...lab, weights: { ...lab.weights, [key]: value } })} />;
        })}
        <Range label="Начальное состояние h₀" value={lab.h0} min={-1} max={1} step={0.001} onChange={h0 => change({ ...lab, h0 })} />
        <Range label="Цель y для hᵀ" value={lab.target} min={-1} max={1} step={0.001} onChange={target => change({ ...lab, target })} />
        <details><summary>Изменить каждый вход xₜ</summary><div className="controls">
          {lab.input.map((value, i) => <Range key={i} label={`Вход x${i + 1}`} value={value} min={-2} max={2} step={0.001}
            onChange={x => change({ ...lab, input: lab.input.map((old, j) => j === i ? x : old) })} />)}
        </div></details>
        <p className="note">Числа в формулах округлены; расчёт и SGD используют полную точность.
          Изменение данных или весов начинает новый опыт. SGD не округляет и не обрезает веса.</p>
      </section>
      <section className="panel"><h3>Forward: состояния и конечная ошибка</h3>
        <p className="formula">zₜ = Wx xₜ + Wh hₜ₋₁ + b; hₜ = tanh(zₜ)<br />
          hᵀ = {fmt(trace.prediction, 6)}; y = {fmt(lab.target)}<br />
          L = ½({fmt(trace.prediction, 6)} − ({fmt(lab.target)}))² = {fmt(trace.loss, 6)}</p>
        <Chart xLabel="Время t (индекс)" yLabel="Скрытое состояние hₜ" xDomain={[0, lab.input.length]} yDomain={[-1, 1]} series={[
          { name: 'hₜ', points: [{ x: 0, y: lab.h0 }, ...trace.steps.map(s => ({ x: s.t, y: s.h }))] },
          { name: 'Цель только при t=T', points: [{ x: lab.input.length, y: lab.target }], dashed: true },
        ]} />
        <p>Начало backward: gᵀ = ∂L/∂hᵀ = hᵀ − y = {fmt(trace.prediction - lab.target, 6)}.</p>
      </section>
    </div>
    <section className="panel"><h3>Backward: текущий шаг t={row.t}</h3>
      <p>Раскрыто {processed} из {lab.input.length} шагов, начиная с конца. gₜ = ∂L/∂hₜ,
        δₜ = ∂L/∂zₜ. На каждом шаге используем <ConceptLink concept="chain-rule">правило цепочки</ConceptLink>.</p>
      <div className="button-row">
        <button type="button" disabled={complete} onClick={() => reveal(processed + 1)}>Следующий backward: t={Math.max(1, row.t - 1)}</button>
        <button type="button" disabled={complete} onClick={() => reveal(lab.input.length)}>Раскрыть весь backward</button>
        <button type="button" onClick={() => setProcessed(1)}>Снова от t=T</button>
      </div>
      <Range label="Время t для численного разбора" value={row.t} min={1} max={lab.input.length} step={1} onChange={t => reveal(lab.input.length - t + 1)} />
      <p className="formula">z{row.t} = {fmt(lab.weights.wx, 6)} × ({fmt(row.x)}) + {fmt(lab.weights.wh, 6)} × ({fmt(row.previous, 6)}) + ({fmt(lab.weights.b, 6)}) = {fmt(row.z, 6)}<br />
        h{row.t} = tanh({fmt(row.z, 6)}) = {fmt(row.h, 6)}<br />
        g{row.t} = {row.t === lab.input.length ? `h${row.t} − y` : `Wh × δ${row.t + 1}`} = {fmt(row.dh, 6)}<br />
        tanh′(z{row.t}) = 1 − h{row.t}² = {fmt(row.tanhDerivative, 6)}<br />
        δ{row.t} = g{row.t} × tanh′(z{row.t}) = {fmt(row.dh, 6)} × {fmt(row.tanhDerivative, 6)} = {fmt(row.dz, 6)}<br />
        ∂L/∂x{row.t} = Wx × δ{row.t} = {fmt(lab.weights.wx, 6)} × ({fmt(row.dz, 6)}) = {fmt(row.dx, 6)}<br />
        g{row.t - 1} = Wh × δ{row.t} = {fmt(lab.weights.wh, 6)} × ({fmt(row.dz, 6)}) = {fmt(row.dhPrevious, 6)}<br />
        Вклады времени {row.t}: dWx = δ{row.t} x{row.t} = {fmt(row.dWx, 6)}; dWh = δ{row.t} h{row.t - 1} = {fmt(row.dWh, 6)}; db = δ{row.t} = {fmt(row.db, 6)}</p>
      <p className="formula">{complete ? 'Полная сумма по t=1…T' : `Промежуточная сумма по t=${row.t}…T`}:<br />
        ∂L/∂Wx = {fmt(partial.wx, 6)}; ∂L/∂Wh = {fmt(partial.wh, 6)}; ∂L/∂b = {fmt(partial.b, 6)}<br />
        {complete ? `∂L/∂h₀ = ${fmt(trace.dh0, 6)}; h₀ здесь не обучается.` : 'Для SGD нужны вклады всех времён: дойдите до t=1.'}</p>
      <div className="bptt-table-scroll" tabIndex={0} role="region" aria-label="Таблица всех времён BPTT, горизонтальная прокрутка">
        <table className="data-table"><caption>Все шаги · «…» означает ещё не раскрытый backward</caption>
          <thead><tr><th scope="col">t и этап</th><th scope="col">xₜ</th><th scope="col">hₜ₋₁</th><th scope="col">zₜ</th><th scope="col">hₜ</th><th scope="col">tanh′</th><th scope="col">Wh tanh′</th><th scope="col">gₜ</th><th scope="col">δₜ</th><th scope="col">dL/dxₜ</th><th scope="col">Вклад dWx</th><th scope="col">Вклад dWh</th><th scope="col">Вклад db</th></tr></thead>
          <tbody>{trace.steps.map((s, i) => <tr key={s.t} className={i === selectedIndex ? 'bptt-selected' : undefined}>
            <th scope="row">{s.t}{i === selectedIndex ? ' · текущий' : i >= selectedIndex ? ' · раскрыт' : ''}</th>
            {[s.x, s.previous, s.z, s.h, s.tanhDerivative, s.recurrentDerivative].map((v, j) => <td key={j}>{fmt(v, 6)}</td>)}
            {[s.dh, s.dz, s.dx, s.dWx, s.dWh, s.db].map((v, j) => <td key={j}>{i >= selectedIndex ? fmt(v, 6) : '…'}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="panel"><h3>Почему ранние градиенты затухают или растут</h3>
      <p>gₜ₋₁ = gₜ × Wh × (1 − hₜ²). Поэтому gₜ содержит произведение множителей следующих времён.
        tanh′ лежит в [0, 1]: насыщение около ±1 подавляет градиент. Большой |Wh| может усиливать его,
        пока состояния не вошли в насыщение; одного |Wh| &gt; 1 для роста недостаточно.</p>
      <div className="button-row">
        <button type="button" onClick={() => preset('vanish')}>Опыт: затухание, Wh=0,5</button>
        <button type="button" onClick={() => preset('grow')}>Опыт: рост, Wh=1,6</button>
        <button type="button" onClick={() => preset('saturate')}>Опыт: насыщение, b=2</button>
      </div>
      <p className="note">Кнопки начинают новый опыт: T=12, все xₜ=0, h₀=0, y=0,5, Wx=0,8.
        В первых двух b=0 и hₜ=0, поэтому tanh′=1: видно действие Wh. В третьем b=2 и tanh насыщается.</p>
      <Chart xLabel="Время t (индекс)" yLabel="log₁₀ |∂L/∂hₜ|" xDomain={[0, lab.input.length]} series={[
        { name: 'Весь вычисленный градиент', points: [{ x: 0, y: trace.dh0 }, ...trace.steps.map(s => ({ x: s.t, y: s.dh }))]
          .filter(p => p.y !== 0).map(p => ({ x: p.x, y: Math.log10(Math.abs(p.y)) })) },
      ]} />
      <p className="note">Чем ниже точка, тем меньше модуль градиента: −6 означает 10⁻⁶, 0 означает 1.
        Нулевой градиент на логарифмической оси не рисуется; его точное значение есть в таблице после раскрытия.
        Этот график показывает весь рассчитанный backward. Подставьте Wh=0: ранние состояния потеряют влияние на loss.</p>
    </section>
    <details className="panel" onToggle={event => { setGeometryOpen(event.currentTarget.open); if (event.currentTarget.open) setGeometryVisited(true); }}>
      <summary>Опыт: локальный множитель градиента, плоский срез и 3D</summary>
      {geometryVisited && <Suspense fallback={<p role="status">Загружается геометрия RNN…</p>}>
        <RnnGradientGeometry t={row.t} x={row.x} previous={row.previous} weights={lab.weights} open={geometryOpen} />
      </Suspense>}
    </details>
    <section className="panel"><h3>Обновить общие веса настоящим SGD</h3>
      <Range label="Размер шага η" value={eta} min={0.001} max={0.2} step={0.001} onChange={setEta} />
      <div className="button-row">
        <button type="button" disabled={!complete} onClick={() => train(1)}>Один шаг SGD</button>
        <button type="button" disabled={!complete} onClick={() => train(10)}>10 шагов SGD</button>
        <button type="button" onClick={() => { change(initial()); setEta(0.05); }}>Вернуть начальный опыт</button>
      </div>
      <p className="note">{complete ? 'Полная сумма раскрыта: можно обновить веса.' : 'Сначала раскройте backward до t=1.'}
        {' '}θ ← θ − η ∂L/∂θ для θ = Wx, Wh, b. Каждый шаг пакета заново считает forward и backward.
        Большой η может повысить loss; здесь нет скрытого clipping или подбора шага.</p>
      {error && <p role="alert">{error} Текущие веса сохранены.</p>}
      {receipt && <>
        <p className="result" role="status">Последние {receipt.count} шагов: L {fmt(receipt.before.loss, 6)} → {fmt(receipt.after.loss, 6)}.
          {receipt.after.loss < receipt.before.loss ? ' Ошибка уменьшилась.' : receipt.after.loss > receipt.before.loss ? ' Ошибка выросла: попробуйте меньший η.' : ' Ошибка не изменилась.'}</p>
        <div className="bptt-table-scroll" tabIndex={0} role="region" aria-label="Изменения весов после SGD">
          <table className="data-table"><caption>Последнее обновление · η={fmt(receipt.eta)} · h₀ и входы фиксированы</caption>
            <thead><tr><th scope="col">Параметр</th><th scope="col">До</th><th scope="col">Градиент первого шага</th><th scope="col">После {receipt.count} шагов</th></tr></thead>
            <tbody>{(['wx', 'wh', 'b'] as const).map(key => <tr key={key}><th scope="row">{key}</th><td>{fmt(receipt.oldWeights[key], 6)}</td><td>{fmt(receipt.before.gradients[key], 6)}</td><td>{fmt(receipt.weights[key], 6)}</td></tr>)}</tbody>
          </table>
        </div>
      </>}
      {lossHistory.length > 1 && <Chart xLabel="Шаг SGD" yLabel="L = ½(hᵀ − y)²" series={[{ name: 'Текущий опыт', points: lossHistory.map((y, x) => ({ x, y })) }]} />}
    </section>
    <ActionExercise title="Пройти цепочку и снизить ошибку" goal="Раскройте backward до t=1 и выполните один или несколько шагов SGD при η=0,05. Ошибка должна стать меньше начальной; входы, цель и h₀ сохраняйте."
      startingConditions="T=4, x=[0,8; −0,4; 0,6; 0,1], Wx=0,8, Wh=0,7, b=0,1, h₀=0,1, y=−0,5, η=0,05."
      hint="Сначала нажмите «Следующий backward» до t=1 или раскройте всю цепочку. Затем нажмите «Один шаг SGD». Веса меняются по сумме вкладов всех четырёх времён."
      onStart={() => { change(initial()); setEta(0.05); }}
      stateKey={JSON.stringify([lab, eta, processed, completedBackward, receipt, lossHistory.length, firstWeights, usedRequiredEta])}
      check={() => {
        const fixed = lab.h0 === 0.1 && lab.target === -0.5 && eta === 0.05 && JSON.stringify(lab.input) === JSON.stringify(initialInput);
        const validTraining = usedRequiredEta && !!firstWeights && (['wx', 'wh', 'b'] as const).every(key => firstWeights[key] === initialWeights[key]);
        const passed = fixed && validTraining && completedBackward && !!receipt && lossHistory.length > 1 && trace.loss < lossHistory[0];
        return { passed, feedback: !fixed ? 'Верните заданные входы, h₀, цель и η=0,05; веса меняйте кнопкой SGD.' : passed
          ? `Полный backward раскрыт и SGD выполнен: L ${fmt(lossHistory[0], 6)} → ${fmt(trace.loss, 6)}.`
          : receipt && !validTraining ? 'Начните задание заново: SGD должен начинаться с заданных весов, и все выполненные шаги должны использовать η=0,05.'
          : 'Нужно раскрыть всю цепочку и выполнить SGD со снижением L. Ручное изменение весов начинает новый опыт и не засчитывает шаг.' };
      }} />
    <p className="note">Дальше: <ConceptLink concept="gradient">градиент</ConceptLink> и <ConceptLink concept="learning-rate">размер шага</ConceptLink>.
      {' '}Источники: <a href="https://www.deeplearningbook.org/contents/rnn.html" target="_blank" rel="noreferrer">Deep Learning, §10.2.2 и §10.7</a>;{' '}
      <a href="https://arxiv.org/abs/1211.5063" target="_blank" rel="noreferrer">Pascanu, Mikolov, Bengio: трудности обучения RNN</a>.</p>
  </section></CoreTopicFilm>;
}
