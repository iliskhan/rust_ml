import { CoreTopicFilm } from './CoreTopicFilms';
import { useMemo, useState, type ReactNode } from 'react';
import { Chart, Range, fmt } from './ui';
import { PredictionExperiment } from './PredictionExperiment';
import { Scene3D, type SceneAxes, type Vec3 } from './ThreeD';
import { activation, activationDerivative, adaptationInitial, adaptationStep, adaptationGradients,
  adaptationDelta, adaptationPredict, applyBpe, bpePairs, ffnTrace, FFN_UP, FFN_GATE, FFN_DOWN,
  BASE_WEIGHT, trainAdaptation, trainBpe, type FfnKind, type Matrix } from './tokenAdaptationMath';
import './token-adaptation-labs.css';

const visible = (token: string) => JSON.stringify(token);
const vector = (values: readonly number[], digits = 4) => `[${values.map(v => fmt(v, digits)).join('; ')}]`;
const norm = (matrix: Matrix) => Math.hypot(...matrix.flat());
function ScrollTable({ label, children }: { label: string; children: ReactNode }) {
  return <div className="token-lab-table" tabIndex={0} role="region" aria-label={`${label}. Таблица с горизонтальной прокруткой`}>{children}</div>;
}
function MatrixTable({ values, title }: { values: Matrix; title: string }) {
  return <ScrollTable label={title}><table className="data-table"><caption>{title}</caption>
    <thead><tr><th scope="col">Строка</th>{values[0].map((_, j) => <th scope="col" key={j}>Столбец {j + 1}</th>)}</tr></thead>
    <tbody>{values.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th>{row.map((v, j) => <td key={j}>{fmt(v, 5)}</td>)}</tr>)}</tbody>
  </table></ScrollTable>;
}
function outputAxes(points: readonly (readonly number[])[]): SceneAxes {
  return [0, 1, 2].map(i => {
    const values = points.map(point => point[i]), lo = Math.min(0, ...values), hi = Math.max(0, ...values), padding = Math.max(.1, (hi - lo) * .15);
    return { label: `Выход y${i + 1} (безразмерный)`, min: lo - padding, max: hi + padding };
  }) as unknown as SceneAxes;
}

