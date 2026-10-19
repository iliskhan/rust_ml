import { useId, useState } from 'react';
import type { BoundaryExperiment } from './boundaryExperiment';
import { boundaryInputSize } from './boundaryNetworkMath';
import { boundaryEvaluationId } from './boundaryEvaluation';
import { fmt, Range } from './ui';

const kinds = { circles: 'Круги', moons: 'Полумесяцы', spiral: 'Спираль' };

export function BoundaryFinalEvaluation({ experiment, threshold, receipts, busy, storageReliable, error, onFreeze, onReveal }: {
  experiment: BoundaryExperiment; threshold: number; receipts: string[]; busy: boolean; storageReliable: boolean;
  error: string;
  onFreeze: (criterion: string, seed: number) => void; onReveal: () => void;
}) {
  const id = useId();
  const [criterion, setCriterion] = useState('');
  const [testSeed, setTestSeed] = useState(experiment.finalResult?.testSeed ?? 314159);
  const result = experiment.finalResult;
  const seen = receipts.includes(boundaryEvaluationId(experiment.settings.kind, testSeed));
  const different = !!result && (result.model.step !== experiment.optimizer.step || result.model.threshold !== threshold
    || JSON.stringify(result.model.params) !== JSON.stringify(experiment.optimizer.params)
    || JSON.stringify(result.model.settings) !== JSON.stringify(experiment.settings));
  return <section className="boundary-final" id="boundary-final-evaluation" tabIndex={-1} aria-labelledby={`${id}-title`}>
    <span className="eyebrow">После выбора настроек</span>
    <h4 id={`${id}-title`}>Итоговая проверка на новых данных</h4>
    <p>Выберите модель по validation, остановите обучение и запишите основание выбора. Сначала зафиксируйте веса и порог, затем откройте отдельные 32 чистые точки из того же распределения.</p>
    <label htmlFor={`${id}-criterion`}>Почему выбрана эта модель?</label>
    <textarea id={`${id}-criterion`} value={criterion} maxLength={500} rows={2} onChange={event => setCriterion(event.target.value)} placeholder="Например: validation BCE перестала снижаться; выбран меньший из сравнимых вариантов." />
    <details><summary>Какой итоговый набор использовать?</summary>
      <Range label="Seed итогового набора" value={testSeed} min={0} max={4294967295} step={1} onChange={setTestSeed} />
      <p className="note">Этот seed задаёт отдельный поток данных. Смена seed создаёт другую выборку и не отменяет увиденные результаты. Перебирать итоговые наборы до удачного ответа — тоже подбор.</p>
    </details>
    <p className="note">{seen ? 'Этот набор уже раскрывался в сохранённой истории. Повторная оценка использует знакомые данные.' : 'В доступной локальной истории этот набор ещё не раскрывался.'} Сохранено фактов раскрытия: {receipts.length}.</p>
    {!storageReliable && <p className="boundary-error" role="status">История раскрытий сейчас не сохраняется надёжно. Оценка доступна, но её новизна после перезагрузки не подтверждена.</p>}
    <button disabled={busy || !criterion.trim()} onClick={() => onFreeze(criterion.trim(), testSeed)}>Зафиксировать выбранную модель</button>
    {error && <p className="boundary-error" role="alert">{error}</p>}
    {busy && <p className="note">Сначала нажмите «Пауза».</p>}
    {result && <div className="boundary-final-snapshot">
      <h5>Зафиксированная модель · шаг {result.model.step}</h5>
      <p>{kinds[result.model.settings.kind]} · сеть {[boundaryInputSize(result.model.settings.config), ...result.model.settings.config.layers.map(layer => layer.width), 1].join(' → ')} · порог {fmt(result.model.threshold, 2)} · test seed {result.testSeed}.</p>
      <p>Основание: {result.model.criterion}</p>
      {different && <p className="note">Текущий опыт уже изменён. Эта проверка относится к сохранённым весам и условиям снимка.</p>}
      {result.reused && <p className="note">Этот набор уже раскрывался. Повторная оценка использует знакомые данные.</p>}
      {!result.revealed ? <><p>Ответы итогового набора ещё не открыты для этого снимка. Они не участвуют в обучении, картах и кривых выше.</p><button disabled={busy} onClick={onReveal}>Открыть итоговый результат</button></>
        : result.metrics && <div className="boundary-final-result" role="status">
          <strong>{result.metrics.correct} / {result.metrics.total} верно · {fmt(result.metrics.accuracy * 100, 1)}%</strong>
          <p>BCE итоговой выборки: <strong>{fmt(result.metrics.loss, 6)}</strong></p>
          <p>Результат открыт. Если он повлияет на следующие настройки, этот набор становится материалом для подбора. Повторное открытие и перезагрузка не делают его новым.</p>
        </div>}
    </div>}
    <p className="note">Это учебная оценка маленькой модели. Она не подтверждает качество на реальных данных или знания ученика. Локальный JSON доступен для просмотра и редактирования; секретного экзамена здесь нет.</p>
  </section>;
}
