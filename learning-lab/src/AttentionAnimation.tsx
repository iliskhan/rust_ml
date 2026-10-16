import type { RefObject } from 'react'
import fixture from '../animations/attention/fixture.json'
import { LessonAnimation } from './LessonAnimation'
import { fmt } from './ui'

const chapters = [
  { title: 'Роли Q, K и V', start: 0, frame: 6 },
  { title: 'Скалярные произведения', start: 8, frame: 16 },
  { title: 'Будущий ключ и маска', start: 18, frame: 24 },
  { title: 'Softmax: сумма весов 1', start: 26, frame: 33 },
  { title: 'Смесь векторов V', start: 35, frame: 40 },
]
const vec = (values: number[]) => `[${values.map(value => fmt(value, 6)).join('; ')}]`
const row = fixture.queryIndex
const trace = fixture.trace

export function AttentionAnimation({ videoRef, query, causal, temperature }: {
  videoRef: RefObject<HTMLVideoElement | null>; query: number; causal: boolean; temperature: number
}) {
  return <LessonAnimation videoRef={videoRef} media="attention" title="Как attention собирает одно сообщение"
    label="Attention: Q, K, V, причинная маска, softmax и смесь"
    description={<>Фиксированный пример: <strong>«кот · ест · рыбу», запрос 1 («ест»), causal-маска, деление на √2, T = 1</strong>. Настройки лаборатории не меняют ролик. Сейчас в лаборатории: запрос {query} («{fixture.tokens[query]}»), causal {causal ? 'включён' : 'выключен'}, T = {fmt(temperature)}.</>}
    chapters={chapters} target="attention-controls" jumpLabel="Разобрать свой attention ↓">
    <ol className="lesson-animation-transcript">
      <li><strong>Роли Q, K и V.</strong> Q = XWQ — запросы, K = XWK — ключи для сравнения, V = XWV — передаваемые значения. Для «ест» q₁ = {vec(trace.q[row])}. Это одна голова; слова служат подписями учебных векторов.</li>
      <li><strong>Скалярные произведения.</strong> q₁ сравниваем с каждым K: получаем {vec(trace.rawScores[row])}. Делим на √dₖ = √2: {vec(trace.scaledScores[row])}. Больший разрешённый score даст больший вес.</li>
      <li><strong>Будущий ключ и маска.</strong> Для запроса 1 позиции 0 и 1 разрешены; будущая позиция 2 («рыбу») запрещена. Её score становится −∞, а не 0. Это делает её вес нулевым.</li>
      <li><strong>Softmax: сумма весов 1.</strong> Softmax строки после маски даёт {vec(trace.weights[row])}. Все веса неотрицательны и суммируются в 1. Температура этого примера равна 1.</li>
      <li><strong>Смесь векторов V.</strong> Складываем значения по координатам: {fmt(trace.weights[row][0], 6)} · {vec(trace.v[0])} + {fmt(trace.weights[row][1], 6)} · {vec(trace.v[1])} + 0 · {vec(trace.v[2])} ≈ {vec(trace.output[row])}. Это смесь V, а не K; веса не доказывают языковое понимание.</li>
    </ol>
    <table className="data-table"><caption>Запрос 1 («ест»): от score к смеси V</caption>
      <thead><tr><th scope="col">Ключ</th><th scope="col">q₁ · K</th><th scope="col">Score после маски</th><th scope="col">Вес</th><th scope="col">V</th></tr></thead>
      <tbody>{fixture.tokens.map((token, index) => <tr key={token}>
        <th scope="row">{index}: {token}</th><td>{fmt(trace.rawScores[row][index])}</td>
        <td>{fixture.allowed[row][index] ? fmt(trace.scores[row][index]!, 6) : '−∞ (запрещён)'}</td>
        <td>{fmt(trace.weights[row][index], 6)}</td><td>{vec(trace.v[index])}</td>
      </tr>)}</tbody>
    </table>
    <p>Выход для «ест»: <strong>{vec(trace.output[row])}</strong>. Внутренний расчёт использует полные числа; здесь они округлены до шести знаков.</p>
    <details><summary>Исходные матрицы фиксированного примера</summary>
      <p>X = {fixture.input.map(vec).join('; ')}.</p>
      <p>WQ = {fixture.projections.q.map(vec).join('; ')}; WK = {fixture.projections.k.map(vec).join('; ')}; WV = {fixture.projections.v.map(vec).join('; ')}.</p>
      <p>Строки X — позиции, строки W — входные признаки. Все матрицы W имеют размер 2 × 2. Bias, dropout и обучение в примере отсутствуют.</p>
    </details>
  </LessonAnimation>
}
