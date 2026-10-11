import { useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { decisionGrid } from './decisionBoundaryMath';
import { ConceptLink, LearningActivity } from './learning-context';
import { predictNetwork, XOR_DATA } from './math';
import { Scene3D, type SceneLine, type Vec3 } from './ThreeD';
import { fmt, Range } from './ui';
import './decision-boundary.css';

const classColors = ['#dce9f1', '#b9d9c5'];
const boundaryColor = '#8c411d';
const probeColor = '#694799';
const segments = 40;

export function DecisionBoundaryLesson({ parameters, step, onPause, onTrain }: {
  parameters: number[]; step: number; onPause: () => void; onTrain: (count: number) => void;
}) {
  const id = useId();
  const [threshold, setThreshold] = useState(.5);
  const [probe, setProbe] = useState<[number, number]>([.5, .5]);
  const [probabilityColors, setProbabilityColors] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false), [sceneVisited, setSceneVisited] = useState(false);
  const [projection, setProjection] = useState(true);
  const map = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  useLayoutEffect(() => {
    if (!map.current) return;
    const observer = new ResizeObserver(entries => {
      const measured = entries[0].contentRect.width;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(map.current);
    return () => observer.disconnect();
  }, []);

  const grid = useMemo(() => decisionGrid(parameters, threshold, segments), [parameters, threshold]);
  const probability = predictNetwork(parameters, probe);
  const predictedClass = Number(probability >= threshold);
  const margin = probability - threshold;
  const corners = XOR_DATA.map(data => ({ ...data, probability: predictNetwork(parameters, data.input) }));
  const allOnThreshold = grid.onThreshold === grid.rows.reduce((sum, row) => sum + row.length, 0);
  const contourMessage = allOnThreshold
    ? 'Во всех узлах сетки p = τ. Отдельной разделяющей линии нет: по правилу p ≥ τ все эти узлы относятся к классу 1.'
    : grid.boundary.length
      ? 'Коричневая линия — контур p = τ: здесь сеть переходит через выбранный порог.'
      : `Контур p = τ на этой сетке не найден. ${grid.above === 0 && grid.onThreshold === 0 ? 'Все её узлы относятся к классу 0.' : grid.below === 0 ? 'Все её узлы относятся к классу 1.' : 'Отдельные касания порога могут не образовывать линию.'}`;

  const left = 36, right = width - 16, top = 29, bottom = top + right - left;
  const x = (value: number) => left + value * (right - left);
  const y = (value: number) => bottom - value * (bottom - top);
  const boundaryPath = grid.boundary.map(([a, b]) => `M${x(a[0])},${y(a[1])}L${x(b[0])},${y(b[1])}`).join(' ');
  function chooseProbe(event: MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - bounds.left) * width / bounds.width;
    const py = (event.clientY - bounds.top) * (bottom + 52) / bounds.height;
    if (px < left || px > right || py < top || py > bottom) return;
    setProbe([Number(((px - left) / (right - left)).toFixed(2)), Number(((bottom - py) / (bottom - top)).toFixed(2))]);
  }

  const lines = useMemo<SceneLine[]>(() => [
    ...grid.boundary.map(points => ({ name: 'Сечение p = τ', points, color: boundaryColor })),
    ...(projection ? grid.boundary.map(([a, b]) => ({ name: 'Проекция границы на плоскость входов',
      points: [[a[0], a[1], 0], [b[0], b[1], 0]] as Vec3[], color: boundaryColor, dashed: true })) : []),
    { name: 'Высота ответа в выбранной точке', points: [[probe[0], probe[1], 0], [probe[0], probe[1], probability]], color: probeColor },
  ], [grid, projection, probe, probability]);

  return <section className="panel decision-boundary" aria-labelledby={`${id}-heading`}>
    <span className="eyebrow">От вероятности к решению</span>
    <h3 id={`${id}-heading`}>Граница решений: где сеть меняет класс</h3>
    <p>Сеть возвращает <ConceptLink concept="probability">вероятность</ConceptLink> класса 1. Мы выбираем порог τ («тау»): если p ≥ τ, ответ — <strong>класс 1</strong>, иначе — <strong>класс 0</strong>. Граница решений проходит там, где p = τ. Изменение порога меняет решение, но не веса сети.</p>
    <div className="decision-boundary-layout">
      <div>
        <figure className="decision-boundary-figure" aria-labelledby={`${id}-map-title`}>
          <figcaption id={`${id}-map-title`}>2D · два входа, два класса</figcaption>
          <div ref={map} className="decision-boundary-map">
            <svg viewBox={`0 0 ${width} ${bottom + 52}`} role="img" aria-labelledby={`${id}-svg-title`} aria-describedby={`${id}-svg-description`} onClick={chooseProbe}>
              <title id={`${id}-svg-title`}>Граница решений XOR при пороге {fmt(threshold, 2)}</title>
              <desc id={`${id}-svg-description`}>Горизонтальная ось — вход x₁, вертикальная — вход x₂, оба от 0 до 1. {probabilityColors ? 'Цвет показывает вероятность класса 1.' : 'Голубые области — класс 0, зелёные — класс 1.'} Коричневая линия: вероятность равна порогу. Цифры в четырёх кружках — цели XOR, не предсказания. Фиолетовый маркер — выбранная точка. Значения доступны в ползунках и таблице рядом.</desc>
              <defs><clipPath id={`${id}-map-clip`}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
              <g clipPath={`url(#${id}-map-clip)`}>
                {grid.rows.flatMap((row, rowIndex) => row.map(([a, b, p], columnIndex) => <rect key={`${rowIndex}-${columnIndex}`}
                  x={x(a - .5 / segments)} y={y(b + .5 / segments)} width={(right - left) / segments + .3} height={(bottom - top) / segments + .3}
                  fill={probabilityColors ? `hsl(153 32% ${96 - p * 62}%)` : classColors[Number(p >= threshold)]} />))}
                {[.25, .5, .75].map(t => <g key={t} className="decision-boundary-grid"><line x1={x(t)} x2={x(t)} y1={top} y2={bottom} /><line x1={left} x2={right} y1={y(t)} y2={y(t)} /></g>)}
                <path className="decision-boundary-contour" d={boundaryPath} />
                <path className="decision-boundary-crosshair" d={`M${left},${y(probe[1])}H${right}M${x(probe[0])},${top}V${bottom}`} />
              </g>
              <rect className="decision-boundary-frame" x={left} y={top} width={right - left} height={bottom - top} />
              {[0, .5, 1].map(t => <g key={t}>
                <text x={x(t)} y={bottom + 25} textAnchor="middle">{fmt(t, 1)}</text>
                <text x={left - 17} y={y(t) + 4} textAnchor="end">{fmt(t, 1)}</text>
              </g>)}
              <text x={left} y={14}>Вход x₂</text><text x={(left + right) / 2} y={bottom + 46} textAnchor="middle">Вход x₁</text>
              {XOR_DATA.map(({ input, target }) => <g key={input.join(',')}>
                <circle cx={x(input[0])} cy={y(input[1])} r="9" fill="var(--paper)" stroke="#233d30" strokeWidth="1.5" />
                <text className="decision-boundary-target" x={x(input[0])} y={y(input[1]) + 4} textAnchor="middle">{target}</text>
                <title>Вход [{input.join('; ')}], целевой класс {target}</title>
              </g>)}
              <circle className="decision-boundary-probe" cx={x(probe[0])} cy={y(probe[1])} r="13"><title>Выбранная точка [{probe.map(v => fmt(v, 2)).join('; ')}], p = {fmt(probability, 6)}</title></circle>
            </svg>
          </div>
          <div className="decision-boundary-legend" aria-label="Легенда карты">
            {probabilityColors ? <span className="decision-boundary-gradient">p = 0 <i /> p = 1</span> : <><span><i style={{ background: classColors[0] }} />Класс 0 · p &lt; τ</span><span><i style={{ background: classColors[1] }} />Класс 1 · p ≥ τ</span></>}
            <span><i className="decision-boundary-line-key" />Граница · p = τ</span>
            <span><i className="decision-boundary-point-key" />Выбранная точка</span>
          </div>
          <p className="note">Цифры в кружках — цели четырёх обучающих примеров. Нажмите на карту или задайте входы ползунками.</p>
        </figure>
        <label className="decision-boundary-check"><input type="checkbox" checked={probabilityColors} onChange={event => setProbabilityColors(event.target.checked)} />Показывать плавный цвет вероятности</label>
        <p className="note decision-boundary-contour-note" role="status">{contourMessage}</p>
      </div>
      <div className="decision-boundary-controls">
        <Range label="Порог решения τ" value={threshold} min={.05} max={.95} step={.01} onChange={setThreshold} />
        <p className="note">Поднимите порог: получить класс 1 станет труднее. При равенстве p = τ выбираем класс 1.</p>
        <div className="decision-boundary-probe-card">
          <h4>Проверьте любую точку</h4>
          <Range label="Вход x₁ выбранной точки" value={probe[0]} min={0} max={1} step={.01} onChange={value => setProbe(current => [value, current[1]])} />
          <Range label="Вход x₂ выбранной точки" value={probe[1]} min={0} max={1} step={.01} onChange={value => setProbe(current => [current[0], value])} />
          <dl className="decision-boundary-readout" aria-label="Ответ сети в выбранной точке">
            <div><dt>p(класс 1)</dt><dd>{fmt(probability, 6)}</dd></div>
            <div><dt>Порог τ</dt><dd>{fmt(threshold, 2)}</dd></div>
            <div><dt>p − τ</dt><dd>{margin > 0 ? '+' : ''}{fmt(margin, 6)}</dd></div>
            <div><dt>Решение</dt><dd>Класс {predictedClass}</dd></div>
          </dl>
          <p className="note">{margin === 0 ? 'Ровно на пороге: класс 1 по правилу равенства.' : margin > 0 ? 'Ответ выше порога — выбран класс 1.' : 'Ответ ниже порога — выбран класс 0.'} Числа округлены, сравнение использует полный результат сети.</p>
        </div>
        <div className="button-row"><button disabled={step >= 4000} onClick={() => { onPause(); onTrain(100); }}>Обучить ещё 100 шагов</button><button disabled={step >= 4000} onClick={() => { onPause(); onTrain(1); }}>Один шаг обучения</button></div>
        <p className="note">Шаг обучения: <strong>{step}</strong>. Обучение меняет общие веса этой сети и её границу. Порог и выбранная точка сохраняются.{step >= 4000 && ' Достигнут предел 4000 шагов; для нового опыта используйте «Сброс» выше.'}</p>
      </div>
    </div>

    <div className="decision-boundary-table-wrap"><table className="data-table">
      <caption>Четыре обучающих примера · точный ответ сети при текущих весах · порог τ = {fmt(threshold, 2)}</caption>
      <thead><tr><th scope="col">Вход x₁; x₂</th><th scope="col">Цель XOR</th><th scope="col">p(класс 1)</th><th scope="col">Класс при τ</th></tr></thead>
      <tbody>{corners.map(({ input, target, probability: p }) => <tr key={input.join(',')}><th scope="row">{input.join('; ')}</th><td>{target}</td><td>{fmt(p, 6)}</td><td>{Number(p >= threshold)} <span className="decision-boundary-match">{Number(p >= threshold) === target ? '· верно' : '· ошибка'}</span></td></tr>)}</tbody>
    </table></div>
    <p className="note">Рисунок — приближение на сетке {segments} × {segments} ячеек: цвет берётся в её узлах, линия соединяет найденные точки p = τ. Форма линии внутри ячейки приближённая, особенно у пересечений. Малые петли и отдельные касания между узлами могут быть пропущены. Диапазон p в узлах: {fmt(grid.min, 4)}…{fmt(grid.max, 4)}. Выбранная точка и таблица вычисляются самой сетью, без интерполяции.</p>

    <details className="decision-boundary-3d" onToggle={event => {
      const open = event.currentTarget.open;
      setSceneOpen(open);
      if (open) { setSceneVisited(true); onPause(); }
    }}><summary>3D: граница как сечение поверхности</summary>
      <p>Два входа лежат на «полу»: x₁ и x₂. Высота поверхности — выход сети p, вероятность класса 1. Горизонтальная плоскость на высоте τ пересекает поверхность по линии p = τ. Если опустить эту линию на пол, получится та же граница, что на карте 2D.</p>
      <p className="note">Третья ось здесь — ответ сети, а не третий вход или координата embedding. Зелёная поверхность показывает p, полупрозрачная охристая плоскость — τ, коричневая линия — их сечение. Фиолетовая вертикаль показывает ответ в выбранной точке.</p>
      <label className="decision-boundary-check"><input type="checkbox" checked={projection} onChange={event => setProjection(event.target.checked)} />Проекция границы на пол · пунктир</label>
      {sceneVisited && <LearningActivity active={sceneOpen}><Scene3D
        title="Граница решений в 3D"
        description="X и Y — два входа в диапазоне 0…1; Z — вероятность класса 1. Сечение поверхности плоскостью Z = τ использует те же отрезки, что линия на карте 2D. Точки в углах стоят на высоте предсказания, их названия содержат цель XOR."
        axes={[{ label: 'Вход x₁', min: 0, max: 1 }, { label: 'Вход x₂', min: 0, max: 1 }, { label: 'Вероятность p', min: 0, max: 1 }]}
        surfaces={[{ name: 'Вероятность класса 1', rows: grid.rows, color: '#498d76', opacity: .62 },
          { name: `Порог τ = ${fmt(threshold, 2)}`, rows: [[[0, 0, threshold], [1, 0, threshold]], [[0, 1, threshold], [1, 1, threshold]]], color: '#b98b48', opacity: .18 }]}
        lines={lines}
        points={[...corners.map(({ input, target, probability: p }) => ({ name: `[${input.join('; ')}] · цель ${target} · класс ${Number(p >= threshold)}`, position: [input[0], input[1], p] as Vec3, color: '#233d30' })),
          { name: 'Выбранная точка · выход p', position: [probe[0], probe[1], probability], color: probeColor }]}
        showLegend={false}
      /></LearningActivity>}
      <p className="note">{contourMessage} Поверхность и контур приближены по сетке и могут немного расходиться. Перекрытия поверхности и пороговой плоскости отрисовываются приближённо. Плоская карта и численные значения выше доступны без вращения сцены.</p>
    </details>

    <details><summary>Математика границы и пределы этого опыта</summary>
      <p>Выходная <ConceptLink concept="function">функция</ConceptLink> сети: p(x₁, x₂) = σ(z), где σ(z) = 1 / (1 + exp(−z)), а z — выходной логит. Сигмоида возрастает, поэтому p ≥ τ равносильно z ≥ ln(τ / (1 − τ)).</p>
      <div className="formula">Граница: p(x₁, x₂) = τ<br />То же условие: z(x₁, x₂) = ln(τ / (1 − τ))<br />Сейчас τ = {fmt(threshold, 2)}, логит на границе = {fmt(Math.log(threshold / (1 - threshold)), 5)}<br />При τ = 0,5 граница проходит по z = 0.</div>
      <p>Здесь ln — <ConceptLink concept="logarithm">натуральный логарифм</ConceptLink>. Он позволяет найти значение логита z по выбранной вероятности τ.</p>
      <p>Порог — правило принятия решения после расчёта p. Обучение использует <ConceptLink concept="loss">потерю</ConceptLink> и <ConceptLink concept="gradient">градиент</ConceptLink>, чтобы менять веса и саму функцию p. Один прямой разрез входной плоскости не разделяет XOR; скрытый слой позволяет получить нелинейную границу.</p>
      <p>Мы рассматриваем только квадрат входов [0, 1] × [0, 1]. Все четыре угла участвуют в обучении; промежуточные точки лишь показывают поведение функции. Этот опыт не измеряет качество обобщения и не описывает всё пространство входов.</p>
    </details>
  </section>;
}
