import { CoreTopicFilm } from './CoreTopicFilms';
import { lazy, memo, Suspense, useLayoutEffect, useRef, useState } from 'react';
import { Range, Exercise, fmt } from './ui';
import { architectureFamilies, denseForward, conv2d, pool2d, rnnForward, lstmForward, gruForward, transformerForward, transformerMatrices } from './architectures';
import type { Activation, TransformerMode } from './architectures';
import { ConceptLink, LearningActivity } from './learning-context';
import { Scene3D, type Vec3 } from './ThreeD';
import { cnnSpatialTrace } from './spatialSceneMath';
import { PracticeSection } from './practice/PracticeCloudProvider';

const BpttLab = lazy(() => import('./BpttLab').then(module => ({ default: module.BpttLab })));
const CnnTrainingLab = lazy(() => import('./CnnTrainingLab').then(module => ({ default: module.CnnTrainingLab })));
const CnnShiftLab = lazy(() => import('./CnnShiftLab').then(module => ({ default: module.CnnShiftLab })));
type ArchitectureFamily = (typeof architectureFamilies)[number]['id'];

function useDiagramWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function Matrix({ values, label, selected, marked, onSelect }: { values: number[][]; label: string; selected?: [number, number]; marked?: (row: number, column: number) => boolean; onSelect?: (row: number, column: number) => void }) {
  return <div style={{ overflowX: 'auto' }}><table className="data-table"><caption>{label}</caption><tbody>{values.map((row, r) => <tr key={r}>{row.map((value, c) => {
    const active = (selected?.[0] === r && selected?.[1] === c) || !!marked?.(r, c);
    const text = Number.isFinite(value) ? fmt(value, 2) : '−∞';
    return <td key={c} style={{ textAlign: 'center', border: active ? '2px solid currentColor' : undefined, background: Number.isFinite(value) ? `rgba(45, 140, 160, ${Math.min(0.28, Math.abs(value) * 0.1)})` : undefined }}>{onSelect ? <button type="button" aria-label={`${label}, строка ${r + 1}, столбец ${c + 1}: ${text}`} aria-pressed={active} onClick={() => onSelect(r, c)}>{text}</button> : text}{active && !onSelect ? ' ◂' : ''}</td>;
  })}</tr>)}</tbody></table>{values.length === 0 && <p className="note">Окно 2×2 не помещается: карта pooling пуста.</p>}</div>;
}
function Flow({ steps }: { steps: string[] }) {
  return <ol aria-label="Путь данных" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', padding: 0, listStyle: 'none' }}>{steps.map((step, i) => <li key={i} className="result" style={{ padding: '0.6rem' }}><small>{i + 1}.</small> {step}{i < steps.length - 1 ? ' →' : ''}</li>)}</ol>;
}
function DenseLab() {
  const diagram = useDiagramWidth();
  const [depth, setDepth] = useState(2), [width, setWidth] = useState(3), [activation, setActivation] = useState<Activation>('tanh');
  const [x, setX] = useState(0.7), [scale, setScale] = useState(1), [bias, setBias] = useState(0.1), [layer, setLayer] = useState(0), [neuron, setNeuron] = useState(0);
  const layers = Array.from({ length: depth }, (_, l) => ({ weights: Array.from({ length: width }, (_, j) => Array.from({ length: l ? width : 2 }, (_, i) => scale * Math.sin((l + 1) * (j + 1) + i) / Math.sqrt(l ? width : 2))), bias: Array(width).fill(bias) as number[] }));
  const trace = denseForward([x, -0.4], layers, activation), selectedLayer = Math.min(layer, depth - 1), selectedNeuron = Math.min(neuron, width - 1), selected = trace[selectedLayer];
  const columns = [[x, -0.4], ...trace.map(t => t.output)];
  const vertical = diagram.width < 580;
  const diagramHeight = vertical ? columns.length * 88 : 300;
  const nodeX = (l: number, i: number) => vertical ? (i + 0.5) * diagram.width / columns[l].length : 48 + l * (diagram.width - 96) / (columns.length - 1);
  const nodeY = (l: number, i: number) => vertical ? 48 + l * 88 : 45 + i * 48;
  return <CoreTopicFilm slug="dense" current={{ depth, width, activation, x, scale, bias, layer, neuron }} example={{ depth: 2, width: 3, activation: 'tanh', x: .7, scale: 1, bias: .1, layer: 0, neuron: 0 }} restore={value => { setDepth(value.depth);setWidth(value.width);setActivation(value.activation);setX(value.x);setScale(value.scale);setBias(value.bias);setLayer(value.layer);setNeuron(value.neuron); }}><>
    <p className="lesson-intro">Dense — полносвязный слой: каждый вход связан со всеми нейронами следующего слоя. MLP (Multi-Layer Perceptron) — многослойный перцептрон, несколько таких слоёв с нелинейностью. Меняйте вход и веса, затем выберите нейрон для раскрытия его суммы.</p>
    <div className="lab-grid"><section className="panel controls"><h3>Соберите MLP</h3>
      <Range label="Число слоёв" value={depth} min={1} max={3} step={1} onChange={setDepth} /><Range label="Нейронов в каждом слое" value={width} min={1} max={5} step={1} onChange={setWidth} />
      <label>Активация <select value={activation} onChange={e => setActivation(e.target.value as Activation)}>{['linear', 'relu', 'tanh', 'sigmoid'].map(a => <option key={a}>{a}</option>)}</select></label>
      <Range label="Вход x₁" value={x} min={-2} max={2} step={0.1} onChange={setX} /><Range label="Масштаб всех весов" value={scale} min={-2} max={2} step={0.1} onChange={setScale} /><Range label="Bias каждого нейрона" value={bias} min={-1} max={1} step={0.1} onChange={setBias} />
    </section><section className="panel"><h3>Сеть и значения активаций</h3>
      <div ref={diagram.ref} style={{ width: '100%' }}><svg viewBox={`0 0 ${diagram.width} ${diagramHeight}`} role="img" aria-label={`Полносвязная сеть: 2 входа, ${depth} слоя по ${width} нейронов. Числа внутри узлов — активации. Данные идут ${vertical ? 'сверху вниз' : 'слева направо'}.`} style={{ width: '100%', height: diagramHeight, display: 'block' }}>
        {columns.slice(1).flatMap((column, l) => column.flatMap((_, j) => columns[l].map((_, i) => <line key={`${l}-${j}-${i}`} x1={nodeX(l, i)} y1={nodeY(l, i)} x2={nodeX(l + 1, j)} y2={nodeY(l + 1, j)} stroke="currentColor" opacity={0.16} />)))}
        {columns.flatMap((column, l) => column.map((value, i) => <g key={`${l}-${i}`}><circle cx={nodeX(l, i)} cy={nodeY(l, i)} r={22} fill={l - 1 === selectedLayer && i === selectedNeuron ? '#d5eff0' : '#eef2f6'} stroke="#286577" strokeWidth={l - 1 === selectedLayer && i === selectedNeuron ? 3 : 1} /><text x={nodeX(l, i)} y={nodeY(l, i) + 4} textAnchor="middle" fill="#173344" fontSize={12}>{fmt(value, 2)}</text></g>))}
        {columns.map((_, l) => <text key={l} x={vertical ? 4 : nodeX(l, 0)} y={vertical ? 17 + l * 88 : 286} textAnchor={vertical ? 'start' : 'middle'} fill="currentColor" fontSize={13}>{l === 0 ? 'Вход' : `Слой ${l}`} {vertical ? '↓' : '→'}</text>)}
      </svg></div>
      <div className="button-row">{trace.map((_, l) => <button key={l} aria-pressed={l === selectedLayer} onClick={() => setLayer(l)}>Слой {l + 1}</button>)}</div>
      <Range label="Нейрон для разбора" value={selectedNeuron + 1} min={1} max={width} step={1} onChange={n => setNeuron(n - 1)} />
      <p className="formula">z = {selected.input.map((v, i) => `(${fmt(v, 2)} × ${fmt(selected.weights[selectedNeuron][i], 2)})`).join(' + ')} + {fmt(bias, 2)} = {fmt(selected.z[selectedNeuron])}<br />a = {activation}({fmt(selected.z[selectedNeuron])}) = {fmt(selected.output[selectedNeuron])}</p>
      <p className="note">В формулах числа округлены, вычисления используют полную точность. Один Dense без нелинейности — аффинное преобразование; композиция linear-слоёв остаётся аффинной.</p>
      <details><summary>Все веса выбранного слоя и размерности</summary><Matrix label="W: строки — нейроны выхода, столбцы — входы" values={selected.weights} /><p>{selected.input.length} входов → {selected.output.length} выходов; параметров слоя: {selected.input.length * selected.output.length + selected.output.length}. Каждый bias = {fmt(bias)}.</p><p>Residual MLP добавляет вход к выходу совместимой размерности; dropout при обучении случайно обнуляет часть активаций. Здесь эти варианты не вычисляются.</p></details>
    </section></div>
    <Exercise question="Что произойдёт, если во всех слоях MLP выбрать linear?" options={['Глубина сама создаст нелинейную границу', 'Вся сеть останется одним аффинным преобразованием', 'Все выходы обязательно станут нулевыми']} correct={1} explanation="Композиция Wx+b снова имеет вид Ax+c. Для нелинейных зависимостей нужны нелинейные активации." />
  </></CoreTopicFilm>;
}