export function BpeLab() {
  const [corpus, setCorpus] = useState('низ низ низ ниже ниже низкий низкий'), [text, setText] = useState('низкий ниже 🦊');
  const [step, setStep] = useState(3);
  const trained = useMemo(() => trainBpe(corpus, 20), [corpus]);
  const currentStep = Math.min(step, trained.steps.length), model = useMemo(() => trainBpe(corpus, currentStep), [corpus, currentStep]);
  const encoded = applyBpe(text, model), nextPairs = bpePairs(model.tokens), next = nextPairs[0];
  return <CoreTopicFilm slug="bpe" current={{ corpus, text, step }} example={{ corpus: 'низ низ низ ниже ниже низкий низкий', text: 'низкий ниже 🦊', step: 3 }} restore={value => { setCorpus(value.corpus);setText(value.text);setStep(value.step); }}><section className="token-adaptation-lab" aria-label="Лаборатория BPE">
    <h3>BPE: учим правила слияния, затем применяем их к новому тексту</h3>
    <p>Byte Pair Encoding здесь показан в учебном символьном варианте: стартовые токены — кодовые точки Unicode.
      Пробелы и переводы строк участвуют в подсчёте; корпус — один непрерывный поток. Нормализации и разбиения на слова нет.</p>
    <div className="lab-grid">
      <section className="panel controls"><h3>1. Обучение на корпусе</h3>
        <label>Учебный корпус (до 500 UTF-16 единиц)<textarea value={corpus} maxLength={500} rows={4} onChange={event => { setCorpus(event.target.value); setStep(0); }} /></label>
        {trained.steps.length > 0 && <Range label="Применено обученных слияний" value={currentStep} min={0} max={trained.steps.length} step={1} onChange={setStep} />}
        <div className="button-row"><button type="button" disabled={currentStep >= trained.steps.length} onClick={() => setStep(currentStep + 1)}>Следующее слияние</button>
          <button type="button" onClick={() => setStep(0)}>Начать с символов</button></div>
        <p>Исходных символов: {Array.from(corpus).length}. Токенов после {currentStep} слияний: {model.tokens.length}. Словарь: {model.vocabulary.length} токенов.</p>
        <p className="note">Обучение ограничено 20 правилами. Пары сортируются по частоте; при равенстве — по строковому ключу JSON [левый, правый] в порядке UTF-16. Замена идёт слева направо без перекрытия: «aaaa» даёт частоту «a+a» = 3, но две замены.</p>
      </section>
      <section className="panel"><h3>Какая пара будет следующей?</h3>
        {next ? <><p className="formula">{visible(next.left)} + {visible(next.right)} → {visible(next.left + next.right)}<br />Частота соседней пары: {next.count}</p>
          <ScrollTable label="Частоты пар"><table className="data-table"><caption>Первые 8 пар в детерминированном порядке</caption><thead><tr><th scope="col">Пара</th><th scope="col">Частота</th></tr></thead>
            <tbody>{nextPairs.slice(0, 8).map(pair => <tr key={JSON.stringify([pair.left, pair.right])}><th scope="row"><code>{visible(pair.left)} + {visible(pair.right)}</code></th><td>{pair.count}</td></tr>)}</tbody></table></ScrollTable></>
          : <p>Соседних пар нет: корпус пуст или остался один токен.</p>}
        <p className="token-lab-tokens" aria-label="Токены обучающего корпуса">{model.tokens.map((token, i) => <code key={i}>{visible(token)}</code>)}</p>
      </section>
    </div>
    <section className="panel"><h3>2. Применение уже выученных правил</h3>
      <label>Новый текст: меняет только токенизацию, а не правила<textarea value={text} maxLength={500} rows={2} onChange={event => setText(event.target.value)} /></label>
      <p>Сначала текст разбивается на символы, затем выполняются первые {currentStep} правил в порядке обучения. Частоты нового текста не пересчитываются.</p>
      <ScrollTable label="Токены и ID нового текста"><table className="data-table"><caption>Токены, ID в текущем словаре и точное восстановление</caption><thead><tr><th scope="col">Позиция</th><th scope="col">Токен (JSON)</th><th scope="col">ID</th></tr></thead>
        <tbody>{encoded.tokens.map((token, i) => <tr key={i}><th scope="row">{i + 1}</th><td><code>{visible(token)}</code></td><td>{encoded.ids[i] ?? 'вне словаря'}</td></tr>)}</tbody></table></ScrollTable>
      <p>Восстановленный текст: <code className="token-lab-decoded">{visible(encoded.decoded)}</code>. Совпадает с исходным: {encoded.decoded === text ? 'да' : 'нет'}.</p>
      {encoded.unknown.length > 0 && <p role="status">Символы вне обученного словаря: {encoded.unknown.map(visible).join(', ')}. Их текст сохранён, но числового ID нет. Это не byte-level BPE: полного покрытия произвольного текста словарём здесь нет.</p>}
      <details><summary>Порядок правил и весь словарь с ID</summary>
        <ol>{model.steps.map(({ pair }, i) => <li key={i}><code>{visible(pair.left)} + {visible(pair.right)} → {visible(pair.left + pair.right)}</code>, частота при обучении {pair.count}</li>)}</ol>
        <ScrollTable label="Словарь BPE"><table className="data-table"><caption>ID фиксируются: отсортированный алфавит, затем новые токены</caption><thead><tr><th scope="col">ID</th><th scope="col">Токен</th></tr></thead>
          <tbody>{model.vocabulary.map((token, i) => <tr key={i}><th scope="row">{i}</th><td><code>{visible(token)}</code></td></tr>)}</tbody></table></ScrollTable>
      </details>
    </section>
    <PredictionExperiment question="Если применить следующее обученное слияние к корпусу, число токенов…" options={['Уменьшится', 'Увеличится', 'Не изменится']} disabled={!next || currentStep >= trained.steps.length}
      run={prediction => {
        const after = trainBpe(corpus, currentStep + 1); setStep(currentStep + 1);
        return { correct: prediction === 0, before: `${model.tokens.length} токенов`, after: `${after.tokens.length} токенов`, explanation: 'Выбранная пара встретилась в корпусе; хотя бы одна неперекрывающаяся замена соединит два токена в один.' };
      }} />
    <p className="note">Одинаковый текст может получать другие ID после изменения корпуса. ID — индекс словаря, не смысловая координата. Слитые пробелы и целые фразы здесь допустимы; промышленные токенизаторы добавляют свои правила и ограничения.</p>
    <p className="note">Источник алгоритма: <a href="https://huggingface.co/learn/llm-course/chapter6/5" target="_blank" rel="noreferrer">Hugging Face: Byte-Pair Encoding tokenization</a>. Наш опыт явно упрощает предварительную обработку и сохраняет неизвестные символы без ID.</p>
  </section></CoreTopicFilm>;
}

