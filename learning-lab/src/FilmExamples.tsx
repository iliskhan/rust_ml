import type { RefObject } from 'react'
import descent from '../animations/descent/fixture.json'
import xor from '../animations/xor/fixture.json'
import rope from '../animations/rope/fixture.json'
import heads from '../animations/heads/fixture.json'
import generation from '../animations/generation/fixture.json'
import { LessonAnimation } from './LessonAnimation'
import type { AnimationExampleControls } from './useAnimationExample'
import { fmt } from './ui'

type FilmProps = { videoRef: RefObject<HTMLVideoElement | null>; example: AnimationExampleControls; onPlayback?: () => void }
const vec = (values: number[]) => `[${values.map(value => fmt(value, 5)).join('; ')}]`
const coreChapters = (titles: string[]) => titles.map((title, index) => ({ title, start: [0, 10, 18, 28, 42][index], frame: [8, 14, 24, 37, 46][index] }))
const transformerChapters = (titles: string[], times: number[]) => titles.map((title, index) => ({ title, start: times[index], frame: Math.min(49, times[index] + 3) }))

export function DescentAnimation({ videoRef, example, onPlayback }: FilmProps) {
  return <LessonAnimation videoRef={videoRef} example={example} onPlayback={onPlayback} media="descent" title="Спуск и величина шага"
    label="Градиент, шаг SGD и сравнение трёх оптимизаторов" target="optimizer-controls" jumpLabel="К своему эксперименту с шагом ↓"
    description={<>Фиксированный опыт: L = ½(x² + 8y²), старт [−3; 1.5], η = 0.12. Затем сравниваем большой шаг η = 0.30 и три оптимизатора. Изменения лаборатории не меняют ролик.</>}
    chapters={coreChapters(['Одна функция', 'Предскажите шаг', 'Шаг и перелёт', 'Три оптимизатора', 'Проверьте сами'])}
    question={{ time: 14, question: 'После одного шага SGD при η = 0.12 знак y изменится?', options: ['Останется положительным', 'Станет отрицательным', 'y не изменится'], correct: 0, explanation: 'gᵧ = 8·1.5 = 12. Новый y = 1.5 − 0.12·12 = 0.06: знак сохранился.' }}
    practice={{ question: 'Новый случай: y = 1, gᵧ = 8, η = 0.20. Какой y после шага SGD?', options: ['−0.6', '0.6', '−1.6'], correct: 0, explanation: 'y = 1 − 0.20·8 = −0.6. Знак меняется, а модуль уменьшается. Перелёт через минимум ещё не означает расходимость.' }}>
    <ol className="lesson-animation-transcript">
      <li>Высота поверхности — реальная потеря L, две горизонтальные оси — веса x и y. Градиент [x; 8y] указывает рост потери, а шаг SGD равен −ηg.</li>
      <li>При η = 0.12 первый шаг переводит [−3; 1.5] в {vec(descent.tracks.sgd[1].params)}. Потеря снижается с {fmt(descent.tracks.sgd[0].loss)} до {fmt(descent.tracks.sgd[1].loss, 5)}.</li>
      <li>При η = 0.30 координата y каждый шаг умножается на −1.4: знак чередуется, модуль растёт. Для этой квадратичной функции SGD сходится при 0 &lt; η &lt; 0.25.</li>
      <li>SGD, momentum и Adam стартуют одинаково. Momentum хранит инерцию, Adam — оценки градиента и его квадрата. Этот один опыт не ранжирует методы для всех задач.</li>
    </ol>
    <table className="data-table"><caption>После {descent.steps} шагов, η = 0.12, μ = 0.9, β₁ = 0.9, β₂ = 0.999</caption><thead><tr><th scope="col">Метод</th><th scope="col">[x; y]</th><th scope="col">Потеря</th></tr></thead><tbody>
      {(['sgd', 'momentum', 'adam'] as const).map(kind => { const state = descent.tracks[kind].at(-1)!; return <tr key={kind}><th scope="row">{kind}</th><td>{vec(state.params)}</td><td>{fmt(state.loss, 6)}</td></tr> })}
    </tbody></table>
    <p>Применение переносит начальную точку и настройки, а не готовую траекторию. Выполните один шаг или запустите «Авто» вручную.</p>
  </LessonAnimation>
}