const CnnChannelScene = memo(function CnnChannelScene({ trace, channels, open: _open }: { trace: ReturnType<typeof cnnSpatialTrace>; channels: number; open: boolean }) {
  const bounds = (axis: 0 | 1) => ({ min: Math.min(-.5, ...trace.window.map(cell => cell.position[axis] - .4)), max: Math.max(4.5, ...trace.window.map(cell => cell.position[axis] + .4)) });
  const square = ([x, y, c]: Vec3): Vec3[] => [[x - .35, y - .35, c], [x + .35, y - .35, c], [x + .35, y + .35, c], [x - .35, y + .35, c], [x - .35, y - .35, c]];
  return <>
    <Scene3D title="CNN: окно проходит через все входные каналы" description="Две пространственные оси — столбец и строка. Высота стопки — индекс канала c, начиная с 0. Оранжевые рамки выделяют взятые фильтром ячейки, пунктир — добавленные нули за краями." showLegend={false}
      axes={[{ label: 'Столбец x', ...bounds(0) }, { label: 'Строка y', ...bounds(1) }, { label: 'Индекс канала c', min: -.5, max: Math.max(.5, channels - .5) }]}
      surfaces={Array.from({ length: channels }, (_, c) => ({ name: `Канал ${c + 1} (c=${c})`, rows: [[[-.5, -.5, c] as Vec3, [4.5, -.5, c] as Vec3], [[-.5, 4.5, c] as Vec3, [4.5, 4.5, c] as Vec3]], color: '#287f80', opacity: .07 }))}
      lines={trace.window.map(cell => ({ name: `Окно [${cell.position.join('; ')}]${cell.padded ? ' · padding=0' : ''}`, points: square(cell.position), color: '#b75d24', dashed: cell.padded }))}
      points={[...trace.cells, ...trace.window.filter(cell => cell.padded)].map(cell => ({ name: `c=${cell.position[2]}, [${cell.position[1]}, ${cell.position[0]}] = ${cell.value}`, position: cell.position, color: cell.value ? '#287f80' : '#88949a' }))} />
    <p className="note">Бирюзовая точка — 1, серая — 0; оранжевая рамка — выбранное окно. На плоскостях {channels * 25} настоящих входных значений; пунктирные рамки показывают дополнительные нули padding. Индекс c=0 соответствует первой матрице канала выше.</p>
    <p>Здесь выполняется Conv2D: канал — отдельный набор признаков, а не третья пространственная ось. Один выход складывает вклады всех каналов: {trace.contributions.map(value => fmt(value)).join(' + ')} = {fmt(trace.contributions.reduce((a, b) => a + b, 0))}. Для Conv3D потребовалась бы ещё пространственная ось глубины.</p>
  </>;
// Keep the camera mounted while collapsed, without rebuilding hidden geometry.
}, (_previous, next) => !next.open);

