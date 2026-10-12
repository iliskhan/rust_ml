import { memo, useState } from 'react';
import { cnnShiftComparison, SHIFT_FILTER } from './cnnShiftMath';
import { PredictionExperiment } from './PredictionExperiment';
import { Range, fmt } from './ui';
import { useLearningActive } from './learning-context';
import './cnn-shift-lab.css';

type Pattern = 'shape' | 'edge' | 'zero';
function makeInput(pattern: Pattern) {
  return Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) =>
    pattern === 'zero' ? 0 : pattern === 'edge' ? (x === 6 ? y + 1 : 0) : (x === 2 && y >= 2 && y <= 4) || (y === 4 && x >= 2 && x <= 4) ? 1 : 0));
}

function Grid({ label, values, scale = 1, marked, onSelect }: { label: string; values: number[][]; scale?: number; marked?: (y: number, x: number) => boolean; onSelect?: (y: number, x: number) => void }) {
  return <div className="cnn-shift-grid-scroll" tabIndex={0} role="region" aria-label={label}>
    <table className="data-table"><caption>{label}</caption><thead><tr><th scope="col">y\x</th>{values[0]?.map((_, x) => <th key={x} scope="col">{x}</th>)}</tr></thead>
      <tbody>{values.map((row, y) => <tr key={y}><th scope="row">{y}</th>{row.map((value, x) => <td key={x} className={marked?.(y, x) ? 'cnn-shift-marked' : undefined}
        style={{ backgroundColor: value === 0 ? undefined : `rgba(${value > 0 ? '39, 105, 78' : '183, 93, 36'}, ${0.28 * Math.min(1, Math.abs(value) / scale)})` }}>
        {onSelect ? <button type="button" aria-label={`${label}, y=${y}, x=${x}, значение ${fmt(value)}`} aria-pressed={!!marked?.(y, x)} onClick={() => onSelect(y, x)}>{fmt(value, 2)}</button> : <>{fmt(value, 2)}{marked?.(y, x) ? ' ◂' : ''}</>}
      </td>)}</tr>)}</tbody></table>
  </div>;
}

