import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { boundaryConfusion, boundarySliceGrid, boundaryWeightChoices, captureBoundarySlice, evaluateBoundarySlice, type BoundarySliceMode, type BoundarySliceSnapshot, type Outcome } from './boundaryDiagnosticsMath';
import type { BoundaryConfig, BoundaryDataset } from './boundaryNetworkMath';
import { PredictionExperiment } from './PredictionExperiment';
import { Scene3D, type Vec3 } from './ThreeD';
import { Range, fmt } from './ui';
import './boundary-diagnostics.css';

const outcomeLabels: Record<Outcome, string> = { TP: '● TP · верно найден класс 1', FP: '◆ FP · ложная тревога', TN: '■ TN · верно найден класс 0', FN: '▲ FN · пропущен класс 1' };
const outcomeColors: Record<Outcome, string> = { TP: '#26724b', FP: '#a9431e', TN: '#27669a', FN: '#714c91' };
const percent = (value: number | null) => value === null ? 'не определено (знаменатель 0)' : `${fmt(value * 100, 1)}%`;
const countText = (result: ReturnType<typeof boundaryConfusion>) => `TP ${result.counts.TP}, FP ${result.counts.FP}, TN ${result.counts.TN}, FN ${result.counts.FN}; precision ${percent(result.precision)}, recall ${percent(result.recall)}; BCE ${fmt(result.loss, 6)}`;

type Props = { params: number[]; config: BoundaryConfig; dataset: BoundaryDataset; threshold: number; step: number;
  batchSize: number; batchSeed: number; lambda: number; source: string;
  onThresholdExperiment: (value: number) => void; onProbeChange: (input: [number, number]) => void };

