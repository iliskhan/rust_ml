import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { boundaryBatchIndices, boundaryBatchProgress, boundaryL2, boundaryMetrics, boundaryParameterCount, predictBoundary, type BoundaryConfig, type BoundaryKind } from './boundaryNetworkMath';
import { advanceBoundaryExperiment as advance, boundaryFileLimit, boundaryStepLimit as stepLimit, boundaryStepsToEpoch, boundaryTrainingSettings, createBoundaryExperiment as createExperiment, decodeBoundaryWorkspace, encodeBoundaryWorkspace, initialBoundarySettings as initialSettings, readBoundaryStorage, restoreBoundaryRun, saveBoundaryRun, writeBoundaryStorage, type BoundarySettings as Settings, type BoundarySlots, type SavedBoundaryRun } from './boundaryExperiment';
import { BoundaryComparison } from './BoundaryComparison';
import { probabilityGrid } from './decisionBoundaryMath';
import { HiddenRepresentations } from './HiddenRepresentations';
import { ConceptLink, LearningActivity, useLearningActive } from './learning-context';
import { type Activation, type OptimizerKind } from './math';
import { Scene3D, type SceneLine, type Vec3 } from './ThreeD';
import { Chart, fmt, Range } from './ui';
import './boundary-playground.css';

const kinds: Record<BoundaryKind, string> = { circles: 'Круги', moons: 'Полумесяцы', spiral: 'Спираль' };
const segments = 32;
const targetColors = ['#27669a', '#26724b'];
const regionColors = ['#e0ecf4', '#c6dfd0'];
const boundaryColor = '#8c411d', probeColor = '#694799';

function readInitialWorkspace() {
  try { return { saved: readBoundaryStorage(window.localStorage), error: null }; }
  catch (error) { return { saved: null, error: error instanceof Error ? error.message : 'Хранилище браузера недоступно.' }; }
}

