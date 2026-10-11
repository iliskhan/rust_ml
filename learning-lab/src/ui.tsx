import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './range-control.css';
import './chart-data.css';

export function fmt(value: number, digits = 3) {
  if (!Number.isFinite(value)) return value === Infinity ? '∞' : value === -Infinity ? '−∞' : 'не определено';
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 10000)) return value.toExponential(2);
  const rounded = Number(value.toFixed(digits));
  return (Object.is(rounded, -0) ? 0 : rounded).toLocaleString('ru-RU', { maximumFractionDigits: digits });
}

export function Range({ label, value, min, max, step = 0.1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(null);
    setInvalid(false);
  }, [value, min, max, step]);
  function commit(input: HTMLInputElement) {
    if (draft === null) return;
    const next = input.valueAsNumber;
    if (!input.validity.valid || !Number.isFinite(next)) { setInvalid(true); return; }
    setDraft(null);
    setInvalid(false);
    if (next !== value) onChange(next);
  }
  return <div className="range-control">
    <span className="range-control-heading"><label htmlFor={id}>{label}</label><output htmlFor={id}>{fmt(value, 4)}</output></span>
    <div className="range-control-inputs">
      <input id={id} type="range" value={value} min={min} max={max} step={step} onChange={e => {
        setDraft(null);
        setInvalid(false);
        onChange(Number(e.target.value));
      }} />
      <input type="number" aria-label={`${label} (точное значение)`} value={draft ?? String(value)}
        min={min} max={max} step={step} required aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        title="Точное значение: Enter — применить, Esc — отменить"
        onChange={e => { setDraft(e.target.value); setInvalid(false); }}
        onBlur={e => commit(e.currentTarget)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget); }
          if (e.key === 'Escape' && (draft !== null || invalid)) { e.preventDefault(); e.stopPropagation(); setDraft(null); setInvalid(false); }
        }} />
    </div>
    {invalid && <p id={`${id}-error`} className="range-control-error" role="alert">Введите число от {fmt(min, 4)} до {fmt(max, 4)} с шагом {fmt(step, 4)}. Esc — отменить.</p>}
  </div>;
}

