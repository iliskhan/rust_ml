import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { networkLossGradient, optimizerStep, XOR_DATA, type OptimizerKind, type OptimizerState } from './math';
import { traceNetwork, networkParameterName } from './networkTrace';
import { ConceptLink, useLearningActive } from './learning-context';
import { projectPoint, sortByDepth, type ScenePrimitive, type Vec3 } from './scene3dMath';
import { fmt, Range } from './ui';
import './network-flow3d.css';

type Props = {
  state: OptimizerState; kind: OptimizerKind; lr: number; sample: number;
  onSample: (index: number) => void; onTrainStep: () => void; onPause: () => void;
};
type Selection = { kind: 'node'; index: number } | { kind: 'parameter'; index: number };
const stages = ['Вход', 'Взвешенная сумма', 'Активация tanh', 'Ответ сети', 'Ошибка BCE', 'Градиент выхода', 'Назад через tanh', 'Градиенты весов', 'Среднее по 4', 'Обновление весов'];
const names = { sgd: 'SGD', momentum: 'Momentum', adam: 'Adam' };
const initialCamera = { yaw: -18, pitch: 12 };
const positions: Vec3[] = [[-1.18, 0, .66], [-1.18, 0, -.66], [0, -.42, 1.1], [0, .42, .36], [0, -.42, -.36], [0, .42, -1.1], [1.18, 0, 0]];
const nodeNames = ['x₁', 'x₂', 'h₁', 'h₂', 'h₃', 'h₄', 'p'];
const edges = Array.from({ length: 12 }, (_, i) => i < 8
  ? { parameter: i, from: i % 2, to: 2 + Math.floor(i / 2) }
  : { parameter: i + 4, from: i - 6, to: 6 });
const stateKey = (state: OptimizerState) => JSON.stringify([state.step, state.params, state.m, state.v]);
const n = (value: number) => fmt(value, 5);

