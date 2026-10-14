import { useEffect, useRef, useState } from 'react';
import { BackpropLesson, LossLesson, NeuronLesson } from './Foundations';
import { NetworkLesson, OptimizerLesson } from './Experiments';
import { ArchitectureLesson } from './ArchitectureLesson';

const lessons = [
  { id: 'map', title: 'Карта обучения', short: 'Весь цикл', hint: 'Связать части в одну систему', component: Overview },
  { id: 'neuron', title: 'Нейрон и слои', short: 'Нейрон', hint: 'От входов к выходу', component: NeuronLesson },
  { id: 'loss', title: 'Функции потерь', short: 'Потери', hint: 'Измерить ошибку предсказания', component: LossLesson },
  { id: 'backprop', title: 'Обратный проход', short: 'Градиенты', hint: 'Найти влияние каждого веса', component: BackpropLesson },
  { id: 'optimizers', title: 'Оптимизаторы', short: 'Шаг веса', hint: 'Сравнить три траектории', component: OptimizerLesson },
  { id: 'network', title: 'Сеть целиком', short: 'Обучение XOR', hint: 'Обучить и разобрать свою сеть', component: NetworkLesson },
  { id: 'architectures', title: 'Семейства сетей', short: 'Архитектуры', hint: 'Dense, CNN, RNN, LSTM, GRU, Transformer', component: ArchitectureLesson },
  { id: 'sources', title: 'Источники и границы', short: 'Справка', hint: 'Где упрощения и что читать дальше', component: Sources },
];

function navigate(id: string) { window.location.hash = id; }
function getLesson() { return lessons.find(l => l.id === window.location.hash.slice(1)) ?? lessons[0]; }

export function App() {
  const [lesson, setLesson] = useState(getLesson);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const handle = () => { setLesson(getLesson()); window.scrollTo({ top: 0, behavior: 'instant' }); };
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, []);
  useEffect(() => { document.title = `${lesson.title} · RustML`; }, [lesson]);
  const Component = lesson.component, index = lessons.indexOf(lesson);
  return <>
    <a className="skip-link" href="#content" onClick={e => { e.preventDefault(); main.current?.focus(); }}>Перейти к уроку</a>
    <header className="site-header"><a className="brand" href="#map" aria-label="RustML: карта обучения"><span className="brand-mark">r<span>·</span></span><span>RustML<small>Лаборатория нейросетей</small></span></a><span className="header-note">Понимать через эксперимент</span><a className="header-link" href="#sources">О проекте ↗</a></header>
    <div className="app-layout"><aside className="sidebar"><span className="eyebrow">Учебный маршрут</span><nav aria-label="Уроки">{lessons.map((l, i) => <a key={l.id} href={`#${l.id}`} aria-current={lesson.id === l.id ? 'page' : undefined}><span className="nav-number">{String(i + 1).padStart(2, '0')}</span><span>{l.title}</span>{lesson.id === l.id && <span className="nav-arrow" aria-hidden="true">↗</span>}</a>)}</nav><div className="sidebar-note"><span className="status-dot" />Все расчёты локально<p>Меняйте числа.<br />Наблюдайте результат.<br />Разбирайте формулу.</p></div></aside>
    <main id="content" className="main-content" ref={main} tabIndex={-1}><div className="lesson-header"><span className="eyebrow">{index === 0 ? 'От первого нейрона до внимания' : `Лаборатория ${String(index).padStart(2, '0')}`}</span><h1>{lesson.title}</h1><p className="lesson-subtitle">{lesson.hint}</p></div><div key={lesson.id} className="lesson-body"><Component /></div>{index > 0 && index < lessons.length - 1 && <div className="lesson-next"><span>Продолжить исследование</span><a href={`#${lessons[index + 1].id}`}>{lessons[index + 1].title} →</a></div>}<footer>RustML Learning Lab · самостоятельная учебная реализация на TypeScript</footer></main></div>
  </>;
}

