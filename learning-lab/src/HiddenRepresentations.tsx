import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { boundaryNeuronParameters, traceBoundary, type BoundaryConfig, type BoundaryDataset, type BoundaryTrace } from './boundaryNetworkMath';
import { AnalyzeNumbers, LearningActivity } from './learning-context';
import { Scene3D, type SceneAxes, type Vec3 } from './ThreeD';
import { fmt } from './ui';
import './hidden-representations.css';

type TracedPoint = { id: string; input: [number, number]; target: 0 | 1; validation: boolean; trace: BoundaryTrace };
type Axis = { label: string; min: number; max: number };
const colors = ['#27669a', '#26724b'];
const vector = (values: readonly number[]) => `[${values.map(value => fmt(value, 6)).join('; ')}]`;
const coordinate = (index: number) => `h${index + 1}`;

function hiddenAxis(points: readonly (readonly number[])[], index: number): Axis {
  const values = points.map(point => point[index]);
  const min = Math.min(...values), max = Math.max(...values);
  const margin = min === max ? Math.max(1, Math.abs(min)) * .016 : max * .08 - min * .08;
  const lower = Math.max(-Number.MAX_VALUE, min - margin), upper = Math.min(Number.MAX_VALUE, max + margin);
  // ReLU values are nonnegative; padding must not overflow an otherwise finite span.
  return Number.isFinite(upper - lower)
    ? { label: coordinate(index), min: lower, max: upper }
    : { label: coordinate(index), min, max };
}

