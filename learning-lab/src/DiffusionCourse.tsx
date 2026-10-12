import { PracticeSection } from './practice/PracticeCloudProvider';
import { practiceChapter } from './practice/placement';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConceptLink, useLearningActive } from './learning-context';
import { Chart, Exercise, Range, fmt } from './ui';
import { Scene3D } from './ThreeD';
import { diffusionDensityScene } from './generativeSceneMath';
import {
  DATA_MEAN, DATA_STD, DENOISER_HIDDEN, DENOISER_PARAMETERS, DIFFUSION_STEPS,
  diffusionSchedule, forwardNoise, forwardTrajectory, noisyDataDensity, normalDensity,
  optimalEpsilon, guidedEpsilon, predictEpsilon, estimateClean, posteriorParameters, ddpmStep, ddimStep,
  initialTraining, trainDenoiser, sampleTrajectory, sampleDistribution, diffusionHistogram,
} from './diffusionMath';
import type { DiffusionSchedule, NoiseSchedule, DiffusionTraining, DiffusionSampler } from './diffusionMath';
import './diffusion-course.css';

const curve = (f: (x: number) => number, min = -4, max = 4, count = 161) => Array.from({ length: count }, (_, i) => {
  const x = min + (max - min) * i / (count - 1);
  return { x, y: f(x) };
});

function Lead({ idea, experiment }: { idea: ReactNode; experiment: ReactNode }) {
  return <><p className="dc-idea">{idea}</p><p className="dc-prompt"><strong>Попробуйте.</strong> {experiment}</p></>;
}

function Numbers({ items }: { items: { label: string; value: number; note?: string }[] }) {
  return <dl className="dc-numbers">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{fmt(item.value, 4)}</dd>{item.note && <small>{item.note}</small>}</div>)}</dl>;
}

function ForwardDensityScene({ schedule, t }: { schedule: DiffusionSchedule; t: number }) {
  const scene = useMemo(() => diffusionDensityScene(schedule, t), [schedule, t]);
  const a = schedule.alphaBar[t], mean = Math.sqrt(a) * DATA_MEAN, sd = Math.sqrt(a * DATA_STD ** 2 + 1 - a);
  return <>
    <p>Разрежьте поверхность поперёк оси t: получится плоская кривая плотности из графика выше. Проследите, как две вершины сближаются и превращаются в одну. <strong>Данные всё ещё одномерные</strong>: ось t — номер шага процесса, а высота — плотность, не дополнительные координаты примера.</p>
    <Scene3D title="Как шум меняет распределение" description="Оси: значение x, шаг t и плотность qₜ(x). Оранжевая линия показывает текущий шаг из ползунка выше."
      axes={[{ label: 'Значение x · одно число', min: -4, max: 4 }, { label: 'Шаг t · время процесса', min: 0, max: schedule.steps }, { label: 'Плотность qₜ(x)', min: 0, max: scene.densityMax }]}
      surfaces={[{ name: 'Плотность qₜ(x)', rows: scene.rows, color: '#427e7a', opacity: .42 }]}
      lines={[{ name: `Текущий срез t = ${t}`, points: scene.slice, color: '#b75b21' }]} />
    <p className="dc-answer">t=<strong>{t}</strong>; ᾱₜ={fmt(a, 5)}; центры групп ±{fmt(mean)}; σₜ={fmt(sd)}. При x=0 плотность qₜ(0)={fmt(noisyDataDensity(0, t, schedule), 5)}.</p>
    <p className="note">Показано окно x∈[−4;4]; ненулевые хвосты за краями не обрезаются в формуле. Поверхность соединяет срезы t=0,2,…,64 плоскими гранями, а оранжевый срез вычислен точно для выбранного целого t, включая нечётные шаги. Это плотность известной смеси, не прогноз обучаемой сети.</p>
    <details><summary>Плоский срез и точная формула</summary>
      <Chart series={[{ name: `qₜ(x), t=${t}`, points: scene.slice.map(p => ({ x: p[0], y: p[2] })) }]} xLabel="Значение x" yLabel="Плотность qₜ(x)" xDomain={[-4, 4]} yDomain={[0, 1]} />
      <p className="formula">mₜ=1,5√ᾱₜ; vₜ=0,28²ᾱₜ+1−ᾱₜ<br />qₜ(x)=½ N(x;−mₜ,vₜ)+½ N(x;+mₜ,vₜ)<br />mₜ={fmt(mean, 5)}; vₜ={fmt(sd ** 2, 5)}</p>
      <p>Ползунок t над сценой выбирает этот же срез. x₀ и ε меняют отдельный пример, поэтому не меняют поверхность всех данных. Расписание в начале главы меняет поверхность целиком.</p>
    </details>
  </>;
}

