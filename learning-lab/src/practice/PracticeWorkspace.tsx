import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import { practiceRelease, practiceTopics } from './all-catalog';
import { PracticeAccount, PracticeSection, usePracticeAccount } from './PracticeCloudProvider';
import { practiceLessonLabels } from './placement';
import type { PracticeSelection } from './PracticePanel';
import { browserPracticeStore } from './local-progress';
import { progressLanguageLabels, readLearningProgress } from './progress/learning-progress';
import { findPracticeTopics, latestPracticeWork } from './progress/practice-navigation';
import './practice.css';
const PracticeLearningProgress = lazy(() => import('./PracticeLearningProgress').then(module => ({ default: module.PracticeLearningProgress })));

export function PracticeWorkspace() {
  const lessons = [...new Set(practiceTopics.map(topic => topic.lessonId))];
  const [lessonId, setLessonId] = useState(lessons[0] || 'neuron');
  const account = usePracticeAccount();
  const id = useId();
  const [showProgress, setShowProgress] = useState(false);
  const [query, setQuery] = useState('');
  const [resultId, setResultId] = useState('');
  const [store] = useState(browserPracticeStore);
  const [revision, refresh] = useState(0);
  const ownerId = account?.user?.id;
  const progress = useMemo(() => readLearningProgress(store, practiceTopics, practiceRelease, ownerId), [store, ownerId, revision]);
  const recent = latestPracticeWork(progress);
  const results = findPracticeTopics(practiceTopics, query, practiceLessonLabels);
  const result = results.find(row => row.topic.id === resultId) ?? results[0];
  useEffect(() => {
    const update = () => refresh(n => n + 1);
    window.addEventListener('rustml-practice-change', update);
    window.addEventListener('storage', update);
    window.addEventListener('focus', update);
    return () => { window.removeEventListener('rustml-practice-change', update); window.removeEventListener('storage', update); window.removeEventListener('focus', update); };
  }, []);
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
    <section className="panel practice-navigation">
      <h2>Практика по темам</h2>
      <p>Выберите тему, разберите формулу и допишите небольшой фрагмент на своём языке. Задания также доступны после соответствующих уроков.</p>
      {recent && <div className="practice-resume">
        <p>Последняя работа {ownerId ? 'этого аккаунта' : 'гостя'}: <strong>{recent.title}</strong> · {progressLanguageLabels[recent.scope.language]}.</p>
        <button type="button" onClick={() => openExercise(recent)}>Продолжить последнюю работу</button>
        <p className="note">По записям на этом устройстве. Это не подтверждение освоения.</p>
      </div>}
      {progress.primaryError && <p role="alert">{progress.primaryError}</p>}
      {progress.languages.some(row => row.counts.unreadable > 0) && <p role="alert">Часть записей недоступна. Сведения о последней работе могут быть неполными; подробности — в «Мой прогресс».</p>}
      <form className="practice-search" onSubmit={event => {
        event.preventDefault();
        if (result) openExercise({ topicId: result.topic.id, scope: { releaseId: practiceRelease, exerciseId: result.exercise.id, language: progress.primaryLanguage, ownerId } });
      }}>
        <label htmlFor={`${id}-search`}>Найти тему или задание</label>
        <input id={`${id}-search`} type="search" value={query} placeholder="Например, softmax или градиент" aria-describedby={`${id}-search-help`} onChange={event => { setQuery(event.target.value); setResultId(''); }} />
        <p id={`${id}-search-help`} className="note">По всем {practiceTopics.length} темам, названиям заданий и разделов. Открывается черновик на основном языке: {progressLanguageLabels[progress.primaryLanguage]}.</p>
        {query.trim() && <>
          <p role="status">{results.length ? `Найдено тем: ${results.length}.` : 'Ничего не найдено. Попробуйте другое слово или выберите раздел ниже.'}</p>
          {result && <>
            <label htmlFor={`${id}-result`}>Результаты поиска</label>
            <select id={`${id}-result`} value={result.topic.id} onChange={event => setResultId(event.target.value)}>{results.map(row => <option key={row.topic.id} value={row.topic.id}>{row.topic.title} · {practiceLessonLabels[row.topic.lessonId] ?? row.topic.lessonId}</option>)}</select>
            <p>{result.topic.title} → {result.exercise.title}</p>
            <button type="submit">Открыть найденное задание</button>
          </>}
        </>}
      </form>
      <label htmlFor="practice-route">Раздел практики</label>
      <select id="practice-route" value={lessonId} onChange={event => { setLessonId(event.target.value); setNavigation(null) }}>{lessons.map(id => <option key={id} value={id}>{practiceLessonLabels[id] || id}</option>)}</select>
      <button type="button" aria-expanded={showProgress} aria-controls={`${id}-progress`} onClick={() => setShowProgress(value => !value)}>{showProgress ? 'Скрыть мой прогресс' : 'Показать мой прогресс'}</button>
    </section>
    <div id={`${id}-progress`} hidden={!showProgress}>{showProgress && <Suspense fallback={<p role="status">Загружаем прогресс…</p>}><PracticeLearningProgress onOpenExercise={openExercise} /></Suspense>}</div>
    <PracticeSection key={`${lessonId}/${navigation?.revision ?? 0}`} lessonId={lessonId} initialSelection={selection} />
  </>;
}
