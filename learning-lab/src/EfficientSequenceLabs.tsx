import { CoreTopicFilm } from './CoreTopicFilms';
import { useState } from 'react';
import { Chart, Range, fmt } from './ui';
import { Scene3D, type Vec3 } from './ThreeD';
import { useLearningActive } from './learning-context';
import { attentionFixture, fullAttentionReference, tiledAttention, mlaTrace, memoryTokens, selectiveSsm, memoryComparison } from './efficientSequenceMath';

const vec = (xs: number[]) => `[${xs.map(x => fmt(x, 4)).join('; ')}]`;
function Numbers({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return <div className="tc-table-scroll ae-table" role="region" tabIndex={0} aria-label={`${caption}. Прокручиваемая таблица`}><table className="data-table"><caption>{caption}</caption><thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((v, j) => j === 0 ? <th scope="row" key={j}>{v}</th> : <td key={j}>{v}</td>)}</tr>)}</tbody></table></div>;
}

export function LatentAttentionLab() {
  const [n, setN] = useState(6), [position, setPosition] = useState(5), [scale, setScale] = useState(1);
  const result = mlaTrace(n, position, scale);
  const error = Math.max(...result.heads.flatMap(h => h.output.map((x, i) => Math.abs(x - h.absorbedOutput[i]))));
  return <CoreTopicFilm slug="mla" current={{ n, position, scale }} example={{ n: 6, position: 5, scale: 1 }} restore={value => { setN(value.n);setPosition(value.position);setScale(value.scale); }}><section className="panel" aria-label="Лаборатория MLA"><h3>Один латентный код вместо отдельных K/V</h3>
    <p>Здесь две головы используют общий код c размерности 2 и отдельный RoPE-ключ размерности 2. Контентные K и V каждой головы восстанавливаются своими матрицами. Это заданная малая модель MLA KV, а не попытка без потерь сжать произвольные веса MHA.</p>
    <div className="ae-controls"><Range label="Длина последовательности MLA" value={n} min={2} max={12} step={1} onChange={value => { setN(value); setPosition(Math.min(position, value - 1)); }} /><Range label="Позиция запроса MLA" value={position} min={0} max={n - 1} step={1} onChange={setPosition} /><Range label="Масштаб латентного кода" value={scale} min={0} max={2} step={.1} onChange={setScale} /></div>
    <ol className="ae-flow" aria-label="Путь MLA"><li>x: 3 числа</li><li>c = {fmt(scale)}·xW_down: 2</li><li>общий кэш: c + kᴿ</li><li>голова: K=cUᴷ, V=cUⱽ</li></ol>
    <p className="formula">scoreᵢⱼ = (qᶜᵢ·kᶜⱼ + qᴿᵢ·kᴿⱼ) / √4; j ≤ i.</p>
    <p aria-live="polite">Кэш до позиции {position}: <strong>{result.cache.latentScalars} чисел</strong> вместо {result.cache.expandedScalars} в развёрнутом представлении двух голов. При float32 это {4 * result.cache.latentScalars} и {4 * result.cache.expandedScalars} байт.</p>
    <p className="note">Считаются только сохранённые представления токенов: 2+2 числа против 2 голов × (2 контентных K + 2 позиционных K + 2 V). Это модель хранения, не измерение памяти JavaScript; веса проекций и временные массивы не включены.</p>
    <Numbers caption="Общий кэш и восстановление первой головы" columns={['Позиция', 'Латент c', 'RoPE kᴿ', 'Kᶜ головы 1', 'V головы 1']} rows={result.latent.slice(0, position + 1).map((c, i) => [i, vec(c), vec(result.ropeKeys[i]), vec(result.heads[0].keys[i]), vec(result.heads[0].values[i])])} />
    <Chart xLabel="Позиция ключа j" yLabel="Вес attention" yDomain={[0, 1]} series={result.heads.map((h, i) => ({ name: `Голова ${i + 1}`, points: h.weights.map((y, x) => ({ x, y })) }))} />
    <h4>Можно считать прямо в латентном пространстве</h4><p>В контентном скалярном произведении q·(cUᴷ) заменяем запрос на q(Uᴷ)ᵀ. Сначала смешиваем c, затем применяем Uⱽ один раз. RoPE-слагаемое остаётся отдельным.</p>
    <Numbers caption="Два эквивалентных расчёта этой модели" columns={['Голова', 'Восстановить все V, затем смешать', 'Смешать c, затем Uⱽ']} rows={result.heads.map((h, i) => [i + 1, vec(h.output), vec(h.absorbedOutput)])} />
    <p className="formula">Максимальное |Δ| = {error.toExponential(2)}.</p><p>Показано ядро KV-compression и decoupled RoPE. Query-compression, полная сеть DeepSeek и её обучение здесь не воспроизводятся.</p>
    <a href="https://arxiv.org/abs/2405.04434">DeepSeek-V2: описание MLA</a>
  </section></CoreTopicFilm>;
}

