import { useId, useState } from 'react';
import { concepts, getConcept } from './concepts';
import { ConceptLink } from './learning-context';
import { coverageLabels, curriculum, curriculumGroups, studyRoutes, topicsForRoute, type StudyRoute } from './curriculum';
import './concept-lessons.css';

export function CurriculumView() {
  const [route, setRoute] = useState<StudyRoute>('all'), [query, setQuery] = useState('');
  const current = studyRoutes.find(item => item.id === route)!, topics = topicsForRoute(route);
  const inputId = useId(), normalizedQuery = query.toLocaleLowerCase('ru-RU').trim();
  const found = concepts.filter(concept => `${concept.title} ${concept.id} ${concept.idea}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery));
  return <div className="curriculum-view">
    <section className="curriculum-intro"><span className="eyebrow">Учебный путь с открытыми основаниями</span><h2>Можно идти вперёд.<br />Можно сначала разобраться глубже.</h2><p>Откройте непонятное понятие, перейдите к его основам и вернитесь к исходному эксперименту. Не требуется заранее знать всю математику этой карты.</p><div className="curriculum-mini-route"><ConceptLink concept="gradient">Градиент</ConceptLink><span>→</span><ConceptLink concept="derivative">Производная</ConceptLink><span>→</span><ConceptLink concept="function">Функция</ConceptLink></div></section>
    <section className="curriculum-route-selector" aria-label="Выбор учебного маршрута"><div className="button-row">{studyRoutes.map(item => <button key={item.id} aria-pressed={route === item.id} onClick={() => setRoute(item.id)}>{item.label}</button>)}</div><p role="status">{current.description}</p></section>
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
    <section className="panel curriculum-dictionary"><h2>Найти нужное понятие</h2><p>Все {concepts.length} карточек содержат объяснение, пример, точную запись и границы. Ссылки внутри продолжают разбор глубже.</p><label htmlFor={inputId}>Название или смысл понятия<input id={inputId} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Например, производная, batch, логарифм" /></label><p className="curriculum-search-status" role="status">Найдено: {found.length}</p><div className="curriculum-dictionary-links">{found.map(concept => <div key={concept.id}><ConceptLink concept={concept.id}>{concept.title.split(':')[0]}</ConceptLink><span>{concept.demo ? 'с экспериментом' : 'численный разбор'}</span></div>)}</div>{!found.length && <p>Попробуйте более короткое слово. Например, «градиент» или «вероятность».</p>}</section>
    <aside className="curriculum-boundary"><h2>Масштаб этой лаборатории</h2><p>Здесь {curriculum.filter(topic => topic.coverage === 'interactive').length} разделов с вычисляемыми экспериментами, {curriculum.filter(topic => topic.coverage === 'reading').length} раздела с разборами и {curriculum.filter(topic => topic.coverage === 'next').length} ориентиров для продолжения. Это карта входа в тему, а не обещание реализовать все нейросети.</p><p>Все локальные расчёты выполняются на TypeScript в браузере. XOR обучается; остальные архитектуры показывают малые прямые проходы. GPU, обучение больших моделей и подключение к RustML API пока отсутствуют.</p><p><a href="https://cs231n.stanford.edu/2025/schedule.html" target="_blank" rel="noreferrer">Сопоставить с программой Stanford CS231n 2025 ↗</a></p></aside>
  </div>;
}
