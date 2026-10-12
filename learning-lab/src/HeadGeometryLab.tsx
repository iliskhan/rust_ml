import { useLayoutEffect, useRef, useState } from 'react';
import { Scene3D, type Vec3 } from './ThreeD';
import { Range, fmt } from './ui';
import { useLearningActive } from './learning-context';
import { TOY_VOCAB, type Matrix } from './transformerMath';
import { headSgdStep, type HeadParameters } from './transformerHeadMath';
import { headGeometryProbe } from './transformerVisualMath';
import { PredictionExperiment } from './PredictionExperiment';
import './transformer-visual-experiments.css';

const colors = ['#27694e', '#9f4a19', '#6a52a0', '#2a7293', '#9c4373', '#677526'];
const vector = (values: number[]) => `[${values.map(value => fmt(value, 5)).join('; ')}]`;

export function HeadGeometryLab({ parameters, hidden, targets, mask, rate, steps, onTrainOne }: {
  parameters: HeadParameters; hidden: Matrix; targets: number[]; mask: boolean[]; rate: number; steps: number; onTrainOne: () => void;
}) {
  const active = useLearningActive();
  const [open, setOpen] = useState(false), [visited, setVisited] = useState(false);
  const [first, setFirst] = useState(1), [second, setSecond] = useState(2), [probe, setProbe] = useState(() => [...hidden[1]]);
  const map = useRef<SVGSVGElement>(null);
  const [mapWidth, setMapWidth] = useState(360);
  useLayoutEffect(() => {
    if (!map.current) return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (width > 0) setMapWidth(width);
    });
    observer.observe(map.current);
    return () => observer.disconnect();
  }, [open, active, visited]);
  const plotSize = Math.max(1, mapWidth - 55), mapBottom = 28 + plotSize;
  const range = Math.ceil(Math.max(1, ...hidden.flat().map(Math.abs)) + .5);
  const result = headGeometryProbe(probe, parameters), ids = [first, second];
  const coordinate = (value: number) => 35 + (value + range) / (2 * range) * plotSize;
  const y = (value: number) => mapBottom - (value + range) / (2 * range) * plotSize;
  const plane = (token: number, h0: number, h1: number): Vec3 => [h0, h1, h0 * parameters.weights[0][token] + h1 * parameters.weights[1][token] + parameters.bias[token]];
  const corners = ids.flatMap(token => [-range, range].flatMap(h0 => [-range, range].map(h1 => plane(token, h0, h1)[2])));
  const zRange = Math.max(1, Math.ceil(Math.max(...corners.map(Math.abs))));
  return <details className="tv-lab" onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) setVisited(true); }}>
    <summary>Геометрия обучаемой головы: плоскости logits и карта победителей</summary>
    {visited && <>
      <p>Используются текущие W и b этой головы после {steps} шагов SGD. Оси h₀ и h₁ — два настоящих скрытых признака, без PCA. Четыре точки h фиксированы; их высота z и карта предсказаний пересчитываются при обучении.</p>
      <div className="tv-controls">{ids.map((token, i) => <label key={i}>Плоскость {i + 1}: токен<select value={token} onChange={event => {
        const next = Number(event.target.value);
        if (i === 0) { setFirst(next); if (next === second) setSecond(first); }
        else { setSecond(next); if (next === first) setFirst(second); }
      }}>{TOY_VOCAB.map((name, id) => <option key={name} value={id}>{id}: {name}</option>)}</select></label>)}
        <Range label="Проверочная точка h₀" value={probe[0]} min={-range} max={range} step={.05} onChange={value => setProbe([value, probe[1]])} />
        <Range label="Проверочная точка h₁" value={probe[1]} min={-range} max={range} step={.05} onChange={value => setProbe([probe[0], value])} />
      </div>
      <div className="button-row">{hidden.map((row, t) => <button key={t} onClick={() => setProbe([...row])}>Проверить h позиции t={t}</button>)}<button disabled={steps >= 500} onClick={onTrainOne}>1 текущий шаг SGD · обновить плоскости</button></div>
      <p className="formula">Для токена j: zⱼ=h₀·W[0,j]+h₁·W[1,j]+b[j].</p>
      {ids.map(token => <p className="formula" key={token}>«{TOY_VOCAB[token]}»: z = h₀·{fmt(parameters.weights[0][token], 5)} + h₁·{fmt(parameters.weights[1][token], 5)} + {fmt(parameters.bias[token], 5)}. В проверочной точке z={fmt(result.logits[token], 6)}.</p>)}
      {open && active && <div className="tv-scenes">
        <Scene3D title="Две текущие affine-плоскости logits" description="X=h₀, Y=h₁, Z=logit выбранного токена. Две плоскости используют одни W,b с таблицей и SGD; точки t имеют фиксированные X,Y и высоты каждой из двух плоскостей."
          axes={[{ label: 'Скрытый признак h₀', min: -range, max: range }, { label: 'Скрытый признак h₁', min: -range, max: range }, { label: 'Logit z', min: -zRange, max: zRange }]}
          surfaces={ids.map(token => ({ name: `z: ${TOY_VOCAB[token]}`, color: colors[token], opacity: .38, rows: Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 }, (_, j) => plane(token, -range + 2 * range * i / 4, -range + 2 * range * j / 4))) }))}
          points={ids.flatMap(token => [...hidden.map((row, t) => ({ name: `t=${t}, ${TOY_VOCAB[token]}`, position: plane(token, row[0], row[1]), color: colors[token] })), { name: `Проверка: ${TOY_VOCAB[token]}`, position: plane(token, probe[0], probe[1]), color: colors[token], shape: 'triangle' as const }])}
          lines={ids.map(token => ({ name: `Высота проверки: ${TOY_VOCAB[token]}`, points: [[probe[0], probe[1], 0] as Vec3, plane(token, probe[0], probe[1])], color: colors[token], dashed: true }))} />
        <section><h4>2D: победитель среди всех шести токенов</h4>
          <svg ref={map} className="tv-map" viewBox={`0 0 ${mapWidth} ${mapBottom + 49}`} role="img" aria-label={`Карта argmax всех шести logits. Обе оси h имеют диапазон от ${-range} до ${range}. Проверочная точка ${vector(probe)}, победитель ${TOY_VOCAB[result.winner]}. Таблица всех logits и вероятностей ниже.`}>
            {Array.from({ length: 20 }, (_, i) => Array.from({ length: 20 }, (_, j) => {
              const h0 = -range + (i + .5) * 2 * range / 20, h1 = -range + (j + .5) * 2 * range / 20;
              const winner = headGeometryProbe([h0, h1], parameters).winner;
              return <rect key={`${i}-${j}`} x={35 + i * plotSize / 20} y={28 + (19 - j) * plotSize / 20} width={plotSize / 20} height={plotSize / 20} shapeRendering="crispEdges" fill={colors[winner]} opacity={.28}><title>h₀={fmt(h0)}, h₁={fmt(h1)}: {TOY_VOCAB[winner]}</title></rect>;
            }))}
            <rect x={35} y={28} width={plotSize} height={plotSize} fill="none" stroke="currentColor" />
            {[-range, 0, range].map(value => <g key={value}><text x={coordinate(value)} y={mapBottom + 19} textAnchor="middle">{fmt(value)}</text><text x={29} y={y(value) + 4} textAnchor="end">{fmt(value)}</text></g>)}
            {hidden.map((row, t) => <g key={t}><circle cx={coordinate(row[0])} cy={y(row[1])} r={5} fill="var(--paper, white)" stroke="currentColor" /><text className="tv-map-point-label" x={coordinate(row[0]) + 7} y={y(row[1]) - 7}>t{t}</text></g>)}
            <path d={`M${coordinate(probe[0]) - 7},${y(probe[1])}h14m-7,-7v14`} stroke="currentColor" strokeWidth={3} />
            <text x={35 + plotSize / 2} y={mapBottom + 43} textAnchor="middle">Скрытый признак h₀ →</text><text x={35} y={17}>↑ Скрытый признак h₁</text>
          </svg>
          <p className="tv-legend">{TOY_VOCAB.map((token, id) => <span key={token} style={{ color: colors[id] }}>■ {id}: {token}</span>)}</p>
          <p>Цвет клетки — argmax в её центре; сетка 20×20 приближает границу. Кружки — фиксированные h, крест — проверочная точка. Числа ниже дают точный расчёт этой точки. При равных максимумах выбирается меньший ID.</p>
        </section>
      </div>}
      <p>Равенство z[{first}]=z[{second}] задаёт линию пересечения выбранных плоскостей. Это граница их попарного сравнения. Она является частью границы многоклассового argmax лишь там, где остальные четыре logits не выше.</p>
      <div className="tv-scroll" role="region" aria-label="Проверка всех шести токенов в одной точке" tabIndex={0}><table><caption>Тот же probe h={vector(probe)}; T=1, без top-k/top-p</caption><thead><tr><th scope="col">Токен</th><th scope="col">Logit</th><th scope="col">Softmax p</th><th scope="col">Победитель</th></tr></thead><tbody>{TOY_VOCAB.map((name, id) => <tr key={name}><th scope="row">{name}</th><td>{fmt(result.logits[id], 6)}</td><td>{fmt(result.probabilities[id], 6)}</td><td>{id === result.winner ? 'Да' : '—'}</td></tr>)}</tbody></table></div>
      <p>Σp={fmt(result.probabilities.reduce((a, b) => a + b), 8)}. Победитель: «{TOY_VOCAB[result.winner]}». Разница выбранных logits: {fmt(result.logits[first] - result.logits[second], 6)}.</p>
      <div className="tv-scroll" role="region" aria-label="Фиксированные координаты h и текущие победители" tabIndex={0}><table><caption>Численная альтернатива 2D-карте: четыре фиксированные точки</caption><thead><tr><th scope="col">t</th><th scope="col">h₀</th><th scope="col">h₁</th><th scope="col">Цель</th><th scope="col">Argmax сейчас</th></tr></thead><tbody>{hidden.map((row, t) => <tr key={t}><th scope="row">{t}</th><td>{fmt(row[0], 6)}</td><td>{fmt(row[1], 6)}</td><td>{TOY_VOCAB[targets[t]]}</td><td>{TOY_VOCAB[headGeometryProbe(row, parameters).winner]}</td></tr>)}</tbody></table></div>
      <PredictionExperiment disabled={steps >= 500} question={`Один текущий шаг SGD (η=${fmt(rate)}, позиции ${mask.flatMap((included, t) => included ? [t] : []).join(', ')}). Что изменяется?`} options={['W,b и рассчитанные logits; скрытые h фиксированы', 'Только скрытые h, плоскости фиксированы', 'Одновременно embeddings, attention и h']} run={prediction => {
        const next = headSgdStep(hidden, targets, parameters, rate, mask), after = headGeometryProbe(probe, next.parameters);
        const change = Math.max(...result.logits.map((value, j) => Math.abs(value - after.logits[j])));
        onTrainOne();
        return { correct: prediction === 0,
          before: `Шаг ${steps}, η=${fmt(rate)}, маска=${mask.map(Number).join('')}; probe=${vector(probe)}. L=${fmt(next.before.loss, 6)}; все logits=${vector(result.logits)}.`,
          after: `Выполнен шаг ${steps + 1}: L=${fmt(next.after.loss, 6)}; все logits=${vector(after.logits)}. Максимальная разница logits=${fmt(change, 8)}; h тот же.`,
          explanation: 'Один SGD обновляет W и b по текущему среднему градиенту. Точки h не обучаются; плоскости, logits и вероятности пересчитываются из новых параметров. Улучшение каждой отдельной позиции этим не гарантировано.' };
      }} />
    </>}
  </details>;
}
