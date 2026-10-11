import { useEffect, useRef, useState } from 'react'
import { activate, activationDerivative, linear, mse, bceProbability, bceLogit, sharedGraph, finiteDifference } from './math'
import type { Activation } from './math'
import { Range, Chart, Exercise, fmt } from './ui'
import { AnalyzeNumbers, ConceptLink } from './learning-context'
import { Scene3D } from './ThreeD'
import { functionSurface, neuronHeight, mseHeight } from './lessonSceneMath'
import { LessonOutline, focusLessonSection } from './LessonOutline'
import { ActionExercise } from './ActionExercise'
import { NEURON_PRACTICE_START, MSE_PRACTICE_START, BACKPROP_PRACTICE_START, checkNeuronPractice, checkMsePractice, checkBackpropPractice } from './actionExerciseMath'

const activationNames: Record<Activation, string> = { relu: 'ReLU', sigmoid: 'Сигмоида', tanh: 'tanh' }

export function NeuronLesson() {
  const [sceneOpened, setSceneOpened] = useState(false)
  const [x1, setX1] = useState(1)
  const [x2, setX2] = useState(2)
  const [w1, setW1] = useState(0.8)
  const [w2, setW2] = useState(-0.4)
  const [bias, setBias] = useState(0.5)
  const [kind, setKind] = useState<Activation>('relu')
  const z = x1 * w1 + x2 * w2 + bias
  const output = activate(z, kind)
  const derivative = activationDerivative(z, kind)
  const samples = Array.from({ length: 121 }, (_, i) => -6 + i / 10)
  const batch = [[x1, x2], [-1, 0.5]]
  const weights = [[w1, w2], [0.5, -1]]
  const batchZ = linear(batch, weights, [bias, 0.25])

  return <>
    <p className="lesson-intro">Нейрон объединяет признаки: умножает каждый вход на вес, прибавляет смещение и применяет активацию. Вес задаёт влияние признака; смещение сдвигает границу реакции.</p>
    <p className="note">Входы образуют <ConceptLink concept="vector">вектор</ConceptLink>. Взвешенная сумма — это <ConceptLink concept="dot-product">скалярное произведение</ConceptLink>, а чувствительность выхода описывает <ConceptLink concept="derivative">производная</ConceptLink>.</p>
    <LessonOutline items={[{ id: 'neuron-controls', label: 'Собрать нейрон' }, { id: 'neuron-result', label: 'Разобрать результат' }, { id: 'neuron-activation', label: 'Активация и наклон' }, { id: 'neuron-batch', label: 'Пакет и слой' }]} />
    <div className="lab-grid">
      <section className="panel">
        <h3 id="neuron-controls" className="lesson-anchor" tabIndex={-1}>Соберите один нейрон</h3>
        <div className="controls">
          <Range label="Вход x₁" value={x1} min={-3} max={3} step={0.1} onChange={setX1} />
          <Range label="Вход x₂" value={x2} min={-3} max={3} step={0.1} onChange={setX2} />
          <Range label="Вес w₁" value={w1} min={-2} max={2} step={0.1} onChange={setW1} />
          <Range label="Вес w₂" value={w2} min={-2} max={2} step={0.1} onChange={setW2} />
          <Range label="Смещение b" value={bias} min={-2} max={2} step={0.1} onChange={setBias} />
          <label>Активация <select value={kind} onChange={event => setKind(event.target.value as Activation)}>
            <option value="relu">ReLU — оставить положительную часть</option>
            <option value="sigmoid">Сигмоида — выход от 0 до 1</option>
            <option value="tanh">tanh — выход от −1 до 1</option>
          </select></label>
        </div>
        <div className="neuron-live-result"><p>Сейчас: z = <strong>{fmt(z)}</strong> → a = <strong>{fmt(output)}</strong></p><button type="button" onClick={() => focusLessonSection('neuron-result')}>К подробному расчёту ↓</button></div>
      </section>
      <section className="panel">
        <h3 id="neuron-result" className="lesson-anchor" tabIndex={-1}>Из входов в выход</h3>
        <div className="formula">z = x₁w₁ + x₂w₂ + b<br />z = ({fmt(x1)})·({fmt(w1)}) + ({fmt(x2)})·({fmt(w2)}) + ({fmt(bias)}) = {fmt(z)}</div>
        <table className="data-table"><caption>Вклад каждого входа до активации</caption><thead><tr><th scope="col">Операция</th><th scope="col">Значение</th></tr></thead><tbody>
          <tr><th scope="row">x₁ · w₁</th><td>{fmt(x1 * w1)}</td></tr>
          <tr><th scope="row">x₂ · w₂</th><td>{fmt(x2 * w2)}</td></tr>
          <tr><th scope="row">Сумма произведений</th><td>{fmt(x1 * w1 + x2 * w2)}</td></tr>
          <tr><th scope="row">Сумма + смещение: z</th><td>{fmt(z)}</td></tr>
        </tbody></table>
        <p className="result">a = {activationNames[kind]}({fmt(z)}) = <strong>{fmt(output)}</strong></p>
        <AnalyzeNumbers snapshot={{ kind: 'dot-product', origin: 'Нейрон и слои', detail: `Один нейрон: входы → взвешенная сумма → ${activationNames[kind]}`, inputs: [x1, x2], weights: [w1, w2], bias, activation: kind }} />
        <p className="note">Локальная производная da/dz = {fmt(derivative)}: насколько изменится выход при малом изменении z.</p>
      </section>
    </div>
    <ActionExercise title="Включите ReLU одним смещением"
      goal="Изменяя только b, получите выход a > 0. Сохраните входы, веса и ReLU из начальных условий."
      startingConditions="x₁ = 1, x₂ = 2, w₁ = 1, w₂ = −1, b = 0; активация ReLU. Начальный выход a = 0."
      hint="Сумма без смещения равна 1·1 + 2·(−1) = −1. Выход станет положительным, когда −1 + b > 0."
      onStart={() => { const start = NEURON_PRACTICE_START; setX1(start.x1); setX2(start.x2); setW1(start.w1); setW2(start.w2); setBias(start.bias); setKind(start.kind) }}
      check={() => checkNeuronPractice({ x1, x2, w1, w2, bias, kind })}
      stateKey={JSON.stringify([x1, x2, w1, w2, bias, kind])} />
    <details className="panel" onToggle={event => { if (event.currentTarget.open) setSceneOpened(true); }}><summary>3D: два входа и высота ответа нейрона</summary>
      <p>Выберите место по двум входам. Высота показывает, что ответит нейрон именно там. Меняйте веса и смещение выше: наклон и граница реакции меняются. ReLU делает сгиб, а sigmoid и tanh плавно выходят на плато.</p>
      {sceneOpened && <Scene3D title="Поверхность ответа одного нейрона" description="Каждая точка имеет координаты x₁, x₂ и вычисленный выход a=activation(w₁x₁+w₂x₂+b). Третья ось — выход, а не новый вход." axes={[{label:'Вход x₁',min:-3,max:3},{label:'Вход x₂',min:-3,max:3},{label:'Выход a',min:kind==='tanh'?-1:0,max:kind==='relu'?Math.max(1,3*Math.abs(w1)+3*Math.abs(w2)+bias):1}]} surfaces={[{name:activationNames[kind],rows:functionSurface([-3,3],[-3,3],(a,b)=>neuronHeight(a,b,w1,w2,bias,kind))}]} points={[{name:'Текущие входы',position:[x1,x2,output]}]} />}
      <p className="note">Рядом остаются точные числа и плоский график активации. <ConceptLink concept="derivative">Производная</ConceptLink> объясняет местный наклон, а <ConceptLink concept="gradient">градиент</ConceptLink> собирает наклоны по обоим входам.</p>
    </details>
    <section className="panel">
      <h3 id="neuron-activation" className="lesson-anchor" tabIndex={-1}>Форма активации и её наклон</h3>
      <Chart series={[
        { name: `${activationNames[kind]}(z)`, points: samples.map(x => ({ x, y: activate(x, kind) })), color: '#0e9b8a' },
        { name: 'Производная da/dz', points: samples.map(x => ({ x, y: activationDerivative(x, kind) })), color: '#e89337', dashed: true },
        ...(z >= -6 && z <= 6 ? [{ name: 'Текущий выход', points: [{ x: z, y: output }], color: '#6974ec' }] : []),
      ]} xLabel="Взвешенная сумма z" yLabel="Выход / производная" xDomain={[-6, 6]} />
      {Math.abs(z) > 6 && <p className="note">Текущий z = {fmt(z)} за границами графика; расчёт выше учитывает его полностью.</p>}
      <details><summary>Формулы активаций и производных</summary>
        <p>ReLU(z) = max(0, z). Производная равна 1 при z &gt; 0 и 0 при z &lt; 0. В нуле она не определена; здесь, как часто в автодифференцировании, выбрана 0.</p>
        <p>Сигмоида σ(z) = 1 / (1 + exp(−z)); σ′(z) = σ(z)(1 − σ(z)). tanh′(z) = 1 − tanh²(z). exp — экспонента. У сигмоиды и tanh большие по модулю входы дают маленькие производные.</p>
      </details>
    </section>
    <section className="panel">
      <h3 id="neuron-batch" className="lesson-anchor" tabIndex={-1}>Тот же расчёт для пакета и двух нейронов</h3>
      <p>Пакет (batch) — несколько примеров, обработанных вместе. Строки X — примеры; строки W — нейроны. Второй пример и второй нейрон фиксированы, первый использует ползунки.</p>
      <div className="formula">X = [[{fmt(x1)}; {fmt(x2)}]; [−1; 0,5]]<br />W = [[{fmt(w1)}; {fmt(w2)}]; [0,5; −1]]<br />b = [{fmt(bias)}; 0,25]<br />Z = X · Wᵀ + b → A = {activationNames[kind]}(Z)</div>
      <table className="data-table"><caption>Матрица выхода 2 × 2: активация применяется к каждому элементу</caption><thead><tr><th scope="col">Пример</th><th scope="col">Нейрон 1: z → a</th><th scope="col">Нейрон 2: z → a</th></tr></thead><tbody>
        {batchZ.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th>{row.map((value, j) => <td key={j}>{fmt(value)} → {fmt(activate(value, kind))}</td>)}</tr>)}
      </tbody></table>
      <details><summary>Почему W транспонирована?</summary><p>У X размер [пакет, входы], у W — [выходы, входы]. Транспонирование Wᵀ меняет строки и столбцы, поэтому [2, 2] · [2, 2] даёт [пакет, выходы]. b прибавляется к каждой строке. Это соглашение о хранении весов нужно проверять при работе с API.</p></details>
    </section>
    <Exercise question="При z = −2 какой выход даёт ReLU?" options={['−2', '0', '2']} correct={1} explanation="ReLU оставляет положительную часть: max(0, −2) = 0. На отрицательной стороне её производная тоже равна 0." />
  </>
}