function CnnLab() {
  const [stride, setStride] = useState(1), [padding, setPadding] = useState(0), [dilation, setDilation] = useState(1), [channels, setChannels] = useState(1), [scale, setScale] = useState(1), [scan, setScan] = useState(0), [pooling, setPooling] = useState<'max' | 'average'>('max');
  const [sceneOpen, setSceneOpen] = useState(false), [sceneVisited, setSceneVisited] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false), [shiftVisited, setShiftVisited] = useState(false);
  const input = Array.from({ length: channels }, (_, c) => Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => c ? (x + y) % 2 : x < 2 ? 0 : 1)));
  const filter = [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]].map(row => row.map(v => v * scale));
  const kernels = [Array.from({ length: channels }, () => filter)];
  const result = conv2d(input, kernels, { stride, padding, dilation });
  const count = result.height * result.width, step = Math.min(scan, Math.max(0, count - 1)), oy = Math.floor(step / result.width), ox = step % result.width;
  const pooled = pool2d(result.output[0], 2, pooling);
  const spatial = cnnSpatialTrace(input, filter, { stride, padding, dilation }, oy, ox);
  const { patches, contributions, inWindow } = spatial;
  return <CoreTopicFilm slug="cnnforward" current={{ stride, padding, dilation, channels, scale, scan, pooling, sceneOpen, sceneVisited, shiftOpen, shiftVisited }} example={{ stride: 1, padding: 0, dilation: 1, channels: 1, scale: 1, scan: 0, pooling: 'max', sceneOpen: sceneOpen, sceneVisited: sceneVisited, shiftOpen: shiftOpen, shiftVisited: shiftVisited }} restore={value => { setStride(value.stride);setPadding(value.padding);setDilation(value.dilation);setChannels(value.channels);setScale(value.scale);setScan(value.scan);setPooling(value.pooling);setSceneOpen(value.sceneOpen);setSceneVisited(value.sceneVisited);setShiftOpen(value.shiftOpen);setShiftVisited(value.shiftVisited); }}><><p className="lesson-intro">CNN (Convolutional Neural Network) — свёрточная нейронная сеть. Один фильтр скользит по входу с одними и теми же весами. Он ищет локальный признак; здесь — вертикальную границу. Вход имеет форму C×5×5, выход — 1×H×W. Щёлкните ячейку выхода, чтобы увидеть её поле восприятия — участок входа, участвующий в расчёте.</p>
    <div className="lab-grid"><section className="panel controls"><h3>Параметры свёртки</h3>
      <Range label="Stride — шаг окна" value={stride} min={1} max={2} step={1} onChange={setStride} /><Range label="Padding — нули по краям" value={padding} min={0} max={2} step={1} onChange={setPadding} /><Range label="Dilation — расстояние между весами" value={dilation} min={1} max={2} step={1} onChange={setDilation} /><Range label="Входных каналов" value={channels} min={1} max={2} step={1} onChange={setChannels} /><Range label="Масштаб фильтра" value={scale} min={-2} max={2} step={0.25} onChange={setScale} />
      <label>Pooling 2×2, шаг 2 <select value={pooling} onChange={e => setPooling(e.target.value as 'max' | 'average')}><option value="max">Максимум</option><option value="average">Среднее</option></select></label>
      <Matrix label="Фильтр 3×3 для каждого входного канала" values={filter} />
    </section><section className="panel"><Flow steps={[`${channels}×5×5`, `Conv → 1×${result.height}×${result.width}`, 'ReLU', `Pool → 1×${pooled.length}×${pooled[0]?.length ?? 0}`]} />
      <p className="formula">H = W = floor((5 + 2×{padding} − {dilation}×(3−1) − 1)/{stride} + 1) = {result.height}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>{input.map((channel, c) => <div key={c}><Matrix label={`Вход, канал ${c + 1}; ◂ — выбранное окно`} values={channel} marked={inWindow} /><p className="note">В окне берём координаты ({oy * stride - padding}+kᵧ×{dilation}, {ox * stride - padding}+kₓ×{dilation}). За краями — нули.</p></div>)}<Matrix label="Выход Conv: выберите ячейку" values={result.output[0]} selected={[oy, ox]} onSelect={(r, c) => setScan(r * result.width + c)} /></div>
      <Range label="Положение окна" value={step + 1} min={1} max={Math.max(1, count)} step={1} onChange={n => setScan(n - 1)} />
      <div className="button-row"><button disabled={step === 0} onClick={() => setScan(step - 1)}>← Предыдущее окно</button><button disabled={step + 1 === count} onClick={() => setScan(step + 1)}>Следующее окно →</button></div>
      <details open><summary>Почему выход [{oy + 1}, {ox + 1}] = {fmt(result.output[0][oy][ox])}</summary><div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{patches.map((patch, c) => <Matrix key={c} label={`Выбранные 9 значений канала ${c + 1}`} values={patch} />)}</div><p className="formula">y = Σ по каналам и окну (x × w) + b = {contributions.map(v => fmt(v)).join(' + ')} + 0 = {fmt(result.output[0][oy][ox])}</p><p>Операция соответствует cross-correlation: ядро не переворачивается, как и в обычных CNN. Второй входной канал суммируется в том же выходном канале; второй выходной канал потребовал бы другого набора фильтров.</p></details>
      <details onToggle={event => { setSceneOpen(event.currentTarget.open); if (event.currentTarget.open) setSceneVisited(true); }}><summary>3D: каналы и выбранное окно свёртки</summary>{sceneVisited && <CnnChannelScene trace={spatial} channels={channels} open={sceneOpen} />}</details>
      <Matrix label={`ReLU → ${pooling} pooling 2×2`} values={pool2d(result.output[0].map(row => row.map(x => Math.max(0, x))), 2, pooling)} />
      <details><summary>Варианты CNN и форма данных</summary><table className="data-table"><thead><tr><th>Операция</th><th>Данные без batch</th><th>Здесь</th></tr></thead><tbody><tr><td>Conv1D</td><td>C×L: звук, временной ряд</td><td>Только схема расширения</td></tr><tr><td>Conv2D</td><td>C×H×W: изображение</td><td>Численный расчёт</td></tr><tr><td>Conv3D</td><td>C×D×H×W: объём, видео</td><td>Только схема расширения</td></tr></tbody></table><p>В 1D сумма идёт по одной пространственной оси, в 3D — по трём. Формула размера применяется отдельно к каждой оси. В этом прямом проходе groups=1, один выходной канал и bias=0. Переключатель «Обучить фильтр» открывает отдельный опыт с обновлением весов.</p></details>
    </section></div>
    <details className="panel" onToggle={event => { setShiftOpen(event.currentTarget.open); if (event.currentTarget.open) setShiftVisited(true); }}>
      <summary>Опыт: сдвиг входа, stride и эквивариантность CNN</summary>
      {shiftVisited && <Suspense fallback={<p role="status">Загружается опыт сдвига CNN…</p>}><CnnShiftLab open={shiftOpen} /></Suspense>}
    </details>
    <Exercise question="Что меняется при увеличении dilation с 1 до 2 у ядра 3×3?" options={['Весов становится 25', 'Охват становится 5×5, весов остаётся 9 на входной канал', 'Pooling отключается']} correct={1} explanation="Между соседними весами появляется промежуток: эффективный размер d×(k−1)+1 = 5. Самих весов по-прежнему 3×3." /></></CoreTopicFilm>;
}