const pipeline = [
  { label: 'Данные', symbol: 'x, y', id: 'network', text: 'x — признаки примера, y — известная цель. В задаче XOR два бита идут в сеть, а правильный ответ равен 1, если они различаются.', detail: 'Обычно данные делят на обучение и проверку. Здесь четыре фиксированных примера показывают механизм; отдельной оценки обобщения нет.' },
  { label: 'Слои', symbol: 'W, b, a', id: 'neuron', text: 'Слой превращает входы в новое представление: сначала взвешенная сумма, затем активация. Из нескольких слоёв складывается сеть.', detail: 'Матрица W хранит веса, b — смещения. Нелинейная активация позволяет решать задачи, для которых одной прямой границы недостаточно.' },
  { label: 'Предсказание', symbol: 'ŷ', id: 'network', text: 'Последний слой выдаёт предсказание. Это может быть число для регрессии или логит, который сигмоида переводит в вероятность класса.', detail: 'Ни вероятность, ни логит сами по себе не говорят, насколько ответ верен: их нужно сравнить с целью y.' },
  { label: 'Потеря', symbol: 'L(ŷ, y)', id: 'loss', text: 'Функция потерь выражает ошибку числом. Чем меньше потеря на выбранных данных, тем лучше сеть выполняет этот критерий.', detail: 'MSE штрафует числовое отклонение. BCE учитывает уверенность бинарной классификации. Accuracy считает верные классы и отвечает на другой вопрос.' },
  { label: 'Назад', symbol: '∂L/∂W', id: 'backprop', text: 'Правило цепочки передаёт производные от потери к весам. Если узел участвует в нескольких путях, вклады в его градиент складываются.', detail: 'Прямой проход сохраняет нужные значения. Обратный проход применяет локальные производные в обратном порядке связей графа.' },
  { label: 'Шаг веса', symbol: 'W ← W + ΔW', id: 'optimizers', text: 'Оптимизатор использует градиент, чтобы изменить параметры. Потом сеть делает новый прямой проход, и цикл повторяется.', detail: 'Скорость обучения задаёт масштаб шага. Momentum хранит инерцию, Adam — средние градиента и его квадрата. Слишком крупный шаг может увеличить потерю.' },
];

function Overview() {
  const [selected, setSelected] = useState(1);
  const block = pipeline[selected];
  return <>
    <section className="overview-hero"><div><span className="hero-kicker">Одна идея. Шесть связанных шагов.</span><h2>Нейросеть становится понятнее,<br />когда числа можно менять.</h2><p>Посмотрите, как вход превращается в предсказание, ошибка — в градиент, а градиент — в новый вес. Каждый график строится по настоящим вычислениям.</p><button className="primary" onClick={() => navigate('neuron')}>Начать с одного нейрона <span>→</span></button></div><div className="hero-equation" aria-label="Пример: входы 1 и 2, веса 0.8 и минус 0.4, смещение 0.5 дают взвешенную сумму 0.5"><span className="equation-label">Заглянем внутрь</span><div className="hero-inputs"><span>1 <small>× 0.8</small></span><span>2 <small>× −0.4</small></span></div><span className="equation-arrow">↓ сумма + 0.5</span><strong>0.5</strong><span className="equation-caption">Первый нейрон уже посчитан</span></div></section>
    <section className="pipeline-section"><div className="section-heading"><h2>Как проходит один шаг обучения</h2><span>Выберите блок для разбора</span></div><div className="pipeline" role="group" aria-label="Блоки цикла обучения">{pipeline.map((p, i) => <button key={p.label} aria-pressed={selected === i} onClick={() => setSelected(i)}><span className="pipeline-index">0{i + 1}</span><strong>{p.label}</strong><code>{p.symbol}</code></button>)}</div><div className="pipeline-detail" aria-live="polite"><div><span className="eyebrow">Блок 0{selected + 1} · {block.label}</span><p>{block.text}</p><details><summary>Чуть подробнее</summary><p>{block.detail}</p></details></div><button onClick={() => navigate(block.id)}>Открыть эксперимент →</button></div><p className="cycle-note">После шага веса возвращаемся к прямому проходу ↺</p></section>
    <section className="routes"><div className="section-heading"><h2>Выберите глубину исследования</h2></div><div className="route-grid">{[
      { id: 'backprop', tag: 'Понять математику', title: 'Одна ошибка, несколько путей', text: 'Пошаговый граф, правило цепочки и проверка производной конечной разностью.' },
      { id: 'network', tag: 'Собрать всё вместе', title: 'Обучите сеть на XOR', text: 'Фиксированный seed, реальный обратный проход и карта предсказаний.' },
      { id: 'architectures', tag: 'Расширить картину', title: 'От Dense до Transformer', text: 'Фильтры, память, затворы и внимание в маленьких численных примерах.' },
    ].map(r => <a key={r.id} href={`#${r.id}`} className="route-card"><span className="eyebrow">{r.tag}</span><h3>{r.title}</h3><p>{r.text}</p><span className="route-arrow">Исследовать ↗</span></a>)}</div></section>
    <p className="local-note">Учебник считает на TypeScript в вашем браузере. Он помогает понять математику RustML; подключения к незавершённому Rust API здесь пока нет.</p>
  </>;
}

