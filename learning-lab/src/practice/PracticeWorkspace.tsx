import { lazy, Suspense, useId, useState } from 'react';
import { practiceRelease, practiceTopics } from './all-catalog';
import { PracticeAccount, PracticeSection, usePracticeAccount } from './PracticeCloudProvider';
import { practiceLessonLabels } from './placement';
import type { PracticeSelection } from './PracticePanel';
const PracticeLearningProgress = lazy(() => import('./PracticeLearningProgress').then(module => ({ default: module.PracticeLearningProgress })));

export function PracticeWorkspace() {
  const lessons = [...new Set(practiceTopics.map(topic => topic.lessonId))];
  const [lessonId, setLessonId] = useState(lessons[0] || 'neuron');
  const account = usePracticeAccount();
  const id = useId();
  const [showProgress, setShowProgress] = useState(false);
  const [navigation, setNavigation] = useState<{ selection: PracticeSelection; revision: number } | null>(null);
  const selection = navigation?.selection.scope.ownerId === account?.user?.id ? navigation?.selection : undefined;
  function openExercise(next: PracticeSelection) {
    if (next.scope.ownerId !== account?.user?.id || next.scope.releaseId !== practiceRelease) return;
    const topic = practiceTopics.find(topic => topic.id === next.topicId && topic.exercises.some(exercise => exercise.id === next.scope.exerciseId));
    if (!topic) return;
    setLessonId(topic.lessonId); setShowProgress(false);
    setNavigation(previous => ({ selection: next, revision: (previous?.revision ?? 0) + 1 }));
  }
  return <>
    <PracticeAccount />
    <section className="panel">
      <h2>Практика по темам</h2>
      <p>Выберите тему, разберите формулу и допишите небольшой фрагмент на своём языке. Задания также доступны после соответствующих уроков.</p>
      <label htmlFor="practice-route">Раздел практики</label>
      <select id="practice-route" value={lessonId} onChange={event => { setLessonId(event.target.value); setNavigation(null) }}>{lessons.map(id => <option key={id} value={id}>{practiceLessonLabels[id] || id}</option>)}</select>
      <p>{practiceTopics.length} тем с заданиями. Новые пакеты добавляются по реестру учебника.</p>
      <button type="button" aria-expanded={showProgress} aria-controls={`${id}-progress`} onClick={() => setShowProgress(value => !value)}>{showProgress ? 'Скрыть мой прогресс' : 'Показать мой прогресс'}</button>
    </section>
    <div id={`${id}-progress`} hidden={!showProgress}>{showProgress && <Suspense fallback={<p role="status">Загружаем прогресс…</p>}><PracticeLearningProgress onOpenExercise={openExercise} /></Suspense>}</div>
    <PracticeSection key={`${lessonId}/${navigation?.revision ?? 0}`} lessonId={lessonId} initialSelection={selection} />
  </>;
}
