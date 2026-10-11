import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackpropLesson, LossLesson, NeuronLesson } from './Foundations';
import { NetworkLesson, OptimizerLesson } from './Experiments';
import { CurriculumView } from './CurriculumView';
import { ConceptLink, LearningActivity, LearningProvider, useLearning } from './learning-context';
import { KnowledgeExplorer } from './KnowledgeExplorer';

const ArchitectureLesson = lazy(() => import('./ArchitectureLesson').then(module => ({ default: module.ArchitectureLesson })));
const TransformerCourse = lazy(() => import('./TransformerCourse').then(module => ({ default: module.TransformerCourse })));
const VAECourse = lazy(() => import('./VAECourse').then(module => ({ default: module.VAECourse })));
const GANCourse = lazy(() => import('./GANCourse').then(module => ({ default: module.GANCourse })));
const DiffusionCourse = lazy(() => import('./DiffusionCourse').then(module => ({ default: module.DiffusionCourse })));
const GNNCourse = lazy(() => import('./GNNCourse').then(module => ({ default: module.GNNCourse })));
const RLCourse = lazy(() => import('./RLCourse').then(module => ({ default: module.RLCourse })));

const lessons = [
  { id: 'map', title: 'Карта обучения', group: 'Ориентиры', hint: 'Связать части в одну систему', component: Overview },
  { id: 'curriculum', title: 'Маршрут с нуля', group: 'Ориентиры', hint: 'Найти отправную точку и нужные основы', component: CurriculumView },
  { id: 'neuron', title: 'Нейрон и слои', group: 'Основы на практике', hint: 'От входов к выходу', component: NeuronLesson },
  { id: 'loss', title: 'Функции потерь', group: 'Основы на практике', hint: 'Измерить ошибку предсказания', component: LossLesson },
  { id: 'backprop', title: 'Обратный проход', group: 'Основы на практике', hint: 'Найти влияние каждого веса', component: BackpropLesson },
  { id: 'optimizers', title: 'Оптимизаторы', group: 'Основы на практике', hint: 'Сравнить три траектории', component: OptimizerLesson },
  { id: 'network', title: 'Сеть целиком', group: 'Основы на практике', hint: 'Границы решений, скрытые признаки и XOR', component: NetworkLesson },
  { id: 'architectures', title: 'Семейства сетей', group: 'Дальше и глубже', hint: 'Dense, CNN, RNN, LSTM, GRU, Transformer', component: ArchitectureLesson },
  { id: 'transformer', title: 'Transformer по шагам', group: 'Дальше и глубже', hint: 'От токенов к вниманию и предсказанию', component: TransformerCourse },
  { id: 'vae', title: 'VAE: скрытый код', group: 'Генерация', hint: 'Реконструкция, распределение и вариационная граница', component: VAECourse },
  { id: 'gan', title: 'GAN: игра двух сетей', group: 'Генерация', hint: 'Генератор, различитель и их настоящее обучение', component: GANCourse },
  { id: 'diffusion', title: 'Diffusion: из шума', group: 'Генерация', hint: 'Зашумление, denoiser и обратные шаги', component: DiffusionCourse },
  { id: 'gnn', title: 'GNN: сеть на графе', group: 'Графы и действия', hint: 'Сообщения между узлами и обучение GCN', component: GNNCourse },
  { id: 'rl', title: 'RL: учиться действовать', group: 'Графы и действия', hint: 'Награды, Bellman, Q-learning и градиент политики', component: RLCourse },
  { id: 'sources', title: 'Источники и границы', group: 'Справка', hint: 'Где упрощения и что читать дальше', component: Sources },
];
const lessonGroups = [...new Set(lessons.map(lesson => lesson.group))];

function navigate(id: string) { window.location.hash = id; }
function getLesson() { return lessons.find(l => l.id === window.location.hash.slice(1)) ?? lessons[0]; }

export function App() {
  return <LearningProvider><LearningShell /></LearningProvider>;
}

