import { useId, useMemo, useRef, useState } from 'react';
import { ConceptLink, useLearningActive } from './learning-context';
import { Chart, Exercise, Range, fmt } from './ui';
import { Scene3D } from './ThreeD';
import { vaeDensityScene } from './generativeSceneMath';
import {
  EVALUATION_NOISE, TRAINING_LIMIT, VAE_DATA, VAE_INITIAL, VAE_NOISE_SD, VAE_PARAMETER_NAMES,
  gaussianDensity, normalSamples, plotPoints, sampleDensity, vaeDecode, vaeEncode,
  vaeExpected, vaeMarginalNll, vaeTrace, vaeTrainStep, vaeTruePosterior,
} from './vaeGanMath';
import './vae-gan.css';

type VaeRun = {
  parameters: number[]; step: number; clipped: number; message: string;
  history: { step: number; nll: number; kl: number; loss: number }[];
};
const startRun = (beta: number): VaeRun => ({ parameters: [...VAE_INITIAL], step: 0, clipped: 0, message: '', history: [{ step: 0, ...vaeExpected(VAE_INITIAL, VAE_DATA, beta) }] });
const SECTIONS = [
  ['Замысел', 'Кодировать не точку, а распределение'],
  ['Вычисление', 'От случайного z к ELBO и градиентам'],
  ['Обучение', 'Шесть параметров учатся на 64 числах'],
  ['Генерация', 'Новые примеры и путь между ними'],
  ['Границы', 'β-VAE, другие варианты и честные ограничения'],
];

function VaeEncoderScene({ parameters, x, epsilon, beta }: { parameters: number[]; x: number; epsilon: number; beta: number }) {
  const scene = useMemo(() => vaeDensityScene(parameters, x, epsilon), [parameters, x, epsilon]);
  return <>
    <p>Разрежьте поверхность при выбранном x: получите обычную кривую q(z|x). Энкодер по-прежнему выдаёт <strong>одно скрытое число z</strong>; остальные оси показывают вход x и плотность. Поверхность — семейство условных плотностей, а не совместное распределение x и z.</p>
    <Scene3D title="Как энкодер распределяет коды" description="Оси: вход x, скалярный код z и плотность q(z|x). Оранжевая линия — срез при выбранном x; точка — z = μ + σε."
      axes={[{ label: 'Вход x', min: scene.xDomain[0], max: scene.xDomain[1] }, { label: 'Код z · одно число', min: scene.zDomain[0], max: scene.zDomain[1] }, { label: 'Плотность q(z|x)', min: 0, max: scene.densityMax }]}
      surfaces={[{ name: 'q(z|x) по текущим весам', rows: scene.rows, color: '#427e7a', opacity: .42 }]}
      lines={[{ name: `Срез x = ${fmt(x)}`, points: scene.slice, color: '#b75b21' }]}
      points={[{ name: 'Центр μ', position: scene.mean, color: '#325fad' }, { name: 'Выбранный z = μ + σε', position: scene.sample, color: '#b1365b' }]} />
    <p className="vg-observation">x={fmt(x)}; μ={fmt(scene.mu)}; σ={fmt(scene.sd)}; ε={fmt(epsilon)} → z=<strong>{fmt(scene.sample[1])}</strong>, q(z|x)={fmt(scene.sample[2])}. β={fmt(beta)} влияет на следующие обновления весов; при фиксированных весах изменение ε перемещает только выбранную точку.</p>
    <p className="note">В каждой строке показаны z от μ(x)−4σ(x) до μ(x)+4σ(x). Хвосты нормального распределения за этим окном не показаны; внутри около 99,994% вероятности каждого среза. Сетка 25×33 соединяет вычисленные значения плоскими гранями. Высота — плотность, она может превышать 1; вероятность интервала — площадь под отдельным срезом по z.</p>
    <details><summary>Плоский срез и численная проверка</summary>
      <Chart series={[{ name: `q(z|x), x=${fmt(x)}`, points: scene.slice.map(p => ({ x: p[1], y: p[2] })) }]} xLabel="Скрытый код z" yLabel="Плотность q(z|x)" xDomain={[scene.slice[0][1], scene.slice.at(-1)![1]]} />
      <p className="formula">q(z|x) = exp(−½((z−μ)/σ)²)/(σ√(2π))<br />q(μ|x)={fmt(scene.mean[2], 5)}; q(μ+σε|x)={fmt(scene.sample[2], 5)}</p>
      <p>Ползунки x и ε над сценой управляют этим же срезом и точкой. Обучение в следующем разделе меняет всю поверхность.</p>
    </details>
  </>;
}

