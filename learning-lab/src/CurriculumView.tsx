import { useId, useState } from 'react';
import { concepts, getConcept } from './concepts';
import { ConceptLink } from './learning-context';
import { coverageLabels, curriculum, curriculumGroups, studyRoutes, topicsForRoute, type StudyRoute } from './curriculum';
import './concept-lessons.css';
import './learning-ux.css';

const firstExperiments: Record<StudyRoute, { lesson: string; title: string; task: string }> = {
  all: { lesson: 'neuron', title: 'Нейрон и слои', task: 'Начните с одного изменяемого веса. Затем выбирайте любую тему на карте ниже.' },
  beginner: { lesson: 'neuron', title: 'Нейрон и слои', task: 'Измените вес w₁ и сравните взвешенную сумму с выходом. Дальше: потеря → обратный проход → оптимизаторы → сеть.' },
  training: { lesson: 'backprop', title: 'Обратный проход', task: 'Проследите влияние одного веса на ошибку. Дальше сравните оптимизаторы и обучите сеть.' },
  transformer: { lesson: 'transformer', title: 'Transformer по шагам', task: 'Начните с токенов и векторов, затем перейдите к attention. Непонятные основы открывайте прямо из текста.' },
  beyond: { lesson: 'vae', title: 'VAE: скрытый код', task: 'Исследуйте реконструкцию и случайный скрытый код. Затем выбирайте GAN, diffusion, графы или обучение с подкреплением.' },
};

export function CurriculumView() {
  const [route, setRoute] = useState<StudyRoute>('beginner'), [query, setQuery] = useState('');
  const current = studyRoutes.find(item => item.id === route)!, topics = topicsForRoute(route);
  const inputId = useId(), normalizedQuery = query.toLocaleLowerCase('ru-RU').trim();
  const found = concepts.filter(concept => `${concept.title} ${concept.id} ${concept.idea}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery));
  const first = firstExperiments[route];
  return <div className="curriculum-view">
    <section className="curriculum-intro"><h2>Выберите точку входа</h2><p>Начните с опыта. Незнакомый термин откроет его основы; возврат сохранит ваши числа и место в уроке.</p></section>
    <section className="curriculum-route-selector" aria-label="Выбор учебного маршрута"><div className="button-row">{studyRoutes.map(item => <button key={item.id} aria-pressed={route === item.id} onClick={() => setRoute(item.id)}>{item.label}</button>)}</div><p role="status">{current.description}</p></section>
    <section className="route-start" aria-label="Первый опыт выбранного маршрута"><div><span className="eyebrow">Первый опыт · {current.label}</span><h2>{first.title}</h2><p>{first.task}</p></div><a className="route-start-link" href={`#${first.lesson}`}>Открыть опыт →</a></section>
    <details className="curriculum-search"><summary>Найти понятие в словаре</summary><section className="curriculum-dictionary" aria-label="Словарь понятий"><p>Ищите по названию или смыслу. Каждый разбор ведёт к своим основам.</p><label htmlFor={inputId}>Название или смысл понятия<input id={inputId} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Например, производная, batch, логарифм" /></label><p className="curriculum-search-status" role="status">Найдено: {found.length}</p><div className="curriculum-dictionary-links">{found.map(concept => <div key={concept.id}><ConceptLink concept={concept.id}>{concept.title.split(':')[0]}</ConceptLink><span>{concept.demo ? 'с экспериментом' : 'численный разбор'}</span></div>)}</div>{!found.length && <p>Попробуйте более короткое слово. Например, «градиент» или «вероятность».</p>}</section></details>
    <div className="curriculum-legend" aria-label="Как читать уровни готовности"><span><b className="coverage coverage-interactive">Интерактив</b> меняет числа и пересчитывает результат</span><span><b className="coverage coverage-reading">Разбор</b> объяснение и конкретный пример</span><span><b className="coverage coverage-next">Следующий уровень</b> ориентир; локальной реализации нет</span></div>
    <div className="curriculum-stages">{curriculumGroups.map((group, index) => {
      const items = topics.filter(topic => topic.group === group.id);
      if (!items.length) return null;
      return <section className="curriculum-stage" key={group.id} aria-labelledby={`curriculum-${group.id}`}>
        <div className="curriculum-stage-heading"><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h2 id={`curriculum-${group.id}`}>{group.title}</h2><p>{group.description}</p></div></div>
        <div className="curriculum-topics">{items.map(topic => <article key={topic.id} className={`curriculum-topic curriculum-topic-${topic.coverage}`}>
          <span className={`coverage coverage-${topic.coverage}`}>{coverageLabels[topic.coverage]}</span><h3>{topic.title}</h3><p>{topic.summary}</p>
          <div className="curriculum-topic-example"><strong>{topic.coverage === 'interactive' ? 'Попробуйте' : 'Пример'}</strong><p>{topic.example}</p></div>
          <div className="curriculum-concept-links">{topic.concepts.map(id => <ConceptLink key={id} concept={id}>{getConcept(id)!.title.split(':')[0]}</ConceptLink>)}</div>
          {topic.lesson && <a className="curriculum-open" href={`#${topic.lesson}`}>{topic.lessonLabel} →</a>}
          {topic.source && <a className="curriculum-open" href={topic.source.url} target="_blank" rel="noreferrer">{topic.source.title} ↗</a>}
          <details><summary>Точный охват</summary><p>{topic.limit}</p></details>
        </article>)}</div>
      </section>;
    })}</div>
    <aside className="curriculum-boundary"><h2>Масштаб этой лаборатории</h2><p>Здесь {curriculum.filter(topic => topic.coverage === 'interactive').length} разделов с вычисляемыми экспериментами, {curriculum.filter(topic => topic.coverage === 'reading').length} раздела с разборами и {curriculum.filter(topic => topic.coverage === 'next').length} ориентиров для продолжения. Это карта входа в тему, а не обещание реализовать все нейросети.</p><p>Все локальные расчёты выполняются на TypeScript в браузере. XOR, VAE, GAN, denoiser и GCN обучают маленькие модели; RL меняет Q-таблицу и простую политику. В лаборатории семейств также обучаются общий CNN-фильтр и скалярная RNN через BPTT. В базовом Transformer отдельно обучается выходная голова, а в новых архитектурах — целый tiny-блок. Раздел «Новые механизмы и обучение» добавляет контрастивные модели, поля, предпочтения и обучение ViT/MoE/SSM/U-Net/DiT; Boundary поддерживает mini-batch и L2. GPU, обучение больших моделей и подключение к RustML API пока отсутствуют.</p><p><a href="https://cs231n.stanford.edu/2025/schedule.html" target="_blank" rel="noreferrer">Сопоставить с программой Stanford CS231n 2025 ↗</a></p></aside>
  </div>;
}