export function XorAnimation({ videoRef, example, onPlayback }: FilmProps) {
  return <LessonAnimation videoRef={videoRef} example={example} onPlayback={onPlayback} media="xor" title="Как скрытый слой разделяет XOR"
    label="Нелинейный скрытый слой и обучение сети XOR" target="xor-controls" jumpLabel="К своей сети XOR ↓"
    description={<>Фиксированная сеть 2 → 4 tanh → 1 sigmoid: seed {xor.config.seed}, Adam, η = {xor.config.lr}, {xor.config.steps} шагов по четырём точкам XOR. Все четыре точки обучающие; это не проверка обобщения.</>}
    chapters={coreChapters(['Точки XOR', 'Предскажите границу', 'Скрытый слой', 'До и после обучения', 'Проверьте сами'])}
    question={{ time: 14, question: 'Можно ли одной прямой разделить две диагональные пары XOR?', options: ['Нет', 'Да', 'Только при большом смещении'], correct: 0, explanation: 'Каждый класс занимает противоположные углы квадрата. Одна прямая не отделяет эти две пары; скрытый нелинейный слой меняет представление.' }}
    practice={{ question: 'Новый случай: для [1; 1] цель XOR = 0, сеть даёт p = 0.8. Как должен меняться logit, чтобы уменьшить BCE этого примера?', options: ['Уменьшаться', 'Увеличиваться', 'Не меняться'], correct: 0, explanation: 'Производная BCE по logit равна p − target = 0.8 > 0. Шаг против неё уменьшает logit. Это локальная чувствительность одного примера, не гарантия итога общего шага по всем весам.' }}>
    <ol className="lesson-animation-transcript">
      <li>XOR равен 1 при разных битах и 0 при одинаковых. Плоская карта имеет реальные оси входов x₁ и x₂; цвет показывает вероятность класса 1.</li>
      <li>Каждый скрытый нейрон вычисляет tanh(w₁x₁ + w₂x₂ + b). Четыре нелинейных признака поступают в выходной нейрон.</li>
      <li>Прямой проход даёт вероятность; BCE измеряет ошибку. Обратный проход вычисляет градиенты 17 параметров, Adam обновляет их.</li>
      <li>Средняя BCE меняется с {fmt(xor.initial.loss, 6)} до {fmt(xor.final.loss, 6)} после {xor.config.steps} шагов. Маленькая ошибка на обучающих точках не доказывает качество на новых данных.</li>
    </ol>
    <table className="data-table"><caption>Вероятность XOR = 1 до и после обучения</caption><thead><tr><th scope="col">Вход</th><th scope="col">Цель</th><th scope="col">До</th><th scope="col">После</th></tr></thead><tbody>
      {xor.data.map((row, index) => <tr key={index}><th scope="row">{vec(row.input)}</th><td>{row.target}</td><td>{fmt(xor.initial.predictions[index], 6)}</td><td>{fmt(xor.final.predictions[index], 6)}</td></tr>)}
    </tbody></table>
    <p>Применение начинает этот опыт с шага 0. Обучайте вручную; десять нажатий «100 шагов» воспроизводят итог ролика.</p>
  </LessonAnimation>
}