function ForwardLesson({ schedule }: { schedule: DiffusionSchedule }) {
  const [t, setT] = useState(24), [x0, setX0] = useState(1.5), [epsilon, setEpsilon] = useState(-0.8), [seed, setSeed] = useState(17);
  const [showDensityScene, setShowDensityScene] = useState(false);
  const bar = schedule.alphaBar[t], signal = Math.sqrt(bar) * x0, noise = Math.sqrt(1 - bar) * epsilon;
  const path = useMemo(() => forwardTrajectory(x0, schedule, seed), [x0, schedule, seed]);
  return <>
    <Lead idea={<>Сначала научимся портить данные предсказуемым способом. Наши данные — одно число: чаще около −1,5 или +1,5. На каждом шаге его немного сжимаем к нулю и добавляем <ConceptLink concept="gaussian">гауссов шум</ConceptLink>. Две группы постепенно смешиваются.</>} experiment={<>Сдвиньте t от 0 до 64 и проследите две вершины плотности. Затем измените ε при неизменном t: степень зашумления останется той же, но конкретное число xₜ изменится.</>} />
    <div className="dc-columns"><section className="panel"><h4>Один пример, одна порция шума</h4>
      <Range label="Шаг t · 0 означает чистые данные" value={t} min={0} max={schedule.steps} step={1} onChange={setT} />
      <Range label="Исходное число x₀" value={x0} min={-2.5} max={2.5} step={.1} onChange={setX0} />
      <Range label="Реализация шума ε" value={epsilon} min={-3} max={3} step={.1} onChange={setEpsilon} />
      <div className="dc-flow" aria-label="Вклад данных и шума"><span>Сигнал<br /><strong>{fmt(signal)}</strong></span><b>+</b><span>Шум<br /><strong>{fmt(noise)}</strong></span><b>=</b><span>xₜ<br /><strong>{fmt(signal + noise)}</strong></span></div>
      <p className="formula">xₜ = √ᾱₜ · x₀ + √(1−ᾱₜ) · ε<br />= {fmt(Math.sqrt(bar))} × {fmt(x0)} + {fmt(Math.sqrt(1 - bar))} × {fmt(epsilon)}</p>
      <p>ε — обычное число из N(0,1); его стандартное отклонение равно 1. Множитель √(1−ᾱₜ) задаёт масштаб добавленного шума. Ползунок выбирает пример ε вручную.</p>
      <Numbers items={[{ label: 'αₜ · один шаг', value: schedule.alpha[t] }, { label: 'ᾱₜ · накопленный сигнал', value: bar }, { label: 'Условная дисперсия', value: 1 - bar }]} />
    </section><section className="panel"><h4>Что происходит со всеми данными</h4>
      <Chart series={[{ name: 'Чистые данные q₀', points: curve(x => noisyDataDensity(x, 0, schedule)), dashed: true }, { name: `Зашумлённые qₜ, t=${t}`, points: curve(x => noisyDataDensity(x, t, schedule)), color: '#a45b27' }]} xLabel="Значение x" yLabel="Плотность" xDomain={[-4, 4]} yDomain={[0, 1]} />
      <p className="dc-answer">Центры групп: ±{fmt(Math.sqrt(bar) * DATA_MEAN)}. Их стандартное отклонение: {fmt(Math.sqrt(bar * DATA_STD ** 2 + 1 - bar))}.</p>
      <p>Кривая показывает распределение всех возможных примеров, поэтому ползунки x₀ и ε её не меняют. Высота — плотность, а <ConceptLink concept="probability">вероятность</ConceptLink> интервала равна площади под кривой.</p>
      <p className="note">Данные: ½ N(−1,5; 0,28²) + ½ N(+1,5; 0,28²). В N(μ; σ²) второе число — дисперсия. При t=64 распределение близко к N(0,1), но при конечном ᾱₜ&gt;0 совпадение не точное.</p>
    </section></div>
    <details onToggle={event => { if (event.currentTarget.open) setShowDensityScene(true); }}><summary>3D: как шум меняет распределение</summary>
      {showDensityScene && <ForwardDensityScene schedule={schedule} t={t} />}
    </details>
    <details><summary>Расписание β, накопление ᾱ и настоящая траектория</summary>
      <p><ConceptLink concept="noise-schedule">Расписание шума</ConceptLink> задаёт βₜ — дисперсию нового шума на одном шаге. αₜ=1−βₜ. Накопленная ᾱₜ — произведение всех α от 1 до t, а не их сумма. Поэтому βₜ и 1−ᾱₜ описывают разные вещи.</p>
      <div className="dc-columns"><section className="panel"><h4>От одного шага ко всем шагам</h4><Chart series={[{ name: 'βₜ', points: schedule.beta.map((y, x) => ({ x, y })) }, { name: 'ᾱₜ', points: schedule.alphaBar.map((y, x) => ({ x, y })), color: '#a45b27' }]} xLabel="Шаг t" yLabel="Коэффициент" xDomain={[0, schedule.steps]} yDomain={[0, 1]} /><p className="formula">q(xₜ|xₜ₋₁)=N(√αₜ xₜ₋₁, βₜ)<br />ᾱₜ = ∏ₛ₌₁ᵗ αₛ; ᾱ₀=1<br />q(xₜ|x₀)=N(√ᾱₜ x₀, 1−ᾱₜ)</p><p>Последняя формула позволяет сразу получить выбранный t без вычисления предыдущих шагов. Сумма независимых нормальных шумов остаётся нормальной.</p></section>
      <section className="panel"><h4>Одна марковская цепь</h4><Chart series={[{ name: 'Случайная траектория', points: path.map((y, x) => ({ x, y })) }]} xLabel="Прямой шаг t" yLabel="Число xₜ" xDomain={[0, schedule.steps]} /><button onClick={() => setSeed(seed + 1)}>Другая траектория · seed {seed}</button><p>На каждом шаге здесь новый независимый шум zₜ. При текущем t={t} цепь дала xₜ={fmt(path[t])}. Это другой случайный эксперимент, чем ручной ε выше.</p><p>Если во всех прямых формулах удерживать один и тот же ε, получится связанная кривая с правильными срезами q(xₜ|x₀), но это не та же <ConceptLink concept="markov-chain">марковская цепь</ConceptLink>.</p></section></div>
    </details>
    <Exercise question="При t=0 формула обязана вернуть…" options={['Исходное x₀, независимо от ε', 'Чистый шум ε', 'Среднее двух групп: 0']} correct={0} explanation="ᾱ₀=1. Коэффициент при x₀ равен 1, при шуме — 0. Шум ещё не добавлен." />
  </>;
}

