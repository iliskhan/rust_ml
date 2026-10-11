import { useId } from 'react';
import { fmt } from './ui';
import { attentionContributions, attentionGeometryDomain, type AttentionTrace } from './attentionGeometryMath';
import './attention-geometry.css';

const coordinates = (point: number[]) => `[${point.map(value => fmt(value, 3)).join('; ')}]`;

export function AttentionGeometry({ trace, query, selectedKey, onSelectKey, labels, mode, temperature }: {
  trace: AttentionTrace; query: number; selectedKey: number; onSelectKey: (key: number) => void;
  labels: string[]; mode: 'qk' | 'mixture'; temperature: number;
}) {
  const id = useId();
  const qk = mode === 'qk';
  const points = qk ? trace.k : trace.v;
  const result = qk ? trace.q[query] : trace.output[query];
  const allowed = trace.scores[query].map(Number.isFinite);
  const contributions = attentionContributions(trace.v, trace.weights[query]);
  const domain = attentionGeometryDomain([...points, result]);
  const position = (value: number) => 50 + (value - domain.min) / (domain.max - domain.min) * 255;
  const x = (point: number[]) => position(point[0]);
  const y = (point: number[]) => 340 - position(point[1]);
  const origin = position(0);
  const ticks = [domain.min, (domain.min + domain.max) / 2, domain.max];
  const availablePoints = points.filter((_, j) => allowed[j]);
  const title = qk ? 'Q и K: направления и скалярное произведение' : 'Смесь V: точка выхода среди сообщений';
  return <details className="attention-geometry">
    <summary>Геометрия 2D: {qk ? 'запрос и ключи' : 'взвешенная смесь V'}</summary>
    <p>{qk ? 'Стрелки идут из нуля к реальным координатам Q и K текущего опыта. Скалярное произведение зависит и от угла, и от длин: q·k = ‖q‖ ‖k‖ cos θ.' : 'Кружки — реальные значения V текущего опыта. Стрелка Y ведёт из нуля к их взвешенной сумме. Контур соединяет разрешённые V; выход лежит внутри него, на отрезке или в единственной точке.'}</p>
    <svg className="attention-geometry-plot" viewBox="0 0 340 355" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{title}</title>
      <desc id={`${id}-description`}>Запрос {query}: {labels[query]}. {qk ? 'Q' : 'Выход Y'} = {coordinates(result)}. Оси — координаты 0 и 1 {qk ? 'Q/K' : 'V/Y'}, с одинаковым масштабом. Все точки, маски и расчёты приведены в таблице ниже. Пунктир и крест обозначают запрещённую связь.</desc>
      <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
      {ticks.map((tick, index) => <g key={index} className="attention-geometry-grid"><line x1={position(tick)} y1="35" x2={position(tick)} y2="290" /><line x1="50" y1={340 - position(tick)} x2="305" y2={340 - position(tick)} /><text x={position(tick)} y="313" textAnchor="middle">{fmt(tick, 1)}</text><text x="46" y={340 - position(tick) + 4} textAnchor="end">{fmt(tick, 1)}</text></g>)}
      <g className="attention-geometry-axis"><line x1="50" y1={340 - origin} x2="305" y2={340 - origin} /><line x1={origin} y1="35" x2={origin} y2="290" /><circle cx={origin} cy={340 - origin} r="2" /><text x={origin + 5} y={340 - origin + 14}>0</text></g>
      <text x="170" y="350" textAnchor="middle">{qk ? 'Q/K' : 'V/Y'}: координата 0 →</text><text x="35" y="17">↑ {qk ? 'Q/K' : 'V/Y'}: координата 1</text>
      {!qk && availablePoints.length > 1 && <polygon points={availablePoints.map(point => `${x(point)},${y(point)}`).join(' ')} className="attention-geometry-hull" />}
      {points.map((point, j) => <g key={j} className={`attention-geometry-key${j === selectedKey ? ' is-selected' : ''}${allowed[j] ? '' : ' is-masked'}`}>
        {qk && <line x1={origin} y1={340 - origin} x2={x(point)} y2={y(point)} markerEnd={`url(#${id}-arrow)`} />}
        <circle cx={x(point)} cy={y(point)} r={j === selectedKey ? 7 : 4} />
        {!allowed[j] && <path d={`M ${x(point) - 5} ${y(point) - 5} l 10 10 m 0 -10 l -10 10`} />}
        <text x={x(point) + 10} y={y(point) + 5 + j * 14}>{qk ? 'k' : 'v'}{j}{allowed[j] ? '' : ' ×'}</text>
      </g>)}
      <g className="attention-geometry-result"><line x1={origin} y1={340 - origin} x2={x(result)} y2={y(result)} markerEnd={`url(#${id}-arrow)`} /><rect x={x(result) - 4} y={y(result) - 4} width="8" height="8" /><text x={x(result) - 10} y={y(result) - 10} textAnchor="end">{qk ? `q${query}` : 'Y'}</text></g>
    </svg>
    <p className="note">Оси — две координаты обучаемых признаков, без физических единиц; номер токена не является осью. Масштаб автоматически охватывает текущие точки. Квадрат — {qk ? 'Q' : 'выход Y'}, кружки — {qk ? 'K' : 'V'}. Пунктир/× — исключённый ключ.</p>
    <div className="button-row attention-geometry-keys" aria-label="Ключ в геометрии">{labels.map((label, j) => <button key={j} aria-pressed={selectedKey === j} onClick={() => onSelectKey(j)}>{j}: {label}{allowed[j] ? '' : ' · исключён'}</button>)}</div>
    <p className="tc-observation">{qk ? <>q{query} = {coordinates(result)}; k{selectedKey} = {coordinates(points[selectedKey])}.<br />q·k = {fmt(trace.rawScores[query][selectedKey], 3)}; score = {fmt(trace.scaledScores[query][selectedKey], 3)}.</> : <>Y = {coordinates(result)}.<br />Выбранный вклад: {fmt(trace.weights[query][selectedKey], 4)} × {coordinates(points[selectedKey])} = {coordinates(contributions[selectedKey])}.</>}<br />{allowed[selectedKey] ? `Связь разрешена; доля ${fmt(trace.weights[query][selectedKey] * 100, 2)}% при T=${fmt(temperature)}.` : 'Связь запрещена маской: score → −∞, доля и вклад равны нулю.'}</p>
    <div className="tc-table-scroll" tabIndex={0} role="region" aria-label="Численная альтернатива геометрии attention, прокручиваемая таблица"><table className="tc-matrix"><caption>Точные величины опыта (показаны с округлением)</caption><thead><tr><th scope="col">Ключ</th><th scope="col">{qk ? 'K [0; 1]' : 'V [0; 1]'}</th><th scope="col">Маска</th><th scope="col">{qk ? 'q·k / score' : 'Доля / вклад [0; 1]'}</th></tr></thead><tbody>{points.map((point, j) => <tr key={j} className={selectedKey === j ? 'tc-selected-row' : undefined}><th scope="row">{j}: {labels[j]}</th><td>{coordinates(point)}</td><td>{allowed[j] ? 'разрешён' : 'исключён'}</td><td>{qk ? `${fmt(trace.rawScores[query][j], 3)} / ${fmt(trace.scaledScores[query][j], 3)}` : `${fmt(trace.weights[query][j], 4)} / ${coordinates(contributions[j])}`}</td></tr>)}</tbody></table></div>
  </details>;
}
