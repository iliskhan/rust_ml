import { useState } from 'react';
import type { AdvancedConceptDemo } from './concepts';
import { Chart, Range, fmt } from './ui';
import { adversarialLosses, bellmanExample, discountedReturn, gaussianVariational, noiseMarginal, normalDensity, normalKL, normalLogDensity, normalScore, reparameterize, twoNodeMessages } from './advancedConceptMath';

const points = (fn: (x: number) => number, min = -5, max = 5) => Array.from({ length: 121 }, (_, i) => { const x = min + (max - min) * i / 120; return { x, y: fn(x) }; });

export function AdvancedConceptExperiment({ kind }: { kind: AdvancedConceptDemo }) {
  switch (kind) {
    case 'gaussian': return <Gaussian />;
    case 'kl': return <KL />;
    case 'reparameterization': return <Reparameterization />;
    case 'variational': return <Variational />;
    case 'adversarial': return <Adversarial />;
    case 'noise': return <Noise />;
    case 'score': return <Score />;
    case 'graph': return <Graph />;
    case 'discount': return <Discount />;
    case 'bellman': return <Bellman />;
  }
}

function Gaussian() {
  const [mu, setMu] = useState(0), [sigma, setSigma] = useState(1), [x, setX] = useState(1);
  return <section className="concept-experiment" aria-label="Плотность нормального распределения">
    <Range label="Среднее μ" value={mu} min={-2} max={2} onChange={setMu} />
    <Range label="Стандартное отклонение σ" value={sigma} min={.2} max={2} onChange={setSigma} />
    <Range label="Точка x" value={x} min={-4} max={4} onChange={setX} />
    <Chart series={[{ name: 'Плотность', points: points(t => normalDensity(t, mu, sigma)) }, { name: 'Выбранная точка', points: [{ x, y: normalDensity(x, mu, sigma) }] }]} xLabel="Значение x" yLabel="Плотность p(x)" />
    <p className="concept-live">p({fmt(x)}) = {fmt(normalDensity(x, mu, sigma))}; дисперсия σ² = {fmt(sigma * sigma)}. Плотность может быть больше 1. Вероятность интервала — площадь под кривой, а вероятность одной точной точки здесь равна нулю.</p>
  </section>;
}
function KL() {
  const [mu, setMu] = useState(1), [sigma, setSigma] = useState(.7);
  return <section className="concept-experiment" aria-label="Сравнение двух распределений через KL">
    <Range label="Среднее q" value={mu} min={-2} max={2} onChange={setMu} />
    <Range label="Стандартное отклонение q" value={sigma} min={.2} max={2} onChange={setSigma} />
    <Chart series={[{ name: 'q = N(μ, σ²)', points: points(x => normalDensity(x, mu, sigma)) }, { name: 'p = N(0, 1)', points: points(x => normalDensity(x)) }]} xLabel="Значение z" yLabel="Плотность" />
    <div className="concept-numbers"><span>KL(q ‖ p) <strong>{fmt(normalKL(mu, sigma), 4)}</strong></span><span>KL(p ‖ q) <strong>{fmt(normalKL(0, 1, mu, sigma), 4)}</strong></span></div>
    <p>Сделайте μ=0 и σ=1: распределения совпадут, обе KL станут нулём. Обычно смена порядка меняет ответ. KL измеряется в натах, потому что здесь используется натуральный логарифм.</p>
  </section>;
}
function Reparameterization() {
  const [mu, setMu] = useState(1), [logVariance, setLogVariance] = useState(0), [epsilon, setEpsilon] = useState(.5);
  const result = reparameterize(mu, logVariance, epsilon);
  return <section className="concept-experiment" aria-label="Шум отдельно от обучаемых параметров">
    <Range label="Среднее μ" value={mu} min={-2} max={2} onChange={setMu} />
    <Range label="Логарифм дисперсии ℓ" value={logVariance} min={-3} max={2} onChange={setLogVariance} />
    <Range label="Один фиксированный шум ε" value={epsilon} min={-2} max={2} onChange={setEpsilon} />
    <div className="concept-flow"><span>ε = {fmt(epsilon)}</span><b>→</b><span>× σ = {fmt(result.sigma)}</span><b>→</b><span>+ μ = {fmt(mu)}</span><b>→</b><span>z = {fmt(result.z)}</span></div>
    <div className="concept-numbers"><span>∂z/∂μ <strong>{fmt(result.dMu)}</strong></span><span>∂z/∂ℓ <strong>{fmt(result.dLogVariance)}</strong></span></div>
    <p>z = μ + exp(ℓ/2)·ε. Для этого образца ε не меняется при дифференцировании. Слайдер выбирает образец вручную; в обучении ε действительно случайно берут из N(0,1).</p>
  </section>;
}
function Variational() {
  const [x, setX] = useState(1), [mu, setMu] = useState(0), [sigma, setSigma] = useState(1), [tau, setTau] = useState(.7);
  const r = gaussianVariational(x, mu, sigma, tau);
  return <section className="concept-experiment" aria-label="Точный posterior и граница ELBO">
    <p>Модель: скрытое z∼N(0,1), наблюдение x=z+шум, шум∼N(0,τ²). Приближение q(z|x)=N(μ,σ²). Здесь все средние вычисляются точно, без случайной оценки.</p>
    <Range label="Наблюдаемое x" value={x} min={-2} max={2} onChange={setX} />
    <Range label="Шум наблюдения τ" value={tau} min={.2} max={2} onChange={setTau} />
    <Range label="Среднее приближения μ" value={mu} min={-2} max={2} onChange={setMu} />
    <Range label="Отклонение приближения σ" value={sigma} min={.1} max={2} onChange={setSigma} />
    <button onClick={() => { setMu(r.posteriorMu); setSigma(r.posteriorSigma); }}>Подставить точный posterior</button>
    <Chart series={[{ name: 'Приближение q', points: points(z => normalDensity(z, mu, sigma)) }, { name: 'Точный p(z|x)', points: points(z => normalDensity(z, r.posteriorMu, r.posteriorSigma)) }]} xLabel="Скрытое z" yLabel="Плотность" />
    <div className="concept-numbers"><span>E_q log p(x|z) <strong>{fmt(r.expectedLogLikelihood)}</strong></span><span>KL(q ‖ prior) <strong>{fmt(r.klPrior)}</strong></span><span>ELBO <strong>{fmt(r.elbo)}</strong></span></div>
    <p className="concept-live">log p(x) = {fmt(r.logEvidence)}. Разрыв log p(x) − ELBO = {fmt(Math.max(0, r.gap), 6)} = KL(q ‖ posterior). При точном posterior разрыв равен нулю с точностью вычислений.</p>
  </section>;
}
function Adversarial() {
  const [logit, setLogit] = useState(-3);
  const r = adversarialLosses(logit);
  return <section className="concept-experiment" aria-label="Потери генератора и дискриминатора">
    <Range label="Логит D для подделки" value={logit} min={-8} max={8} step={.2} onChange={setLogit} />
    <Chart series={[{ name: 'G: −log D, non-saturating', points: points(x => adversarialLosses(x).nonSaturating, -8, 8) }, { name: 'G: log(1−D), minimax', points: points(x => adversarialLosses(x).minimax, -8, 8) }]} xLabel="Логит a" yLabel="Потеря генератора" />
    <div className="concept-numbers"><span>D(fake) <strong>{fmt(r.probability)}</strong></span><span>∂L_NS/∂a <strong>{fmt(r.nonSaturatingGradient)}</strong></span><span>∂L_MM/∂a <strong>{fmt(r.minimaxGradient)}</strong></span></div>
    <p>D минимизирует −log(1−D(fake)); G хочет увеличить D(fake). Когда D почти уверен в подделке, производная minimax по логиту мала. Non-saturating сохраняет более сильный сигнал. Это только один множитель: градиент до весов G ещё проходит через D и G.</p>
  </section>;
}
function Noise() {
  const [x, setX] = useState(1.5), [alpha, setAlpha] = useState(.5), [epsilon, setEpsilon] = useState(-.5);
  const r = noiseMarginal(x, alpha, epsilon);
  return <section className="concept-experiment" aria-label="Сигнал и шум в diffusion">
    <Range label="Исходное x₀" value={x} min={-2} max={2} onChange={setX} />
    <Range label="Оставшаяся доля сигнала ᾱ" value={alpha} min={0} max={1} step={.01} onChange={setAlpha} />
    <Range label="Фиксированный шум ε" value={epsilon} min={-2} max={2} onChange={setEpsilon} />
    <div className="concept-flow"><span>√ᾱ·x₀ = {fmt(r.signal)}</span><b>+</b><span>√(1−ᾱ)·ε = {fmt(r.noise)}</span><b>=</b><span>xₜ = {fmt(r.value)}</span></div>
    <Chart series={[{ name: 'Этот образец шума', points: points(a => noiseMarginal(x, a, epsilon).value, 0, 1) }]} xLabel="Доля сигнала ᾱ" yLabel="Зашумлённое xₜ" />
    <p>Для случайного ε∼N(0,1): условное среднее = {fmt(r.mean)}, дисперсия = {fmt(r.variance)}. Это точка сразу на выбранном уровне шума, а не последовательное прибавление одинакового ε.</p>
  </section>;
}
function Score() {
  const [mu, setMu] = useState(0), [sigma, setSigma] = useState(1), [x, setX] = useState(1);
  const y = normalLogDensity(x, mu, sigma), slope = normalScore(x, mu, sigma);
  return <section className="concept-experiment" aria-label="Производная логарифма плотности">
    <Range label="Среднее μ" value={mu} min={-2} max={2} onChange={setMu} />
    <Range label="Стандартное отклонение σ" value={sigma} min={.3} max={2} onChange={setSigma} />
    <Range label="Точка x" value={x} min={-3} max={3} onChange={setX} />
    <Chart series={[{ name: 'log p(x)', points: points(t => normalLogDensity(t, mu, sigma), -4, 4) }, { name: 'Касательная в выбранной точке', points: points(t => y + slope * (t - x), -4, 4), dashed: true }]} xLabel="Значение x" yLabel="Логарифм плотности" />
    <p className="concept-live">score = ∂log p(x)/∂x = −(x−μ)/σ² = {fmt(slope)}. Справа от центра знак отрицательный, слева положительный. Стрелка градиента указывает к большей плотности; это не вероятность и не готовый шаг генерации.</p>
  </section>;
}
function Graph() {
  const [a, setA] = useState(1), [b, setB] = useState(3), [connected, setConnected] = useState(true), [steps, setSteps] = useState(1);
  const history = twoNodeMessages(a, b, connected, steps), last = history.at(-1)!;
  return <section className="concept-experiment" aria-label="Два узла обмениваются признаками">
    <Range label="Признак узла A" value={a} min={-3} max={3} onChange={setA} />
    <Range label="Признак узла B" value={b} min={-3} max={3} onChange={setB} />
    <label><input type="checkbox" checked={connected} onChange={e => setConnected(e.target.checked)} /> Соединить узлы ребром</label>
    <Range label="Шагов обмена" value={steps} min={0} max={5} step={1} onChange={setSteps} />
    <div className="concept-flow"><span>A: {fmt(a)} → {fmt(last[0])}</span><b>{connected ? '↔' : '∅'}</b><span>B: {fmt(b)} → {fmt(last[1])}</span></div>
    <Chart series={[{ name: 'Узел A', points: history.map((h, x) => ({ x, y: h[0] })) }, { name: 'Узел B', points: history.map((h, x) => ({ x, y: h[1] })) }]} xLabel="Шаг обмена" yLabel="Признак узла" />
    <p>Каждый узел одновременно берёт среднее собственного признака и признака соседа. A = {connected ? '(a+b)/2' : 'a'}, B = {connected ? '(b+a)/2' : 'b'}. Самосвязи включены. Это простая агрегация без обучаемых весов; полноценный обучаемый GCN находится в главе GNN.</p>
  </section>;
}
function Discount() {
  const [gamma, setGamma] = useState(.9), [reward, setReward] = useState(10);
  const r = discountedReturn([1, 2, reward], gamma);
  return <section className="concept-experiment" aria-label="Вклад будущих наград">
    <Range label="Дисконтирование γ" value={gamma} min={0} max={1} step={.01} onChange={setGamma} />
    <Range label="Награда на третьем шаге" value={reward} min={-10} max={10} step={1} onChange={setReward} />
    <Chart series={[{ name: 'Взвешенная награда', points: r.terms.map((y, x) => ({ x: x + 1, y })) }]} xLabel="Шаг получения награды" yLabel="Вклад в return" />
    <p className="concept-live">G = 1 + γ·2 + γ²·{fmt(reward)} = {r.terms.map(t => fmt(t)).join(' + ')} = {fmt(r.value)}. Здесь три шага, поэтому γ=1 допустимо. Для бесконечного горизонта требуются дополнительные условия.</p>
  </section>;
}
function Bellman() {
  const [p, setP] = useState(.8), [reward, setReward] = useState(1), [next, setNext] = useState(4), [gamma, setGamma] = useState(.9), [terminal, setTerminal] = useState(false);
  const r = bellmanExample(p, reward, next, gamma, terminal);
  return <section className="concept-experiment" aria-label="Ожидание двух исходов в уравнении Беллмана">
    <Range label="Вероятность успешного перехода p" value={p} min={0} max={1} step={.05} onChange={setP} />
    <Range label="Награда успешного перехода r" value={reward} min={-2} max={2} onChange={setReward} />
    <Range label="Оценка следующего состояния V" value={next} min={-5} max={5} onChange={setNext} />
    <Range label="Коэффициент γ" value={gamma} min={0} max={1} step={.05} onChange={setGamma} />
    <label><input type="checkbox" checked={terminal} onChange={e => setTerminal(e.target.checked)} /> Успешный переход завершает эпизод</label>
    <div className="concept-flow"><span>p={fmt(p)}: r{terminal ? '' : ' + γV'} = {fmt(r.success)}</span><span>1−p={fmt(1-p)}: конец, r=0</span></div>
    <p className="concept-live">Ожидаемая ценность этого действия = {fmt(p)}·{fmt(r.success)} + {fmt(1-p)}·0 = {fmt(r.value)}. {terminal ? 'После настоящего terminal будущего продолжения нет.' : 'V — заданная оценка продолжения, а не ещё одна немедленная награда.'} Здесь оцениваем одно действие; максимум по действиям нужен в оптимальном Q.</p>
  </section>;
}