export function LossLesson() {
  const [sceneOpened, setSceneOpened] = useState(false)
  const [predictions, setPredictions] = useState([0.5, 2.5, 2])
  const [mode, setMode] = useState<'probability' | 'logit'>('probability')
  const [probability, setProbability] = useState(0.7)
  const [logit, setLogit] = useState(1)
  const [target, setTarget] = useState(1)
  const targets = [1, 2, 3]
  const squared = mse(predictions, targets)
  const p = mode === 'probability' ? probability : activate(logit, 'sigmoid')
  const binary = mode === 'probability' ? bceProbability(p, target) : bceLogit(logit, target)
  const binarySamples = mode === 'probability'
    ? Array.from({ length: 99 }, (_, i) => (i + 1) / 100)
    : Array.from({ length: 161 }, (_, i) => -20 + i / 4)

  return <>
    <p className="lesson-intro"><ConceptLink concept="loss">Функция потерь</ConceptLink> превращает ошибку предсказания в число для оптимизации. Она должна соответствовать задаче: средняя квадратичная ошибка для чисел, бинарная <ConceptLink concept="cross-entropy">кросс-энтропия</ConceptLink> для класса 0 или 1.</p>
    <div className="lab-grid">
      <section className="panel">
        <h3>MSE: насколько промахнулись числа</h3>
        <p>Средняя квадратичная ошибка (mean squared error, MSE) усредняет квадраты отклонений. Цели y = [1; 2; 3].</p>
        <div className="controls">{predictions.map((value, i) => <Range key={i} label={`Предсказание ŷ${i + 1}, цель ${targets[i]}`} value={value} min={-1} max={5} step={0.1} onChange={next => setPredictions(current => current.map((item, index) => index === i ? next : item))} />)}</div>
        <div className="formula">L = (1/3) Σ(ŷᵢ − yᵢ)²<br />L = ({squared.terms.map(term => fmt(term)).join(' + ')}) / 3 = {fmt(squared.loss)}</div>
        <table className="data-table"><caption>Каждый вклад и градиент по предсказанию</caption><thead><tr><th scope="col">i</th><th scope="col">ŷ − y</th><th scope="col">(ŷ − y)²</th><th scope="col">∂L/∂ŷ</th></tr></thead><tbody>
          {predictions.map((value, i) => <tr key={i}><th scope="row">{i + 1}</th><td>{fmt(value - targets[i])}</td><td>{fmt(squared.terms[i])}</td><td>{fmt(squared.grad[i])}</td></tr>)}
        </tbody></table>
        <details><summary>Что означает знак градиента?</summary><p><ConceptLink concept="gradient">Градиент</ConceptLink> — набор <ConceptLink concept="partial-derivative">частных производных</ConceptLink> функции по её входам. Здесь ∂L/∂ŷᵢ = 2(ŷᵢ − yᵢ)/3. Шаг ŷᵢ ← ŷᵢ − η·∂L/∂ŷᵢ при небольшом η приближает предсказание к цели. В сети обычно меняют веса, а градиент по предсказанию передают дальше назад.</p></details>
      </section>
      <section className="panel">
        <h3>Предсказания рядом с целями</h3>
        <Chart series={[
          { name: 'Цель y', points: targets.map((y, i) => ({ x: i + 1, y })), color: '#0e9b8a', dashed: true },
          { name: 'Предсказание ŷ', points: predictions.map((y, i) => ({ x: i + 1, y })), color: '#6974ec' },
        ]} xLabel="Номер примера" yLabel="Значение" xDomain={[1, 3]} yDomain={[-1, 5]} />
        <p className="result">MSE = <strong>{fmt(squared.loss)}</strong></p>
        <p className="note">Большой промах штрафуется сильнее: ошибка 2 даёт квадрат 4, ошибка 1 — квадрат 1. Линии соединяют только три показанных примера.</p>
      </section>
    </div>
    <ActionExercise title="Снизьте MSE одним предсказанием"
      goal="Измените только ŷ₃, чтобы MSE стала меньше 0,2. Сохраните ŷ₁ = 0,5 и ŷ₂ = 2,5."
      startingConditions="ŷ = [0,5; 2,5; 2], цели y = [1; 2; 3]. Начальная MSE = 0,5."
      hint="У первых двух предсказаний квадраты ошибок по 0,25. Чтобы их сумма вместе с третьим вкладом была меньше 0,6, третий квадрат ошибки должен стать меньше 0,1."
      onStart={() => setPredictions([...MSE_PRACTICE_START])}
      check={() => checkMsePractice(predictions)} stateKey={JSON.stringify(predictions)} />
    <details className="panel" onToggle={event => { if (event.currentTarget.open) setSceneOpened(true); }}><summary>3D: чаша MSE для двух предсказаний</summary>
      <p>Двигаем первые два предсказания, третье удерживаем на его текущем значении. Внизу чаши первые два попали в цели 1 и 2. Если третье всё ещё ошибается, высота внизу останется больше нуля.</p>
      {sceneOpened && <Scene3D title="Срез MSE по двум предсказаниям" description="Высота ((ŷ₁−1)²+(ŷ₂−2)²+(ŷ₃−3)²)/3. ŷ₃ берётся из ползунка выше и фиксируется во всём срезе. Это два предсказания и потеря, не поверхность всех весов сети." axes={[{label:'Предсказание ŷ₁',min:-1,max:5},{label:'Предсказание ŷ₂',min:-1,max:5},{label:'MSE',min:0,max:mseHeight(5,-1,predictions[2])}]} surfaces={[{name:'MSE · третье предсказание фиксировано',rows:functionSurface([-1,5],[-1,5],(a,b)=>mseHeight(a,b,predictions[2]))}]} points={[{name:'Текущие предсказания',position:[predictions[0],predictions[1],squared.loss]},{name:'Минимум этого среза',position:[1,2,mseHeight(1,2,predictions[2])]}]} />}
      <p className="note">Минимальная высота этого среза: {fmt(mseHeight(1,2,predictions[2]))}. Ползунки и таблица выше позволяют проверить числа без 3D.</p>
    </details>
    <section className="panel">
      <h3>BCE: насколько уверенно выбран класс</h3>
      <p>Бинарная кросс-энтропия (binary cross-entropy, BCE) сравнивает вероятность класса 1 с меткой y. Логит — любое вещественное число до сигмоиды; вероятность получается как p = σ(z).</p>
      <div className="button-row" role="group" aria-label="Формат входа BCE">
        <button type="button" aria-pressed={mode === 'probability'} onClick={() => setMode('probability')}>Вероятность p</button>
        <button type="button" aria-pressed={mode === 'logit'} onClick={() => setMode('logit')}>Логит z</button>
      </div>
      <div className="lab-grid">
        <div>
          <div className="controls">
            {mode === 'probability'
              ? <Range label="Вероятность класса 1: p" value={probability} min={0.01} max={0.99} step={0.01} onChange={setProbability} />
              : <Range label="Логит z (до сигмоиды)" value={logit} min={-20} max={20} step={0.25} onChange={setLogit} />}
            <label>Истинный класс y <select value={target} onChange={event => setTarget(Number(event.target.value))}><option value={0}>0</option><option value={1}>1</option></select></label>
          </div>
          <div className="formula">{mode === 'probability'
            ? <>L = −[y·ln(p) + (1 − y)·ln(1 − p)]<br />L = −[{target}·ln({fmt(p, 4)}) + {1 - target}·ln({fmt(1 - p, 4)})] = {fmt(binary.loss, 4)}<br />∂L/∂p = (p − y) / [p(1 − p)] = {fmt(binary.grad, 4)}</>
            : <>L = max(z, 0) − zy + ln(1 + exp(−|z|))<br />L = max({fmt(logit)}, 0) − ({fmt(logit)})·{target} + ln(1 + exp(−{fmt(Math.abs(logit))})) = {fmt(binary.loss, 4)}<br />∂L/∂z = σ(z) − y = {fmt(binary.grad, 6)}</>}
          </div>
          <p className="result">p = {fmt(p, 6)} · BCE = <strong>{fmt(binary.loss, 6)}</strong></p>
          <p className="note">Класс при пороге 0.5: {p >= 0.5 ? 1 : 0} · {Number(p >= 0.5) === target ? 'предсказан верно' : 'ошибка класса'}. Потеря учитывает уверенность даже при верном классе.</p>
        </div>
        <div><Chart series={[
          { name: `BCE при y = ${target}`, points: binarySamples.map(x => ({ x, y: mode === 'probability' ? bceProbability(x, target).loss : bceLogit(x, target).loss })), color: '#6974ec' },
          { name: 'Текущая потеря', points: [{ x: mode === 'probability' ? p : logit, y: binary.loss }], color: '#e89337' },
        ]} xLabel={mode === 'probability' ? 'Вероятность p' : 'Логит z'} yLabel="Потеря L" /></div>
      </div>
      <details><summary>Область определения, устойчивость и точность</summary>
        <p>ln — натуральный <ConceptLink concept="logarithm">логарифм</ConceptLink>. Формула через <ConceptLink concept="probability">вероятности</ConceptLink> требует 0 &lt; p &lt; 1: ln(0) не является конечным числом. Поэтому ползунок оставляет 0.01…0.99. Формула через логит не вычисляет логарифм округлённой вероятности: exp(−|z|) не переполняется, а log1p сохраняет точность ln(1 + маленькое число).</p>
        <p>Не применяйте сигмоиду перед BCE, которая уже принимает логиты. Производная по p отличается от производной по z: правило цепочки даёт ∂L/∂z = (∂L/∂p)·p(1 − p) = p − y.</p>
        <p>Точность классификации (accuracy) — доля верных классов при выбранном пороге. Для y = 1 вероятности 0.51 и 0.99 обе дают правильный класс, но BCE ≈ 0.673 и 0.010. По одному верному классу нельзя заключить, что сеть уверенно обучилась.</p>
      </details>
    </section>
    <Exercise question="Почему BCE от логита удобна при большом |z|?" options={['Она всегда равна accuracy', 'Она считает устойчивую формулу без ln округлённой вероятности', 'Она не зависит от истинного класса']} correct={1} explanation="Формула через логит избегает ln(0) из-за округления сигмоиды. Она всё равно зависит от метки и уверенности предсказания." />
  </>
}