export function BoundaryDiagnostics(props: Props) {
  const { params, config, dataset, threshold, step, onThresholdExperiment, onProbeChange } = props;
  const [split, setSplit] = useState<'validation' | 'train'>('validation');
  const [selected, setSelected] = useState<Outcome | null>(null);
  const [pointIndex, setPointIndex] = useState(0);
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
  }, []);
  const plotWidth = Math.max(1, mapWidth - 60), plotHeight = plotWidth * 14 / 15;
  const mapBottom = 20 + plotHeight;
  const [capture, setCapture] = useState<{ model: BoundarySliceSnapshot; source: string; revision: number } | null>(null);
  const result = useMemo(() => boundaryConfusion(params, config, dataset[split], threshold), [params, config, dataset, split, threshold]);
  const point = result.points[Math.min(pointIndex, result.points.length - 1)];
  const nextThreshold = threshold < .75 ? .85 : .25;
  function choosePoint(index: number) { setPointIndex(index); onProbeChange([...result.points[index].input]); }
  return <div className="boundary-diagnostics">
    <details>
      <summary>Порог → ошибки → precision / recall</summary>
      <p>Карта и матрица используют текущие веса и общий порог τ = {fmt(threshold, 2)}. Нажмите на ячейку матрицы, чтобы выделить её точки; выберите точку, чтобы проверить её также на основной карте.</p>
      <label>Выборка матрицы<select value={split} onChange={event => { setSplit(event.target.value as typeof split); setPointIndex(0); }}><option value="validation">Validation · 32 точки</option><option value="train">Train · 96 точек</option></select></label>
      <Range label="Общий порог τ для карты и матрицы" value={threshold} min={.05} max={.95} step={.01} onChange={onThresholdExperiment} />
      <p className="note">Изменение порога здесь ставит обучение на паузу, чтобы сравнивать решения при одних весах.</p>
      <div className="boundary-diagnostic-grid">
        <svg ref={map} className="boundary-confusion-map" viewBox={`0 0 ${mapWidth} ${mapBottom + 50}`} role="group" aria-label={`Карта ошибок ${split}, порог ${fmt(threshold, 2)}`}>
          <rect x="35" y="20" width={plotWidth} height={plotHeight} fill="#f7faf8" stroke="#718079" />
          {[0, .5, 1].map(value => <g key={value}><text x={35 + plotWidth * value} y={mapBottom + 21} textAnchor="middle">{fmt(value, 1)}</text><text x="29" y={mapBottom + 5 - plotHeight * value} textAnchor="end">{fmt(value, 1)}</text></g>)}
          <text x="35" y="14">Вход x₂</text><text x={35 + plotWidth / 2} y={mapBottom + 44} textAnchor="middle">Вход x₁</text>
          {result.points.map((sample, i) => {
            const x = 35 + sample.input[0] * plotWidth, y = mapBottom - sample.input[1] * plotHeight;
            const name = `Точка ${i + 1}: ${sample.outcome}, цель ${sample.target}, p ${fmt(sample.probability, 6)}, решение ${sample.predicted}`;
            return <g key={i} role="button" tabIndex={0} aria-label={name} aria-pressed={i === pointIndex} onClick={() => choosePoint(i)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choosePoint(i); } }}
              fill={outcomeColors[sample.outcome]} opacity={selected && selected !== sample.outcome ? .18 : 1} stroke={i === pointIndex ? '#172c24' : '#fff'} strokeWidth={i === pointIndex ? 2.5 : 1}>
              <title>{name}</title><circle cx={x} cy={y} r="10" fill="transparent" stroke="none" />
              {sample.outcome === 'TP' ? <circle cx={x} cy={y} r="5" /> : sample.outcome === 'TN' ? <rect x={x - 5} y={y - 5} width="10" height="10" /> : <path d={sample.outcome === 'FP' ? `M${x},${y - 7}l7,7l-7,7l-7,-7Z` : `M${x},${y - 7}l7,12h-14Z`} />}
            </g>;
          })}
        </svg>
        <div>
          <div className="boundary-diagnostic-table" tabIndex={0} role="region" aria-label="Матрица ошибок"><table><caption>Строка — истинный класс; столбец — решение</caption><thead><tr><th scope="col">Цель</th><th scope="col">Решение 1</th><th scope="col">Решение 0</th></tr></thead><tbody>{([[1, 'TP', 'FN'], [0, 'FP', 'TN']] as const).map(([target, a, b]) => <tr key={target}><th scope="row">{target}</th>{[a, b].map(outcome => <td key={outcome}><button aria-pressed={selected === outcome} onClick={() => setSelected(selected === outcome ? null : outcome)} aria-label={`${outcomeLabels[outcome]}, ${result.counts[outcome]} точек`}>{outcome} · {result.counts[outcome]}</button></td>)}</tr>)}</tbody></table></div>
          <p>Всего {result.total}: {result.correct} верно. BCE = <strong>{fmt(result.loss, 6)}</strong>.</p>
          <p>Precision = TP / (TP + FP) = <strong>{percent(result.precision)}</strong><br />Recall = TP / (TP + FN) = <strong>{percent(result.recall)}</strong></p>
          <p className="note">Precision: какая доля тревог верна. Recall: какая доля реального класса 1 найдена. При нулевом знаменателе значение не определено.</p>
        </div>
      </div>
      <div className="boundary-outcome-legend">{(Object.keys(outcomeLabels) as Outcome[]).map(outcome => <span key={outcome}>{outcomeLabels[outcome]} · {result.counts[outcome]}</span>)}</div>
      {selected && <p role="status">Выделены {selected}: {result.counts[selected]} точек. <button onClick={() => setSelected(null)}>Показать все точки</button></p>}
      <Range label="Номер точки в матрице" value={Math.min(pointIndex + 1, result.points.length)} min={1} max={result.points.length} step={1} onChange={value => choosePoint(value - 1)} />
      <p className="boundary-point-readout" role="status">Точка {Math.min(pointIndex + 1, result.points.length)}: x₁ = {fmt(point.input[0], 5)}, x₂ = {fmt(point.input[1], 5)}; цель {point.target}; p = {fmt(point.probability, 6)}; p {point.probability >= threshold ? '≥' : '<'} τ → класс {point.predicted}; <strong>{point.outcome}</strong>.</p>
      <PredictionExperiment question={`Сменим общий порог с ${fmt(threshold, 2)} на ${fmt(nextThreshold, 2)} и поставим обучение на паузу. Что произойдёт с BCE?`} options={['BCE не изменится; решения и precision / recall могут измениться', 'BCE обязательно уменьшится', 'Изменятся веса сети']} run={prediction => {
        const before = boundaryConfusion(params, config, dataset[split], threshold), after = boundaryConfusion(params, config, dataset[split], nextThreshold);
        onThresholdExperiment(nextThreshold);
        return { correct: prediction === 0, before: `${props.source}, шаг ${step}, ${split}, τ=${fmt(threshold, 2)}: ${countText(before)}`, after: `Те же веса и точки, τ=${fmt(nextThreshold, 2)}: ${countText(after)}`, explanation: 'Порог применяется к готовой вероятности. BCE вычисляется из логита и истинной цели, поэтому порог в её формулу не входит. Более высокий порог не увеличивает число положительных решений, но precision не обязана расти.' };
      }} />
    </details>
    <details>
      <summary>Mini-batch и L2: поверхность потери по двум весам</summary>
      <p>Зафиксируйте текущую сеть, затем сравните пакеты и λ на одном срезе. Две горизонтальные оси — реальные веса W; высота — выбранная потеря. Остальные веса и все bias остаются в снимке.</p>
      <button onClick={() => setCapture(current => ({ model: captureBoundarySlice(params, config, dataset, step, props.batchSeed), source: props.source, revision: (current?.revision ?? 0) + 1 }))}>{capture ? 'Обновить снимок текущей сети' : 'Зафиксировать сеть и построить поверхность'}</button>
      {capture && <BoundaryLossSlice key={capture.revision} snapshot={capture.model} source={capture.source} initialBatchSize={props.batchSize} initialLambda={props.lambda} />}
      <p className="note">Снимок создаётся только кнопкой; последующее обучение основной сети его не меняет. Это временная диагностика: она не входит в JSON и слоты A/B.</p>
    </details>
  </div>;
}

