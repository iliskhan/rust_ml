import { useId, useState } from 'react';
import './prediction-experiment.css';

export type PredictionResult = { correct: boolean; before: string; after: string; explanation: string };

export function PredictionExperiment({ question, options, run, disabled = false, headingLevel = 4 }: {
  question: string; options: string[]; run: (prediction: number) => PredictionResult; disabled?: boolean; headingLevel?: 3 | 4;
}) {
  const id = useId();
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const [choice, setChoice] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<(PredictionResult & { question: string; options: string[] }) | null>(null);
  return <section className="prediction-experiment" aria-labelledby={`${id}-title`}>
    <Heading id={`${id}-title`}>Предскажи → измени → сравни</Heading>
    <fieldset disabled={result !== null || disabled}><legend>{result?.question ?? question}</legend>
      {(result?.options ?? options).map((option, index) => <label key={option}>
        <input type="radio" name={id} checked={choice === index} onChange={() => setChoice(index)} />{option}
      </label>)}
    </fieldset>
    <div className="button-row">
      <button type="button" disabled={choice === null || result !== null || disabled} onClick={() => {
        if (choice === null || disabled) return;
        try { setResult({ ...run(choice), question, options: [...options] }); setError(''); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось выполнить опыт. Попробуйте ещё раз.'); }
      }}>Проверить на опыте</button>
      {result && <button type="button" onClick={() => { setChoice(null); setResult(null); }}>Новый прогноз</button>}
    </div>
    {error && <p role="alert">Опыт не завершён: {error} Прогноз не оценён.</p>}
    <div role="status" aria-live="polite" aria-atomic="true">
      {result ? <>
        <p className={result.correct ? 'feedback-correct' : 'feedback-retry'}>{result.correct ? 'Прогноз подтвердился.' : 'Результат отличается от прогноза.'} {result.explanation}</p>
        <dl><dt>До действия</dt><dd>{result.before}</dd><dt>После действия</dt><dd>{result.after}</dd></dl>
        <p className="note">Это снимок проведённого опыта. Последующие изменения ползунков его не меняют.</p>
      </> : <p className="note">Выберите прогноз. Кнопка выполнит описанное действие и сохранит сравнение чисел.</p>}
    </div>
  </section>;
}