function TrainingLesson({ schedule, training, remaining, learningRate, setLearningRate, run, pause, reset }: {
  schedule: DiffusionSchedule; training: DiffusionTraining; remaining: number; learningRate: number; setLearningRate: (x: number) => void; run: (count: number) => void; pause: () => void; reset: () => void;
}) {
  const [t, setT] = useState(20), [x0, setX0] = useState(1.5), [epsilon, setEpsilon] = useState(-.8);
  const xt = forwardNoise(x0, epsilon, t, schedule), prediction = predictEpsilon(training.model, xt, t, schedule);
  const optimal = optimalEpsilon(xt, t, schedule), xhat = estimateClean(xt, prediction, t, schedule);
  return <>
    <Lead idea={<>Модель получает только xₜ и номер шага t. Её задача — предсказать добавленный шум ε. Во время обучения мы сами создаём шум, поэтому знаем правильную цель. Кнопка ниже действительно меняет веса маленькой нейросети.</>} experiment={<>Запустите 2 000 обновлений. Сравните кривую нейросети с точным условным средним, затем поменяйте t. Ошибка отдельного примера и ошибка всей проверочной выборки могут двигаться по-разному.</>} />
    <div className="dc-columns"><section className="panel"><h4>Обучение здесь, в браузере</h4>
      <div className="dc-flow"><span>(xₜ, t)</span><b>→</b><span>{DENOISER_HIDDEN} tanh-нейрона</span><b>→</b><span>ε̂θ</span></div>
      <p>{DENOISER_PARAMETERS} обучаемых чисел; каждый batch содержит 64 новых примера. Берём случайные x₀, t∈{'{1,…,64}'} и ε∼N(0,1), вычисляем MSE, <ConceptLink concept="backpropagation">обратное распространение</ConceptLink> и шаг Adam.</p>
      <Range label="Скорость обучения Adam" value={learningRate} min={.001} max={.01} step={.001} onChange={setLearningRate} />
      <div className="button-row"><button disabled={remaining > 0 || training.updates >= 6000} onClick={() => run(100)}>+100 обновлений</button><button className="primary" disabled={remaining > 0 || training.updates >= 6000} onClick={() => run(2000)}>Обучить ещё 2 000</button>{remaining > 0 && <button onClick={pause}>Пауза</button>}<button onClick={reset}>Сбросить веса</button></div>
      <p role="status" className="dc-answer">{remaining > 0 ? `В работе: ${training.updates} обновлений; осталось ${remaining}.` : `Выполнено ${training.updates} обновлений.`} {training.updates >= 6000 && 'Учебный предел — 6 000. Можно сбросить веса.'}</p>
      <p className="note">Обучение идёт короткими порциями и останавливается при уходе из раздела. Веса сохраняются до сброса или смены расписания. Модель не загружается с сервера.</p>
      <Chart series={[{ name: 'MSE на 512 фиксированных проверочных примерах', points: training.history }]} xLabel="Обновления весов" yLabel="Проверочная MSE" xDomain={[0, Math.max(100, training.updates)]} yDomain={[0, Math.max(1, ...training.history.map(p => p.y)) * 1.08]} />
      <p>Последняя проверка: {fmt(training.history.at(-1)!.y)} на шаге {training.history.at(-1)!.x}. {training.batchLoss !== null && `MSE последнего учебного batch до его обновления: ${fmt(training.batchLoss)}.`}</p>
      <p>Проверочные примеры не используются для градиентов. Фиксированный seed делает сравнение повторяемым; это не гарантия качества на всех данных. Каждый шаг не обязан снижать loss.</p>
    </section><section className="panel"><h4>Какую функцию научилась считать сеть</h4>
      <Range label="Шаг шума t для графика и примера" value={t} min={1} max={schedule.steps} step={1} onChange={setT} />
      <Chart series={[{ name: 'Обучаемая сеть ε̂θ(xₜ,t)', points: curve(x => predictEpsilon(training.model, x, t, schedule)) }, { name: 'Точное E[ε|xₜ,t] известной смеси', points: curve(x => optimalEpsilon(x, t, schedule)), color: '#a45b27', dashed: true }]} xLabel="Вход xₜ" yLabel="Предсказание ε" xDomain={[-4, 4]} />
      <p>Пунктир — аналитический ориентир для нашей известной смеси. Он не участвует в обучении и не знает конкретный ε. Сеть видит случайные зашумлённые примеры, а не эту кривую.</p>
      <Range label="Чистое x₀ отдельного примера" value={x0} min={-2.5} max={2.5} step={.1} onChange={setX0} /><Range label="Добавленный ε отдельного примера" value={epsilon} min={-3} max={3} step={.1} onChange={setEpsilon} />
      <Numbers items={[{ label: 'Вход сети xₜ', value: xt }, { label: 'Ответ сети ε̂', value: prediction }, { label: 'Истинный ε', value: epsilon }, { label: 'MSE этого примера', value: (prediction - epsilon) ** 2 }, { label: 'Оценка чистого x̂₀', value: xhat }, { label: 'Ориентир E[ε|xₜ,t]', value: optimal }]} />
      <p className="note">Ползунки разбирают отдельный пример. Они не подменяют случайные 64 примера учебного batch.</p>
    </section></div>
    <details><summary>Почему нельзя всегда угадать шум и получить нулевую ошибку</summary>
      <p>Один xₜ мог получиться из разных x₀ и разных ε. Без исходного x₀ задача неоднозначна. Для квадратичной <ConceptLink concept="loss">ошибки</ConceptLink> лучший возможный ответ — <ConceptLink concept="conditional-expectation">условное среднее</ConceptLink> ε при известных xₜ,t, а не обязательно шум именно этого примера.</p>
      <p className="formula">Lsimple(θ)=Eₓ₀,ₜ,ε[(ε−ε̂θ(√ᾱₜ x₀+√(1−ᾱₜ) ε,t))²]<br />ε*(xₜ,t)=E[ε | xₜ,t]<br />x̂₀=(xₜ−√(1−ᾱₜ) ε̂θ)/√ᾱₜ</p>
      <p>В точном оптимуме x̂₀ становится E[x₀|xₜ,t]. Например, около xₜ=0 две группы могут быть одинаково правдоподобны: их среднее попадёт между вершинами. Для генерации нужен весь обратный процесс, а не одна попытка получить x̂₀ из почти чистого шума.</p>
      <p>Прогнозируется суммарный ε из прямой формулы, а не последний zₜ марковской траектории. MSE — простая невзвешенная цель DDPM; она связана с вариационной оценкой через <ConceptLink concept="kl-divergence">KL-дивергенции</ConceptLink>, но не равна полному negative ELBO без весов и граничных членов.</p>
    </details>
    <details><summary>Все вычисления сети и градиента</summary>
      <p className="formula">u=t/64; f=[xₜ/2, 2u−1, sin(πu), cos(πu)]<br />hⱼ=tanh(Σₖ wⱼₖ fₖ+bⱼ), j=1…24<br />ε̂θ=a·xₜ+b+Σⱼ vⱼhⱼ<br />∂ℓ/∂ε̂=2(ε̂−ε); ∂tanh(z)/∂z=1−tanh²(z)</p>
      <p>Инициализация: a=1, b=0, остальные веса — маленькие воспроизводимые случайные числа. Линейная ветка a·xₜ тоже обучается. Четыре входных признака фиксированы; производные обновляют все 146 весов и смещений.</p>
      <p>Adam накапливает среднее градиента m и среднее квадрата v с коэффициентами 0,9 и 0,999, исправляет их начальное смещение и делает θ←θ−η m̂/(√v̂+10⁻⁸). <ConceptLink concept="learning-rate">η</ConceptLink> регулируется ползунком. Это настоящие численные обновления, а не нарисованная кривая loss.</p>
    </details>
    <Exercise question="Вход xₜ совместим с несколькими чистыми примерами. Что минимизирует ожидаемую MSE?" options={['Точный шум каждого из них одновременно', 'Условное среднее шума при этом xₜ и t', 'Всегда нулевой шум']} correct={1} explanation="Квадратичная ошибка минимальна в условном среднем. Неустранимая неоднозначность может оставлять ненулевую MSE даже у идеального предиктора." />
  </>;
}

