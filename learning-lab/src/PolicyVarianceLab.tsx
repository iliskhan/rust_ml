import { useMemo, useState } from 'react';
import { Range, fmt } from './ui';
import { PredictionExperiment } from './PredictionExperiment';
import { gradientHistogram, policyGradientMoments, policyGradientSamples } from './policyVarianceMath';
import './policy-variance.css';

export default function PolicyVarianceLab({ theta, rewards }: { theta: number; rewards: [number, number] }) {
  const [count, setCount] = useState(16), [baseline, setBaseline] = useState(0), [seed, setSeed] = useState(71);
  const [left, right] = rewards;
  const data = useMemo(() => {
    const raw = policyGradientSamples(theta, [left, right], 0, count, seed);
    const adjusted = policyGradientSamples(theta, [left, right], baseline, count, seed);
    const values = [...raw.means, ...adjusted.means, raw.gradient];
    const min = Math.min(...values), max = Math.max(...values), pad = Math.max((max - min) * .08, .01);
    const domain: [number, number] = [min - pad, max + pad];
    const histograms = [raw, adjusted].map(sample => gradientHistogram(sample.means, domain));
    return { raw, adjusted, domain, histograms, peak: Math.max(1, ...histograms.flatMap(rows => rows.map(row => row.count))) };
  }, [theta, left, right, baseline, count, seed]);
  return <section className="policy-variance-lab panel" aria-label="Разброс выборочного градиента политики">
    <h3>Один точный градиент, много выборочных оценок</h3>
    <p>Используем текущие θ и награды из опыта выше. В каждом из 80 независимых наборов выбираем N действий
      этой политики и усредняем (r−b)·∂logπ/∂θ. Один эпизод здесь состоит из одного действия; политика при выборке фиксирована.</p>
    <div className="gr-columns">
      <div><Range label="Эпизодов в одной оценке N" value={count} min={1} max={128} step={1} onChange={setCount} />
        <Range label="Baseline b, общий для обоих действий" value={baseline} min={-1} max={2} step={.05} onChange={setBaseline} />
        <Range label="Seed выборки" value={seed} min={1} max={99} step={1} onChange={setSeed} />
      </div>
      <div><p>θ={fmt(theta, 5)}; P(→)={fmt(data.raw.p, 5)}; награды [{fmt(left)}; {fmt(right)}].</p>
        <p>Точный градиент: <strong>{fmt(data.raw.gradient, 6)}</strong>.</p>
        <p>Оба столбчатых распределения используют одни и те же выбранные действия.
          Меняется только baseline. Новый seed меняет выборку, не точный градиент.</p>
        <p className="formula">ĝ = (1/N)Σ(rₖ−b)(aₖ−p), aₖ∈&#123;0,1&#125;<br />E[ĝ]=p(1−p)(r_right−r_left)<br />Var(ĝ)=Var(g₁)/N</p>
      </div>
    </div>
    <figure>
      <figcaption>Распределение 80 оценок. По горизонтали — средняя оценка градиента, по вертикали — число наборов (0…{data.peak}).</figcaption>
      <div className="pv-legend"><span>Сплошной: b=0</span><span>Штрихованный: b={fmt(baseline)}</span><span>Пунктир: точный градиент</span></div>
      <div className="pv-bars" role="img" aria-label={`Гистограмма 80 оценок по ${count} эпизодам: точный градиент ${fmt(data.raw.gradient, 6)}. Численные данные доступны ниже.`}>
        {data.histograms[0].map((row, i) => <div className="pv-bin" key={i}>
          <span className="pv-raw" style={{ height: `${100 * row.count / data.peak}%` }} title={`b=0: ${row.count} наборов`} />
          <span className="pv-adjusted" style={{ height: `${100 * data.histograms[1][i].count / data.peak}%` }} title={`b=${baseline}: ${data.histograms[1][i].count} наборов`} />
        </div>)}
        <span className="pv-exact" style={{ left: `${100 * (data.raw.gradient - data.domain[0]) / (data.domain[1] - data.domain[0])}%` }} />
      </div>
      <div className="pv-domain"><span>{fmt(data.domain[0], 5)}</span><span>{fmt(data.domain[1], 5)}</span></div>
    </figure>
    <div className="gr-scroll" role="region" aria-label="Моменты оценок градиента" tabIndex={0}><table className="gr-table">
      <caption>Теория и наблюдение при N={count}</caption><thead><tr><th scope="col">Величина</th><th scope="col">b=0</th><th scope="col">b={fmt(baseline)}</th></tr></thead>
      <tbody>{[
        ['Точное среднее', data.raw.mean, data.adjusted.mean],
        ['Среднее по 80 наборам', data.raw.empiricalMean, data.adjusted.empiricalMean],
        ['Точная дисперсия оценки', data.raw.meanVariance, data.adjusted.meanVariance],
        ['Разброс 80 оценок (делитель 80)', data.raw.empiricalVariance, data.adjusted.empiricalVariance],
      ].map(([label, a, b]) => <tr key={String(label)}><th scope="row">{label}</th><td>{fmt(Number(a), 7)}</td><td>{fmt(Number(b), 7)}</td></tr>)}</tbody>
    </table></div>
    <p className="note">Baseline не зависит от выбранного действия, поэтому сохраняет среднее. Неудачный baseline может увеличить дисперсию.
      Конкретные 80 оценок не обязаны иметь точно теоретическое среднее или монотонно уменьшать разброс при каждом изменении N.</p>
    <details><summary>Числа гистограммы и особый случай нулевого разброса</summary>
      <div className="gr-scroll" role="region" aria-label="Интервалы гистограммы" tabIndex={0}><table className="gr-table"><caption>Левая граница включена; правая включена только в последнем интервале</caption>
        <thead><tr><th scope="col">Интервал</th><th scope="col">b=0</th><th scope="col">b={fmt(baseline)}</th></tr></thead>
        <tbody>{data.histograms[0].map((row, i) => <tr key={i}><th scope="row">{fmt(row.min, 6)}…{fmt(row.max, 6)}</th><td>{row.count}</td><td>{data.histograms[1][i].count}</td></tr>)}</tbody>
      </table></div>
      <p>Только в этой задаче с двумя действиями и известными постоянными наградами
        b*=p·r_left+(1−p)·r_right={fmt(data.raw.optimalBaseline, 6)} делает обе однократные оценки одинаковыми.
        Это не обещание нулевого шума в общей RL-задаче.</p>
    </details>
    <PredictionExperiment question="Для текущих θ, наград и baseline сравним оценки по 1 и 64 эпизодам. Как изменится теоретическая дисперсия? Опыт установит N=64."
      options={['Уменьшится в 64 раза', 'Останется нулевой', 'Увеличится в 64 раза']}
      run={prediction => {
        const before = policyGradientMoments(theta, [left, right], baseline, 1);
        const after = policyGradientSamples(theta, [left, right], baseline, 64, seed);
        setCount(64);
        const zero = before.variance < 1e-28;
        return { correct: prediction === (zero ? 1 : 0),
          before: `θ=${fmt(theta, 5)}, награды [${fmt(left)}; ${fmt(right)}], b=${fmt(baseline)}. N=1: Var=${fmt(before.meanVariance, 8)}.`,
          after: `N=64: Var=${fmt(after.meanVariance, 8)}; средняя из 80 оценок=${fmt(after.empiricalMean, 6)}; точный градиент=${fmt(after.gradient, 6)}.`,
          explanation: zero ? 'Оба действия уже дают одну оценку: усреднению нечего уменьшать.' : 'При независимой выборке дисперсия среднего делится на N. Случайный набор может отклоняться от этого ожидаемого разброса.' };
      }} />
  </section>;
}
