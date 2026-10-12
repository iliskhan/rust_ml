import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Scene3D from './Scene3D';
import { Chart, Exercise, Range, fmt } from './ui';
import type { SceneLine, ScenePoint, Vec3 } from './scene3dMath';
import { EGNN_COORDINATES, EGNN_FEATURES, conditionalFlowPoint, createFieldModel, createFlowModel, equivarianceTrace, fieldSamples, flowData, flowNoise, flowSamples, flowShapeError, flowStatistics, integrateFlow, neuralField, referenceField, renderFieldRay, tinyLoss, tinyPredict, trainField, trainFlow, type FlowDistribution, type Vec2 } from './flowGeometryMath';
import './flow-geometry.css';

function NumericTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: ReactNode[][] }) {
  return <div className="fg-table-scroll" tabIndex={0} role="region" aria-label={`${caption}. Прокручиваемая численная таблица`}>
    <table className="data-table"><caption>{caption}</caption><thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{row.map((value, j) => j === 0 ? <th scope="row" key={j}>{value}</th> : <td key={j}>{value}</td>)}</tr>)}</tbody></table>
  </div>;
}
const numbers = (values: readonly number[], digits = 4) => `[${values.map(v => fmt(v, digits)).join('; ')}]`;
const rgb = (color: Vec3) => `rgb(${color.map(v => Math.round(255 * Math.max(0, Math.min(1, v)))).join(' ')})`;
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
function vectorArrow(name: string, start: Vec3, end: Vec3, color: string, dashed = false): SceneLine[] {
  const delta = end.map((v, d) => v - start[d]), length = Math.hypot(...delta);
  if (length < 1e-10) return [];
  const direction = delta.map(v => v / length), auxiliary = Math.abs(direction[2]) < .8 ? [0, 0, 1] : [0, 1, 0];
  const cross = [direction[1] * auxiliary[2] - direction[2] * auxiliary[1], direction[2] * auxiliary[0] - direction[0] * auxiliary[2], direction[0] * auxiliary[1] - direction[1] * auxiliary[0]];
  const norm = Math.hypot(...cross), head = Math.min(.11, length * .3);
  const wing = (sign: number): Vec3 => end.map((v, d) => v - head * direction[d] + sign * head * .4 * cross[d] / norm) as unknown as Vec3;
  return [{ name, points: [start, end], color, dashed }, { name: `${name}: наконечник`, points: [wing(1), end, wing(-1)], color, dashed }];
}