function RepresentationPlot({ title, points, positions, probe, axes, onSelect }: {
  title: string; points: TracedPoint[]; positions: readonly (readonly number[])[]; probe: readonly number[];
  axes: readonly [Axis, Axis?]; onSelect: (input: [number, number]) => void;
}) {
  const id = useId(), box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  useLayoutEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(entries => { if (entries[0].contentRect.width > 0) setWidth(entries[0].contentRect.width); });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const height = width + 12, left = 45, right = width - 18, top = 30, bottom = height - 45;
  const x = (value: number) => left + (value - axes[0].min) / (axes[0].max - axes[0].min) * (right - left);
  const y = (value: number) => axes[1] ? bottom - (value - axes[1].min) / (axes[1].max - axes[1].min) * (bottom - top) : (top + bottom) / 2;
  return <figure className="hidden-plot"><figcaption>{title}</figcaption><div ref={box}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`}>
    <title id={`${id}-title`}>{title}. {axes[0].label} по горизонтали{axes[1] ? `, ${axes[1].label} по вертикали` : '. Одномерное пространство, вертикальной координаты нет'}. Круг — класс 0, треугольник — класс 1; пустые фигуры — проверка. Точку можно точно выбрать в списке под картами.</title>
    {axes[1] ? <rect x={left} y={top} width={right - left} height={bottom - top} className="hidden-plot-frame" /> : <line x1={left} x2={right} y1={y(0)} y2={y(0)} className="hidden-plot-frame" />}
    {[0, .5, 1].map(t => <g key={t}>
      <text x={left + t * (right - left)} y={bottom + 20} textAnchor="middle">{fmt(axes[0].min + t * (axes[0].max - axes[0].min), 2)}</text>
      {axes[1] && <text x={left - 7} y={bottom - t * (bottom - top) + 4} textAnchor="end">{fmt(axes[1].min + t * (axes[1].max - axes[1].min), 2)}</text>}
    </g>)}
    <text x={(left + right) / 2} y={height - 4} textAnchor="middle">{axes[0].label}</text>
    {axes[1] && <text x={left} y="16">{axes[1].label}</text>}
    {points.map((point, index) => {
      const px = x(positions[index][0]), py = y(positions[index][1]);
      return <g key={point.id} className="hidden-sample" data-sample-id={point.id} data-split={point.validation ? 'validation' : 'train'} data-target={point.target} data-coordinate-x={positions[index][0]} data-coordinate-y={axes[1] ? positions[index][1] : undefined}
        fill={point.validation ? '#fffefa' : colors[point.target]} stroke={colors[point.target]} strokeWidth={point.validation ? 1.7 : 1} onClick={() => onSelect([...point.input])}>
        {point.target === 0 ? <circle cx={px} cy={py} r="3.7" /> : <path d={`M${px},${py - 4.8}l4.3,7.5h-8.6Z`} />}
        <title>{point.id} · {point.validation ? 'проверка' : 'обучение'} · класс {point.target} · {vector(positions[index])}</title>
      </g>;
    })}
    <circle className="hidden-probe" data-coordinate-x={probe[0]} data-coordinate-y={axes[1] ? probe[1] : undefined} cx={x(probe[0])} cy={y(probe[1])} r="8"><title>Общая проба: {vector(probe)}</title></circle>
  </svg></div></figure>;
}

export function HiddenRepresentations({ params, config, dataset, probe, onProbeChange, step, source }: {
  params: number[]; config: BoundaryConfig; dataset: BoundaryDataset; probe: [number, number];
  onProbeChange: (input: [number, number]) => void; step: number; source: string;
}) {
  const id = useId();
  const [choice, setChoice] = useState({ layer: 0, axes: [0, 1, 2], neuron: 0 });
  const [sceneOpen, setSceneOpen] = useState(false), [sceneVisited, setSceneVisited] = useState(false);
  // Derive the complete selection together: no render may use an axis from the old architecture.
  const layer = Math.min(choice.layer, Math.max(0, config.layers.length - 1));
  const selectedLayer = config.layers[layer];
  const width = selectedLayer?.width ?? 0;
  const axes = [...new Set([...choice.axes.filter(axis => axis < width), ...Array.from({ length: width }, (_, i) => i)])].slice(0, 3);
  const neuron = Math.min(choice.neuron, Math.max(0, width - 1));
  const points = useMemo<TracedPoint[]>(() => [
    ...dataset.train.map((point, i) => ({ ...point, id: `T${String(i + 1).padStart(3, '0')}`, validation: false })),
    ...dataset.validation.map((point, i) => ({ ...point, id: `V${String(i + 1).padStart(3, '0')}`, validation: true })),
  ].map(point => ({ ...point, trace: traceBoundary(params, config, point.input) })), [params, config, dataset]);
  const trace = useMemo(() => traceBoundary(params, config, probe), [params, config, probe]);
  const selectedPoint = points.find(point => point.input[0] === probe[0] && point.input[1] === probe[1]);
  const hidden = width ? points.map(point => point.trace.activations[layer + 1]) : [];
  const probeHidden = width ? trace.activations[layer + 1] : [];
  const domains = axes.map(axis => hiddenAxis([...hidden, probeHidden], axis));
  const neuronParameters = width ? boundaryNeuronParameters(params, config, layer, neuron) : null;
  function changeAxis(slot: number, value: number) {
    const next = [...axes];
    const existing = next.indexOf(value);
    if (existing !== -1) next[existing] = next[slot];
    next[slot] = value;
    setChoice({ layer, axes: next, neuron });
  }

  return <section className="hidden-representations" aria-labelledby={`${id}-heading`} data-step={step} data-layer={width ? layer + 1 : 'none'}>
    <span className="eyebrow">Что происходит между входом и ответом</span>
    <h4 id={`${id}-heading`}>Как сеть преобразует точки</h4>
    <p>Слева — исходные x₁ и x₂. Справа — ответы нейронов выбранного скрытого слоя: h = activation(Wa + b). Это те же 96 обучающих и 32 проверочные точки, пропущенные через текущие веса сети.</p>
    <p className="note hidden-source">{source} · шаг <strong>{step}</strong>. Проба {selectedPoint ? `${selectedPoint.id} (${selectedPoint.validation ? 'проверка' : 'обучение'})` : 'свободная'}: x = {vector(probe)}. Перед первым слоем a⁽⁰⁾ = 2x − 1 = {vector(trace.activations[0])}.</p>
    <div className="hidden-controls">
      <label>Показать скрытый слой<select disabled={!width} value={layer} onChange={event => setChoice({ layer: Number(event.target.value), axes: [0, 1, 2], neuron: 0 })}>
        {!width && <option value={0}>Скрытых слоёв нет</option>}
        {config.layers.map((item, i) => <option key={i} value={i}>Слой {i + 1} · {item.width} координат · {item.activation}</option>)}
      </select></label>
      {width > 0 && [0, 1].slice(0, Math.min(2, width)).map(slot => <label key={slot}>Координата {slot === 0 ? 'по горизонтали' : 'по вертикали'}<select value={axes[slot]} onChange={event => changeAxis(slot, Number(event.target.value))}>
        {Array.from({ length: width }, (_, i) => <option key={i} value={i}>{coordinate(i)} · нейрон {i + 1}</option>)}
      </select></label>)}
    </div>
    <div className="hidden-map-pair">
      <RepresentationPlot title="Входное пространство · 2D" points={points} positions={points.map(point => point.input)} probe={probe} axes={[{ label: 'Вход x₁', min: 0, max: 1 }, { label: 'Вход x₂', min: 0, max: 1 }]} onSelect={onProbeChange} />
      {width ? <RepresentationPlot title={`Слой ${layer + 1} · ${width === 1 ? '1D' : '2D'}`} points={points} positions={hidden.map(values => axes.slice(0, 2).map(axis => values[axis]))} probe={axes.slice(0, 2).map(axis => probeHidden[axis])} axes={[domains[0], domains[1]]} onSelect={onProbeChange} />
        : <div className="hidden-empty"><h5>Скрытого представления нет</h5><p>В этой сети p = sigmoid(Wa⁽⁰⁾ + b). Вход сразу поступает в выходной нейрон. Добавьте скрытый слой в настройках сети, чтобы увидеть его координаты.</p><p>Для пробы: логит {fmt(trace.logit, 6)}; p = {fmt(trace.probability, 6)}.</p></div>}
    </div>
    <div className="boundary-legend" aria-label="Легенда представлений"><span><i className="boundary-key-circle" />Класс 0</span><span><i className="boundary-key-triangle" />Класс 1</span><span><i className="boundary-key-train" />T · обучение</span><span><i className="boundary-key-validation" />V · проверка</span><span><i className="boundary-key-probe" />Общая проба</span></div>
    {width > 0 && <p className="note">{width === 1 ? 'В слое один нейрон: его ответы лежат на одной оси h1. Вертикального признака нет; точки могут перекрываться.' : width > 2 ? `В слое ${width} координат. Плоская карта показывает только ${coordinate(axes[0])} и ${coordinate(axes[1])}: это выбор координат, не PCA и не всё пространство.` : 'У этого слоя две координаты — обе показаны на плоской карте.'} Совпадение на проекции само по себе не доказывает, что полные векторы совпадают или классы неразделимы. Диапазоны осей подстраиваются под текущие точки и пробу, масштабы независимы; видимые расстояния нельзя сравнивать между картами и шагами.</p>}
    <label className="hidden-point-selector">Выбрать точную точку общей пробы<select value={selectedPoint?.id ?? 'manual'} onChange={event => {
      const point = points.find(item => item.id === event.target.value);
      if (point) onProbeChange([...point.input]);
    }}><option value="manual" disabled>Свободная проба · задаётся на карте выше или ползунками</option>{points.map(point => <option key={point.id} value={point.id}>{point.id} · {point.validation ? 'проверка' : 'обучение'} · класс {point.target} · x = {vector(point.input)}</option>)}</select></label>
    <p className="note">Выбор по ID сохраняет точный вход без округления, даже если несколько точек перекрылись. Цвет, форма и ID одной точки совпадают на обеих картах; фиолетовая проба общая с картой решений выше.</p>

    {width > 0 && <>
      <div className="hidden-probe-details"><h5>Числа выбранной пробы · слой {layer + 1}</h5>
        <p>Вход слоя a = {vector(trace.activations[layer])}<br />Суммы z = Wa + b = {vector(trace.preactivations[layer])}<br />Полный вектор h = {selectedLayer.activation}(z) = {vector(probeHidden)}</p>
        <label>Нейрон для разбора<select value={neuron} onChange={event => setChoice({ layer, axes, neuron: Number(event.target.value) })}>{Array.from({ length: width }, (_, i) => <option key={i} value={i}>Нейрон {i + 1} · {coordinate(i)} = {fmt(probeHidden[i], 6)}</option>)}</select></label>
        {neuronParameters && <AnalyzeNumbers snapshot={{ kind: 'dot-product', origin: `MLP · ${source} · шаг ${step}`, detail: `${selectedPoint?.id ?? 'Свободная проба'}; x = [${probe.join('; ')}]; скрытый слой ${layer + 1}, нейрон ${neuron + 1}; z = ${trace.preactivations[layer][neuron]}, h = ${probeHidden[neuron]}`, inputs: trace.activations[layer], accumulation: 'bias-first', ...neuronParameters }} />}
        <p className="note">Итог сети после всех слоёв: логит {fmt(trace.logit, 6)}, p(класс 1) = {fmt(trace.probability, 6)}. Здесь показаны округлённые числа; расчёт и передача в разбор используют полную точность.</p>
      </div>
      <details className="hidden-3d" onToggle={event => { const open = event.currentTarget.open; setSceneOpen(open); if (open) setSceneVisited(true); }}>
        <summary>3D: три координаты скрытого слоя{width < 3 ? ' · недоступно для этого слоя' : ''}</summary>
        {width < 3 ? <p>У слоя только {width === 1 ? 'одна координата' : 'две координаты'}. Третьего скрытого признака нет, поэтому 3D не строится. Используйте плоскую карту и числа.</p> : <>
          <label>Третья координата<select value={axes[2]} onChange={event => changeAxis(2, Number(event.target.value))}>{Array.from({ length: width }, (_, i) => <option key={i} value={i}>{coordinate(i)} · нейрон {i + 1}</option>)}</select></label>
          <p className="note">Каждая ось — выход отдельного нейрона слоя {layer + 1}. Слой выбирается отдельно и не служит пространственной осью. {width > 3 ? `Показаны 3 из ${width} координат; это координатная проекция, не PCA.` : 'Это все три координаты данного слоя.'} Оси масштабируются независимо. Перекрытия зависят от ракурса; точные значения доступны в таблице всех точек ниже.</p>
          {sceneVisited && <LearningActivity active={sceneOpen}><Scene3D title={`Слой ${layer + 1}: ${axes.map(coordinate).join(', ')}`}
            description={`Ответы трёх разных нейронов скрытого слоя ${layer + 1}, шаг ${step}. Круги — класс 0, треугольники — класс 1, пустые фигуры — проверка. Фиолетовая точка — общая проба.`}
            axes={domains as unknown as SceneAxes} showLegend={false}
            points={[...points.map((point, i) => ({ name: `${point.id} · ${point.validation ? 'проверка' : 'обучение'} · класс ${point.target}`, position: axes.map(axis => hidden[i][axis]) as unknown as Vec3, color: colors[point.target], shape: point.target === 0 ? 'circle' as const : 'triangle' as const, hollow: point.validation })), { name: `${selectedPoint?.id ?? 'Свободная проба'} · общая проба`, position: axes.map(axis => probeHidden[axis]) as unknown as Vec3, color: '#694799' }]} />
          </LearningActivity>}
        </>}
      </details>
    </>}
    <details className="hidden-data"><summary>Все точки и точные координаты · 128 точек{width ? ` · слой ${layer + 1}` : ' · входы и выход'}</summary>
      <div className="hidden-table-wrap" tabIndex={0} role="region" aria-label="Все 128 точек; таблицу можно прокручивать по горизонтали"><table><caption>Текущие веса, шаг {step}. T — обучение, V — проверка. Числа округлены до 6 знаков; ID выбирает исходную точку без округления. {width > 0 && 'Векторы приведены целиком, включая не показанные на карте координаты.'}</caption><thead><tr><th scope="col">ID</th><th scope="col">Класс</th><th scope="col">Вход x</th>{width > 0 && <><th scope="col">Вход слоя a</th><th scope="col">Все суммы z</th><th scope="col">Полный вектор h</th></>}<th scope="col">p(класс 1)</th></tr></thead><tbody>{points.map(point => <tr key={point.id} data-sample-id={point.id} aria-selected={selectedPoint?.id === point.id}>
        <th scope="row"><button type="button" aria-label={`Выбрать ${point.id} как общую пробу`} onClick={() => onProbeChange([...point.input])}>{point.id}</button></th><td>{point.target}</td><td>{vector(point.input)}</td>{width > 0 && <><td>{vector(point.trace.activations[layer])}</td><td>{vector(point.trace.preactivations[layer])}</td><td>{vector(point.trace.activations[layer + 1])}</td></>}<td>{fmt(point.trace.probability, 6)}</td>
      </tr>)}</tbody></table></div>
    </details>
  </section>;
}
