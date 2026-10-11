import { useId, useRef, useState } from 'react';
import { ConceptLink, useLearningActive } from './learning-context';
import { Chart, Exercise, Range, fmt } from './ui';
import {
  GAN_DATA, GAN_PARAMETER_NAMES, TRAINING_LIMIT, binaryCrossEntropy, ganMetrics, ganTrainStep,
  initialGan, networkTrace, normalSamples, plotPoints, sampleDensity, sigmoid, softplus,
  type GanState, type GeneratorObjective,
} from './vaeGanMath';
import './vae-gan.css';

type HistoryPoint = { step: number; dLoss: number; gLoss: number; distance: number };
type LastUpdate = { who: 'D' | 'G'; deltaD: number; deltaG: number; norm: number; clipped: boolean };
type GanRun = { model: GanState; history: HistoryPoint[]; clipped: number; message: string; last?: LastUpdate };
function record(model: GanState, objective: GeneratorObjective): HistoryPoint {
  const { dLoss, gLoss, distance } = ganMetrics(model, objective);
  return { step: model.dSteps + model.gSteps, dLoss, gLoss, distance };
}
function startRun(objective: GeneratorObjective, collapsed = false): GanRun {
  const model = initialGan(collapsed);
  return { model, history: [record(model, objective)], clipped: 0, message: collapsed ? 'Установлены почти постоянные начальные выходы G около −1,2. Это намеренно заданный старт, не результат обучения.' : 'Начальные сети готовы; ни одного обновления пока не было.' };
}
const SECTIONS = [
  ['Игра', 'Генератор предлагает, дискриминатор различает'],
  ['Градиенты', 'Две цели и два разных обратных прохода'],
  ['Обучение', 'Чередование настоящих обновлений весов'],
  ['Разнообразие', 'Почему один удачный пример ещё не победа'],
  ['Варианты', 'Conditional GAN, WGAN и границы модели'],
];
const percent = (x: number) => `${fmt(100 * x, 1)}%`;
const largestChange = (a: number[], b: number[]) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

