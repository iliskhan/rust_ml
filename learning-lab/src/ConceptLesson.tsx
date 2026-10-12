import { lazy, Suspense, useId, useState } from 'react';
import { ConceptLink } from './learning-context';
import { conceptSources, getConcept, type ConceptDemo } from './concepts';
import { Chart, Range, fmt } from './ui';
import { bernoulli, chainSquare, crossEntropyLogits, descent1D, dotProduct, finiteDifference, linear, mse, normalize, quadratic, regressionErrors, regressionPrediction, regressionTrain, regressionValidation, secant, sharedGraph, stableSoftmax } from './conceptMath';
import './concept-lessons.css';
import { Scene3D } from './ThreeD';
import { functionSurface, quadraticHeight, quadraticTangent } from './lessonSceneMath';
import { PracticeSection } from './practice/PracticeCloudProvider';
const AdvancedConceptExperiment = lazy(() => import('./AdvancedConceptLesson').then(module => ({ default: module.AdvancedConceptExperiment })));

const samples = (min: number, max: number, fn: (x: number) => number) => Array.from({ length: 101 }, (_, i) => { const x = min + (max - min) * i / 100; return { x, y: fn(x) }; });
const vectorText = (values: number[]) => `(${values.map(v => fmt(v)).join('; ')})`;

export function ConceptLesson({ id }: { id: string }) {
  const concept = getConcept(id);
  if (!concept) return <p>Такого понятия пока нет в учебнике. Вернитесь к предыдущему разбору.</p>;
  const source = conceptSources[concept.source];
  return <div className="concept-lesson" data-concept={id}>
    <p className="concept-idea">{concept.idea}</p>
    {concept.prerequisites.length > 0 && <div className="concept-prerequisites"><span>Если хочется на шаг глубже:</span><div>{concept.prerequisites.map(prerequisite => <ConceptLink key={prerequisite} concept={prerequisite}>{getConcept(prerequisite)!.title.split(':')[0]}</ConceptLink>)}</div></div>}
    <section className="concept-example"><h3>Один конкретный пример</h3><p>{concept.example}</p></section>
    <p className="concept-action"><strong>Попробуйте.</strong> {concept.observe}</p>
    {concept.demo && <ConceptExperiment kind={concept.demo} />}
    <details className="concept-formal"><summary>Точная запись и обозначения</summary><p>{concept.formal}</p></details>
    <aside className="concept-boundary"><strong>Где заканчивается этот пример</strong><p>{concept.limits}</p></aside>
    <p className="concept-source"><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></p>
    <PracticeSection lessonId="math" topicId={`concept.${id}`} />
  </div>;
}

function ConceptExperiment({ kind }: { kind: ConceptDemo }) {
  switch (kind) {
    case 'function': return <DerivativeDemo simple />;
    case 'derivative': return <DerivativeDemo />;
    case 'gradient': return <GradientDemo />;
    case 'chain': return <ChainDemo />;
    case 'vector': return <VectorDemo />;
    case 'matrix': return <MatrixDemo />;
    case 'probability': return <ProbabilityDemo />;
    case 'exponential': return <ExponentialDemo />;
    case 'softmax': return <SoftmaxDemo />;
    case 'normalization': return <NormalizationDemo />;
    case 'loss': return <LossDemo />;
    case 'rate': return <RateDemo />;
    case 'backprop': return <BackpropDemo />;
    case 'overfitting': return <OverfittingDemo />;
    case 'gaussian':
    case 'kl':
    case 'reparameterization':
    case 'variational':
    case 'adversarial':
    case 'noise':
    case 'score':
    case 'graph':
    case 'discount':
    case 'bellman': return <Suspense fallback={<p role="status">Загружаем эксперимент…</p>}><AdvancedConceptExperiment kind={kind} /></Suspense>;
  }
}

