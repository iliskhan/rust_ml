import { useMemo, useState, type ReactNode } from 'react';
import { ConceptLink } from './learning-context';
import { Chart, Exercise, Range, fmt } from './ui';
import { PredictionExperiment } from './PredictionExperiment';
import { WORD2VEC_CORPORA, cosineSimilarity, initialWord2vec, word2vecData, word2vecLoss, word2vecStep, word2vecTrace } from './word2vecMath';
import './word2vec-lab.css';

const MAX_STEPS = 10000;
const vector = (values: readonly number[]) => `[${values.map(value => fmt(value, 4)).join('; ')}]`;
function newRun(data: ReturnType<typeof word2vecData>) {
  const model = initialWord2vec(data.vocabulary.length);
  return { model, steps: 0, history: [{ step: 0, loss: word2vecLoss(model, data.pairs) }] };
}
function Table({ title, children }: { title: string; children: ReactNode }) {
  return <div className="word2vec-table" tabIndex={0} role="region" aria-label={`${title}. Таблица с горизонтальной прокруткой`}>
    <table className="data-table"><caption>{title}</caption>{children}</table>
  </div>;
}

export function Word2vecLab() {
  const [corpusIndex, setCorpusIndex] = useState(0), [windowSize, setWindowSize] = useState(1);
  const corpus = WORD2VEC_CORPORA[corpusIndex];
  const data = useMemo(() => word2vecData(corpus.sentences, windowSize), [corpus, windowSize]);
  const [run, setRun] = useState(() => newRun(data));
  const [rate, setRate] = useState(.1), [pairIndex, setPairIndex] = useState(0), [wordIndex, setWordIndex] = useState(0);
  const [error, setError] = useState('');
  const pair = data.pairs[pairIndex], center = data.vocabulary[pair.center], context = data.vocabulary[pair.context];
  const trace = word2vecTrace(run.model, pair.center, pair.context);
  const initial = initialWord2vec(data.vocabulary.length);
  const loss = useMemo(() => word2vecLoss(run.model, data.pairs), [run.model, data]);
  const neighbors = data.vocabulary.map((word, id) => ({ word, id, similarity: cosineSimilarity(run.model.input[wordIndex], run.model.input[id]) }))
    .filter(item => item.id !== wordIndex).sort((a, b) => b.similarity - a.similarity);

  function restart(nextCorpus = corpusIndex, nextWindow = windowSize) {
    setCorpusIndex(nextCorpus); setWindowSize(nextWindow);
    setRun(newRun(word2vecData(WORD2VEC_CORPORA[nextCorpus].sentences, nextWindow)));
    setPairIndex(0); setWordIndex(0); setError('');
  }
  function train(count: number) {
    const limit = Math.min(count, MAX_STEPS - run.steps), history = [...run.history];
    let model = run.model;
    for (let i = 0; i < limit; i++) {
      model = word2vecStep(model, count === 1 ? pair : data.pairs[(run.steps + i) % data.pairs.length], rate);
      const step = run.steps + i + 1;
      if (step % 50 === 0 || i === limit - 1) history.push({ step, loss: word2vecLoss(model, data.pairs) });
    }
    setRun({ model, steps: run.steps + limit, history });
    return word2vecTrace(model, pair.center, pair.context);
  }
  function trainSafely(count: number) {
    try { train(count); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить шаг. Сбросьте опыт.'); }
  }

  return <section className="word2vec-lab" aria-label="Лаборатория Word2Vec">
    <p className="tc-idea">Откуда берутся числа в таблице embeddings? <strong>Word2Vec</strong> учит их по соседству слов.
      В варианте <strong>Skip-gram</strong> одно центральное слово помогает предсказать каждое слово в его окне контекста.</p>
    <p>Нужны <ConceptLink concept="vector">векторы</ConceptLink>, <ConceptLink concept="dot-product">скалярное произведение</ConceptLink>,
      {' '}<ConceptLink concept="softmax">softmax</ConceptLink> и <ConceptLink concept="gradient">градиент</ConceptLink>.
      Можно сначала посмотреть <a href="#transformer">выбор строки embedding-таблицы</a>, затем вернуться сюда.</p>
    <p className="tc-prompt"><strong>Первый опыт.</strong> Оставьте окно 1, выполните «2000 шагов по корпусу» и сравните ошибку и векторы «кот» и «пёс».
      У них похожие соседи. Сходство векторов отражает этот маленький корпус; это не готовое понимание языка.</p>

    <div className="word2vec-columns">
      <section className="panel"><h2>1. Из текста в пары</h2>
        <label>Учебный корпус<select value={corpusIndex} onChange={event => restart(Number(event.target.value))}>
          {WORD2VEC_CORPORA.map((item, i) => <option key={item.name} value={i}>{item.name}</option>)}
        </select></label>
        <label>Радиус окна контекста<select value={windowSize} onChange={event => restart(corpusIndex, Number(event.target.value))}>
          <option value={1}>1 слово слева и справа</option><option value={2}>2 слова слева и справа</option>
        </select></label>
        <p className="note">Изменение корпуса или окна начинает обучение заново с той же детерминированной инициализации.</p>
        <details><summary>Весь корпус: {data.sentences.length} предложений</summary><ul>{corpus.sentences.map((sentence, i) => <li key={i}>{sentence}</li>)}</ul></details>
        <p>{data.vocabulary.length} слов в словаре, {data.pairs.length} пар с учётом повторов. Окно не пересекает границу предложения.
          Слово не образует пару с самим собой в той же позиции.</p>
        <Range label="Пара для разбора" value={pairIndex} min={0} max={data.pairs.length - 1} step={1} onChange={setPairIndex} />
        <p className="word2vec-sentence" aria-label="Предложение с выбранной парой">{data.sentences[pair.sentence].map((id, position) => <span key={position}
          className={position === pair.position ? 'word2vec-center' : position === pair.contextPosition ? 'word2vec-context' : undefined}>
          {data.vocabulary[id]}{position === pair.position ? ' (центр)' : position === pair.contextPosition ? ' (цель)' : ''}
        </span>)}</p>
        <p className="formula">Пара {pairIndex + 1}: <strong>{center} → {context}</strong></p>
        <p>Каждый сосед даёт отдельную обучающую пару. Центральное слово — вход, сосед — цель. Синонимы вручную не размечены.</p>
      </section>

      <section className="panel"><h2>2. Обучите две таблицы</h2>
        <p>Входная таблица <strong>E</strong> и выходная <strong>U</strong> имеют форму [{data.vocabulary.length}, 2].
          Для «{center}» берём E = {vector(run.model.input[pair.center])}.
          Сравниваем этот вектор с каждой строкой U, затем softmax даёт вероятности соседей.</p>
        <ol className="word2vec-flow"><li>Центр «{center}» → E[центр]</li><li>Scores: E[центр] · U[слово]</li><li>Softmax → p(слово | центр)</li><li>Цель «{context}» → −ln p → градиент → SGD</li></ol>
        <Range label="Скорость обучения η" value={rate} min={.01} max={.2} step={.01} onChange={setRate} />
        <div className="button-row">
          <button type="button" disabled={run.steps >= MAX_STEPS} onClick={() => trainSafely(1)}>1 шаг по выбранной паре</button>
          <button type="button" disabled={run.steps >= MAX_STEPS} onClick={() => trainSafely(200)}>200 шагов по корпусу</button>
          <button type="button" disabled={run.steps >= MAX_STEPS} onClick={() => trainSafely(2000)}>2000 шагов по корпусу</button>
          <button type="button" onClick={() => restart()}>Сбросить обучение</button>
        </div>
        <p role="status" aria-live="polite">Шагов: <strong>{run.steps}/{MAX_STEPS}</strong>. Средняя ошибка на всех парах корпуса:
          {' '}<strong>{fmt(loss, 4)} nat</strong> (в начале {fmt(run.history[0].loss, 4)}).</p>
        {error && <p role="alert">{error} Последнее успешное состояние сохранено.</p>}
        <Chart xLabel="Шаг SGD" yLabel="Средняя cross-entropy на корпусе, nat" xDomain={[0, Math.max(1, run.steps)]}
          series={[{ name: 'Обучающие пары', points: run.history.map(point => ({ x: point.step, y: point.loss })) }]} />
        <p className="note">Кнопки по корпусу перебирают пары по кругу. Один шаг по выбранной паре уменьшает её ошибку при подходящем η,
          но средняя ошибка по всем парам не обязана уменьшаться на каждом шаге. Здесь нет отдельной оценки обобщения.</p>
      </section>
    </div>

    <section className="panel"><h2>3. Проверьте прогноз до шага</h2>
      <p className="formula">p(«{context}» | «{center}») = {fmt(trace.probabilities[pair.context] * 100, 2)}%;
        {' '}L = −ln p = {fmt(trace.loss, 4)} nat.</p>
      <PredictionExperiment key={`${corpusIndex}/${windowSize}`} question={`После одного шага по паре «${center} → ${context}» вероятность цели…`}
        options={['Увеличится', 'Уменьшится', 'Практически не изменится']} disabled={run.steps >= MAX_STEPS}
        run={prediction => {
          const after = train(1), beforeP = trace.probabilities[pair.context], afterP = after.probabilities[pair.context];
          const outcome = Math.abs(afterP - beforeP) < 1e-10 ? 2 : afterP > beforeP ? 0 : 1;
          return { correct: prediction === outcome, before: `p = ${fmt(beforeP * 100, 4)}%; L = ${fmt(trace.loss, 6)} nat`,
            after: `p = ${fmt(afterP * 100, 4)}%; L = ${fmt(after.loss, 6)} nat`,
            explanation: `Выполнен настоящий шаг SGD с η = ${fmt(rate)}. Цель шага — увеличить вероятность «${context}» для центра «${center}».` };
        }} />
      <Table title={`Все кандидаты для центра «${center}»: полный softmax`}>
        <thead><tr><th scope="col">Слово</th><th scope="col">Score E · U</th><th scope="col">p, %</th><th scope="col">Цель y</th><th scope="col">p − y</th></tr></thead>
        <tbody>{data.vocabulary.map((word, i) => <tr key={word}><th scope="row">{word}{i === pair.context ? ' ← цель' : ''}</th>
          <td>{fmt(trace.scores[i], 4)}</td><td>{fmt(trace.probabilities[i] * 100, 2)}</td><td>{Number(i === pair.context)}</td><td>{fmt(trace.probabilities[i] - Number(i === pair.context), 4)}</td></tr>)}</tbody>
      </Table>
      <details><summary>Формулы, градиенты и выходная таблица U</summary>
        <p className="formula">sⱼ = E[c] · U[j]; pⱼ = exp(sⱼ) / Σₖ exp(sₖ); L = −ln pₒ.<br />
          ∂L/∂sⱼ = pⱼ − 1[j = o]; ∂L/∂E[c] = Σⱼ (pⱼ − 1[j = o]) U[j].<br />
          ∂L/∂U[j] = (pⱼ − 1[j = o]) E[c]; θ ← θ − η ∂L/∂θ.</p>
        <p>c — центр, o — наблюдаемый сосед. Градиент выбранной строки E: {vector(trace.inputGradient)}.
          Другие строки E на этом шаге не обновляются. Обе таблицы обновляются по одним и тем же весам до шага.</p>
        <Table title="Выходные векторы U и их градиенты на выбранной паре"><thead><tr><th scope="col">Слово</th><th scope="col">U</th><th scope="col">∂L/∂U</th></tr></thead>
          <tbody>{data.vocabulary.map((word, i) => <tr key={word}><th scope="row">{word}</th><td>{vector(run.model.output[i])}</td><td>{vector(trace.outputGradient[i])}</td></tr>)}</tbody>
        </Table>
      </details>
    </section>

    <section className="panel"><h2>4. Что выучили векторы?</h2>
      <p>На графике — две настоящие координаты входной таблицы E, без проекции. Номер слова и шаг обучения не являются осями пространства.
        Координаты не названы «животное» или «действие»: отдельные оси не имеют заданного смысла.
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
      <p className="note">Косинус = (a · b) / (‖a‖ ‖b‖). Он сравнивает направления: ближе к 1 — более похожие.
        Это не вероятность и не доказательство, что слова — синонимы. Сосед в тексте и ближайший вектор — разные понятия.</p>
    </section>

    <Exercise question="Новый случай: «ветер несёт листья». Для центра «несёт» и окна 1 какие пары создаёт Skip-gram?"
      options={['несёт → ветер и несёт → листья', 'ветер + листья → несёт', 'несёт → несёт']} correct={0}
      explanation="Skip-gram предсказывает каждого соседа по центру. Предсказание центра по окружению — направление CBOW. Центральная позиция не входит в собственное окно." />
    <p className="note">Эта самопроверка даёт обратную связь и не записывает самостоятельное освоение в облачный прогресс.</p>
    <section className="panel"><h2>Как это связано с Transformer?</h2>
      <p>У Word2Vec каждому слову соответствует один статический входной вектор E — он одинаков в разных предложениях.
        В <a href="#transformer">Transformer</a> lookup тоже начинает с одной строки таблицы, но позиции и attention затем создают представление, зависящее от окружения.</p>
      <details><summary>CBOW, negative sampling и границы опыта</summary>
        <p><strong>CBOW</strong> предсказывает центральное слово по векторам окружающих слов. Здесь обучается только Skip-gram.</p>
        <p><strong>Negative sampling</strong> учит отличать наблюдаемую пару от случайных отрицательных примеров, избегая перебора всего словаря.
          Это другая цель: её sigmoid-оценки не являются показанным здесь нормированным распределением по словарю.
          В этой лаборатории используется полный softmax, чтобы видеть все числа.</p>
        <p>Два маленьких синтетических корпуса, два измерения, фиксированное окно и порядок пар, без subsampling и обучения фраз.
          Неизвестные слова не получают вектор. Промышленные Word2Vec, качество аналогий и понимание естественного языка здесь не воспроизводятся.</p>
      </details>
      <p>Первоисточники: <a href="https://arxiv.org/abs/1301.3781" target="_blank" rel="noreferrer">Mikolov et al., Efficient Estimation of Word Representations (2013)</a>;
        {' '}<a href="https://arxiv.org/html/1310.4546v1#S2" target="_blank" rel="noreferrer">The Skip-gram Model — полный softmax, формулы 1–2</a>.</p>
    </section>
  </section>;
}