function Sequence({ values, selected, onSelect, label = 'h' }: { values: number[]; selected: number; onSelect: (i: number) => void; label?: string }) {
  return <div className="button-row" aria-label="Развёртка по времени">{values.map((value, i) => <button key={i} onClick={() => onSelect(i)} aria-pressed={selected === i}>t={i + 1}<br />{label}={fmt(value)}{i < values.length - 1 ? ' →' : ''}</button>)}</div>;
}
function Gate({ name, value }: { name: string; value: number }) {
  return <div style={{ marginBlock: 10 }}><div>{name}: <strong>{fmt(value)}</strong></div><meter min={0} max={1} value={value} aria-label={name} style={{ width: '100%', height: 20 }} /></div>;
}
function RecurrentLab({ family }: { family: 'rnn' | 'lstm' | 'gru' }) {
  const [first, setFirst] = useState(0.8), [step, setStep] = useState(2), [wh, setWh] = useState(0.7), [gateBias, setGateBias] = useState(1), [writeBias, setWriteBias] = useState(0), [outputBias, setOutputBias] = useState(0), [variant, setVariant] = useState('plain');
  const input = [first, -0.4, 0.6, 0.1], base = { wx: 0.8, wh, b: 0.1 };
  const rnn = rnnForward(input, base), second = rnnForward(rnn.map(s => s.h), base), backward = rnnForward([...input].reverse(), base).reverse();
  const lstmWeights = { forget: { wx: 0.3, wh: 0.2, b: gateBias }, input: { wx: 0.5, wh: 0.1, b: writeBias }, output: { wx: 0.4, wh: 0.1, b: outputBias }, candidate: base };
  const gruWeights = { reset: { wx: 0.3, wh: 0.2, b: writeBias }, update: { wx: 0.5, wh: 0.1, b: gateBias }, candidate: base };
  const lstm = lstmForward(input, lstmWeights), gru = gruForward(input, gruWeights);
  const selectedRnn = (variant === 'stacked' ? second : rnn)[step], selectedLstm = lstm[step], selectedGru = gru[step];
  const values = family === 'rnn' ? (variant === 'stacked' ? second : rnn).map(s => s.h) : family === 'lstm' ? lstm.map(s => s.h) : gru.map(s => s.h);
  return <CoreTopicFilm slug="recurrent" current={{ first, step, wh, gateBias, writeBias, outputBias, variant }} example={{ first: .8, step: 2, wh: .7, gateBias: 1, writeBias: 0, outputBias: 0, variant: 'plain' }} restore={value => { setFirst(value.first);setStep(value.step);setWh(value.wh);setGateBias(value.gateBias);setWriteBias(value.writeBias);setOutputBias(value.outputBias);setVariant(value.variant); }}><><p className="lesson-intro">{family === 'rnn' ? 'RNN (Recurrent Neural Network) — рекуррентная нейронная сеть: её состояние передаётся от шага к шагу.' : family === 'lstm' ? 'LSTM (Long Short-Term Memory) — рекуррентная ячейка с долгой краткосрочной памятью: она хранит отдельное состояние c и передаёт наружу h.' : 'GRU (Gated Recurrent Unit) — рекуррентная ячейка с затворами, управляющими одним состоянием h.'} {family !== 'rnn' && 'Затвор (gate, или «ворота» в регуляторах) — число от 0 до 1, задающее долю пропускаемого сигнала.'} Последовательность x=[{input.map(x => fmt(x, 1)).join('; ')}] проходит через одну и ту же ячейку четыре раза. Параметры общие для всех шагов, начальные состояния равны нулю. Измените самый ранний вход и посмотрите на последующие состояния.</p>
    <div className="lab-grid"><section className="panel controls"><h3>{family.toUpperCase()}: управляйте памятью</h3><Range label="Первый вход x₁" value={first} min={-2} max={2} step={0.1} onChange={setFirst} /><Range label="Рекуррентный вес кандидата wₕ" value={wh} min={-1.5} max={1.5} step={0.1} onChange={setWh} />
      {family === 'rnn' ? <label>Вариант RNN <select value={variant} onChange={e => setVariant(e.target.value)}><option value="plain">Один слой →</option><option value="stacked">Два слоя ↑</option><option value="bidirectional">Двунаправленная ⇄</option></select></label> : <><Range label={family === 'lstm' ? 'Bias forget-ворот' : 'Bias update-ворот z'} value={gateBias} min={-4} max={4} step={0.1} onChange={setGateBias} /><Range label={family === 'lstm' ? 'Bias input-ворот' : 'Bias reset-ворот r'} value={writeBias} min={-4} max={4} step={0.1} onChange={setWriteBias} />{family === 'lstm' && <Range label="Bias output-ворот" value={outputBias} min={-4} max={4} step={0.1} onChange={setOutputBias} />}</>}
      <Range label="Шаг для разбора" value={step + 1} min={1} max={4} step={1} onChange={n => setStep(n - 1)} />
      <p className="note">Здесь h — одно число. В полной модели h — вектор, а w — матрицы. Это делает след каждого умножения видимым; такая ячейка не является обученной языковой моделью.</p>
    </section><section className="panel"><h3>Общая схема → шаг t={step + 1}</h3><Sequence values={values} selected={step} onSelect={setStep} />
      {family === 'rnn' && <><Flow steps={variant === 'stacked' ? ['xₜ', 'hₜ слоя 1', 'hₜ слоя 2'] : variant === 'bidirectional' ? ['x₁…x₄ → h→', 'x₄…x₁ → h←', 'Конкатенация [h→, h←]'] : ['xₜ и hₜ₋₁', 'Взвешенная сумма', 'tanh → hₜ']} /><p className="formula">hₜ = tanh(0.8×xₜ + {fmt(wh, 1)}×hₜ₋₁ + 0.1)<br />= tanh(0.8×{fmt(selectedRnn.x)} + {fmt(wh, 1)}×{fmt(selectedRnn.previous)} + 0.1)<br />= tanh({fmt(selectedRnn.z)}) = {fmt(selectedRnn.h)}</p>{variant === 'stacked' && <><p>Второй слой получает h первого слоя на том же шаге; внутри каждого слоя память идёт по времени. В обоих слоях для простоты одинаковые веса.</p><Matrix label="По строкам: вход, слой 1, слой 2" values={[input, rnn.map(s => s.h), second.map(s => s.h)]} /></>}{variant === 'bidirectional' && <><p>Обратный проход видит будущие элементы; его нельзя применять как причинную модель следующего токена. Результат каждого шага — пара чисел.</p><Matrix label="Строки: h→, h←; столбцы: исходные позиции" values={[rnn.map(s => s.h), backward.map(s => s.h)]} /><p className="formula">Обратный шаг: tanh(0.8×{fmt(backward[step].x)} + {fmt(wh)}×{fmt(backward[step].previous)} + 0.1) = {fmt(backward[step].h)}</p></>}</>}
      {family === 'lstm' && <><Flow steps={['(xₜ, hₜ₋₁) → f,i,o,g', 'cₜ = f×cₜ₋₁ + i×g', 'hₜ = o×tanh(cₜ)']} /><Gate name="f: сохранить старое c" value={selectedLstm.f} /><Gate name="i: записать кандидата" value={selectedLstm.i} /><Gate name="o: показать память наружу" value={selectedLstm.o} /><p className="formula">g = tanh(0.8×{fmt(selectedLstm.x)} + {fmt(wh)}×{fmt(selectedLstm.previousH)} + 0.1) = {fmt(selectedLstm.g)}<br />cₜ = {fmt(selectedLstm.f)}×{fmt(selectedLstm.previousC)} + {fmt(selectedLstm.i)}×{fmt(selectedLstm.g)} = {fmt(selectedLstm.retained)} + {fmt(selectedLstm.written)} = {fmt(selectedLstm.c)}<br />hₜ = {fmt(selectedLstm.o)}×tanh({fmt(selectedLstm.c)}) = {fmt(selectedLstm.h)}</p><Matrix label="Состояния c и h на каждом шаге" values={[lstm.map(s => s.c), values]} /><details><summary>Как вычислены ворота</summary><p className="formula">f = σ(0.3x + 0.2h + {fmt(gateBias)})<br />i = σ(0.5x + 0.1h + {fmt(writeBias)})<br />o = σ(0.4x + 0.1h + {fmt(outputBias)})<br />σ(z)=1/(1+exp(−z))</p><p>Stacked LSTM передаёт h между слоями; bidirectional запускает независимые ячейки в обе стороны. Peephole добавляет связи от c к воротам. Эти расширения здесь описаны, но не вычисляются.</p></details></>}
      {family === 'gru' && <><Flow steps={['(xₜ,hₜ₋₁) → r,z', 'n = tanh(wₓx + wₕ(rh) + b)', 'hₜ = z hₜ₋₁ + (1−z)n']} /><Gate name="z: доля старого состояния" value={selectedGru.z} /><Gate name="r: доступ памяти для кандидата" value={selectedGru.r} /><p className="formula">n = tanh(0.8×{fmt(selectedGru.x)} + {fmt(wh)}×({fmt(selectedGru.r)}×{fmt(selectedGru.previous)}) + 0.1) = {fmt(selectedGru.candidate)}<br />hₜ = {fmt(selectedGru.z)}×{fmt(selectedGru.previous)} + (1−{fmt(selectedGru.z)})×{fmt(selectedGru.candidate)}<br />= {fmt(selectedGru.retained)} + {fmt(selectedGru.written)} = {fmt(selectedGru.h)}</p><p className="note">Наша конвенция: z ближе к 1 сохраняет старое h. В литературе встречается обратное определение update-ворот. GRU не имеет отдельного состояния c.</p><details><summary>Формулы ворот и варианты</summary><p className="formula">r = σ(0.3x + 0.2h + {fmt(writeBias)})<br />z = σ(0.5x + 0.1h + {fmt(gateBias)})</p><p>Используется reset-before: r умножает h до рекуррентной матрицы, один bias стоит вне reset. PyTorch использует reset-after: r умножает (Wₕh+bₕ). В многомерной ячейке эти варианты различаются. Stacked и bidirectional GRU здесь только схемы расширения, как для RNN.</p></details></>}
    </section></div><Exercise key={family} question={family === 'lstm' ? 'Если f≈1 и i≈0, что происходит с c?' : family === 'gru' ? 'В принятой здесь формуле z≈1 означает…' : 'Что общее у четырёх шагов развёрнутой RNN?'} options={family === 'lstm' ? ['Старая память в основном сохраняется', 'Память обязательно обнуляется', 'h всегда равно c'] : family === 'gru' ? ['Полную замену h кандидатом', 'Почти полное сохранение предыдущего h', 'Появление отдельной памяти c'] : ['Входные значения', 'Параметры ячейки', 'Все скрытые состояния']} correct={family === 'lstm' ? 0 : 1} explanation={family === 'lstm' ? 'cₜ = f cₜ₋₁ + i g. При этих воротах остаётся почти всё старое c.' : family === 'gru' ? 'Мы используем hₜ = z hₜ₋₁ + (1−z)n. При z≈1 вклад кандидата мал.' : 'Одна и та же функция с одними и теми же весами применяется к разным входам и состояниям.'} /></></CoreTopicFilm>;
}

