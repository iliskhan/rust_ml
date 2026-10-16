import { useEffect, useId, useState, type RefObject } from 'react'
import { useLearningActive } from './learning-context'
import { sharedGraph } from './math'
import { fmt } from './ui'
import { focusLessonSection } from './LessonOutline'
import './backprop-animation.css'

const mediaBase = `${import.meta.env.BASE_URL}animations/backprop/`
const example = sharedGraph(2, 3, 2)
const chapters = [
  { title: 'Прямой проход', start: 0, frame: 10 },
  { title: 'Предскажите два пути', start: 12, frame: 14 },
  { title: 'Два обратных вклада', start: 18, frame: 29 },
  { title: 'Сложение и градиенты', start: 32, frame: 38 },
]

export function BackpropAnimation({ videoRef, x, w, target }: {
  videoRef: RefObject<HTMLVideoElement | null>; x: number; w: number; target: number
}) {
  const active = useLearningActive()
  const id = useId()
  const [failed, setFailed] = useState(false)
  const [chapter, setChapter] = useState(0)

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
  }, [videoRef])

  const { values, gradients, qContributions } = example
  return <section className="panel backprop-animation" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>Почему в общем узле складываются градиенты</h3>
    <p id={`${id}-description`}>Короткая анимация: фиксированный пример <strong>x = 2, w = 3, y = 2</strong>. Ползунки лаборатории не меняют ролик. Сейчас в лаборатории: x = {fmt(x)}, w = {fmt(w)}, y = {fmt(target)}.</p>
    {failed ? <div className="backprop-animation-fallback" role="status">
      <p>Видео не удалось загрузить или воспроизвести. Весь пример доступен ниже в тексте и таблице; лаборатория продолжает работать.</p>
      <button type="button" onClick={() => setFailed(false)}>Повторить загрузку видео</button>
    </div> : <video ref={videoRef} controls playsInline preload="metadata"
      src={`${mediaBase}backprop.mp4`} poster={`${mediaBase}poster.png`}
      aria-label="Обратный проход: два вклада в градиент общего узла" aria-describedby={`${id}-description`}
      onError={() => setFailed(true)}
      onPlay={event => { if (!active || document.hidden) event.currentTarget.pause() }}
      onTimeUpdate={event => setChapter(Math.max(0, chapters.filter(item => event.currentTarget.currentTime >= item.start).length - 1))}>
      <track kind="captions" src={`${mediaBase}captions.ru.vtt`} srcLang="ru" label="Русские субтитры" default />
      Ваш браузер не поддерживает видео. Прочитайте текст и таблицу ниже.
    </video>}
    {chapters.length > 0 && <nav className="backprop-animation-chapters" aria-label="Шаги анимации">
      {chapters.map((item, index) => <button key={item.title} type="button" disabled={failed}
        aria-current={chapter === index ? 'step' : undefined}
        onClick={() => {
          const video = videoRef.current
          if (!video) return
          video.pause()
          video.currentTime = item.frame
          setChapter(index)
        }}>{index + 1}. {item.title}</button>)}
    </nav>}
    <p className="note">Запуск — только вручную. Выбор части открывает её ключевой кадр на паузе. Просмотр не засчитывает освоение темы.</p>
    {!failed && <button type="button" onClick={() => {
      videoRef.current?.pause()
      setFailed(true)
    }}>Видео не запускается?</button>}
    <details onToggle={event => { if (event.currentTarget.open) videoRef.current?.pause() }}>
      <summary>Текст и числа: тот же пример без видео</summary>
      <ol className="backprop-animation-transcript">
        <li><strong>Прямой проход.</strong> x = 2 и w = 3 дают общий узел q = xw = 6. От него идут два пути: q² = 36 и q = 6. Их сумма p = 42; при цели y = 2 потеря L = ½(p − y)² = 800.</li>
        <li><strong>Локальные производные.</strong> ∂L/∂p = p − y = 40. У квадрата производная 2q = 12, у неизменённого q — 1. В каждой ветви умножаем производные вдоль пути.</li>
        <li><strong>Два обратных вклада.</strong> Через квадрат приходит 40 · 12 = 480, через прямую ветвь — 40 · 1 = 40. Оба пути зависят от одного q.</li>
        <li><strong>Сложение в общем узле.</strong> ∂L/∂q = 480 + 40 = 520. Затем ∂L/∂w = 520 · x = 1040 и ∂L/∂x = 520 · w = 1560. Если оставить только последний вклад, один путь потеряется.</li>
      </ol>
      <table className="data-table"><caption>Фиксированный пример ролика: x = 2, w = 3, y = 2</caption>
        <thead><tr><th scope="col">Величина</th><th scope="col">Расчёт</th><th scope="col">Значение</th></tr></thead>
        <tbody>
          <tr><th scope="row">Общий узел q</th><td>x · w</td><td>{fmt(values.q)}</td></tr>
          <tr><th scope="row">Предсказание p</th><td>q² + q</td><td>{fmt(values.p)}</td></tr>
          <tr><th scope="row">Потеря L</th><td>½(p − y)²</td><td>{fmt(values.loss)}</td></tr>
          <tr><th scope="row">Вклад квадрата</th><td>(p − y) · 2q</td><td>{fmt(qContributions.square)}</td></tr>
          <tr><th scope="row">Вклад прямой ветви</th><td>(p − y) · 1</td><td>{fmt(qContributions.identity)}</td></tr>
          <tr><th scope="row">∂L/∂q</th><td>480 + 40</td><td>{fmt(gradients.q)}</td></tr>
          <tr><th scope="row">∂L/∂w</th><td>(∂L/∂q) · x</td><td>{fmt(gradients.w)}</td></tr>
          <tr><th scope="row">∂L/∂x</th><td>(∂L/∂q) · w</td><td>{fmt(gradients.x)}</td></tr>
        </tbody>
      </table>
    </details>
    <div className="button-row"><button type="button" onClick={() => {
      videoRef.current?.pause()
      focusLessonSection('backprop-walkthrough')
    }}>Разобрать свои числа по шагам ↓</button></div>
  </section>
}