export function VAECourse() {
  const [chapter, setChapter] = useState(0), [beta, setBeta] = useState(1), [rate, setRate] = useState(0.015);
  const [run, setRun] = useState(() => startRun(1));
  const [x, setX] = useState(1), [epsilon, setEpsilon] = useState(0.5), [parameter, setParameter] = useState(4);
  const [priorZ, setPriorZ] = useState(0), [outputNoise, setOutputNoise] = useState(0), [sampleSeed, setSampleSeed] = useState(0);
  const [inputA, setInputA] = useState(-1), [inputB, setInputB] = useState(2), [mix, setMix] = useState(0.5);
  const [showEncoderScene, setShowEncoderScene] = useState(false);
  const active = useLearningActive(), selectId = useId(), heading = useRef<HTMLHeadingElement>(null);
  const trace = vaeTrace(run.parameters, x, epsilon, beta);
  const expected = vaeExpected(run.parameters, [x], 1);
  const current = vaeExpected(run.parameters, VAE_DATA, beta);
  const posterior = vaeTruePosterior(run.parameters, x);
  const nllMarginal = vaeMarginalNll(run.parameters, x);
  const generatedMean = vaeDecode(run.parameters, priorZ);
  const generatedSample = generatedMean + VAE_NOISE_SD * outputNoise;
  const priorSamples = sampleSeed === 0 ? EVALUATION_NOISE : normalSamples(64, 919 + sampleSeed);
  const decoderNoise = normalSamples(64, 1511 + sampleSeed);
  const generated = priorSamples.map((z, i) => vaeDecode(run.parameters, z) + VAE_NOISE_SD * decoderNoise[i]);
  const zA = vaeEncode(run.parameters, inputA).mu, zB = vaeEncode(run.parameters, inputB).mu;
  const interpolatedZ = (1 - mix) * zA + mix * zB;
  const singleUpdate = run.parameters[parameter] - rate * trace.gradient[parameter];

  function move(index: number) {
    setChapter(index);
    requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }); });
  }
  function changeBeta(value: number) {
    setBeta(value);
    setRun(previous => ({ ...previous, message: 'β изменено: история начата заново с текущих весов.', history: [{ step: previous.step, ...vaeExpected(previous.parameters, VAE_DATA, value) }] }));
  }
  function train(count: number) {
    if (!active) return;
    setRun(previous => {
      let parameters = previous.parameters, step = previous.step, clipped = previous.clipped;
      const history = [...previous.history];
      try {
        for (let i = 0; i < Math.min(count, TRAINING_LIMIT - previous.step); i++) {
          const update = vaeTrainStep(parameters, step, rate, beta);
          parameters = update.parameters; step++; clipped += Number(update.clipped);
          if (count === 1 || step % 10 === 0 || i === count - 1 || step === TRAINING_LIMIT) history.push({ step, ...vaeExpected(parameters, VAE_DATA, beta) });
        }
        return { parameters, step, clipped, history: history.slice(-220), message: step === TRAINING_LIMIT ? 'Достигнут предел 2000 шагов. Для нового опыта сбросьте веса.' : `Выполнено ${step - previous.step} шагов; каждый использовал 16 примеров и новые воспроизводимые ε.` };
      } catch (error) {
        return { parameters, step, clipped, history, message: error instanceof Error ? error.message : 'Не удалось сделать шаг.' };
      }
    });
  }

  return <section className="vae-course vg-course" aria-label="Интерактивный курс VAE">
    <p className="vg-intro">VAE учится придумывать числа, похожие на примеры. Сначала разберём один проход, затем действительно обучим маленькую модель. Термины со стрелкой открывают объяснение с возвратом сюда.</p>
    <nav className="vg-chapters" aria-label="Разделы курса VAE">{SECTIONS.map(([name, title], i) => <button key={name} aria-pressed={chapter === i} aria-current={chapter === i ? 'step' : undefined} title={title} onClick={() => setChapter(i)}><span>{i + 1}</span>{name}</button>)}</nav>
    <label className="vg-mobile-navigation" htmlFor={selectId}>Раздел VAE<select id={selectId} value={chapter} onChange={e => setChapter(Number(e.target.value))}>{SECTIONS.map(([name, title], i) => <option key={name} value={i}>{i + 1}. {name} — {title}</option>)}</select></label>
    <div className="vg-heading"><span>Раздел {chapter + 1} из {SECTIONS.length}</span><h2 tabIndex={-1} ref={heading}>{SECTIONS[chapter][1]}</h2></div>

    <div hidden={chapter !== 0}>
      <p className="vg-idea">Представьте прибор, который описывает вкус яблока одним скрытым числом z. Для яблока x он выдаёт не единственный «верный код», а область возможных кодов. Декодер пытается по выбранному коду восстановить x.</p>
      <p className="vg-prompt"><strong>Предскажите.</strong> Если ε станет больше, куда сдвинется z? Подвигайте ε, сохраняя x: центр и ширина распределения останутся прежними.</p>
      <div className="vg-columns"><section className="panel"><h3>1. Вход → облако кодов → восстановление</h3>
        <Range label="Входное число x" value={x} min={-2} max={3} step={0.05} onChange={setX} />
        <Range label="Зафиксированный шум ε" value={epsilon} min={-2.5} max={2.5} step={0.05} onChange={setEpsilon} />
        <div className="vg-flow" aria-label="Числовой путь VAE"><div><small>Пример</small><strong>x = {fmt(x)}</strong></div><b aria-hidden="true">→</b><div><small>Энкодер q(z|x)</small><strong>μ = {fmt(trace.mu)}</strong><span>σ = {fmt(trace.sd)}</span></div><b aria-hidden="true">→</b><div><small>Выбранный код</small><strong>z = {fmt(trace.z)}</strong></div><b aria-hidden="true">→</b><div><small>Среднее декодера</small><strong>x̂ = {fmt(trace.reconstruction)}</strong></div></div>
        <p className="formula">μ = aμ·x + bμ<br />ℓ = aℓ·x + bℓ = log σ²<br />z = μ + exp(ℓ/2)·ε<br />x̂ = w·z + b</p>
        <p>Сейчас z = {fmt(trace.mu)} + {fmt(trace.sd)} × {fmt(epsilon)} = <strong>{fmt(trace.z)}</strong>. Восстановление отличается от входа на {fmt(trace.error)}.</p>
        <p className="note">Ползунки исследуют вычисление. Они не меняют веса. Кнопки обучения в разделе 3 обновят эту же модель во всех разделах.</p>
      </section><section className="panel"><h3>2. Два разных распределения</h3>
        <Chart xLabel="скрытый код z" yLabel="плотность" xDomain={[-4, 4]} series={[
          { name: 'Prior p(z) = N(0, 1)', points: plotPoints(z => gaussianDensity(z), -4, 4), dashed: true },
          { name: 'Энкодер q(z|x)', points: plotPoints(z => gaussianDensity(z, trace.mu, trace.sd), -4, 4) },
        ]} />
        <p><ConceptLink concept="latent-variable">Скрытая переменная</ConceptLink> z описывает то, что модель считает полезным. <strong>Prior</strong> p(z) — правило выбора z до наблюдения x. <strong>q(z|x)</strong> — ответ энкодера после наблюдения конкретного x; это приближение к posterior p(z|x).</p>
        <p>У кривой q центр {fmt(trace.mu)}, стандартное отклонение {fmt(trace.sd)}. Высота кривой — <ConceptLink concept="gaussian">плотность</ConceptLink>, а вероятность интервала — площадь под ней. Высота может превышать 1.</p>
        <details><summary>Почему это не обычный автоэнкодер</summary><p>Обычный автоэнкодер часто выдаёт точечный код и учится восстановлению. Здесь энкодер задаёт распределение, а decoder — вероятностную модель pθ(x|z). Выбор prior и KL связывает коды с правилом, из которого потом можно генерировать новые примеры.</p><p>«Variational» означает, что мы ищем удобное приближение qφ(z|x) к posterior. θ — параметры декодера; φ — параметры энкодера. Нормальное распределение — выбор этой модели, а не обязательное свойство любого VAE.</p></details>
      </section></div>
      <Exercise question="При генерации нового примера без входного x откуда берут z?" options={['Из prior p(z)', 'Из энкодера q(z|x), которому x неизвестен', 'Всегда берут z = 0']} correct={0} explanation="У нового примера ещё нет x для энкодера. Берём z из prior и используем декодер; среднее декодера можно превратить в случайный x с его выходным шумом." />
    </div>

    <div hidden={chapter !== 1}>
      <p className="vg-idea">У модели две заботы: объяснить пример и не унести его коды слишком далеко от prior. Для β=1 их сумма — отрицательная <ConceptLink concept="elbo">ELBO</ConceptLink>; её минимизируют.</p>
      <p className="vg-prompt"><strong>Попробуйте.</strong> Оставьте x прежним и измените ε. Реконструкция и её цена изменятся, а KL останется той же: KL сравнивает целые распределения.</p>
      <div className="vg-columns"><section className="panel"><h3>Один проход: реальные слагаемые</h3>
        <Range label="Вход x для расчёта" value={x} min={-2} max={3} step={0.05} onChange={setX} />
        <Range label="Шум ε для расчёта" value={epsilon} min={-2.5} max={2.5} step={0.05} onChange={setEpsilon} />
        <p>Decoder говорит: x имеет <ConceptLink concept="gaussian">нормальное распределение</ConceptLink> со средним x̂={fmt(trace.reconstruction)} и фиксированным σx={VAE_NOISE_SD}. Наблюдаемое число здесь x={fmt(x)}.</p>
        <p className="formula">NLL = −log p(x|z)<br />= log(σx√(2π)) + (x−x̂)²/(2σx²)<br />= {fmt(trace.nll)}<br /><br />KL(q || p) = ½(μ² + exp(ℓ) − 1 − ℓ)<br />= {fmt(trace.kl)}<br /><br />Lβ ≈ NLL + β·KL = {fmt(trace.nll)} + {fmt(beta)} × {fmt(trace.kl)} = <strong>{fmt(trace.loss)}</strong></p>
        <p><ConceptLink concept="likelihood">Правдоподобие</ConceptLink> оценивает наблюдаемый x при выбранной модели. <ConceptLink concept="kl-divergence">KL</ConceptLink> сравнивает q(z|x) с p(z), а не x с x̂. Логарифмы натуральные, единица потерь — нат.</p>
        <p className="note">NLL непрерывной плотности может быть отрицательной. Одна случайная NLL + KL — оценка цели; только математическое ожидание при β=1 точно равно −ELBO. При β≠1 мы называем сумму Lβ.</p>
      </section><section className="panel"><h3>Почему случайность не ломает производную</h3>
        <p><ConceptLink concept="reparameterization">Репараметризация</ConceptLink> выносит случайный выбор в ε. Во время обратного прохода ε — уже известное число; μ и σ остаются дифференцируемыми функциями весов.</p>
        <p className="formula">∂z/∂μ = 1<br />∂z/∂ℓ = ½·σ·ε = {fmt(trace.sd * epsilon / 2)}<br />∂L/∂μ = (∂NLL/∂z) + β·μ = {fmt(trace.dMu)}<br />∂L/∂ℓ = (∂NLL/∂z)·½σε + ½β(exp(ℓ)−1) = {fmt(trace.dLogVariance)}</p>
        <label>Посмотреть параметр<select value={parameter} onChange={e => setParameter(Number(e.target.value))}>{VAE_PARAMETER_NAMES.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label>
        <p className="vg-observation">Для {VAE_PARAMETER_NAMES[parameter]} текущий вес {fmt(run.parameters[parameter])}, градиент <strong>{fmt(trace.gradient[parameter])}</strong>. Без усреднения и ограничения градиента шаг η={fmt(rate)} дал бы {fmt(singleUpdate)}. Это расчёт одного примера, веса здесь ещё не обновлены.</p>
        <p>Обучение применяет <ConceptLink concept="chain-rule">цепное правило</ConceptLink> ко всем шести параметрам, усредняет <ConceptLink concept="gradient">градиенты</ConceptLink> 16 примеров и делает шаг против них.</p>
        <details><summary>Проверить ELBO точным posterior этой маленькой модели</summary>
          <p>В глубокой VAE posterior часто нельзя выписать просто. У нашего линейного Gaussian decoder можно: p(z|x) нормально, его μ*={fmt(posterior.mu)}, σ*²={fmt(posterior.variance)}.</p>
          <p className="formula">σ*² = σx² / (w² + σx²)<br />μ* = w(x−b)/(w²+σx²)<br />−ELBO = −log pθ(x) + KL(q(z|x) || pθ(z|x))<br />{fmt(expected.loss)} = {fmt(nllMarginal)} + {fmt(expected.loss - nllMarginal)}</p>
          <p>Здесь взято точное <ConceptLink concept="expectation">математическое ожидание</ConceptLink> реконструкции, без одного случайного ε, и β=1 независимо от регулятора обучения. Зазор неотрицателен. Его можно уменьшить, приблизив q к настоящему posterior.</p>
          <Chart xLabel="скрытый код z" yLabel="плотность" series={[{ name: 'q: энкодер', points: plotPoints(z => gaussianDensity(z, trace.mu, trace.sd)) }, { name: 'p(z|x): точный posterior', points: plotPoints(z => gaussianDensity(z, posterior.mu, Math.sqrt(posterior.variance))) }]} />
        </details>
      </section></div>
      <details onToggle={event => { if (event.currentTarget.open) setShowEncoderScene(true); }}><summary>3D: как encoder распределяет коды</summary>
        {showEncoderScene && <VaeEncoderScene parameters={run.parameters} x={x} epsilon={epsilon} beta={beta} />}
      </details>
      <Exercise question="Если μ = 0 и σ = 1, чему равен KL(q || N(0,1))?" options={['0: распределения совпадают', '1: стандартное отклонение равно 1', 'Нельзя узнать без конкретного ε']} correct={0} explanation="В формуле ½(μ²+σ²−1−log σ²) все слагаемые сокращаются. KL — свойство двух распределений, оно не зависит от выбранного ε." />
    </div>

    <div hidden={chapter !== 2}>
      <p className="vg-idea">Нажатие кнопки действительно меняет веса. Модель видит 64 фиксированных числа вокруг 0,65; на каждом шаге получает 16 из них и воспроизводимые нормальные ε.</p>
      <p className="vg-prompt"><strong>Опыт.</strong> Сделайте 100 шагов. Сравните цену реконструкции и KL. Затем увеличьте β и продолжите: новая цель сильнее наказывает отклонение кодов от prior.</p>
      <div className="vg-columns"><section className="panel"><h3>Обучаем общие веса</h3>
        <Range label="Шаг обучения η" value={rate} min={0.005} max={0.06} step={0.005} onChange={setRate} />
        <Range label="Вес KL: β" value={beta} min={0} max={4} step={0.25} onChange={changeBeta} />
        <div className="button-row"><button disabled={!active || run.step >= TRAINING_LIMIT} onClick={() => train(1)}>1 шаг VAE</button><button className="primary" disabled={!active || run.step >= TRAINING_LIMIT} onClick={() => train(100)}>100 шагов VAE</button><button onClick={() => setRun(startRun(beta))}>Сбросить веса VAE</button></div>
        <div className="vg-stats"><div><span>Шагов</span><strong>{run.step}</strong></div><div><span>NLL, ожидание</span><strong>{fmt(current.nll)}</strong></div><div><span>KL</span><strong>{fmt(current.kl)}</strong></div><div><span>Lβ</span><strong>{fmt(current.loss)}</strong></div></div>
        <p role="status" className="vg-observation">{run.message || 'Веса начальные. История содержит точку до первого обновления.'}</p>
        <p className="note">β меняет цель: при его изменении история начинается заново, веса сохраняются. η меняет только следующий шаг. Сброс возвращает исходные веса и последовательность ε при текущих β и η.</p>
        <details><summary>Все веса и точное правило обновления</summary><div className="vg-table-scroll"><table className="data-table"><caption>Энкодер: aμ, bμ, aℓ, bℓ. Декодер: w, b.</caption><thead><tr><th>Параметр</th><th>Начало</th><th>Сейчас</th></tr></thead><tbody>{run.parameters.map((value, i) => <tr key={i}><th scope="row">{VAE_PARAMETER_NAMES[i]}</th><td>{fmt(VAE_INITIAL[i])}</td><td>{fmt(value, 5)}</td></tr>)}</tbody></table></div><p>SGD: θ ← θ − η·g, где g — средний градиент 16 примеров. Если ‖g‖₂ больше 10, направление сохраняется, а длина уменьшается до 10. Это случилось {run.clipped} раз. При |веса| больше 30 опыт остановится с сообщением; максимум — 2000 шагов.</p><p>Циклические minibatches и фиксированные seed нужны для повторяемого урока. Это не оценка качества на независимом test set и не обучение большой сети на изображениях.</p></details>
      </section><section className="panel"><h3>Измеренная история обучения</h3>
        <Chart xLabel="шаг SGD" yLabel="цель, нат / пример" series={[
          { name: 'Lβ = NLL + β·KL', points: run.history.map(p => ({ x: p.step, y: p.loss })) },
          { name: 'NLL', points: run.history.map(p => ({ x: p.step, y: p.nll })) },
          { name: 'β·KL', points: run.history.map(p => ({ x: p.step, y: beta * p.kl })), dashed: true },
        ]} />
        <p>Каждая точка — пересчёт всей выборки с текущими весами. Здесь ожидание NLL считается точно: к квадрату ошибки среднего добавляется w²σ². Обучение использует случайные ε; поэтому отдельный шаг может увеличить график.</p>
        <Chart xLabel="вход x" yLabel="среднее восстановления" xDomain={[-2, 3]} yDomain={[-2, 3]} series={[{ name: 'Идеально: x̂ = x', points: plotPoints(v => v, -2, 3), dashed: true }, { name: 'decoder(μ(x))', points: plotPoints(v => vaeDecode(run.parameters, vaeEncode(run.parameters, v).mu), -2, 3) }]} />
        <p className="note">Нижняя линия использует z=μ, без шума. Потери выше учитывают весь q(z|x), а не только эту линию. Хранятся последние 220 измерений истории.</p>
      </section></div>
      <Exercise question="β выросло, суммарная цель выросла без шага SGD. Значит ли это, что веса стали хуже?" options={['Да, модель испортилась', 'Нет: изменился способ оценивания тех же весов', 'KL обязательно стал отрицательным']} correct={1} explanation="При тех же параметрах NLL и KL прежние. Новый множитель β меняет их сумму. Поэтому история при смене β начинается заново." />
    </div>

    <div hidden={chapter !== 3}>
      <p className="vg-idea">Теперь энкодер не нужен: берём z из prior, передаём декодеру и получаем распределение нового x. Путь между кодами позволяет плавно менять результат.</p>
      <div className="vg-columns"><section className="panel"><h3>Сначала z, затем новый x</h3>
        <Range label="Выбранный код z из области prior" value={priorZ} min={-2.5} max={2.5} step={0.05} onChange={setPriorZ} />
        <Range label="Выходной шум ξ" value={outputNoise} min={-2.5} max={2.5} step={0.05} onChange={setOutputNoise} />
        <div className="vg-flow"><div><small>Prior</small><strong>z = {fmt(priorZ)}</strong></div><b>→</b><div><small>Decoder mean</small><strong>{fmt(generatedMean)}</strong></div><b>→</b><div><small>Выборка x</small><strong>{fmt(generatedSample)}</strong></div></div>
        <p className="formula">z ∼ N(0,1), ξ ∼ N(0,1), независимо<br />x = w·z + b + σx·ξ<br />x = {fmt(generatedMean)} + {VAE_NOISE_SD} × {fmt(outputNoise)} = {fmt(generatedSample)}</p>
        <p>Выбор z ползунком — исследование. При настоящем sampling z и ξ случайны. Если ξ=0, показано среднее decoder; это удобная картинка, но не весь случайный механизм модели.</p>
        <button onClick={() => setSampleSeed(seed => seed + 1)}>Новая воспроизводимая выборка из 64 чисел</button>
        <p className="note">Набор №{sampleSeed + 1}. После обучения он использует новые веса и те же z/ξ, чтобы различать изменение модели и смену случайных чисел.</p>
      </section><section className="panel"><h3>Что создаёт обученная модель</h3>
        <Chart xLabel="значение x" yLabel="плотность" series={[
          { name: '64 учебных числа, сглажено', points: sampleDensity(VAE_DATA) },
          { name: 'Точная плотность модели pθ(x)', points: plotPoints(v => gaussianDensity(v, run.parameters[5], Math.sqrt(run.parameters[4] ** 2 + VAE_NOISE_SD ** 2))) },
          { name: '64 новых числа, сглажено', points: sampleDensity(generated), dashed: true },
        ]} />
        <p>У модели среднее <strong>{fmt(run.parameters[5])}</strong>, дисперсия <strong>{fmt(run.parameters[4] ** 2 + VAE_NOISE_SD ** 2)}</strong>. Это вывод из линейного decoder и независимых нормальных z и ξ; модель может создать только одну Gaussian-кривую.</p>
        <p className="note">Кривые выборок — сглаживание Gaussian-ядром с шириной 0,18, а не точные плотности. Хвосты за пределами графика существуют. Сравните их с точной кривой модели.</p>
      </section></div>
      <section className="panel"><h3>Интерполяция: дорога между двумя кодами</h3><div className="vg-columns"><div>
        <Range label="Пример A" value={inputA} min={-2} max={3} step={0.1} onChange={setInputA} />
        <Range label="Пример B" value={inputB} min={-2} max={3} step={0.1} onChange={setInputB} />
        <Range label="Доля пути t: 0 = A, 1 = B" value={mix} min={0} max={1} step={0.02} onChange={setMix} />
        <p className="formula">z(t) = (1−t)μ(A) + tμ(B)<br />= (1−{fmt(mix)}) × {fmt(zA)} + {fmt(mix)} × {fmt(zB)} = {fmt(interpolatedZ)}<br />decoder(z(t)) = <strong>{fmt(vaeDecode(run.parameters, interpolatedZ))}</strong></p>
      </div><div><Chart xLabel="доля пути t" yLabel="среднее decoder" xDomain={[0, 1]} series={[{ name: 'Путь', points: plotPoints(t => vaeDecode(run.parameters, (1 - t) * zA + t * zB), 0, 1) }, { name: 'Текущее t', points: [{ x: mix, y: vaeDecode(run.parameters, interpolatedZ) }] }]} /><p>Мы берём средние q для A и B и выключаем выходной шум. У нашего линейного decoder путь — прямая. У глубокой модели он может быть нелинейным; плавность сама по себе не гарантирует осмысленных промежуточных объектов.</p></div></div></section>
      <Exercise question="Среднее декодера и полноценная выборка из Gaussian decoder — одно и то же?" options={['Да, всегда', 'Нет: выборка ещё включает шум с σx', 'Выборка требует энкодер']} correct={1} explanation="Decoder задаёт p(x|z), здесь N(wz+b, σx²). Взять его среднее — значит выбрать центральное значение, а не учесть весь разброс." />
    </div>

    <div hidden={chapter !== 4}>
      <p className="vg-idea">VAE — способ учить вероятностную модель. Размер z, устройство сетей, prior и распределение decoder можно менять. Маленькая лаборатория показывает механизм, но не возможности всех VAE.</p>
      <section className="panel"><h3>β: удобные коды или точное восстановление?</h3><p>В <a href="https://openreview.net/forum?id=Sy2fzU9gl">β-VAE</a> коэффициент β управляет силой KL. Большой β поощряет q приблизиться к prior; за это часто приходится платить менее точным восстановлением. Это компромисс, а не универсальная настройка «лучше».</p>
        <p>Текущее β={fmt(beta)}. При β=0 связь с prior больше не штрафуется: хорошо восстановить учебные x ещё не значит хорошо генерировать из N(0,1). При β=1 возвращается обычная цель −ELBO.</p>
        <div className="button-row"><button onClick={() => { changeBeta(0); move(2); }}>Исследовать β = 0 в обучении</button><button onClick={() => { changeBeta(4); move(2); }}>Исследовать β = 4 в обучении</button></div>
        <p className="note">Кнопки сохраняют веса, меняют β и открывают обучение. Для честного сравнения запусков используйте сброс и одинаковое число шагов.</p>
        <details><summary>Posterior collapse и disentanglement</summary><p>Posterior collapse: q(z|x) приблизилось к prior и почти перестало сообщать о x; decoder может игнорировать z. Низкий KL сам по себе не доказывает, что модель хороша. В нашем линейном варианте к этому соответствует уменьшение зависимости μ от x и зависимости decoder от z.</p><p>Disentanglement — желание, чтобы разные координаты z отражали разные факторы изменений. β-VAE исследует такой эффект, но β не гарантирует понятных человеку координат. У нас одна координата, поэтому разложение нескольких факторов здесь вообще не проверяется.</p></details>
      </section>
      <div className="vg-table-scroll"><table className="data-table"><caption>Реализовано здесь и что остаётся объяснением</caption><thead><tr><th>Вариант</th><th>Что меняется</th><th>В лаборатории</th></tr></thead><tbody>
        <tr><th scope="row">Gaussian VAE</th><td>q=N(μ,σ²), prior=N(0,1), Gaussian decoder</td><td>Вычисляется и обучается; 6 линейных параметров</td></tr>
        <tr><th scope="row">β-VAE</th><td>NLL + β·KL</td><td>Коэффициент действительно меняет градиенты</td></tr>
        <tr><th scope="row">Глубокая VAE</th><td>Нелинейные сети и многомерный z</td><td>Объяснение; наши сети не моделируют изображения</td></tr>
        <tr><th scope="row">Conditional VAE</th><td>Энкодер и decoder получают условие y; prior тоже может зависеть от y</td><td>Объяснение; например, задавать класс желаемой цифры</td></tr>
        <tr><th scope="row">Другой likelihood</th><td>Bernoulli для бинарных данных, categorical для категорий</td><td>Объяснение; MSE не подходит автоматически к любым данным</td></tr>
      </tbody></table></div>
      <p className="vg-observation">Предел конкретной реализации: pθ(x) всегда нормально, потому что x=wz+b+σxξ. Два отдельных пика, богатые изображения и осмысленные признаки требуют другой мощности модели. Большая сеть сама по себе не устраняет <ConceptLink concept="overfitting">переобучение</ConceptLink>.</p>
      <Exercise question="Хорошее восстановление на учебных примерах при β=0 доказывает хорошую генерацию из prior?" options={['Да, это одно и то же', 'Нет: коды могут уйти в области, редко посещаемые prior', 'Да, если использовать больше случайного шума']} correct={1} explanation="Энкодер выбирает коды по x, а генерация берёт z из prior. Без связи между этими распределениями decoder может плохо работать на кодах, приходящих при генерации." />
    </div>

    <div className="vg-chapter-actions"><button disabled={chapter === 0} onClick={() => move(chapter - 1)}>← Предыдущий раздел</button><button disabled={chapter === SECTIONS.length - 1} onClick={() => move(chapter + 1)}>Следующий раздел →</button></div>
    <details className="vg-sources"><summary>Первичные источники и границы вычислений</summary><ul>
      <li><a href="https://arxiv.org/abs/1312.6114">Kingma & Welling — Auto-Encoding Variational Bayes</a>: ELBO, reparameterization, Gaussian KL и вероятностный encoder/decoder.</li>
      <li><a href="https://arxiv.org/abs/1906.02691">Kingma & Welling — An Introduction to Variational Autoencoders</a>: вывод и расширения VAE.</li>
      <li><a href="https://openreview.net/forum?id=Sy2fzU9gl">Higgins et al. — β-VAE</a>: компромисс восстановления и ограничения latent-представления.</li>
      <li><a href="https://proceedings.neurips.cc/paper/2015/hash/8d55a249e6baa5c06772297520da2051-Abstract.html">Sohn et al. — Learning Structured Output Representation using Deep Conditional Generative Models</a>: conditional VAE.</li>
    </ul><p>Модель одномерная и линейная, decoder σx фиксировано. Числа и градиенты вычисляются в браузере; обучение — настоящий mini-batch SGD с ограничением нормы градиента, без backend. Точные posterior и ожидание NLL доступны благодаря линейности; для общей глубокой VAE эти упрощения неприменимы. Настройки и веса сохраняются при переходе между разделами, автоматического обучения нет.</p></details>
  </section>;
}