function FlowPlane({ model, time, paths, data, noise, selected }: {
  model: ReturnType<typeof createFlowModel>; time: number; paths: Vec2[][]; data: Vec2[]; noise: Vec2[]; selected: number;
}) {
  const id = useId().replace(/:/g, ''), viewport = useRef<HTMLDivElement>(null), [width, setWidth] = useState(420);
  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container) return;
    if (container.clientWidth > 0) setWidth(container.clientWidth);
    const observer = new ResizeObserver(entries => {
      // Keep SVG units equal to CSS pixels; hidden panels must not collapse the last useful viewport.
      const measured = entries[0].contentRect.width;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const low = -3.2, high = 3.2, left = 32, top = 18, size = Math.max(1, width - left - 16), right = left + size, bottom = top + size;
  const scale = size / (high - low), x = (value: number) => left + (value - low) * scale, y = (value: number) => bottom - (value - low) * scale;
  const atTime = (path: Vec2[]) => {
    const index = time * (path.length - 1), before = Math.floor(index), after = Math.min(path.length - 1, before + 1), fraction = index - before;
    return [path[before][0] + fraction * (path[after][0] - path[before][0]), path[before][1] + fraction * (path[after][1] - path[before][1])] as Vec2;
  };
  const conditional = conditionalFlowPoint(noise[selected], data[selected], time), highlighted = atTime(paths[selected]);
  const clipped = [...noise, ...data, ...paths.map(atTime)].filter(point => point.some(v => v < low || v > high)).length;
  return <figure className="fg-plane"><figcaption>Плоскость данных · x и y, условные единицы</figcaption>
    <div className="fg-plane-view" ref={viewport}><svg viewBox={`0 0 ${width} ${bottom + 32}`} role="img" aria-label={`Поле скорости при t=${fmt(time, 2)}, шум, данные и ODE-частицы. Выбрана частица ${selected + 1}.`}>
      <title>Реальное поле MLP и его интегрированные траектории</title><desc>Оранжевые точки — целевые данные, серые — исходный шум, зелёные — текущее положение по ODE. Синий пунктир — отдельная условная прямая обучающей пары. Числа доступны в таблице под графиком.</desc>
      <defs><clipPath id={`${id}-clip`}><rect x={left} y={top} width={size} height={size} /></clipPath><marker id={`${id}-arrow`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0L6,3L0,6Z" fill="#27694e" /></marker></defs>
      {[-2, 0, 2].map(value => <g key={value}><line x1={x(value)} x2={x(value)} y1={top} y2={bottom} className="grid-line" /><line x1={left} x2={right} y1={y(value)} y2={y(value)} className="grid-line" /><text x={x(value)} y={bottom + 18} textAnchor="middle">{value}</text><text x={left - 8} y={y(value)} textAnchor="end" dominantBaseline="middle">{value}</text></g>)}
      <text x={right + 3} y={bottom + 18}>x</text><text x="10" y={top}>y</text>
      <g clipPath={`url(#${id}-clip)`}>
        {Array.from({ length: 81 }, (_, i) => {
          const point: Vec2 = [-2.8 + .7 * (i % 9), -2.8 + .7 * Math.floor(i / 9)], velocity = tinyPredict(model, [...point, time]);
          return <line key={i} x1={x(point[0])} y1={y(point[1])} x2={x(point[0] + .12 * velocity[0])} y2={y(point[1] + .12 * velocity[1])} stroke="#27694e" strokeOpacity=".45" strokeWidth="1.1" markerEnd={`url(#${id}-arrow)`} />;
        })}
        {paths.filter((_, i) => i < 7 || i === selected).map((path, i) => <path key={i} d={path.map((point, j) => `${j ? 'L' : 'M'}${x(point[0])},${y(point[1])}`).join(' ')} fill="none" stroke="#27694e" strokeOpacity=".4" strokeWidth="1.3" />)}
        <line x1={x(noise[selected][0])} y1={y(noise[selected][1])} x2={x(data[selected][0])} y2={y(data[selected][1])} stroke="#2a7293" strokeDasharray="6 4" strokeWidth="2" />
        {noise.map((point, i) => <circle key={`n${i}`} cx={x(point[0])} cy={y(point[1])} r="2.5" fill="#7a8179" />)}
        {data.map((point, i) => <circle key={`d${i}`} cx={x(point[0])} cy={y(point[1])} r="3" fill="#b75d24" />)}
        {paths.map((path, i) => { const p = atTime(path); return <circle key={`p${i}`} cx={x(p[0])} cy={y(p[1])} r={i === selected ? 5 : 3} fill="#27694e" stroke={i === selected ? 'white' : undefined} strokeWidth="1.5" />; })}
        <circle cx={x(conditional.position[0])} cy={y(conditional.position[1])} r="5" fill="none" stroke="#2a7293" strokeWidth="2" />
      </g>
    </svg></div>
    <div className="fg-legend"><span><i style={{ background: '#7a8179' }} />Шум x₀</span><span><i style={{ background: '#b75d24' }} />Данные x₁</span><span><i style={{ background: '#27694e' }} />ODE при t</span><span><i style={{ background: '#2a7293' }} />Условная пара</span></div>
    <p>Стрелка: 0,12 · vθ(x,t), в единицах плоскости. Зелёные линии: первые 7 траекторий и выбранная; точки: все 72 частицы. Диапазон x,y: −3,2…3,2.</p>
    {clipped > 0 && <p role="status">За рамкой: {clipped} из 216 точек шума, данных и текущего ODE. Их исходные числа есть в таблице.</p>}
    <p>Выбранная ODE-частица при t: {numbers(highlighted)}. Условная прямая той же шумовой точки к выбранному образцу: {numbers(conditional.position)}.</p>
  </figure>;
}

export function FlowMatchingLab() {
  const [distribution, setDistribution] = useState<FlowDistribution>('blobs'), [model, setModel] = useState(createFlowModel), [time, setTime] = useState(.5), [steps, setSteps] = useState(32), [selected, setSelected] = useState(0), [history, setHistory] = useState<{ x: number; y: number }[]>([]), [dataOpen, setDataOpen] = useState(false);
  const validation = useMemo(() => flowSamples(distribution, 256, 80003), [distribution]);
  const noise = useMemo(() => flowNoise(), []), data = useMemo(() => flowData(distribution), [distribution]);
  const loss = useMemo(() => tinyLoss(model, validation), [model, validation]);
  const initialLoss = useMemo(() => tinyLoss(createFlowModel(), validation), [validation]);
  const paths = useMemo(() => noise.map(point => integrateFlow(model, point, steps)), [model, noise, steps]);
  const generated = paths.map(path => path.at(-1)!), generatedStats = flowStatistics(generated), targetStats = flowStatistics(data);
  const conditional = conditionalFlowPoint(noise[selected], data[selected], time);
  const prediction = tinyPredict(model, [...conditional.position, time]);
  function train(count: number) { const next = trainFlow(model, distribution, count); setModel(next); setHistory(previous => [...(previous.length ? previous : [{ x: 0, y: initialLoss }]), { x: next.steps, y: tinyLoss(next, validation) }]); }
  function reset(next: FlowDistribution = distribution) { setDistribution(next); setModel(createFlowModel()); setHistory([]); }
  return <section className="flow-geometry-lab" aria-label="Лаборатория flow matching">
    <div className="lesson-intro"><span className="eyebrow">Flow matching · обучаем скорость</span><h3>Шум движется по полю, которое ты обучаешь</h3>
      <p>MLP 3 → 24 → 2 со скрытым tanh получает x, y и время t, возвращает две компоненты скорости. Обучение создаёт независимые пары «гауссовский шум N(0,I) → данные» и регрессирует скорость прямого условного пути. Все 146 весов и bias меняются настоящим backprop и Adam в браузере.</p>
      <p>В начале сеть случайная. ODE использует только vθ(x,t): выбранная оранжевая точка ей не передаётся. Учебные данные двумерные; это не генератор фотографий.</p></div>
    <div className="lab-grid"><div className="panel"><h4>1. Обучи поле и измени интегрирование</h4>
      <div className="button-row"><button aria-pressed={distribution === 'blobs'} onClick={() => reset('blobs')}>Два облака</button><button aria-pressed={distribution === 'ring'} onClick={() => reset('ring')}>Кольцо</button></div>
      <p>Смена распределения сбрасывает веса. Облака: центры ±(1,15; 0,5), шум σx=0,22, σy=0,3. Кольцо: радиус 1,4 ± шум σ=0,12.</p>
      <div className="button-row"><button onClick={() => train(100)}>Обучить +100 шагов</button><button onClick={() => train(500)}>Обучить +500 шагов</button><button onClick={() => reset()}>Сбросить обучение</button></div>
      <p role="status">Обновлений Adam: <strong>{model.steps}</strong>. MSE на 256 фиксированных проверочных парах: <strong>{fmt(loss, 5)}</strong>; до обучения: {fmt(initialLoss, 5)}.</p>
      <p>Каждый шаг — 40 новых независимых пар и t ∈ [0,1]; learning rate 0,008. Проверочные пары не используются для градиента. Их условные скорости могут различаться рядом с одной (x,t), поэтому residual MSE не обязан исчезнуть.</p>
      <Range label="Время пути t (не пространственная ось)" value={time} min={0} max={1} step={.05} onChange={setTime} />
      <Range label="Число шагов ODE (метод средней точки)" value={steps} min={4} max={128} step={4} onChange={setSteps} />
      <Range label="Выбранная частица" value={selected + 1} min={1} max={72} step={1} onChange={value => setSelected(value - 1)} />
      <p>Мало ODE-шагов даёт ошибку численного решения. Больше шагов уточняет движение по текущему полю; качество самого поля зависит от обучения.</p>
    </div><div className="panel"><h4>2. Посмотри, куда пришли частицы</h4><FlowPlane model={model} time={time} paths={paths} data={data} noise={noise} selected={selected} /></div></div>
    <div className="panel"><h4>3. Раздели условный путь и путь генерации</h4><p className="formula">xₜ = (1−t)x₀ + tx₁; u = x₁−x₀; L = среднее ‖vθ(xₜ,t)−u‖² / 2. Генерация: dx/dt = vθ(x,t).</p>
      <p>Синий пунктир прямой по построению. Обучаемая скорость приближает среднюю условную скорость для текущих (x,t), поэтому зелёная маргинальная траектория может изгибаться и завершиться у другого образца. Прямые условные пути не делают все ODE-траектории прямыми.</p>
      <NumericTable caption={`Условная пара ${selected + 1}: числа для одной проверки`} columns={['Величина', 'x', 'y']} rows={[
        ['Шум x₀', ...noise[selected].map(v => fmt(v, 5))], ['Цель x₁', ...data[selected].map(v => fmt(v, 5))], ['Условное xₜ', ...conditional.position.map(v => fmt(v, 5))], ['Метка u', ...conditional.velocity.map(v => fmt(v, 5))], ['Предсказание vθ в условном xₜ', ...prediction.map(v => fmt(v, 5))], ['Финиш ODE из x₀', ...generated[selected].map(v => fmt(v, 5))],
      ]} />
      <NumericTable caption="Распределения при t=1: описательные числа 72 образцов" columns={['Величина', 'Данные', 'Финиш ODE']} rows={[
        ['Средний x', fmt(targetStats.meanX), fmt(generatedStats.meanX)], ['Средний y', fmt(targetStats.meanY), fmt(generatedStats.meanY)], ['Средний радиус √(x²+y²)', fmt(targetStats.radius), fmt(generatedStats.radius)], ['Доля слева от x=0', fmt(targetStats.left), fmt(generatedStats.left)], [distribution === 'ring' ? 'Среднее (радиус−1,4)²' : 'Среднее расстояние² до ближайшего центра', fmt(flowShapeError(data, distribution), 5), fmt(flowShapeError(generated, distribution), 5)],
      ]} />
      <p>Совпадение этих сводных чисел не доказывает совпадение распределений. Сравните также формы облаков на плоскости и сходимость при изменении ODE-шагов.</p>
      <Chart series={[{ name: 'Проверочная CFM MSE', points: history.length ? history : [{ x: 0, y: initialLoss }] }]} xLabel="Фактические обновления Adam" yLabel="MSE двух компонент скорости" />
      <details onToggle={event => setDataOpen(event.currentTarget.open)}><summary>Числа всех 72 ODE-траекторий: старт и финиш</summary>{dataOpen && <NumericTable caption="Точки до и после ODE; полный путь выбранной частицы ниже" columns={['Частица', 'x₀', 'y₀', 'x(1)', 'y(1)']} rows={noise.map((point, i) => [i + 1, ...point.map(v => fmt(v, 6)), ...generated[i].map(v => fmt(v, 6))])} />}</details>
      <details><summary>Численная траектория выбранной частицы</summary><NumericTable caption="ODE, метод средней точки" columns={['Шаг', 't', 'x', 'y']} rows={paths[selected].map((point, i) => [i, fmt(i / steps, 6), ...point.map(v => fmt(v, 6))])} /></details>
      <p><a href="https://arxiv.org/abs/2210.02747" target="_blank" rel="noreferrer">Flow Matching for Generative Modeling · первичная статья</a></p>
    </div>
    <Exercise question="Должен ли финиш ODE попасть в выбранную оранжевую точку?" options={['Нет: ODE не получает выбранный x₁', 'Да: каждый шум закреплён за ней', 'Да: если увеличить число шагов']} correct={0} explanation="Обучение использует условные пары. Генерация интегрирует общее поле vθ(x,t), которое приближает маргинальную скорость." />
  </section>;
}

export function EquivariantLab() {
  const [coordinates, setCoordinates] = useState<Vec3[]>(() => EGNN_COORDINATES.map(p => [...p] as unknown as Vec3)), [features, setFeatures] = useState([...EGNN_FEATURES]);
  const [z, setZ] = useState(65), [y, setY] = useState(-25), [reflection, setReflection] = useState(false), [translation, setTranslation] = useState<Vec3>([.6, -.3, .2]), [strength, setStrength] = useState(.4), [selected, setSelected] = useState(0), [broken, setBroken] = useState(false);
  const trace = useMemo(() => equivarianceTrace(coordinates, features, z, y, reflection, translation, strength, broken), [coordinates, features, z, y, reflection, translation, strength, broken]);
  const all = [...coordinates, ...trace.original.positions, ...trace.transformedInput, ...trace.transformed.positions, ...trace.expectedPositions], extent = Math.max(2, Math.ceil((Math.max(...all.flatMap(p => p.map(Math.abs))) + .3) * 10) / 10);
  const lines: SceneLine[] = coordinates.flatMap((point, i) => [
    ...vectorArrow(`Исходное Δx, узел ${i + 1}`, point, trace.original.positions[i], '#9f4a19'),
    ...vectorArrow(`Δx после преобразования, узел ${i + 1}`, trace.transformedInput[i], trace.transformed.positions[i], '#27694e'),
    { name: `Ожидаемое RΔx, узел ${i + 1}`, points: [trace.transformedInput[i], add(trace.transformedInput[i], trace.expectedVectors[i])], color: '#6a52a0', dashed: true },
  ]);
  const points: ScenePoint[] = coordinates.flatMap((point, i) => [{ name: `Исходный узел ${i + 1}`, position: point, color: '#9f4a19' }, { name: `Преобразованный узел ${i + 1}`, position: trace.transformedInput[i], color: '#27694e' }, { name: `Выход x′ узла ${i + 1}`, position: trace.transformed.positions[i], color: '#27694e', hollow: true }]);
  function reset() { setCoordinates(EGNN_COORDINATES.map(p => [...p] as unknown as Vec3)); setFeatures([...EGNN_FEATURES]); setZ(65); setY(-25); setReflection(false); setTranslation([.6, -.3, .2]); setStrength(.4); setSelected(0); setBroken(false); }
  return <section className="flow-geometry-lab" aria-label="Лаборатория эквивариантной геометрии EGNN">
    <div className="lesson-intro"><span className="eyebrow">EGNN · симметрии реального пространства</span><h3>Поверни вход — векторный выход повернётся вместе с ним</h3>
      <p>Четыре узла имеют физические координаты x, y, z в метрах и скалярные признаки h в условных единицах. Мини-блок строит сообщения по hᵢ, hⱼ и квадрату расстояния; векторный выход — взвешенная сумма относительных направлений.</p>
      <p>Веса этого блока фиксированы, обучение задаче не выполняется. Проверяем структуру E(3)-эквивариантности, включая отражения. Перестановка узлов в GCN — другая симметрия; здесь меняются пространственные координаты.</p></div>
    <div className="lab-grid"><div className="panel"><h4>1. Измени физическое преобразование</h4>
      <Range label="Поворот вокруг физической оси Z, °" value={z} min={-180} max={180} step={1} onChange={setZ} /><Range label="Поворот вокруг физической оси Y, °" value={y} min={-180} max={180} step={1} onChange={setY} />
      <label className="fg-check"><input type="checkbox" checked={reflection} onChange={e => setReflection(e.target.checked)} />Отразить X перед поворотами</label>
      {['X', 'Y', 'Z'].map((axis, d) => <Range key={axis} label={`Сдвиг по ${axis}, м`} value={translation[d]} min={-1.5} max={1.5} step={.1} onChange={value => setTranslation(translation.map((v, j) => j === d ? value : v) as unknown as Vec3)} />)}
      <Range label="Сила координатного обновления λ" value={strength} min={0} max={.8} step={.05} onChange={setStrength} />
      <label className="fg-check"><input type="checkbox" checked={broken} onChange={e => setBroken(e.target.checked)} />Нарушить симметрию: добавить 0,5·xᵢ в сообщение</label>
      <p>Последний переключатель передаёт абсолютный X в скалярное сообщение. При ненулевом повороте, отражении или сдвиге равенство обычно нарушится. При тождественном преобразовании оба варианта дают нулевую ошибку.</p>
      <button onClick={reset}>Сбросить EGNN</button>
    </div><div className="panel"><h4>2. Сравни стрелки в физических координатах</h4>
      <Scene3D title="Входные точки и векторное обновление Δx" description="Оранжевый: исходный вход и Δx. Зелёный: расчёт блока на преобразованном входе. Фиолетовый пунктир: ожидаемый RΔx. При эквивариантности зелёная стрелка совпадает с пунктиром. Полые точки — новые координаты x′. Поворот вида ниже меняет только камеру." axes={[{ label: 'Физический x, м', min: -extent, max: extent }, { label: 'Физический y, м', min: -extent, max: extent }, { label: 'Физический z, м', min: -extent, max: extent }]} lines={lines} points={points} showLegend={false} />
    </div></div>
    <div className="panel"><h4>3. Проверь две стороны равенства численно</h4>
      <p className="formula">mᵢⱼ = tanh(0,6hᵢ − 0,2hⱼ − 0,4‖xᵢ−xⱼ‖² + 0,1); Δxᵢ = λ/3 · Σⱼ≠ᵢ (xᵢ−xⱼ)tanh(0,8mᵢⱼ−0,15); x′ᵢ = xᵢ + Δxᵢ; h′ᵢ = tanh(0,7hᵢ + 0,5Σⱼmᵢⱼ).</p>
      <p>Для скаляров h′(Rx+a)=h′(x). Для смещений Δx(Rx+a)=RΔx(x): перенос к вектору не прибавляется. Для позиций x′(Rx+a)=Rx′(x)+a. Все ошибки ниже — максимум по четырём узлам; векторные ошибки измеряются евклидовой нормой.</p>
      <div className="fg-metrics" role="status"><p>Ошибка скаляра h′<strong>{fmt(trace.scalarError, 8)}</strong></p><p>Ошибка вектора Δx, м<strong>{fmt(trace.vectorError, 8)}</strong></p><p>Ошибка позиции x′, м<strong>{fmt(trace.positionError, 8)}</strong></p></div>
      <p>{broken ? 'Включено абсолютное X: структура блока больше не обеспечивает E(3).' : 'При этой проверке различия остаются на уровне машинного округления. Это численная проверка текущего входа; причина симметрии — инвариантные расстояния и линейное преобразование относительных векторов.'}</p>
      <Range label="Редактируемый узел" value={selected + 1} min={1} max={4} step={1} onChange={value => setSelected(value - 1)} />
      <div className="fg-controls-grid">{['x', 'y', 'z'].map((axis, d) => <Range key={axis} label={`Узел ${selected + 1}: ${axis}, м`} value={coordinates[selected][d]} min={-1.4} max={1.4} step={.1} onChange={value => setCoordinates(coordinates.map((point, i) => i === selected ? point.map((v, j) => j === d ? value : v) as unknown as Vec3 : point))} />)}<Range label={`Узел ${selected + 1}: скаляр h`} value={features[selected]} min={-1} max={1} step={.1} onChange={value => setFeatures(features.map((v, i) => i === selected ? value : v))} /></div>
      <NumericTable caption="Скалярные выходы всех узлов" columns={['Узел', 'h', 'h′(x)', 'h′(Rx+a)', '|разница|']} rows={features.map((feature, i) => [i + 1, fmt(feature), fmt(trace.original.scalars[i], 6), fmt(trace.transformed.scalars[i], 6), fmt(Math.abs(trace.original.scalars[i] - trace.transformed.scalars[i]), 8)])} />
      <NumericTable caption={`Узел ${selected + 1}: плоская численная альтернатива 3D`} columns={['Величина', 'x, м', 'y, м', 'z, м']} rows={[
        ['x', ...coordinates[selected].map(v => fmt(v, 6))], ['Rx+a', ...trace.transformedInput[selected].map(v => fmt(v, 6))], ['Исходное Δx(x)', ...trace.original.vectors[selected].map(v => fmt(v, 6))], ['Ожидаемое RΔx(x)', ...trace.expectedVectors[selected].map(v => fmt(v, 6))], ['Фактическое Δx(Rx+a)', ...trace.transformed.vectors[selected].map(v => fmt(v, 6))], ['Ожидаемое Rx′+a', ...trace.expectedPositions[selected].map(v => fmt(v, 6))], ['Фактическое x′(Rx+a)', ...trace.transformed.positions[selected].map(v => fmt(v, 6))],
      ]} />
      <NumericTable caption={`Сообщения выбранного узла ${selected + 1}`} columns={['Сосед j', 'mᵢⱼ на x', 'mᵢⱼ на Rx+a']} rows={features.map((_, j) => [j + 1, j === selected ? 'Нет ребра к себе' : fmt(trace.original.messages[selected][j], 6), j === selected ? 'Нет ребра к себе' : fmt(trace.transformed.messages[selected][j], 6)])} />
      <p><a href="https://arxiv.org/abs/2102.09844" target="_blank" rel="noreferrer">E(n) Equivariant Graph Neural Networks · первичная статья</a></p>
    </div>
    <Exercise question="При переносе всей сцены на a как должен измениться вектор Δx?" options={['Остаться тем же', 'Получить прибавку a', 'Стать скаляром']} correct={0} explanation="Вектор смещения — разность координат. Общий перенос сокращается, а поворот и отражение преобразуют вектор матрицей R." />
  </section>;
}

const imageSize = 12;
export function NeuralFieldLab() {
  const [model, setModel] = useState(createFieldModel), [source, setSource] = useState<'model' | 'reference'>('model'), [yaw, setYaw] = useState(0), [samples, setSamples] = useState(32), [densityScale, setDensityScale] = useState(1), [pixelX, setPixelX] = useState(5), [pixelY, setPixelY] = useState(5), [sampleIndex, setSampleIndex] = useState(12), [history, setHistory] = useState<{ x: number; y: number }[]>([]);
  const validation = useMemo(() => fieldSamples(320, 888), []), initialLoss = useMemo(() => tinyLoss(createFieldModel(), validation), [validation]);
  const loss = useMemo(() => tinyLoss(model, validation), [model, validation]);
  const field = useMemo(() => source === 'reference' ? referenceField : (point: Vec3) => neuralField(model, point), [source, model]);
  const pixelCoordinates = (column: number, row: number) => [((column + .5) / imageSize * 2 - 1) * 1.15, (1 - (row + .5) / imageSize * 2) * 1.15] as const;
  const image = useMemo(() => Array.from({ length: imageSize * imageSize }, (_, i) => { const [u, v] = pixelCoordinates(i % imageSize, Math.floor(i / imageSize)); return renderFieldRay(field, yaw, u, v, samples, densityScale).color; }), [field, yaw, samples, densityScale]);
  const [u, v] = pixelCoordinates(pixelX, pixelY), ray = useMemo(() => renderFieldRay(field, yaw, u, v, samples, densityScale), [field, yaw, u, v, samples, densityScale]);
  const index = Math.min(sampleIndex, samples - 1), selected = ray.trace[index];
  const sourceLabel = source === 'model' ? `MLP после ${model.steps} обновлений` : 'Аналитический эталон (не MLP)';
  const scenePoints = useMemo<ScenePoint[]>(() => Array.from({ length: 125 }, (_, i) => {
    const point: Vec3 = [-1 + .5 * (i % 5), -1 + .5 * (Math.floor(i / 5) % 5), -1 + .5 * Math.floor(i / 25)], value = field(point);
    return { name: `Образец поля: σ=${fmt(value.density * densityScale)} 1/ед.; RGB=${numbers(value.color, 2)}`, position: point, color: rgb(value.color), visible: value.density * densityScale >= 1 };
  }).filter(point => point.visible), [field, densityScale]);
  const samplePoints: ScenePoint[] = ray.points.filter((_, i) => i % Math.max(1, Math.ceil(samples / 16)) === 0 || i === index).map(point => ({ name: 'Образец выбранного луча', position: point, color: '#2a7293', hollow: true }));
  const farPoint = ray.origin.map((value, d) => value + ray.far * ray.direction[d]) as unknown as Vec3;
  const cameraLine: SceneLine = { name: 'Выбранный физический луч', points: [ray.origin, farPoint], color: '#2a7293' };
  function train(count: number) { const next = trainField(model, count); setModel(next); setSource('model'); setHistory(previous => [...(previous.length ? previous : [{ x: 0, y: initialLoss }]), { x: next.steps, y: tinyLoss(next, validation) }]); }
  return <section className="flow-geometry-lab" aria-label="Лаборатория neural fields и объёмного рендеринга">
    <div className="lesson-intro"><span className="eyebrow">Neural field · плотность и цвет по координате</span><h3>MLP становится непрерывным полем, а луч — пикселем</h3>
      <p>Сеть 9 → 24 → 4 со скрытым tanh получает координату (x,y,z) и sin/cos(πx,πy,πz), возвращает σ=6·sigmoid(zσ) и RGB=sigmoid(zRGB). 340 параметров обучаются по синтетическим плотностям и цветам двух мягких объёмных облаков. Поле в начале случайное: нажми обучение и сравни с эталоном.</p>
      <p>Это учебное coordinate-conditioned поле и настоящий NeRF-подобный объёмный рендеринг. Обучение здесь использует образцы σ/RGB, а не фотографии камер; цвет не зависит от направления взгляда. Полный NeRF добавляет обучение по изображениям, направлению взгляда и другие детали.</p></div>
    <div className="lab-grid"><div className="panel"><h4>1. Обучи координатное поле</h4>
      <div className="button-row"><button onClick={() => train(100)}>Обучить поле +100</button><button onClick={() => train(500)}>Обучить поле +500</button><button onClick={() => { setModel(createFieldModel()); setHistory([]); setSource('model'); }}>Сбросить поле</button></div>
      <p role="status">Adam-обновлений: <strong>{model.steps}</strong>. Проверочная MSE: <strong>{fmt(loss, 6)}</strong>; до обучения {fmt(initialLoss, 6)}.</p>
      <p>Каждый шаг: 40 новых координат из куба [−1,2;1,2]³; Adam, lr=0,008. MSE усредняет σ/6 и три канала RGB. 320 проверочных координат не участвуют в обучении; проверочная ошибка не является качеством реконструкции фотографий.</p>
      <details><summary>Как устроен синтетический эталон</summary><p>Красное облако центрировано в (−0,45;0;0), синее — в (0,45;0,15;−0,15). Пусть gR=exp(−‖x−центрR‖²/0,3), gB=exp(−‖x−центрB‖²/0,22). Тогда σ=6·(1−exp(−1,6gR−1,2gB)). RGB=[0,85gR+0,12gB+0,01; 0,25gR+0,45gB+0,01; 0,15gR+0,85gB+0,01]/(gR+gB+0,025). Сеть учится приближать эти образцы; при рендеринге MLP формула эталона не используется.</p></details>
      <div className="button-row"><button aria-pressed={source === 'model'} onClick={() => setSource('model')}>Показывать MLP</button><button aria-pressed={source === 'reference'} onClick={() => setSource('reference')}>Показывать эталон</button></div>
      <Range label="Положение физической камеры вокруг Z, °" value={yaw} min={-180} max={180} step={5} onChange={setYaw} />
      <Range label="Образцов на луч" value={samples} min={8} max={64} step={8} onChange={setSamples} />
      <Range label="Множитель плотности σ" value={densityScale} min={0} max={2} step={.1} onChange={setDensityScale} />
      <p>При σ=0 поле прозрачно и виден белый фон. Изменение камеры меняет реальные лучи и объёмный пиксель, а не только поворот картинки.</p>
    </div><div className="panel"><h4>2. Получи изображение интегрированием лучей</h4>
      <figure className="fg-volume-image"><figcaption>{sourceLabel} · 12 × 12 пикселей</figcaption><svg viewBox="0 0 240 240" role="img" aria-label={`Объёмное изображение ${sourceLabel}. Выбран пиксель: столбец ${pixelX + 1}, строка ${pixelY + 1}. Выбор доступен ползунками ниже.`}>
        <title>Результат alpha compositing всех 144 лучей</title><desc>Каждый квадрат вычислен по выбранному полю, образцам вдоль луча и белому фону. Выбранный пиксель обведён чёрным и белым.</desc>
        {image.map((color, i) => <rect key={i} x={20 * (i % imageSize)} y={20 * Math.floor(i / imageSize)} width="20" height="20" fill={rgb(color)} />)}
        <rect x={pixelX * 20 + 1} y={pixelY * 20 + 1} width="18" height="18" fill="none" stroke="white" strokeWidth="3" /><rect x={pixelX * 20 + 2} y={pixelY * 20 + 2} width="16" height="16" fill="none" stroke="black" strokeWidth="1.5" />
      </svg></figure>
      <Range label="Пиксель: столбец изображения" value={pixelX + 1} min={1} max={imageSize} step={1} onChange={value => setPixelX(value - 1)} /><Range label="Пиксель: строка изображения" value={pixelY + 1} min={1} max={imageSize} step={1} onChange={value => setPixelY(value - 1)} />
      <p role="status">Выбранный RGB: <strong>{numbers(ray.color, 5)}</strong>. Непрозрачность 1−T: <strong>{fmt(ray.opacity, 5)}</strong>. Остаток белого фона T: {fmt(ray.transmittance, 5)}.</p>
      <p>RGB — линейные числа поля [0,1]. Квадраты выводятся напрямую как учебные RGB; цветокоррекция и физическая экспозиция не моделируются.</p>
    </div></div>
    <div className="panel"><h4>3. Проследи один физический луч в 3D</h4>
      <Scene3D title={`Камера, образцы поля и выбранный луч · ${sourceLabel}`} description="Все оси — физические координаты сцены в условных единицах. Цветные точки: сетка 5³, показаны образцы с σ≥1/ед., а не поверхность объекта. Синий: выбранный луч и его образцы; чёрный — выбранный образец; треугольник — физическая камера. Поворот вида ниже не перемещает физическую камеру." axes={[{ label: 'Физический x, ед.', min: -3.2, max: 3.2 }, { label: 'Физический y, ед.', min: -3.2, max: 3.2 }, { label: 'Физический z, ед.', min: -3.2, max: 3.2 }]} lines={[cameraLine]} points={[{ name: 'Камера', position: ray.origin, shape: 'triangle', color: '#6a52a0' }, { name: `Выбранный образец ${index + 1}`, position: ray.points[index], color: '#111111' }, ...samplePoints, ...scenePoints]} showLegend={false} />
      <p>В кубе рендеринга [−1,2;1,2]³ луч имеет длину {fmt(ray.far - ray.near, 5)} ед.; Δ={fmt((ray.far - ray.near) / samples, 5)} ед. Луч нормирован, поэтому его параметр s — реальное расстояние от камеры. Номер образца — индекс вдоль луча, не отдельная пространственная координата.</p>
      <NumericTable caption="Физическая камера и выбранный луч" columns={['Величина', 'x', 'y', 'z']} rows={[
        ['Камера o, ед.', ...ray.origin.map(value => fmt(value, 6))], ['Направление d, безразм.', ...ray.direction.map(value => fmt(value, 6))], ['Выбранная координата o+sd, ед.', ...ray.points[index].map(value => fmt(value, 6))],
      ]} />
    </div>
    <div className="panel"><h4>4. Посчитай прозрачность и вклад каждого образца</h4>
      <p className="formula">r(s)=o+sd; αᵢ=1−exp(−σᵢΔᵢ); Tᵢ=exp(−Σⱼ&lt;ᵢσⱼΔⱼ); wᵢ=Tᵢαᵢ; C=Σᵢwᵢcᵢ + Tконец · Cфон.</p>
      <p>σ — плотность в 1/ед.; Δ — длина в ед.; σΔ, α, T и w безразмерны. Образцы берутся в серединах равных сегментов и суммируются от камеры к дальнему краю. Больше σ впереди уменьшает вклад дальних образцов.</p>
      <div className="lab-grid"><Chart series={[{ name: 'Плотность σ', points: ray.trace.map((item, i) => ({ x: ray.depths[i], y: item.density })) }]} xLabel="Расстояние от камеры s, ед." yLabel="Плотность σ, 1/ед." /><Chart series={[{ name: 'T до образца', points: ray.trace.map((item, i) => ({ x: ray.depths[i], y: item.transmittance })) }, { name: 'Вклад w=Tα', points: ray.trace.map((item, i) => ({ x: ray.depths[i], y: item.weight })), color: '#b75d24' }]} xLabel="Расстояние от камеры s, ед." yLabel="Прозрачность T и вес w" yDomain={[0, 1]} /></div>
      <Range label="Образец вдоль выбранного луча" value={index + 1} min={1} max={samples} step={1} onChange={value => setSampleIndex(value - 1)} />
      <p role="status">Образец {index + 1}: σ={fmt(selected.density, 5)}; Δ={fmt(selected.delta, 5)}; α={fmt(selected.alpha, 6)}; T={fmt(selected.transmittance, 6)}; w={fmt(selected.weight, 6)}; RGB={numbers(selected.color, 4)}. Вклад в RGB пикселя: {numbers(selected.color.map(value => value * selected.weight), 6)}.</p>
      <p>Сумма весов {fmt(ray.trace.reduce((sum, item) => sum + item.weight, 0), 6)} + вес фона {fmt(ray.transmittance, 6)} = {fmt(ray.trace.reduce((sum, item) => sum + item.weight, ray.transmittance), 8)}.</p>
      <details><summary>Все образцы луча: координаты, плотности и композитинг</summary><NumericTable caption={`Выбранный пиксель (${pixelX + 1}; ${pixelY + 1}), ${sourceLabel}`} columns={['i', 's, ед.', '(x;y;z), ед.', 'σ, 1/ед.', 'Δ, ед.', 'RGB', 'α', 'T до', 'w']} rows={ray.trace.map((item, i) => [i + 1, fmt(ray.depths[i], 6), numbers(ray.points[i], 5), fmt(item.density, 6), fmt(item.delta, 6), numbers(item.color, 5), fmt(item.alpha, 6), fmt(item.transmittance, 6), fmt(item.weight, 6)])} /></details>
      <Chart series={[{ name: 'Проверочная MSE поля', points: history.length ? history : [{ x: 0, y: initialLoss }] }]} xLabel="Фактические обновления Adam" yLabel="MSE четырёх нормированных выходов" />
      <p><a href="https://arxiv.org/abs/2003.08934" target="_blank" rel="noreferrer">NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis · первичная статья</a></p>
    </div>
    <Exercise question="Что произойдёт с белым фоном при множителе плотности σ=0?" options={['Его вес станет 1: пиксель белый', 'Его вес станет 0: пиксель чёрный', 'Цвет поля останется прежним']} correct={0} explanation="Все α=0, поэтому веса образцов равны нулю, а Tконец=1. Это следует из той же формулы, которая считает текущий пиксель." />
  </section>;
}