function DerivativeDemo({ simple = false }: { simple?: boolean }) {
  const [x, setX] = useState(2), [distance, setDistance] = useState(.8), [side, setSide] = useState(1);
  const h = distance * side, result = secant(x, h);
  return <section className="concept-experiment" aria-label={simple ? 'График функции' : 'Секущая и касательная'}>
    <Range label="Вход x" value={x} min={-2} max={2} step={.05} onChange={setX} />
    {!simple && <><Range label="Расстояние h до второй точки" value={distance} min={.001} max={1} step={.001} onChange={setDistance} />
      <div className="button-row"><button aria-pressed={side === 1} onClick={() => setSide(1)}>Справа: +h</button><button aria-pressed={side === -1} onClick={() => setSide(-1)}>Слева: −h</button></div></>}
    <Chart series={[
      { name: 'f(x) = x²', points: samples(-3, 3, t => t * t) },
      ...(!simple ? [
        { name: `Касательная · наклон ${fmt(result.derivative)}`, points: samples(-3, 3, t => result.y + result.derivative * (t - x)), color: '#6a52a0', dashed: true },
        { name: `Секущая · наклон ${fmt(result.slope)}`, points: samples(-3, 3, t => result.y + result.slope * (t - x)), color: '#b75d24' },
        { name: 'Вторая точка', points: [{ x: x + h, y: result.nextY }], color: '#b75d24' },
      ] : []),
      { name: 'Текущая точка', points: [{ x, y: result.y }], color: '#27694e' },
    ]} xLabel="Вход x" yLabel="Выход f(x)" xDomain={[-3, 3]} />
    <div className="concept-numbers"><span>f({fmt(x)}) <strong>{fmt(result.y)}</strong></span>{!simple && <><span>Секущая <strong>{fmt(result.slope, 4)}</strong></span><span>Производная 2x <strong>{fmt(result.derivative)}</strong></span></>}</div>
    {!simple && <p className="concept-live">[{fmt(result.nextY, 6)} − {fmt(result.y, 6)}] / ({fmt(h, 4)}) = {fmt(result.slope, 4)}. Разница наклонов: {fmt(Math.abs(h), 4)}.</p>}
  </section>;
}

