import type { RefObject } from 'react'
import { sharedGraph } from './math'
import { fmt } from './ui'
import { LessonAnimation } from './LessonAnimation'

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
  const { values, gradients, qContributions } = example
  return <LessonAnimation videoRef={videoRef} className="backprop-animation" media="backprop"
    title="Почему в общем узле складываются градиенты"
    label="Обратный проход: два вклада в градиент общего узла"
    description={<>Короткая анимация: фиксированный пример <strong>x = 2, w = 3, y = 2</strong>. Ползунки лаборатории не меняют ролик. Сейчас в лаборатории: x = {fmt(x)}, w = {fmt(w)}, y = {fmt(target)}.</>}
    chapters={chapters} target="backprop-walkthrough" jumpLabel="Разобрать свои числа по шагам ↓">
      <ol className="lesson-animation-transcript">
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
  </LessonAnimation>
}
