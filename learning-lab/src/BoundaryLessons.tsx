import { useEffect, useId, useRef, useState } from 'react';
import type { BoundarySettings } from './boundaryExperiment';
import { predictBoundary } from './boundaryNetworkMath';
import { useLearning } from './learning-context';
import { focusLessonSection } from './LessonOutline';
import { fmt } from './ui';
import { checkThresholdLesson, hiddenComparisonMismatches, hiddenLessonMismatches, lessonEvidence, thresholdLessonQuestion, thresholdObservationMismatches, type BoundaryLessonAttempt, type BoundaryLessonForm, type BoundaryLessonMode, type LessonObservation } from './boundaryLessonMath';
import { BoundaryLessonStore, currentLessonAttempt, newThresholdAttempt, retainLessonDisclosure, type BoundaryLessonRecord } from './boundaryLessonStorage';
import './boundary-lessons.css';

export type BoundaryLessonsProps = {
  settings: BoundarySettings; step: number; threshold: number; probe: [number, number]; params: number[];
  metrics?: { train: { loss: number }; validation: { loss: number } };
  scope?: string; busy?: boolean; controlsId?: string;
};

export function BoundaryLessons(props: BoundaryLessonsProps) {
  return <BoundaryLessonsSession key={props.scope ?? 'guest'} {...props} />;
}

function ControlJump({ targetId, children }: { targetId: string; children: React.ReactNode }) {
  return <button type="button" className="concept-link" onClick={() => {
    const target = document.getElementById(targetId);
    let ancestor: HTMLElement | null = target;
    while (ancestor) { if (ancestor instanceof HTMLDetailsElement) ancestor.open = true; ancestor = ancestor.parentElement; }
    if (targetId === 'boundary-lesson-diagnostics') { const details = target?.querySelector('details'); if (details) details.open = true; }
    if (target) target.tabIndex = -1;
    focusLessonSection(targetId);
  }}>{children}</button>;
}