function GradientDemo() {
  const [sceneOpened, setSceneOpened] = useState(false);
  const [x, setX] = useState(2), [y, setY] = useState(1), [eta, setEta] = useState(.1), [angle, setAngle] = useState(45);
  const { loss, grad } = quadratic([x, y]);
  const next = [x - eta * grad[0], y - eta * grad[1]], after = quadratic(next).loss;
  const norm = Math.hypot(...grad), direction = [Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180)];
  const slope = dotProduct(grad, direction).value;
  const key = useId().replace(/:/g, ''), px = (v: number) => 170 + v * 45, py = (v: number) => 160 - v * 45;
  return <section className="concept-experiment" aria-label="Градиент на контурах поверхности">
    <div className="concept-two"><Range label="Координата x" value={x} min={-2.5} max={2.5} step={.1} onChange={setX} /><Range label="Координата y" value={y} min={-2} max={2} step={.1} onChange={setY} /></div>
    <Range label="Размер шага η" value={eta} min={0} max={.3} step={.01} onChange={setEta} />
    <Range label="Проверяемое направление u: угол в градусах" value={angle} min={-180} max={180} step={5} onChange={setAngle} />
    <svg className="concept-plane" viewBox="0 0 340 350" role="img" aria-label={`Контуры L=½(x²+8y²). Точка ${vectorText([x, y])}, градиент ${vectorText(grad)}, следующий вес ${vectorText(next)}.`}>
      <defs><clipPath id={`${key}-clip`}><rect x="35" y="25" width="270" height="270" /></clipPath><marker id={`${key}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 Z" fill="context-stroke" /></marker></defs>
      <g clipPath={`url(#${key}-clip)`}>
        <rect x="35" y="25" width="270" height="270" fill="#f5f8f2" />
        {[1, 3, 6, 12, 24, 36].reverse().map(level => <ellipse key={level} cx={170} cy={160} rx={Math.sqrt(2 * level) * 45} ry={Math.sqrt(level / 4) * 45} fill="none" stroke="#bbcbbb" />)}
        <line x1="35" x2="305" y1="160" y2="160" stroke="#91a391" /><line x1="170" x2="170" y1="25" y2="295" stroke="#91a391" />
        <line x1={px(x)} y1={py(y)} x2={px(next[0])} y2={py(next[1])} stroke="#27694e" strokeWidth="3" markerEnd={`url(#${key}-arrow)`} />
        {norm > 0 && <line x1={px(x)} y1={py(y)} x2={px(x + grad[0] / norm * .65)} y2={py(y + grad[1] / norm * .65)} stroke="#b75d24" strokeWidth="2.5" markerEnd={`url(#${key}-arrow)`} />}
        <line x1={px(x)} y1={py(y)} x2={px(x + direction[0] * .7)} y2={py(y + direction[1] * .7)} stroke="#6a52a0" strokeWidth="2" strokeDasharray="4 3" markerEnd={`url(#${key}-arrow)`} />
        <circle cx={px(x)} cy={py(y)} r="5" fill="#203e31" /><circle cx={px(next[0])} cy={py(next[1])} r="5" fill="white" stroke="#27694e" strokeWidth="2" />
        <text x="176" y="178">минимум</text>
      </g>
      {[-3, 0, 3].map(t => <g key={t}><text x={px(t)} y="315" textAnchor="middle">{t}</text><text x="26" y={py(t) + 4} textAnchor="end">{t}</text></g>)}
      <text x="170" y="340" textAnchor="middle">Координата x</text><text transform="translate(12 160) rotate(-90)" textAnchor="middle">y</text>
    </svg>
    <div className="chart-legend"><span><i style={{ background: '#b75d24' }} />∇L: рост · длина условная</span><span><i style={{ background: '#27694e' }} />−η∇L: настоящий шаг</span><span><i style={{ background: '#6a52a0' }} />u: пунктир</span></div>
    <div className="concept-numbers"><span>∇L=(x;8y)<strong>{vectorText(grad)}</strong></span><span>Наклон вдоль u<strong>{fmt(slope)}</strong></span><span>L до → после<strong>{fmt(loss)} → {fmt(after)}</strong></span></div>
    <p className="concept-live">Шаг ведёт в {vectorText(next)}. {after < loss ? 'Потеря уменьшилась.' : after > loss ? 'Потеря выросла: для этой точки шаг слишком велик.' : 'Потеря не изменилась.'} Контуры — вид сверху на поверхность, не траектория обучения.</p>
    <details onToggle={event => { if (event.currentTarget.open) setSceneOpened(true); }}><summary>3D: поверхность и её касательная плоскость</summary>
      <p>Поднимем каждую пару (x,y) на высоту L. Маленькая плоская площадка касается чаши в выбранной точке: её наклоны по x и y — числа из градиента. Чаша изгибается, поэтому далеко от точки площадка уже ошибается.</p>
      {sceneOpened && <Scene3D title="Градиент и касательная плоскость" description="Чаша L=½(x²+8y²), локальная касательная плоскость и конечный шаг SGD. Градиент (x,8y) живёт в плоскости двух параметров; соединение двух точек на чаше показывает шаг, а не трёхмерный градиент." axes={[{label:'Параметр x',min:-3,max:3},{label:'Параметр y',min:-3,max:3},{label:'L / касательная оценка',min:-5,max:41}]} surfaces={[{name:'Настоящая потеря L',rows:functionSurface([-3,3],[-3,3],quadraticHeight),opacity:.23},{name:'Локальная касательная',rows:functionSurface([x-.4,x+.4],[y-.4,y+.4],(a,b)=>quadraticTangent(a,b,x,y),4),color:'#b75d24',opacity:.5}]} lines={[{name:'Конечный шаг SGD · хорда',points:[[x,y,loss],[next[0],next[1],after]],color:'#27694e'},{name:'Касательная вдоль u',points:[-.35,.35].map(s=>[x+s*direction[0],y+s*direction[1],loss+s*slope] as const),color:'#6a52a0',dashed:true}]} points={[{name:'Точка касания',position:[x,y,loss]},{name:'После SGD',position:[next[0],next[1],after]}]} />}
      <p className="formula">T(X,Y) = {fmt(loss)} + ({fmt(grad[0])})·(X−{fmt(x)}) + ({fmt(grad[1])})·(Y−{fmt(y)})</p>
      <p>На следующем шаге плоскость предсказывает {fmt(quadraticTangent(next[0],next[1],x,y))}, а настоящая чаша даёт {fmt(after)}. Даже отрицательная оценка плоскости допустима: это местное приближение, потеря L остаётся неотрицательной.</p>
    </details>
    <p>Компоненты градиента — это <ConceptLink concept="derivative">производные</ConceptLink>; его применение зависит от <ConceptLink concept="learning-rate">размера шага</ConceptLink>.</p>
  </section>;
}

function ChainDemo() {
  const [x, setX] = useState(1), [a, setA] = useState(3);
  const result = chainSquare(x, a);
  return <section className="concept-experiment" aria-label="Правило цепочки в числах">
    <Range label="Вход x" value={x} min={-2} max={2} step={.1} onChange={setX} /><Range label="Множитель a" value={a} min={-3} max={3} step={.1} onChange={setA} />
    <div className="concept-flow"><div><small>Вход</small><strong>x={fmt(x)}</strong></div><b aria-hidden="true">→</b><div><small>Умножить на {fmt(a)}, добавить 1</small><strong>u={fmt(result.u)}</strong></div><b aria-hidden="true">→</b><div><small>Возвести в квадрат</small><strong>y={fmt(result.y)}</strong></div></div>
    <div className="concept-numbers"><span>du/dx<strong>{fmt(a)}</strong></span><span>dy/du=2u<strong>{fmt(result.localOuter)}</strong></span><span>dy/dx: произведение<strong>{fmt(result.derivative)}</strong></span></div>
    <p className="concept-live">Назад по цепочке: {fmt(result.localOuter)} × {fmt(a)} = {fmt(result.derivative)}. <ConceptLink concept="backpropagation">А если путей несколько?</ConceptLink></p>
  </section>;
}

function VectorDemo() {
  const [x1, setX1] = useState(2), [x2, setX2] = useState(1), [w1, setW1] = useState(1), [w2, setW2] = useState(-1);
  const x = [x1, x2], w = [w1, w2], result = dotProduct(x, w), key = useId().replace(/:/g, '');
  return <section className="concept-experiment" aria-label="Два вектора и скалярное произведение">
    <div className="concept-two"><Range label="x₁" value={x1} min={-3} max={3} onChange={setX1} /><Range label="x₂" value={x2} min={-3} max={3} onChange={setX2} /><Range label="w₁" value={w1} min={-3} max={3} onChange={setW1} /><Range label="w₂" value={w2} min={-3} max={3} onChange={setW2} /></div>
    <svg className="concept-plane" viewBox="0 0 340 335" role="img" aria-label={`Вектор x ${vectorText(x)}, вектор w ${vectorText(w)}, скалярное произведение ${fmt(result.value)}`}>
      <defs><marker id={`${key}-v`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="context-stroke" /></marker></defs>
      {[-3, -2, -1, 0, 1, 2, 3].map(t => <g key={t}><line x1={170 + t * 43} x2={170 + t * 43} y1="26" y2="284" stroke="#dce4d8" /><line x1="41" x2="299" y1={155 - t * 43} y2={155 - t * 43} stroke="#dce4d8" /></g>)}
      <line x1="32" x2="308" y1="155" y2="155" stroke="#9aac9c" /><line x1="170" x2="170" y1="18" y2="293" stroke="#9aac9c" />
      {[{ v: x, color: '#27694e', label: 'x', dy: -9 }, { v: w, color: '#b75d24', label: 'w', dy: 17 }].map(({ v, color, label, dy }) => <g key={label}><line x1="170" y1="155" x2={170 + v[0] * 43} y2={155 - v[1] * 43} stroke={color} strokeWidth="3" markerEnd={`url(#${key}-v)`} /><text x={170 + v[0] * 43} y={155 - v[1] * 43 + dy} fill={color}>{label}</text></g>)}
      <text x="35" y="313">−3</text><text x="168" y="313">0</text><text x="295" y="313">3</text><text x="306" y="150">x₁</text><text x="178" y="19">x₂</text>
    </svg>
    <div className="concept-numbers"><span>Длина x<strong>{fmt(Math.hypot(...x))}</strong></span><span>Длина w<strong>{fmt(Math.hypot(...w))}</strong></span><span>x·w<strong>{fmt(result.value)}</strong></span></div>
    <p className="concept-live">({fmt(x1)})·({fmt(w1)}) + ({fmt(x2)})·({fmt(w2)}) = {fmt(result.terms[0])} + ({fmt(result.terms[1])}) = {fmt(result.value)}.</p>
  </section>;
}

function MatrixDemo() {
  const [x1, setX1] = useState(2), [x2, setX2] = useState(1), [a, setA] = useState(1), [b, setB] = useState(2);
  const input = [x1, x2], weights = [[a, b], [-1, 1]], out = linear([input], weights, [0, 0])[0];
  return <section className="concept-experiment" aria-label="Умножение матрицы на вектор">
    <div className="concept-two"><Range label="Вход x₁" value={x1} min={-3} max={3} onChange={setX1} /><Range label="Вход x₂" value={x2} min={-3} max={3} onChange={setX2} /><Range label="W₁₁: первая строка, первый столбец" value={a} min={-3} max={3} onChange={setA} /><Range label="W₁₂: первая строка, второй столбец" value={b} min={-3} max={3} onChange={setB} /></div>
    <div className="concept-matrix"><div><small>W · форма [2,2]</small><table><tbody>{weights.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{fmt(v)}</td>)}</tr>)}</tbody></table></div><b>×</b><div><small>x · [2]</small><table><tbody>{input.map((v, i) => <tr key={i}><td>{fmt(v)}</td></tr>)}</tbody></table></div><b>=</b><div><small>Wx · [2]</small><table><tbody>{out.map((v, i) => <tr key={i}><td>{fmt(v)}</td></tr>)}</tbody></table></div></div>
    <table className="data-table"><caption>Одна выходная координата на строку W</caption><thead><tr><th scope="col">Строка</th><th scope="col">Скалярное произведение</th><th scope="col">Выход</th></tr></thead><tbody>{weights.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th><td>({fmt(row[0])})·({fmt(x1)}) + ({fmt(row[1])})·({fmt(x2)})</td><td>{fmt(out[i])}</td></tr>)}</tbody></table>
  </section>;
}

