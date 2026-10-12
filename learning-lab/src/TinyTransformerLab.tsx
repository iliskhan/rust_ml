import { useMemo, useState, type ReactNode } from 'react';
import { Chart, Range, fmt } from './ui';
import {
  initialTinyParameters, tinyTransformerTrace, tinyTokenContributions, tinyEvaluate, tinySgdStep, tinyNorm,
  TINY_GROUPS, TINY_PARAMETER_COUNT, TINY_TRAIN, TINY_VALIDATION, TINY_VOCAB,
} from './tinyTransformerMath';
import './tiny-transformer-lab.css';

const baseline = initialTinyParameters();
const initialTrain = tinyEvaluate(baseline, TINY_TRAIN), initialValidation = tinyEvaluate(baseline, TINY_VALIDATION);
const labels = {
  E: 'Токен-embeddings', P: 'Позиционные embeddings', Wq: 'Проекция Q', Wk: 'Проекция K', Wv: 'Проекция V', Wo: 'Проекция контекста',
  g1: 'LayerNorm 1: масштаб', b1: 'LayerNorm 1: сдвиг', g2: 'LayerNorm 2: масштаб', b2: 'LayerNorm 2: сдвиг',
  W1: 'FFN: расширение', bf1: 'FFN: первый bias', W2: 'FFN: сжатие', bf2: 'FFN: второй bias', U: 'Выходная голова', bu: 'Выходной bias',
};
const text = (sequence: number[]) => sequence.map(i => TINY_VOCAB[i]).join(' → ');
const newRun = () => ({ parameters: [...baseline], steps: 0, history: [{ step: 0, train: initialTrain.loss, validation: initialValidation.loss }] });

function TinyTable({ label, children }: { label: string; children: ReactNode }) {
  return <div className="tiny-table-scroll" tabIndex={0} role="region" aria-label={`${label}. Прокручиваемая таблица`}>
    <table className="data-table"><caption>{label}</caption>{children}</table>
  </div>;
}