export function BackpropLesson() {
  const [x, setX] = useState(1.2)
  const [w, setW] = useState(0.8)
  const [target, setTarget] = useState(1)
  const [step, setStep] = useState(0)
  const [epsilonPower, setEpsilonPower] = useState(-5)
  const graphRef = useRef<HTMLDivElement>(null)
  const [graphWidth, setGraphWidth] = useState(300)
  useEffect(() => {
    const element = graphRef.current
    if (!element) return
    const observer = new ResizeObserver(entries => setGraphWidth(entries[0].contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const vertical = graphWidth < 500
  const graphHeight = vertical ? 346 : 260
  const center = graphWidth / 2
  const nodes = vertical
    ? [
      { x: center, y: 30, label: 'x · w' }, { x: center, y: 100, label: 'q' },
      { x: graphWidth * 0.25, y: 173, label: 'q²' }, { x: graphWidth * 0.75, y: 173, label: 'q' },
      { x: center, y: 246, label: 'p: сумма' }, { x: center, y: 316, label: 'L' },
    ]
    : [
      { x: graphWidth * 0.075, y: 115, label: 'x · w' }, { x: graphWidth * 0.305, y: 115, label: 'q' },
      { x: graphWidth * 0.505, y: 57, label: 'q²' }, { x: graphWidth * 0.505, y: 178, label: 'q' },
      { x: graphWidth * 0.705, y: 117, label: 'p: сумма' }, { x: graphWidth * 0.915, y: 117, label: 'L' },
    ]
  const edges = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]]
  const graph = sharedGraph(x, w, target)
  const { q, p, loss } = graph.values
  const gradients = graph.gradients
  const parts = graph.qContributions
  const epsilon = 10 ** epsilonPower
  const numerical = finiteDifference(params => sharedGraph(params[0], params[1], target).values.loss, [x, w], epsilon)
  const steps = ['Прямой проход', 'Локальные производные', 'Назад: две ветви к q', 'Сумма вкладов и градиенты весов']
  function resetOnChange(setter: (value: number) => void, value: number) { setter(value); setStep(0) }

  return <>
    <p className="lesson-intro"><ConceptLink concept="backpropagation">Обратное распространение</ConceptLink> вычисляет влияние каждого параметра на потерю. Если значение используется в двух ветвях, его <ConceptLink concept="gradient">градиент</ConceptLink> складывается из обоих путей — это ключ к правильному автодифференцированию.</p>
    <p className="note">Основа вычисления — <ConceptLink concept="chain-rule">правило цепочки</ConceptLink>. Внутри его разбора можно изучить производную, а затем вернуться к текущему шагу графа.</p>
    <div className="lab-grid">
      <section className="panel">
        <h3>Один промежуточный узел, два пути</h3>
        <div className="controls">
          <Range label="Вход x" value={x} min={-2} max={2} step={0.1} onChange={value => resetOnChange(setX, value)} />
          <Range label="Вес w" value={w} min={-2} max={2} step={0.1} onChange={value => resetOnChange(setW, value)} />
          <Range label="Цель y" value={target} min={-2} max={4} step={0.1} onChange={value => resetOnChange(setTarget, value)} />
        </div>
        <div className="formula">q = xw = ({fmt(x)})·({fmt(w)}) = {fmt(q)}<br />p = q² + q = {fmt(q * q)} + ({fmt(q)}) = {fmt(p)}<br />L = ½(p − y)² = ½({fmt(p)} − ({fmt(target)}))² = {fmt(loss)}</div>
        <p className="note">q — общий узел графа, p — предсказание, y — цель. Здесь потеря с коэффициентом ½: он сокращает двойку в производной квадрата.</p>
      </section>
      <section className="panel">
        <h3>Граф вычисления</h3>
        <div ref={graphRef} style={{ width: '100%', minWidth: 0 }}>
        <svg className="chart" viewBox={`0 0 ${graphWidth} ${graphHeight}`} width={graphWidth} height={graphHeight} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Вход x и вес w образуют q. От q идут две ветви: q в квадрате и q без изменения. Их сумма p сравнивается с целью в потере L.">
          <defs><marker id="backprop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>
          <g fill="none" stroke="currentColor" strokeWidth="1.6" markerEnd="url(#backprop-arrow)">
            {edges.map(([from, to]) => {
              const start = nodes[from], end = nodes[to]
              const dx = end.x - start.x, dy = end.y - start.y
              const boundary = Math.min(38 / Math.abs(dx), 22 / Math.abs(dy))
              return <path key={`${from}-${to}`} d={`M ${start.x + dx * boundary} ${start.y + dy * boundary} L ${end.x - dx * boundary} ${end.y - dy * boundary}`} />
            })}
          </g>
          <g fill="var(--panel, #ffffff)" stroke="currentColor">
            {nodes.map((node, i) => <rect key={i} x={node.x - 38} y={node.y - 22} width="76" height="44" rx="12" />)}
          </g>
          <g fill="currentColor" textAnchor="middle" fontSize="12">{nodes.map((node, i) => <text key={i} x={node.x} y={node.y + 4}>{node.label}</text>)}</g>
          <g fill="currentColor" textAnchor="middle" fontSize="12"><text x={nodes[2].x} y={vertical ? 209 : 104}>{vertical ? 'квадрат' : 'ветвь квадрата'}</text><text x={nodes[3].x} y={vertical ? 209 : 225}>{vertical ? 'тождество' : 'ветвь тождества'}</text></g>
        </svg>
        </div>
        <p className="note">Оба прямоугольника справа от q используют одно и то же значение. Это ориентированный ациклический граф (DAG): стрелки не образуют цикл.</p>
      </section>
    </div>
    <section className="panel">
      <h3>Пройдите вычисление по шагам</h3>
      <div className="button-row">
        <button type="button" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>← Назад</button>
        <button type="button" onClick={() => setStep(Math.min(3, step + 1))} disabled={step === 3}>Следующий шаг →</button>
        <button type="button" onClick={() => setStep(0)}>Сначала</button>
      </div>
      <p className="result" aria-live="polite">Шаг {step + 1} из 4 · <strong>{steps[step]}</strong></p>
      <ol>{steps.map((label, i) => <li key={label}>{label} {i === step ? '— сейчас' : i < step ? '— пройден' : '— впереди'}</li>)}</ol>
      {step === 0 && <div className="formula">x,w → q = {fmt(q)} → (q² = {fmt(q * q)}, q = {fmt(q)}) → p = {fmt(p)} → L = {fmt(loss)}</div>}
      {step >= 1 && <div className="formula">∂L/∂p = p − y = {fmt(gradients.p)}<br />∂(q²)/∂q = 2q = {fmt(2 * q)}; ∂q/∂q = 1<br />∂q/∂x = w = {fmt(w)}; ∂q/∂w = x = {fmt(x)}</div>}
      {step >= 2 && <table className="data-table"><caption>Вклады в градиент общего q</caption><thead><tr><th scope="col">Путь</th><th scope="col">Правило цепочки</th><th scope="col">Вклад</th></tr></thead><tbody>
        <tr><th scope="row">L → p → q² → q</th><td>({fmt(gradients.p)}) · ({fmt(2 * q)})</td><td>{fmt(parts.square)}</td></tr>
        <tr><th scope="row">L → p → q → q</th><td>({fmt(gradients.p)}) · 1</td><td>{fmt(parts.identity)}</td></tr>
      </tbody></table>}
      {step === 3 && <div className="formula">∂L/∂q = вклад квадрата + вклад тождества<br />= {fmt(parts.square)} + ({fmt(parts.identity)}) = {fmt(gradients.q)}<br />∂L/∂w = (∂L/∂q)·x = ({fmt(gradients.q)})·({fmt(x)}) = {fmt(gradients.w)}<br />∂L/∂x = (∂L/∂q)·w = ({fmt(gradients.q)})·({fmt(w)}) = {fmt(gradients.x)}</div>}
      <details><summary>Почему складываем, а не перезаписываем?</summary><p>Для суммы p = u + v обе локальные производные равны 1. Изменение q меняет и u = q², и v = q. Правило цепочки для двух путей даёт dL/dq = (dL/dp)·(2q + 1). Если записать последний вклад вместо накопления, одна ветвь исчезнет и вычисление станет неверным.</p><p>Обратный проход начинается с ∂L/∂L = 1 и идёт от результата к входам. До передачи градиента дальше все зависимые узлы должны внести свой вклад.</p></details>
    </section>
    <ActionExercise title="Уменьшите потерю и разберите оба пути"
      goal="Подберите только вес w так, чтобы L < 0,05 при x = 1,2 и y = 1. После изменения веса дойдите до шага 4 разбора графа."
      startingConditions="x = 1,2, w = 0,8, y = 1 и шаг 1. Начальная L ≈ 0,3886."
      hint="В начальной точке ∂L/∂w ≈ 3,0891 > 0: небольшой шаг против градиента уменьшает w. Затем используйте «Следующий шаг», чтобы увидеть сумму двух вкладов."
      onStart={() => { const start = BACKPROP_PRACTICE_START; setX(start.x); setW(start.w); setTarget(start.target); setStep(start.step) }}
      check={() => checkBackpropPractice({ x, w, target, step })} stateKey={JSON.stringify([x, w, target, step])} />
    <section className="panel">
      <h3>Проверка конечной разностью</h3>
      <p>Независимо оценим наклон: немного увеличим и уменьшим параметр, каждый раз пересчитаем весь прямой проход. Остальные параметры остаются фиксированными.</p>
      <Range label="Показатель ε в 10ⁿ" value={epsilonPower} min={-6} max={-1} step={1} onChange={setEpsilonPower} />
      <div className="formula">ε = {epsilon.toExponential(0)}<br />∂L/∂θ ≈ [L(θ + ε) − L(θ − ε)] / (2ε)</div>
      <table className="data-table"><caption>Аналитический и численный градиенты</caption><thead><tr><th scope="col">Параметр θ</th><th scope="col">Обратный проход</th><th scope="col">Конечная разность</th><th scope="col">Абсолютная разница</th></tr></thead><tbody>
        {(['x', 'w'] as const).map((key, i) => <tr key={key}><th scope="row">{key}</th><td>{fmt(gradients[key], 6)}</td><td>{fmt(numerical[i], 6)}</td><td>{Math.abs(gradients[key] - numerical[i]).toExponential(2)}</td></tr>)}
      </tbody></table>
      <p className="note">Маленькая разница подтверждает градиент в этой точке. Большое ε искажает наклон, слишком маленькое усиливает округление. Нулевой градиент в особой точке сам по себе не проверяет все ветви — сравните несколько x и w.</p>
    </section>
    <Exercise question="У q две исходящие ветви. Что делать с градиентами, пришедшими назад?" options={['Оставить последний', 'Сложить вклады обеих ветвей', 'Всегда перемножить вклады']} correct={1} explanation="Градиенты складываются в общем узле. Для p = q² + q получаем ∂L/∂q = (p − y)·(2q + 1)." />
  </>
}