function ProbabilityDemo() {
  const [p, setP] = useState(.7), stats = bernoulli(p);
  return <section className="concept-experiment" aria-label="Распределение Бернулли">
    <Range label="Вероятность единицы p" value={p} min={0} max={1} step={.01} onChange={setP} />
    <div className="concept-probability-bar" role="img" aria-label={`Вероятность 1: ${fmt(p)}, вероятность 0: ${fmt(1 - p)}`}><span style={{ width: `${p * 100}%` }} /><span style={{ width: `${(1 - p) * 100}%` }} /></div>
    <div className="chart-legend"><span><i style={{ background: '#27694e' }} />1: {fmt(p * 100)}%</span><span><i style={{ background: '#c48245' }} />0: {fmt((1 - p) * 100)}%</span></div>
    <div className="concept-numbers"><span>E[X]<strong>{fmt(stats.mean)}</strong></span><span>Var(X)<strong>{fmt(stats.variance)}</strong></span><span>Энтропия, наты<strong>{fmt(stats.entropy)}</strong></span></div>
    <Chart series={[{ name: 'H(p) в натах', points: samples(0, 1, v => bernoulli(v).entropy) }, { name: 'Текущее распределение', points: [{ x: p, y: stats.entropy }], color: '#b75d24' }]} xLabel="Вероятность p" yLabel="Энтропия H" xDomain={[0, 1]} yDomain={[0, .75]} />
    <p>От вероятностей можно перейти к <ConceptLink concept="expectation">среднему</ConceptLink>, <ConceptLink concept="variance">разбросу</ConceptLink> и <ConceptLink concept="entropy">энтропии</ConceptLink>.</p>
  </section>;
}

