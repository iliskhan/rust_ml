import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ActionExercise } from './ActionExercise';
import { useLearningActive } from './learning-context';
import { Chart, Range, fmt } from './ui';
import {
  CNN_TRAINING_INPUT, CNN_TRAINING_TARGET, cnnLossGradient, cnnSgdStep,
  copyCnnMatrix, createCnnParameters, checkCnnTrainingPractice, type CnnParameters,
} from './cnnTrainingMath';
import './cnn-training-lab.css';

function CnnMatrix({ values, label, selected, marked, onSelect }: {
  values: number[][]; label: string; selected?: [number, number];
  marked?: (row: number, column: number) => boolean; onSelect?: (row: number, column: number) => void;
}) {
  return <div className="cnn-training-scroll" tabIndex={0} role="region" aria-label={`${label}. Прокручиваемая численная таблица`}>
    <table className="data-table cnn-training-matrix">
      <caption>{label}</caption>
      <thead><tr><th scope="col">r / c</th>{values[0].map((_, column) => <th key={column} scope="col">{column + 1}</th>)}</tr></thead>
      <tbody>{values.map((row, r) => <tr key={r}><th scope="row">{r + 1}</th>{row.map((value, c) => {
        const active = selected?.[0] === r && selected[1] === c, inField = marked?.(r, c);
        return <td key={c} className={inField ? 'cnn-in-field' : undefined}>
          {onSelect ? <button type="button" aria-pressed={active} aria-label={`${label}, строка ${r + 1}, столбец ${c + 1}: ${fmt(value, 4)}`} onClick={() => onSelect(r, c)}>{fmt(value, 3)}</button> : <>{fmt(value, 3)}{inField && ' ◂'}</>}
        </td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}

type SgdSnapshot = ReturnType<typeof cnnSgdStep> & { previousParameters: CnnParameters; learningRate: number; step: number };
function initialState() {
  const input = copyCnnMatrix(CNN_TRAINING_INPUT), parameters = createCnnParameters();
  return { input, parameters, steps: 0, history: [{ x: 0, y: cnnLossGradient(input, CNN_TRAINING_TARGET, parameters).loss }], last: null as SgdSnapshot | null };
}

export function CnnTrainingLab() {
  const id = useId(), active = useLearningActive();
  const [state, setState] = useState(initialState);
  const [learningRate, setLearningRate] = useState(0.05), [scan, setScan] = useState(0);
  const [weightIndex, setWeightIndex] = useState(5), [inputIndex, setInputIndex] = useState(12);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = useRef(0);
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    activeRef.current = active;
    if (!active) { run.current++; setBusy(false); }
  }, [active]);
  useEffect(() => () => { run.current++; }, []);
  const trace = cnnLossGradient(state.input, CNN_TRAINING_TARGET, state.parameters), window = trace.windows[scan];
  const wy = Math.floor(weightIndex / 3), wx = weightIndex % 3;
  const iy = Math.floor(inputIndex / 5), ix = inputIndex % 5;
  const inField = (r: number, c: number) => r >= window.row && r < window.row + 3 && c >= window.column && c < window.column + 3;
  const sensitivity = state.input.map((row, r) => row.map((_, c) => inField(r, c) ? state.parameters.weights[r - window.row][c - window.column] : 0));

  function reset() {
    run.current++;
    setBusy(false); setError(''); setState(initialState()); setLearningRate(0.05); setScan(0);
  }
  function edit(input: number[][], parameters: CnnParameters) {
    setState({ input, parameters, steps: 0, history: [{ x: 0, y: cnnLossGradient(input, CNN_TRAINING_TARGET, parameters).loss }], last: null });
    setError('');
  }
  async function train(count: number) {
    if (!active || busy) return;
    const token = ++run.current;
    setBusy(true); setError('');
    let next = state;
    try {
      // At most 1,000 steps per experiment; yield between small chunks for input/paint.
      for (let done = 0; done < count;) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (run.current !== token || !activeRef.current) return;
        const end = Math.min(done + 5, count);
        for (; done < end; done++) {
          const step = cnnSgdStep(next.input, CNN_TRAINING_TARGET, next.parameters, learningRate);
          next = {
            ...next, parameters: step.parameters, steps: next.steps + 1,
            history: [...next.history, { x: next.steps + 1, y: step.after.loss }],
            last: { ...step, previousParameters: next.parameters, learningRate, step: next.steps + 1 },
          };
        }
        setState(next);
      }
    } catch (cause) {
      if (run.current === token) setError(cause instanceof Error ? cause.message : 'Не удалось выполнить шаг SGD.');
    } finally {
      if (run.current === token) setBusy(false);
    }
  }

  return <section className="cnn-training-lab" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Обучите один общий CNN-фильтр</h2>
    <p className="lesson-intro">Вход 5×5 содержит вертикальный переход от 0 к 1. Цель задана явно: ответ 1 у окон, пересекающих этот край, и 0 у однородных окон. Девять весов фильтра 3×3 и один bias общие для всех девяти выходов. Начните с нулевого фильтра и выполните шаг SGD.</p>
    <p className="note">Один канал, stride=1, padding=0, dilation=1, без активации и pooling. Используем cross-correlation: фильтр не переворачивается. Метки остаются фиксированными при изменении входа. Все числа без единиц; r — строка, c — столбец, нумерация с 1.</p>
    <div className="lab-grid">
      <section className="panel controls"><h3>Общий фильтр и обучение</h3>
        <fieldset disabled={busy} className="cnn-training-controls"><legend>Параметры опыта</legend>
          <Range label="Шаг SGD η" value={learningRate} min={0.001} max={0.1} step={0.001} onChange={setLearningRate} />
          <label>Вес для изменения и разбора<select value={weightIndex} onChange={event => setWeightIndex(Number(event.target.value))}>{state.parameters.weights.flat().map((_, index) => <option key={index} value={index}>w[{Math.floor(index / 3) + 1}, {index % 3 + 1}]</option>)}</select></label>
          <Range label={`Общий вес w[${wy + 1}, ${wx + 1}]`} value={state.parameters.weights[wy][wx]} min={Math.min(-2, Math.floor(state.parameters.weights[wy][wx]))} max={Math.max(2, Math.ceil(state.parameters.weights[wy][wx]))} step={0.001} onChange={value => {
            const weights = copyCnnMatrix(state.parameters.weights); weights[wy][wx] = value;
            edit(state.input, { ...state.parameters, weights });
          }} />
          <Range label="Общий bias b" value={state.parameters.bias} min={Math.min(-2, Math.floor(state.parameters.bias))} max={Math.max(2, Math.ceil(state.parameters.bias))} step={0.001} onChange={bias => edit(state.input, { ...state.parameters, bias })} />
          <label>Ячейка входа для изменения<select value={inputIndex} onChange={event => setInputIndex(Number(event.target.value))}>{state.input.flat().map((_, index) => <option key={index} value={index}>x[{Math.floor(index / 5) + 1}, {index % 5 + 1}]</option>)}</select></label>
          <Range label={`Значение входа x[${iy + 1}, ${ix + 1}]`} value={state.input[iy][ix]} min={0} max={1} step={0.01} onChange={value => {
            const input = copyCnnMatrix(state.input); input[iy][ix] = value; edit(input, state.parameters);
          }} />
        </fieldset>
        <p className="note">Изменение входа, веса или bias начинает новую историю MSE с текущими параметрами. Изменение η сохраняет историю.</p>
        <div className="button-row">{[1, 10, 100].map(count => <button key={count} type="button" className={count === 1 ? 'primary' : undefined} disabled={busy || state.steps + count > 1000} onClick={() => void train(count)}>{count === 1 ? '1 шаг SGD' : `${count} шагов SGD`}</button>)}</div>
        <button type="button" onClick={reset}>Сбросить вход, веса и историю</button>
        <p className="note">Предел: 1 000 шагов на опыт. «Сбросить» возвращает исходную матрицу, нулевые веса и bias, η=0,05; прерывает текущую серию.</p>
        <p role="status" aria-live="polite" aria-atomic="true">{busy ? 'Выполняется выбранная серия SGD.' : `Шагов: ${state.steps}. Текущая MSE: ${fmt(trace.loss, 6)}.`}</p>
        {error && <p role="alert">{error}</p>}
        <CnnMatrix label="Текущий общий фильтр w" values={state.parameters.weights} selected={[wy, wx]} onSelect={(r, c) => setWeightIndex(r * 3 + c)} />
        <p>b = {fmt(state.parameters.bias, 6)}. Один SGD меняет эти же 10 параметров для всех выходных окон.</p>
      </section>
      <section className="panel"><h3>Цель, текущий ответ и ошибка</h3>
        <div className="cnn-training-matrices">
          <CnnMatrix label="Вход x · ◂ — геометрическое поле выбранного выхода" values={state.input} marked={inField} />
          <CnnMatrix label="Фиксированная целевая карта t" values={CNN_TRAINING_TARGET} />
          <CnnMatrix label="Текущая карта ŷ · выберите выход" values={trace.prediction} selected={[window.row, window.column]} onSelect={(r, c) => setScan(r * 3 + c)} />
          <CnnMatrix label="Ошибка e = ŷ − t" values={trace.error} />
        </div>
        <p className="formula">MSE = (1/9) Σ(ŷ[r,c] − t[r,c])² = {fmt(trace.loss, 6)}<br />δ[r,c] = ∂MSE/∂ŷ[r,c] = 2(ŷ[r,c] − t[r,c])/9</p>
        <Range label="Выходное окно для разбора" value={scan + 1} min={1} max={9} step={1} onChange={value => setScan(value - 1)} />
        <p>Выход [{window.row + 1}, {window.column + 1}] берёт строки {window.row + 1}–{window.row + 3} и столбцы {window.column + 1}–{window.column + 3} входа. Окна пересекаются; веса одни и те же.</p>
        <Chart series={[{ name: 'MSE фиксированной цели', points: state.history }]} xLabel="Выполненные шаги SGD" yLabel="Средняя квадратичная ошибка MSE" />
        <p className="note">Это обучение на одной матрице, а не проверка обобщения на новых изображениях. Для этой карты подходящий фильтр не единственный; низкая MSE не означает, что выучен определённый канонический детектор.</p>
      </section>
    </div>
    <section className="panel"><h3>Backward: выбранное окно и сумма для общего веса</h3>
      <p>Текущий выход [{window.row + 1}, {window.column + 1}]: ŷ = {fmt(window.output, 6)}, t = {window.target}, e = {fmt(window.error, 6)}, δ = {fmt(window.delta, 6)}. Ниже — градиенты текущего состояния для следующего шага.</p>
      <div className="cnn-training-matrices">
        <CnnMatrix label="Девять значений выбранного окна x" values={window.patch} />
        <CnnMatrix label="Вклад этого окна в ∂MSE/∂w = δ × x" values={window.weightContributions} />
        <CnnMatrix label="∂MSE/∂w · сумма вкладов всех окон" values={trace.weightGradient} />
      </div>
      <p className="formula">Для w[{wy + 1},{wx + 1}] выбранное окно даёт {fmt(window.delta, 6)} × {fmt(window.patch[wy][wx], 6)} = {fmt(window.weightContributions[wy][wx], 6)}.<br />Полный ∂MSE/∂w[{wy + 1},{wx + 1}] = Σ по всем окнам (δ × x) = {fmt(trace.weightGradient[wy][wx], 6)}<br />∂MSE/∂b = Σδ = {fmt(trace.biasGradient, 6)}</p>
      <details><summary>Все девять вкладов в выбранный общий вес</summary>
        <div className="cnn-training-scroll" tabIndex={0} role="region" aria-label="Вклады выходных окон. Прокручиваемая таблица">
          <table className="data-table"><thead><tr><th scope="col">Выход [r,c]</th><th scope="col">Вход x</th><th scope="col">δ</th><th scope="col">δ × x</th></tr></thead><tbody>{trace.windows.map(item => <tr key={`${item.row}-${item.column}`}><th scope="row">[{item.row + 1},{item.column + 1}]</th><td>{fmt(item.patch[wy][wx], 6)}</td><td>{fmt(item.delta, 6)}</td><td>{fmt(item.weightContributions[wy][wx], 6)}</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={3}>Сумма для w[{wy + 1},{wx + 1}]</th><td>{fmt(trace.weightGradient[wy][wx], 6)}</td></tr></tfoot></table>
        </div>
      </details>
      <details><summary>Поле восприятия, чувствительность и backward по входу</summary>
        <p>Геометрическое поле всегда 3×3: оно отмечено ◂ во входе. Чувствительность выбранного ответа ∂ŷ/∂x равна соответствующему весу внутри этого поля и 0 снаружи. При нулевых весах поле существует, но чувствительность нулевая.</p>
        <div className="cnn-training-matrices"><CnnMatrix label="∂ŷ выбранного выхода / ∂x · чувствительность" values={sensitivity} /><CnnMatrix label="∂MSE / ∂x · сумма δ × w всех перекрывающихся окон" values={trace.inputGradient} /></div>
        <p>Для выбранного выхода локальный вклад в ∂MSE/∂x = δ × ∂ŷ/∂x. Общий backward складывает такие вклады от всех выходов, которые видят ячейку. Вход не обновляется SGD: здесь обучаются только w и b, а метки фиксированы.</p>
      </details>
    </section>
    <section className="panel"><h3>Фильтр до и после последнего выполненного SGD</h3>
      {state.last ? <>
        <p>Шаг {state.last.step}, η={fmt(state.last.learningRate, 6)}: MSE до = {fmt(state.last.before.loss, 6)}, после = {fmt(state.last.after.loss, 6)}. Градиенты в таблице вычислены до этого шага.</p>
        <p className="formula">w после = w до − η × ∂MSE/∂w; b после = b до − η × ∂MSE/∂b</p>
        <div className="cnn-training-scroll" tabIndex={0} role="region" aria-label="Все параметры до и после одного SGD. Прокручиваемая таблица">
          <table className="data-table"><thead><tr><th scope="col">Параметр</th><th scope="col">До</th><th scope="col">Градиент до</th><th scope="col">После</th></tr></thead><tbody>
            {state.last.previousParameters.weights.flat().map((value, index) => <tr key={index}><th scope="row">w[{Math.floor(index / 3) + 1},{index % 3 + 1}]</th><td>{fmt(value, 6)}</td><td>{fmt(state.last!.before.weightGradient[Math.floor(index / 3)][index % 3], 6)}</td><td>{fmt(state.last!.parameters.weights[Math.floor(index / 3)][index % 3], 6)}</td></tr>)}
            <tr><th scope="row">b</th><td>{fmt(state.last.previousParameters.bias, 6)}</td><td>{fmt(state.last.before.biasGradient, 6)}</td><td>{fmt(state.last.parameters.bias, 6)}</td></tr>
          </tbody></table>
        </div>
      </> : <p>Нажмите «1 шаг SGD», чтобы увидеть настоящий снимок параметров до и после. Ручная правка параметров очищает этот снимок.</p>}
    </section>
    <ActionExercise title="Научите общий фильтр отмечать вертикальный край" goal="Сделайте хотя бы один шаг SGD и уменьшите MSE ниже 0,05. Проверка использует настоящую loss и изменённые веса." startingConditions="исходный вход 5×5, цель [1,1,0] в каждой строке, нулевые веса и bias, η=0,05, история очищена." hint="Сначала выполните один шаг и сравните w до/после. Затем выполните 100 шагов с η=0,05. Для фиксированной матрицы ручные изменения входа не нужны." onStart={reset} check={() => checkCnnTrainingPractice(state.input, CNN_TRAINING_TARGET, state.parameters, state.steps, state.history[0].y)} stateKey={JSON.stringify([state.input, state.parameters, state.steps])} />
    <p className="note">Числа в таблицах округлены для чтения; расчёт использует полную точность JavaScript Number.</p>
  </section>;
}
