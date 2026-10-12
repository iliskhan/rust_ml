import { lazy, Suspense, useId, useRef, useState } from 'react';
import { LearningActivity } from './learning-context';
import './transformer-course.css';
import './advanced-architectures.css';

const Clip = lazy(() => import('./RepresentationFrontierLabs').then(m => ({ default: m.ClipLab })));
const Interpret = lazy(() => import('./RepresentationFrontierLabs').then(m => ({ default: m.InterpretabilityLab })));
const Jepa = lazy(() => import('./RepresentationFrontierLabs').then(m => ({ default: m.JepaLab })));
const Kan = lazy(() => import('./RepresentationFrontierLabs').then(m => ({ default: m.KanLab })));
const Flow = lazy(() => import('./FlowGeometryLabs').then(m => ({ default: m.FlowMatchingLab })));
const Egnn = lazy(() => import('./FlowGeometryLabs').then(m => ({ default: m.EquivariantLab })));
const Field = lazy(() => import('./FlowGeometryLabs').then(m => ({ default: m.NeuralFieldLab })));
const Preference = lazy(() => import('./InferenceFrontierLabs').then(m => ({ default: m.PreferenceLab })));
const Quant = lazy(() => import('./InferenceFrontierLabs').then(m => ({ default: m.QuantizationLab })));
const Spec = lazy(() => import('./InferenceFrontierLabs').then(m => ({ default: m.SpeculativeLab })));
const Context = lazy(() => import('./InferenceFrontierLabs').then(m => ({ default: m.LongContextLab })));
const Masked = lazy(() => import('./InferenceFrontierLabs').then(m => ({ default: m.MaskedTextLab })));
const Vit = lazy(() => import('./ArchitectureTrainingLabs').then(m => ({ default: m.VitTrainingLab })));
const Moe = lazy(() => import('./ArchitectureTrainingLabs').then(m => ({ default: m.MoeTrainingLab })));
const Ssm = lazy(() => import('./ArchitectureTrainingLabs').then(m => ({ default: m.SsmTrainingLab })));
const Denoisers = lazy(() => import('./ArchitectureTrainingLabs').then(m => ({ default: m.DenoiserTrainingLab })));

const chapters = [
  { title: 'CLIP', subtitle: 'Связать изображение и описание', component: Clip },
  { title: 'Flow matching', subtitle: 'Обучить движение от шума к данным', component: Flow },
  { title: 'Интерпретируемость', subtitle: 'Признаки и причинные вмешательства', component: Interpret },
  { title: 'EGNN', subtitle: 'Симметрии физических координат', component: Egnn },
  { title: 'Neural fields', subtitle: 'От поля плотности к пикселю камеры', component: Field },
  { title: 'DPO', subtitle: 'Обучиться по парам предпочтений', component: Preference },
  { title: 'Квантизация', subtitle: 'Округлить веса и обучить адаптер', component: Quant },
  { title: 'Speculative decoding', subtitle: 'Проверить черновик без изменения распределения', component: Spec },
  { title: 'Длинный контекст', subtitle: 'Обучить коротко и проверить длиннее', component: Context },
  { title: 'I-JEPA', subtitle: 'Предсказывать скрытые представления', component: Jepa },
  { title: 'Диффузионный текст', subtitle: 'Восстановить токены с двух сторон', component: Masked },
  { title: 'KAN', subtitle: 'Обучить функции на связях', component: Kan },
  { title: 'Обучение ViT', subtitle: 'Научить внимание различать узоры', component: Vit },
  { title: 'Обучение MoE', subtitle: 'Обучить экспертов и маршрутизатор', component: Moe },
  { title: 'Обучение SSM', subtitle: 'Выучить память последовательности', component: Ssm },
  { title: 'Обучение U-Net / DiT', subtitle: 'Обучить предсказание шума и запустить генерацию', component: Denoisers },
];

export function FrontierCourse() {
  const [chapter, setChapter] = useState(0), [visited, setVisited] = useState([0]);
  const selectId = useId(), heading = useRef<HTMLHeadingElement>(null);
  function choose(index: number, move = false) {
    setChapter(index); setVisited(old => old.includes(index) ? old : [...old, index]);
    if (move) requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }); });
  }
  return <section className="transformer-course advanced-architectures frontier-course" aria-label="Новые механизмы и обучение"><p className="tc-course-intro">Двенадцать новых направлений и четыре лаборатории обучения после <a href="#advanced">разбора архитектур</a>. Внутри — малые модели с проверяемыми числами. Выбирайте любой опыт; настройки сохраняются при переходах в этой вкладке.</p>
    <nav className="tc-chapters" aria-label="Шестнадцать лабораторий">{chapters.map((item, i) => <button key={item.title} aria-label={`${i + 1}. ${item.title}`} aria-pressed={chapter === i} aria-current={chapter === i ? 'step' : undefined} onClick={() => choose(i)}><span>{i + 1}</span><strong>{item.title}</strong></button>)}</nav>
    <label className="tc-mobile-navigation" htmlFor={selectId}>Новый механизм<select id={selectId} value={chapter} onChange={e => choose(Number(e.target.value))}>{chapters.map((item, i) => <option key={item.title} value={i}>{i + 1}. {item.title}</option>)}</select></label>
    <div className="tc-chapter-heading"><span>Лаборатория {chapter + 1} из {chapters.length}</span><h2 ref={heading} tabIndex={-1}>{chapters[chapter].subtitle}</h2></div>
    {visited.map(i => { const Component = chapters[i].component; return <div key={i} hidden={chapter !== i} data-frontier-lab={i}><LearningActivity active={chapter === i}><Suspense fallback={<p role="status">Загружается лаборатория…</p>}><Component /></Suspense></LearningActivity></div>; })}
    <div className="tc-chapter-actions"><button disabled={chapter === 0} onClick={() => choose(chapter - 1, true)}>← Предыдущая лаборатория</button><button disabled={chapter === chapters.length - 1} onClick={() => choose(chapter + 1, true)}>Следующая лаборатория →</button></div>
  </section>;
}
