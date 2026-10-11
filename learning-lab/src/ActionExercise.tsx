import { useId, useRef, useState } from 'react'
import type { ActionCheck } from './actionExerciseMath'
import './action-exercise.css'

export function ActionExercise({ title, goal, startingConditions, hint, onStart, check, stateKey }: {
  title: string; goal: string; startingConditions: string; hint: string;
  onStart: () => void; check: () => ActionCheck; stateKey: string;
}) {
  const id = useId()
  const startButton = useRef<HTMLButtonElement>(null)
  const [active, setActive] = useState(false)
  const [checked, setChecked] = useState<{ stateKey: string; result: ActionCheck } | null>(null)
  const current = checked?.stateKey === stateKey ? checked.result : null
  return <section className="action-exercise" aria-labelledby={`${id}-title`}>
    <span className="eyebrow">Практика с проверкой действий</span>
    <h3 id={`${id}-title`}>{title}</h3>
    <p>{goal}</p>
    <p className="note">Кнопка «Начать задание» изменит параметры: {startingConditions} Затем работайте с обычными ползунками или точными значениями урока.</p>
    <div className="button-row">
      <button ref={startButton} type="button" onClick={() => { onStart(); setActive(true); setChecked(null) }}>{active ? 'Начать заново' : 'Начать задание'}</button>
      {active && <>
        <button type="button" onClick={() => setChecked({ stateKey, result: check() })}>Проверить действия</button>
        <button type="button" onClick={() => { setActive(false); setChecked(null); startButton.current?.focus() }}>Завершить практику</button>
      </>}
    </div>
    <p className={current ? (current.passed ? 'feedback-correct' : 'feedback-retry') : 'note'} role="status" aria-live="polite" aria-atomic="true">
      {active ? current ? `${current.passed ? 'Выполнено. ' : 'Пока не выполнено. '}${current.feedback}` : checked ? 'Параметры изменились. Проверьте действия ещё раз.' : 'Задание начато. Измените параметры и проверьте результат.' : 'Практика не запущена. Можно свободно менять параметры урока.'}
    </p>
    <details><summary>Подсказка к действию</summary><p>{hint}</p></details>
    {active && <p className="note">«Завершить практику» оставит текущие значения для свободного эксперимента. Для проверки должны сохраняться указанные фиксированные параметры.</p>}
  </section>
}
