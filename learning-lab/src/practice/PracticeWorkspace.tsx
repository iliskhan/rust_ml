import { useState } from 'react';
import { practiceTopics } from './all-catalog';
import { PracticeAccount, PracticeSection } from './PracticeCloudProvider';
import { practiceLessonLabels } from './placement';

export function PracticeWorkspace() {
  const lessons = [...new Set(practiceTopics.map(topic => topic.lessonId))];
  const [lessonId, setLessonId] = useState(lessons[0] || 'neuron');
  return <>
    <PracticeAccount />
    <section className="panel">
      <h2>Практика по темам</h2>
      <p>Выберите тему, разберите формулу и допишите небольшой фрагмент на своём языке. Задания также доступны после соответствующих уроков.</p>
      <label htmlFor="practice-route">Раздел практики</label>
      <select id="practice-route" value={lessonId} onChange={event => setLessonId(event.target.value)}>{lessons.map(id => <option key={id} value={id}>{practiceLessonLabels[id] || id}</option>)}</select>
      <p>{practiceTopics.length} тем с заданиями. Новые пакеты добавляются по реестру учебника.</p>
    </section>
    <PracticeSection key={lessonId} lessonId={lessonId} />
  </>;
}