export function RopeAnimation({ videoRef, example }: FilmProps) {
  return <LessonAnimation videoRef={videoRef} example={example} media="rope" title="RoPE: поворот и расстояние"
    label="Повороты пар Q и K, общий сдвиг и относительное расстояние" target="rope-controls" jumpLabel="Повернуть свои Q и K ↓"
    description={<>Фиксированные Q = {vec(rope.q)}, K = {vec(rope.k)}; позиции 1 и 3. Показываем пару 0–1, но полный dot product считаем по четырём координатам. Положение на временной шкале не является embedding-координатой.</>}
    chapters={transformerChapters(['Пары координат', 'Две позиции', 'Предскажите сдвиг', 'Общий сдвиг', 'Новое расстояние', 'Проверьте сами'], rope.chapters)}
    question={{ time: rope.predictionAt, question: 'Обе позиции сдвинули на +2, исходные Q и K прежние. Изменится полный Q′·K′?', options: ['Сохранится', 'Удвоится', 'Обязательно уменьшится'], correct: 0, explanation: 'При фиксированных Q/K в произведении остаётся относительное расстояние. Общий поворот сохраняет длины и взаимные углы каждой пары.' }}
    practice={{ question: 'Новый случай: позиции 2 и 6 сдвигают обе на +5 при прежних исходных Q/K. Что станет с dot product RoPE?', options: ['Сохранится', 'Изменится в 5 раз', 'Зависит только от номера первой позиции'], correct: 0, explanation: 'Расстояние остаётся 4, поэтому произведение сохраняется с точностью округления. Это свойство вращения фиксированных векторов, не всей языковой модели при любых границах контекста.' }}>
    <ol className="lesson-animation-transcript">
      <li>RoPE вращает пары спроецированных Q/K: [x′; y′] = [x cos θ − y sin θ; x sin θ + y cos θ]. V здесь не вращается.</li>
      <li>Для четырёх координат углы пар равны p и p/100 радиан. Каждая пара сохраняет свою длину.</li>
      <li>Общий сдвиг 1/3 → 3/5 сохраняет расстояние 2 и полный dot product. Сдвиг только ключа до 7 меняет расстояние до 4 и даёт другое число.</li>
    </ol>
    <table className="data-table"><caption>Dot product считается по четырём координатам</caption><thead><tr><th scope="col">Условие</th><th scope="col">Позиции Q/K</th><th scope="col">Расстояние</th><th scope="col">Q′·K′</th></tr></thead><tbody>
      {[['До сдвига', rope.initial], ['Общий сдвиг +2', rope.shifted], ['Сдвиг ключа', rope.changed]].map(([name, value]) => { const state = value as typeof rope.initial; return <tr key={String(name)}><th scope="row">{String(name)}</th><td>{state.queryPosition} / {state.keyPosition}</td><td>{state.distance}</td><td>{fmt(state.dot, 6)}</td></tr> })}
    </tbody></table>
    <p>Произведение не обязано убывать с расстоянием: вращение периодично. Применение возвращает исходные Q/K, позиции 1/3 и первую пару.</p>
  </LessonAnimation>
}

export function HeadsAnimation({ videoRef, example }: FilmProps) {
  return <LessonAnimation videoRef={videoRef} example={example} media="heads" title="Четыре головы: собрать ответ"
    label="Четыре Q-головы, склейка выходов и общие группы K/V" target="heads-controls" jumpLabel="Разобрать свои головы ↓"
    description={<>Фиксированный вход 3 × 4, запрос последней позиции 2. Четыре головы ширины 2 дают 8 чисел; Wᴼ проецирует их в 4. Сравниваем MHA 4 KV → GQA 2 KV → MQA 1 KV.</>}
    chapters={transformerChapters(['Четыре ответа', 'Склейка', 'Проекция выхода', 'Общие K/V', 'Одна KV-группа', 'Проверьте сами'], heads.chapters)}
    question={{ time: heads.predictionAt, question: 'Четыре Q-головы переключили в GQA с двумя KV-группами. Сколько Q-голов осталось?', options: ['Четыре', 'Две', 'Одна'], correct: 0, explanation: 'GQA сокращает число K/V-групп, сохраняя четыре отдельных Q. Даже при общих K/V dot products и softmax разных Q могут различаться.' }}
    practice={{ question: 'Новый случай: восемь Q-голов используют две KV-группы GQA. Сколько Q-голов разделяют одну группу при равном распределении?', options: ['Четыре', 'Две', 'Одна'], correct: 0, explanation: '8 / 2 = 4 Q-головы на KV-группу. Запросы остаются отдельными и могут дать разные веса при общих ключах.' }}>
    <ol className="lesson-animation-transcript">
      <li>Каждая из четырёх Q-голов вычисляет собственные scores, softmax и смесь V для запроса 2. Сумма весов каждой головы равна 1.</li>
      <li>Четыре двухмерных выхода склеивают в один вектор длины 8. Матрица Wᴼ размера 8 × 4 возвращает ширину 4. Это проекция, не усреднение голов.</li>
      <li>GQA сохраняет четыре Q, но головы 0/1 используют первую K/V-группу, 2/3 — вторую. MQA использует одну K/V-группу для всех Q.</li>
    </ol>
    <table className="data-table"><caption>Фиксированный запрос 2: группы и итоговая проекция</caption><thead><tr><th scope="col">KV-групп</th><th scope="col">Группы Q₀…Q₃</th><th scope="col">Выход после Wᴼ</th></tr></thead><tbody>
      {heads.modes.map(mode => <tr key={mode.kvHeads}><th scope="row">{mode.kvHeads}</th><td>{vec(mode.groups)}</td><td>{vec(mode.output)}</td></tr>)}
    </tbody></table>
    <p>Здесь выбираются первые фиксированные KV-проекции. Это иллюстрация механизма, не преобразование обученного checkpoint и не сравнение качества. Применение выбирает MHA, голову 0 и исходную матрицу.</p>
  </LessonAnimation>
}

