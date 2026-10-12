import { useState } from 'react';
import { Chart, Range, fmt } from './ui';
import { useLearningActive } from './learning-context';
import { PredictionExperiment } from './PredictionExperiment';
import { residualGradientTrace } from './transformerVisualMath';
import './transformer-visual-experiments.css';

export function ResidualGradientLab() {
  const active = useLearningActive();
  const [open, setOpen] = useState(false), [visited, setVisited] = useState(false);
  const [input, setInput] = useState(.4), [weight, setWeight] = useState(.5), [depth, setDepth] = useState(6), [step, setStep] = useState(0);
  const plain = residualGradientTrace(input, weight, depth, false), residual = residualGradientTrace(input, weight, depth, true);
  const current = Math.min(step, depth - 1);
  const setScenario = (h: number, a: number, layers: number) => { setInput(h); setWeight(a); setDepth(layers); setStep(0); };
  return <details className="tv-lab" onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) setVisited(true); }}>
    <summary>Обратный проход: прямой путь residual и ветка F(h)</summary>
    {visited && <>
      <p>Отдельная скалярная цепочка, без attention, FFN и норм: F(h)=a·tanh(h). Обычный слой hₖ₊₁=F(hₖ); residual hₖ₊₁=hₖ+F(hₖ). Сравниваем производную выхода по входу, начиная обратный проход с ∂hₙ/∂hₙ=1.</p>
      <div className="tv-controls"><Range label="Скалярный вход h₀" value={input} min={-2} max={2} step={.1} onChange={value => { setInput(value); setStep(0); }} /><Range label="Вес ветки a" value={weight} min={-1.5} max={1.5} step={.1} onChange={value => { setWeight(value); setStep(0); }} /><Range label="Число слоёв n" value={depth} min={1} max={8} step={1} onChange={value => { setDepth(value); setStep(0); }} /></div>
      <div className="button-row"><button onClick={() => setScenario(.4, .5, 6)}>Пример: затухание обычной цепочки</button><button onClick={() => setScenario(0, -1, 3)}>Контрпример: отмена прямого пути</button></div>
      <p className="formula">F′(h)=a·(1−tanh²(h)); локальная производная residual = 1+F′(h). На развилке обратного прохода: gₖ = gₖ₊₁ + gₖ₊₁·F′(hₖ).</p>
      {open && active && <Chart xLabel="Номер слоя k (этап вычисления)" yLabel="∂hₙ/∂hₖ" xDomain={[0, depth]} series={[{ name: 'Обычная цепочка', points: [{ x: depth, y: 1 }, ...plain.backward.map(item => ({ x: item.index, y: item.outgoing }))].reverse() }, { name: 'Residual', points: [{ x: depth, y: 1 }, ...residual.backward.map(item => ({ x: item.index, y: item.outgoing }))].reverse() }]} />}
      {depth > 1 ? <Range label="Шаг обратного прохода (0 — последний слой)" value={current} min={0} max={depth - 1} step={1} onChange={setStep} /> : <p>Один слой: единственный шаг обратного прохода к входу.</p>}
      <div className="button-row"><button disabled={current === 0} onClick={() => setStep(current - 1)}>← К выходу</button><button disabled={current === depth - 1} onClick={() => setStep(current + 1)}>Назад через следующий слой →</button></div>
      <div className="tv-scenes">{[plain, residual].map((trace, i) => {
        const item = trace.backward[current];
        return <section className="tv-backward" key={i}><h4>{i ? 'Residual' : 'Обычная цепочка'}: слой k={item.index}</h4><p>Прямой проход: hₖ={fmt(item.before, 6)} → F(hₖ)={fmt(item.branch, 6)} → hₖ₊₁={fmt(item.after, 6)}.</p><p>Входящий градиент gₖ₊₁={fmt(item.incoming, 7)}. F′={fmt(item.branchDerivative, 7)}, локальная производная={fmt(item.localDerivative, 7)}.</p>
          <figure className="tv-gradient-fork"><figcaption>Путь градиента через выбранный слой</figcaption>
            <div className="tv-fork-node tv-fork-wide">Входящий gₖ₊₁<br /><strong>{fmt(item.incoming, 7)}</strong></div>
            <span className="tv-fork-arrow" aria-hidden="true">↙</span><span className="tv-fork-arrow" aria-hidden="true">↘</span>
            <div className="tv-fork-node">{i ? 'Прямой путь ×1' : 'Прямой путь отсутствует ×0'}<br /><strong>{fmt(item.identity, 7)}</strong></div>
            <div className="tv-fork-node">Ветка ×F′<br />×{fmt(item.branchDerivative, 7)}<br /><strong>{fmt(item.branchGradient, 7)}</strong></div>
            <span className="tv-fork-arrow" aria-hidden="true">↘</span><span className="tv-fork-arrow" aria-hidden="true">↙</span>
            <div className="tv-fork-node tv-fork-wide">Сумма двух вкладов → gₖ<br />{fmt(item.identity, 7)} + ({fmt(item.branchGradient, 7)})<br /><strong>= {fmt(item.outgoing, 7)}</strong></div>
          </figure>
          <p className="formula">Прямой вклад {fmt(item.identity, 7)} + вклад ветки {fmt(item.branchGradient, 7)} = gₖ {fmt(item.outgoing, 7)}</p></section>;
      })}</div>
      <div className="tv-scroll" role="region" aria-label="Все значения обратного прохода" tabIndex={0}><table><caption>Одинаковый вход и a; состояния h внутри цепочек различаются</caption><thead><tr><th scope="col">k</th><th scope="col">h обычный</th><th scope="col">h residual</th><th scope="col">g обычный</th><th scope="col">Residual: прямой вклад</th><th scope="col">Residual: ветка</th><th scope="col">Residual: сумма</th></tr></thead><tbody>{residual.backward.map((item, i) => <tr key={item.index} className={i === current ? 'tv-selected' : undefined}><th scope="row">{item.index}</th><td>{fmt(plain.backward[i].before, 6)}</td><td>{fmt(item.before, 6)}</td><td>{fmt(plain.backward[i].outgoing, 7)}</td><td>{fmt(item.identity, 7)}</td><td>{fmt(item.branchGradient, 7)}</td><td>{fmt(item.outgoing, 7)}</td></tr>)}</tbody></table></div>
      <p>Итог ∂hₙ/∂h₀: обычный {fmt(plain.gradient, 8)}, residual {fmt(residual.gradient, 8)}. Выходы: {fmt(plain.output, 6)} и {fmt(residual.output, 6)}.</p>
      <p>Residual добавляет единицу к локальной производной, но не гарантирует сохранение градиента. При h₀=0 и a=−1 ветка даёт −1: 1+(−1)=0, прямой и ветвевой вклады отменяются. В других режимах произведение производных может расти.</p>
      <PredictionExperiment question="Фиксированный опыт: h₀=0,4, a=0,5, n=6. Какая цепочка даст больший |∂hₙ/∂h₀|?" options={['Residual', 'Обычная цепочка', 'Одинаково']} run={prediction => {
        const ordinary = residualGradientTrace(.4, .5, 6, false), skip = residualGradientTrace(.4, .5, 6, true);
        setScenario(.4, .5, 6); setStep(5);
        return { correct: prediction === 0, before: 'Фиксируем h₀=0,4, a=0,5, n=6; входящий градиент на выходе равен 1.', after: `Опыт установлен; показан последний шаг backward к входу. |g₀| обычный=${fmt(Math.abs(ordinary.gradient), 8)}, residual=${fmt(Math.abs(skip.gradient), 8)}.`, explanation: 'В этом примере положительный прямой вклад увеличивает произведение производных. Это результат конкретного опыта; контрпример с a=−1 показывает, почему общей гарантии нет.' };
      }} />
    </>}
  </details>;
}