export type Series = { name: string; points: { x: number; y: number }[]; color?: string; dashed?: boolean };
const colors = ['#27694e', '#b75d24', '#6a52a0', '#2a7293'];
const chartValue = (value: number) => Number.isNaN(value) ? 'Не определено (NaN)' : value === Infinity ? 'Плюс бесконечность' : value === -Infinity ? 'Минус бесконечность' : String(value);
export function Chart({ series, xLabel, yLabel, xDomain, yDomain, children }: {
  series: Series[]; xLabel: string; yLabel: string; xDomain?: [number, number]; yDomain?: [number, number]; children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const xMeasure = useRef<SVGGElement>(null), yMeasure = useRef<SVGGElement>(null);
  const [width, setWidth] = useState(480);
  const [textSize, setTextSize] = useState({ x: 40, y: 40, height: 14 });
  const [dataOpen, setDataOpen] = useState(false);
  const id = useId().replace(/:/g, '');
  const points = series.flatMap(s => s.points).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const domain = (values: number[]): [number, number] => {
    if (!values.length) return [0, 1];
    const low = Math.min(...values), high = Math.max(...values);
    const padding = (high - low || Math.abs(high) || 1) * .08;
    return [low - padding, high + padding];
  };
  const [xmin, xmax] = xDomain ?? domain(points.map(p => p.x));
  const [ymin, ymax] = yDomain ?? domain(points.map(p => p.y));
  useLayoutEffect(() => {
    const container = ref.current, xText = xMeasure.current, yText = yMeasure.current;
    if (!container || !xText || !yText) return;
    function measure() {
      const actualWidth = container!.getBoundingClientRect().width;
      if (actualWidth <= 0) return;
      const xBox = xText!.getBBox(), yBox = yText!.getBBox();
      setWidth(actualWidth);
      const next = { x: xBox.width, y: yBox.width, height: Math.max(xBox.height, yBox.height) };
      setTextSize(previous => previous.x === next.x && previous.y === next.y && previous.height === next.height ? previous : next);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(xText);
    observer.observe(yText);
    return () => observer.disconnect();
  }, [xmin, xmax, ymin, ymax]);
  const left = textSize.y + 12, right = Math.max(left + 1, width - 8), top = textSize.height / 2 + 4, bottom = top + 208;
  const plotWidth = right - left;
  const x = (v: number) => left + (v - xmin) / (xmax - xmin || 1) * (right - left);
  const y = (v: number) => bottom - (v - ymin) / (ymax - ymin || 1) * (bottom - top);
  const ticks = [0, .25, .5, .75, 1];
  const xTicks = plotWidth >= 4 * (textSize.x * 1.5 + 8) ? ticks : plotWidth >= 2 * (textSize.x * 1.5 + 8) ? [0, .5, 1] : plotWidth >= textSize.x * 2 + 8 ? [0, 1] : [.5];
  return <div className="chart" ref={ref}>
    <div className="chart-axis-label">{yLabel}</div>
    <svg viewBox={`0 0 ${width} ${bottom + textSize.height + 16}`} role="img" aria-label={`${yLabel} в зависимости от ${xLabel}`}>
      <title>{yLabel} в зависимости от {xLabel}</title>
      <desc>{series.map(s => `${s.name}: ${s.points.length} точек`).join('; ')}. Все исходные точки доступны в разделе «Данные графика» под изображением.</desc>
      <g visibility="hidden" aria-hidden="true"><g ref={xMeasure}>{ticks.map(t => <text key={t}>{fmt(xmin + t * (xmax - xmin), 2)}</text>)}</g><g ref={yMeasure}>{ticks.map(t => <text key={t}>{fmt(ymax - t * (ymax - ymin), 2)}</text>)}</g></g>
      <defs><clipPath id={id}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
      {ticks.map(t => <g key={t}>
        <line x1={left} x2={right} y1={top + t * (bottom - top)} y2={top + t * (bottom - top)} className="grid-line" />
        <text x={left - 8} y={top + t * (bottom - top)} dominantBaseline="middle" textAnchor="end">{fmt(ymax - t * (ymax - ymin), 2)}</text>
      </g>)}
      {xTicks.map(t => <text key={t} x={left + t * plotWidth} y={bottom + 8} dominantBaseline="hanging" textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}>{fmt(xmin + t * (xmax - xmin), 2)}</text>)}
      <line x1={left} x2={right} y1={bottom} y2={bottom} className="axis-line" />
      <line x1={left} x2={left} y1={top} y2={bottom} className="axis-line" />
      <g clipPath={`url(#${id})`}>{children}{series.map((s, i) => {
        const finite = s.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        return <g key={s.name} fill="none" stroke={s.color ?? colors[i % colors.length]}>
          <path d={finite.map((p, j) => `${j ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join(' ')} strokeWidth="2.5" strokeDasharray={s.dashed ? '6 4' : undefined} />
          {finite.length <= 6 && finite.map((p, j) => <circle key={j} cx={x(p.x)} cy={y(p.y)} r="4" fill={s.color ?? colors[i % colors.length]} />)}
        </g>;
      })}</g>
    </svg>
    <div className="chart-axis-label chart-axis-label-x">{xLabel}</div>
    {series.length > 1 && <div className="chart-legend">{series.map((s, i) => <span key={s.name}><i style={{ background: s.color ?? colors[i % colors.length] }} />{s.name}{s.dashed && ' · пунктир'}</span>)}</div>}
    <details className="chart-data" onToggle={event => setDataOpen(event.currentTarget.open)}>
      <summary>Данные графика · {series.reduce((count, item) => count + item.points.length, 0)} точек</summary>
      {dataOpen && <>
        <p>Все исходные точки без дополнительного округления. Нечисловые и бесконечные координаты указаны в таблице, но не рисуются на графике.</p>
        <div className="chart-data-scroll" tabIndex={0} role="region" aria-label={`Данные графика: ${yLabel} в зависимости от ${xLabel}. Прокручиваемая таблица`}>
          <table>
            <caption>{yLabel} в зависимости от {xLabel}</caption>
            <thead><tr><th scope="col">Серия и точка</th><th scope="col">{xLabel}</th><th scope="col">{yLabel}</th></tr></thead>
            <tbody>{series.flatMap((item, seriesIndex) => item.points.length ? item.points.map((point, pointIndex) => <tr key={`${seriesIndex}-${pointIndex}`}>
              <th scope="row">{item.name} · {pointIndex + 1}</th><td>{chartValue(point.x)}</td><td>{chartValue(point.y)}</td>
            </tr>) : [<tr key={`${seriesIndex}-empty`}><th scope="row">{item.name}</th><td colSpan={2}>Нет точек</td></tr>])}</tbody>
          </table>
        </div>
      </>}
    </details>
  </div>;
}

export function Exercise({ question, options, correct, explanation }: { question: string; options: string[]; correct: number; explanation: string }) {
  const [answer, setAnswer] = useState<number | null>(null);
  return <section className="exercise" aria-label="Небольшое упражнение">
    <span className="eyebrow">Предскажи → измени → проверь</span>
    <h3>{question}</h3>
    <div className="button-row">{options.map((option, i) => <button key={option} aria-pressed={answer === i} onClick={() => setAnswer(i)}>{option}</button>)}</div>
    {answer !== null && <p role="status" className={answer === correct ? 'feedback-correct' : 'feedback-retry'}>{answer === correct ? 'Верно. ' : 'Попробуйте ещё. '}{explanation}</p>}
  </section>;
}