export function GenerationAnimation({ videoRef, example }: FilmProps) {
  const before = generation.steps[generation.initialLength - 1], after = generation.steps[generation.nextLength - 1]
  return <LessonAnimation videoRef={videoRef} example={example} media="generation" title="Генерация: сохранить K и V"
    label="Добавление позиции и совпадение KV-cache с полным causal attention" target="cache-controls" jumpLabel="Проверить свой KV-cache ↓"
    description={<>Фиксированный причинный attention, одна голова, RoPE включён: префикс из 3 заданных векторов растёт до 4. Это шаг attention с кэшем; выбор языкового токена разбирается отдельно в главе «Генерация».</>}
    chapters={transformerChapters(['Обработанный префикс', 'Сохранённые K/V', 'Предскажите ответ', 'Дописать новую строку', 'Сравнить с полным', 'Проверьте сами'], generation.chapters)}
    question={{ time: generation.predictionAt, question: 'Добавили позицию 3 при прежних весах и префиксе. Что делать со старыми K/V?', options: ['Сохранить и дописать новую строку', 'Пересчитать все старые строки', 'Удалить первую строку'], correct: 0, explanation: 'Старые K/V не зависят от будущего при causal attention. Сохраняем их и дописываем новые; ответ совпадает с полным causal-расчётом с возможной погрешностью округления.' }}
    practice={{ question: 'Новый случай: после сохранения кэша изменили старый токен в середине префикса. Можно ли просто дописать следующий K/V?', options: ['Нет: зависимый кэш надо пересчитать', 'Да: кэш всегда пригоден', 'Достаточно поменять температуру sampling'], correct: 0, explanation: 'Изменился уже обработанный префикс. Зависящие от него состояния больше не соответствуют сохранённому кэшу; обычный append рассчитан на неизменное прошлое.' }}>
    <ol className="lesson-animation-transcript">
      <li>Проекции прежних трёх позиций уже сохранены. Новый Q читает все доступные ключи; кэш не отменяет само внимание к прошлому.</li>
      <li>Для позиции 3 вычисляются только её новые K/V, причём RoPE использует реальную позицию 3. Старые ключи уже повёрнуты по своим позициям.</li>
      <li>Полный causal-расчёт проецирует весь префикс заново. Ответ новой позиции совпадает с cached-расчётом. Пары K/V для проекции на этом шаге: 1 с кэшем против 4 без кэша.</li>
    </ol>
    <table className="data-table"><caption>Численный ответ последней позиции</caption><thead><tr><th scope="col">Префикс</th><th scope="col">Cached</th><th scope="col">Full causal</th><th scope="col">Макс. разница</th></tr></thead><tbody>
      {[before, after].map(state => <tr key={state.position}><th scope="row">{state.position + 1} позиции</th><td>{vec(state.output)}</td><td>{vec(state.fullOutput)}</td><td>{fmt(state.maxError, 10)}</td></tr>)}
    </tbody></table>
    <p>Счётчик K/V — число пар строк для проекции, не миллисекунды и не все операции модели. Применение выбирает префикс 3, кэш и RoPE; сам браузер вычисляет оба пути для сравнения.</p>
  </LessonAnimation>
}