function ReverseStepLesson({ schedule, training }: { schedule: DiffusionSchedule; training: DiffusionTraining }) {
  const [t, setT] = useState(24), [x0, setX0] = useState(1.5), [epsilon, setEpsilon] = useState(-.8), [z, setZ] = useState(.7), [known, setKnown] = useState(false);
  const xt = forwardNoise(x0, epsilon, t, schedule), predicted = predictEpsilon(training.model, xt, t, schedule);
  const used = known ? epsilon : predicted, step = ddpmStep(xt, used, t, schedule, z), truePosterior = posteriorParameters(xt, x0, t, schedule);
  const sd = Math.sqrt(step.variance), min = Math.min(step.mean, truePosterior.mean) - Math.max(.25, 3.5 * sd), max = Math.max(step.mean, truePosterior.mean) + Math.max(.25, 3.5 * sd);
  return <>
    <Lead idea={<>Убрать шум — не значит просто вычесть предсказанное ε. Обратный шаг DDPM сначала вычисляет среднее μθ, затем, кроме последнего шага, добавляет новый независимый шум. Так получается случайный xₜ₋₁.</>} experiment={<>Сначала меняйте z: среднее останется на месте, а выбранный xₜ₋₁ сдвинется. Затем поставьте t=1 — дополнительный шум исчезнет. Режим «знаем исходный пример» показывает, что доступно только во время разбора.</>} />
    <div className="dc-columns"><section className="panel"><h4>Разобрать переход t → t−1</h4>
      <Range label="Исходный шаг t" value={t} min={1} max={schedule.steps} step={1} onChange={setT} /><Range label="Чистое x₀ для учебного примера" value={x0} min={-2.5} max={2.5} step={.1} onChange={setX0} /><Range label="ε, которым испорчен пример" value={epsilon} min={-3} max={3} step={.1} onChange={setEpsilon} />
      <label>Предиктор в обратном шаге<select value={known ? 'known' : 'learned'} onChange={e => setKnown(e.target.value === 'known')}><option value="learned">Наша сеть · {training.updates} обновлений</option><option value="known">Знаем x₀ и ε · недоступно при генерации</option></select></label>
      <Range label="Новый независимый шум z" value={z} min={-3} max={3} step={.1} onChange={setZ} />
      <p className="dc-answer">xₜ₋₁ = {fmt(step.mean)} + {fmt(sd)} × {t === 1 ? '0' : fmt(z)} = <strong>{fmt(step.next)}</strong></p>
      <p>{known ? 'Здесь мы подставили настоящий ε, потому что сами создали пример. Получен точный q(xₜ₋₁|xₜ,x₀), а не работа обученной сети.' : `Сеть использует только xₜ=${fmt(xt)} и t=${t}. Исходное x₀ на её вход не поступает.`}</p>
      <p>{t === 1 ? 'При t=1 выбранная обратная дисперсия равна нулю; финальный шаг возвращает x̂₀. Ползунок z ничего не меняет.' : 'z не тот шум ε, который мы добавляли к x₀. При настоящем sampling на каждом обратном шаге выбирается новый z∼N(0,1).'}</p>
    </section><section className="panel"><h4>От предсказания к распределению шага</h4>
      <Numbers items={[{ label: 'Текущее xₜ', value: xt }, { label: 'Использованный ε̂', value: used }, { label: 'Оценка x̂₀', value: step.x0 }, { label: 'Среднее μθ', value: step.mean }, { label: 'Дисперсия β̃ₜ', value: step.variance }, { label: 'Выбранное xₜ₋₁', value: step.next }]} />
      {t > 1 ? <Chart series={[{ name: known ? 'Posterior с известным x₀' : 'Гауссов шаг нашей модели', points: curve(x => normalDensity(x, step.mean, step.variance), min, max) }, { name: 'Posterior, если знать x₀', points: curve(x => normalDensity(x, truePosterior.mean, truePosterior.variance), min, max), dashed: true, color: '#a45b27' }]} xLabel="Возможное xₜ₋₁" yLabel="Условная плотность" xDomain={[min, max]} /> : <p className="dc-endpoint">t=1 → 0<br /><strong>Выход {fmt(step.next)}</strong><span>Дисперсия 0: точка, а не обычная гауссова плотность.</span></p>}
      <p className="note">Пунктир обусловлен настоящим x₀. Совпадение с ним на одном примере не является общей целью MSE: сеть может знать только условное среднее по возможным x₀. Даже идеальное ε*(xₜ,t) не делает один гауссов шаг точным обратным распределением произвольной смеси при конечном шаге.</p>
    </section></div>
    <details><summary>Точный posterior, приближение модели и формула DDPM</summary>
      <p>Прямая цепь известна. По формуле условного гауссова распределения можно вычислить q(xₜ₋₁|xₜ,x₀), если дано x₀. Во время генерации x₀ неизвестно, поэтому модель подставляет свою оценку x̂₀ в формулу среднего.</p>
      <p className="formula">β̃ₜ = βₜ (1−ᾱₜ₋₁)/(1−ᾱₜ)<br />μ̃ₜ(xₜ,x₀) = [√ᾱₜ₋₁ βₜ/(1−ᾱₜ)] x₀ + [√αₜ (1−ᾱₜ₋₁)/(1−ᾱₜ)] xₜ<br />μθ = (xₜ − βₜ ε̂θ / √(1−ᾱₜ)) / √αₜ<br />xₜ₋₁ = μθ + √β̃ₜ z, z∼N(0,1), при t&gt;1<br />x₀ = μθ при t=1</p>
      <p>Сейчас веса при чистом и зашумлённом значении: {fmt(step.cleanWeight)} и {fmt(step.noisyWeight)}. Их сумма не обязана равняться 1. Обратная <ConceptLink concept="variance">дисперсия</ConceptLink> в этой реализации фиксирована как β̃ₜ. Другие DDPM используют βₜ либо обучаемую дисперсию; переключателя этих вариантов здесь нет.</p>
      <p>q(xₜ₋₁|xₜ,x₀) и q(xₜ₋₁|xₜ) — разные распределения. Второе усредняет по неизвестному x₀ и для наших двух групп обычно не является одним точным гауссианом. Модель pθ(xₜ₋₁|xₜ) его приближает.</p>
    </details>
    <Exercise question="Почему на обратном шаге DDPM снова добавляют шум?" options={['Чтобы случайно испортить хороший ответ', 'Чтобы выбирать из условного распределения, а не всегда брать его среднее', 'Потому что сеть вообще не обучалась']} correct={1} explanation="Денойзинг оценивает распределение возможного предыдущего состояния. μθ задаёт его центр; новый z создаёт случайный выбор. В нашей реализации на последнем шаге z=0." />
  </>;
}