function ExponentialDemo() {
  const [x, setX] = useState(1), value = Math.exp(x);
  return <section className="concept-experiment" aria-label="Экспонента и обратный логарифм">
    <Range label="Показатель x" value={x} min={-3} max={3} step={.05} onChange={setX} />
    <div className="concept-flow"><div><small>Показатель</small><strong>{fmt(x)}</strong></div><b>→ exp →</b><div><small>Положительное число</small><strong>{fmt(value)}</strong></div><b>→ ln →</b><div><small>Возврат к показателю</small><strong>{fmt(Math.log(value))}</strong></div></div>
    <Chart series={[{ name: 'exp(x)', points: samples(-3, 3, Math.exp) }, { name: 'Текущее значение', points: [{ x, y: value }], color: '#b75d24' }]} xLabel="x" yLabel="exp(x)" xDomain={[-3, 3]} />
    <p>Обратная операция — <ConceptLink concept="logarithm">логарифм</ConceptLink>. Положительные веса из exp использует <ConceptLink concept="softmax">softmax</ConceptLink>.</p>
  </section>;
}

function SoftmaxDemo() {
  const [logits, setLogits] = useState([2, 1, 0]), [temperature, setTemperature] = useState(1), [shift, setShift] = useState(0), [target, setTarget] = useState(0);
  const shifted = logits.map(z => z + shift), probabilities = stableSoftmax(shifted, temperature);
  // Shift before dividing, as in stableSoftmax; CE is invariant to the shared shift.
  const maximum = Math.max(...shifted), centered = shifted.map(z => (z - maximum) / temperature);
  const result = crossEntropyLogits(centered, target);
  const exps = centered.map(Math.exp);
  return <section className="concept-experiment" aria-label="Softmax и cross-entropy из логитов">
    {logits.map((z, i) => <Range key={i} label={`Логит класса ${i + 1}`} value={z} min={-10} max={10} step={.1} onChange={v => setLogits(previous => previous.map((old, j) => i === j ? v : old))} />)}
    <Range label="Температура T" value={temperature} min={.1} max={3} step={.1} onChange={setTemperature} />
    <div className="button-row"><button aria-pressed={shift === 0} onClick={() => setShift(0)}>Общий сдвиг 0</button><button aria-pressed={shift === 1000} onClick={() => setShift(1000)}>Прибавить 1000 ко всем</button></div>
    <label className="concept-select">Правильный класс <select value={target} onChange={e => setTarget(Number(e.target.value))}>{logits.map((_, i) => <option key={i} value={i}>Класс {i + 1}</option>)}</select></label>
    <div className="concept-class-bars">{probabilities.map((p, i) => <div key={i}><span>Класс {i + 1}{i === target ? ' · цель' : ''}</span><div><i style={{ width: `${p * 100}%` }} /></div><strong>{fmt(p * 100, 2)}%</strong></div>)}</div>
    <div className="concept-table-wrap"><table className="data-table"><caption>От логитов к долям и градиентам</caption><thead><tr><th scope="col">Класс</th><th scope="col">z + сдвиг</th><th scope="col">exp((z−max)/T)</th><th scope="col">∂L/∂z</th></tr></thead><tbody>{logits.map((_, i) => <tr key={i}><th scope="row">{i + 1}</th><td>{fmt(shifted[i])}</td><td>{fmt(exps[i])}</td><td>{fmt(result.gradient[i] / temperature)}</td></tr>)}</tbody></table></div>
    <div className="concept-numbers"><span>Сумма вероятностей<strong>{fmt(probabilities.reduce((a, b) => a + b, 0))}</strong></span><span>Cross-entropy<strong>{fmt(result.loss, 5)}</strong></span></div>
    <p className="concept-live">L = ln(Σ exp((z−max)/T)) − (zцели−max)/T. При T ≠ 1 градиенты по исходным логитам дополнительно делятся на T.</p>
  </section>;
}

