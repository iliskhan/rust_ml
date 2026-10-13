import { useEffect, useId, useState } from 'react'
import { practiceTopics, practiceRelease, type PracticeLanguage, type PracticeTopic } from '../all-catalog'
import { browserPracticeStore, type LocalPracticeStore } from '../local-progress'
import type { PracticeCloud } from '../cloud'
import { practiceLessonLabels } from '../placement'
import { countLearningExercises, progressLanguageLabels, progressLanguages, readAccountProgress, readLearningProgress, type AccountProgressCatalog, type AccountTopicProgress, type ExerciseLearningProgress } from './learning-progress'
import './practice-progress.css'

export type PracticeProgressProps = {
  ownerId?: string; store?: LocalPracticeStore; topics?: readonly PracticeTopic[]; releaseId?: string
  cloud?: PracticeCloud | null; accountCatalog?: AccountProgressCatalog
  onOpenExercise?: (exercise: Pick<ExerciseLearningProgress, 'scope' | 'topicId'>) => void
}
type AccountState = { status: 'loading' | 'ready' | 'error'; rows: AccountTopicProgress[]; message?: string }
const cloudOwnerId = (cloud?: PracticeCloud | null) => { try { return cloud?.session?.user.id } catch { return undefined } }

/** Standalone view: parent supplies the current owner and cloud catalog metadata. */
export function PracticeProgress({ ownerId, store: suppliedStore, topics = practiceTopics, releaseId = practiceRelease, cloud, accountCatalog, onOpenExercise }: PracticeProgressProps) {
  const id = useId()
  const [browserStore] = useState(browserPracticeStore)
  const store = suppliedStore ?? browserStore
  const [, refreshLocal] = useState(0)
  const [accountRevision, refreshAccount] = useState(0)
  const [selection, select] = useState<{ ownerId?: string; releaseId: string; language: PracticeLanguage } | null>(null)
  const [lessonId, setLessonId] = useState('')
  const [account, setAccount] = useState<{ ownerId: string; catalog: AccountProgressCatalog; state: AccountState } | null>(null)
  const local = readLearningProgress(store, topics, releaseId, ownerId)
  const language = selection && selection.ownerId === ownerId && selection.releaseId === releaseId ? selection.language : local.primaryLanguage
  const current = local.languages.find(row => row.language === language)!
  const lessons = [...new Set(topics.map(topic => topic.lessonId))]
  const selectedLesson = lessons.includes(lessonId) ? lessonId : ''
  const shownTopics = current.topics.filter(t => !selectedLesson || t.lessonId === selectedLesson)
  const counts = countLearningExercises(shownTopics.flatMap(t => t.exercises))
  const continueWith = current.continueWith

  useEffect(() => {
    const update = () => refreshLocal(n => n + 1)
    window.addEventListener('storage', update)
    window.addEventListener('rustml-practice-change', update)
    window.addEventListener('rustml-practice-language', update)
    window.addEventListener('focus', update)
    return () => {
      window.removeEventListener('storage', update); window.removeEventListener('rustml-practice-change', update)
      window.removeEventListener('rustml-practice-language', update); window.removeEventListener('focus', update)
    }
  }, [])
  useEffect(() => {
    const graded = (event: Event) => { if ((event as CustomEvent<{ ownerId?: string }>).detail?.ownerId === ownerId) refreshAccount(n => n + 1) }
    window.addEventListener('rustml-practice-grade', graded)
    return () => window.removeEventListener('rustml-practice-grade', graded)
  }, [ownerId])
  useEffect(() => {
    if (!cloud || !ownerId || !accountCatalog || accountCatalog.releaseKey !== releaseId || cloudOwnerId(cloud) !== ownerId) { setAccount(null); return }
    let active = true
    const catalog = accountCatalog
    const publish = (state: AccountState) => { if (active && cloudOwnerId(cloud) === ownerId) setAccount({ ownerId, catalog, state }) }
    publish({ status: 'loading', rows: [] })
    void cloud.progress().then(rows => publish({ status: 'ready', rows: readAccountProgress(rows, catalog, ownerId) }))
      .catch(() => publish({ status: 'error', rows: [], message: 'Не удалось загрузить прогресс аккаунта. Локальная практика доступна; повторите загрузку.' }))
    return () => { active = false }
  }, [cloud, ownerId, accountCatalog, releaseId, accountRevision])
  const accountState = cloudOwnerId(cloud) === ownerId && accountCatalog?.releaseKey === releaseId && account && account.ownerId === ownerId && account.catalog === accountCatalog ? account.state : null
  const accountRows = accountState?.rows.filter(row => row.language === language && shownTopics.some(topic => topic.id === row.topicId)) ?? []
  const accountTotal = accountRows.reduce((sum, row) => sum + row.total, 0)
  const accountCompleted = accountRows.reduce((sum, row) => sum + row.completed, 0)
  const accountPrimary = accountState?.rows.find(row => row.isPrimary)?.language

  return <section className="panel practice-progress" aria-labelledby={`${id}-title`}>
    <span className="eyebrow">Учебный прогресс · {releaseId}</span>
    <h2 id={`${id}-title`}>Мой прогресс</h2>
    <p>{ownerId && cloud ? 'История текущего аккаунта синхронизируется между устройствами. Состояние синхронизации показано рядом с аккаунтом.' : ownerId ? 'Локальные записи текущего аккаунта на этом устройстве.' : 'Гостевые записи на этом устройстве.'} Основной маршрут: {progressLanguageLabels[local.primaryLanguage]}. Другие языки сохраняются отдельно.</p>
    {local.primaryError && <p role="alert">{local.primaryError}</p>}
    <div className="practice-progress-controls">
      <label htmlFor={`${id}-language`}>Язык прогресса<select id={`${id}-language`} value={language} onChange={event => select({ ownerId, releaseId, language: event.target.value as PracticeLanguage })}>
        {progressLanguages.map(value => <option key={value} value={value}>{progressLanguageLabels[value]}{value === local.primaryLanguage ? ' · основной' : ''}</option>)}
      </select></label>
      <label htmlFor={`${id}-course`}>Курс<select id={`${id}-course`} value={selectedLesson} onChange={event => setLessonId(event.target.value)}>
        <option value="">Все курсы</option>{lessons.map(value => <option key={value} value={value}>{practiceLessonLabels[value] ?? value}</option>)}
      </select></label>
      <button type="button" onClick={() => { refreshLocal(n => n + 1); refreshAccount(n => n + 1) }}>Обновить прогресс</button>
    </div>
    <p className="note">Самопроверка — вопрос на понимание. Черновик и верный ответ не подтверждают проверку кода или самостоятельное освоение темы. {cloud?.gradingAvailable ? 'Серверный зачёт учитывает проверенные открытые примеры и историю помощи.' : 'Серверная оценка кода пока отключена.'}</p>
    <div className="practice-progress-languages" aria-label="Записи по языкам">
      {local.languages.map(row => <p key={row.language}><strong>{progressLanguageLabels[row.language]}{row.language === local.primaryLanguage ? ' · основной' : ''}</strong><br />
        Начата работа: {row.topicsStarted} / {row.topics.length} тем. Черновики: {row.counts.drafts} / {row.counts.exercisesTotal} упражнений. Самопроверки: {row.counts.quizExercises} / {row.counts.exercisesTotal}.{row.counts.unreadable > 0 && ` Непрочитано записей: ${row.counts.unreadable}. Числа неполные.`}</p>)}
    </div>
    {continueWith && <p>Последняя работа на {progressLanguageLabels[language]}: {continueWith.title}. {onOpenExercise && <button type="button" onClick={() => onOpenExercise(continueWith)}>Продолжить работу</button>}</p>}
    <h3>{ownerId && cloud ? 'История аккаунта' : 'На этом устройстве'} · {progressLanguageLabels[language]}</h3>
    {topics.length === 0 ? <p role="status">В этом выпуске нет упражнений.</p> : <>
      <p role="status">Темы: {shownTopics.length}. Упражнения: {counts.exercisesTotal}. Черновики: {counts.drafts}. Помощь открыта: {counts.helped}. Самопроверки: {counts.quizExercises}; последний ответ верен: {counts.latestCorrect}. Сохранено ответов: {counts.quizAttempts}.</p>
      {counts.unreadable > 0 && <p role="alert">Не удалось прочитать {counts.unreadable} записей. Их данные не изменены; числа могут быть неполными. Повторите чтение кнопкой «Обновить прогресс».</p>}
      {counts.drafts === 0 && counts.helped === 0 && counts.quizExercises === 0 && counts.unreadable === 0 && <p role="status">Пока нет сохранённых записей на этом языке. Выберите упражнение и начните работу.</p>}
      {shownTopics.map(topic => <details key={topic.id} className="practice-progress-topic">
        <summary>{topic.title} — черновики {topic.counts.drafts}/{topic.counts.exercisesTotal}; самопроверки {topic.counts.quizExercises}/{topic.counts.exercisesTotal}</summary>
        <ul>{topic.exercises.map(exercise => <li key={exercise.scope.exerciseId}>
          <strong>{exercise.title}</strong>. {exercise.error ? 'Запись недоступна.' : `${exercise.hasDraft ? 'Черновик сохранён на этом устройстве' : 'Черновика нет на этом устройстве'}; ${exercise.helpKinds.length ? 'помощь открыта' : 'помощь не открыта'}; ${exercise.quizAttempts ? `ответов: ${exercise.quizAttempts}, последний ${exercise.latestQuizCorrect ? 'верен' : 'неверен'}` : 'самопроверки ещё нет'}.`}
          {onOpenExercise && <button type="button" onClick={() => onOpenExercise(exercise)}>Открыть {exercise.title}</button>}
        </li>)}</ul>
      </details>)}
    </>}
    <h3>Подтверждение в аккаунте</h3>
    {!ownerId ? <p>Войдите в аккаунт, чтобы загрузить его серверный прогресс. Гостевые записи останутся отдельными.</p> :
      !cloud ? <p>Облачный прогресс ещё не подключён. Показаны локальные записи этого аккаунта.</p> :
      !accountCatalog || accountCatalog.releaseKey !== releaseId ? <p>Для этого выпуска ещё не загружена карта серверных тем.</p> :
      cloudOwnerId(cloud) !== ownerId ? <p>Сессия текущего аккаунта недоступна. Войдите снова для загрузки прогресса.</p> :
      !accountState || accountState.status === 'loading' ? <p role="status">Загружаем прогресс текущего аккаунта…</p> :
      accountState.status === 'error' ? <p role="alert">{accountState.message}</p> :
      accountRows.length === 0 ? <p role="status">В аккаунте ещё нет данных прогресса для выбранного выпуска, курса и языка.</p> : <>
        <p role="status">Серверные требования: {accountCompleted} / {accountTotal}. Данные есть для {accountRows.length} / {shownTopics.length} тем на {progressLanguageLabels[language]}. Основной язык аккаунта: {accountPrimary ? progressLanguageLabels[accountPrimary] : 'не указан в ответе сервера'}.</p>
        <ul>{accountRows.map(row => <li key={row.topicId}>{shownTopics.find(topic => topic.id === row.topicId)?.title}: выполнено {row.completed} / {row.total} требований; pass: {row.passed}. {row.total > 0 && row.completed === row.total ? 'Тема подтверждена сервером.' : 'Остались требования, включая самостоятельный перенос, если он обязателен.'}</li>)}</ul>
      </>}
  </section>
}
