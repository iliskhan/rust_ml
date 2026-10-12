import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Range, fmt } from './ui';
import { TOY_VOCAB } from './transformerMath';
import { HEAD_SEQUENCE, headSgdStep, headTrainingTrace, initialHeadParameters, transformerHeadBatch } from './transformerHeadMath';
import './transformer-head-lab.css';

const HeadGeometryLab = lazy(() => import('./HeadGeometryLab').then(module => ({ default: module.HeadGeometryLab })));

function HeadTable({ label, children }: { label: string; children: ReactNode }) {
  return <div className="th-table-scroll" role="region" aria-label={`${label}. Прокручиваемая таблица`} tabIndex={0}>
    <table className="data-table"><caption>{label}</caption>{children}</table>
  </div>;
}
const vector = (values: number[]) => `[${values.map(value => fmt(value, 5)).join('; ')}]`;

export function TransformerHeadLab() {
  const [batch] = useState(() => transformerHeadBatch());
  const [parameters, setParameters] = useState(initialHeadParameters);
  const [active, setActive] = useState(() => batch.targets.map(() => true));
  const [position, setPosition] = useState(1), [coordinate, setCoordinate] = useState(0), [token, setToken] = useState(2);
  const [rate, setRate] = useState(.1), [pack, setPack] = useState(20), [steps, setSteps] = useState(0);
  const [last, setLast] = useState<{ before: number; after: number; count: number; rate: number } | null>(null);
  const [checked, setChecked] = useState(false);
  const trace = headTrainingTrace(batch.hidden, batch.targets, parameters, active);
  const preview = headSgdStep(batch.hidden, batch.targets, parameters, rate, active);
  const selected = trace.positions[position], target = batch.targets[position];
  const baseline = headTrainingTrace(batch.hidden, batch.targets, initialHeadParameters()).loss;
  const allLoss = headTrainingTrace(batch.hidden, batch.targets, parameters).loss;
  const fixed = transformerHeadBatch().hidden;
  const hiddenDifference = Math.max(...batch.hidden.flatMap((row, t) => row.map((value, d) => Math.abs(value - fixed[t][d]))));
  const passed = steps > 0 && active.every(Boolean) && allLoss <= baseline - .35 && hiddenDifference === 0;

  function train(count: number) {
    const actual = Math.min(count, 500 - steps);
    let next = parameters;
    for (let i = 0; i < actual; i++) next = headSgdStep(batch.hidden, batch.targets, next, rate, active).parameters;
    setLast({ before: trace.loss, after: headTrainingTrace(batch.hidden, batch.targets, next, active).loss, count: actual, rate });
    setParameters(next);
    setSteps(steps + actual);
  }
  function reset() {
    setParameters(initialHeadParameters()); setActive(batch.targets.map(() => true));
    setSteps(0); setLast(null); setChecked(false); setRate(.1); setPack(20);
  }
  return <section className="transformer-head-lab panel" aria-label="Обучение только выходного слоя Transformer">
    <h3>Обучается только выходной слой</h3>
    <p>Те же скрытые признаки h текущего учебного Transformer переводим в logits: z = hW + b.
      Embeddings, causal attention с RoPE и residual фиксированы. Меняются только 12 весов W и 6 bias;
      это обучение выходного слоя на одном тексте, а не полноценное обучение Transformer.</p>
    <p><strong>Первый опыт:</strong> оставьте все четыре позиции, η = 0,1 и выполните 20 шагов.
      Сравните среднюю cross-entropy до и после. d — координата скрытого признака, t — позиция токена.</p>
    <p>Последовательность: {HEAD_SEQUENCE.map(id => TOY_VOCAB[id]).join(' → ')}.
      На входе первые четыре токена, цели сдвинуты на один. Padding отсутствует.
      Маска обучения ниже исключает loss позиции, не меняя её доступный causal-контекст.</p>

    <div className="th-columns">
      <section>
        <h4>Позиция и шаг обучения</h4>
        <Range label="Позиция для разбора t" value={position} min={0} max={batch.targets.length - 1} step={1} onChange={setPosition} />
        <Range label="Скорость SGD η" value={rate} min={.01} max={.5} step={.01} onChange={setRate} />
        <Range label="Шагов в пакете" value={pack} min={1} max={25} step={1} onChange={setPack} />
        <fieldset className="th-mask"><legend>Какие позиции входят в среднее</legend>
          {batch.targets.map((id, t) => <label key={t}><input type="checkbox" checked={active[t]}
            disabled={active[t] && trace.count === 1} onChange={event => setActive(active.map((value, index) => index === t ? event.target.checked : value))} />
            t={t}: {TOY_VOCAB[batch.inputIds[t]]} → {TOY_VOCAB[id]}</label>)}
        </fieldset>
        <div className="button-row">
          <button type="button" disabled={steps >= 500} onClick={() => train(1)}>1 шаг SGD</button>
          <button type="button" disabled={steps >= 500} onClick={() => train(pack)}>{Math.min(pack, 500 - steps)} шагов SGD</button>
          <button type="button" onClick={reset}>Сбросить обучение</button>
        </div>
        <p role="status">Выполнено {steps} из максимум 500 шагов. Средняя loss по {trace.count} позициям: <strong>{fmt(trace.loss, 6)}</strong> nat.</p>
        {last && <p>Последний пакет: {last.count} шагов при η={fmt(last.rate)}; средняя loss {fmt(last.before, 6)} → {fmt(last.after, 6)} nat.
          Значения относятся к маске во время этого пакета.</p>}
        {steps === 500 && <p>Учебный предел достигнут. Сбросьте обучение для нового опыта.</p>}
      </section>
      <section>
        <h4>Что видит выбранная позиция</h4>
        <p>t={position}, вход «{TOY_VOCAB[batch.inputIds[position]]}», цель — следующий токен «{TOY_VOCAB[target]}».
          Доступный префикс: {batch.inputIds.slice(0, position + 1).map(id => TOY_VOCAB[id]).join(' ')}.</p>
        <p>Фиксированный h = {vector(batch.hidden[position])}. Будущие токены causal-маска запрещает.</p>
        <p>P(цели) = <strong>{fmt(selected.probabilities[target], 6)}</strong>; loss позиции = <strong>{fmt(selected.loss, 6)}</strong> nat.
          {active[position] ? ' Позиция участвует в обучении.' : ' Позиция исключена: её вклад в средний градиент равен 0.'}</p>
        <HeadTable label={`Logits, softmax и градиент loss позиции t=${position}`}>
          <thead><tr><th scope="col">Токен</th><th scope="col">Logit z</th><th scope="col">p</th><th scope="col">y</th><th scope="col">dlogit = p−y</th></tr></thead>
          <tbody>{TOY_VOCAB.map((name, id) => <tr key={name}>
            <th scope="row">{name}{id === target ? ' · цель' : ''}</th><td>{fmt(selected.logits[id], 6)}</td>
            <td>{fmt(selected.probabilities[id], 6)}</td><td>{Number(id === target)}</td><td>{fmt(selected.dlogits[id], 6)}</td>
          </tr>)}</tbody>
        </HeadTable>
        <p className="formula">zⱼ = h₀W₀ⱼ + h₁W₁ⱼ + bⱼ; p = softmax(z); ℓₜ = −ln p[target].</p>
        <p className="note">Loss считается устойчиво через log-sum-exp. Если очень малая вероятность округлилась до нуля,
          потеря всё равно вычисляется из logits. При обучении T = 1, top-k/top-p не применяются.</p>
      </section>
    </div>

    <HeadTable label="Teacher forcing: четыре позиции и текущие потери">
      <thead><tr><th scope="col">t</th><th scope="col">Вход → цель</th><th scope="col">h</th><th scope="col">p цели</th><th scope="col">loss, nat</th><th scope="col">В среднем</th></tr></thead>
      <tbody>{trace.positions.map((item, t) => <tr key={t}>
        <th scope="row">{t}{t === position ? ' · выбрана' : ''}</th><td>{TOY_VOCAB[batch.inputIds[t]]} → {TOY_VOCAB[batch.targets[t]]}</td>
        <td>{vector(batch.hidden[t])}</td><td>{fmt(item.probabilities[batch.targets[t]], 6)}</td>
        <td>{fmt(item.loss, 6)}</td><td>{item.active ? 'Да' : 'Нет'}</td>
      </tr>)}</tbody>
    </HeadTable>
    <p className="formula">L = Σ учитываемых ℓₜ / N = {fmt(trace.sumLoss, 6)} / {trace.count} = {fmt(trace.loss, 6)} nat.</p>

    <details open>
      <summary>От вклада h в dW к следующему шагу SGD</summary>
      <div className="th-columns">
        <Range label="Координата признака d" value={coordinate} min={0} max={1} step={1} onChange={setCoordinate} />
        <label className="th-token-select">Столбец W и bias: токен j<select value={token} onChange={event => setToken(Number(event.target.value))}>
          {TOY_VOCAB.map((name, id) => <option key={name} value={id}>{id}: {name}</option>)}
        </select></label>
      </div>
      <HeadTable label={`Вклады в W[${coordinate}, ${token}] для токена «${TOY_VOCAB[token]}»`}>
        <thead><tr><th scope="col">t</th><th scope="col">h[d]</th><th scope="col">p[j]−y[j]</th><th scope="col">h[d] × (p[j]−y[j])</th><th scope="col">Учтённый вклад</th></tr></thead>
        <tbody>{trace.positions.map((item, t) => <tr key={t}>
          <th scope="row">{t}</th><td>{fmt(batch.hidden[t][coordinate], 6)}</td><td>{fmt(item.dlogits[token], 6)}</td>
          <td>{fmt(item.dWeights[coordinate][token], 6)}</td><td>{fmt(item.active ? item.dWeights[coordinate][token] : 0, 6)}</td>
        </tr>)}</tbody>
      </HeadTable>
      <p className="formula">∂L/∂W[{coordinate},{token}] = Σ вкладов / N = {fmt(trace.sumWeights[coordinate][token], 6)} / {trace.count} = {fmt(trace.dWeights[coordinate][token], 6)}.</p>
      <p className="formula">∂L/∂b[{token}] = Σ(p[j]−y[j]) / N = {fmt(trace.sumBias[token], 6)} / {trace.count} = {fmt(trace.dBias[token], 6)}.</p>
      <p className="formula">Следующий SGD: W = {fmt(parameters.weights[coordinate][token], 6)} − {fmt(rate)} × {fmt(trace.dWeights[coordinate][token], 6)} = {fmt(preview.parameters.weights[coordinate][token], 6)}.</p>
      <p className="formula">b = {fmt(parameters.bias[token], 6)} − {fmt(rate)} × {fmt(trace.dBias[token], 6)} = {fmt(preview.parameters.bias[token], 6)}.</p>
      <p>Прогноз одного шага: средняя loss {fmt(trace.loss, 6)} → {fmt(preview.after.loss, 6)} nat.
        Обновляются одновременно все W и b по одному градиенту до шага.</p>
      <HeadTable label="Все параметры: до → после следующего шага SGD; средние градиенты">
        <thead><tr><th scope="col">Токен j</th><th scope="col">W[0,j]</th><th scope="col">∂L/∂W[0,j]</th><th scope="col">W[1,j]</th><th scope="col">∂L/∂W[1,j]</th><th scope="col">b[j]</th><th scope="col">∂L/∂b[j]</th></tr></thead>
        <tbody>{TOY_VOCAB.map((name, id) => <tr key={name}>
          <th scope="row">{name}</th><td>{fmt(parameters.weights[0][id], 5)} → {fmt(preview.parameters.weights[0][id], 5)}</td>
          <td>{fmt(trace.dWeights[0][id], 6)}</td><td>{fmt(parameters.weights[1][id], 5)} → {fmt(preview.parameters.weights[1][id], 5)}</td>
          <td>{fmt(trace.dWeights[1][id], 6)}</td><td>{fmt(parameters.bias[id], 5)} → {fmt(preview.parameters.bias[id], 5)}</td>
          <td>{fmt(trace.dBias[id], 6)}</td>
        </tr>)}</tbody>
      </HeadTable>
    </details>
    <section className="exercise" aria-label="Практика обучения выходного слоя">
      <span className="eyebrow">Предскажи → измени → проверь</span>
      <h4>Уменьшите среднюю loss хотя бы на 0,35 nat</h4>
      <p>Обучайте все четыре позиции. Начните с η=0,1 и пакета 20 шагов. Исходная loss {fmt(baseline, 6)},
        текущая по всем позициям {fmt(allLoss, 6)} nat. Скрытые признаки должны остаться прежними.</p>
      <button type="button" onClick={() => setChecked(true)}>Проверить результат обучения</button>
      {checked && <p role="status" className={passed ? 'feedback-correct' : 'feedback-retry'}>
        {passed ? 'Готово: средняя loss снизилась, h не изменился. Обучился только выходной слой.'
          : 'Цель пока не достигнута. Включите все позиции и выполните шаги SGD; требуется снижение на 0,35 nat от исходной loss.'}
      </p>}
      <p>Максимальная разница фиксированных h: {fmt(hiddenDifference, 8)}. Улучшение на одном тексте не доказывает качество на новых текстах.</p>
    </section>
    <Suspense fallback={<p role="status">Загружается геометрия выходной головы…</p>}><HeadGeometryLab parameters={parameters} hidden={batch.hidden} targets={batch.targets} mask={active} rate={rate} steps={steps} onTrainOne={() => train(1)} /></Suspense>
    <details><summary>Границы и источники</summary>
      <p>Backbone взят из toyLanguageForward текущего курса: одна attention-голова, два признака, RoPE и residual.
        FFN и нормализация опущены. Обратное распространение через attention не выполняется; embeddings и W не связаны общими параметрами.</p>
      <ul><li><a href="https://d2l.ai/chapter_linear-classification/softmax-regression.html">D2L, §4.1.2.2</a>: softmax + cross-entropy и производная p−y.</li>
        <li><a href="https://docs.pytorch.org/docs/2.14/generated/torch.nn.CrossEntropyLoss.html">PyTorch CrossEntropyLoss</a>: logits, цели и усреднение.</li>
        <li><a href="https://arxiv.org/html/1706.03762v7">Attention Is All You Need, §3.1 и §3.4</a>: causal-маска и linear + softmax.</li></ul>
    </details>
  </section>;
}