export function OnlineAttentionLab() {
  const [n, setN] = useState(8), [block, setBlock] = useState(3), [sharpness, setSharpness] = useState(3), [causal, setCausal] = useState(true), [row, setRow] = useState(7), [tile, setTile] = useState(0);
  const { q, k, v } = attentionFixture(n, sharpness), full = fullAttentionReference(q, k, v, causal), online = tiledAttention(q, k, v, block, causal, row);
  const index = Math.min(tile, online.trace.length - 1), selected = online.trace[index];
  const maxError = Math.max(...full.output.flatMap((r, i) => r.map((x, j) => Math.abs(x - online.output[i][j]))));
  return <CoreTopicFilm slug="exactsoftmax" current={{ n, block, sharpness, causal, row, tile }} example={{ n: 8, block: 3, sharpness: 3, causal: true, row: 7, tile: 0 }} restore={value => { setN(value.n);setBlock(value.block);setSharpness(value.sharpness);setCausal(value.causal);setRow(value.row);setTile(value.tile); }}><section className="panel" aria-label="Лаборатория блочного внимания"><h3>Точный softmax по частям</h3><p>Одна и та же строка Q обходит K/V плитками. Если новая плитка увеличивает максимум m, накопленные сумму l и вектор z пересчитываем в новой шкале. Поэтому ответ совпадает с полным attention, хотя вся матрица scores не нужна.</p>
    <div className="ae-controls"><Range label="Число токенов attention" value={n} min={2} max={24} step={1} onChange={value => { setN(value); setRow(Math.min(row, value - 1)); setTile(0); }} /><Range label="Размер плитки K/V" value={block} min={1} max={8} step={1} onChange={value => { setBlock(value); setTile(0); }} /><Range label="Масштаб запроса Q" value={sharpness} min={0} max={100} step={1} onChange={setSharpness} /><Range label="Строка запроса i" value={row} min={0} max={n - 1} step={1} onChange={value => { setRow(value); setTile(0); }} /></div>
    <label className="ae-causal"><input type="checkbox" checked={causal} onChange={e => { setCausal(e.target.checked); setTile(0); }} /> Causal-маска j ≤ i</label>
    <div className="ae-tiles" aria-label="Плитки ключей">{online.trace.map((t, i) => <button key={i} aria-pressed={index === i} onClick={() => setTile(i)}>K{t.start}…K{t.end - 1}</button>)}</div>
    <div className="button-row"><button disabled={index === 0} onClick={() => setTile(index - 1)}>← Плитка</button><button disabled={index === online.trace.length - 1} onClick={() => setTile(index + 1)}>Следующая плитка →</button></div>
    <p className="formula">m′ = max(m, max(scores)); r = exp(m−m′)<br />l′ = r·l + Σ exp(score−m′)<br />z′ = r·z + Σ exp(score−m′)V; output = z′/l′.</p>
    <Numbers caption={`Состояние после плитки ${index + 1} из ${online.trace.length}`} columns={['Величина', 'Значение']} rows={[
      ['scores новой плитки', vec(selected.scores)], ['Новый максимум m', fmt(selected.max, 6)], ['Множитель старой суммы r', fmt(selected.rescale, 6)], ['Нормировка l', fmt(selected.normalizer, 6)], ['Аккумулятор z', vec(selected.accumulator)], ['Ответ по обработанному префиксу', vec(selected.output)], ['Итог полного прохода', vec(full.output[row])],
    ]} />
    <p aria-live="polite">После всех плиток: максимальное |полный − блочный| по всем строкам = <strong>{maxError.toExponential(2)}</strong>.</p>
    <Numbers caption="Идеальная рабочая память: количество скаляров" columns={['Расчёт', 'Хранение']} rows={[
      ['Полная матрица scores N×N', online.storage.fullScores], ['Online, одна строка: плитка + z + m,l', online.storage.online],
    ]} />
    <p className="note">Q/K/V и выход не включены в обе оценки. Показан kernel для одной строки Q; матрица probabilities может переиспользовать scores. Учебный интерфейс дополнительно хранит снимки плиток. Это не замер JS heap, времени или GPU FlashAttention.</p>
    <details><summary>Q/K/V выбранного опыта</summary><Numbers caption="Исходные векторы" columns={['t', 'Q', 'K', 'V']} rows={q.map((x, i) => [i, vec(x), vec(k[i]), vec(v[i])])} /></details>
    <a href="https://arxiv.org/abs/2205.14135">FlashAttention: online softmax и блочные вычисления</a>
  </section></CoreTopicFilm>;
}