function LearningShell() {
  const [lesson, setLesson] = useState(getLesson);
  const [visited, setVisited] = useState(() => [getLesson().id]);
  const main = useRef<HTMLElement>(null);
  const routePositions = useRef(new Map<string, number>());
  const previousRoute = useRef(lesson.id);
  const routeChanged = useRef(false);
  const { navigation, close } = useLearning();
  const closeExplorer = useRef(close);
  closeExplorer.current = close;
  useEffect(() => {
    const originalScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const handle = () => {
      const next = getLesson();
      if (next.id === previousRoute.current) return;
      routePositions.current.set(previousRoute.current, window.scrollY);
      previousRoute.current = next.id;
      routeChanged.current = true;
      closeExplorer.current();
      setLesson(next);
      setVisited(ids => ids.includes(next.id) ? ids : [...ids, next.id]);
    };
    window.addEventListener('hashchange', handle);
    return () => { window.removeEventListener('hashchange', handle); window.history.scrollRestoration = originalScrollRestoration; };
  }, []);
  useLayoutEffect(() => {
    if (!routeChanged.current) return;
    main.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    const top = routePositions.current.get(lesson.id) ?? 0;
    window.scrollTo({ top, behavior: 'instant' });
    let afterResize = 0;
    const restore = requestAnimationFrame(() => { afterResize = requestAnimationFrame(() => window.scrollTo({ top, behavior: 'instant' })); });
    routeChanged.current = false;
    return () => { cancelAnimationFrame(restore); cancelAnimationFrame(afterResize); };
  }, [lesson.id]);
  useEffect(() => { document.title = `${lesson.title} · RustML`; }, [lesson]);
  const index = lessons.indexOf(lesson);
  return <>
    <a className="skip-link" href="#content" onClick={e => { e.preventDefault(); main.current?.focus(); }}>Перейти к уроку</a>
    <header className="site-header"><a className="brand" href="#map" aria-label="RustML: карта обучения"><span className="brand-mark">r<span>·</span></span><span>RustML<small>Лаборатория нейросетей</small></span></a><span className="header-note">Сначала понять. Затем посчитать.</span><a className="header-link" href="#sources">О проекте ↗</a></header>
    <div className="app-layout"><aside className="sidebar"><span className="eyebrow sidebar-label">Учебник / навигация</span><nav className="desktop-lesson-nav" aria-label="Уроки">{lessonGroups.map(group => <div className="nav-group" key={group}><span className="nav-group-title">{group}</span>{lessons.filter(item => item.group === group).map(l => <a key={l.id} href={`#${l.id}`} aria-current={lesson.id === l.id ? 'page' : undefined}><span className="nav-number" aria-hidden="true">{String(lessons.indexOf(l) + 1).padStart(2, '0')}</span><span>{l.title}</span>{lesson.id === l.id && <span className="nav-arrow" aria-hidden="true">→</span>}</a>)}</div>)}</nav><label className="mobile-lesson-nav">Открыть раздел<select value={lesson.id} onChange={event => navigate(event.target.value)}>{lessonGroups.map(group => <optgroup key={group} label={group}>{lessons.filter(item => item.group === group).map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</optgroup>)}</select></label><div className="sidebar-note"><span className="status-dot" />Ваш эксперимент — на месте<p>Уроки и настройки сохраняются при переходах в этой вкладке.</p><a href="#curriculum">Выбрать маршрут →</a></div></aside>
    <main id="content" className="main-content" ref={main} tabIndex={-1}>
      <div className="lesson-header"><span className="eyebrow">{index === 0 ? 'От первого нейрона до внимания' : lesson.group}</span><h1 tabIndex={-1}>{lesson.title}</h1><p className="lesson-subtitle">{lesson.hint}</p></div>
      {visited.map(id => { const item = lessons.find(entry => entry.id === id)!; const Component = item.component; return <div key={id} className="lesson-body" data-lesson={id} hidden={id !== lesson.id}><LearningActivity active={id === lesson.id && !navigation.path.length}><Suspense fallback={<section className="panel" role="status"><p>Загружаем раздел «{item.title}»…</p></section>}><Component /></Suspense></LearningActivity></div>; })}
      {index > 0 && index < lessons.length - 1 && <div className="lesson-next"><span>Следующий раздел</span><a href={`#${lessons[index + 1].id}`}>{lessons[index + 1].title} →</a></div>}
      <footer>RustML Learning Lab · расчёты в вашем браузере<p>Настройки экспериментов сохраняются в этой вкладке до перезагрузки страницы.</p></footer>
    </main></div>
    <KnowledgeExplorer lessonTitle={lesson.title} />
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
    <section className="overview-hero"><div><span className="hero-kicker">Одна идея. Шесть связанных шагов.</span><h2>Нейросеть становится понятнее,<br />когда числа можно менять.</h2><p>Посмотрите, как вход превращается в предсказание, ошибка — в <ConceptLink concept="gradient">градиент</ConceptLink>, а градиент — в новый вес. Каждый график строится по настоящим вычислениям.</p><button className="primary" onClick={() => navigate('neuron')}>Начать с одного нейрона <span>→</span></button><a className="hero-secondary" href="#curriculum">Подобрать маршрут с нуля →</a></div><div className="hero-equation" aria-label="Пример: входы 1 и 2, веса 0.8 и минус 0.4, смещение 0.5 дают взвешенную сумму 0.5"><span className="equation-label">Заглянем внутрь</span><div className="hero-inputs"><span>1 <small>× 0.8</small></span><span>2 <small>× −0.4</small></span></div><span className="equation-arrow">↓ сумма + 0.5</span><strong>0.5</strong><span className="equation-caption">Первый нейрон уже посчитан</span></div></section>
    <div className="learning-hint"><span aria-hidden="true">↳</span><p><strong>Незнакомое слово — точка входа.</strong> Нажмите на подчёркнутый термин, разберите его основы на любом уровне и вернитесь к тем же числам и месту в уроке.</p></div>
    <section className="pipeline-section"><div className="section-heading"><h2>Как проходит один шаг обучения</h2><span>Выберите блок для разбора</span></div><div className="pipeline" role="group" aria-label="Блоки цикла обучения">{pipeline.map((p, i) => <button key={p.label} aria-pressed={selected === i} onClick={() => setSelected(i)}><span className="pipeline-index">0{i + 1}</span><strong>{p.label}</strong><code>{p.symbol}</code></button>)}</div><div className="pipeline-detail" aria-live="polite"><div><span className="eyebrow">Блок 0{selected + 1} · {block.label}</span><p>{block.text}</p><details><summary>Чуть подробнее</summary><p>{block.detail}</p></details></div><button onClick={() => navigate(block.id)}>Открыть эксперимент →</button></div><p className="cycle-note">После шага веса возвращаемся к прямому проходу ↺</p></section>
    <section className="routes"><div className="section-heading"><h2>Выберите глубину исследования</h2></div><div className="route-grid">{[
      { id: 'backprop', tag: 'Понять математику', title: 'Одна ошибка, несколько путей', text: 'Пошаговый граф, правило цепочки и проверка производной конечной разностью.' },
      { id: 'network', tag: 'Собрать всё вместе', title: 'Обучите сеть на XOR', text: 'Фиксированный seed, реальный обратный проход и карта предсказаний.' },
      { id: 'transformer', tag: 'Разобрать по шагам', title: 'Как работает Transformer', text: 'Токены, векторы, внимание и обучение. Для каждого нового понятия можно открыть его основы.' },
    ].map(r => <a key={r.id} href={`#${r.id}`} className="route-card"><span className="eyebrow">{r.tag}</span><h3>{r.title}</h3><p>{r.text}</p><span className="route-arrow">Исследовать ↗</span></a>)}</div></section>
    <p className="local-note">Учебник считает на TypeScript в вашем браузере. Он помогает понять математику RustML; подключения к незавершённому Rust API здесь пока нет.</p>
  </>;
}

function Sources() {
  return <>
    <p className="lesson-intro">Здесь маленькие модели раскрывают механизм. TypeScript использует числа IEEE 754 двойной точности; расчёты не заменяют реализацию и проверку промышленного ML-фреймворка.</p>
    <section className="panel"><h3>Как учиться и возвращаться к основам</h3><p><a href="#curriculum">Маршрут с нуля</a> связывает предпосылки и разделы учебника. Незнакомый термин открывается поверх текущего урока: например, <ConceptLink concept="gradient">градиент</ConceptLink> ведёт к <ConceptLink concept="derivative">производной</ConceptLink> и её основам. Внутри разбора можно идти глубже и возвращаться по пути.</p><p>Открытые уроки и понятия сохраняют свои настройки и прокрутку в этой вкладке до перезагрузки страницы. Это временное состояние в браузере: нет аккаунта, сохранения на сервере или восстановления после reload. Автоматические эксперименты при уходе из урока ставятся на паузу.</p></section>
    <section className="panel"><h3>Первичные источники</h3><ul className="source-list">
      <li><a href="https://docs.pytorch.org/docs/stable/notes/autograd.html" target="_blank" rel="noreferrer">PyTorch: Autograd mechanics ↗</a><p>Граф операций, накопление градиентов и соглашения в недифференцируемых точках.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/notes/gradcheck.html" target="_blank" rel="noreferrer">PyTorch: Gradcheck mechanics ↗</a><p>Сравнение аналитической производной с численной оценкой.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.MSELoss.html" target="_blank" rel="noreferrer">PyTorch: MSELoss ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.BCEWithLogitsLoss.html" target="_blank" rel="noreferrer">BCEWithLogitsLoss ↗</a><p>Редукция mean и устойчивая формула бинарной потери от логитов.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/generated/torch.optim.SGD.html" target="_blank" rel="noreferrer">PyTorch: SGD ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.optim.Adam.html" target="_blank" rel="noreferrer">Adam ↗</a><p>Уравнения обновления параметров и роль состояния оптимизатора.</p></li>
      <li><a href="https://arxiv.org/abs/1412.6980" target="_blank" rel="noreferrer">Kingma & Ba: Adam (2014/2015) ↗</a><p>Оценки первого и второго моментов и поправка их начального смещения.</p></li>
      <li><a href="https://arxiv.org/abs/1706.03762" target="_blank" rel="noreferrer">Vaswani и др.: Attention Is All You Need (2017) ↗</a><p>Масштабированное скалярное внимание, несколько голов, encoder и decoder.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html" target="_blank" rel="noreferrer">PyTorch: scaled dot product attention ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.LayerNorm.html" target="_blank" rel="noreferrer">LayerNorm ↗</a><p>Численное внимание, маска и нормализация в отдельном пошаговом курсе Transformer. Учебные примеры явно отделены от большой обученной языковой модели.</p></li>
      <li><a href="https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/" target="_blank" rel="noreferrer">W3C WAI: доступный модальный диалог ↗</a> · <a href="https://www.w3.org/WAI/people-use-web/tools-techniques/presentation/" target="_blank" rel="noreferrer">Представление и постепенное раскрытие ↗</a><p>Основа навигации по понятиям: фокус, возврат, инертный фон и доступ к подробностям по запросу.</p></li>
      <li><a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.LSTM.html" target="_blank" rel="noreferrer">PyTorch: LSTM ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.GRU.html" target="_blank" rel="noreferrer">GRU ↗</a> · <a href="https://docs.pytorch.org/docs/stable/generated/torch.nn.Conv2d.html" target="_blank" rel="noreferrer">Conv2d ↗</a><p>Современные соглашения для затворов, свёрток и форм данных.</p></li>
    </ul></section>
    <section className="panel"><h3>Что реализовано и где границы</h3><p>Нейрон, Linear, активации, MSE, BCE, граф с общим узлом, SGD, momentum и Adam считают настоящие формулы. XOR выполняет полный forward/backward/update; лаборатория семейств показывает малые прямые проходы. <a href="#transformer">Transformer по шагам</a> раскрывает внимание, позиции и варианты. <a href="#vae">VAE</a>, <a href="#gan">GAN</a>, <a href="#diffusion">diffusion</a> и <a href="#gnn">GCN</a> обучают небольшие модели; <a href="#rl">RL</a> содержит настоящие эпизоды Q-learning и точное обновление маленькой политики. <a href="#curriculum">Карта предпосылок</a> помогает разобрать математику.</p><p>Нет обучения больших архитектур, GPU, загрузки произвольных моделей или интеграции с Rust. Генеративные примеры одномерны; результаты показывают механизм, а не качество генерации изображений. Варианты с работающими вычислениями и варианты с объяснением явно разделены внутри глав.</p><p>Успех на игрушечной задаче не гарантирует сходимость или обобщение. Первичные статьи и точные ограничения находятся в каждой главе; команды проверок — в README учебника.</p></section>
  </>;
}
