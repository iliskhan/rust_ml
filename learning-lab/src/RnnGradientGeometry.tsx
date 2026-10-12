import { memo, useMemo, useState } from 'react';
import type { RecurrentWeights } from './architectures';
import { Scene3D, type Scene3DProps } from './ThreeD';
import { functionSurface } from './lessonSceneMath';
import { rnnLocalJacobian } from './rnnGradientGeometryMath';
import { PredictionExperiment } from './PredictionExperiment';
import { Chart, Range, fmt } from './ui';
import { useLearningActive } from './learning-context';

type Props = { t: number; x: number; previous: number; weights: RecurrentWeights; open: boolean };
const JacobianScene = memo(function JacobianScene({ open: _open, ...props }: Scene3DProps & { open: boolean }) {
  return <Scene3D {...props} />;
}, (_previous, next) => !next.open);

function Geometry({ t, x, previous, weights }: Omit<Props, 'open'> & { active: boolean }) {
  const [follow, setFollow] = useState(true);
  const [probe, setProbe] = useState({ previous, wh: weights.wh });
  const [sceneOpen, setSceneOpen] = useState(false), [sceneVisited, setSceneVisited] = useState(false);
  const point = follow ? { previous, wh: weights.wh } : probe;
  const current = rnnLocalJacobian(previous, x, weights);
  const trial = rnnLocalJacobian(point.previous, x, { ...weights, wh: point.wh });
  const whBound = Math.max(3, Math.ceil(Math.abs(weights.wh)), Math.ceil(Math.abs(point.wh)));
  const hBound = Math.max(1, Math.ceil(Math.abs(point.previous)));
  const sample = (h: number, wh: number) => rnnLocalJacobian(h, x, { ...weights, wh }).jacobian;
  const rows = useMemo(() => sceneOpen ? functionSurface([-hBound, hBound], [-whBound, whBound],
    (h, wh) => rnnLocalJacobian(h, x, { ...weights, wh }).jacobian, 24) : [],
  [sceneOpen, hBound, whBound, x, weights.wx, weights.b]);
  const slice = Array.from({ length: 61 }, (_, i) => {
    const h = -hBound + 2 * hBound * i / 60;
    return { x: h, y: sample(h, point.wh) };
  });
  const strength = Math.abs(trial.jacobian) > 1 ? 'усиливает модуль' : Math.abs(trial.jacobian) < 1 ? 'ослабляет модуль' : 'сохраняет модуль';
  function change(next: typeof probe) { setFollow(false); setProbe(next); }
  return <section aria-label="Локальный якобиан RNN">
    <h4>Один шаг: где градиент усиливается, а где гаснет</h4>
    <p>Поверхность показывает <strong>Jₜ = ∂hₜ/∂hₜ₋₁</strong> одной tanh-ячейки. По осям — предыдущее состояние hₜ₋₁,
      рекуррентный вес Wh и вычисленный Jₜ. Все величины безразмерны. Вход xₜ={fmt(x)}, Wx={fmt(weights.wx)} и b={fmt(weights.b)}{' '}
      взяты из выбранного шага BPTT t={t} и фиксированы во всём срезе.</p>
    <p className="formula">Jₜ = Wh × (1 − tanh²(Wx xₜ + Wh hₜ₋₁ + b))<br />
      Точка BPTT: hₜ₋₁={fmt(previous, 6)}, Wh={fmt(weights.wh, 6)}, Jₜ={fmt(current.jacobian, 6)}.</p>
    <div className="controls">
      <label><input type="checkbox" checked={follow} onChange={event => {
        if (!event.target.checked) setProbe({ previous, wh: weights.wh });
        setFollow(event.target.checked);
      }} /> Следовать выбранному шагу BPTT</label>
      <Range label="Проба: предыдущее состояние hₜ₋₁" value={point.previous} min={-hBound} max={hBound} step={0.01}
        onChange={h => change({ ...point, previous: h })} />
      <Range label="Проба: рекуррентный вес Wh" value={point.wh} min={-whBound} max={whBound} step={0.01}
        onChange={wh => change({ ...point, wh })} />
    </div>
    <p className="result">Проба: zₜ={fmt(trial.z, 6)}, hₜ={fmt(trial.h, 6)}, tanh′={fmt(trial.derivative, 6)},
      Jₜ={fmt(trial.jacobian, 6)}. Один множитель {strength} градиента; {trial.jacobian === 0 ? 'этот путь градиента обнулён.' : trial.jacobian < 0 ? 'отрицательный знак меняет направление.' : 'знак направления не меняется.'}</p>
    <p className="note">Проба меняет только этот локальный срез и не обучает веса BPTT. Градиент потери gₜ₋₁=gₜ Jₜ
      зависит также от последующих шагов и ошибки. Jₜ сам по себе не равен ∂L/∂h₀; полная цепочка остаётся в таблице выше.</p>
    {Math.abs(point.previous) > 1 && <p className="note">Проба hₜ₋₁ вне [−1,1] — математический вход одной ячейки.
      Предыдущий выход tanh в развёрнутой цепочке такого значения не достигает; настоящая точка BPTT показана отдельно.</p>}
    <Chart xLabel="Предыдущее состояние hₜ₋₁" yLabel="Локальный множитель Jₜ" xDomain={[-hBound, hBound]} yDomain={[-whBound, whBound]}
      series={[{ name: `Срез Wh=${fmt(point.wh)}`, points: slice }, { name: 'J=1', points: [{ x: -hBound, y: 1 }, { x: hBound, y: 1 }], dashed: true },
        { name: 'J=−1', points: [{ x: -hBound, y: -1 }, { x: hBound, y: -1 }], dashed: true },
        { name: 'Выбранная проба', points: [{ x: point.previous, y: trial.jacobian }] }]} />
    <details onToggle={event => { setSceneOpen(event.currentTarget.open); if (event.currentTarget.open) setSceneVisited(true); }}>
      <summary>3D: поверхность локального множителя Jₜ</summary>
      <div hidden={!sceneOpen}>{sceneVisited && <JacobianScene open={sceneOpen} title="Локальный якобиан одной tanh-ячейки" description="Высота — Wh × (1−tanh²(Wx xₜ+Wh hₜ₋₁+b)). Это семейство одношаговых производных, а не полная поверхность потери RNN. Плоскости ±1 отделяют ослабление от усиления модуля."
        axes={[{ label: 'Состояние hₜ₋₁', min: -hBound, max: hBound }, { label: 'Рекуррентный вес Wh', min: -whBound, max: whBound }, { label: 'Якобиан Jₜ', min: -whBound, max: whBound }]}
        surfaces={[{ name: 'Локальный Jₜ', rows, opacity: 0.38 }, ...[-1, 1].map(j => ({ name: `Порог J=${j}`, rows: functionSurface([-hBound, hBound], [-whBound, whBound], () => j, 1), color: '#9f4a19', opacity: 0.1 }))]}
        lines={[{ name: `Срез Wh=${fmt(point.wh)}`, points: slice.map(p => [p.x, point.wh, p.y] as const), color: '#9f4a19' }]}
        points={[{ name: `Текущий BPTT t=${t}`, position: [previous, weights.wh, current.jacobian], color: '#325fad' },
          { name: 'Локальная проба', position: [point.previous, point.wh, trial.jacobian], color: '#b1365b' }]} />}</div>
    </details>
    <PredictionExperiment question="Опыт насыщения: фиксируем Wh=3 и подбираем hₜ₋₁ так, чтобы zₜ=0. Затем увеличиваем hₜ₋₁ на 1. Что будет с |Jₜ|?"
      options={['Уменьшится: tanh войдёт в насыщение', 'Вырастет, потому что Wh больше 1', 'Останется равным 3']}
      run={prediction => {
        const neutral = -(weights.wx * x + weights.b) / 3;
        const before = rnnLocalJacobian(neutral, x, { ...weights, wh: 3 });
        const after = rnnLocalJacobian(neutral + 1, x, { ...weights, wh: 3 });
        change({ previous: neutral + 1, wh: 3 });
        return { correct: prediction === 0,
          before: `hₜ₋₁=${fmt(neutral, 6)}, zₜ=${fmt(before.z, 6)}, |Jₜ|=${fmt(Math.abs(before.jacobian), 6)}`,
          after: `hₜ₋₁=${fmt(neutral + 1, 6)}, zₜ=${fmt(after.z, 6)}, |Jₜ|=${fmt(Math.abs(after.jacobian), 6)}`,
          explanation: 'Вес остался 3, но tanh′ уменьшилась. Большой рекуррентный вес не гарантирует усиление: насыщение подавляет локальный множитель. Проба теперь показывает состояние после этого опыта.' };
      }} />
  </section>;
}

const ActiveGeometry = memo(Geometry, (_previous, next) => !next.active);

// Keep controls mounted, but freeze a collapsed or inactive experiment.
export function RnnGradientGeometry({ open, ...props }: Props) {
  const active = useLearningActive() && open;
  return <ActiveGeometry {...props} active={active} />;
}
