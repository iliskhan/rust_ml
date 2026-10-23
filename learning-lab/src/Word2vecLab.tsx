import { useMemo, useState, type ReactNode } from 'react';
import { ConceptLink } from './learning-context';
import { Chart, Exercise, Range, fmt } from './ui';
import { PredictionExperiment } from './PredictionExperiment';
import {
  WORD2VEC_CORPORA, cosineSimilarity, initialWord2vec, word2vecData, word2vecExamples,
  word2vecExampleLoss, word2vecExampleStep, word2vecExampleTrace, word2vecNegatives, word2vecNoiseDistribution,
  type Word2vecArchitecture, type Word2vecObjective,
} from './word2vecMath';
import './word2vec-lab.css';

const MAX_STEPS = 10000;
const vector = (values: readonly number[]) => `[${values.map(value => fmt(value, 4)).join('; ')}]`;
type Settings = { corpusIndex: number; windowSize: number; architecture: Word2vecArchitecture; objective: Word2vecObjective; negativeCount: number };
const defaults: Settings = { corpusIndex: 0, windowSize: 1, architecture: 'skipgram', objective: 'softmax', negativeCount: 3 };
function prepare(settings: Settings) {
  const data = word2vecData(WORD2VEC_CORPORA[settings.corpusIndex].sentences, settings.windowSize);
  const examples = word2vecExamples(data, settings.architecture);
  const evaluationNegatives = settings.objective === 'negative-sampling'
    ? examples.map((example, i) => word2vecNegatives(data, example.target, settings.negativeCount, i + 1)) : [];
  return { data, examples, evaluationNegatives };
}
function newRun(settings: Settings, generation = 0) {
  const { data, examples, evaluationNegatives } = prepare(settings), model = initialWord2vec(data.vocabulary.length);
  return { model, steps: 0, generation, history: [{ step: 0, loss: word2vecExampleLoss(model, examples, settings.objective, evaluationNegatives) }] };
}
function Table({ title, children }: { title: string; children: ReactNode }) {
  return <div className="word2vec-table" tabIndex={0} role="region" aria-label={`${title}. Таблица с горизонтальной прокруткой`}>
    <table className="data-table"><caption>{title}</caption>{children}</table>
  </div>;
}