function ShiftLab({ active: _active }: { active: boolean }) {
  const [stride, setStride] = useState<1 | 2>(1), [padding, setPadding] = useState<0 | 1>(1);
  const [pattern, setPattern] = useState<Pattern>('shape'), [cells, setCells] = useState(0);
  const [selected, setSelected] = useState<[number, number]>([3, 3]);
  const input = makeInput(pattern), trace = cnnShiftComparison(input, stride, padding, cells);
  const inputScale = Math.max(1, ...input.flat().map(Math.abs), ...trace.shiftedInput.flat().map(Math.abs));
  const outputScale = Math.max(1, ...[trace.output, trace.shiftedOutput, trace.expected, trace.difference].flat(2).map(Math.abs));
  const y = Math.min(selected[0], trace.output.length - 1), x = Math.min(selected[1], trace.output[0].length - 1);
  const selectedCell = (row: number, column: number) => row === y && column === x;
  const window = (row: number, column: number) => row >= y * stride - padding && row < y * stride - padding + 3
    && column >= x * stride - padding && column < x * stride - padding + 3;
  const maxText = (value: number | null) => value === null ? 'нет ячеек' : fmt(value, 6);
  return <section className="cnn-shift-lab" aria-label="CNN: сдвиг входа и эквивариантность">
    <h4>Сдвинуть узор и сравнить карты признаков</h4>
    <p>Один фиксированный фильтр 3×3 ищет вертикальные границы, bias=0, без ReLU и pooling.
      <strong> Эквивариантность</strong> означает: перенос входа переносит карту признаков. Инвариантность означала бы, что карта остаётся той же — это другое свойство.</p>
    <div className="controls">
      <label>Узор <select value={pattern} onChange={event => { setPattern(event.target.value as Pattern); setCells(0); }}>
        <option value="shape">Фигура внутри изображения</option><option value="edge">Узор на правом краю</option><option value="zero">Нулевой вход</option>
      </select></label>
      <Range label="Опыт сдвига: stride" value={stride} min={1} max={2} step={1} onChange={value => setStride(value as 1 | 2)} />
      <Range label="Опыт сдвига: padding нулями" value={padding} min={0} max={1} step={1} onChange={value => setPadding(value as 0 | 1)} />
    </div>
    <div className="button-row">
      <button type="button" onClick={() => setCells(1)}>Сдвинуть вход на 1 ячейку вправо</button>
      <button type="button" onClick={() => setCells(2)}>Контроль: сдвиг на 2 ячейки</button>
      <button type="button" onClick={() => setCells(0)}>Вернуть исходный вход</button>
    </div>
    <p className="note">Каждая кнопка задаёт сдвиг от исходного узора; сейчас Δx={cells}. Освободившиеся ячейки заполнены нулями,
      выходящие справа значения обрезаны. У изображения 7×7 координаты x — столбец, y — строка, с 0.
      Вход и выходы имеют собственные сетки: одна ячейка выхода соответствует {stride} ячейкам входа.</p>
    <p className="note cnn-shift-scale"><span className="cnn-shift-positive">Зелёный: +</span>; <span className="cnn-shift-negative">оранжевый: −</span>; 0 без заливки.
      Насыщенность пропорциональна модулю: общая шкала двух входов 0…{fmt(inputScale)}, всех выходов и разности −{fmt(outputScale)}…+{fmt(outputScale)}.
      Числа сохраняют точные значения; рамки обозначают выбранные окна или ячейки.</p>
    <div className="cnn-shift-matrices">
      <Grid label="Исходный вход x; ◂ — выбранное окно" values={input} scale={inputScale} marked={window} />
      <Grid label={`Перенесённый вход T${cells} x; ◂ — то же окно`} values={trace.shiftedInput} scale={inputScale} marked={window} />
      <Grid label="Исходный выход C(x): выберите ячейку" values={trace.output} scale={outputScale} marked={selectedCell} onSelect={(row, column) => setSelected([row, column])} />
      <Grid label="Новый выход C(Tx): выберите ячейку" values={trace.shiftedOutput} scale={outputScale} marked={selectedCell} onSelect={(row, column) => setSelected([row, column])} />
      <Grid label={`${trace.aligned ? 'Перенесённый' : 'Приближённый перенос'} выход T${trace.outputShift} C(x)`} values={trace.expected} scale={outputScale} marked={selectedCell} />
      <Grid label="Разность C(Tx) − T C(x); ◂ — внутренние ячейки" values={trace.difference} scale={outputScale} marked={(row, column) => trace.interior[row][column]} />
    </div>
    <p className="formula">Ячейка выхода [y={y}, x={x}]: C(x)={fmt(trace.output[y][x])}; C(Tx)={fmt(trace.shiftedOutput[y][x])};
      T C(x)={fmt(trace.expected[y][x])}; разность={fmt(trace.difference[y][x])}.<br />
      Окно входа: y={y * stride - padding}…{y * stride - padding + 2}, x={x * stride - padding}…{x * stride - padding + 2}.
      {' '}{trace.interior[y][x] ? 'Ячейка входит во внутреннее сравнение.' : 'Ячейка исключена из внутреннего сравнения: край или недоступное соответствующее окно.'}</p>
    <p className="result">Внутри ({trace.interiorCount} ячеек): max |разность|={maxText(trace.maxInteriorDifference)}.
      {' '}На остальных ячейках: max |разность|={maxText(trace.maxEdgeDifference)}.</p>
    <p>{trace.aligned ? `Δx/stride=${cells / stride} — целый сдвиг карты. Совпадение проверяем на окнах, которые целиком помещаются в исходном и перенесённом изображении.`
      : `Δx/stride=${cells / stride} — дробный сдвиг карты: точного переноса на целую ячейку нет. Для сравнения взят floor(Δx/stride)=${trace.outputShift}; ненулевая разность показывает смену фазы выборки.`}</p>
    <p className="note">На краях padding и обрезка нарушают сравнение даже при stride=1. Нули в таблице разности на отдельном узоре
      не доказывают общее свойство: нулевой вход совпадёт при любом stride. Контроль Δx=2 при stride=2 снова выравнивает сетки.</p>
    <details><summary>Фильтр и правило внутреннего сравнения</summary>
      <Grid label="Фиксированный фильтр 3×3" values={SHIFT_FILTER} />
      <p>Свёртка использует ту же функцию conv2d, что и прямой проход выше: cross-correlation без переворота фильтра.
        Внутри сравниваем только полные окна без padding, с доступной ячейкой исходного выхода, не задетые новой нулевой полосой входа.
        Выбранное окно подсвечено на двух входах; координаты отрицательных частей padding указаны в формуле, на входной матрице этих ячеек нет.</p>
    </details>
    <PredictionExperiment question={`Прогноз для выбранного узора: после сдвига входа на 1 вправо при stride=${stride}, padding=${padding} какой будет разность внутри? Опыт начнёт с Δx=0.`}
      options={['Максимальная разность внутри будет нулевой', 'Появится ненулевая разность внутри']}
      run={prediction => {
        const before = cnnShiftComparison(input, stride, padding, 0), after = cnnShiftComparison(input, stride, padding, 1);
        const equal = after.maxInteriorDifference !== null && after.maxInteriorDifference < 1e-10;
        setCells(1);
        return { correct: prediction === (equal ? 0 : 1),
          before: `Δx=0, stride=${stride}, padding=${padding}; внутри ${before.interiorCount} ячеек, max |разность|=${maxText(before.maxInteriorDifference)}`,
          after: `Δx=1, stride=${stride}, padding=${padding}; внутри ${after.interiorCount} ячеек, max |разность|=${maxText(after.maxInteriorDifference)}`,
          explanation: stride === 1 ? 'Окна сдвигаются на одну ячейку карты и внутри совпадают. Краевые значения проверяются отдельно. Таблицы теперь показывают вход после сдвига.'
            : `Сдвиг в одну ячейку меняет фазу stride=2; перенос карты на 0,5 ячейки нельзя выполнить на этой дискретной сетке.${equal ? ' Здесь совпадение случайно для выбранного узора и не означает общую эквивариантность.' : ' Численная разность показывает, что целого переноса карты недостаточно.'} Проверьте выравнивающий сдвиг на 2 ячейки.` };
      }} />
  </section>;
}

const ActiveShiftLab = memo(ShiftLab, (_previous, next) => !next.active);
export function CnnShiftLab({ open }: { open: boolean }) {
  return <ActiveShiftLab active={useLearningActive() && open} />;
}