function SamplingLesson({ schedule, training, active }: { schedule: DiffusionSchedule; training: DiffusionTraining; active: boolean }) {
  const [sampler, setSampler] = useState<DiffusionSampler>('ddpm'), [evaluations, setEvaluations] = useState(16), [initial, setInitial] = useState(.6), [noiseSeed, setNoiseSeed] = useState(31), [sampleSeed, setSampleSeed] = useState(120), [reference, setReference] = useState(false), [preview, setPreview] = useState(32);
  const result = useMemo(() => {
    if (!active) return null;
    const predict = (x: number, t: number) => reference ? optimalEpsilon(x, t, schedule) : predictEpsilon(training.model, x, t, schedule);
    const first = sampleTrajectory(predict, schedule, sampler, initial, noiseSeed, evaluations);
    const second = sampleTrajectory(predict, schedule, sampler, initial, noiseSeed + 1, evaluations);
    const samples = sampleDistribution(predict, schedule, sampler, 256, sampleSeed, evaluations);
    return { first, second, samples, histogram: diffusionHistogram(samples) };
  }, [active, schedule, training.model, reference, sampler, initial, noiseSeed, sampleSeed, evaluations]);
  const count = sampler === 'ddpm' ? schedule.steps : evaluations, index = Math.round(preview / schedule.steps * count);
  const checkpoint = result?.first[index];
  const predictAt = (x: number, t: number) => reference ? optimalEpsilon(x, t, schedule) : predictEpsilon(training.model, x, t, schedule);
  const demonstrationT = 32, demonstrationEpsilon = predictAt(.6, demonstrationT);
  const withoutNoise = ddpmStep(.6, demonstrationEpsilon, demonstrationT, schedule).next;
  const deterministic = ddimStep(.6, demonstrationEpsilon, demonstrationT, demonstrationT - 1, schedule).next;
  return <>
    <Lead idea={<>Генерация начинает с нового xₜ∼N(0,1) на последнем шаге T и последовательно строит x₀. Исходного чистого примера здесь нет. DDPM делает случайные переходы; DDIM с η=0 задаёт детерминированный путь при фиксированном начальном шуме.</>} experiment={<>Сначала обучите сеть в разделе 2. Здесь сравните распределение её новых чисел с данными. Затем выберите DDIM и измените seed обратного шума: две траектории совпадут. Изменение xₜ при t=T по-прежнему меняет результат.</>} />
    <div className="dc-columns"><section className="panel"><h4>Один старт — два обратных пути</h4>
      <label>Алгоритм sampling<select value={sampler} onChange={e => setSampler(e.target.value as DiffusionSampler)}><option value="ddpm">DDPM · 64 случайных шага</option><option value="ddim">DDIM · η=0, без нового шума</option></select></label>
      <label>Источник предсказания ε<select value={reference ? 'reference' : 'learned'} onChange={e => setReference(e.target.value === 'reference')}><option value="learned">Наша обучаемая сеть · {training.updates} обновлений</option><option value="reference">Аналитическое E[ε|xₜ,t] · ориентир</option></select></label>
      {sampler === 'ddim' && <Range label="Число вычислений DDIM" value={evaluations} min={4} max={64} step={4} onChange={setEvaluations} />}
      <Range label="Начальный шум xₜ при t=T · для двух путей" value={initial} min={-3} max={3} step={.05} onChange={setInitial} />
      <button onClick={() => setNoiseSeed(noiseSeed + 2)}>Новый seed обратного шума · {noiseSeed}</button>
      {result && <Chart series={[{ name: `Путь · seed ${noiseSeed}`, points: result.first.map(p => ({ x: schedule.steps - p.t, y: p.x })) }, { name: `Путь · seed ${noiseSeed + 1}`, points: result.second.map(p => ({ x: schedule.steps - p.t, y: p.x })), color: '#a45b27', dashed: true }]} xLabel="Пройдено по шкале t: от T к 0" yLabel="Значение x" xDomain={[0, schedule.steps]} />}
      <Range label="Посмотреть промежуточный шаг" value={preview} min={0} max={schedule.steps} step={1} onChange={setPreview} />
      {checkpoint && <p className="dc-answer">Вычисление {index} из {count}: t={checkpoint.t}, x={fmt(checkpoint.x)}. Конечные x₀: {fmt(result!.first.at(-1)!.x)} и {fmt(result!.second.at(-1)!.x)}.</p>}
      <p>{sampler === 'ddpm' ? 'Одинаковое xₜ при t=T, разные последующие z: два возможных результата. Seed делает случайную последовательность воспроизводимой.' : 'Здесь η=0. Смена только обратного seed не меняет путь, потому что новый шум не используется. Разные начальные xₜ при t=T по-прежнему дают разные результаты.'}</p>
    </section><section className="panel"><h4>Новые числа должны образовать распределение</h4>
      {!reference && training.updates === 0 && <p className="dc-notice">Сеть ещё не обучалась. Эта выборка показывает её начальное поведение. Обучение доступно в разделе 2.</p>}
      {reference && <p className="dc-notice">Включён аналитический ориентир, а не наша сеть. Он точно знает плотность учебной смеси, но конечный sampler всё ещё приближённый.</p>}
      {result && <><Chart series={[{ name: 'Плотность исходных данных', points: curve(x => noisyDataDensity(x, 0, schedule)), color: '#a45b27', dashed: true }, { name: `${sampler.toUpperCase()}: гистограмма 256 новых чисел`, points: result.histogram.points }]} xLabel="Сгенерированное x₀" yLabel="Плотность / гистограмма" xDomain={[-4, 4]} yDomain={[0, Math.max(.8, ...result.histogram.density) * 1.1]} />
      <Numbers items={[{ label: 'Чисел левее нуля', value: result.samples.filter(x => x < 0).length, note: 'из 256; в данных ожидается половина' }, { label: 'Вне окна [−4;4]', value: result.histogram.outside, note: 'учтены в общем числе; не скрыты перенормировкой' }]} /></>}
      <button onClick={() => setSampleSeed(sampleSeed + 1)}>Новая выборка 256 чисел · seed {sampleSeed}</button>
      <p>У каждого числа собственный случайный старт из N(0,1). Ползунок начального шума слева управляет только двумя отдельными путями и не подменяет эти 256 стартов.</p>
      <p className="note">Ступени — настоящая гистограмма с шириной интервала 0,25. Ошибка модели, 64 крупных шага, приближение начального распределения и конечная выборка мешают точному совпадению. Здесь не генерируются изображения.</p>
    </section></div>
    <details><summary>DDIM — другая формула, а не просто DDPM с z=0</summary>
      <p>Сначала обе формулы получают x̂₀ из ε̂θ. Детерминированный DDIM переносит оценку x̂₀ и направление ε̂θ сразу на выбранный меньший шаг s. Можно использовать лишь часть обучающих времён, не переобучая эту же сеть.</p>
      <p className="formula">x̂₀=(xₜ−√(1−ᾱₜ) ε̂θ)/√ᾱₜ<br />DDIM, η=0: xₛ=√ᾱₛ x̂₀ + √(1−ᾱₛ) ε̂θ, 0≤s&lt;t<br />DDPM без случайного слагаемого: xₜ₋₁=(xₜ−βₜ ε̂θ/√(1−ᾱₜ))/√αₜ</p>
      <p>Проверка на одном и том же входе x₃₂=0,6: DDPM без z даёт {fmt(withoutNoise, 5)}, а DDIM 32→31 — {fmt(deterministic, 5)}. Разница {fmt(Math.abs(withoutNoise - deterministic), 6)}. При s=0 DDIM возвращает x̂₀, потому что ᾱ₀=1.</p>
      <p>В общем семействе DDIM есть η, управляющая дополнительным шумом. Здесь реализован только η=0. Детерминированность не означает «генерируется всегда одно число»: случайность остаётся в начальном xₜ при t=T. Уменьшение числа вычислений ускоряет проход, но не гарантирует сохранения качества.</p>
    </details>
    <Exercise question="Что изменит результат DDIM с η=0 при неизменной сети?" options={['Только seed неиспользуемого обратного шума', 'Начальное xₜ при t=T или сетка времён', 'Ничего: детерминированная модель всегда выдаёт одну константу']} correct={1} explanation="Детерминированный sampler фиксирует результат при фиксированных входе, весах и сетке. Начальный шум остаётся входом и определяет конкретный результат." />
  </>;
}