function TransformerLab() {
  const diagram = useDiagramWidth();
  const [mode, setMode] = useState<TransformerMode>('encoder'), [heads, setHeads] = useState<1 | 2>(2), [token, setToken] = useState(0.6), [source, setSource] = useState(1.2), [positionScale, setPositionScale] = useState(1), [query, setQuery] = useState(1), [head, setHead] = useState(0), [view, setView] = useState('self');
  const tokens = [token, -0.4, 1], sourceTokens = [source, 0.2, -0.8];
  const trace = transformerForward({ tokens, source: sourceTokens, mode, heads, positionScale });
  const attention = view === 'cross' && trace.cross ? trace.cross : trace.self, h = Math.min(head, heads - 1), selected = attention.heads[h], isCross = view === 'cross' && !!trace.cross;
  const row = selected.weights[query];
  const sourceWidth = Math.min(106, diagram.width / 3 - 10);
  const sourceX = (i: number) => diagram.width * (i + 0.5) / 3;
  return <CoreTopicFilm slug="transformerforward" current={{ mode, heads, token, source, positionScale, query, head, view }} example={{ mode: 'encoder', heads: 2, token: .6, source: 1.2, positionScale: 1, query: 1, head: 0, view: 'self' }} restore={value => { setMode(value.mode);setHeads(value.heads);setToken(value.token);setSource(value.source);setPositionScale(value.positionScale);setQuery(value.query);setHead(value.head);setView(value.view); }}><><p className="lesson-intro">Transformer — сеть на основе механизма внимания. Q (query) — запрос: что ищет позиция; K (key) — ключ для сравнения с запросом; V (value) — значение, которое попадёт в смесь. Внимание вычисляет веса по Q и K, затем смешивает V. Здесь три условных токена, четыре признака и один блок с фиксированными весами: он показывает механику, но не понимает текст и не генерирует слова.</p>
    <div className="lab-grid"><section className="panel controls"><h3>Соберите блок</h3><label>Архитектура <select value={mode} onChange={e => { setMode(e.target.value as TransformerMode); setView('self'); }}><option value="encoder">Encoder-only: весь контекст</option><option value="decoder">Decoder-only: causal</option><option value="encoder-decoder">Encoder–decoder: self + cross</option></select></label>
      <Range label="Число голов" value={heads} min={1} max={2} step={1} onChange={n => setHeads(n as 1 | 2)} /><Range label="Первый условный токен" value={token} min={-2} max={2} step={0.1} onChange={setToken} /><Range label="Масштаб позиционного сигнала" value={positionScale} min={0} max={2} step={0.1} onChange={setPositionScale} />{mode === 'encoder-decoder' && <Range label="Первый токен исходной последовательности" value={source} min={-2} max={2} step={0.1} onChange={setSource} />}
      <Range label="Позиция запроса Q" value={query + 1} min={1} max={3} step={1} onChange={n => setQuery(n - 1)} /><Range label="Голова для разбора" value={h + 1} min={1} max={heads} step={1} onChange={n => setHead(n - 1)} />
      <p className="note">d_model=4, dₖ=dᵥ={4 / heads}; головы конкатенируются и проходят Wᴼ. Decoder видит текущую и предыдущие позиции. При обучении предсказанию следующего токена целевые токены сдвигают на один шаг.</p>
    </section><section className="panel"><h3>От входа к выходу</h3><Flow steps={['Embedding + позиция', mode === 'encoder' ? 'Self-attention' : 'Masked self-attention', 'Residual + LayerNorm', ...(mode === 'encoder-decoder' ? ['Cross-attention из encoder', 'Residual + LayerNorm'] : []), 'FFN: 4 → 6 → 4', 'Residual + LayerNorm']} />
      {mode === 'encoder-decoder' && <><p>Отдельный encoder обрабатывает source=[{sourceTokens.map(x => fmt(x, 1)).join('; ')}]. В cross-attention Q приходит из decoder, K и V — из выхода encoder. Измените source и проверьте выход.</p><div className="button-row"><button aria-pressed={!isCross} onClick={() => setView('self')}>Self-attention</button><button aria-pressed={isCross} onClick={() => setView('cross')}>Cross-attention</button></div></>}
      <p className="formula">scoreⱼ = Q{query + 1} · Kⱼ / √{4 / heads}<br />α = softmax(score) = [{row.map(v => fmt(v)).join('; ')}]; Σα = {fmt(row.reduce((a, b) => a + b, 0))}</p>
      <div ref={diagram.ref} style={{ width: '100%' }}><svg viewBox={`0 0 ${diagram.width} 170`} role="img" aria-label={`Запрос позиции ${query + 1}, веса внимания: ${row.map(v => fmt(v)).join('; ')}`} style={{ width: '100%', height: 170, display: 'block' }}>
        {row.map((weight, i) => <g key={i}><line x1={diagram.width / 2} y1={45} x2={sourceX(i)} y2={115} stroke="#286577" strokeWidth={1 + weight * 9} strokeDasharray={weight === 0 ? '4 4' : undefined} opacity={weight === 0 ? 0.25 : 0.8} /><rect x={sourceX(i) - sourceWidth / 2} y={112} width={sourceWidth} height={44} rx={8} fill="#eef2f6" stroke="#286577" /><text x={sourceX(i)} y={129} textAnchor="middle" fill="#173344" fontSize={12}>{isCross ? 'Source' : 'Позиция'} {i + 1}</text><text x={sourceX(i)} y={146} textAnchor="middle" fill="#173344" fontSize={12}>α={fmt(weight)}</text></g>)}
        <rect x={diagram.width / 2 - 57} y={10} width={114} height={36} rx={8} fill="#d5eff0" stroke="#286577" /><text x={diagram.width / 2} y={33} textAnchor="middle" fill="#173344" fontSize={13}>Запрос Q{query + 1}</text>
      </svg></div>
      <Matrix label={`${isCross ? 'Cross' : 'Self'}-attention, голова ${h + 1}: строки Q, столбцы K`} values={selected.weights} onSelect={(r) => setQuery(r)} marked={r => r === query} />
      <p>Строка {query + 1} собирает V: [{selected.output[query].map((v, d) => `${row.map((a, j) => `${fmt(a, 2)}×${fmt(selected.v[j][d], 2)}`).join(' + ')} = ${fmt(v)}`).join('; ')}].</p>
      <details><summary>Q, K, V и оценки до softmax</summary><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}><Matrix label={isCross ? 'Q = decoder после первого LayerNorm × WQ' : 'Q = X WQ (голова)'} values={selected.q} /><Matrix label={isCross ? 'K = encoder WK' : 'K = X WK'} values={selected.k} /><Matrix label={isCross ? 'V = encoder WV' : 'V = X WV'} values={selected.v} /><Matrix label="QKᵀ / √dₖ; −∞ означает маску" values={selected.scores} /></div></details>
      <details><summary>Embeddings и позиции: сложение по координатам</summary><p>Условный embedding e(x)=[x, x²/2, sin(x), cos(x)] задан вручную. Позиции нумеруются с 0: PE(p)=[sin(p), cos(p), sin(p/100), cos(p/100)]. Масштаб PE = {fmt(positionScale)}.</p><Matrix label="Embeddings E" values={trace.embeddings} /><Matrix label="Позиционный сигнал PE" values={trace.positions} /><Matrix label="Вход X = E + PE" values={trace.input} /></details>
      <details><summary>Residual, нормализация и FFN с текущими числами</summary><p>LayerNorm нормирует четыре признака каждой позиции: (x−μ)/√(variance+0.00001), γ=1, β=0. Используется post-norm: сначала сложение, затем нормализация.</p><Matrix label="Self-attention: Concat(heads) Wᴼ" values={trace.self.output} /><Matrix label="X + self-attention" values={trace.selfResidual} /><Matrix label="После первого LayerNorm" values={trace.selfNorm} />{trace.cross && <><Matrix label="Cross-attention: выход" values={trace.cross.output} /><Matrix label="Residual + cross-attention" values={trace.cross.residual} /><Matrix label="После cross LayerNorm" values={trace.cross.normalized} /></>}<p className="formula">FFN(x) = ReLU(xW₁ + 0.1)W₂ + 0.05</p><Matrix label="FFN: шесть скрытых активаций" values={trace.ffn.hidden} /><Matrix label="FFN: четыре выходных признака" values={trace.ffn.output} /><Matrix label="Residual перед последним LayerNorm" values={trace.ffn.residual} /></details>
      <Matrix label="Итог блока: по 4 признака для 3 позиций" values={trace.output} />
      <details><summary>Фиксированные веса и границы модели</summary>{Object.entries(transformerMatrices).map(([name, matrix]) => <Matrix key={name} label={`W_${name}`} values={matrix} />)}<p>Encoder и decoder используют одинаковые демонстрационные матрицы. Нет dropout, обучаемых γ/β, словаря, выходного классификатора, KV-cache, RoPE или обучения. В encoder–decoder исходная последовательность действительно проходит один encoder-блок; K и V вычисляются из его выхода.</p></details>
    </section></div><Exercise question="Откуда берутся Q, K и V в cross-attention decoder?" options={['Все из исходных токенов encoder', 'Q из decoder; K и V из выхода encoder', 'Q и K — случайные числа, V — маска']} correct={1} explanation="Decoder формулирует запрос Q к памяти encoder. Её ключи K определяют веса, значения V смешиваются по этим весам." /></></CoreTopicFilm>;
}

