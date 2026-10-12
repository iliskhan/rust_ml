import { useState } from 'react';
import { useLearningActive } from './learning-context';
import { Scene3D, type Vec3, type SceneSurface } from './ThreeD';
import { Range, fmt } from './ui';
import { PredictionExperiment } from './PredictionExperiment';
import { normalizationGeometry } from './transformerVisualMath';
import './transformer-visual-experiments.css';

const initialBase: Vec3 = [-1, .5, 2];
const vector = (values: number[]) => `[${values.map(value => fmt(value, 5)).join('; ')}]`;
const radius = Math.sqrt(3);
const guides: SceneSurface[] = [
  { name: 'Плоскость x₁ + x₂ + x₃ = 0', color: '#6a52a0', opacity: .1, rows: [[[-6, 0, 6], [-6, 6, 0]], [[0, -6, 6], [0, 6, -6]], [[6, -6, 0], [6, 0, -6]]] },
  { name: 'Сфера радиуса √3: предел при ε→0', color: '#27694e', opacity: .08,
    rows: Array.from({ length: 13 }, (_, i) => Array.from({ length: 25 }, (_, j): Vec3 => {
      const latitude = Math.PI * i / 12, longitude = Math.PI * 2 * j / 24;
      return [radius * Math.sin(latitude) * Math.cos(longitude), radius * Math.sin(latitude) * Math.sin(longitude), radius * Math.cos(latitude)];
    })) },
];

export function NormalizationGeometryLab() {
  const active = useLearningActive();
  const [open, setOpen] = useState(false), [visited, setVisited] = useState(false);
  const [base, setBase] = useState<Vec3>(initialBase);
  const [shift, setShift] = useState(0), [scale, setScale] = useState(1), [epsilon, setEpsilon] = useState(.01);
  const trace = normalizationGeometry(base, shift, scale, epsilon);
  const rows = [trace.input, trace.centered, trace.layer.output, trace.rms.output];
  const names = ['x = s·base + c', 'x − μ·[1;1;1]', 'LayerNorm(x)', 'RMSNorm(x)'];
  return <details className="tv-lab" onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) setVisited(true); }}>
    <summary>3D-опыт: LayerNorm и RMSNorm в трёх реальных признаках</summary>
    {visited && <>
      <p>Отдельный вектор из трёх признаков base = {vector([...base])}. Это новый опыт, а не проекция четырёхмерного FFN выше. γ=1, β=0; координаты — настоящие x₁, x₂, x₃. Все оси обеих сцен имеют одинаковый диапазон −6…6.</p>
      <div className="tv-controls">
        {base.map((value, i) => <Range key={i} label={`Исходная компонента base x${i + 1}`} value={value} min={-2} max={2} step={.1} onChange={next => setBase(base.map((old, j) => i === j ? next : old) as unknown as Vec3)} />)}
        <Range label="Общий сдвиг c" value={shift} min={-2} max={2} step={.1} onChange={setShift} />
        <Range label="Общий масштаб s" value={scale} min={0} max={2} step={.1} onChange={setScale} />
        <Range label="Положительное ε" value={epsilon} min={.001} max={.2} step={.001} onChange={setEpsilon} />
      </div>
      <p>LayerNorm вычитает среднее μ={fmt(trace.layer.mean, 5)}: центрированный вектор и выход лежат в плоскости суммы координат 0. RMSNorm сохраняет направление x и обычно не лежит в этой плоскости.</p>
      {open && active && <div className="tv-scenes">{(['layer', 'rms'] as const).map(kind => {
        const output = trace[kind].output, title = kind === 'layer' ? 'LayerNorm: центрирование → масштаб' : 'RMSNorm: масштаб вдоль исходного луча';
        return <Scene3D key={kind} title={title} description="Плоскость суммы 0 и сфера √3 показаны как ориентиры. Стрелки идут из нуля к реальным векторам; численные координаты ниже."
          axes={[{ label: 'Признак x₁', min: -6, max: 6 }, { label: 'Признак x₂', min: -6, max: 6 }, { label: 'Признак x₃', min: -6, max: 6 }]}
          surfaces={guides}
          points={[{ name: 'Исходный x', position: trace.input as unknown as Vec3, color: '#9f4a19' }, ...(kind === 'layer' ? [{ name: 'x − μ', position: trace.centered as unknown as Vec3, color: '#6a52a0' }] : []), { name: 'Выход нормы', position: output as unknown as Vec3, color: '#27694e' }]}
          lines={[{ name: 'Исходный вектор', points: [[0, 0, 0], trace.input as unknown as Vec3], color: '#9f4a19' }, ...(kind === 'layer' ? [{ name: 'Вычитание среднего', points: [trace.input as unknown as Vec3, trace.centered as unknown as Vec3], color: '#6a52a0', dashed: true }] : []), { name: 'Нормированный вектор', points: [[0, 0, 0], output as unknown as Vec3], color: '#27694e' }]} />;
      })}</div>}
      <div className="tv-scroll" role="region" aria-label="Численная альтернатива геометрии норм" tabIndex={0}><table><caption>Координаты и длины тех же векторов</caption><thead><tr><th scope="col">Вектор</th><th scope="col">x₁</th><th scope="col">x₂</th><th scope="col">x₃</th><th scope="col">Сумма</th><th scope="col">Длина</th></tr></thead><tbody>{rows.map((row, i) => <tr key={names[i]}><th scope="row">{names[i]}</th>{row.map((value, j) => <td key={j}>{fmt(value, 6)}</td>)}<td>{fmt(row.reduce((a, b) => a + b), 6)}</td><td>{fmt(Math.hypot(...row), 6)}</td></tr>)}</tbody></table></div>
      <p className="formula">‖LN(x)‖² = 3·variance / (variance + ε); ‖RMSNorm(x)‖² = 3·mean(x²) / (mean(x²) + ε).</p>
      <p>При ε&gt;0 длины строго меньше √3≈{fmt(radius, 6)}. Сфера показывает предельную длину, а не точный выход. Общий положительный масштаб меняет длину из-за ε; при s=0 LayerNorm даёт нулевой вектор.</p>
      <PredictionExperiment question="Фиксированный опыт: base=[−1; 0,5; 2], s=1, ε=0,01, c: 0→2. Какая норма сохранит весь выходной вектор?" options={['Только LayerNorm', 'Обе нормы', 'Только RMSNorm']} run={prediction => {
        const before = normalizationGeometry(initialBase, 0, 1, .01), after = normalizationGeometry(initialBase, 2, 1, .01);
        setBase(initialBase); setScale(1); setEpsilon(.01); setShift(2);
        const difference = (a: number[], b: number[]) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));
        return { correct: prediction === 0,
          before: `base=[−1; 0,5; 2], s=1, ε=0,01, c=0: LN=${vector(before.layer.output)}; RMS=${vector(before.rms.output)}.`,
          after: `Восстановлен base=[−1; 0,5; 2], установлены s=1, ε=0,01, c=2: LN=${vector(after.layer.output)}; RMS=${vector(after.rms.output)}. Максимальная разница LN=${fmt(difference(before.layer.output, after.layer.output), 8)}, RMS=${fmt(difference(before.rms.output, after.rms.output), 8)}.`,
          explanation: 'Среднее растёт на тот же сдвиг: x−μ сохраняется. RMSNorm не вычитает среднее, поэтому общий сдвиг меняет её результат.' };
      }} />
    </>}
  </details>;
}
