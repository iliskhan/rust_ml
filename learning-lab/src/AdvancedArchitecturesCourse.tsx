import { PracticeSection } from './practice/PracticeCloudProvider';
import { practiceChapter } from './practice/placement';
import { lazy, Suspense, useId, useRef, useState } from 'react';
import { LearningActivity } from './learning-context';
import './transformer-course.css';
import './advanced-architectures.css';

const Tiny = lazy(() => import('./TinyTransformerLab').then(m => ({ default: m.TinyTransformerLab })));
const Bpe = lazy(() => import('./TokenAdaptationLabs').then(m => ({ default: m.BpeLab })));
const Ffn = lazy(() => import('./TokenAdaptationLabs').then(m => ({ default: m.GatedFfnLab })));
const Lora = lazy(() => import('./TokenAdaptationLabs').then(m => ({ default: m.LoraLab })));
const Vit = lazy(() => import('./VisionRoutingLabs').then(m => ({ default: m.VisionTransformerLab })));
const Moe = lazy(() => import('./VisionRoutingLabs').then(m => ({ default: m.MixtureExpertsLab })));
const Image = lazy(() => import('./VisionRoutingLabs').then(m => ({ default: m.ImageDenoiserLab })));
const Mla = lazy(() => import('./EfficientSequenceLabs').then(m => ({ default: m.LatentAttentionLab })));
const Online = lazy(() => import('./EfficientSequenceLabs').then(m => ({ default: m.OnlineAttentionLab })));
const Ssm = lazy(() => import('./EfficientSequenceLabs').then(m => ({ default: m.StateSpaceLab })));

const chapters = [
  { title: 'Полный Transformer', subtitle: 'Градиенты и обучение всего блока', component: Tiny },
  { title: 'BPE', subtitle: 'Выучить правила и разбить новый текст', component: Bpe },
  { title: 'SwiGLU', subtitle: 'ReLU, GELU и управляемый FFN', component: Ffn },
  { title: 'LoRA', subtitle: 'Адаптация матрицы малым рангом', component: Lora },
  { title: 'ViT', subtitle: 'Из пикселей в последовательность патчей', component: Vit },
  { title: 'MoE', subtitle: 'Маршрутизация к экспертам', component: Moe },
  { title: 'MLA', subtitle: 'Латентный KV-cache', component: Mla },
  { title: 'Блочное внимание', subtitle: 'Точный online softmax', component: Online },
  { title: 'SSM и DeltaNet', subtitle: 'Память, адресная запись и гибрид', component: Ssm },
  { title: 'U-Net и DiT', subtitle: 'Два предиктора шума на сетке', component: Image },
];

export function AdvancedArchitecturesCourse() {
  const [chapter, setChapter] = useState(0), [visited, setVisited] = useState([0]);
  const selectId = useId(), heading = useRef<HTMLHeadingElement>(null);
  function choose(index: number, move = false) {
    setChapter(index); setVisited(old => old.includes(index) ? old : [...old, index]);
    if (move) requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'start' }); });
  }
  return <section className="transformer-course advanced-architectures" aria-label="Новые архитектуры и обучение"><p className="tc-course-intro">Десять опытов после <a href="#transformer">базового Transformer</a>. У каждого свои малые данные и веса; состояние сохраняется при переходах внутри вкладки. Начать можно с любого механизма. В <a href="#frontiers">новых механизмах</a> можно обучить малые ViT, MoE, SSM и предикторы шума U-Net/DiT.</p>
    <nav className="tc-chapters" aria-label="Десять лабораторий">{chapters.map((item, i) => <button key={item.title} aria-label={`${i + 1}. ${item.title}`} aria-pressed={chapter === i} aria-current={chapter === i ? 'step' : undefined} onClick={() => choose(i)}><span>{i + 1}</span><strong>{item.title}</strong></button>)}</nav>
    <label className="tc-mobile-navigation" htmlFor={selectId}>Новая лаборатория<select id={selectId} value={chapter} onChange={e => choose(Number(e.target.value))}>{chapters.map((item, i) => <option key={item.title} value={i}>{i + 1}. {item.title}</option>)}</select></label>
    <div className="tc-chapter-heading"><span>Лаборатория {chapter + 1} из {chapters.length}</span><h2 ref={heading} tabIndex={-1}>{chapters[chapter].subtitle}</h2></div>
    {visited.map(i => { const Component = chapters[i].component; return <div key={i} hidden={chapter !== i} data-advanced-lab={i}><LearningActivity active={chapter === i}><Suspense fallback={<p role="status">Загружается лаборатория…</p>}><Component /></Suspense></LearningActivity></div>; })}
    <PracticeSection lessonId="advanced" topicId={practiceChapter('advanced', chapter)} /><div className="tc-chapter-actions"><button disabled={chapter === 0} onClick={() => choose(chapter - 1, true)}>← Предыдущая лаборатория</button><button disabled={chapter === chapters.length - 1} onClick={() => choose(chapter + 1, true)}>Следующая лаборатория →</button></div>
  </section>;
}