export function BoundaryPlayground() {
  const id = useId(), active = useLearningActive();
  const [initial] = useState(readInitialWorkspace);
  const [experiment, setExperiment] = useState(() => initial.saved ? restoreBoundaryRun(initial.saved.current) : createExperiment(initialSettings));
  const [threshold, setThreshold] = useState(initial.saved?.current.threshold ?? .5);
  const [probe, setProbe] = useState<[number, number]>(initial.saved?.current.probe ?? [.5, .5]);
  const [slots, setSlots] = useState<BoundarySlots>(initial.saved?.slots ?? { A: null, B: null });
  const [saveEnabled, setSaveEnabled] = useState(!initial.error);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [storageError, setStorageError] = useState(initial.error);
  const [storageStatus, setStorageStatus] = useState(initial.error ? 'Опыт открыт без восстановления. Автосохранение остановлено; прежняя локальная запись не изменена.' : 'Сохранение ещё не выполнено.');
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileStatus, setFileStatus] = useState(initial.saved ? 'Локальный опыт и A/B восстановлены. Обучение на паузе.' : '');
  const [importing, setImporting] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const [probabilityColors, setProbabilityColors] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false), [sceneVisited, setSceneVisited] = useState(false);
  const [projection, setProjection] = useState(true);
  const [targetEpochs, setTargetEpochs] = useState(10);
  const map = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const { settings, dataset, optimizer, history, error } = experiment;
  const { config } = settings;
  const training = boundaryTrainingSettings(settings);
  const budget = boundaryBatchProgress(optimizer.step, training.batchSize);
  const stepsToTarget = boundaryStepsToEpoch(experiment, targetEpochs);
  const nextBatch = boundaryBatchIndices(optimizer.step, training.batchSize, training.batchSeed);
  const busy = experiment.auto || experiment.remaining > 0;
  const atLimit = optimizer.step >= stepLimit;

  useEffect(() => {
    if (!saveEnabled) return;
    try {
      writeBoundaryStorage(window.localStorage, saveBoundaryRun(experiment, threshold, probe), slots);
      setStorageError(null);
      setStorageStatus('Текущий опыт и A/B сохранены в этом браузере. После перезагрузки обучение будет на паузе.');
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'Хранилище браузера недоступно.');
      setStorageStatus('Текущие изменения не сохранены локально. Экспорт JSON доступен.');
      setSaveEnabled(false);
    }
  }, [experiment, threshold, probe, slots, saveEnabled, saveAttempt]);

  useEffect(() => {
    if (!active) setExperiment(current => current.auto || current.remaining ? { ...current, auto: false, remaining: 0 } : current);
  }, [active]);
  useEffect(() => {
    if (!active || !busy || atLimit || error) return;
    const timer = window.setTimeout(() => setExperiment(current => {
      if (!current.auto && !current.remaining) return current;
      return advance(current, current.auto ? 10 : Math.min(10, current.remaining));
    }), 120);
    return () => window.clearTimeout(timer);
  }, [active, busy, atLimit, error, experiment]);
  useLayoutEffect(() => {
    if (!map.current) return;
    const observer = new ResizeObserver(entries => {
      const measured = entries[0].contentRect.width;
      if (measured > 0) setWidth(measured);
    });
    observer.observe(map.current);
    return () => observer.disconnect();
  }, []);

  function changeSettings(change: Partial<Settings>) {
    setExperiment(current => createExperiment({ ...current.settings, ...change }));
  }
  function changeLayer(index: number, change: Partial<BoundaryConfig['layers'][number]>) {
    changeSettings({ config: { layers: config.layers.map((layer, i) => i === index ? { ...layer, ...change } : layer) } });
  }
  function train(count: number) {
    setExperiment(current => count === 1 ? advance({ ...current, auto: false, remaining: 0 }, 1)
      : { ...current, auto: false, remaining: Math.min(count, stepLimit - current.optimizer.step) });
  }

  function loadRun(run: SavedBoundaryRun, source: string) {
    setExperiment(restoreBoundaryRun(run));
    setThreshold(run.threshold);
    setProbe([...run.probe]);
    setFileError(null);
    setFileStatus(`${source}: восстановлены веса, состояние оптимизатора, история, порог и проба. Обучение на паузе.`);
  }
  function exportFile() {
    try {
      const content = encodeBoundaryWorkspace(saveBoundaryRun(experiment, threshold, probe), slots);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `rustml-boundary-step-${optimizer.step}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFileError(null);
      setFileStatus('JSON текущего опыта и A/B подготовлен для скачивания. Завершение сохранения файла зависит от браузера.');
    } catch {
      setFileError('Не удалось подготовить файл экспорта. Текущий опыт и A/B сохранены в памяти страницы.');
    }
  }
  async function importFile(file: File) {
    setImporting(true);
    setFileError(null);
    try {
      if (file.size > boundaryFileLimit) throw new Error('Файл слишком большой: максимум 2 МиБ.');
      const imported = decodeBoundaryWorkspace(await file.text());
      loadRun(imported.current, 'Файл импортирован');
      setSlots(imported.slots);
      setSaveEnabled(true);
      setSaveAttempt(attempt => attempt + 1);
    } catch (error) {
      setFileError(`Импорт отменён; текущий опыт и A/B не заменены. ${error instanceof Error ? error.message : 'Не удалось прочитать файл.'}`);
    } finally { setImporting(false); }
  }

  const grid = useMemo(() => probabilityGrid((a, b) => predictBoundary(optimizer.params, config, [a, b]), threshold, segments), [optimizer.params, config, threshold]);
  const scores = useMemo(() => ({ train: boundaryMetrics(optimizer.params, config, dataset.train, threshold),
    validation: boundaryMetrics(optimizer.params, config, dataset.validation, threshold) }), [optimizer.params, config, dataset, threshold]);
  const probability = predictBoundary(optimizer.params, config, probe);
  const samples = useMemo(() => [...dataset.train.map(sample => ({ ...sample, validation: false })), ...dataset.validation.map(sample => ({ ...sample, validation: true }))], [dataset]);
  const allOnThreshold = grid.onThreshold === (segments + 1) ** 2;
  const contourMessage = allOnThreshold ? 'Во всех узлах сетки p = τ: отдельной разделяющей линии нет, по правилу равенства во всех узлах выбран класс 1.'
    : grid.boundary.length ? 'Коричневая линия p = τ отделяет области решений на этой сетке.'
      : `Линия p = τ на сетке не найдена. ${grid.above === 0 && grid.onThreshold === 0 ? 'Все её узлы дают класс 0.' : grid.below === 0 ? 'Все её узлы дают класс 1.' : 'Отдельное касание порога может не образовывать линию.'}`;
  const left = 34, right = width - 14, top = 27, bottom = top + right - left;
  const x = (value: number) => left + value * (right - left);
  const y = (value: number) => bottom - value * (bottom - top);
  const boundaryPath = grid.boundary.map(([a, b]) => `M${x(a[0])},${y(a[1])}L${x(b[0])},${y(b[1])}`).join(' ');
  function chooseProbe(event: MouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - bounds.left) * width / bounds.width;
    const py = (event.clientY - bounds.top) * (bottom + 48) / bounds.height;
    if (px < left || px > right || py < top || py > bottom) return;
    setProbe([Number(((px - left) / (right - left)).toFixed(2)), Number(((bottom - py) / (bottom - top)).toFixed(2))]);
  }
  const lines = useMemo<SceneLine[]>(() => [
    ...grid.boundary.map(points => ({ name: 'Сечение p = τ', points, color: boundaryColor })),
    ...(projection ? grid.boundary.map(([a, b]) => ({ name: 'Проекция границы на пол', points: [[a[0], a[1], 0], [b[0], b[1], 0]] as Vec3[], color: boundaryColor, dashed: true })) : []),
    { name: 'Ответ выбранной точки', points: [[probe[0], probe[1], 0], [probe[0], probe[1], probability]], color: probeColor },
  ], [grid, projection, probe, probability]);
  const architecture = [2, ...config.layers.map(layer => layer.width), 1].join(' → ');

  return <section className="panel boundary-playground" aria-labelledby="boundary-experiment">
    <span className="eyebrow">Лаборатория · данные, сеть, обучение</span>
    <h3 id="boundary-experiment" tabIndex={-1}>Лаборатория границ: данные и сеть</h3>
    <p>Запустите 100 шагов и посмотрите, как меняется граница классов — коричневая линия на карте.</p>
    <p className="note boundary-save-status" role="status">{storageStatus}</p>
    {storageError && <div className="boundary-error" role="alert"><p>Локальная копия не обновлена: {storageError} Текущий опыт доступен в памяти страницы; сохраните JSON перед закрытием.</p><button onClick={() => { setSaveEnabled(true); setSaveAttempt(attempt => attempt + 1); }}>Сохранить текущий опыт локально</button></div>}
    <details className="boundary-saved">
      <summary>Сохранение, файлы и сравнение A/B<span>A: {slots.A ? `шаг ${slots.A.optimizer.step}` : 'пусто'} · B: {slots.B ? `шаг ${slots.B.optimizer.step}` : 'пусто'}</span></summary>
      <p className="note">Автосохранение хранит настройки, точные веса и состояние оптимизатора, историю, порог и пробу только в этом браузере. JSON переносит текущий опыт и оба слота; импорт заменит их после проверки файла. Данные никуда не отправляются. Очистка данных браузера удалит локальную копию.</p>
      <div className="button-row"><button onClick={exportFile}>Экспорт JSON</button><button disabled={importing} onClick={() => importInput.current?.click()}>{importing ? 'Чтение файла…' : 'Импорт JSON'}</button></div>
      <input ref={importInput} className="boundary-import-input" type="file" accept=".json,application/json" aria-label="JSON текущего опыта и A/B" disabled={importing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }} />
      {fileError && <p className="boundary-error" role="alert">{fileError}</p>}
      {fileStatus && <p className="note" role="status">{fileStatus}</p>}
      <div className="boundary-slot-controls">{(['A', 'B'] as const).map(name => <div key={name}><h4>Опыт {name}</h4><p className="note">{slots[name] ? `${kinds[slots[name].settings.kind]} · seed ${slots[name].settings.seed} · шаг ${slots[name].optimizer.step}` : 'Слот пока пуст.'}</p>
        <div className="button-row"><button disabled={importing} onClick={() => { setSlots(current => ({ ...current, [name]: saveBoundaryRun(experiment, threshold, probe) })); setFileError(null); setFileStatus(`В слот ${name} скопирован текущий опыт на шаге ${optimizer.step}. Дальнейшее обучение его не меняет.`); }}>{slots[name] ? `Обновить ${name}` : `Сохранить в ${name}`}</button>
          <button disabled={!slots[name] || importing} onClick={() => { const run = slots[name]; if (run) loadRun(run, `Опыт ${name}`); }}>Загрузить {name}</button>
          <button disabled={!slots[name] || importing} onClick={() => { setSlots(current => ({ ...current, [name]: null })); setFileStatus(`Слот ${name} очищен. Текущий опыт не изменился.`); }}>Очистить {name}</button></div>
      </div>)}</div>
      <BoundaryComparison slots={slots} />
    </details>

    <details className="boundary-setup">
      <summary>Данные и сеть: {kinds[settings.kind]} · {architecture}<span>Изменение настроек начнёт новый опыт</span></summary>
      <p className="note boundary-reset-note">Любая настройка ниже сбрасывает шаг, веса и историю. Три независимых seed задают данные, начальные веса и порядок пакетов. Порог, проба и ракурс сохраняются.</p>
      <div className="boundary-settings">
        <label>Набор данных<select value={settings.kind} onChange={event => changeSettings({ kind: event.target.value as BoundaryKind })}>{Object.entries(kinds).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Скрытых слоёв<select value={config.layers.length} onChange={event => changeSettings({ config: { layers: Array.from({ length: Number(event.target.value) }, (_, i) => config.layers[i] ?? { width: 8, activation: 'tanh' }) } })}>{[0, 1, 2, 3].map(count => <option key={count} value={count}>{count}{count === 0 ? ' · линейный логит' : ''}</option>)}</select></label>
        <label>Оптимизатор<select value={settings.method} onChange={event => changeSettings({ method: event.target.value as OptimizerKind })}><option value="sgd">SGD</option><option value="momentum">Momentum</option><option value="adam">Adam</option></select></label>
      </div>
      <div className="boundary-seeds">
        <Range label="Seed данных" value={settings.seed} min={0} max={4294967295} step={1} onChange={seed => changeSettings({ seed })} />
        <Range label="Seed начальных весов" value={training.initSeed} min={0} max={4294967295} step={1} onChange={initSeed => changeSettings({ initSeed })} />
        <Range label="Seed порядка batch" value={training.batchSeed} min={0} max={4294967295} step={1} onChange={batchSeed => changeSettings({ batchSeed })} />
      </div>
      <div className="boundary-layers">{config.layers.map((layer, index) => <fieldset key={index}><legend>Скрытый слой {index + 1}</legend>
        <Range label={`Нейронов в слое ${index + 1}`} value={layer.width} min={1} max={16} step={1} onChange={width => changeLayer(index, { width })} />
        <label>Активация слоя {index + 1}<select value={layer.activation} onChange={event => changeLayer(index, { activation: event.target.value as Activation })}><option value="relu">ReLU</option><option value="tanh">tanh</option><option value="sigmoid">sigmoid</option></select></label>
      </fieldset>)}</div>
      <Range label="Скорость обучения η" value={settings.lr} min={.001} max={.2} step={.001} onChange={lr => changeSettings({ lr })} />
      <Range label="Размер batch · train-примеры" value={training.batchSize} min={1} max={96} step={1} onChange={batchSize => changeSettings({ batchSize })} />
      <Range label="L2 λ · штраф весов" value={training.lambda} min={0} max={1} step={.001} onChange={lambda => changeSettings({ lambda })} />
      <p className="note">Batch 96 — прежний полный шаг. Меньшие пакеты перемешиваются без повторений внутри эпохи; последний пакет может быть короче. Validation никогда не входит в обновление. Большая η может мешать сходимости. При уходе из урока обучение ставится на паузу.</p>
      <p className="note">Сравните одну прямую границу без скрытых слоёв с сетью из нескольких слоёв.</p>
    </details>

    <div className="boundary-experiment-layout">
      <div>
        <div className="boundary-training">
          <p className="boundary-architecture"><strong>{architecture}</strong><span>{boundaryParameterCount(config)} параметров · выход sigmoid</span></p>
          <p className="note boundary-current-settings">{settings.method === 'adam' ? 'Adam' : settings.method === 'sgd' ? 'SGD' : 'Momentum'} · η = {fmt(settings.lr, 3)} · batch {training.batchSize} · λ = {fmt(training.lambda, 3)} · seed данных {settings.seed}</p>
          <div className="button-row">
            <button disabled={busy || atLimit || !!error} onClick={() => train(1)}>1 шаг</button>
            <button className="primary" disabled={busy || atLimit || !!error} onClick={() => train(100)}>100 шагов</button>
            <button disabled={atLimit || !!error} onClick={() => setExperiment(current => ({ ...current, auto: !busy, remaining: 0 }))}>{busy ? 'Пауза' : 'Авто'}</button>
            <button aria-describedby={`${id}-reset-help`} onClick={() => setExperiment(current => createExperiment(current.settings))}>Сброс</button>
          </div>
          <p className="note boundary-run-status" data-step={optimizer.step} data-running={busy}>Обновлений: <strong>{optimizer.step}</strong> / {stepLimit} · обработано train-примеров: <strong>{budget.examples}</strong> · эквивалентных эпох: <strong>{fmt(budget.epochs, 3)}</strong>.{experiment.remaining > 0 && ` Осталось ${experiment.remaining} обновлений выбранного запуска.`}</p>
          <div className="boundary-budget">
            <Range label="Целевой бюджет · полных эпох" value={targetEpochs} min={1} max={40} step={1} onChange={setTargetEpochs} />
            <button disabled={busy || atLimit || !!error || stepsToTarget === 0} onClick={() => train(stepsToTarget)}>До {targetEpochs} эпох · {targetEpochs * 96} примеров</button>
            <p className="note">Абсолютная цель от старта опыта: ещё {stepsToTarget} обновлений. Для A/B сбросьте оба опыта и обучите до одного числа эпох. Равное число шагов при разных batch не означает равный бюджет примеров.</p>
          </div>
          {!atLimit && <details><summary>Следующий пакет: {nextBatch.length} train-примеров</summary><p className="note">Эпоха {budget.epoch + 1}, позиция {budget.cursor + 1}–{budget.cursor + nextBatch.length}. ID: {nextBatch.map(i => `T${String(i + 1).padStart(3, '0')}`).join(', ')}.</p></details>}
          <p className="note boundary-training-status" role="status">{error ? `Обучение остановлено из-за ошибки на шаге ${optimizer.step}.` : atLimit ? `Достигнут предел: ${optimizer.step} шагов. Сброс начинает новый опыт.` : busy ? experiment.auto ? 'Автообучение идёт.' : 'Выполняется выбранный запуск.' : `Обучение на паузе. Итоговый шаг: ${optimizer.step}.`}</p>
          <p className="note boundary-reset-help" id={`${id}-reset-help`}>Сброс вернёт начальные веса и шаг 0, очистит историю. Слоты A/B, порог и проба сохранятся.</p>
          {error && <p className="boundary-error" role="alert">{error}</p>}
        </div>
        <figure className="boundary-map-figure" aria-labelledby={`${id}-map-caption`}>
          <figcaption id={`${id}-map-caption`}>2D · {kinds[settings.kind]} · обучаемая граница</figcaption>
          <div className="boundary-map" ref={map}><svg viewBox={`0 0 ${width} ${bottom + 48}`} role="img" aria-labelledby={`${id}-map-title`} aria-describedby={`${id}-map-description`} onClick={chooseProbe}>
            <title id={`${id}-map-title`}>Карта решений выбранной сети, шаг {optimizer.step}</title>
            <desc id={`${id}-map-description`}>Вход x₁ по горизонтали, x₂ по вертикали, оба от 0 до 1. Кружки — цель 0, треугольники — цель 1; сплошные точки участвуют в обучении, пустые используются для проверки. Фон показывает {probabilityColors ? 'вероятность класса 1' : 'предсказанный класс'}. Коричневая линия: p равно порогу. Фиолетовая проба задаётся мышью или двумя ползунками рядом.</desc>
            <defs><clipPath id={`${id}-map-clip`}><rect x={left} y={top} width={right - left} height={bottom - top} /></clipPath></defs>
            <g clipPath={`url(#${id}-map-clip)`}>
              {grid.rows.flatMap((row, i) => row.map(([a, b, p], j) => <rect key={`${i}-${j}`} data-x={a} data-y={b} data-probability={p} x={x(a - .5 / segments)} y={y(b + .5 / segments)} width={(right - left) / segments + .3} height={(bottom - top) / segments + .3} fill={probabilityColors ? `hsl(153 32% ${97 - p * 54}%)` : regionColors[Number(p >= threshold)]} />))}
              {[.25, .5, .75].map(t => <g key={t} className="boundary-map-grid"><line x1={x(t)} x2={x(t)} y1={top} y2={bottom} /><line x1={left} x2={right} y1={y(t)} y2={y(t)} /></g>)}
              <path className="boundary-contour" d={boundaryPath} />
              {samples.map(({ input, target, validation }, index) => <g key={index} data-sample-id={`${validation ? 'V' : 'T'}${String(validation ? index - dataset.train.length + 1 : index + 1).padStart(3, '0')}`} data-x={input[0]} data-y={input[1]} data-target={target} data-split={validation ? 'validation' : 'train'} fill={validation ? '#fffefa' : targetColors[target]} stroke={targetColors[target]} strokeWidth={validation ? 1.6 : 1} onClick={event => { event.stopPropagation(); setProbe([...input]); }}>
                {target === 0 ? <circle cx={x(input[0])} cy={y(input[1])} r={validation ? 3.7 : 2.8} /> : <path d={`M${x(input[0])},${y(input[1]) - 4}l3.7,6.5h-7.4Z`} />}
                <title>{validation ? 'V' : 'T'}{String(validation ? index - dataset.train.length + 1 : index + 1).padStart(3, '0')} · {validation ? 'Проверка' : 'Обучение'} · цель {target} · вход [{input.map(value => fmt(value, 3)).join('; ')}]</title>
              </g>)}
              <path className="boundary-crosshair" d={`M${left},${y(probe[1])}H${right}M${x(probe[0])},${top}V${bottom}`} />
            </g>
            <rect className="boundary-map-frame" x={left} y={top} width={right - left} height={bottom - top} />
            {[0, .5, 1].map(t => <g key={t}><text x={x(t)} y={bottom + 23} textAnchor="middle">{fmt(t, 1)}</text><text x={left - 9} y={y(t) + 4} textAnchor="end">{fmt(t, 1)}</text></g>)}
            <text x={left} y="13">Вход x₂</text><text x={(left + right) / 2} y={bottom + 44} textAnchor="middle">Вход x₁</text>
            <circle className="boundary-probe-marker" data-x={probe[0]} data-y={probe[1]} data-probability={probability} cx={x(probe[0])} cy={y(probe[1])} r="8"><title>Проба: p = {fmt(probability, 6)}, класс {Number(probability >= threshold)}</title></circle>
          </svg></div>
          <div className="boundary-legend" aria-label="Легенда карты">
            <span><i className="boundary-key-circle" />Цель 0</span><span><i className="boundary-key-triangle" />Цель 1</span>
            <span><i className="boundary-key-train" />Обучение · 96</span><span><i className="boundary-key-validation" />Проверка · 32</span>
            <span><i className="boundary-key-line" />Граница p = τ</span><span><i className="boundary-key-probe" />Проба</span>
          </div>
          <div className="boundary-legend boundary-background-legend">{probabilityColors ? <span>p = 0 <i className="boundary-key-gradient" /> p = 1</span> : <><span><i style={{ background: regionColors[0] }} />Фон: класс 0</span><span><i style={{ background: regionColors[1] }} />Фон: класс 1</span></>}</div>
        </figure>
        <label className="boundary-check"><input type="checkbox" checked={probabilityColors} onChange={event => setProbabilityColors(event.target.checked)} />Плавный цвет вероятности вместо областей классов</label>
        <p className="note boundary-contour-note">{contourMessage}</p>
      </div>
      <div className="boundary-probe-controls">
        <div className="boundary-scores" aria-label="Качество выбранной сети">
          <div><h4>Обучение · train</h4><p><strong>{scores.train.correct} / {scores.train.total}</strong> верно · {fmt(100 * scores.train.accuracy, 1)}%</p><p>BCE: <strong>{fmt(scores.train.loss, 6)}</strong></p></div>
          <div><h4>Проверка · validation</h4><p><strong>{scores.validation.correct} / {scores.validation.total}</strong> верно · {fmt(100 * scores.validation.accuracy, 1)}%</p><p>BCE: <strong>{fmt(scores.validation.loss, 6)}</strong></p></div>
        </div>
        <p className="note">L2 = {fmt(boundaryL2(optimizer.params, config, training.lambda).loss, 6)} · objective на всех train = {fmt(scores.train.loss + boundaryL2(optimizer.params, config, training.lambda).loss, 6)}. BCE выше и на графике — без штрафа.</p>
        <Range label="Порог решения τ" value={threshold} min={.05} max={.95} step={.01} onChange={setThreshold} />
        <p className="note">p ≥ τ → класс 1, иначе класс 0. Порог меняет решения и долю верных ответов; веса и потеря BCE остаются прежними.</p>
        <div className="boundary-probe-card"><h4>Проверьте свою точку</h4>
          <p className="note">Нажмите на карту или двигайте ползунки, в том числе стрелками клавиатуры.</p>
          <Range label="Вход x₁ выбранной точки" value={probe[0]} min={0} max={1} step={.01} onChange={value => setProbe(current => [value, current[1]])} />
          <Range label="Вход x₂ выбранной точки" value={probe[1]} min={0} max={1} step={.01} onChange={value => setProbe(current => [current[0], value])} />
          <dl className="boundary-readout"><div><dt>p(класс 1)</dt><dd>{fmt(probability, 6)}</dd></div><div><dt>Решение при τ = {fmt(threshold, 2)}</dt><dd>Класс {Number(probability >= threshold)}</dd></div></dl>
          <p className="note">Ответ рассчитан самой сетью. Показанные числа округлены, сравнение с порогом использует полное значение.</p>
        </div>
      </div>
    </div>

    <div id="network-representations" tabIndex={-1} role="region" aria-label="Скрытые представления сети">
      <HiddenRepresentations params={optimizer.params} config={config} dataset={dataset} probe={probe} onProbeChange={setProbe} step={optimizer.step} source={`${kinds[settings.kind]} · seed ${settings.seed}`} />
    </div>

    <div className="boundary-loss"><h4>Уменьшается ли ошибка на новых точках?</h4>
      <Chart series={[{ name: 'Обучение · train', points: history.map(point => ({ x: point.step, y: point.train })), color: '#27694e' }, { name: 'Проверка · validation', points: history.map(point => ({ x: point.step, y: point.validation })), color: '#b75d24', dashed: true }]} xLabel="Шаг обучения" yLabel="Средняя потеря BCE" xDomain={[0, Math.max(1, optimizer.step)]} yDomain={[0, Math.max(.1, ...history.flatMap(point => [point.train, point.validation])) * 1.1]} />
      <p className="note">Обе кривые вычислены по одним и тем же весам в отмеченные шаги. Обновления весов видят только train; 32 точки validation не входят в градиент. Это малая независимая проверочная выборка из того же генератора, а не окончательный test.</p>
    </div>

    <details className="boundary-3d" onToggle={event => { const open = event.currentTarget.open; setSceneOpen(open); if (open) setSceneVisited(true); }}>
      <summary>3D: граница выбранной сети</summary>
      <p>На полу расположены два входа x₁ и x₂. Высота зелёной поверхности — вероятность p, которую вычисляет выбранная сеть. Плоскость на высоте τ пересекает её по коричневой линии. Пунктирная проекция этой линии на пол повторяет границу 2D.</p>
      <p className="note">Третья ось — ответ сети, а не третий признак. Все 128 точек данных стоят на полу, на высоте 0; их цвет показывает известную цель. Фиолетовая вертикаль показывает предсказание для пробы.</p>
      <label className="boundary-check"><input type="checkbox" checked={projection} onChange={event => setProjection(event.target.checked)} />Проекция границы на пол · пунктир</label>
      {sceneVisited && <LearningActivity active={sceneOpen}><Scene3D title="Обучаемая граница в 3D"
        description="Два входа x₁ и x₂ от 0 до 1; высота p от 0 до 1 — вероятность класса 1 выбранной сети. Данные расположены на полу, синие — цель 0, зелёные — цель 1. Сечение p = τ совпадает с вычисленным контуром карты 2D."
        axes={[{ label: 'Вход x₁', min: 0, max: 1 }, { label: 'Вход x₂', min: 0, max: 1 }, { label: 'Вероятность p', min: 0, max: 1 }]}
        surfaces={[{ name: 'Вероятность класса 1', rows: grid.rows, color: '#498d76', opacity: .62 }, { name: `Порог τ = ${fmt(threshold, 2)}`, rows: [[[0, 0, threshold], [1, 0, threshold]], [[0, 1, threshold], [1, 1, threshold]]], color: '#b98b48', opacity: .18 }]}
        lines={lines} points={[...samples.map(({ input, target, validation }) => ({ name: `${validation ? 'Проверка' : 'Обучение'} · цель ${target} · [${input.map(value => fmt(value, 3)).join('; ')}]`, position: [input[0], input[1], 0] as Vec3, color: targetColors[target] })), { name: 'Проба · вероятность p', position: [probe[0], probe[1], probability], color: probeColor }]} showLegend={false}
      /></LearningActivity>}
      <p className="note">Поверхность, её пересечения и перекрытия в SVG приближённые. Для точного ответа используйте численную пробу; плоская карта и метрики выше доступны без вращения.</p>
    </details>
    <p className="note">Показан только квадрат [0, 1] × [0, 1]. Цвет и поверхность опираются на сетку {segments} × {segments} ячеек. Контур соединяет найденные точки p = τ: малые петли и отдельные касания между узлами могут быть пропущены; соединение ветвей у седла зависит от разбиения ячейки. Диапазон p в узлах: {fmt(grid.min, 4)}…{fmt(grid.max, 4)}.</p>

    <details><summary>Почему слои меняют границу?</summary>
      <p>Без скрытых слоёв логит — взвешенная сумма двух входов со смещением. Условие p = τ задаёт прямую (или вырожденный случай без отдельной линии). Скрытые нейроны сначала создают новые признаки; следующие слои комбинируют их.</p>
      <p>ReLU даёт кусочно-линейные скрытые функции и логит, поэтому граница может состоять из прямых участков. Выходная sigmoid делает саму вероятность нелинейной. tanh и sigmoid дают плавные изменения, но при насыщении их производные малы и обучение может замедляться.</p>
      <p>Больше нейронов и слоёв — больше возможностей, но не обещание лучшего результата. Сравнивайте train и validation: снижение ошибки обучения само по себе не доказывает улучшение на новых данных. Разберите <ConceptLink concept="overfitting">переобучение</ConceptLink> и <ConceptLink concept="train-validation-test">разделение данных</ConceptLink>.</p>
    </details>
    <details><summary>Математика: от входов к одному шагу обучения</summary>
      <p>На карте входы x₁, x₂ лежат в [0, 1]. Перед первым слоем сеть центрирует их: a⁽⁰⁾ = 2x − 1. Затем каждый скрытый слой считает <ConceptLink concept="matrix">матричное произведение</ConceptLink> z = Wa + b и свою активацию. Выход всегда один: p = sigmoid(z).</p>
      <div className="formula">p = 1 / (1 + exp(−z))<br />Граница: p = τ ⇔ z = ln(τ / (1 − τ))<br />Сейчас: τ = {fmt(threshold, 2)}, z на границе = {fmt(Math.log(threshold / (1 - threshold)), 5)}</div>
      <p>Средняя <ConceptLink concept="cross-entropy">потеря BCE</ConceptLink> штрафует уверенные ошибочные ответы. Она считается устойчиво по логиту z. <ConceptLink concept="backpropagation">Обратный проход</ConceptLink> находит градиент по всем весам и смещениям; выбранный оптимизатор делает шаг с <ConceptLink concept="learning-rate">скоростью η</ConceptLink>.</p>
      <div className="formula">rawBCE = средняя BCE выбранного пакета<br />objective = rawBCE + λ/2 · ΣW²<br />gW = gBCE,W + λW<br />gb = gBCE,b</div>
      <p>В SGD вес меняется на −ηg. Momentum накапливает направление (0,9). Adam использует средние градиента и его квадрата (0,9 и 0,999, ε = 10⁻⁸). L2 входит в градиент objective для всех трёх методов; это не AdamW. Bias не штрафуются. Начальные веса используют масштаб He для ReLU, Glorot для остальных слоёв; bias равны нулю.</p>
      <p>Например, λ = 0,1 и W = [1; 2] добавляют 0,25 к потере и [0,1; 0,2] к градиенту весов. При λ = 0 штраф исчезает.</p>
      <p className="note">Источники: <a href="https://www.deeplearningbook.org/contents/optimization.html" target="_blank" rel="noreferrer">Deep Learning, §8.1.3 · mini-batch</a>; <a href="https://en.d2l.ai/chapter_linear-regression/weight-decay.html" target="_blank" rel="noreferrer">Dive into Deep Learning, §3.7 · L2</a>.</p>
      <p>Порог τ применяется после расчёта вероятности и не входит в потерю. Измените его, чтобы увидеть разницу между уверенностью сети и правилом принятия решения.</p>
    </details>
    <p className="boundary-xor-note">Ниже — отдельный пошаговый разбор XOR с фиксированной сетью 2 → 4 → 1. У него свои веса и обучение: его можно изучать независимо от этой лаборатории.</p>
  </section>;
}
