import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useLearningActive } from './learning-context'
import { focusLessonSection } from './LessonOutline'
import { Exercise } from './ui'
import { crossesAnimationQuestion } from './animationInteraction'
import type { AnimationExampleControls } from './useAnimationExample'
import './backprop-animation.css'

export type AnimationQuestion = { question: string; options: string[]; correct: number; explanation: string }

export function LessonAnimation({ videoRef, title, label, description, media, chapters, children, target, jumpLabel, question, practice, example, onPlayback, className = '' }: {
  videoRef: RefObject<HTMLVideoElement | null>
  title: string; label: string; description: ReactNode; media: string
  chapters: { title: string; start: number; frame: number }[]
  children: ReactNode; target: string; jumpLabel: string; className?: string
  question: AnimationQuestion & { time: number }; practice: AnimationQuestion
  example: AnimationExampleControls
  onPlayback?: () => void
}) {
  const active = useLearningActive()
  const id = useId()
  const [failed, setFailed] = useState(false)
  const [chapter, setChapter] = useState(0)
  const [questionOpen, setQuestionOpen] = useState(false)
  const [answer, setAnswer] = useState<number | null>(null)
  const [playMessage, setPlayMessage] = useState('')
  const previousTime = useRef(0)
  const questionArmed = useRef(true)
  const questionHeading = useRef<HTMLHeadingElement>(null)
  const mediaBase = `${import.meta.env.BASE_URL}animations/${media}/`

  function seeked(time: number) {
    previousTime.current = time
    if (time < question.time) {
      questionArmed.current = true
      setQuestionOpen(false)
      setAnswer(null)
    }
  }

  function continueVideo() {
    setQuestionOpen(false)
    setPlayMessage('')
    videoRef.current?.play().catch(() => setPlayMessage('Продолжите кнопкой воспроизведения в самом видео.'))
  }

  useEffect(() => {
    if (questionOpen) {
      questionHeading.current?.focus({ preventScroll: true })
      questionHeading.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    }
  }, [questionOpen])

  useEffect(() => {
    if (!active) videoRef.current?.pause()
  }, [active, videoRef])

  useEffect(() => {
    const video = videoRef.current
    const pauseWhenHidden = () => { if (document.hidden) videoRef.current?.pause() }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', pauseWhenHidden)
      video?.pause()
    }
  }, [videoRef, failed])

  return <section className={`panel lesson-animation ${className}`} aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>{title}</h3>
    <p id={`${id}-description`}>{description}</p>
    {failed ? <div className="lesson-animation-fallback" role="status">
      <p>Видео не удалось загрузить или воспроизвести. Весь пример доступен ниже в тексте и таблице; лаборатория продолжает работать.</p>
      <button type="button" onClick={() => { setChapter(0); seeked(0); setFailed(false) }}>Повторить загрузку видео</button>
    </div> : <video ref={videoRef} controls playsInline preload="metadata"
      src={`${mediaBase}${media}.mp4`} poster={`${mediaBase}poster.png`}
      aria-label={label} aria-describedby={`${id}-description`}
      onError={() => setFailed(true)}
      onPlay={event => {
        if (event.currentTarget.currentTime < question.time && previousTime.current >= question.time) seeked(event.currentTarget.currentTime)
        previousTime.current = event.currentTarget.currentTime
        if (!active || document.hidden) event.currentTarget.pause()
        else { setQuestionOpen(false); onPlayback?.() }
      }}
      onSeeked={event => seeked(event.currentTarget.currentTime)}
      onTimeUpdate={event => {
        const video = event.currentTarget
        setChapter(Math.max(0, chapters.filter(item => video.currentTime >= item.start).length - 1))
        if (questionArmed.current && crossesAnimationQuestion(previousTime.current, video.currentTime, question.time, !video.paused, video.seeking)) {
          questionArmed.current = false
          video.pause()
          setQuestionOpen(true)
        }
        previousTime.current = video.currentTime
      }}>
      <track kind="captions" src={`${mediaBase}captions.ru.vtt`} srcLang="ru" label="Русские субтитры" default />
      Ваш браузер не поддерживает видео. Прочитайте текст и таблицу ниже.
    </video>}
    <p className="note">Русская синтезированная озвучка. Звук и громкость — в управлении видео; русские субтитры доступны там же. Видео запускается только вручную.</p>
    {questionOpen && <section className="lesson-animation-question" aria-labelledby={`${id}-question`}>
      <p className="eyebrow">Пауза перед объяснением</p>
      <h4 id={`${id}-question`} ref={questionHeading} tabIndex={-1}>{question.question}</h4>
      <div className="button-row">{question.options.map((option, index) => <button key={option} type="button" aria-pressed={answer === index} onClick={() => setAnswer(index)}>{option}</button>)}</div>
      {answer !== null && <p role="status">{answer === question.correct ? 'Верно. ' : 'Разберём ответ. '}{question.explanation}</p>}
      <button type="button" onClick={continueVideo}>{answer === null ? 'Пропустить вопрос и продолжить' : 'Продолжить видео'}</button>
      <p className="note">Это пробный прогноз: он не меняет прогресс или оценки. Можно продолжить и без ответа.</p>
    </section>}
    {playMessage && <p role="status">{playMessage}</p>}
    <nav className="lesson-animation-chapters" aria-label="Шаги анимации">
      {chapters.map((item, index) => <button key={item.title} type="button" disabled={failed}
        aria-current={chapter === index ? 'step' : undefined}
        onClick={() => {
          const video = videoRef.current
          if (!video) return
          video.pause()
          video.currentTime = item.frame
          seeked(item.frame)
          setChapter(index)
        }}>{index + 1}. {item.title}</button>)}
    </nav>
    <p className="note">Запуск — только вручную. Выбор части открывает её ключевой кадр на паузе. Просмотр не засчитывает освоение темы.</p>
    {!failed && <button type="button" onClick={() => { videoRef.current?.pause(); setFailed(true) }}>Видео не запускается?</button>}
    <details onToggle={event => { if (event.currentTarget.open) videoRef.current?.pause() }}>
      <summary>Текст и числа: тот же пример без видео</summary>
      {children}
    </details>
    <details onToggle={event => { if (event.currentTarget.open) videoRef.current?.pause() }}>
      <summary>Новый случай: проверьте себя на других условиях</summary>
      <p className="note">Отдельный тренировочный пример после разбора. Ответ и объяснение появятся после вашего выбора; эта попытка не отправляется на сервер и не выдаёт зачёт.</p>
      <Exercise {...practice} />
    </details>
    <div className="button-row">
      <button type="button" onClick={() => { videoRef.current?.pause(); example.onApply(); focusLessonSection(target) }}>Применить числа ролика в лаборатории ↓</button>
      <button type="button" disabled={!example.canRestore} onClick={() => { videoRef.current?.pause(); example.onRestore(); focusLessonSection(target) }}>Вернуть мои настройки</button>
    </div>
    <p className="note">Первое применение сохраняет ваши текущие числа. Повторное применение сохраняет ту же копию; возврат восстанавливает её. Если в лаборатории есть автообучение, оно остаётся на паузе.</p>
    <div className="button-row"><button type="button" onClick={() => {
      videoRef.current?.pause()
      focusLessonSection(target)
    }}>{jumpLabel}</button></div>
  </section>
}