export function GatedFfnLab() {
  const [kind, setKind] = useState<FfnKind>('swiglu'), [input, setInput] = useState([.7, -.4, .6]), [geometry, setGeometry] = useState(false);
  const trace = ffnTrace(input, kind), label = { relu: 'ReLU', gelu: 'GELU (tanh-приближение)', swiglu: 'SwiGLU' }[kind];
  const sweep = Array.from({ length: 41 }, (_, i) => { const x = -2 + i * .1; return { x, output: ffnTrace([x, input[1], input[2]], kind).output }; });
  return <CoreTopicFilm slug="swiglu" current={{ kind, input, geometry }} example={{ kind: 'swiglu', input: [.7,-.4,.6], geometry: geometry }} restore={value => { setKind(value.kind);setInput(value.input);setGeometry(value.geometry); }}><section className="token-adaptation-lab" aria-label="Лаборатория GELU и SwiGLU">
    <h3>FFN: нелинейность и умножающий gate</h3>
    <p>Один токен с тремя признаками проходит FFN 3 → 4 → 3. Четыре скрытых канала — индексы,
      а три выходных компоненты образуют реальный вектор y. Этот блок не смешивает соседние токены.</p>
    <div className="lab-grid">
      <section className="panel controls"><h3>Вход и вариант блока</h3>
        <label>Нелинейность<select value={kind} onChange={event => setKind(event.target.value as FfnKind)}><option value="relu">ReLU</option><option value="gelu">GELU (tanh-приближение)</option><option value="swiglu">SwiGLU</option></select></label>
        {input.map((value, i) => <Range key={i} label={`Признак x${i + 1}`} value={value} min={-2} max={2} step={.01} onChange={v => setInput(input.map((old, j) => i === j ? v : old))} />)}
        <p className="formula">{kind === 'swiglu' ? <>u = Wup x; g = Wgate x<br />p = SiLU(g) ⊙ u; y = Wdown p</> : <>u = Wup x; p = {kind === 'relu' ? 'ReLU' : 'GELU'}(u)<br />y = Wdown p</>}</p>
        <p>Параметров без bias: {trace.parameters}. ReLU/GELU: 2dh = 24; SwiGLU: 3dh = 36 при d=3, h=4.</p>
        <p className="note">Это сравнение при одинаковой ширине. Чтобы примерно сравнять число весов, ширину SwiGLU часто уменьшают; здесь это не сделано.</p>
      </section>
      <section className="panel"><h3>Численный выход и локальная чувствительность</h3>
        <p className="formula">y = {vector(trace.output)}<br />∂y/∂x₁ = {vector(trace.derivative)}</p>
        <p>SwiGLU использует SiLU(g) = g·σ(g). Значение gate может быть отрицательным или больше 1; это множитель, а не вероятность. При отрицательном gate знак u может измениться.</p>
        <Chart xLabel="Аргумент z (безразмерный)" yLabel="Значение нелинейности" series={(['relu', 'gelu', 'swiglu'] as FfnKind[]).map(k => ({ name: k === 'swiglu' ? 'SiLU (gate SwiGLU)' : k.toUpperCase(), points: Array.from({ length: 81 }, (_, i) => { const x = -4 + i * .1; return { x, y: activation(x, k) }; }) }))} />
      </section>
    </div>
    <section className="panel"><h3>Трасса {label}: скрытый канал и производная</h3>
      <ScrollTable label="Численная трасса FFN"><table className="data-table"><caption>Все скрытые каналы; x₂ и x₃ фиксированы при дифференцировании по x₁</caption>
        <thead><tr><th scope="col">Канал j</th><th scope="col">uⱼ = Wup x</th><th scope="col">{kind === 'swiglu' ? 'gⱼ = Wgate x' : 'zⱼ = uⱼ'}</th><th scope="col">{kind === 'swiglu' ? 'SiLU(gⱼ)' : 'f(zⱼ)'}</th><th scope="col">f′(zⱼ)</th><th scope="col">pⱼ</th><th scope="col">∂pⱼ/∂x₁</th></tr></thead>
        <tbody>{trace.rows.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th>{[row.up, row.gate, row.activated, row.localDerivative, row.product, row.derivative].map((v, j) => <td key={j}>{fmt(v, 5)}</td>)}</tr>)}</tbody></table></ScrollTable>
      <p className="formula">{kind === 'swiglu' ? <>∂pⱼ/∂uⱼ = SiLU(gⱼ); ∂pⱼ/∂gⱼ = uⱼ SiLU′(gⱼ)<br />∂pⱼ/∂x₁ = SiLU′(gⱼ) Wgate[j,1] uⱼ + SiLU(gⱼ) Wup[j,1]</> : <>∂pⱼ/∂x₁ = f′(uⱼ) Wup[j,1]</>}<br />∂yᵢ/∂x₁ = Σⱼ Wdown[i,j] ∂pⱼ/∂x₁</p>
      <Chart xLabel="Вход x₁; x₂, x₃ фиксированы" yLabel="Выход FFN (безразмерный)" series={[0, 1, 2].map(i => ({ name: `y${i + 1}`, points: sweep.map(point => ({ x: point.x, y: point.output[i] })) }))} />
      <p className="note">GELU = ½z[1+tanh(√(2/π)(z+0,044715z³))] — именно это приближение вычисляется и дифференцируется. В изломе ReLU при z=0 выбрана производная 0; обычной производной там нет.</p>
      <details><summary>Матрицы и локальные производные умножения</summary><MatrixTable title="Wup: 4×3" values={FFN_UP} />{kind === 'swiglu' && <MatrixTable title="Wgate: 4×3" values={FFN_GATE} />}<MatrixTable title="Wdown: 3×4" values={FFN_DOWN} />
        <ScrollTable label="Локальные производные произведения"><table className="data-table"><caption>Производные по независимым ветвям</caption><thead><tr><th scope="col">Канал</th><th scope="col">∂p/∂u</th><th scope="col">∂p/∂g</th></tr></thead><tbody>{trace.rows.map((row, i) => <tr key={i}><th scope="row">{i + 1}</th><td>{fmt(row.dProductDUp, 6)}</td><td>{kind === 'swiglu' ? fmt(row.dProductDGate, 6) : 'Нет gate'}</td></tr>)}</tbody></table></ScrollTable>
      </details>
      <div className="button-row"><button type="button" aria-pressed={geometry} onClick={() => setGeometry(!geometry)}>{geometry ? 'Скрыть' : 'Показать'} 3D выходного вектора</button></div>
      {geometry && <Scene3D title="Выходы FFN при изменении x₁" description="Линия соединяет настоящие тройки (y₁, y₂, y₃) при фиксированных x₂ и x₃. Текущее положение — выход для выбранного входа; индекс канала и x₁ не являются дополнительными осями. Числа доступны в графике и таблице." axes={outputAxes(sweep.map(point => point.output))}
        lines={[{ name: 'Траектория y при x₁ от −2 до 2', points: sweep.map(point => point.output as unknown as Vec3) }]} points={[{ name: 'Текущий y', position: trace.output as unknown as Vec3, color: '#b75d24' }]} />}
    </section>
    <PredictionExperiment question="При z = −1 выход SiLU gate…" options={['Отрицательный', 'Между 0 и 1', 'Ровно 0']} run={prediction => ({ correct: prediction === 0, before: 'Аргумент gate z = −1', after: `SiLU(−1) = ${fmt(activation(-1, 'swiglu'), 6)}, производная = ${fmt(activationDerivative(-1, 'swiglu'), 6)}`, explanation: 'σ(z) положительна, но множитель z отрицателен. SiLU gate не имеет ограничений вероятности.' })} />
    <p className="note">Источники: <a href="https://arxiv.org/abs/1606.08415" target="_blank" rel="noreferrer">Hendrycks, Gimpel: GELU</a>; <a href="https://arxiv.org/abs/2002.05202" target="_blank" rel="noreferrer">Shazeer: GLU Variants Improve Transformer</a>. Здесь проверяется арифметика блока; качество модели по нему не измеряется.</p>
  </section></CoreTopicFilm>;
}