/** A schematic layout: depth separates wires; it is not an input or embedding coordinate. */
export function NetworkFlow3D({ state, kind, lr, sample, onSample, onTrainStep, onPause }: Props) {
  const id = useId().replace(/:/g, '');
  const active = useLearningActive();
  const [stage, setStage] = useState(0);
  const [selection, setSelection] = useState<Selection>({ kind: 'node', index: 2 });
  const [camera, setCamera] = useState(initialCamera);
  const [width, setWidth] = useState(600);
  const [motion, setMotion] = useState(true);
  const [applied, setApplied] = useState<{ before: OptimizerState; after: OptimizerState } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; yaw: number; pitch: number; touch: boolean } | null>(null);
  const pending = useRef<{ before: OptimizerState; expected: string; settings: string } | null>(null);
  const settings = `${kind}/${lr}/${sample}`;
  const currentKey = stateKey(state);
  const sourceKey = `${settings}/${currentKey}`;
  const previousKey = useRef(sourceKey);
  const previousState = useRef(state);

  useEffect(() => {
    if (previousKey.current === sourceKey && previousState.current === state) return;
    previousKey.current = sourceKey;
    previousState.current = state;
    const requested = pending.current;
    pending.current = null;
    setWaiting(false);
    if (requested && requested.settings === settings && requested.expected === currentKey) {
      setApplied({ before: requested.before, after: state });
      setStage(9);
    } else {
      setApplied(null);
      setStage(0);
    }
  }, [sourceKey, settings, currentKey, state]);

  useLayoutEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0].contentRect.width > 0) setWidth(entries[0].contentRect.width);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const base = applied?.before ?? state;
  const trace = useMemo(() => traceNetwork(base.params, XOR_DATA[sample].input, XOR_DATA[sample].target), [base.params, sample]);
  const batch = useMemo(() => networkLossGradient(base.params), [base.params]);
  const traces = useMemo(() => XOR_DATA.map(data => traceNetwork(base.params, data.input, data.target)), [base.params]);
  const next = useMemo(() => optimizerStep(base, batch.grad, kind, { lr }), [base, batch.grad, kind, lr]);
  const after = applied?.after ?? next;
  const afterLoss = useMemo(() => networkLossGradient(after.params).loss, [after.params]);
  const backward = stage >= 5 && stage <= 7;
  const color = backward ? '#9f4a19' : stage >= 8 ? '#6a52a0' : '#27694e';
  const height = width < 440 ? 338 : 390;
  // Fit projected node centres, reserving pixels for their circles, bias badges and captions.
  const zoom = Math.min(1.7, ...positions.flatMap(position => {
    const point = projectPoint(position, camera.yaw, camera.pitch, width, height);
    const dx = point.x - width / 2, dy = point.y - height / 2;
    return [
      dx > 0 ? (width / 2 - 43) / dx : dx < 0 ? (width / 2 - 45) / -dx : Infinity,
      dy > 0 ? (height / 2 - 50) / dy : dy < 0 ? (height / 2 - 58) / -dy : Infinity,
    ];
  }));
  const project = (point: Vec3) => projectPoint(point, camera.yaw, camera.pitch, width, height, zoom);
  const geometry: ScenePrimitive[] = edges.map(edge => ({ kind: 'line', vertices: [positions[edge.from], positions[edge.to]], name: String(edge.parameter), color }));
  const sortedEdges = sortByDepth(geometry, camera.yaw, camera.pitch);
  const selectedParameter = selection.kind === 'parameter' ? selection.index : selection.index >= 2 && selection.index < 6 ? 8 + selection.index - 2 : 16;
  const hiddenIndex = selection.kind === 'node' ? Math.max(0, Math.min(3, selection.index - 2)) : selection.index < 8 ? Math.floor(selection.index / 2) : selection.index < 12 ? selection.index - 8 : Math.min(3, selection.index - 12);
  const hidden = trace.hidden[hiddenIndex];
  const stageDescriptions = [
    `Берём один пример XOR: [${trace.input.join('; ')}]. Правильный ответ y = ${trace.target}. Пока веса не меняются.`,
    'Каждый скрытый нейрон получает оба входа. Умножаем входы на веса, складываем и прибавляем его смещение b.',
    'tanh превращает сумму в сигнал от −1 до 1. У четырёх нейронов свои веса, поэтому сигналы различаются.',
    `Выход складывает четыре сигнала с весами и своё смещение. Сигмоида превращает результат в вероятность: p = ${n(trace.probability)}.`,
    `Сравниваем ответ с целью ${trace.target}. BCE этого примера = ${n(trace.loss)}. Чем увереннее верный ответ, тем меньше потеря.`,
    `Начинаем обратный проход. Чувствительность потери к логиту: p − y = ${n(trace.dLossDLogit)}. Это сигнал, а не изменение веса.`,
    'Передаём чувствительность назад по четырём выходным весам и умножаем на локальный наклон tanh: 1 − h².',
    'Градиент веса равен входящему в него сигналу × чувствительности нейрона. У смещения вход всегда 1. Это градиенты одного примера.',
    'Повторяем расчёт для всех четырёх примеров XOR. Складываем их градиенты и делим на 4 — именно это среднее получает оптимизатор.',
    applied ? `Выполнен настоящий шаг ${base.step} → ${after.step}. Новые параметры уже используются в общем эксперименте.` : `${names[kind]} использует средний градиент и скорость η = ${n(lr)}. Ниже показан предстоящий шаг; примените его отдельной кнопкой.`,
  ];

  function select(value: Selection) { onPause(); setSelection(value); }
  function goTo(value: number) { onPause(); setStage(value); }
  function applyStep() {
    if (pending.current || applied || state.step >= 4000) return;
    onPause();
    pending.current = { before: state, expected: stateKey(next), settings };
    setWaiting(true);
    onTrainStep();
  }
  function rotate(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    setCamera({
      yaw: Math.max(-65, Math.min(65, start.yaw + (event.clientX - start.x) * .4)),
      pitch: start.touch ? start.pitch : Math.max(-45, Math.min(45, start.pitch - (event.clientY - start.y) * .3)),
    });
  }
  function edgeActive(parameter: number) {
    if (stage === 1) return parameter < 8;
    if (stage === 3 || stage === 6) return parameter >= 12;
    return stage === 7 || stage >= 8;
  }
  function nodeActive(index: number) {
    return stage === 0 ? index < 2 : stage <= 2 ? index >= 2 && index < 6 : stage <= 5 ? index === 6 : stage === 6 ? index >= 2 : true;
  }

  function parameterFormula(index: number) {
    if (index < 8) {
      const h = trace.hidden[Math.floor(index / 2)], inputIndex = index % 2;
      return <><p>Прямой вклад: x{inputIndex + 1} × вес = {trace.input[inputIndex]} × {n(base.params[index])} = <strong>{n(h.inputContributions[inputIndex])}</strong>.</p><p>Градиент: x{inputIndex + 1} × δ скрытого = {trace.input[inputIndex]} × {n(h.dLossDPreactivation)} = <strong>{n(trace.parameterGradient[index])}</strong>.</p></>;
    }
    if (index < 12) return <><p>Смещение прибавляется к сумме нейрона h{index - 7}: <strong>{n(base.params[index])}</strong>.</p><p>Градиент: 1 × δ скрытого = <strong>{n(trace.parameterGradient[index])}</strong>.</p></>;
    if (index < 16) return <><p>Прямой вклад: h{index - 11} × вес = {n(trace.hidden[index - 12].activation)} × {n(base.params[index])} = <strong>{n(trace.outputContributions[index - 12])}</strong>.</p><p>Градиент: h{index - 11} × δ выхода = {n(trace.hidden[index - 12].activation)} × {n(trace.dLossDLogit)} = <strong>{n(trace.parameterGradient[index])}</strong>.</p></>;
    return <><p>Смещение выхода прибавляет <strong>{n(base.params[index])}</strong> к четырём взвешенным сигналам.</p><p>Градиент: 1 × δ выхода = <strong>{n(trace.parameterGradient[index])}</strong>.</p></>;
  }

  return <section className="network-flow" aria-labelledby={`${id}-heading`} onPointerDownCapture={onPause} onKeyDownCapture={onPause} style={{ '--flow-color': color } as CSSProperties}>
    <div className="network-flow-heading"><div><span className="eyebrow">Один цикл обучения · 2 → 4 → 1</span><h3 id={`${id}-heading`}>Пройдите путь сигнала и градиента</h3></div><span className="network-flow-step-badge">Веса шага {base.step}</span></div>
    <p className="network-flow-intro">Выберите нейрон или связь, чтобы увидеть его числа. Зелёные стрелки ведут ответ вперёд, оранжевые — чувствительность назад. Веса меняет только последний шаг.</p>
    <div className="network-flow-top-controls"><label>Пример для разбора<select value={sample} onChange={event => { onPause(); onSample(Number(event.target.value)); }}>{XOR_DATA.map((data, i) => <option key={i} value={i}>[{data.input.join('; ')}] → цель {data.target}</option>)}</select></label><p>12 весов связей + 5 смещений<br /><strong>{names[kind]} · η = {n(lr)}</strong></p></div>
    <ol className="network-flow-stages" aria-label="Этапы одного шага обучения">{stages.map((name, i) => <li key={name}><button type="button" aria-current={stage === i ? 'step' : undefined} onClick={() => goTo(i)}><span>{i + 1}</span>{name}</button></li>)}</ol>
    <div className="network-flow-explanation" aria-live="polite"><span className="network-flow-phase">{stage < 5 ? 'Прямой проход →' : stage < 8 ? '← Обратный проход' : stage === 8 ? 'Собираем пакет' : applied ? 'Шаг выполнен' : 'Готовы изменить веса'}</span><h4>{stage + 1}. {stages[stage]}</h4><p>{stageDescriptions[stage]}</p></div>
    <div className="network-flow-workspace">
      <div className="network-flow-visual">
        <div className="network-flow-canvas" ref={container} data-moving={active && motion ? 'true' : 'false'}>
          <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={0}
            onKeyDown={event => {
              if (event.target !== event.currentTarget) return;
              const delta = event.key === 'ArrowLeft' ? -5 : event.key === 'ArrowRight' ? 5 : 0;
              if (delta) { event.preventDefault(); setCamera(value => ({ ...value, yaw: Math.max(-65, Math.min(65, value.yaw + delta)) })); }
              if (event.key === 'Home') { event.preventDefault(); setCamera(initialCamera); }
            }}
            onPointerDown={event => {
              if (event.button !== 0 || !event.isPrimary || (event.target as Element).closest('[role="button"]')) return;
              drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch, touch: event.pointerType === 'touch' };
              event.currentTarget.setPointerCapture(event.pointerId);
            }} onPointerMove={rotate} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
            <title id={`${id}-title`}>Сеть XOR: два входа, четыре скрытых нейрона, один выход</title><desc id={`${id}-description`}>Схема связей в ортографической 3D-проекции. Положение и глубина условны, это не координаты данных. Выберите нейрон или вес клавишей Enter. Стрелки влево и вправо вращают камеру, Home сбрасывает вид. Числа доступны в карточке и таблице.</desc>
            <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 Z" fill={color} /></marker></defs>
            <text x="14" y="23" className="network-flow-canvas-caption">{backward ? 'Чувствительность ←' : stage === 8 ? 'Средний градиент' : stage === 9 ? applied ? '17 параметров обновлены' : 'Предпросмотр обновления' : 'Сигнал →'}</text>
            {sortedEdges.map(primitive => {
              const parameter = Number(primitive.name), edge = edges.find(value => value.parameter === parameter)!;
              const a = project(positions[backward ? edge.to : edge.from]), b = project(positions[backward ? edge.from : edge.to]);
              const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              const inset = width < 360 ? 16 : 20;
              const start = { x: a.x + (b.x - a.x) * inset / length, y: a.y + (b.y - a.y) * inset / length };
              const end = { x: b.x - (b.x - a.x) * inset / length, y: b.y - (b.y - a.y) * inset / length };
              const path = `M${start.x},${start.y} L${end.x},${end.y}`;
              const highlighted = edgeActive(parameter), selected = selection.kind === 'parameter' && selection.index === parameter;
              return <g key={parameter} role="button" tabIndex={0} aria-label={`Вес ${networkParameterName(parameter)}: ${n(base.params[parameter])}`} aria-pressed={selected} onClick={() => select({ kind: 'parameter', index: parameter })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select({ kind: 'parameter', index: parameter }); } }} className={`network-flow-edge${highlighted ? ' is-active' : ''}${selected ? ' is-selected' : ''}`}>
                <path d={path} className="network-flow-edge-hit" /><path d={path} className="network-flow-wire" markerEnd={highlighted && stage < 8 ? `url(#${id}-arrow)` : undefined} />
                {highlighted && stage < 8 && <path key={stage} d={path} pathLength="100" className="network-flow-packet" />}
                <title>{networkParameterName(parameter)} = {n(base.params[parameter])}; градиент примера {n(trace.parameterGradient[parameter])}</title>
              </g>;
            })}
            {positions.map((position, index) => {
              const point = project(position), selected = selection.kind === 'node' && selection.index === index;
              const parameter = index >= 2 && index < 6 ? index + 6 : 16;
              const biasX = point.x + (index === 2 || index === 4 ? -40 : 13);
              return <g key={index}>
                <g role="button" tabIndex={0} aria-label={`Нейрон ${nodeNames[index]}`} aria-pressed={selected} className={`network-flow-node${nodeActive(index) ? ' is-active' : ''}${selected ? ' is-selected' : ''}`} onClick={() => select({ kind: 'node', index })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select({ kind: 'node', index }); } }}>
                  <circle cx={point.x} cy={point.y} r={width < 360 ? 15 : 19} /><text x={point.x} y={point.y + 4} textAnchor="middle">{nodeNames[index]}</text>
                </g>
                {index >= 2 && <g role="button" tabIndex={0} aria-label={`Смещение ${networkParameterName(parameter)}: ${n(base.params[parameter])}`} aria-pressed={selection.kind === 'parameter' && selection.index === parameter} className={`network-flow-bias${selection.kind === 'parameter' && selection.index === parameter ? ' is-selected' : ''}`} onClick={() => select({ kind: 'parameter', index: parameter })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select({ kind: 'parameter', index: parameter }); } }}><rect x={biasX} y={point.y - 29} width="25" height="19" rx="5" /><text x={biasX + 12.5} y={point.y - 16} textAnchor="middle">+b</text></g>}
              </g>;
            })}
            <text x="14" y={height - 15} className="network-flow-canvas-caption">{width < 400 ? 'Схема · выберите элемент' : 'Положение нейронов условное · выберите элемент'}</text>
          </svg>
        </div>
        {[1, 2, 6].includes(stage) && <div className="network-flow-layer-values" aria-label={stage === 1 ? 'Суммы скрытого слоя' : stage === 2 ? 'Сигналы скрытого слоя' : 'Чувствительности скрытого слоя'}>{trace.hidden.map((neuron, i) => <button key={i} aria-pressed={selection.kind === 'node' && selection.index === i + 2} onClick={() => select({ kind: 'node', index: i + 2 })}><span>{stage === 1 ? 'z' : stage === 2 ? 'h' : 'δ'}{i + 1}</span><strong>{n(stage === 1 ? neuron.z : stage === 2 ? neuron.activation : neuron.dLossDPreactivation)}</strong></button>)}</div>}
        <p className="network-flow-note">Глубина помогает разнести связи. Она не обозначает величину, время или измерение входа. Движущиеся метки показывают направление расчёта, а не его реальную скорость.</p>
        <div className="network-flow-camera"><Range label="Поворот, °" value={camera.yaw} min={-65} max={65} step={1} onChange={yaw => setCamera(value => ({ ...value, yaw }))} /><Range label="Наклон, °" value={camera.pitch} min={-45} max={45} step={1} onChange={pitch => setCamera(value => ({ ...value, pitch }))} /></div>
        <div className="network-flow-camera-buttons"><button onClick={() => setCamera(initialCamera)}>Сбросить вид</button><button onClick={() => setCamera({ yaw: 0, pitch: 0 })}>Спереди</button><button aria-pressed={motion} onClick={() => setMotion(value => !value)}>{motion ? 'Остановить метки' : 'Двигать метки'}</button></div>
        <p className="network-flow-note">Вращайте мышью или ползунками. На телефоне движение вбок вращает, вверх и вниз прокручивает страницу.</p>
      </div>
      <aside className="network-flow-inspector" aria-label="Разбор выбранного элемента">
        <label>Нейрон или параметр<select value={`${selection.kind}:${selection.index}`} onChange={event => { const [kind, index] = event.target.value.split(':'); select({ kind: kind as Selection['kind'], index: Number(index) }); }}><optgroup label="Нейроны">{nodeNames.map((name, index) => <option key={name} value={`node:${index}`}>{name}{index < 2 ? ' · вход' : index < 6 ? ' · скрытый' : ' · выход'}</option>)}</optgroup><optgroup label="Все 17 параметров">{base.params.map((_, index) => <option key={index} value={`parameter:${index}`}>{networkParameterName(index)}</option>)}</optgroup></select></label>
        <h4>{selection.kind === 'parameter' ? networkParameterName(selection.index) : `Нейрон ${nodeNames[selection.index]}`}</h4>
        {selection.kind === 'parameter' ? <>
          {parameterFormula(selection.index)}
          <p className="network-flow-gradient-label">Градиент здесь — для выбранного примера, без деления на 4.</p>
          <dl className="network-flow-values"><div><dt>Средний градиент 4 примеров</dt><dd>{n(batch.grad[selection.index])}</dd></div><div><dt>Вес до шага</dt><dd>{n(base.params[selection.index])}</dd></div><div><dt>{applied ? 'Вес после шага' : 'Вес после применения'}</dt><dd>{n(after.params[selection.index])}</dd></div><div><dt>Изменение веса Δ</dt><dd>{n(after.params[selection.index] - base.params[selection.index])}</dd></div></dl>
        </> : selection.index < 2 ? <>
          <p>Значение входа: <strong>{trace.input[selection.index]}</strong>. Целевой ответ для этой пары: {trace.target}.</p><p>Вход отправляется во все четыре скрытых нейрона.</p><p>Чувствительность потери к входу: <strong>{n(trace.inputGradient[selection.index])}</strong>. Это сумма четырёх обратных путей. Сам вход не обучается.</p>
        </> : selection.index < 6 ? <>
          <dl className="network-flow-values"><div><dt>Взвешенная сумма z</dt><dd>{n(hidden.z)}</dd></div><div><dt>Сигнал h = tanh(z)</dt><dd>{n(hidden.activation)}</dd></div><div><dt>Наклон tanh: 1 − h²</dt><dd>{n(hidden.activationSlope)}</dd></div><div><dt>Чувствительность к сигналу ∂ℓ/∂h</dt><dd>{n(hidden.dLossDActivation)}</dd></div><div><dt>Чувствительность к сумме δ</dt><dd>{n(hidden.dLossDPreactivation)}</dd></div></dl>
          <p>Назад: δ выхода × выходной вес × наклон tanh = {n(trace.dLossDLogit)} × {n(hidden.outputWeight)} × {n(hidden.activationSlope)} = <strong>{n(hidden.dLossDPreactivation)}</strong>.</p>
        </> : <>
          <dl className="network-flow-values"><div><dt>Логит z</dt><dd>{n(trace.logit)}</dd></div><div><dt>Вероятность p = σ(z)</dt><dd>{n(trace.probability)}</dd></div><div><dt>Целевой ответ y</dt><dd>{trace.target}</dd></div><div><dt>Потеря ℓ</dt><dd>{n(trace.loss)}</dd></div><div><dt>δ выхода = p − y</dt><dd>{n(trace.dLossDLogit)}</dd></div></dl><p>Положительная δ: уменьшение логита уменьшит потерю этого примера. Отрицательная: поможет увеличение.</p>
        </>}
      </aside>
    </div>
    <details className="network-flow-formula"><summary>Формула текущего этапа с живыми числами</summary><div className="network-flow-equation">
      {stage === 0 && <>x = [{trace.input.join('; ')}], y = {trace.target}</>}
      {stage === 1 && <>z скрытого h{hiddenIndex + 1} = {n(base.params[2 * hiddenIndex])} × {trace.input[0]} + {n(base.params[2 * hiddenIndex + 1])} × {trace.input[1]} + ({n(base.params[8 + hiddenIndex])}) = {n(hidden.z)}</>}
      {stage === 2 && <>h{hiddenIndex + 1} = tanh({n(hidden.z)}) = {n(hidden.activation)}; локальная производная 1 − ({n(hidden.activation)})² = {n(hidden.activationSlope)}</>}
      {stage === 3 && <>z выхода = {trace.outputContributions.map(value => `(${n(value)})`).join(' + ')} + ({n(base.params[16])}) = {n(trace.logit)}<br />p = σ(z) = {n(trace.probability)}</>}
      {stage === 4 && <>ℓ = −y ln(p) − (1 − y) ln(1 − p) = {n(trace.loss)}<br />Вычисление без потери устойчивости: max(z, 0) − zy + ln(1 + exp(−|z|)), z = {n(trace.logit)}, y = {trace.target}.</>}
      {stage === 5 && <>δ выхода = ∂ℓ/∂z = σ(z) − y = {n(trace.probability)} − {trace.target} = {n(trace.dLossDLogit)}</>}
      {stage === 6 && <>δ скрытого h{hiddenIndex + 1} = δ выхода × W₂ × (1 − h²) = {n(trace.dLossDLogit)} × {n(hidden.outputWeight)} × {n(hidden.activationSlope)} = {n(hidden.dLossDPreactivation)}</>}
      {stage === 7 && parameterFormula(selectedParameter)}
      {stage === 8 && <>ḡ({networkParameterName(selectedParameter)}) = ({traces.map(value => `(${n(value.parameterGradient[selectedParameter])})`).join(' + ')}) / 4 = {n(batch.grad[selectedParameter])}</>}
      {stage === 9 && <>{kind === 'sgd' ? `θ′ = θ − ηḡ = ${n(base.params[selectedParameter])} − ${n(lr)} × (${n(batch.grad[selectedParameter])})` : kind === 'momentum' ? `m′ = 0,9m + ḡ = ${n(after.m[selectedParameter])}; θ′ = θ − ηm′` : `m′ = 0,9m + 0,1ḡ = ${n(after.m[selectedParameter])}; v′ = 0,999v + 0,001ḡ² = ${n(after.v[selectedParameter])}; m̂ = m′/(1−0,9ᵗ), v̂ = v′/(1−0,999ᵗ); θ′ = θ − ηm̂/(√v̂ + 10⁻⁸), t = ${after.step}`}<br />{networkParameterName(selectedParameter)}: {n(base.params[selectedParameter])} → {n(after.params[selectedParameter])}</>}
    </div><p>Разобрать: <ConceptLink concept="derivative">производная</ConceptLink>, <ConceptLink concept="chain-rule">правило цепочки</ConceptLink>, <ConceptLink concept="gradient">градиент</ConceptLink>, <ConceptLink concept="loss">потеря</ConceptLink>, <ConceptLink concept="learning-rate">шаг оптимизатора</ConceptLink>.</p></details>
    {stage >= 8 && <section className="network-flow-batch" aria-label="Усреднение четырёх примеров"><h4>Все четыре примера → один шаг</h4><p>Выбран параметр <strong>{networkParameterName(selectedParameter)}</strong>. Каждый столбик даёт отдельный градиент; ниже — их среднее.</p><div className="network-flow-batch-cards">{traces.map((value, index) => <div key={index} data-selected={index === sample}><span>[{value.input.join('; ')}] → {value.target}</span><strong>{n(value.parameterGradient[selectedParameter])}</strong><small>ℓ = {n(value.loss)}</small></div>)}</div><p className="network-flow-average">Сумма ÷ 4 = <strong>{n(batch.grad[selectedParameter])}</strong> · средняя BCE = <strong>{n(batch.loss)}</strong></p></section>}
    {stage === 9 && <div className={`network-flow-update${applied ? ' is-applied' : ''}`}><div><h4>{applied ? 'Веса действительно обновлены' : 'Применить ровно один шаг'}</h4><p>Средняя BCE: {n(batch.loss)} → {n(afterLoss)} <span>({applied ? 'результат' : 'предпросмотр'})</span></p><p className="network-flow-note">Используется средний градиент всех четырёх примеров{kind !== 'sgd' && ' и сохранённая память оптимизатора'}. Один шаг не обязан уменьшать потерю.</p></div>{applied ? <button onClick={() => { setApplied(null); setStage(0); }}>Следующий цикл →</button> : <button className="primary" disabled={waiting || state.step >= 4000} onClick={applyStep}>{waiting ? 'Ожидаем обновление…' : state.step >= 4000 ? 'Достигнут предел 4000 шагов' : 'Обновить настоящие веса'}</button>}</div>}
    <div className="network-flow-navigation"><button disabled={stage === 0} onClick={() => goTo(stage - 1)}>← Назад</button><span>{stage + 1} / {stages.length}</span><button className="primary" disabled={stage === 9} onClick={() => goTo(stage + 1)}>Дальше →</button></div>
    <details className="network-flow-table"><summary>Все 17 параметров: значения и градиенты</summary><p>ℓ — потеря выбранного примера, L — средняя потеря четырёх примеров. Столбец «после» {applied ? 'подтверждён выполненным шагом' : 'показывает предпросмотр до нажатия кнопки обновления'}. Индексы массивов начинаются с 0: нейрон h₁ использует строку W1[0,…]. Выберите строку для разбора.</p><div className="network-flow-table-scroll" tabIndex={0} role="region" aria-label="Таблица параметров с горизонтальной прокруткой"><table><caption>Параметры шага {base.step} → {after.step}, {names[kind]}</caption><thead><tr><th scope="col">Параметр</th><th scope="col">До</th><th scope="col">∂ℓ · 1 пример</th><th scope="col">∂L · среднее 4</th><th scope="col">Δ веса</th><th scope="col">После{!applied && ' (прогноз)'}</th></tr></thead><tbody>{base.params.map((value, index) => <tr key={index} data-selected={selection.kind === 'parameter' && selection.index === index}><th scope="row"><button aria-pressed={selection.kind === 'parameter' && selection.index === index} onClick={() => select({ kind: 'parameter', index })}>{networkParameterName(index)}</button></th><td>{n(value)}</td><td>{n(trace.parameterGradient[index])}</td><td>{n(batch.grad[index])}</td><td>{n(after.params[index] - value)}</td><td>{n(after.params[index])}</td></tr>)}</tbody></table></div></details>
  </section>;
}