function NormalizationDemo() {
  const [values, setValues] = useState([1, 2, 3]), result = normalize(values);
  return <section className="concept-experiment" aria-label="Нормализация одного вектора">
    {values.map((value, i) => <Range key={i} label={`Координата ${i + 1}`} value={value} min={-10} max={10} step={.1} onChange={v => setValues(previous => previous.map((old, j) => j === i ? v : old))} />)}
    <div className="button-row"><button onClick={() => setValues([1, 2, 3])}>[1;2;3]</button><button onClick={() => setValues([6, 7, 8])}>Добавить общий сдвиг: [6;7;8]</button><button onClick={() => setValues([2, 2, 2])}>Равные: [2;2;2]</button></div>
    <Chart series={[{ name: 'До', points: values.map((y, x) => ({ x: x + 1, y })), color: '#b75d24' }, { name: 'После', points: result.values.map((y, x) => ({ x: x + 1, y })) }]} xLabel="Номер координаты" yLabel="Значение" xDomain={[.8, 3.2]} />
    <div className="concept-numbers"><span>Среднее μ<strong>{fmt(result.mean)}</strong></span><span>Дисперсия σ²<strong>{fmt(result.variance)}</strong></span><span>Выход<strong>{vectorText(result.values)}</strong></span></div>
    <p className="concept-live">Делим на √({fmt(result.variance)} + 0,00001). Статистика считается по трём координатам одного примера.</p>
  </section>;
}

