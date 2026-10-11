import { analyzeMathSnapshot, type MathSnapshot } from './mathSnapshot';
import { ConceptLink } from './learning-context';
import './snapshot-analysis.css';

// String preserves each stored Number; display rounding must never feed the calculation.
const number = (value: number) => Object.is(value, -0) ? '−0' : String(value);
const activationNames = { relu: 'ReLU', sigmoid: 'sigmoid', tanh: 'tanh' };

export function SnapshotAnalysis({ snapshot }: { snapshot: MathSnapshot }) {
  const result = analyzeMathSnapshot(snapshot);
  return <section className="snapshot-analysis" aria-label="Мои числа из эксперимента" data-snapshot-kind={snapshot.kind}>
    <p className="snapshot-eyebrow">Мои числа из эксперимента</p>
    <h3>{snapshot.origin}</h3>
    <p className="snapshot-detail">{snapshot.detail}</p>
    <p>Это копия чисел в момент нажатия. Она не меняет настройки урока. Расчёт использует сохранённые числа без округления.</p>
    {snapshot.kind === 'dot-product' && result.kind === 'dot-product' && <>
      <p>Сопоставим координаты двух <ConceptLink concept="vector">векторов</ConceptLink>, умножим каждую пару и сложим результаты. Для нейрона это входы и веса, а для сходства attention — запрос и ключ.</p>
      <div className="snapshot-table" tabIndex={0} role="region" aria-label="Векторы и произведения"><table className="data-table"><caption>Каждое произведение из вашего расчёта</caption>
        <thead><tr><th scope="col">Координата</th><th scope="col">Первый вектор xᵢ</th><th scope="col">Второй вектор wᵢ</th><th scope="col">xᵢ · wᵢ</th></tr></thead>
        <tbody>{result.terms.map((term, index) => <tr key={index}><th scope="row">{index + 1}</th><td>{number(snapshot.inputs[index])}</td><td>{number(snapshot.weights[index])}</td><td>{number(term)}</td></tr>)}</tbody>
      </table></div>
      <ol className="snapshot-steps">
        <li><strong>Скалярное произведение:</strong> сумма произведений = <output>{number(result.sum)}</output>.</li>
        {(snapshot.activation || snapshot.bias !== 0) && <li>{snapshot.accumulation === 'bias-first'
          ? <><strong>Вычислить z как в уроке:</strong> начать с b = {number(snapshot.bias)} и по очереди прибавить каждое xᵢ · wᵢ. Получится z = <output>{number(result.z)}</output>.</>
          : <><strong>Прибавить смещение:</strong> z = {number(result.sum)} + ({number(snapshot.bias)}) = <output>{number(result.z)}</output>.</>}</li>}
        {snapshot.activation && <li><strong>Применить {activationNames[snapshot.activation]}:</strong> a = {activationNames[snapshot.activation]}({number(result.z)}) = <output>{number(result.output)}</output>.</li>}
      </ol>
      <p className="note">Само скалярное произведение — только сумма xᵢ · wᵢ. Для ответа нейрона учитываем смещение и затем активацию.{snapshot.accumulation === 'bias-first' && ' При расчёте z смещение прибавляется первым, как в исходной сети: порядок сложения может влиять на округление в браузере.'}</p>
    </>}
    {snapshot.kind === 'softmax' && result.kind === 'softmax' && <>
      <p>Разрешённые scores превращаются в доли через <ConceptLink concept="exponential">экспоненту</ConceptLink>. Запрещённый ключ получает ровно 0.</p>
      <p className="snapshot-formula">T = {number(snapshot.temperature)}; максимум среди разрешённых scores = {number(result.maximum)}<br />eᵢ = exp((scoreᵢ − max) / T); pᵢ = eᵢ / Σe</p>
      <div className="snapshot-table" tabIndex={0} role="region" aria-label="Scores, маска и вероятности"><table className="data-table"><caption>Softmax для сохранённой строки</caption>
        <thead><tr><th scope="col">Ключ</th><th scope="col">Score до маски</th><th scope="col">Маска</th><th scope="col">(score − max) / T</th><th scope="col">Экспонента eᵢ</th><th scope="col">Доля pᵢ</th></tr></thead>
        <tbody>{snapshot.scores.map((score, index) => <tr key={index}><th scope="row">{index + 1}</th><td>{number(score)}</td><td>{result.allowed[index] ? 'Разрешён' : 'Запрещён'}</td><td>{result.shifted[index] === null ? 'Не участвует' : result.shifted[index] === -Infinity ? 'Ниже числового диапазона' : number(result.shifted[index]!)}</td><td>{number(result.exponentials[index])}</td><td>{number(result.probabilities[index])}</td></tr>)}</tbody>
      </table></div>
      <p className="snapshot-formula">Σe = {number(result.denominator)}<br />Сумма долей = <output>{number(result.probabilities.reduce((sum, value) => sum + value, 0))}</output></p>
      <p className="note">Маска хранится отдельно от scores: запрет не заменяет исходное число нулём. Очень малая экспонента может округлиться до 0 в арифметике браузера.</p>
    </>}
  </section>;
}
