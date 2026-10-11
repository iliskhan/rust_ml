import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './range-control.css';

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
        onBlur={e => {
          if (draft === null) return;
          const next = e.currentTarget.valueAsNumber;
          if (!e.currentTarget.validity.valid || !Number.isFinite(next)) { setInvalid(true); return; }
          setDraft(null);
          setInvalid(false);
          if (next !== value) onChange(next);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape' && (draft !== null || invalid)) { e.preventDefault(); setDraft(null); setInvalid(false); }
        }} />
    </div>
    {invalid && <p id={`${id}-error`} className="range-control-error" role="alert">Введите число от {fmt(min, 4)} до {fmt(max, 4)} с шагом {fmt(step, 4)}. Esc — отменить.</p>}
  </div>;
}

export type Series = { name: string; points: { x: number; y: number }[]; color?: string; dashed?: boolean };
const colors = ['#27694e', '#b75d24', '#6a52a0', '#2a7293'];
export function Chart({ series, xLabel, yLabel, xDomain, yDomain, children }: {
  series: Series[]; xLabel: string; yLabel: string; xDomain?: [number, number]; yDomain?: [number, number]; children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const id = useId().replace(/:/g, '');
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(220, entries[0].contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const points = series.flatMap(s => s.points).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const domain = (values: number[]): [number, number] => {
    if (!values.length) return [0, 1];
    const low = Math.min(...values), high = Math.max(...values);
    const padding = (high - low || Math.abs(high) || 1) * .08;
    return [low - padding, high + padding];
  };
  const [xmin, xmax] = xDomain ?? domain(points.map(p => p.x));
  const [ymin, ymax] = yDomain ?? domain(points.map(p => p.y));
  const left = 58, right = width - 16, top = 18, bottom = 226;
  const x = (v: number) => left + (v - xmin) / (xmax - xmin || 1) * (right - left);
  const y = (v: number) => bottom - (v - ymin) / (ymax - ymin || 1) * (bottom - top);
  const ticks = width < 350 ? [0, .5, 1] : [0, .25, .5, .75, 1];
  return <div className="chart" ref={ref}>
    <svg viewBox={`0 0 ${width} 276`} role="img" aria-label={`${yLabel} в зависимости от ${xLabel}`}>
      <title>{yLabel} в зависимости от {xLabel}</title>
      <desc>{series.map(s => `${s.name}: ${s.points.length} точек`).join('; ')}. Текущие значения также приведены рядом с графиком.</desc>
      <defs><clipPath id={id}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
      {ticks.map(t => <g key={t}>
        <line x1={left} x2={right} y1={top + t * (bottom - top)} y2={top + t * (bottom - top)} className="grid-line" />
        <text x={left - 8} y={top + t * (bottom - top) + 4} textAnchor="end">{fmt(ymax - t * (ymax - ymin), 2)}</text>
        <text x={left + t * (right - left)} y={bottom + 21} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}>{fmt(xmin + t * (xmax - xmin), 2)}</text>
      </g>)}
      <line x1={left} x2={right} y1={bottom} y2={bottom} className="axis-line" />
      <line x1={left} x2={left} y1={top} y2={bottom} className="axis-line" />
      <g clipPath={`url(#${id})`}>{children}{series.map((s, i) => {
        const finite = s.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        return <g key={s.name} fill="none" stroke={s.color ?? colors[i % colors.length]}>
          <path d={finite.map((p, j) => `${j ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join(' ')} strokeWidth="2.5" strokeDasharray={s.dashed ? '6 4' : undefined} />
          {finite.length <= 6 && finite.map((p, j) => <circle key={j} cx={x(p.x)} cy={y(p.y)} r="4" fill={s.color ?? colors[i % colors.length]} />)}
        </g>;
      })}</g>
      <text x={(left + right) / 2} y="269" textAnchor="middle">{xLabel}</text>
      <text transform={`translate(14 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
    </svg>
    {series.length > 1 && <div className="chart-legend">{series.map((s, i) => <span key={s.name}><i style={{ background: s.color ?? colors[i % colors.length] }} />{s.name}{s.dashed && ' · пунктир'}</span>)}</div>}
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