const modeNames: Record<BoundarySliceMode, string> = { batch: 'BCE выбранного batch', train: 'BCE всех train', regularized: 'BCE train + L2' };
const modes = Object.keys(modeNames) as BoundarySliceMode[];

const BoundaryLossSlice = memo(function BoundaryLossSlice({ snapshot, source, initialBatchSize, initialLambda }: { snapshot: BoundarySliceSnapshot; source: string; initialBatchSize: number; initialLambda: number }) {
  const choices = useMemo(() => boundaryWeightChoices(snapshot.config), [snapshot]);
  const [pair, setPair] = useState<[number, number]>(() => [choices.at(-2)!.index, choices.at(-1)!.index]);
  const [batchSize, setBatchSize] = useState(initialBatchSize), [batchStep, setBatchStep] = useState(snapshot.step);
  const [lambda, setLambda] = useState(initialLambda), [mode, setMode] = useState<BoundarySliceMode>('batch');
  const [delta, setDelta] = useState<[number, number]>([0, 0]);
  const radius = 1;
  const grid = useMemo(() => boundarySliceGrid(snapshot, pair, radius, batchSize, batchStep, lambda), [snapshot, pair, batchSize, batchStep, lambda]);
  const values: [number, number] = [snapshot.params[pair[0]] + delta[0], snapshot.params[pair[1]] + delta[1]];
  const result = useMemo(() => evaluateBoundarySlice(snapshot, pair, values, batchSize, batchStep, lambda), [snapshot, pair, values[0], values[1], batchSize, batchStep, lambda]);
  const labels = pair.map(index => choices.find(choice => choice.index === index)!.label);
  const rows = grid.map(row => row.map(cell => [cell.values[0], cell.values[1], cell[mode].loss] as Vec3));
  const ceiling = Math.max(.1, ...grid.flatMap(row => row.flatMap(cell => modes.map(kind => cell[kind].loss))), ...modes.map(kind => result[kind].loss)) * 1.05;
  const conditions = `${source}, снимок шага ${snapshot.step}; ${labels[0]}=${fmt(values[0], 5)}, ${labels[1]}=${fmt(values[1], 5)}, batch=${batchSize}, шаг выбора ${batchStep}, seed=${snapshot.batchSeed}`;
  const describe = (value: ReturnType<typeof evaluateBoundarySlice>, strength: number) => `λ=${fmt(strength, 2)}; BCE batch=${fmt(value.batch.loss, 6)}, BCE train=${fmt(value.train.loss, 6)}, objective train=${fmt(value.regularized.loss, 6)}; ∂objective/∂(${labels.join(', ')})=(${value.regularized.gradient.map(g => fmt(g, 6)).join('; ')})`;
  return <section aria-label="Срез потери mini-batch и L2">
    <p className="note">Снимок: {source}, шаг {snapshot.step}; сеть {[2, ...snapshot.config.layers.map(layer => layer.width), 1].join(' → ')}. Сетка 9 × 9, диапазон каждого веса ±1 от снимка. Выборка train: {snapshot.train.length}; validation не участвует. История полной оптимизации сюда не проецируется.</p>
    <div className="boundary-diagnostic-grid">{pair.map((index, axis) => <label key={axis}>Вес по оси {axis === 0 ? 'X' : 'Y'}<select value={index} onChange={event => { const next = [...pair] as [number, number]; next[axis] = Number(event.target.value); setPair(next); setDelta([0, 0]); }}>{choices.map(choice => <option key={choice.index} value={choice.index} disabled={choice.index === pair[1 - axis]}>{choice.label}</option>)}</select></label>)}</div>
    <p className="note">Wℓ[нейрон, вход] — вес слоя ℓ; нумерация с 1. Оси не являются признаками данных или шагами обучения.</p>
    <Range label="Размер пакета среза" value={batchSize} min={1} max={snapshot.train.length} step={1} onChange={value => { setBatchSize(value); setBatchStep(snapshot.step); }} />
    <div className="button-row"><button onClick={() => setBatchStep(value => value + 1)}>Следующий пакет без обучения</button><button onClick={() => { setBatchStep(snapshot.step); setDelta([0, 0]); }}>Вернуться к точке снимка и пакету</button></div>
    <p className="note">Шаг выбора {batchStep}, seed порядка {snapshot.batchSeed}; фактический batch: {result.indices.length} точек. Последний пакет эпохи может быть короче. При полном batch набор не меняется.</p>
    <details><summary>Индексы фиксированного пакета (с 1)</summary><p>{result.indices.map(index => index + 1).join(', ')}</p></details>
    <Range label="L2 λ среза" value={lambda} min={0} max={1} step={.01} onChange={setLambda} />
    <label>Высота поверхности<select value={mode} onChange={event => setMode(event.target.value as BoundarySliceMode)}>{modes.map(kind => <option key={kind} value={kind}>{modeNames[kind]}</option>)}</select></label>
    <Scene3D title="Поверхность потери по двум весам" description={`${labels.join(' и ')} — два веса зафиксированной сети. Высота: ${modeNames[mode]}. Точка — численная проба. Таблицы ниже дают потери и два компонента градиента без вращения.`}
      axes={[{ label: labels[0], min: snapshot.params[pair[0]] - radius, max: snapshot.params[pair[0]] + radius }, { label: labels[1], min: snapshot.params[pair[1]] - radius, max: snapshot.params[pair[1]] + radius }, { label: modeNames[mode], min: 0, max: ceiling }]}
      surfaces={[{ name: modeNames[mode], rows, color: '#387b69', opacity: .72 }]} points={[{ name: 'Выбранные веса', position: [values[0], values[1], result[mode].loss], color: '#9d421d' }]} />
    <p className="note">Высота общая для трёх вариантов при текущих batch и λ; при их изменении шкала пересчитывается. Поверхность интерполирована по сетке, числа ниже вычислены точно в выбранной точке. Градиент всей сети имеет больше компонент; здесь показаны только две производные данного среза.</p>
    {pair.map((_, axis) => <Range key={axis} label={`Сдвиг ${labels[axis]} от снимка (вес ${fmt(values[axis], 4)})`} value={delta[axis]} min={-radius} max={radius} step={.05} onChange={value => setDelta(current => axis === 0 ? [value, current[1]] : [current[0], value])} />)}
    <div className="boundary-diagnostic-table" role="region" aria-label="Потери и наклоны среза" tabIndex={0}><table><caption>Одна точка весов, три способа вычислить потерю</caption><thead><tr><th>Потеря</th><th>Значение</th><th>∂ / ∂{labels[0]}</th><th>∂ / ∂{labels[1]}</th></tr></thead><tbody>{modes.map(kind => <tr key={kind}><th scope="row">{modeNames[kind]}</th><td>{fmt(result[kind].loss, 6)}</td>{result[kind].gradient.map((g, i) => <td key={i}>{fmt(g, 6)}</td>)}</tr>)}</tbody></table></div>
    <p>L2 = λ/2 · ΣW² = {fmt(result.penalty, 6)}; добавка к наклонам: λ{labels[0]} = {fmt(lambda * values[0], 6)} и λ{labels[1]} = {fmt(lambda * values[1], 6)}. Все веса участвуют в штрафе, все bias исключены.</p>
    <details><summary>Численная альтернатива поверхности: 9 точек среза</summary><div className="boundary-diagnostic-table" role="region" aria-label="Численные точки поверхности" tabIndex={0}><table><caption>{modeNames[mode]} при фиксированных остальных параметрах</caption><thead><tr><th>{labels[0]}</th><th>{labels[1]}</th><th>Потеря</th></tr></thead><tbody>{[0, 4, 8].flatMap(y => [0, 4, 8].map(x => <tr key={`${x}-${y}`}><td>{fmt(grid[y][x].values[0], 5)}</td><td>{fmt(grid[y][x].values[1], 5)}</td><td>{fmt(grid[y][x][mode].loss, 6)}</td></tr>))}</tbody></table></div></details>
    <PredictionExperiment question={`Зафиксируем оба веса и пакет, затем ${lambda === 0 ? 'включим L2 с λ = 0,2' : 'выключим L2 (λ = 0)'}. Изменится ли BCE train?`} options={['BCE прежняя; штраф и наклоны могут измениться', 'L2 изменит исходные ответы и BCE без шага обучения', 'Штраф добавится только к bias']} run={prediction => {
      const nextLambda = lambda === 0 ? .2 : 0;
      const after = evaluateBoundarySlice(snapshot, pair, values, batchSize, batchStep, nextLambda);
      setLambda(nextLambda); setMode('regularized');
      return { correct: prediction === 0, before: `${conditions}; ${describe(result, lambda)}`, after: `${conditions}; ${describe(after, nextLambda)}`, explanation: 'Изменена только λ. L2 добавляет λ/2 · ΣW² к потере и λW к каждому градиенту веса, но не к bias. Ответы сети и BCE сохраняются до обновления весов. Числа относятся к зафиксированному срезу.' };
    }} />
    <PredictionExperiment question="Выберем следующий пакет при тех же весах. Обязан ли его градиент совпасть с градиентом всех train?" options={['Нет: подмножество может дать другой наклон', 'Да: любые пакеты дают одинаковый градиент']} run={prediction => {
      const after = evaluateBoundarySlice(snapshot, pair, values, batchSize, batchStep + 1, lambda);
      setBatchStep(value => value + 1); setMode('batch');
      const slopes = (item: typeof result) => `BCE batch=${fmt(item.batch.loss, 6)}, g batch=(${item.batch.gradient.map(g => fmt(g, 6)).join('; ')}); g train=(${item.train.gradient.map(g => fmt(g, 6)).join('; ')})`;
      return { correct: prediction === 0, before: `${conditions}; ${slopes(result)}`, after: `Те же веса, λ=${fmt(lambda, 2)}, размер batch=${batchSize}, seed=${snapshot.batchSeed}, шаг выбора ${batchStep + 1}; ${slopes(after)}`, explanation: 'Меняется только состав пакета, без шага оптимизатора. Градиент полного train остаётся прежним. У полного batch и совпадающих средних наклон может совпасть; различие не гарантировано для каждой пары пакетов.' };
    }} />
  </section>;
});
