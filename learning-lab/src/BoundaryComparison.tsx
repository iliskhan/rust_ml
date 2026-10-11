import { useId, useMemo } from 'react';
import { boundaryMetrics, makeBoundaryDataset, predictBoundary } from './boundaryNetworkMath';
import { boundaryComparisonDifferences, type BoundarySlots, type SavedBoundaryRun } from './boundaryExperiment';
import { probabilityGrid } from './decisionBoundaryMath';
import { Chart, fmt } from './ui';

const kindNames = { moons: 'Полумесяцы', circles: 'Круги', spiral: 'Спираль' };
const runNames = ['A', 'B'] as const;
const colors = { A: '#27669a', B: '#923f69' };

function ComparisonMap({ name, run }: { name: string; run: SavedBoundaryRun }) {
  const id = useId(), segments = 24;
  const grid = useMemo(() => probabilityGrid((x, y) => predictBoundary(run.optimizer.params, run.settings.config, [x, y]), run.threshold, segments), [run]);
  const x = (value: number) => 30 + value * 210, y = (value: number) => 228 - value * 210;
  return <figure className="boundary-comparison-map"><figcaption>{name} · шаг {run.optimizer.step} · τ = {fmt(run.threshold, 2)}</figcaption>
    <svg viewBox="0 0 260 275" role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
      <title id={`${id}-title`}>Граница сохранённого опыта {name}</title>
      <desc id={`${id}-description`}>Одинаковые оси x₁ и x₂ от 0 до 1. Синий фон — решение 0, зелёный — 1. Коричневая линия — p равно порогу. Карта рассчитана по весам опыта {name}, сетка 24 на 24.</desc>
      <defs><clipPath id={`${id}-clip`}><rect x="30" y="18" width="210" height="210" /></clipPath></defs>
      <g clipPath={`url(#${id}-clip)`}>{grid.rows.flatMap((row, i) => row.map(([a, b, p], j) => <rect key={`${i}-${j}`} x={x(a - .5 / segments)} y={y(b + .5 / segments)} width={210 / segments + .3} height={210 / segments + .3} fill={p >= run.threshold ? '#c6dfd0' : '#e0ecf4'} />))}
        <path className="boundary-contour" d={grid.boundary.map(([a, b]) => `M${x(a[0])},${y(a[1])}L${x(b[0])},${y(b[1])}`).join(' ')} />
      </g>
      <rect className="boundary-map-frame" x="30" y="18" width="210" height="210" />
      {[0, .5, 1].map(value => <g key={value}><text x={x(value)} y="245" textAnchor="middle">{fmt(value, 1)}</text><text x="24" y={y(value) + 4} textAnchor="end">{fmt(value, 1)}</text></g>)}
      <text x="30" y="12">Вход x₂</text><text x="135" y="266" textAnchor="middle">Вход x₁</text>
    </svg>
  </figure>;
}

export function BoundaryComparison({ slots }: { slots: BoundarySlots }) {
  const saved = useMemo(() => runNames.flatMap(name => {
    const run = slots[name];
    if (!run) return [];
    const data = makeBoundaryDataset(run.settings.kind, run.settings.seed);
    return [{ name, run, train: boundaryMetrics(run.optimizer.params, run.settings.config, data.train, run.threshold),
      validation: boundaryMetrics(run.optimizer.params, run.settings.config, data.validation, run.threshold) }];
  }), [slots]);
  if (!saved.length) return <p className="note">Сохраните текущий опыт в A, измените настройку и обучите второй опыт, затем сохраните его в B. Слоты останутся неизменными при дальнейшем обучении и сбросе.</p>;
  const differences = slots.A && slots.B ? boundaryComparisonDifferences(slots.A, slots.B) : [];
  const rows: Array<[string, (entry: typeof saved[number]) => string]> = [
    ['Данные · seed', ({ run }) => `${kindNames[run.settings.kind]} · ${run.settings.seed}`],
    ['Сеть', ({ run }) => [2, ...run.settings.config.layers.map(layer => layer.width), 1].join(' → ')],
    ['Активации скрытых слоёв', ({ run }) => run.settings.config.layers.map(layer => layer.activation).join(' / ') || 'Нет скрытых слоёв'],
    ['Оптимизатор · η', ({ run }) => `${run.settings.method} · ${fmt(run.settings.lr, 3)}`],
    ['Шаги обучения', ({ run }) => String(run.optimizer.step)], ['Порог τ', ({ run }) => fmt(run.threshold, 2)],
    ['BCE · train', ({ train }) => fmt(train.loss, 6)], ['BCE · validation', ({ validation }) => fmt(validation.loss, 6)],
    ['Верно · train', ({ train }) => `${train.correct} / ${train.total} · ${fmt(train.accuracy * 100, 1)}%`],
    ['Верно · validation', ({ validation }) => `${validation.correct} / ${validation.total} · ${fmt(validation.accuracy * 100, 1)}%`],
  ];
  return <div className="boundary-comparison">
    {slots.A && slots.B && <p className="note boundary-comparison-warning">{differences.length ? `Условия различаются: ${differences.join('; ')}. Такое сравнение не выделяет влияние одной настройки.` : 'Набор, seed, число шагов и порог совпадают. Остальные настройки сверяйте в таблице.'}</p>}
    <p className="note">Одинаковый seed воспроизводит старт выбранной архитектуры. Разные архитектуры не имеют одинаковых начальных весов. Бюджет здесь — число полных шагов по 96 точкам, а не одинаковое время вычислений.</p>
    <div className="boundary-comparison-table" tabIndex={0} role="region" aria-label="Сравнение A/B, прокручиваемая таблица"><table><caption>Сохранённые опыты · метрики пересчитаны по их весам</caption><thead><tr><th scope="col">Условие / результат</th>{saved.map(({ name }) => <th scope="col" key={name}>Опыт {name}</th>)}</tr></thead><tbody>{rows.map(([label, display]) => <tr key={label}><th scope="row">{label}</th>{saved.map(entry => <td key={entry.name}>{display(entry)}</td>)}</tr>)}</tbody></table></div>
    <div className="boundary-comparison-maps">{saved.map(({ name, run }) => <ComparisonMap key={name} name={name} run={run} />)}</div>
    <p className="note">Оси обеих карт одинаковы: [0, 1] × [0, 1]. Фон: синий — решение 0, зелёный — 1; коричневая линия — p = τ. Используется порог каждого опыта; карты приближённые.</p>
    <Chart series={saved.flatMap(({ name, run }) => [{ name: `${name} · train`, points: run.history.map(point => ({ x: point.step, y: point.train })), color: colors[name] },
      { name: `${name} · validation`, points: run.history.map(point => ({ x: point.step, y: point.validation })), color: colors[name], dashed: true }])}
      xLabel="Шаг обучения" yLabel="Средняя потеря BCE" xDomain={[0, Math.max(1, ...saved.map(({ run }) => run.optimizer.step))]}
      yDomain={[0, Math.max(.1, ...saved.flatMap(({ run }) => run.history.flatMap(point => [point.train, point.validation]))) * 1.1]} />
    <p className="note">Кривые используют сохранённые точки истории. Validation не участвует в градиенте; выбор лучшей настройки по ней не заменяет независимую итоговую проверку.</p>
  </div>;
}