function GuidanceLesson({ schedule, active }: { schedule: DiffusionSchedule; active: boolean }) {
  const [condition, setCondition] = useState<-1 | 1>(1), [scale, setScale] = useState(1), [t, setT] = useState(24), [xt, setXt] = useState(-.2);
  const current = guidedEpsilon(xt, t, schedule, condition, scale), sigma = Math.sqrt(1 - schedule.alphaBar[t]);
  const samples = useMemo(() => active ? sampleDistribution((x, step) => guidedEpsilon(x, step, schedule, condition, scale).guided, schedule, 'ddpm', 256, 407) : [], [active, schedule, condition, scale]);
  const histogram = diffusionHistogram(samples), selected = samples.filter(x => condition * x > 0).length;
  return <>
    <Lead idea={<>Условие направляет генерацию: например, «число из правой группы». Classifier-free guidance смешивает прогноз без условия и прогноз с условием. Усиление увеличивает влияние условия, но не является универсальным регулятором качества.</>} experiment={<>Выберите правую или левую группу. Сравните s=0, s=1 и s=3 по распределению результатов. Затем посмотрите в одной точке, как два прогноза складываются в управляемое направление.</>} />
    <p className="dc-notice">Здесь отдельный аналитический эксперимент: условный и безусловный прогнозы вычисляются точно из известной смеси. Маленькая сеть из раздела 2 обучена без условий и в этой демонстрации не используется. Настоящее условное обучение не запускается.</p>
    <div className="dc-columns"><section className="panel"><h4>Из двух прогнозов — одно направление</h4>
      <label>Условие c<select value={condition} onChange={e => setCondition(Number(e.target.value) as -1 | 1)}><option value={1}>Правая группа · среднее +1,5</option><option value={-1}>Левая группа · среднее −1,5</option></select></label>
      <Range label="Сила условия s" value={scale} min={0} max={5} step={.25} onChange={setScale} /><Range label="Шаг шума t для разбора" value={t} min={1} max={64} step={1} onChange={setT} /><Range label="Точка xₜ для разбора" value={xt} min={-3} max={3} step={.1} onChange={setXt} />
      <Numbers items={[{ label: 'Без условия εu', value: current.unconditional }, { label: 'С условием εc', value: current.conditional }, { label: 'Смешанный εg', value: current.guided }, { label: 'Score = −εg/σₜ', value: -current.guided / sigma }]} />
      <p className="formula">εg = εu + s(εc−εu)<br />= {fmt(current.unconditional)} + {fmt(scale)} × ({fmt(current.conditional)}−{fmt(current.unconditional)})</p>
      <p>s=0 игнорирует условие. s=1 использует условный прогноз. s&gt;1 продолжает направление дальше условного прогноза; результат не обязан оставаться между двумя числами.</p>
      <p>В исходной статье обозначено (1+w)εc−wεu. Наш ползунок использует s=1+w, поэтому «без усиления условия» соответствует s=1.</p>
    </section><section className="panel"><h4>Управление меняет выборку</h4>
      <Chart series={[{ name: 'Исходная смесь', points: curve(x => noisyDataDensity(x, 0, schedule)), color: '#a45b27', dashed: true }, { name: `DDPM с аналитическим guidance, s=${fmt(scale)}`, points: histogram.points }]} xLabel="Сгенерированное x₀" yLabel="Плотность / гистограмма" xDomain={[-4, 4]} yDomain={[0, Math.max(.8, ...histogram.density) * 1.1]} />
      <p className="dc-answer">На выбранной стороне: <strong>{selected} из {samples.length}</strong>. Вне окна [−4;4]: {histogram.outside}.</p>
      <p>Во всех положениях ползунка используются одинаковые начальные seed. Изменение распределения вызвано коэффициентом и условием, а не подменой случайной выборки. t и xₜ слева меняют только численный разбор.</p>
      <p className="note">При сильном guidance выборка может смещаться от типичных примеров и терять разнообразие. Совпадение числа знаков с условием само по себе не измеряет качество распределения.</p>
    </section></div>
    <details><summary>Почему ε связано со score — производной логарифма плотности</summary>
      <p><ConceptLink concept="score-function">Score</ConceptLink> sₜ(x)=∂log qₜ(x)/∂x показывает локальное направление роста логарифма плотности. В многомерном случае это <ConceptLink concept="gradient">градиент</ConceptLink> по всем координатам x. Это не оценка качества картинки и не число от 0 до 100.</p>
      <p className="formula">sₜ(xₜ)=−E[ε|xₜ,t]/√(1−ᾱₜ), t&gt;0<br />sθ(xₜ,t)=−ε̂θ(xₜ,t)/√(1−ᾱₜ)<br />Для нашей смеси: m=1,5√ᾱₜ; v=0,28²ᾱₜ+1−ᾱₜ<br />sₜ(x)=−[x−m tanh(mx/v)]/v</p>
      <p>Первое равенство точное для описанного гауссова зашумления и условного среднего. Второе — приближение обученной сетью. В t=0 нельзя просто делить на √(1−ᾱ₀)=0. Непрерывные score-модели связывают подобные направления с обратными SDE и probability-flow ODE; эти решатели здесь не реализованы.</p>
    </details>
    <section className="panel dc-variants"><h4>Как та же идея становится генератором изображений</h4>
      <div className="dc-table-scroll"><table className="data-table"><caption>Механизм, масштаб и границы этой главы</caption><thead><tr><th scope="col">Выбор</th><th scope="col">Что меняется</th><th scope="col">Что выполнено здесь</th></tr></thead><tbody>
        <tr><th scope="row">Предсказатель шума</th><td>Вместо MLP могут работать U-Net или Transformer, например DiT. Диффузия задаёт задачу обучения и процесс; архитектура задаёт функцию εθ.</td><td>Здесь обучаемая 1D MLP. Малые исполняемые U-Net и DiT с ручными весами — в <a href="#advanced">«Новых архитектурах»</a>.</td></tr>
        <tr><th scope="row">Условие</th><td>Модель получает класс, текст или другой сигнал. Для CFG при обучении часть условий заменяют пустым, чтобы научиться обоим прогнозам.</td><td>Точная смесь с меткой левой/правой группы. Условная сеть не обучается.</td></tr>
        <tr><th scope="row">Latent diffusion</th><td>Кодировщик переводит изображение в компактное z₀; диффузия работает в этом пространстве; декодировщик возвращает изображение.</td><td>Только схема. Кодировщика, декодировщика и скрытого пространства изображений здесь нет.</td></tr>
      </tbody></table></div>
      <div className="dc-flow" aria-label="Схема latent diffusion, только объяснение"><span>Изображение</span><b>→</b><span>Encoder → z₀</span><b>→</b><span>Диффузия в z</span><b>→</b><span>Decoder</span><b>→</b><span>Изображение</span></div>
      <p>При генерации latent diffusion начинает с шума в пространстве z, а не с исходной картинки. Сжатие уменьшает объём вычислений, но свойства кодировщика и декодировщика ограничивают результат. «Диффузия», «Transformer», «условная» и «latent» описывают разные стороны системы и могут сочетаться.</p>
    </section>
    <Exercise question="Чем является Transformer внутри diffusion-модели вроде DiT?" options={['Альтернативой прямому зашумлению, которая его отменяет', 'Архитектурой предсказателя внутри диффузионного процесса', 'Правилом случайного выбора токена из текста']} correct={1} explanation="Диффузионная задача и sampler остаются диффузионными. Transformer может вычислять нужный прогноз по зашумлённым данным, времени и условию." />
  </>;
}

