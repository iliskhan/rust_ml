import { useEffect, useId, useState, type ReactNode, type RefObject } from 'react'
import { useLearningActive } from './learning-context'
import { focusLessonSection } from './LessonOutline'
import './backprop-animation.css'

export function LessonAnimation({ videoRef, title, label, description, media, chapters, children, target, jumpLabel, className = '' }: {
  videoRef: RefObject<HTMLVideoElement | null>
  title: string; label: string; description: ReactNode; media: string
  chapters: { title: string; start: number; frame: number }[]
  children: ReactNode; target: string; jumpLabel: string; className?: string
}) {
  const active = useLearningActive()
  const id = useId()
  const [failed, setFailed] = useState(false)
  const [chapter, setChapter] = useState(0)
  const mediaBase = `${import.meta.env.BASE_URL}animations/${media}/`

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
      <button type="button" onClick={() => { setChapter(0); setFailed(false) }}>Повторить загрузку видео</button>
    </div> : <video ref={videoRef} controls playsInline preload="metadata"
      src={`${mediaBase}${media}.mp4`} poster={`${mediaBase}poster.png`}
      aria-label={label} aria-describedby={`${id}-description`}
      onError={() => setFailed(true)}
      onPlay={event => { if (!active || document.hidden) event.currentTarget.pause() }}
      onTimeUpdate={event => setChapter(Math.max(0, chapters.filter(item => event.currentTarget.currentTime >= item.start).length - 1))}>
      <track kind="captions" src={`${mediaBase}captions.ru.vtt`} srcLang="ru" label="Русские субтитры" default />
      Ваш браузер не поддерживает видео. Прочитайте текст и таблицу ниже.
    </video>}
    <nav className="lesson-animation-chapters" aria-label="Шаги анимации">
      {chapters.map((item, index) => <button key={item.title} type="button" disabled={failed}
        aria-current={chapter === index ? 'step' : undefined}
        onClick={() => {
          const video = videoRef.current
          if (!video) return
          video.pause()
          video.currentTime = item.frame
          setChapter(index)
        }}>{index + 1}. {item.title}</button>)}
    </nav>
    <p className="note">Запуск — только вручную. Выбор части открывает её ключевой кадр на паузе. Просмотр не засчитывает освоение темы.</p>
    {!failed && <button type="button" onClick={() => { videoRef.current?.pause(); setFailed(true) }}>Видео не запускается?</button>}
    <details onToggle={event => { if (event.currentTarget.open) videoRef.current?.pause() }}>
      <summary>Текст и числа: тот же пример без видео</summary>
      {children}
    </details>
    <div className="button-row"><button type="button" onClick={() => {
      videoRef.current?.pause()
      focusLessonSection(target)
    }}>{jumpLabel}</button></div>
  </section>
}