function BoundaryLessonsSession({ settings, step, threshold, probe, params, metrics, scope = 'guest', busy = false, controlsId = 'boundary-lesson-settings' }: BoundaryLessonsProps) {
  const id = useId();
  const learning = useLearning();
  const [store] = useState(() => new BoundaryLessonStore({ getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }, scope));
  const [record, setRecord] = useState(store.record);
  const [error, setError] = useState(store.error);
  const [saving, setSaving] = useState(0);
  const [notice, setNotice] = useState('');
  const disclosurePending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    function changed(event: StorageEvent) {
      if (event.key === store.key || event.key === null) { store.observeExternalChange(event.newValue); setError(store.error); }
    }
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [store]);
  function save(next: BoundaryLessonRecord, optimistic = true): Promise<boolean> {
    setSaving(count => count + 1);
    const pending = store.save(next).then(saved => {
      if (!mounted.current) return false;
      setError(store.error); setSaving(count => count - 1);
      if (saved) setRecord(current => retainLessonDisclosure(current, store.confirmed));
      return saved;
    });
    if (optimistic) setRecord({ ...next });
    setError(store.error);
    return pending;
  }
  function edit(form: BoundaryLessonForm, change: Partial<BoundaryLessonAttempt>) {
    const attempt = currentLessonAttempt(record, form);
    save({ ...record, attempts: record.attempts.map(a => a.instanceId === attempt.instanceId ? { ...a, ...change } : a) });
  }
  const mode = record.mode, form = mode === 'free' ? 'hidden' : mode;
  const attempt = currentLessonAttempt(record, form);
  function observation(name: string): LessonObservation {
    return { name, settings: structuredClone(settings), step, threshold, probe: [...probe], params: [...params],
      probability: predictBoundary(params, settings.config, probe), trainLoss: metrics?.train.loss ?? null, validationLoss: metrics?.validation.loss ?? null };
  }
  function capture(name: string) {
    const next = observation(name);
    edit(form, { observations: [...attempt.observations.filter(s => s.name !== name), next] });
    setNotice(`Снимок «${name}» сохранён отдельно от модели.`);
  }
  async function disclose(kind: 'help' | 'exposed', trigger?: HTMLButtonElement) {
    if (disclosurePending.current || saving > 0) return;
    disclosurePending.current = true;
    try {
      const next = { ...record, attempts: record.attempts.map(a => a.instanceId === attempt.instanceId ? { ...a, [kind]: true } : a) };
      const saved = await save(next, false);
      if (!saved) { if (mounted.current) setNotice('Разбор не открыт: сначала нужно надёжно сохранить факт помощи или раскрытия. Причина указана выше. Черновик остаётся доступен.'); return; }
      if (kind === 'help' && trigger) learning.openConcept(form === 'hidden' ? 'backpropagation' : 'cross-entropy', trigger);
    } finally { disclosurePending.current = false; }
  }
  const question = thresholdLessonQuestion(attempt.index);
  const a = attempt.observations.find(s => s.name === 'A: линейная'), b = attempt.observations.find(s => s.name === 'B: 8 tanh');
  const mismatch = hiddenLessonMismatches(settings);
  const comparisonMismatch = a && b ? hiddenComparisonMismatches(a, b) : [];
  const before = attempt.observations.find(s => s.name === 'До действия');
  function answer(index: number, value: string) {
    const answers = Array.from({ length: form === 'threshold' ? 8 : 2 }, (_, i) => attempt.answers[i] ?? '');
    answers[index] = value; edit(form, { answers, checked: null });
  }
  function check() {
    const correct = form === 'threshold' ? checkThresholdLesson(attempt.index, attempt.answers) : attempt.answers[0] === 'impossible' && attempt.answers[1] === 'features';
    edit(form, { checked: correct });
    setNotice(correct ? 'Объективные ответы совпали с правилом. Объяснение сохранено без автоматической оценки.' : 'Есть расхождение. Сверьте правило и попробуйте снова; черновик сохранён.');
  }
  return <section className="boundary-lessons" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>Короткий опыт без кода</h4>
    <label>Режим лаборатории<select value={mode} onChange={e => { save({ ...record, mode: e.target.value as BoundaryLessonMode }); setNotice(''); }}>
      <option value="free">Свободный опыт</option><option value="hidden">Зачем скрытый слой?</option><option value="threshold">Порог и обучение</option>
    </select></label>
    <p className="note">Выбор вопроса сохраняет текущую сеть. Настройки и шаги выполняются существующими контролами ниже.</p>
    {error ? <p role="alert" className="boundary-lesson-error">Учебный черновик доступен только в памяти страницы: {error} История самостоятельности не подтверждена. Модель и её JSON сохраняются отдельно.</p>
      : <p className="note">{saving ? 'Сохранение учебного черновика…' : 'Черновик и история помощи хранятся локально в этом браузере'} · {scope === 'guest' ? 'гостевой профиль' : 'отдельный профиль аккаунта'}. В облако не отправляются. Очистка браузера удаляет эту историю.</p>}
    {mode !== 'free' && <>
      <p className="boundary-lesson-goal"><strong>Цель:</strong> {form === 'hidden' ? 'связать форму границы с преобразованием входов, отличая возможность сети от успеха обучения.' : 'отличить решение по порогу, вычисление ответа и обучение параметров.'}</p>
      {form === 'hidden' ? <>
        <p>Линейный логит складывает взвешенные входы. Скрытый слой сначала преобразует их; выход строит границу в этих новых признаках.</p>
        <p><strong>Образец:</strong> круги, 96 train, исходные метки, два входа, Adam 0,02, batch 96, λ = 0; сначала 0 скрытых слоёв, затем один слой 8 tanh. Для обоих ровно 700 обновлений (700 эпох). Сохраните одинаковые seed данных, инициализации и batch. Число начальных весов у архитектур разное.</p>
        <p className="note">Сохраните текущую работу в A/B или JSON перед изменением настроек. Открытие вопроса её не сохраняет в слот и не сбрасывает.</p>
        <p role="status">{mismatch.length ? `Условия образца расходятся: ${mismatch.join('; ')}.` : 'Текущие настройки подходят одной из двух частей образца.'} Текущий бюджет: {step} / 700 обновлений.</p>
        <label>Прогноз до обучения: какую границу допускает каждая сеть?<textarea value={attempt.prediction} maxLength={20000} disabled={attempt.predictionBeforeAction} onChange={e => edit(form, { prediction: e.target.value })} /></label>
        <button disabled={busy || step !== 0 || !attempt.prediction.trim() || attempt.predictionBeforeAction} onClick={() => { edit(form, { predictionBeforeAction: true }); setNotice('Прогноз зафиксирован на шаге 0. Теперь выполните два запуска вручную.'); }}>Зафиксировать прогноз на шаге 0</button>
        {!attempt.predictionBeforeAction && step !== 0 && <p className="note">Для прогноза до действия сохраните свою сеть, выставьте условия и явно сбросьте обучение к шагу 0.</p>}
        <ol>
          <li>Откройте <ControlJump targetId={controlsId}>«Данные и сеть»</ControlJump>, выберите 0 скрытых слоёв. Зафиксируйте прогноз до запуска.</li>
          <li>Семь раз выполните <ControlJump targetId="boundary-lesson-training">«100 шагов»</ControlJump>. На шаге 700 сохраните сеть в A и снимок чисел здесь.</li>
          <li>Вручную выберите один слой 8 tanh с теми же seed. Повторите 700 обновлений, сохраните в B и снимок здесь. Сравните карту и скрытое представление одной <ControlJump targetId="boundary-lesson-probe">пробы</ControlJump>.</li>
        </ol>
        <div className="button-row"><button disabled={busy || !attempt.predictionBeforeAction || step !== 700 || !!mismatch.length || settings.config.layers.length !== 0} onClick={() => capture('A: линейная')}>Снять A: линейная, шаг 700</button><button disabled={busy || !attempt.predictionBeforeAction || step !== 700 || !!mismatch.length || settings.config.layers.length !== 1} onClick={() => capture('B: 8 tanh')}>Снять B: 8 tanh, шаг 700</button></div>
        {a && b && <p role="status">{comparisonMismatch.length ? `Сравнение требует поправки: ${comparisonMismatch.join('; ')}.` : 'Данные, seed и бюджеты сравнения совпадают. Смотрите фактические BCE ниже: сходимость конкретного запуска не гарантирована.'}</p>}
      </> : <>
        <p>Вероятность p получается из входа и весов; решение — класс 1, если p ≥ τ, иначе 0. BCE использует вероятность и истинную цель. Чтобы изменить веса, нужен шаг обучения.</p>
        <label>Прогноз: что изменится при смене порога, входа и после шага обучения?<textarea maxLength={20000} value={attempt.prediction} disabled={attempt.predictionBeforeAction} onChange={e => edit(form, { prediction: e.target.value })} /></label>
        <button disabled={busy || !attempt.prediction.trim() || attempt.predictionBeforeAction} onClick={() => { edit(form, { predictionBeforeAction: true, observations: [observation('До действия')] }); setNotice('Прогноз и исходные числа зафиксированы. Выполняйте по одному действию.'); }}>Зафиксировать прогноз и числа до действия</button>
        <ol>
          <li>Остановите обучение. В <ControlJump targetId="boundary-lesson-diagnostics">«Порог → ошибки»</ControlJump> измените τ. Снимите результат без изменения весов и пробы.</li>
          <li>Измените только <ControlJump targetId="boundary-lesson-probe">вход пробы</ControlJump>. Снимите результат: ответ пробы может измениться, BCE всей выборки при тех же весах прежняя.</li>
          <li>Нажмите <ControlJump targetId="boundary-lesson-training">«1 шаг»</ControlJump>, снимите числа. Шаг может изменить параметры; не обязан менять каждую вероятность или каждый вес.</li>
        </ol>
        <div className="button-row">{['После порога', 'После входа', 'После обучения'].map((name, i) => <button key={name} disabled={busy || !before || (i > 0 && !attempt.observations.some(s => s.name === ['После порога', 'После входа'][i - 1]))} onClick={() => capture(name)}>Снять: {name.toLowerCase()}</button>)}</div>
        {before && attempt.observations.filter(s => s !== before).map(s => {
          const previousName = s.name === 'После порога' ? 'До действия' : s.name === 'После входа' ? 'После порога' : 'После входа';
          const previous = attempt.observations.find(o => o.name === previousName);
          const reasons = previous ? thresholdObservationMismatches(previous, s, s.name === 'После порога' ? 'threshold' : s.name === 'После входа' ? 'input' : 'training') : ['предыдущий снимок отсутствует'];
          return <p className="note" key={s.name}>{s.name}: параметры относительно исходных {JSON.stringify(s.params) === JSON.stringify(before.params) ? 'те же' : 'отличаются'}, шаг {s.step}; вход {s.probe.join(', ')}, τ = {fmt(s.threshold, 2)}. {reasons.length ? `Условия отдельного действия расходятся: ${reasons.join('; ')}. Исправьте условия и обновите снимок.` : 'Изменено только заданное действие.'}</p>;
        })}
      </>}
      {!!attempt.observations.length && <div className="boundary-lesson-table" role="region" tabIndex={0} aria-label="Снимки опыта"><table><caption>Снимки чисел; последующие действия их не пересчитывают</caption><thead><tr><th scope="col">Снимок</th><th scope="col">Шаг</th><th scope="col">p пробы</th><th scope="col">Решение</th><th scope="col">BCE train</th><th scope="col">BCE validation</th></tr></thead><tbody>{attempt.observations.map(s => <tr key={s.name}><th scope="row">{s.name}</th><td>{s.step}</td><td>{fmt(s.probability, 5)}</td><td>{Number(s.probability >= s.threshold)} (τ {fmt(s.threshold, 2)})</td><td>{s.trainLoss === null ? 'нет числа' : fmt(s.trainLoss, 5)}</td><td>{s.validationLoss === null ? 'нет числа' : fmt(s.validationLoss, 5)}</td></tr>)}</tbody></table></div>}
      <label>Объясните наблюдение своими словами<textarea maxLength={20000} value={attempt.explanation} onChange={e => edit(form, { explanation: e.target.value })} /></label>
      <p className="note">Этот текст — ваш черновик. Автоматической оценки объяснения нет.</p>
      <div className="boundary-lesson-help"><button type="button" className="concept-link" aria-haspopup="dialog" disabled={saving > 0} onClick={event => { void disclose('help', event.currentTarget); }}>Открыть содержательную помощь и вернуться к опыту</button></div>
      <fieldset><legend>{form === 'hidden' ? 'Другой рисунок: проверить ограничение модели' : `Новый численный случай · ${attempt.instanceId}`}</legend>
        {form === 'hidden' ? <>
          <p>Центр квадрата должен иметь класс 1, все четыре угла — класс 0. Возможно ли точно разделить эти пять точек одной прямой? Это другой рисунок, без повторного обучения на кругах.</p>
          <label>Одна прямая<select value={attempt.answers[0] ?? ''} onChange={e => answer(0, e.target.value)}><option value="">Выберите ответ</option><option value="possible">Возможно при достаточно долгом обучении</option><option value="impossible">Невозможно: прямая не отделит центр от всех четырёх углов</option><option value="threshold">Достаточно изменить порог линейного выхода</option></select></label>
          <label>Исправьте причинную схему скрытого слоя<select value={attempt.answers[1] ?? ''} onChange={e => answer(1, e.target.value)}><option value="">Выберите ответ</option><option value="features">Вход → нелинейные признаки → линейный логит → вероятность</option><option value="threshold">Вход → новый порог → новые обученные веса</option><option value="guarantee">Скрытый слой → гарантированное решение за 700 шагов</option></select></label>
        </> : <>
          <p>У отдельной фиксированной модели три вероятности: {question.probabilities.map(p => fmt(p, 5)).join('; ')}. Вычислите решения при двух порогах; равенство относится к классу 1. Это другие числа, не текущая проба.</p>
          <div className="boundary-lesson-answers">{question.thresholds.flatMap((t, ti) => question.probabilities.map((p, pi) => <label key={`${ti}-${pi}`}>p = {fmt(p, 5)}, τ = {fmt(t, 2)}<select value={attempt.answers[ti * 3 + pi] ?? ''} onChange={e => answer(ti * 3 + pi, e.target.value)}><option value="">Класс?</option><option value="0">0</option><option value="1">1</option></select></label>))}</div>
          <label>BCE всей той же выборки после смены только порога<select value={attempt.answers[6] ?? ''} onChange={e => answer(6, e.target.value)}><option value="">Выберите ответ</option><option value="same">Не меняется</option><option value="less">Обязательно уменьшается</option><option value="greater">Обязательно растёт</option></select></label>
          <label>Какое действие может обновить параметры?<select value={attempt.answers[7] ?? ''} onChange={e => answer(7, e.target.value)}><option value="">Выберите ответ</option><option value="threshold">Смена порога</option><option value="input">Смена входа пробы</option><option value="training">Шаг обучения по градиенту</option></select></label>
        </>}
        <div className="button-row"><button disabled={attempt.answers.filter(Boolean).length !== (form === 'hidden' ? 2 : 8)} onClick={check}>Проверить объективные ответы</button><button disabled={saving > 0} onClick={() => { void disclose('exposed'); }}>Показать разбор ответа</button></div>
        {attempt.checked !== null && <p role="status">{attempt.checked ? 'Объективные ответы верны.' : 'Есть расхождение с правилом.'} Объяснение автоматически не оценено.</p>}
        {attempt.exposed && <p>{form === 'hidden' ? 'Центр — среднее четырёх углов. Линейный логит в центре равен среднему логитов углов: если все углы ниже порога, центр тоже ниже. Нелинейные признаки могут изменить это ограничение; успешное обучение всё ещё нужно проверить.' : `По порядку полей классы: ${question.answers.slice(0, 3).join(', ')} при τ = 0,35; ${question.answers.slice(3).join(', ')} при τ = 0,65. Порог не входит в BCE. Вход меняет вычисленный ответ, градиентный шаг может изменить параметры.`}</p>}
      </fieldset>
      <p className="note">{lessonEvidence(attempt, store.verified && saving === 0)}</p>
      {form === 'threshold' && <><button disabled={saving > 0} onClick={() => { try { save(newThresholdAttempt(record)); setNotice('Создан другой список вероятностей с новым ID. Ранее раскрытые ответы остались в истории.'); } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Новый экземпляр недоступен.'); } }}>Другой численный случай</button><p className="note">Другое задание создаёт новый ID и другие числа. Это не подтверждение переноса знания. Перезагрузка и повторное открытие сохраняют текущий ID.</p></>}
      <details><summary>История учебных экземпляров ({record.attempts.filter(a => a.form === form).length})</summary>{record.attempts.filter(a => a.form === form).map(a => <p key={a.instanceId}>{a.instanceId}: {a.exposed ? 'ответ раскрыт' : a.help ? 'с помощью' : a.checked === true ? 'объективные ответы верны' : 'черновик'}; {a.explanation ? 'объяснение сохранено без оценки' : 'объяснения нет'}.</p>)}</details>
    </>}
    <p role="status" className="note">{notice}</p>
  </section>;
}