function FamilyPanel({ family }: { family: ArchitectureFamily }) {
  const [training, setTraining] = useState(false);
  const [trainingVisited, setTrainingVisited] = useState(false);
  const canTrain = family === 'cnn' || family === 'rnn';
  return <>
    {canTrain && <div className="button-row" role="group" aria-label={`Режим ${family.toUpperCase()}`}>
      <button aria-pressed={!training} onClick={() => setTraining(false)}>Прямой проход</button>
      <button aria-pressed={training} onClick={() => { setTrainingVisited(true); setTraining(true); }}>{family === 'cnn' ? 'Обучить фильтр' : 'Обучить RNN: BPTT'}</button>
    </div>}
    <div hidden={training}><LearningActivity active={!training}>
      {family === 'dense' ? <DenseLab /> : family === 'cnn' ? <CnnLab /> : family === 'transformer' ? <TransformerLab /> : <RecurrentLab family={family} />}
    </LearningActivity></div>
    {trainingVisited && <div hidden={!training}><LearningActivity active={training}>
      <Suspense fallback={<p role="status">Загружаем лабораторию обучения…</p>}>{family === 'cnn' ? <CnnTrainingLab /> : <BpttLab />}</Suspense>
    </LearningActivity></div>}
    <PracticeSection lessonId="architectures" topicId={training ? (family === 'cnn' ? 'unit.architecture.cnn-training' : 'unit.architecture.bptt') : `unit.architecture.${family}`} />
  </>;
}