export function Word2vecLab() {
  const [settings, setSettings] = useState(defaults), [run, setRun] = useState(() => newRun(defaults));
  const { corpusIndex, windowSize, architecture, objective, negativeCount } = settings;
  const { data, examples, evaluationNegatives } = useMemo(() => prepare(settings), [settings]);
  const [rate, setRate] = useState(.1), [exampleIndex, setExampleIndex] = useState(0), [wordIndex, setWordIndex] = useState(0);
  const [error, setError] = useState('');
  const cbow = architecture === 'cbow', sampled = objective === 'negative-sampling';
  const mode = `${cbow ? 'CBOW' : 'Skip-gram'} · ${sampled ? `negative sampling, k=${negativeCount}` : 'полный softmax'}`;
  const example = examples[exampleIndex], target = data.vocabulary[example.target];
  const inputWords = example.inputs.map(id => data.vocabulary[id]).join(' + '), exampleLabel = `${inputWords} → ${target}`;
  const negatives = sampled ? word2vecNegatives(data, example.target, negativeCount, 100000 + run.steps) : [];
  const trace = word2vecExampleTrace(run.model, example, objective, negatives);
  const loss = useMemo(() => word2vecExampleLoss(run.model, examples, objective, evaluationNegatives), [run.model, examples, objective, evaluationNegatives]);
  const initial = initialWord2vec(data.vocabulary.length), noise = sampled ? word2vecNoiseDistribution(data) : [];
  const neighbors = data.vocabulary.map((word, id) => ({ word, id, similarity: cosineSimilarity(run.model.input[wordIndex], run.model.input[id]) }))
    .filter(item => item.id !== wordIndex).sort((a, b) => b.similarity - a.similarity);

  function restart(patch: Partial<Settings> = {}) {
    const next = { ...settings, ...patch };
    setSettings(next); setRun(newRun(next, run.generation + 1));
    setExampleIndex(0); setWordIndex(0); setError('');
  }
  function train(count: number) {
    const limit = Math.min(count, MAX_STEPS - run.steps), history = [...run.history];
    let model = run.model;
    for (let i = 0; i < limit; i++) {
      const item = count === 1 ? example : examples[(run.steps + i) % examples.length];
      const draws = sampled ? word2vecNegatives(data, item.target, negativeCount, 100000 + run.steps + i) : [];
      model = word2vecExampleStep(model, item, rate, objective, draws);
      const step = run.steps + i + 1;
      if (step % 50 === 0 || i === limit - 1) history.push({ step, loss: word2vecExampleLoss(model, examples, objective, evaluationNegatives) });
    }
    const after = word2vecExampleTrace(model, example, objective, negatives);
    setRun({ model, steps: run.steps + limit, generation: run.generation, history }); setError('');
    return after;
  }
  function trainSafely(count: number) {
    try { train(count); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить шаг. Сбросьте опыт.'); }
  }

  return <section className="word2vec-lab" aria-label="Лаборатория Word2Vec">
    <p className="tc-idea">Откуда берутся числа в таблице embeddings? <strong>Word2Vec</strong> учит их по соседству слов.
      {' '}<strong>Skip-gram</strong> предсказывает соседей по центру; <strong>CBOW</strong> — центр по среднему вектору соседей.</p>
    <p>Нужны <ConceptLink concept="vector">векторы</ConceptLink>, <ConceptLink concept="dot-product">скалярное произведение</ConceptLink>,
      {' '}<ConceptLink concept="softmax">softmax</ConceptLink> и <ConceptLink concept="gradient">градиент</ConceptLink>.
      Можно сначала посмотреть <a href="#transformer">выбор строки embedding-таблицы</a>, затем вернуться сюда.</p>
    <p className="tc-prompt"><strong>Первый опыт.</strong> Оставьте Skip-gram, полный softmax и окно 1. Выполните «2000 шагов по корпусу»,
      сравните ошибку и векторы «кот» и «пёс». Затем переключите архитектуру на CBOW и проследите обратное направление задачи.
      Сходство на маленьком корпусе не доказывает понимание языка.</p>

    <div className="word2vec-columns">
      <section className="panel"><h2>1. Постройте обучающий пример</h2>
        <label>Архитектура<select value={architecture} onChange={event => restart({ architecture: event.target.value as Word2vecArchitecture })}>
          <option value="skipgram">Skip-gram: центр → сосед</option><option value="cbow">CBOW: соседи → центр</option>
        </select></label>
        <label>Цель обучения<select value={objective} onChange={event => restart({ objective: event.target.value as Word2vecObjective })}>
          <option value="softmax">Полный softmax</option><option value="negative-sampling">Negative sampling</option>
        </select></label>
        {sampled && <Range label="Отрицательных примеров k" value={negativeCount} min={1} max={5} step={1} onChange={value => restart({ negativeCount: value })} />}
        <label>Учебный корпус<select value={corpusIndex} onChange={event => restart({ corpusIndex: Number(event.target.value) })}>
          {WORD2VEC_CORPORA.map((item, i) => <option key={item.name} value={i}>{item.name}</option>)}
        </select></label>
        <label>Радиус окна контекста<select value={windowSize} onChange={event => restart({ windowSize: Number(event.target.value) })}>
          <option value={1}>1 слово слева и справа</option><option value={2}>2 слова слева и справа</option>
        </select></label>
        <p className="note">Смена архитектуры, цели, k, корпуса или окна сбрасывает модель, историю и прогноз.
          Потери разных целей напрямую несопоставимы. Начальные веса воспроизводимы.</p>
        <details><summary>Весь корпус: {data.sentences.length} предложений</summary><ul>{WORD2VEC_CORPORA[corpusIndex].sentences.map((sentence, i) => <li key={i}>{sentence}</li>)}</ul></details>
        <p>{data.vocabulary.length} слов в словаре, {examples.length} обучающих примеров с учётом повторов.
          Окно не пересекает границу предложения и исключает центральную позицию.</p>
        <Range label="Номер примера" value={exampleIndex + 1} min={1} max={examples.length} step={1} onChange={value => setExampleIndex(value - 1)} />
        <p className="word2vec-sentence" aria-label="Предложение с выбранным примером">{data.sentences[example.sentence].map((id, position) => {
          const isInput = cbow ? example.contextPositions.includes(position) : position === example.position;
          const isTarget = cbow ? position === example.position : example.contextPositions.includes(position);
          return <span key={position} className={isInput ? 'word2vec-center' : isTarget ? 'word2vec-context' : undefined}>
            {data.vocabulary[id]}{isInput ? ' (вход)' : isTarget ? ' (цель)' : ''}
          </span>;
        })}</p>
        <p className="formula"><strong>{exampleLabel}</strong></p>
        <p>{cbow ? 'Один пример на центральную позицию: усредняем векторы всех соседей. Их порядок не учитывается; повтор слова учитывается повторно.'
          : 'Каждый сосед даёт отдельную пару. Центральное слово — вход, сосед — цель. Синонимы вручную не размечены.'}</p>
      </section>

      <section className="panel"><h2>2. Обучите две таблицы</h2>
        <p><strong>{mode}</strong>. Таблицы E и U имеют форму [{data.vocabulary.length}, 2].
          {' '}{cbow ? 'Средний вектор входных слов' : 'Вектор входного слова'} h = {vector(trace.hidden)}.</p>
        <ol className="word2vec-flow"><li>{cbow ? 'Соседи → среднее E[сосед]' : 'Центр → E[центр]'}</li>
          <li>Score слова j: h · U[j]</li><li>{sampled ? 'Цель и k случайных слов → sigmoid' : 'Все слова словаря → softmax'}</li>
          <li>Потеря → градиент → SGD</li></ol>
        <Range label="Скорость обучения η" value={rate} min={.01} max={.2} step={.01} onChange={setRate} />
        <div className="button-row">
          <button type="button" disabled={run.steps >= MAX_STEPS} onClick={() => trainSafely(1)}>1 шаг по выбранному примеру</button>
          <button type="button" disabled={run.steps >= MAX_STEPS} onClick={() => trainSafely(200)}>200 шагов по корпусу</button>
          <button type="button" disabled={run.steps >= MAX_STEPS} onClick={() => trainSafely(2000)}>2000 шагов по корпусу</button>
          <button type="button" onClick={() => restart()}>Сбросить обучение</button>
        </div>
        <p role="status" aria-live="polite" aria-atomic="true">{mode}. Шагов: <strong>{run.steps}/{MAX_STEPS}</strong>.
          Средняя {sampled ? 'NS-потеря на фиксированных отрицательных примерах' : 'cross-entropy на корпусе'}:
          {' '}<strong>{fmt(loss, 4)} nat</strong> (в начале {fmt(run.history[0].loss, 4)}).</p>
        {error && <p role="alert">{error} Последнее успешное состояние сохранено.</p>}
        <Chart xLabel="Шаг SGD" yLabel={sampled ? 'Средняя NS-потеря, nat' : 'Средняя cross-entropy, nat'} xDomain={[0, Math.max(1, run.steps)]}
          series={[{ name: mode, points: run.history.map(point => ({ x: point.step, y: point.loss })) }]} />
        <p className="note">Кнопки по корпусу перебирают примеры по кругу. Средняя потеря не обязана уменьшаться на каждом шаге.
          {sampled && ' Обучение получает новые воспроизводимые отрицательные выборки. Для графика на каждый пример закреплена отдельная выборка: так его точки сопоставимы.'}
          {' '}Это обучающая диагностика, не оценка обобщения на новых данных.</p>
      </section>
    </div>

    <section className="panel"><h2>3. Предскажите результат одного шага</h2>
      <p className="formula">{sampled ? `σ(h · U[«${target}»])` : `p(«${target}» | вход)`} = {fmt(trace.probabilities[example.target] * 100, 2)}%;
        {' '}L = {fmt(trace.loss, 4)} nat.</p>
      {sampled && <p>Sigmoid σ(s) = 1 / (1 + exp(−s)) оценивает пару «вход → слово» как наблюдаемую, а не вероятность слова в словаре.
        Отрицательные слова следующего шага: <strong>{negatives.map(id => data.vocabulary[id]).join(', ')}</strong>.
        После шага выборка обновится; снимок ниже сравнит до/после на одной выборке.</p>}
      <PredictionExperiment key={run.generation} headingLevel={3}
        question={`${mode}. После шага «${exampleLabel}» ${sampled ? 'sigmoid-оценка положительной пары' : 'вероятность цели'}…`}
        options={['Увеличится', 'Уменьшится', 'Практически не изменится']} disabled={run.steps >= MAX_STEPS}
        run={prediction => {
          const after = train(1), beforeP = trace.probabilities[example.target], afterP = after.probabilities[example.target];
          const outcome = Math.abs(afterP - beforeP) < 1e-10 ? 2 : afterP > beforeP ? 0 : 1;
          const measure = sampled ? 'sigmoid' : 'p';
          return { correct: prediction === outcome, before: `${measure} = ${fmt(beforeP * 100, 4)}%; L = ${fmt(trace.loss, 6)} nat`,
            after: `${measure} = ${fmt(afterP * 100, 4)}%; L = ${fmt(after.loss, 6)} nat`,
            explanation: `${mode}. Реальный SGD с η=${fmt(rate)}. ${sampled ? `Отрицательные слова: ${negatives.map(id => data.vocabulary[id]).join(', ')}. ` : ''}Улучшение положительной пары не гарантирует улучшения всех слов корпуса.` };
        }} />
      {sampled ? <>
        <Table title="Положительная пара и каждый отрицательный пример">
          <thead><tr><th scope="col">Слово</th><th scope="col">y</th><th scope="col">Score</th><th scope="col">Sigmoid, %</th><th scope="col">Потеря, nat</th><th scope="col">σ − y</th></tr></thead>
          <tbody>{trace.terms.map((term, i) => <tr key={i}><th scope="row">{data.vocabulary[term.word]} · {i === 0 ? 'цель' : `отриц. ${i}`}</th>
            <td>{term.label}</td><td>{fmt(term.score, 4)}</td><td>{fmt(term.probability * 100, 2)}</td><td>{fmt(term.loss, 4)}</td><td>{fmt(term.residual, 4)}</td></tr>)}</tbody>
        </Table>
        <details><summary>Как выбраны отрицательные слова?</summary>
          <p>Исходное Pₙ(w) ∝ count(w)³ᐟ⁴ по частотам слов корпуса. Положительная цель исключена,
            оставшаяся масса перенормирована. Выборки независимы с возвращением: повторы допустимы, их градиенты складываются.
            Отрицательное слово может быть настоящим соседом в другом примере; это случайная учебная цель, не утверждение о языке.</p>
          <Table title="Распределение отрицательных слов для выбранной цели"><thead><tr><th scope="col">Слово</th><th scope="col">Исходное Pₙ, %</th><th scope="col">После исключения цели, %</th></tr></thead>
            <tbody>{data.vocabulary.map((word, i) => <tr key={word}><th scope="row">{word}</th><td>{fmt(noise[i] * 100, 2)}</td><td>{fmt(i === example.target ? 0 : noise[i] / (1 - noise[example.target]) * 100, 2)}</td></tr>)}</tbody>
          </Table>
        </details>
      </> : <Table title="Все кандидаты: полный softmax">
        <thead><tr><th scope="col">Слово</th><th scope="col">Score h · U</th><th scope="col">p, %</th><th scope="col">Цель y</th><th scope="col">p − y</th></tr></thead>
        <tbody>{data.vocabulary.map((word, i) => <tr key={word}><th scope="row">{word}{i === example.target ? ' ← цель' : ''}</th>
          <td>{fmt(trace.scores[i], 4)}</td><td>{fmt(trace.probabilities[i] * 100, 2)}</td><td>{Number(i === example.target)}</td><td>{fmt(trace.probabilities[i] - Number(i === example.target), 4)}</td></tr>)}</tbody>
      </Table>}
      <details><summary>Формулы и градиенты обеих таблиц</summary>
        <p className="formula">{cbow ? 'h = (Σᵢ E[inputᵢ]) / m, где m — число соседних позиций.' : 'h = E[центр].'}<br />
          {sampled ? 'L = −ln σ(h·U[target]) − Σₙ ln σ(−h·U[negativeₙ]).' : 'pⱼ = exp(h·U[j]) / Σₖ exp(h·U[k]); L = −ln p[target].'}<br />
          {sampled ? 'Для каждой выбранной пары r = σ(score) − y.' : 'rⱼ = pⱼ − 1[j = target].'}<br />
          ∂L/∂h = Σ rⱼ U[j]; ∂L/∂U[j] = rⱼ h; θ ← θ − η ∂L/∂θ.</p>
        <p>{cbow ? 'Каждая входная позиция получает (∂L/∂h)/m; для повторного слова вклады суммируются в одной строке E.'
          : 'В таблице E градиент получает только строка центрального слова.'}
          {' '}{sampled ? 'В U обновляются только цель и выбранные отрицательные слова.' : 'В U градиент получают все строки словаря.'}
          {' '}Обе таблицы обновляются по одним и тем же весам до шага.</p>
        <Table title="Текущие параметры и градиенты"><thead><tr><th scope="col">Слово</th><th scope="col">E</th><th scope="col">∂L/∂E</th><th scope="col">U</th><th scope="col">∂L/∂U</th></tr></thead>
          <tbody>{data.vocabulary.map((word, i) => <tr key={word}><th scope="row">{word}</th><td>{vector(run.model.input[i])}</td><td>{vector(trace.inputGradients[i])}</td><td>{vector(run.model.output[i])}</td><td>{vector(trace.outputGradient[i])}</td></tr>)}</tbody>
        </Table>
      </details>
    </section>

    <section className="panel"><h2>4. Что выучили векторы?</h2>
      <p>На графике — две настоящие координаты входной таблицы E, без проекции. Отдельные оси не имеют заданного смысла.
        Выбранное ниже слово выделено тёмной точкой; точные координаты доступны в таблице.</p>
      <Chart xLabel="E₁, безразмерная координата" yLabel="E₂, безразмерная координата" series={data.vocabulary.map((word, i) => ({
        name: word, points: [{ x: run.model.input[i][0], y: run.model.input[i][1] }], color: i === wordIndex ? '#163b46' : undefined,
      }))} />
      <label>Слово для сравнения<select value={wordIndex} onChange={event => setWordIndex(Number(event.target.value))}>
        {data.vocabulary.map((word, i) => <option key={word} value={i}>{word}</option>)}
      </select></label>
      <p>Входной вектор «{data.vocabulary[wordIndex]}»: {vector(initial.input[wordIndex])} → {vector(run.model.input[wordIndex])}.
        Ближайшее по косинусу другое слово сейчас: <strong>{neighbors[0].word}</strong>.</p>
      <Table title={`Сходство входных векторов с «${data.vocabulary[wordIndex]}»`}>
        <thead><tr><th scope="col">Слово</th><th scope="col">E до обучения</th><th scope="col">E сейчас</th><th scope="col">Косинус</th></tr></thead>
        <tbody>{neighbors.map(({ word, id, similarity }) => <tr key={word}><th scope="row">{word}</th><td>{vector(initial.input[id])}</td><td>{vector(run.model.input[id])}</td><td>{fmt(similarity, 4)}</td></tr>)}</tbody>
      </Table>
      <p className="note">Косинус = (a · b) / (‖a‖ ‖b‖). Ближе к 1 — направления более похожи.
        Это не вероятность и не доказательство, что слова — синонимы. Сосед в тексте и ближайший вектор — разные понятия.</p>
    </section>

    <Exercise question="Новый случай: «ветер несёт листья». Для центра «несёт» и окна 1 какое направление у CBOW?"
      options={['ветер + листья → несёт', 'несёт → ветер и несёт → листья', 'несёт → несёт']} correct={0}
      explanation="CBOW усредняет векторы двух соседей и предсказывает центр. В обратном направлении работают две отдельные пары Skip-gram." />
    <Exercise question="Новый случай: sigmoid дал трём парам оценки 0,8; 0,7; 0,6. Обязательно ли их сумма равна 1?"
      options={['Нет: negative sampling оценивает пары отдельно', 'Да: это softmax по словарю', 'Нужно разделить оценки на число слов']} correct={0}
      explanation="Независимые sigmoid-оценки не нормируются по словарю. Здесь их сумма 2,1; это не ошибка вычисления." />
    <p className="note">Самопроверки дают обратную связь и не записывают самостоятельное освоение в облачный прогресс.</p>
    <section className="panel"><h2>Как это связано с Transformer?</h2>
      <p>У Word2Vec каждому слову соответствует один статический входной вектор E — он одинаков в разных предложениях.
        В <a href="#transformer">Transformer</a> lookup тоже начинает с одной строки, но позиции и attention создают представление, зависящее от окружения.</p>
      <details><summary>Точный охват и границы опыта</summary>
        <p>Обе архитектуры обучаются с обеими целями. CBOW использует среднее векторов соседей, а negative sampling — частоты³ᐟ⁴ и k=1–5.
          Это четыре учебных режима, а не соревнование: разные потери и число примеров не дают прямого сравнения качества по высоте кривой.</p>
        <p>Два синтетических корпуса, d=2, фиксированное окно и порядок примеров, без subsampling и обучения фраз.
          Неизвестные слова не получают вектор. Большой корпус, промышленные аналогии и обобщение на отдельном test-наборе не воспроизводятся.</p>
      </details>
      <p>Первоисточники: <a href="https://arxiv.org/html/1301.3781v3#S3.SS1" target="_blank" rel="noreferrer">Mikolov et al. (2013), CBOW</a>;
        {' '}<a href="https://arxiv.org/html/1310.4546v1#S2" target="_blank" rel="noreferrer">Skip-gram, полный softmax и negative sampling — формулы 1–4</a>.</p>
    </section>
  </section>;
}
