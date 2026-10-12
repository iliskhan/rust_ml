import { useId, useState } from 'react';
import './prediction-experiment.css';

export type PredictionResult = { correct: boolean; before: string; after: string; explanation: string };

export function PredictionExperiment({ question, options, run, disabled = false }: {
  question: string; options: string[]; run: (prediction: number) => PredictionResult; disabled?: boolean;
}) {
  const id = useId();
  const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<(PredictionResult & { question: string; options: string[] }) | null>(null);
  return <section className="prediction-experiment" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>Предскажи → измени → сравни</h4>
    <fieldset disabled={result !== null || disabled}><legend>{result?.question ?? question}</legend>
      {(result?.options ?? options).map((option, index) => <label key={option}>
        <input type="radio" name={id} checked={choice === index} onChange={() => setChoice(index)} />{option}
      </label>)}
    </fieldset>
    <div className="button-row">
      <button type="button" disabled={choice === null || result !== null || disabled} onClick={() => { if (choice !== null && !disabled) setResult({ ...run(choice), question, options: [...options] }); }}>Проверить на опыте</button>
      {result && <button type="button" onClick={() => { setChoice(null); setResult(null); }}>Новый прогноз</button>}
    </div>
    <div role="status" aria-live="polite" aria-atomic="true">
      {result ? <>
        <p className={result.correct ? 'feedback-correct' : 'feedback-retry'}>{result.correct ? 'Прогноз подтвердился.' : 'Результат отличается от прогноза.'} {result.explanation}</p>
        <dl><dt>До действия</dt><dd>{result.before}</dd><dt>После действия</dt><dd>{result.after}</dd></dl>
        <p className="note">Это снимок проведённого опыта. Последующие изменения ползунков его не меняют.</p>
      </> : <p className="note">Выберите прогноз. Кнопка выполнит описанное действие и сохранит сравнение чисел.</p>}
    </div>
  </section>;
}