export function GANCourse() {
  const [chapter, setChapter] = useState(0), [objective, setObjective] = useState<GeneratorObjective>('non-saturating');
  const [run, setRun] = useState(() => startRun('non-saturating'));
  const [dRate, setDRate] = useState(0.06), [gRate, setGRate] = useState(0.06), [dPerG, setDPerG] = useState(2);
  const [z, setZ] = useState(0.5), [real, setReal] = useState(1.2), [probeLogit, setProbeLogit] = useState(-5);
  const [sampleSeed, setSampleSeed] = useState(0), [zA, setZA] = useState(-1.5), [zB, setZB] = useState(1.5), [mix, setMix] = useState(0.5);
  const active = useLearningActive(), selectId = useId(), heading = useRef<HTMLHeadingElement>(null);
  const metrics = ganMetrics(run.model, objective), steps = run.model.dSteps + run.model.gSteps;
  const generated = networkTrace(run.model.generator, z);
  const fakeJudgment = networkTrace(run.model.discriminator, generated.output);
  const realJudgment = networkTrace(run.model.discriminator, real);
  const fakeScore = sigmoid(fakeJudgment.output), realScore = sigmoid(realJudgment.output);
  const dExampleLoss = binaryCrossEntropy(realJudgment.output, 1) + binaryCrossEntropy(fakeJudgment.output, 0);
  const gExampleLoss = objective === 'non-saturating' ? softplus(-fakeJudgment.output) : -softplus(fakeJudgment.output);
  const gLogitDerivative = objective === 'non-saturating' ? -sigmoid(-fakeJudgment.output) : -sigmoid(fakeJudgment.output);
  const gOutputDerivative = gLogitDerivative * fakeJudgment.inputGradient;
  const newSamples = normalSamples(64, 919 + sampleSeed).map(noise => networkTrace(run.model.generator, noise).output);
  const sampleMean = metrics.generated.reduce((sum, value) => sum + value, 0) / metrics.generated.length;
  const sampleSd = Math.sqrt(metrics.generated.reduce((sum, value) => sum + (value - sampleMean) ** 2, 0) / metrics.generated.length);
  const bridge = metrics.generated.filter(value => Math.abs(value) < 0.6).length / metrics.generated.length;
  const mixedZ = (1 - mix) * zA + mix * zB;

  function move(index: number) {
    setChapter(index);
    requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }); });
  }
  function changeObjective(value: GeneratorObjective) {
    setObjective(value);
    setRun(previous => ({ ...previous, history: [record(previous.model, value)], message: 'Цель генератора изменена. Веса сохранены; история начинается заново, чтобы не смешивать разные потери.' }));
  }
  function train(action: 'D' | 'G' | 'cycles', count = 1) {
    if (!active) return;
    setRun(previous => {
      let model = previous.model, clipped = previous.clipped, last = previous.last;
      const history = [...previous.history];
      const update = (who: 'D' | 'G') => {
        if (model.dSteps + model.gSteps >= TRAINING_LIMIT) return;
        const result = ganTrainStep(model, who, who === 'D' ? dRate : gRate, objective);
        last = { who, deltaD: largestChange(model.discriminator, result.state.discriminator), deltaG: largestChange(model.generator, result.state.generator), norm: result.norm, clipped: result.clipped };
        model = result.state; clipped += Number(result.clipped);
      };
      try {
        for (let i = 0; i < count && model.dSteps + model.gSteps < TRAINING_LIMIT; i++) {
          if (action === 'cycles') { for (let j = 0; j < dPerG; j++) update('D'); update('G'); }
          else update(action);
          if (count === 1 || i % 5 === 4 || i === count - 1 || model.dSteps + model.gSteps >= TRAINING_LIMIT) history.push(record(model, objective));
        }
        const delta = model.dSteps + model.gSteps - previous.model.dSteps - previous.model.gSteps;
        return { model, clipped, last, history: history.slice(-240), message: model.dSteps + model.gSteps >= TRAINING_LIMIT ? 'Достигнут предел 2000 обновлений двух сетей суммарно. Сбросьте сети для нового опыта.' : `Сделано ${delta} обновлений. Последним обновлялся ${last?.who ?? '—'}.` };
      } catch (error) {
        return { model, clipped, last, history, message: error instanceof Error ? error.message : 'Не удалось выполнить обновление.' };
      }
    });
  }

  return <section className="gan-course vg-course" aria-label="Интерактивный курс GAN">
    <p className="vg-intro">Здесь GAN учится создавать числа с двумя пиками около −1,2 и +1,2. Две маленькие нейросети действительно меняют веса; каждый результат можно разобрать до производной.</p>
    <nav className="vg-chapters" aria-label="Разделы курса GAN">{SECTIONS.map(([name, title], i) => <button key={name} title={title} aria-pressed={chapter === i} aria-current={chapter === i ? 'step' : undefined} onClick={() => setChapter(i)}><span>{i + 1}</span>{name}</button>)}</nav>
    <label className="vg-mobile-navigation" htmlFor={selectId}>Раздел GAN<select id={selectId} value={chapter} onChange={e => setChapter(Number(e.target.value))}>{SECTIONS.map(([name, title], i) => <option key={name} value={i}>{i + 1}. {name} — {title}</option>)}</select></label>
    <div className="vg-heading"><span>Раздел {chapter + 1} из {SECTIONS.length}</span><h2 tabIndex={-1} ref={heading}>{SECTIONS[chapter][1]}</h2></div>

    <div hidden={chapter !== 0}>
      <p className="vg-idea">Представьте ученика, который делает игрушечные яблоки, и проверяющего, который отличает их от настоящих. Ученик — генератор G. Проверяющий — дискриминатор D. Их <ConceptLink concept="adversarial-game">состязательная игра</ConceptLink> даёт генератору сигнал, какие изменения помогают.</p>
      <p className="vg-prompt"><strong>Предскажите.</strong> Два разных z обязательно дадут очень разные x? Подвигайте z и следите за G(z), а не только за оценкой D.</p>
      <div className="vg-columns"><section className="panel"><h3>Один поддельный и один настоящий пример</h3>
        <Range label="Шум z на входе генератора" value={z} min={-2.5} max={2.5} step={0.05} onChange={setZ} />
        <Range label="Настоящий пример x для разбора" value={real} min={-2} max={2} step={0.05} onChange={setReal} />
        <div className="vg-flow" aria-label="Путь сгенерированного примера"><div><small>Шум</small><strong>z = {fmt(z)}</strong></div><b>→</b><div><small>Генератор G</small><strong>x_fake = {fmt(generated.output)}</strong></div><b>→</b><div><small>Оценка D(fake)</small><strong>{percent(fakeScore)}</strong></div></div>
        <div className="vg-flow" aria-label="Путь настоящего примера"><div><small>Данные</small><strong>x_real = {fmt(real)}</strong></div><b>→</b><div><small>Та же сеть D</small><strong>{percent(realScore)}</strong></div></div>
        <p>D выдаёт число между 0 и 1: насколько этот пример похож на класс «из данных» по текущему классификатору. Это не доказательство подлинности или качества. Сейчас D оценил real в {percent(realScore)}, fake в {percent(fakeScore)}.</p>
        <p className="note">Ползунок x_real разбирает один гипотетический пример; тренировочная выборка из 64 чисел от него не меняется. Веса изменяются только кнопками обучения.</p>
        <details><summary>Что внутри обеих сетей</summary><p>Каждая сеть имеет вход из одного числа, 4 скрытых tanh-нейрона и один линейный выход: 13 параметров. У G этот выход — сгенерированное число. У D — logit s, который превращается в вероятность sigmoid(s).</p><p className="formula">hᵢ = tanh(wᵢ·input + bᵢ)<br />output = Σᵢ vᵢhᵢ + b_out<br />D(x) = sigmoid(s(x)) = 1/(1+exp(−s(x)))</p><p>Текущий logit fake={fmt(fakeJudgment.output)}. Скрытые активации G: [{generated.hidden.map(v => fmt(v)).join('; ')}]. Это нелинейные обучаемые сети, а не нарисованная заранее кривая.</p></details>
      </section><section className="panel"><h3>Игра идёт между распределениями</h3>
        <Chart xLabel="значение x" yLabel="сглаженная плотность" series={[{ name: '64 реальных числа', points: sampleDensity(GAN_DATA) }, { name: '64 выхода текущего G', points: sampleDensity(metrics.generated) }]} />
        <Chart xLabel="значение x" yLabel="D(x), вероятность класса real" yDomain={[0, 1]} series={[{ name: 'Текущий дискриминатор', points: plotPoints(value => sigmoid(networkTrace(run.model.discriminator, value).output)) }, { name: '0,5: нет предпочтения', points: [{ x: -3.5, y: 0.5 }, { x: 3.5, y: 0.5 }], dashed: true }]} />
        <p>Вверху — где лежат примеры. Внизу — как D оценивает каждое место. Уметь выдать одно число с высокой D недостаточно: G должен покрыть оба пика данных.</p>
        <p className="note">Верхние кривые сглажены Gaussian-ядром шириной 0,18. Это вид выборок, не вычисленная плотность pG(x). Кривые плотности построены только для x от −3,5 до 3,5; хвосты за пределами диапазона не показаны. Для сравнения весов всегда берутся одинаковые 64 z.</p>
      </section></div>
      <Exercise question="На шаге обучения дискриминатора какие веса надо менять?" options={['Только D; G временно зафиксирован', 'Только G', 'Обе сети одной и той же производной']} correct={0} explanation="D учится распознавать настоящие и текущие сгенерированные примеры. Обновление G — отдельный шаг с другой целью." />
    </div>

    <div hidden={chapter !== 1}>
      <p className="vg-idea">Один пример получает две разные роли. Для D подделка имеет метку 0. Для non-saturating-цели G полезно увеличить D(fake). Поэтому у сетей разные потери и разные обновляемые веса.</p>
      <div className="vg-columns"><section className="panel"><h3>Шаг D: правильно различать источники</h3>
        <p><ConceptLink concept="cross-entropy">Бинарная кросс-энтропия</ConceptLink> штрафует D за неправильный ответ. Мы суммируем два средних: по real и по fake. Это важно для масштаба loss.</p>
        <p className="formula">LD = E_real[−log D(x)] + E_z[−log(1−D(G(z)))]<br />Для одной пары: LD = softplus(−s_real) + softplus(s_fake)<br />= {fmt(binaryCrossEntropy(realJudgment.output, 1))} + {fmt(binaryCrossEntropy(fakeJudgment.output, 0))} = {fmt(dExampleLoss)}<br /><br />∂LD/∂s_real = D(real)−1 = {fmt(-sigmoid(-realJudgment.output))}<br />∂LD/∂s_fake = D(fake) = {fmt(fakeScore)}</p>
        <p>На этом шаге fake уже получен от G и рассматривается как вход D. Градиенты параметров G не применяются. Нужные веса D меняются через <ConceptLink concept="backpropagation">обратное распространение</ConceptLink>.</p>
        <details><summary>Почему считаем через logits, а не log округлённой вероятности</summary><p className="formula">softplus(s) = max(s,0) + log(1+exp(−|s|))<br />BCE(s,y) = y·softplus(−s) + (1−y)·softplus(s)</p><p>При s=1000 sigmoid округлится к 1, и прямой log(1−sigmoid(s)) даст log(0). Устойчивая формула для метки 0 всё равно возвращает конечное loss=1000. В вычислениях используются logits и log1p; никаких искусственных loss-кривых нет.</p></details>
      </section><section className="panel"><h3>Шаг G: пройти через замороженный D</h3>
        <label>Цель генератора<select value={objective} onChange={e => changeObjective(e.target.value as GeneratorObjective)}><option value="non-saturating">Non-saturating: −log D(fake)</option><option value="minimax">Minimax: log(1−D(fake))</option></select></label>
        <p className="formula">{objective === 'non-saturating' ? 'LG = E_z[−log D(G(z))] = E[softplus(−s_fake)]' : 'LG = E_z[log(1−D(G(z)))] = −E[softplus(s_fake)]'}<br />LG одного примера = {fmt(gExampleLoss)}<br />∂LG/∂s_fake = {objective === 'non-saturating' ? 'D(fake)−1' : '−D(fake)'} = {fmt(gLogitDerivative)}<br />∂s/∂x_fake = {fmt(fakeJudgment.inputGradient)}<br />∂LG/∂x_fake = {fmt(gOutputDerivative)}</p>
        <p>Мы не меняем веса D, но всё ещё используем его производную по входу. Она проводит сигнал от оценки к выходу G, а затем к весам G. Заморозить параметры и оборвать вычислительный путь — разные действия.</p>
        <p className="vg-observation">Поскольку последний параметр G — b_out, его производная для этого примера равна {fmt(gOutputDerivative)}. Малый шаг G с η={fmt(gRate)} изменил бы этот вес примерно на {fmt(-gRate * gOutputDerivative)} до усреднения minibatch и clipping.</p>
        <details><summary>Исходная minimax-игра</summary><p className="formula">min_G max_D V(D,G)<br />V = E_real log D(x) + E_z log(1−D(G(z)))</p><p>D максимизирует V; мы минимизируем LD=−V. Для G член real постоянен, поэтому исходная minimax-цель — log(1−D(fake)). Non-saturating меняет цель G на −log D(fake), сохраняя желаемое равновесие при идеальных условиях. Это предложено уже в исходной статье GAN.</p></details>
      </section></div>
      <section className="panel"><h3>Почему появился non-saturating loss</h3><p>Изолированный опыт: задайте logit подделки вручную. Эти числа не меняют модель. При уверенном «это подделка» minimax даёт слабый сигнал по logit.</p><Range label="Logit s(fake) в отдельном опыте" value={probeLogit} min={-10} max={10} step={0.25} onChange={setProbeLogit} />
        <div className="vg-stats"><div><span>D(fake)</span><strong>{percent(sigmoid(probeLogit))}</strong></div><div><span>|∂L_minimax/∂s|</span><strong>{fmt(sigmoid(probeLogit), 5)}</strong></div><div><span>|∂L_non-sat/∂s|</span><strong>{fmt(sigmoid(-probeLogit), 5)}</strong></div><div><span>Отношение модулей non-sat / minimax</span><strong>{fmt(Math.exp(-probeLogit), 1)}</strong></div></div>
        <Chart xLabel="logit подделки s" yLabel="модуль производной по s" xDomain={[-10, 10]} yDomain={[0, 1]} series={[{ name: 'Minimax', points: plotPoints(value => sigmoid(value), -10, 10) }, { name: 'Non-saturating', points: plotPoints(value => sigmoid(-value), -10, 10) }]} />
        <p>При s={fmt(probeLogit)} non-saturating сохраняет производную {fmt(-sigmoid(-probeLogit), 5)}. Но дальше она умножается на ∂s/∂x и производные G. Поэтому сильный сигнал по logit не гарантирует сильный сигнал по каждому весу.</p>
      </section>
      <Exercise question="D заморожен во время шага G. Можно ли перестать считать производную D по входу?" options={['Да, раз D не обучается', 'Нет: через эту производную G узнаёт направление изменения', 'Да, если loss положительный']} correct={1} explanation="Заморожены веса D. Выход D всё ещё зависит от G(z), поэтому цепное правило должно пройти через D обратно к генератору." />
    </div>

    <div hidden={chapter !== 2}>
      <p className="vg-idea">Нажмите отдельно D и G и проверьте, что меняется ровно одна сеть. Затем запустите пакет коротких циклов: несколько шагов D, один шаг G.</p>
      <p className="vg-prompt"><strong>Опыт.</strong> Начните с 50 циклов и смотрите на распределения, а не только на loss. Потом сделайте ещё 50: качество может колебаться, потому что соперник тоже меняется.</p>
      <div className="vg-columns"><section className="panel"><h3>Настройки и управляемые шаги</h3>
        <Range label="Шаг дискриминатора ηD" value={dRate} min={0.005} max={0.1} step={0.005} onChange={setDRate} />
        <Range label="Шаг генератора ηG" value={gRate} min={0.005} max={0.1} step={0.005} onChange={setGRate} />
        <Range label="Шагов D перед одним шагом G" value={dPerG} min={1} max={5} step={1} onChange={setDPerG} />
        <label>Цель G при обучении<select value={objective} onChange={e => changeObjective(e.target.value as GeneratorObjective)}><option value="non-saturating">Non-saturating</option><option value="minimax">Исходная minimax</option></select></label>
        <div className="button-row"><button disabled={!active || steps >= TRAINING_LIMIT} onClick={() => train('D')}>Только D: 1 шаг</button><button disabled={!active || steps >= TRAINING_LIMIT} onClick={() => train('G')}>Только G: 1 шаг</button><button className="primary" disabled={!active || steps >= TRAINING_LIMIT} onClick={() => train('cycles', 50)}>50 циклов GAN</button><button onClick={() => setRun(startRun(objective))}>Сбросить обе сети</button></div>
        <div className="vg-stats"><div><span>Обновлений D / G</span><strong>{run.model.dSteps} / {run.model.gSteps}</strong></div><div><span>LD, сумма двух средних</span><strong>{fmt(metrics.dLoss)}</strong></div><div><span>LG, {objective === 'minimax' ? 'minimax' : 'non-sat'}</span><strong>{fmt(metrics.gLoss)}</strong></div><div><span>W₁ двух выборок</span><strong>{fmt(metrics.distance)}</strong></div></div>
        <p role="status" className="vg-observation">{run.message}</p>
        {run.last && <p>Последний шаг: <strong>{run.last.who}</strong>. Максимальное изменение веса G = <strong>{fmt(run.last.deltaG, 6)}</strong>; веса D = <strong>{fmt(run.last.deltaD, 6)}</strong>. Норма градиента до ограничения {fmt(run.last.norm)}{run.last.clipped ? '; уменьшена до 10.' : '; ограничение не понадобилось.'}</p>}
        <p className="note">Каждый шаг использует 16 real или z; seed зависит от номера шага своей сети. Автоматического обучения нет. Максимум — 2000 обновлений D и G суммарно. Сброс сохраняет настройки, возвращает исходные веса и seed.</p>
        <details><summary>Смотреть все 26 весов и safeguards</summary><div className="vg-table-scroll"><table className="data-table"><caption>Два независимых набора параметров 1→4→1</caption><thead><tr><th>Параметр</th><th>Генератор G</th><th>Дискриминатор D</th></tr></thead><tbody>{GAN_PARAMETER_NAMES.map((name, i) => <tr key={name}><th scope="row">{name}</th><td>{fmt(run.model.generator[i], 5)}</td><td>{fmt(run.model.discriminator[i], 5)}</td></tr>)}</tbody></table></div><p>Применяется обычный SGD с усреднением minibatch. Норма градиента выше 10 ограничивается до 10 с сохранением направления; сработало {run.clipped} раз. Выход за |параметр|=30 останавливает опыт с сообщением. Clipping нужен для управляемого урока и не меняет определение показанных loss.</p></details>
      </section><section className="panel"><h3>Что стало с распределениями</h3>
        <Chart xLabel="значение x" yLabel="сглаженная плотность" series={[{ name: 'Данные', points: sampleDensity(GAN_DATA) }, { name: 'Текущий G', points: sampleDensity(metrics.generated) }]} />
        <p>Доля созданных значений слева от нуля: <strong>{percent(metrics.leftFraction)}</strong>; в данных ровно 50%. Это полезная проверка покрытия двух сторон, но одинаковая доля ещё не означает одинаковую форму.</p>
        <p className="note">Кривые плотности показаны только для x от −3,5 до 3,5. При обучении часть выходов G может оказаться за этим диапазоном: их хвосты не видны, но W₁ и доля слева от нуля учитывают все 64 выхода.</p>
        <Chart xLabel="всего обновлений D + G" yLabel="потери, нат" series={[{ name: 'LD', points: run.history.map(p => ({ x: p.step, y: p.dLoss })) }, { name: 'LG', points: run.history.map(p => ({ x: p.step, y: p.gLoss })) }]} />
        <Chart xLabel="всего обновлений D + G" yLabel="W₁ выборок" series={[{ name: 'Расстояние real ↔ generated', points: run.history.map(p => ({ x: p.step, y: p.distance })) }]} />
        <p>Loss пересчитаны на всех 64 real и фиксированных 64 z. W₁ — среднее расстояние между отсортированными выборками равного размера. Это отдельный показатель, <strong>он не обучает сети</strong>; перед вами BCE-GAN, а не WGAN.</p>
        <p className="note">При смене цели G история начинается заново с текущих весов. Изменение η или числа шагов D влияет на последующие обновления. Между измеренными точками график проводит прямые линии; хранятся последние 240 измерений.</p>
      </section></div>
      <Exercise question="LG вырос после того, как обновили только D. Это доказывает, что G испортился?" options={['Да, его веса стали хуже', 'Нет: G прежний, но судья изменился', 'Нет: GAN loss всегда должен расти']} correct={1} explanation="Потеря генератора зависит от дискриминатора. Тот мог лучше научиться замечать старые ошибки G. Сравнивайте образцы и покрытие распределения, а не одну loss-кривую." />
    </div>

    <div hidden={chapter !== 3}>
      <p className="vg-idea">Генератор может научиться делать один убедительный образец и почти перестать использовать z. Это называется mode collapse — потеря разнообразия или пропуск частей распределения.</p>
      <div className="vg-columns"><section className="panel"><h3>Сколько шума превращается в разные ответы</h3>
        <Chart xLabel="шум z" yLabel="выход G(z)" series={[{ name: 'Текущий генератор', points: plotPoints(value => networkTrace(run.model.generator, value).output, -3, 3) }]} />
        <div className="vg-stats"><div><span>Среднее 64 выходов</span><strong>{fmt(sampleMean)}</strong></div><div><span>Стандартное отклонение</span><strong>{fmt(sampleSd)}</strong></div><div><span>Выходов слева от нуля</span><strong>{percent(metrics.leftFraction)}</strong></div><div><span>Выходов в промежутке |x| &lt; 0,6</span><strong>{percent(bridge)}</strong></div></div>
        <p>Почти плоская G(z) означает: разные z дают близкие x. В наших данных два пика разделены пустым промежутком. Слишком много выходов в середине — тоже несовпадение распределений, даже если оба края представлены.</p>
        <div className="button-row"><button onClick={() => { setRun(startRun(objective, true)); move(2); }}>Начать с почти одного режима</button><button onClick={() => { setRun(startRun(objective)); move(2); }}>Вернуть обычный старт</button></div>
        <p className="note">Первая кнопка намеренно задаёт малые выходные веса G и bias −1,2, а затем открывает обучение. Это воспроизводимый пример плохого старта; он не выдаётся за collapse, сам возникший при обучении. Выход из него не гарантируется.</p>
      </section><section className="panel"><h3>Новая выборка без переобучения</h3>
        <Chart xLabel="значение x" yLabel="сглаженная плотность" series={[{ name: 'Данные', points: sampleDensity(GAN_DATA) }, { name: `Новая выборка №${sampleSeed + 1}`, points: sampleDensity(newSamples) }]} />
        <button onClick={() => setSampleSeed(seed => seed + 1)}>Выбрать ещё 64 z</button>
        <p>Веса не меняются. Меняется только воспроизводимая последовательность z. Для генерации нужен лишь G; D больше не участвует в прямом вычислении результата.</p>
        <p className="note">Кривые плотности построены только для x от −3,5 до 3,5. Выборка может содержать значения за этим диапазоном; часть распределения за его границами не показана.</p>
        <p>В графиках обучения z всегда фиксированы для сопоставимости. Здесь можно отдельно увидеть разброс из-за sampling. Красивые несколько точек не доказывают, что все режимы данных воспроизводятся.</p>
        <details><summary>Почему оценка D около 0,5 не сертификат успеха</summary><p>Для идеального оптимального D при равных долях real и fake: D*(x)=pdata(x)/(pdata(x)+pG(x)). Если распределения совпали, D*=0,5. Но необученный D с нулевым logit тоже выдаёт 0,5, даже при плохом G. Теоретическое условие нельзя проверять одной цифрой слабого классификатора.</p><p>При D=0,5 наши потери равны LD=2·log 2≈1,386, LG_non-sat=log 2≈0,693, LG_minimax=−log 2≈−0,693. «Обе потери стали нулём» не является целью этой игры.</p><p>Средняя текущая оценка real={percent(metrics.realScore)}, fake={percent(metrics.fakeScore)}. Она зависит и от данных, и от силы D. В реальных задачах качество и разнообразие проверяют отдельно; наша W₁ по 64 одномерным точкам не переносится напрямую на качество изображений.</p></details>
      </section></div>
      <section className="panel"><h3>Интерполяция между двумя шумовыми кодами</h3><div className="vg-columns"><div>
        <Range label="Код zA" value={zA} min={-2.5} max={2.5} step={0.1} onChange={setZA} />
        <Range label="Код zB" value={zB} min={-2.5} max={2.5} step={0.1} onChange={setZB} />
        <Range label="Доля пути t" value={mix} min={0} max={1} step={0.02} onChange={setMix} />
        <p className="formula">z(t) = (1−t)zA + t·zB = {fmt(mixedZ)}<br />G(z(t)) = <strong>{fmt(networkTrace(run.model.generator, mixedZ).output)}</strong></p>
      </div><div><Chart xLabel="доля пути t" yLabel="G(z(t))" xDomain={[0, 1]} series={[{ name: 'Путь через G', points: plotPoints(t => networkTrace(run.model.generator, (1 - t) * zA + t * zB).output, 0, 1) }, { name: 'Текущее t', points: [{ x: mix, y: networkTrace(run.model.generator, mixedZ).output }] }]} /><p>Интерполяция проходит по непрерывной функции G. Между двумя пиками она может пройти через области, где данных почти нет. Непрерывность не доказывает реалистичность каждого промежуточного примера.</p></div></div></section>
      <Exercise question="G всегда выдаёт −1,2. Это число типично для данных с пиками −1,2 и +1,2. Модель выучила распределение?" options={['Да, её пример настоящий на вид', 'Нет: правый пик полностью пропущен', 'Да, если D ошибается']} correct={1} explanation="Хорош один тип образца, но отсутствует другой. Генеративная модель должна покрывать распределение, а не только создавать один убедительный ответ." />
    </div>

    <div hidden={chapter !== 4}>
      <p className="vg-idea">У GAN нет единственной обязательной архитектуры. Можно менять информацию на входе, функцию обучения и ограничения проверяющего. Важно понимать, что именно меняется.</p>
      <section className="panel"><h3>Условная генерация: сказать, чего мы хотим</h3>
        <p>В <a href="https://arxiv.org/abs/1411.1784">conditional GAN</a> обе сети получают условие y: G(z,y) создаёт образец указанного класса, D(x,y) проверяет соответствие образца и условия. Например, y=«цифра 7» направляет генерацию, а z позволяет получать разные семёрки.</p>
        <div className="vg-flow"><div><small>Вход G</small><strong>Шум z + условие y</strong></div><b>→</b><div><small>Результат</small><strong>Образец x</strong></div><b>→</b><div><small>Вход D</small><strong>Образец x + то же y</strong></div></div>
        <p className="note">Это схема расширения. В текущих 26 параметрах нет входа y: переключатель conditional GAN не симулируется.</p>
      </section>
      <section className="panel"><h3>WGAN: другой сигнал от critic</h3>
        <p><a href="https://proceedings.mlr.press/v70/arjovsky17a.html">WGAN</a> использует critic f(x), выдающий свободное число, и ограничивает скорость изменения f: функция должна быть 1-Lipschitz. Это не вероятность класса real.</p>
        <p className="formula">W₁(pdata,pG) = sup<sub>‖f‖Lip ≤ 1</sub> (E_real f(x) − E_z f(G(z)))<br />Critic: увеличить разность средних<br />Генератор: минимизировать −E_z f(G(z))</p>
        <p>В исходной WGAN ограничивали веса critic. <a href="https://arxiv.org/abs/1704.00028">WGAN-GP</a> добавляет штраф λ·E[(‖∇x̂f(x̂)‖₂−1)²] на точках между real и fake. Этот штраф поддерживает нужное поведение critic на выбранных точках; он не является гарантией глобального свойства для любой сети.</p>
        <p className="vg-observation">График W₁ выборок в предыдущем разделе — диагностический расчёт сортировкой для 1D. Наши сети по-прежнему обучаются BCE и не используют WGAN-critic, weight clipping или gradient penalty.</p>
        <details><summary>Что значит 1-Lipschitz без страшного слова</summary><p>Если переместить вход на расстояние d, оценка critic не должна измениться более чем на d: |f(x₁)−f(x₂)|≤|x₁−x₂|. Без ограничения можно просто умножить все оценки на большое число и бесконечно увеличить разность средних, не научившись полезному сравнению.</p></details>
      </section>
      <div className="vg-table-scroll"><table className="data-table"><caption>Что действительно работает в этом уроке</caption><thead><tr><th>Механизм</th><th>Статус</th><th>Ограничение</th></tr></thead><tbody>
        <tr><th scope="row">Нейросети G и D, backprop, SGD</th><td>Реализованы</td><td>Каждая 1→4→1; данные одномерные</td></tr>
        <tr><th scope="row">Minimax и non-saturating</th><td>Обе цели вычисляются и обучают G</td><td>Сходимость не гарантирована; возможны колебания</td></tr>
        <tr><th scope="row">Mode collapse</th><td>Измерение разнообразия и почти постоянный старт</td><td>Не выдаём заданный старт за экспериментальное открытие</td></tr>
        <tr><th scope="row">Conditional GAN, WGAN, WGAN-GP</th><td>Объяснение и формулы</td><td>Дополнительные сети/ограничения не запускаются</td></tr>
        <tr><th scope="row">Генерация изображений</th><td>За пределами лаборатории</td><td>Нет свёрток, больших данных и оценки качества изображений</td></tr>
      </tbody></table></div>
      <p className="vg-observation">GAN обычно задаёт генерацию x=G(z), но не даёт удобного явного pG(x) и энкодера x→z. VAE строит вероятностный decoder и учит приближённый posterior. Это разные способы моделировать данные; «лучше» зависит от задачи, а не только от семейства.</p>
      <Exercise question="Если рядом с BCE-GAN нарисовать расстояние W₁ между выборками, он станет WGAN?" options={['Да, имя графика определяет модель', 'Нет: нужно изменить цель и ограничения critic', 'Да, если число W₁ уменьшается']} correct={1} explanation="Диагностика только измеряет результат. WGAN определяется способом обучения critic и генератора с Lipschitz-ограничением, которого у нашего BCE-дискриминатора нет." />
    </div>

    <div className="vg-chapter-actions"><button disabled={chapter === 0} onClick={() => move(chapter - 1)}>← Предыдущий раздел</button><button disabled={chapter === SECTIONS.length - 1} onClick={() => move(chapter + 1)}>Следующий раздел →</button></div>
    <details className="vg-sources"><summary>Первичные источники и воспроизводимость</summary><ul>
      <li><a href="https://arxiv.org/abs/1406.2661">Goodfellow et al. — Generative Adversarial Nets</a>: minimax, чередование шагов и non-saturating-цель; идеальное равновесие при достаточной мощности моделей.</li>
      <li><a href="https://arxiv.org/abs/1411.1784">Mirza & Osindero — Conditional Generative Adversarial Nets</a>: условие на входах обеих сетей.</li>
      <li><a href="https://proceedings.mlr.press/v70/arjovsky17a.html">Arjovsky et al. — Wasserstein GAN</a> и <a href="https://arxiv.org/abs/1704.00028">Gulrajani et al. — Improved Training of Wasserstein GANs</a>: critic и способы ограничения.</li>
    </ul><p>Все веса и loss вычисляются в браузере. Данные, normal samples и порядок minibatches воспроизводимы. В скрытых разделах обучение не продолжается: все шаги запускаются вручную. Состояние секций и упражнений сохраняется при переходах внутри главы. Это самостоятельная учебная реализация, а не воспроизведение метрик статей или запуск промышленного GAN.</p></details>
  </section>;
}