export function ArchitectureLesson() {
  const [family, setFamily] = useState<ArchitectureFamily>('dense');
  const [visited, setVisited] = useState<ArchitectureFamily[]>(['dense']);
  function chooseFamily(next: ArchitectureFamily) {
    setFamily(next);
    setVisited(current => current.includes(next) ? current : [...current, next]);
  }
  const entry = architectureFamilies.find(f => f.id === family)!;
  return <section aria-labelledby="architectures-title"><h2 id="architectures-title">Архитектуры: проследите путь числа</h2><p className="lesson-intro">Выберите семейство, измените параметр и раскройте нужный шаг. Каждая активная схема связана с пересчитываемым прямым проходом. В CNN и RNN можно переключиться на обучение; состояния опытов сохраняются при смене семейства. Варианты, представленные только пояснением, отмечены отдельно.</p><div className="button-row" aria-label="Семейство архитектуры">{architectureFamilies.map(item => <button key={item.id} aria-pressed={family === item.id} onClick={() => chooseFamily(item.id)}>{item.name}</button>)}</div><p className="note"><strong>Вычисляется:</strong> {entry.supported}. <strong>Граница:</strong> {entry.schema}.</p>
    <p className="note">Нужные основы: <ConceptLink concept="tensor">тензоры и формы</ConceptLink>, <ConceptLink concept="matrix">матрицы</ConceptLink>, <ConceptLink concept="dot-product">скалярное произведение</ConceptLink>. Для внимания: <ConceptLink concept="softmax">softmax</ConceptLink> и <ConceptLink concept="normalization">нормализация</ConceptLink>.</p>
    {family === 'transformer' && <p><a href="#transformer">Transformer по шагам: от токена до генерации и вариантов →</a></p>}
    {visited.map(id => <div key={id} hidden={family !== id}><LearningActivity active={family === id}><FamilyPanel family={id} /></LearningActivity></div>)}
    <details><summary>Что реализовано и где проверить определения</summary><table className="data-table"><thead><tr><th>Семейство</th><th>Численно работает</th><th>Только схема / ограничение</th></tr></thead><tbody>{architectureFamilies.map(item => <tr key={item.id}><th>{item.name}</th><td>{item.supported}</td><td>{item.schema}</td></tr>)}</tbody></table><p>Формулы сверены с первичными источниками: <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.Conv2d.html">PyTorch Conv2D</a>, <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.LSTM.html">LSTM</a>, <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.GRU.html">GRU (отличие reset-after отмечено выше)</a>, <a href="https://arxiv.org/abs/1706.03762">Attention Is All You Need</a>. В CNN и RNN переключитесь в режим обучения: там работают общий фильтр и BPTT скалярной сети. Dense, LSTM, GRU и блок Transformer в этой главе показывают прямой проход.</p></details>
  </section>;
}