function LossDemo() {
  const [prediction, setPrediction] = useState(3), [target, setTarget] = useState(2), result = mse([prediction], [target]);
  return <section className="concept-experiment" aria-label="Квадрат ошибки и его производная">
    <Range label="Предсказание ŷ" value={prediction} min={-4} max={4} step={.1} onChange={setPrediction} /><Range label="Цель y" value={target} min={-3} max={3} step={.1} onChange={setTarget} />
    <Chart series={[{ name: 'Квадрат ошибки', points: samples(-4, 4, x => (x - target) ** 2) }, { name: 'Текущая потеря', points: [{ x: prediction, y: result.loss }], color: '#b75d24' }]} xLabel="Предсказание ŷ" yLabel="Потеря L" xDomain={[-4, 4]} />
    <div className="concept-numbers"><span>Ошибка ŷ−y<strong>{fmt(prediction - target)}</strong></span><span>L=(ŷ−y)²<strong>{fmt(result.loss)}</strong></span><span>∂L/∂ŷ<strong>{fmt(result.grad[0])}</strong></span></div>
    <p>Для классов важна вероятность правильного ответа: её штрафует <ConceptLink concept="cross-entropy">cross-entropy</ConceptLink>.</p>
  </section>;
}

function RateDemo() {
  const [rate, setRate] = useState(.25), [initial, setInitial] = useState(2), points = descent1D(initial, rate);
  return <section className="concept-experiment" aria-label="Размер шага градиентного спуска">
    <Range label="Начальный вес w₀" value={initial} min={-3} max={3} step={.1} onChange={setInitial} /><Range label="Скорость обучения η" value={rate} min={0} max={2.2} step={.05} onChange={setRate} />
    <Chart series={[{ name: 'Вес после шага', points: points.map((p, i) => ({ x: i, y: p.x })) }]} xLabel="Шаг" yLabel="Вес w" xDomain={[0, 12]} />
    <div className="concept-numbers"><span>Первое обновление<strong>{fmt(initial)} → {fmt(points[1].x)}</strong></span><span>L₀ → L₁₂<strong>{fmt(points[0].loss)} → {fmt(points.at(-1)!.loss)}</strong></span></div>
    <p className="concept-live">Каждый шаг умножает вес на 1−η = {fmt(1 - rate)}. {rate === 0 ? 'Вес стоит на месте.' : rate < 1 ? 'При ненулевом старте вес приближается к нулю без смены знака.' : rate === 1 ? 'Один шаг сразу достигает минимума.' : rate < 2 ? 'При ненулевом старте вес чередует знак и приближается к нулю.' : rate === 2 ? 'Ненулевой вес меняет знак, но потеря остаётся прежней.' : 'При ненулевом старте модуль веса растёт.'}</p>
  </section>;
}