export function StateSpaceLab() {
  const active = useLearningActive();
  const [pattern, setPattern] = useState<'impulse' | 'rewrite' | 'alternating'>('impulse'), [delta, setDelta] = useState(.5), [selectivity, setSelectivity] = useState(0), [retention, setRetention] = useState(.8), [beta, setBeta] = useState(.7), [time, setTime] = useState(7), [space, setSpace] = useState(false);
  const tokens = memoryTokens(pattern), ssm = selectiveSsm(tokens, delta, selectivity), memories = memoryComparison(tokens, retention, beta, selectivity), at = memories[time];
  const limit = Math.max(.5, ...ssm.flatMap(s => s.state.map(Math.abs))) * 1.1;
  return <CoreTopicFilm slug="ssm" current={{ pattern, delta, selectivity, retention, beta, time, space }} example={{ pattern: 'impulse', delta: .5, selectivity: 0, retention: .8, beta: .7, time: 7, space: space }} restore={value => { setPattern(value.pattern);setDelta(value.delta);setSelectivity(value.selectivity);setRetention(value.retention);setBeta(value.beta);setTime(value.time);setSpace(value.space); }}><section className="panel" aria-label="Лаборатория SSM и DeltaNet"><h3>Состояние: затухание, запись и адресная замена</h3>
    <label>Входной сигнал<select value={pattern} onChange={e => setPattern(e.target.value as typeof pattern)}><option value="impulse">Импульс и затухание</option><option value="rewrite">Перезапись одного ключа</option><option value="alternating">Чередование знака</option></select></label>
    <div className="ae-controls"><Range label="Шаг дискретизации Δ" value={delta} min={.05} max={2} step={.05} onChange={setDelta} /><Range label="Зависимость параметров от входа" value={selectivity} min={0} max={2} step={.1} onChange={setSelectivity} /><Range label="Базовое сохранение памяти α" value={retention} min={0} max={1} step={.05} onChange={setRetention} /><Range label="Сила адресной записи β" value={beta} min={0} max={1} step={.05} onChange={setBeta} /><Range label="Выбранный шаг t" value={time} min={0} max={7} step={1} onChange={setTime} /></div>
    <h4>1. Непрерывная SSM → точная дискретизация</h4><p className="formula">dh/dt = Ah + Bx; A = diag(−0.3, −0.8, −1.4)<br />Ā = exp(ΔA); запись = (exp(ΔA)−1)A⁻¹Bx; hₜ = Āhₜ₋₁ + запись; yₜ = Cₜhₜ.</p>
    <p>При нулевой зависимости это линейная SSM. При ненулевой Δₜ, Bₜ, Cₜ зависят от xₜ: Δₜ=Δ·exp(s·xₜ), Bₜ=[1; .5; −.4](1+.25s·xₜ), Cₜ=[1; −.5; .7](1+.2s·xₜ). Это малое селективное ядро; convolution, gates, расширение каналов и полный блок Mamba здесь не добавлены.</p>
    <Chart xLabel="Шаг t" yLabel="Значение состояния" series={[0, 1, 2].map(j => ({ name: `h${j}`, points: ssm.map((s, x) => ({ x, y: s.state[j] })) }))} />
    <button aria-expanded={space} onClick={() => setSpace(!space)}>{space ? 'Скрыть' : 'Показать'} 3D состояния</button>
    {space && active && <Scene3D title="Три настоящих компоненты состояния SSM" description="Оси h0, h1, h2. Линия соединяет состояния по времени; время не является координатой." axes={[0, 1, 2].map(j => ({ label: `Состояние h${j}`, min: -limit, max: limit })) as [{ label: string; min: number; max: number }, { label: string; min: number; max: number }, { label: string; min: number; max: number }]} lines={[{ name: 'Траектория h', points: [[0, 0, 0], ...ssm.map(s => s.state as unknown as Vec3)] }]} points={[{ name: `t=${time}`, position: ssm[time].state as unknown as Vec3, shape: 'triangle' }]} />}
    <Numbers caption="Численная альтернатива: состояния SSM" columns={['t', 'x', 'Δₜ', 'Ā', 'hₜ', 'yₜ']} rows={ssm.map((s, i) => [i, s.input, fmt(s.delta, 4), vec(s.decay), vec(s.state), fmt(s.output, 4)])} />
    <h4>2. Mamba-2 / SSD: скалярное затухание матричной памяти</h4><p className="formula">Sₜ = αₜSₜ₋₁ + vₜkₜᵀ; oₜ = Sₜqₜ.</p><p>Это рекуррентное ядро с общей для состояния αₜ=α^(exp(s·|xₜ|)), связанное с SSD/Mamba-2. В примере q=k — один из трёх единичных ключей; v=[x; .5x; −.25x]. Добавление одного и того же ключа накапливает значения.</p>
    <h4>3. Gated DeltaNet: сначала забыть, затем исправить запись</h4><p className="formula">S̄ = αₜSₜ₋₁; e = vₜ − S̄kₜ;<br />Sₜ = S̄ + β·e·kₜᵀ; oₜ=Sₜqₜ.</p><p>α стирает всю память; β меняет значение по выбранному единичному ключу. При α=β=1 новая запись точно заменяет прежнюю по этому ключу, сохраняя ортогональные ключи. Сравните режим «Перезапись одного ключа».</p>
    <Chart xLabel="Шаг t" yLabel="Выход, компонент 0" series={[
      { name: 'SSD-ядро', points: memories.map((s, x) => ({ x, y: s.ssd.output[0] })) },
      { name: 'Gated delta', points: memories.map((s, x) => ({ x, y: s.delta.output[0] })) },
      { name: 'Causal attention', points: memories.map((s, x) => ({ x, y: s.attention[0] })) },
      { name: 'Гибрид ½ delta + ½ attention', points: memories.map((s, x) => ({ x, y: s.hybrid[0] })), dashed: true },
    ]} />
    <Numbers caption={`Адресная запись на шаге ${time}`} columns={['Величина', 'Значение']} rows={[
      ['k=q', vec(tokens[time].key)], ['Цель v', vec(tokens[time].value)], ['αₜ', fmt(at.alpha, 4)], ['Старая запись после затухания', vec(at.delta.oldValue)], ['Ошибка записи e', vec(at.delta.error)], ['SSD: выход', vec(at.ssd.output)], ['Delta: выход', vec(at.delta.output)], ['Attention: выход', vec(at.attention)], ['Гибрид: выход', vec(at.hybrid)],
    ]} />
    <Numbers caption="S после gated delta: строки — компоненты значения, столбцы — ключевые координаты" columns={['Компонента v', 'k₀', 'k₁', 'k₂']} rows={at.delta.state.map((r, i) => [i, ...r.map(x => fmt(x, 4))])} />
    <p className="note">У attention softmax(QKᵀ/√3), у рекуррентных ядер такой нормировки нет: масштабы выходов могут различаться. Гибрид — явно заданная учебная смесь выходов, не воспроизведение слоёв Qwen3-Next. Здесь нет обучения полных Mamba-2/Gated DeltaNet и замеров скорости.</p>
    <p><a href="https://arxiv.org/abs/2405.21060">Mamba-2 / SSD</a> · <a href="https://arxiv.org/abs/2412.06464">Gated Delta Networks</a> · <a href="https://qwen.ai/blog?id=qwen3-next">Пример промышленного гибрида Qwen3-Next</a></p>
  </section></CoreTopicFilm>;
}