const CHAPTERS = [
  { title: 'Шум', subtitle: 'Как данные превращаются в шум' },
  { title: 'Обучение', subtitle: 'Сеть учится предсказывать добавленный шум' },
  { title: 'Один шаг', subtitle: 'Что именно делает обратный шаг DDPM' },
  { title: 'Генерация', subtitle: 'DDPM, DDIM и новые данные из шума' },
  { title: 'Условие', subtitle: 'Guidance, score и переход к изображениям' },
];

export function DiffusionCourse() {
  const active = useLearningActive(), [chapter, setChapter] = useState(0), [kind, setKind] = useState<NoiseSchedule>('linear');
  const schedule = useMemo(() => diffusionSchedule(kind), [kind]);
  const [training, setTraining] = useState(() => initialTraining(schedule)), [remaining, setRemaining] = useState(0), [learningRate, setLearningRate] = useState(.003);
  const heading = useRef<HTMLHeadingElement>(null), mobileId = useId();
  useEffect(() => {
    if (!active || chapter !== 1) { if (remaining) setRemaining(0); return; }
    if (!remaining) return;
    const count = Math.min(25, remaining);
    const timer = window.setTimeout(() => { setTraining(previous => trainDenoiser(previous, schedule, count, learningRate)); setRemaining(previous => Math.max(0, previous - count)); }, 24);
    return () => window.clearTimeout(timer);
  }, [active, chapter, remaining, schedule, learningRate]);
  function changeSchedule(next: NoiseSchedule) {
    setRemaining(0); setKind(next); setTraining(initialTraining(diffusionSchedule(next)));
  }
  function reset() { setRemaining(0); setTraining(initialTraining(schedule)); }
  function moveChapter(index: number) {
    setChapter(index);
    requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }); });
  }
  return <section className="diffusion-course" aria-label="Интерактивный курс диффузионных моделей">
    <p className="dc-intro">От испорченного числа до генерации новых данных. Пять связанных экспериментов: обучение действительно меняет веса, а обратные шаги используют их предсказания. Математические ссылки открывают разбор с возвратом сюда.</p>
    <nav className="dc-chapters" aria-label="Разделы курса диффузии">{CHAPTERS.map((item, i) => <button key={item.title} aria-current={chapter === i ? 'step' : undefined} aria-pressed={chapter === i} aria-label={`${i + 1}. ${item.title}: ${item.subtitle}`} onClick={() => setChapter(i)}><span>{i + 1}</span><strong>{item.title}</strong></button>)}</nav>
    <label className="dc-mobile-navigation" htmlFor={mobileId}><span>Раздел диффузии</span><select id={mobileId} value={chapter} onChange={e => setChapter(Number(e.target.value))}>{CHAPTERS.map((item, i) => <option key={item.title} value={i}>{i + 1}. {item.title} — {item.subtitle}</option>)}</select></label>
    <div className="dc-model-setting"><label>Расписание модели · {DIFFUSION_STEPS} шага<select value={kind} onChange={e => changeSchedule(e.target.value as NoiseSchedule)}><option value="linear">Линейное β: 0,001 → 0,18</option><option value="cosine">Косинусное · ограничение β≤0,25</option></select></label><p>Смена расписания сбрасывает обучение. Сейчас: {training.updates} обновлений; ᾱ₆₄={fmt(schedule.alphaBar[64], 5)}. <span>Остальные настройки разделов сохраняются.</span></p></div>
    <div className="dc-heading"><span>Раздел {chapter + 1} из {CHAPTERS.length}</span><h2 ref={heading} tabIndex={-1}>{CHAPTERS[chapter].subtitle}</h2></div>
    <div hidden={chapter !== 0}><ForwardLesson schedule={schedule} /></div>
    <div hidden={chapter !== 1}><TrainingLesson schedule={schedule} training={training} remaining={remaining} learningRate={learningRate} setLearningRate={setLearningRate} run={count => setRemaining(Math.min(count, 6000 - training.updates))} pause={() => setRemaining(0)} reset={reset} /></div>
    <div hidden={chapter !== 2}><ReverseStepLesson schedule={schedule} training={training} /></div>
    <div hidden={chapter !== 3}><SamplingLesson schedule={schedule} training={training} active={active && chapter === 3} /></div>
    <div hidden={chapter !== 4}><GuidanceLesson schedule={schedule} active={active && chapter === 4} /></div>
    <PracticeSection lessonId="diffusion" topicId={practiceChapter('diffusion', chapter)} /><div className="dc-chapter-actions"><button disabled={chapter === 0} onClick={() => moveChapter(chapter - 1)}>← Предыдущий раздел</button><button disabled={chapter === CHAPTERS.length - 1} onClick={() => moveChapter(chapter + 1)}>Следующий раздел →</button></div>
    <details className="dc-sources"><summary>Первоисточники и точные границы реализации</summary>
      <p>Реализованы прямой гауссов процесс, две шумовые сетки, MLP с MSE и Adam, DDPM с σ²=β̃ₜ, DDIM с η=0, численная генерация и аналитическая демонстрация CFG. Все значения — JavaScript number, подписи округлены. Одномерные примеры показывают механизм, а не качество генерации изображений.</p>
      <p>Косинусная сетка использует f(t)=cos²(((t/T+0,008)/1,008)π/2), βₜ=min(0,25;1−f(t)/f(t−1)). Ограничение 0,25 — наш учебный выбор для 64 шагов. В Improved DDPM описано ограничение 0,999. Линейная сетка тоже адаптирована к короткому численному примеру, а не копирует 1 000 шагов DDPM.</p>
      <ul><li><a href="https://arxiv.org/abs/2006.11239">Ho, Jain, Abbeel — Denoising Diffusion Probabilistic Models (2020)</a>: прямой процесс, posterior, ε-параметризация, MSE, sampling.</li><li><a href="https://arxiv.org/abs/2102.09672">Nichol, Dhariwal — Improved DDPM (2021)</a>: косинусное расписание и варианты дисперсии.</li><li><a href="https://arxiv.org/abs/2010.02502">Song, Meng, Ermon — DDIM (2020)</a>: детерминированный вариант и пропуск времён.</li><li><a href="https://arxiv.org/abs/2207.12598">Ho, Salimans — Classifier-Free Diffusion Guidance (2022)</a>: совместное обучение условного и безусловного прогнозов.</li><li><a href="https://arxiv.org/abs/2011.13456">Song et al. — Score-Based Generative Modeling through SDEs (2020)</a>: score, обратный SDE и probability-flow ODE.</li><li><a href="https://arxiv.org/abs/2112.10752">Rombach et al. — Latent Diffusion Models (2021)</a>: диффузия в пространстве кодировщика.</li><li><a href="https://arxiv.org/abs/2212.09748">Peebles, Xie — Scalable Diffusion Models with Transformers (2022)</a>: архитектура DiT.</li></ul>
    </details>
  </section>;
}