function BackpropDemo() {
  const [x, setX] = useState(1), [w, setW] = useState(.5), [target, setTarget] = useState(1);
  const graph = sharedGraph(x, w, target), v = graph.values, g = graph.gradients;
  const numerical = finiteDifference(([weight]) => sharedGraph(x, weight, target).values.loss, [w])[0];
  return <section className="concept-experiment" aria-label="Обратный проход по двум путям">
    <div className="concept-two"><Range label="Вход x" value={x} min={-2} max={2} onChange={setX} /><Range label="Вес w" value={w} min={-2} max={2} onChange={setW} /></div><Range label="Цель y" value={target} min={-2} max={2} onChange={setTarget} />
    <div className="concept-flow"><div><small>q=wx</small><strong>{fmt(v.q)}</strong></div><b>→</b><div><small>p=q²+q</small><strong>{fmt(v.p)}</strong></div><b>→</b><div><small>L=½(p−y)²</small><strong>{fmt(v.loss)}</strong></div></div>
    <div className="concept-two concept-paths"><div><strong>Путь через q²</strong><p>(p−y) · 2q</p><b>{fmt(graph.qContributions.square)}</b></div><div><strong>Прямой путь через q</strong><p>(p−y) · 1</p><b>{fmt(graph.qContributions.identity)}</b></div></div>
    <p className="concept-live">Сумма в q: {fmt(graph.qContributions.square)} + ({fmt(graph.qContributions.identity)}) = {fmt(g.q)}. Затем ∂L/∂w = {fmt(g.q)} · x = {fmt(g.w)}.</p>
    <div className="concept-numbers"><span>Аналитический ∂L/∂w<strong>{fmt(g.w, 6)}</strong></span><span>Численная проверка<strong>{fmt(numerical, 6)}</strong></span><span>Разница<strong>{fmt(Math.abs(g.w - numerical), 8)}</strong></span></div>
    <p className="note">Численно: [L(w+ε)−L(w−ε)]/(2ε), ε=10⁻⁵. Здесь совпадение проверяет формулу на выбранной гладкой точке.</p>
  </section>;
}

function OverfittingDemo() {
  const [flexibility, setFlexibility] = useState(.3), errors = regressionErrors(flexibility);
  return <section className="concept-experiment" aria-label="Подгонка к шумной метке и ошибка на новых точках">
    <Range label="Подгонка шумной train-точки a" value={flexibility} min={0} max={1} step={.01} onChange={setFlexibility} />
    <Chart series={[{ name: 'Правило y=x', points: samples(-2, 2, x => x), color: '#849285', dashed: true }, { name: 'Предсказание модели', points: samples(-2, 2, x => regressionPrediction(x, flexibility)) }, ...regressionTrain.map((p, i) => ({ name: `Train ${i + 1}`, points: [p], color: '#b75d24' })), ...regressionValidation.map((p, i) => ({ name: `Validation ${i + 1}`, points: [p], color: '#6a52a0' }))]} xLabel="Вход x" yLabel="Предсказание и цели" xDomain={[-2.2, 2.2]} yDomain={[-2.5, 2.5]} />
    <div className="concept-numbers"><span>Train MSE · 5 точек<strong>{fmt(errors.train, 5)}</strong></span><span>Validation MSE · 4 точки<strong>{fmt(errors.validation, 5)}</strong></span></div>
    <p className="concept-live">Оранжевые train-метки: (−2;−2), (−1;−1), (0;0,8), (1;1), (2;2). Фиолетовые validation лежат на y=x при x=−1,5; −0,5; 0,5; 1,5. Все ошибки пересчитываются; это не заранее нарисованные кривые loss.</p>
  </section>;
}