function Sources() {
  return <>
    <p className="lesson-intro">Здесь маленькие модели раскрывают механизм. TypeScript использует числа IEEE 754 двойной точности; расчёты не заменяют реализацию и проверку промышленного ML-фреймворка.</p>
    <section className="panel"><h3>Первичные источники</h3><ul className="source-list">
      <li><a href="https://docs.pytorch.org/docs/stable/notes/autograd.html" target="_blank" rel="noreferrer">PyTorch: Autograd mechanics ↗</a><p>Граф операций, накопление градиентов и соглашения в недифференцируемых точках.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/notes/gradcheck.html" target="_blank" rel="noreferrer">PyTorch: Gradcheck mechanics ↗</a><p>Сравнение аналитической производной с численной оценкой.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.MSELoss.html" target="_blank" rel="noreferrer">PyTorch: MSELoss ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.BCEWithLogitsLoss.html" target="_blank" rel="noreferrer">BCEWithLogitsLoss ↗</a><p>Редукция mean и устойчивая формула бинарной потери от логитов.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/generated/torch.optim.SGD.html" target="_blank" rel="noreferrer">PyTorch: SGD ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.optim.Adam.html" target="_blank" rel="noreferrer">Adam ↗</a><p>Уравнения обновления параметров и роль состояния оптимизатора.</p></li>
      <li><a href="https://arxiv.org/abs/1412.6980" target="_blank" rel="noreferrer">Kingma & Ba: Adam (2014/2015) ↗</a><p>Оценки первого и второго моментов и поправка их начального смещения.</p></li>
      <li><a href="https://arxiv.org/abs/1706.03762" target="_blank" rel="noreferrer">Vaswani и др.: Attention Is All You Need (2017) ↗</a><p>Масштабированное скалярное внимание, несколько голов, encoder и decoder.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.LSTM.html" target="_blank" rel="noreferrer">PyTorch: LSTM ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.GRU.html" target="_blank" rel="noreferrer">GRU ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.Conv2d.html" target="_blank" rel="noreferrer">Conv2d ↗</a><p>Современные соглашения для затворов, свёрток и форм данных.</p></li>
    </ul></section>
    <section className="panel"><h3>Что реализовано и где границы</h3><p>Нейрон, Linear, активации, MSE, BCE, граф с общим узлом, SGD, momentum и Adam считают настоящие формулы. Сеть XOR выполняет полный forward/backward/update на четырёх примерах; остальные семейства демонстрируют прямой проход маленьких конфигураций.</p><p>Нет обучения больших архитектур, GPU, загрузки произвольных моделей или интеграции с Rust. Конкретные реализованные варианты и схемы расширения перечислены в лаборатории архитектур. Различные версии RNN, нормализации и оптимизаторов могут использовать иные соглашения.</p><p>Успех на игрушечной задаче не гарантирует сходимость или обобщение. Полный список исходников и команды проверок находятся в README учебника.</p></section>
  </>;
}