export function TinyTransformerLab() {
  const [run, setRun] = useState(newRun);
  const [rate, setRate] = useState(.08), [position, setPosition] = useState(2);
  const [groupIndex, setGroupIndex] = useState(2), [coordinate, setCoordinate] = useState(0), [stageIndex, setStageIndex] = useState(6);
  const [checked, setChecked] = useState(false);
  const sequence = TINY_TRAIN[run.steps % TINY_TRAIN.length];
  const trace = useMemo(() => tinyTransformerTrace(run.parameters, sequence), [run.parameters, sequence]);
  const train = useMemo(() => tinyEvaluate(run.parameters, TINY_TRAIN), [run.parameters]);
  const validation = useMemo(() => tinyEvaluate(run.parameters, TINY_VALIDATION), [run.parameters]);
  const validationTraces = useMemo(() => TINY_VALIDATION.map(s => tinyTransformerTrace(run.parameters, s)), [run.parameters]);
  const group = TINY_GROUPS[groupIndex], parameter = group.offset + coordinate;
  const terms = useMemo(() => tinyTokenContributions(run.parameters, sequence, parameter), [run.parameters, sequence, parameter]);
  const stage = trace.stages[stageIndex], row = Math.floor(coordinate / group.cols), column = coordinate % group.cols;
  const deltas = TINY_GROUPS.map(g => tinyNorm(run.parameters.slice(g.offset, g.offset + g.size).map((x, i) => x - baseline[g.offset + i])));
  const changedGroups = deltas.filter(x => x > 1e-8).length;
  const passed = validation.loss < .7 && changedGroups === TINY_GROUPS.length;
  const nextParameter = run.parameters[parameter] - rate * trace.gradients[parameter];

  function trainSteps(count: number) {
    const limit = Math.min(count, 400 - run.steps);
    let parameters = run.parameters;
    const history = [...run.history];
    for (let i = 1; i <= limit; i++) {
      parameters = tinySgdStep(parameters, TINY_TRAIN[(run.steps + i - 1) % TINY_TRAIN.length], rate);
      const step = run.steps + i;
      if (step % 5 === 0 || i === limit) history.push({ step, train: tinyEvaluate(parameters, TINY_TRAIN).loss, validation: tinyEvaluate(parameters, TINY_VALIDATION).loss });
    }
    setRun({ parameters, steps: run.steps + limit, history });
  }

  return <section className="tiny-transformer-lab panel" aria-label="Полное обучение маленького Transformer">
    <h3>Обучите Transformer целиком: от CE до embeddings</h3>
    <p>Здесь SGD меняет все {TINY_PARAMETER_COUNT} параметров: E, позиции P, Q/K/V/O, оба LayerNorm, FFN и выходную голову.
      Одна causal-голова, d=4, FFN 4→8→4 с tanh, контекст до четырёх токенов. Backward вычисляется аналитически через скалярный граф операций.</p>
    <div className="tiny-flow" aria-label="Прямой проход одного pre-LN Transformer блока">
      <span>E[token] + P[t]</span><span>LayerNorm → Q/K/V → causal softmax → O</span><span>+ residual</span>
      <span>LayerNorm → FFN</span><span>+ residual → h → logits → CE</span>
    </div>
    <p><strong>Первый опыт:</strong> оставьте η=0,08 и нажмите «120 шагов SGD». Сравните train и validation,
      затем выберите Wq или E и проверьте, как сумма вкладов потерь отдельных токенов изменила общий вес.</p>

    <div className="tiny-columns">
      <section>
        <h4>Учебные данные и реальное обучение</h4>
        <p>Правило игрушечного языка: А→Б→В→Г→А. Teacher forcing: вход — первые четыре токена, цели — следующие четыре.
          Каждый шаг берёт один train-пример; два примера чередуются. Validation никогда не участвует в градиенте.</p>
        <TinyTable label="Фиксированное разделение последовательностей">
          <thead><tr><th scope="col">Раздел</th><th scope="col">Полный текст</th></tr></thead>
          <tbody>{TINY_TRAIN.map((s, i) => <tr key={`t${i}`}><th scope="row">Train {i + 1}</th><td>{text(s)}</td></tr>)}
            {TINY_VALIDATION.map((s, i) => <tr key={`v${i}`}><th scope="row">Validation {i + 1}</th><td>{text(s)}</td></tr>)}</tbody>
        </TinyTable>
        <Range label="Скорость полного SGD η" value={rate} min={.01} max={.2} step={.01} onChange={setRate} />
        <div className="button-row">
          <button type="button" disabled={run.steps >= 400} onClick={() => trainSteps(1)}>1 шаг полного SGD</button>
          <button type="button" disabled={run.steps >= 400} onClick={() => trainSteps(20)}>20 шагов полного SGD</button>
          <button type="button" disabled={run.steps >= 400} onClick={() => trainSteps(120)}>120 шагов SGD</button>
          <button type="button" onClick={() => { setRun(newRun()); setChecked(false); }}>Сбросить полный Transformer</button>
        </div>
        <p role="status">Шагов: <strong>{run.steps}/400</strong>. Изменились {changedGroups}/{TINY_GROUPS.length} групп параметров.
          Train CE: <strong>{fmt(train.loss, 5)}</strong>; validation CE: <strong>{fmt(validation.loss, 5)}</strong> nat.</p>
        <p>Точность next-token: train {fmt(train.accuracy * 100, 1)}%, validation {fmt(validation.accuracy * 100, 1)}% (в каждом разделе 8 целей).
          {run.steps === 400 && ' Достигнут учебный предел; сбросьте модель для нового опыта.'}</p>
      </section>
      <section>
        <h4>Обучение и проверка на других префиксах</h4>
        <Chart xLabel="Шаг SGD" yLabel="Средняя cross-entropy, nat" series={[
          { name: 'Train', points: run.history.map(p => ({ x: p.step, y: p.train })) },
          { name: 'Validation', points: run.history.map(p => ({ x: p.step, y: p.validation })), dashed: true },
        ]} />
        <p className="note">Это отдельные тексты с другими начальными токенами, но тем же знакомым циклом и теми же переходами.
          Улучшение validation показывает перенос на эти восемь целей, а не понимание языка или качество на произвольных текстах.
          Большая η может ухудшить результат; снижение каждой точки не гарантировано.</p>
      </section>
    </div>

    <details open>
      <summary>Forward и backward следующего учебного примера</summary>
      <p>Разбираем train {run.steps % 2 + 1}: {text(sequence)}. Именно его использует следующий шаг SGD.
        L = (ℓ₀ + ℓ₁ + ℓ₂ + ℓ₃)/4 = {fmt(trace.loss, 6)} nat; ∂L/∂L = 1.</p>
      <Range label="Позиция токена t для разбора полного блока" value={position} min={0} max={3} step={1} onChange={setPosition} />
      <p>При t={position} вход «{TINY_VOCAB[sequence[position]]}», цель «{TINY_VOCAB[sequence[position + 1]]}»;
        доступный контекст: {text(sequence.slice(0, position + 1))}. Loss этой позиции: {fmt(trace.losses[position], 6)} nat.</p>
      <TinyTable label={`Выход и начало backward при t=${position}`}>
        <thead><tr><th scope="col">Токен</th><th scope="col">Logit</th><th scope="col">Вероятность</th><th scope="col">∂L/∂logit = (p−y)/4</th></tr></thead>
        <tbody>{TINY_VOCAB.map((name, j) => <tr key={name}><th scope="row">{name}{sequence[position + 1] === j ? ' · цель' : ''}</th>
          <td>{fmt(trace.logits[position][j], 6)}</td><td>{fmt(trace.probabilities[position][j], 6)}</td><td>{fmt(trace.dlogits[position][j], 6)}</td></tr>)}</tbody>
      </TinyTable>
      <p className="formula">L → logits → h → residual/FFN → контекст AV → softmax → scores → Q/K/V → LayerNorm → E + P.</p>
      <p>Это граф с ветвями: residual передаёт градиент напрямую, а FFN и attention добавляют свои вклады.
        Градиент каждого узла суммируется по всем его использованиям и всем четырём потерям.</p>
      <div className="tiny-columns">
        <section>
          <TinyTable label="Нормы реальных градиентов по стадиям">
            <thead><tr><th scope="col">Стадия</th><th scope="col">‖∂L/∂узлы‖₂</th></tr></thead>
            <tbody>{trace.stages.map(s => <tr key={s.name}><th scope="row">{s.name}</th><td>{fmt(s.gradientNorm, 6)}</td></tr>)}</tbody>
          </TinyTable>
        </section>
        <section>
          <label className="tiny-select">Стадия для численного разбора
            <select value={stageIndex} onChange={e => setStageIndex(Number(e.target.value))}>
              {trace.stages.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
            </select>
          </label>
          <TinyTable label={`${stage.name}, позиция t=${position}`}>
            <thead><tr><th scope="col">{stageIndex === 6 || stageIndex === 7 ? 'Позиция ключа j' : 'Координата'}</th><th scope="col">Значение</th><th scope="col">∂L/∂значение</th></tr></thead>
            <tbody>{stage.values[position].map((value, j) => <tr key={j}><th scope="row">{j}</th><td>{fmt(value, 6)}</td><td>{fmt(stage.gradients[position][j], 6)}</td></tr>)}</tbody>
          </TinyTable>
          <p>Все нормы слева объединяют все позиции и координаты. Таблица справа показывает одну позицию.
            Для attention столбец j означает позицию ключа в тексте.</p>
        </section>
      </div>
      <TinyTable label={`Causal attention и его backward при t=${position}`}>
        <thead><tr><th scope="col">Ключ j</th><th scope="col">Вес A[t,j]</th><th scope="col">∂L/∂A</th><th scope="col">∂L/∂score</th></tr></thead>
        <tbody>{sequence.slice(0, -1).map((token, j) => <tr key={j}><th scope="row">{j}: {TINY_VOCAB[token]}</th>
          <td>{j > position ? '0 · будущее закрыто' : fmt(trace.attention[position][j], 6)}</td>
          <td>{j > position ? 'нет связи' : fmt(trace.attentionGradients[position][j], 6)}</td>
          <td>{j > position ? '0 · маска' : fmt(trace.scoreGradients[position][j], 6)}</td></tr>)}</tbody>
      </TinyTable>
      <p className="formula">∂L/∂sⱼ = Aⱼ (∂L/∂Aⱼ − Σₖ Aₖ ∂L/∂Aₖ); sⱼ = q·kⱼ/√4.</p>
      <p>При t=0 единственный разрешённый вес A=1, поэтому его score-градиент равен нулю.
        Q и K получают обучающий сигнал от более поздних позиций, где есть выбор между ключами.</p>
    </details>

    <details open>
      <summary>Общий вес получает вклады от многих токенов</summary>
      <div className="tiny-columns">
        <label className="tiny-select">Группа обучаемых параметров
          <select value={groupIndex} onChange={e => { setGroupIndex(Number(e.target.value)); setCoordinate(0); }}>
            {TINY_GROUPS.map((g, i) => <option value={i} key={g.name}>{g.name} · {labels[g.name]} ({g.rows}×{g.cols})</option>)}
          </select>
        </label>
        <Range label="Индекс параметра внутри группы (по строкам)" value={coordinate} min={0} max={group.size - 1} step={1} onChange={setCoordinate} />
      </div>
      <p>Выбран {group.name}[{row},{column}]. Для E строка — токен словаря, для P — позиция, для матриц W/U — входная координата;
        столбец — выходная координата. Здесь каждая потеря токена делает отдельный backward через весь блок.</p>
      <TinyTable label={`Вклады потерь в общий параметр ${group.name}[${row},${column}]`}>
        <thead><tr><th scope="col">Потеря позиции t</th><th scope="col">Вход → цель</th><th scope="col">(∂ℓₜ/∂параметр)/4</th></tr></thead>
        <tbody>{terms.map((value, t) => <tr key={t}><th scope="row">t={t}</th><td>{TINY_VOCAB[sequence[t]]} → {TINY_VOCAB[sequence[t + 1]]}</td><td>{fmt(value, 8)}</td></tr>)}</tbody>
        <tfoot><tr><th scope="row" colSpan={2}>Сумма = ∂L/∂параметр</th><td>{fmt(terms.reduce((s, x) => s + x, 0), 8)}</td></tr></tfoot>
      </TinyTable>
      <p className="formula">θ: {fmt(run.parameters[parameter], 8)} − {fmt(rate)} × {fmt(trace.gradients[parameter], 8)} = {fmt(nextParameter, 8)} (следующий SGD).</p>
      <p>Начальный θ = {fmt(baseline[parameter], 8)}; изменение после обучения = {fmt(run.parameters[parameter] - baseline[parameter], 8)}.
        Суммируются вклады потерь, а не только места появления токена: через attention поздняя потеря может менять embedding раннего токена.</p>
      <TinyTable label="Движение всех групп весов и их текущие градиенты">
        <thead><tr><th scope="col">Группа</th><th scope="col">Параметров</th><th scope="col">‖θ−θ₀‖₂</th><th scope="col">‖∂L/∂θ‖₂</th></tr></thead>
        <tbody>{TINY_GROUPS.map((g, i) => <tr key={g.name}><th scope="row">{g.name} · {labels[g.name]}</th><td>{g.size}</td>
          <td>{fmt(deltas[i], 6)}</td><td>{fmt(tinyNorm(trace.gradients.slice(g.offset, g.offset + g.size)), 6)}</td></tr>)}</tbody>
      </TinyTable>
    </details>

    <details>
      <summary>Все восемь целей validation</summary>
      <TinyTable label="Предсказания на отложенных последовательностях">
        <thead><tr><th scope="col">Пример, t</th><th scope="col">Доступный префикс</th><th scope="col">Цель</th><th scope="col">Предсказание</th><th scope="col">p цели</th></tr></thead>
        <tbody>{validationTraces.flatMap((v, i) => v.targets.map((target, t) => <tr key={`${i}-${t}`}><th scope="row">{i + 1}, t={t}</th>
          <td>{text(v.inputs.slice(0, t + 1))}</td><td>{TINY_VOCAB[target]}</td><td>{TINY_VOCAB[v.probabilities[t].indexOf(Math.max(...v.probabilities[t]))]}</td>
          <td>{fmt(v.probabilities[t][target], 6)}</td></tr>))}</tbody>
      </TinyTable>
    </details>
    <section className="exercise" aria-label="Практика полного обучения Transformer">
      <h4>Измените все группы и снизьте validation CE ниже 0,7</h4>
      <p>Перед запуском предскажите: одинаково ли снизятся train и validation? Обучите 120 шагов при η=0,08,
        сравните кривые и найдите ненулевой градиент Wq, W1 и E. Затем проверьте результат.</p>
      <button type="button" onClick={() => setChecked(true)}>Проверить полное обучение</button>
      {checked && <p role="status" className={passed ? 'feedback-correct' : 'feedback-retry'}>{passed
        ? 'Достигнуто: все группы изменились, validation CE ниже 0,7. Это проверка только на данном маленьком цикле.'
        : 'Пока условие не выполнено: нужны изменения всех групп и validation CE ниже 0,7. Попробуйте η=0,08 и 120 шагов после сброса.'}</p>}
    </section>
    <p className="note">Границы модели: одна голова и один блок; без dropout, RoPE, padding, minibatch, KV-cache и выборки текста.
      Позиции P обучаются. Два pre-LayerNorm используют ε=10⁻⁵ и обучаемые γ/β; FFN использует гладкую tanh.
      Численные тесты сравнивают все 208 аналитических производных с центральными разностями и проверяют causal-маску.
      Такая сеть демонстрирует механизм обучения; она не воспроизводит масштаб современного LLM.</p>
  </section>;
}