export function LoraLab() {
  const [rank, setRank] = useState(1), [taskRank, setTaskRank] = useState<1 | 3>(1), [noise, setNoise] = useState(0), [eta, setEta] = useState(.4), [epochs, setEpochs] = useState(0), [sampleIndex, setSampleIndex] = useState(0), [geometry, setGeometry] = useState(false);
  const result = useMemo(() => trainAdaptation(rank, taskRank, noise, eta, epochs), [rank, taskRank, noise, eta, epochs]);
  const last = result.history[result.history.length - 1], sample = result.data.heldout[sampleIndex];
  const baseOutput = BASE_WEIGHT.map(row => row.reduce((sum, v, j) => sum + v * sample.x[j], 0));
  const fullOutput = adaptationPredict(result.full, sample.x, 'full'), loraOutput = adaptationPredict(result.lora, sample.x, 'lora');
  const fullDelta = result.full.w.map((row, i) => row.map((v, j) => v - BASE_WEIGHT[i][j])), loraDelta = adaptationDelta(result.lora);
  const fullGrad = adaptationGradients(result.full, result.data.train, 'full'), loraGrad = adaptationGradients(result.lora, result.data.train, 'lora');
  const predictions = [baseOutput, sample.y, fullOutput, loraOutput];
  function restart(action: () => void) { action(); setEpochs(0); }
  return <CoreTopicFilm slug="lora" current={{ rank, taskRank, noise, eta, epochs, sampleIndex, geometry }} example={{ rank: 1, taskRank: 1, noise: 0, eta: .4, epochs: 1, sampleIndex: 0, geometry: geometry }} restore={value => { setRank(value.rank);setTaskRank(value.taskRank);setNoise(value.noise);setEta(value.eta);setEpochs(value.epochs);setSampleIndex(value.sampleIndex);setGeometry(value.geometry); }}><section className="token-adaptation-lab" aria-label="Лаборатория LoRA и полной адаптации">
    <h3>LoRA и полная адаптация: одна задача, два набора обучаемых весов</h3>
    <p>Линейный слой 8 → 3 уже имеет базовую матрицу W₀. Full обновляет все 24 её веса.
      LoRA замораживает W₀ и обучает A[r×8], B[3×r]: y = (W₀ + BA)x. Здесь масштаб α/r = 1, bias нет.</p>
    <div className="lab-grid">
      <section className="panel controls"><h3>Общая задача и SGD</h3>
        <Range label="Ранг адаптера r" value={rank} min={1} max={3} step={1} onChange={r => restart(() => setRank(r))} />
        <label>Истинное изменение задачи<select value={taskRank} onChange={event => restart(() => setTaskRank(Number(event.target.value) as 1 | 3))}><option value="1">Ранг 1: представим одним адаптером</option><option value="3">Ранг 3: ограничение ранга r=1 видно</option></select></label>
        <Range label="Шум только обучающих ответов" value={noise} min={0} max={.5} step={.01} onChange={n => restart(() => setNoise(n))} />
        <Range label="Скорость SGD η" value={eta} min={.05} max={1} step={.05} onChange={n => restart(() => setEta(n))} />
        <div className="button-row">{[1, 50, 500].map(count => <button type="button" key={count} disabled={epochs >= 1000} onClick={() => setEpochs(Math.min(1000, epochs + count))}>+{count} {count === 1 ? 'эпоха' : 'эпох'}</button>)}<button type="button" onClick={() => setEpochs(0)}>Сбросить обучение</button></div>
        <p role="status">Выполнено эпох: {epochs}. На каждой эпохе считается полный градиент по 16 обучающим примерам; held-out не участвует в градиенте.</p>
        <p>Обучаемых параметров: Full 24; LoRA r(8+3) = {rank * 11}. {rank * 11 < 24 ? `Экономия ${24 - rank * 11} весов.` : 'Экономии обучаемых весов при этом ранге нет.'} Базовые 24 веса LoRA остаются в памяти.</p>
        <p className="note">Одинаковые данные и η; методы имеют разную параметризацию и скорость сходимости. Опыт не сравнивает стоимость обучения больших моделей.</p>
      </section>
      <section className="panel"><h3>Ошибки train и held-out</h3>
        <p className="formula">MSE = ΣₙΣᵢ(ŷₙᵢ − yₙᵢ)² / (3N)<br />Full: train {fmt(last.fullTrain, 6)}, held-out {fmt(last.fullHeldout, 6)}<br />LoRA: train {fmt(last.loraTrain, 6)}, held-out {fmt(last.loraHeldout, 6)}</p>
        <Chart xLabel="Эпоха SGD (индекс)" yLabel="MSE на фиксированной выборке" series={[
          { name: 'Full train', color: '#27694e', points: result.history.map(h => ({ x: h.epoch, y: h.fullTrain })) },
          { name: 'Full held-out', color: '#27694e', dashed: true, points: result.history.map(h => ({ x: h.epoch, y: h.fullHeldout })) },
          { name: 'LoRA train', color: '#b75d24', points: result.history.map(h => ({ x: h.epoch, y: h.loraTrain })) },
          { name: 'LoRA held-out', color: '#b75d24', dashed: true, points: result.history.map(h => ({ x: h.epoch, y: h.loraHeldout })) },
        ]} />
        <p className="note">16 train-входов — ±2eⱼ для восьми признаков. 8 held-out входов — фиксированные плотные векторы, их ответы без шума. Обе выборки известны и детерминированы. Низкий train MSE сам по себе не гарантирует низкий held-out MSE.</p>
      </section>
    </div>
    <section className="panel"><h3>Что изменилось в весах?</h3>
      <p className="formula">Full: ||W − W₀||F = {fmt(norm(fullDelta), 6)}<br />LoRA: ||BA||F = {fmt(norm(loraDelta), 6)}, ||W − W₀||F = {fmt(norm(result.lora.w.map((row, i) => row.map((v, j) => v - BASE_WEIGHT[i][j]))), 6)}<br />Текущий градиент: ||∂L/∂Wfull||F = {fmt(norm(fullGrad.w), 6)}; ||∂L/∂A||F = {fmt(norm(loraGrad.a), 6)}; ||∂L/∂B||F = {fmt(norm(loraGrad.b), 6)}</p>
      <p>A начинается с детерминированных ненулевых значений, B = 0: в начале BA = 0, а выход совпадает с W₀x.
        Поэтому на первом шаге ∂L/∂A = 0, но ∂L/∂B обычно ненулевой. Если обе матрицы нулевые, обе производные останутся нулевыми.</p>
      <details><summary>Формулы градиента и все матрицы</summary><p className="formula">eₙ = 2(ŷₙ − yₙ)/(3N), qₙ = A xₙ<br />∂L/∂Wfull = Σₙ eₙ xₙᵀ<br />∂L/∂B = Σₙ eₙ qₙᵀ; ∂L/∂A = Σₙ Bᵀ eₙ xₙᵀ<br />θnew = θold − η∇L; A и B обновляются одновременно из одного старого состояния.</p>
        <MatrixTable title="W₀: общая базовая матрица, заморожена в LoRA" values={BASE_WEIGHT} /><MatrixTable title="A: обучаемая матрица LoRA" values={result.lora.a} /><MatrixTable title="B: обучаемая матрица LoRA" values={result.lora.b} /><MatrixTable title="BA: изменение LoRA" values={loraDelta} /><MatrixTable title="Wfull − W₀: полное изменение" values={fullDelta} /><MatrixTable title="Истинное изменение задачи" values={result.data.targetDelta} />
      </details>
    </section>
    <section className="panel"><h3>Один невиденный при обучении вход</h3>
      <Range label="Номер примера held-out (индекс)" value={sampleIndex + 1} min={1} max={8} step={1} onChange={n => setSampleIndex(n - 1)} />
      <p>x = {vector(sample.x)}</p>
      <ScrollTable label="Предсказания на held-out"><table className="data-table"><caption>Три настоящие компоненты выхода для одного общего входа</caption><thead><tr><th scope="col">Метод</th><th scope="col">y₁</th><th scope="col">y₂</th><th scope="col">y₃</th></tr></thead><tbody>{['База W₀x', 'Цель', 'Full', 'LoRA'].map((name, i) => <tr key={name}><th scope="row">{name}</th>{predictions[i].map((v, j) => <td key={j}>{fmt(v, 6)}</td>)}</tr>)}</tbody></table></ScrollTable>
      <div className="button-row"><button type="button" aria-pressed={geometry} onClick={() => setGeometry(!geometry)}>{geometry ? 'Скрыть' : 'Показать'} 3D сравнение выхода</button></div>
      {geometry && <Scene3D title="База, цель и два адаптированных выхода" description="Три оси — реальные компоненты одного выходного вектора y₁, y₂, y₃. Отрезки показывают изменение выхода относительно замороженной базы. Номер примера и эпоха не являются пространственными координатами. Точные значения есть в таблице выше." axes={outputAxes(predictions)}
        points={['База', 'Цель', 'Full', 'LoRA'].map((name, i) => ({ name, position: predictions[i] as unknown as Vec3, color: ['#6a52a0', '#2a7293', '#27694e', '#b75d24'][i] }))}
        lines={[{ name: 'Обновление Full', points: [baseOutput as unknown as Vec3, fullOutput as unknown as Vec3], color: '#27694e' }, { name: 'Обновление LoRA', points: [baseOutput as unknown as Vec3, loraOutput as unknown as Vec3], color: '#b75d24' }]} />}
    </section>
    {epochs !== 0 && <p>Опыт первого шага доступен до обучения. Нажмите «Сбросить обучение», чтобы снова проверить прогноз при B=0.</p>}
    <PredictionExperiment question="При B=0 и A≠0 какая матрица LoRA изменится на самом первом SGD?" options={['Только B', 'Только A', 'Обе матрицы']} disabled={epochs !== 0} run={prediction => {
      const initial = adaptationInitial(rank), next = adaptationStep(initial, result.data.train, 'lora', eta);
      const aChange = norm(next.a.map((row, i) => row.map((v, j) => v - initial.a[i][j]))), bChange = norm(next.b);
      setEpochs(1);
      return { correct: prediction === 0, before: `||B||F = 0; ||A||F = ${fmt(norm(initial.a), 6)}`, after: `||ΔA||F = ${fmt(aChange, 6)}; ||ΔB||F = ${fmt(bChange, 6)}`, explanation: 'Градиент A содержит множитель B, поэтому он нулевой на первом шаге. Ненулевая A даёт градиент для B. Кнопка выполнила первую эпоху.' };
    }} />
    <p className="note">Это маленькая линейная регрессия без оптимизатора Adam, dropout и quantization. Held-out здесь — учебная проверочная выборка, а не гарантия качества на реальных данных. При r меньше ранга истинного обновления точное представление этого обновления невозможно.</p>
    <p className="note">Источник: <a href="https://arxiv.org/abs/2106.09685" target="_blank" rel="noreferrer">Hu et al.: LoRA: Low-Rank Adaptation of Large Language Models</a>. Матрицы W₀ + BA реализуют механизм адаптации; маленькая задача не воспроизводит эксперименты статьи с LLM.</p>
  </section></CoreTopicFilm>;
}
