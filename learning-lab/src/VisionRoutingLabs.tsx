import { CoreTopicFilm } from './CoreTopicFilms';
import { useState } from 'react';
import { Exercise, Range, fmt } from './ui';
import { VISION_IMAGE, PATCH_PROJECTION, VISION_Q, VISION_K, VISION_V, visionTransformerTrace, MOE_INPUT, ROUTER_WEIGHTS, EXPERTS, mixtureExpertsTrace, IMAGE_NOISE, UNET_KERNEL, DIT_READOUT, imageDenoiserTrace } from './visionRoutingMath';
import './vision-routing-labs.css';

type Grid = number[][];
const copy = (grid: Grid) => grid.map(row => [...row]);
function NumericGrid({ values, label, selected, marked, onSelect, columns }: {
  values: Grid; label: string; selected?: number; marked?: (r: number, c: number) => boolean; onSelect?: (index: number) => void; columns?: string[];
}) {
  return <div className="vr-table-scroll" tabIndex={0} role="region" aria-label={`${label}. Численная таблица`}>
    <table className="data-table vr-matrix"><caption>{label}</caption>
      <thead><tr><th scope="col">r / c</th>{values[0].map((_, c) => <th key={c} scope="col">{columns?.[c] ?? c + 1}</th>)}</tr></thead>
      <tbody>{values.map((row, r) => <tr key={r}><th scope="row">{r + 1}</th>{row.map((value, c) => {
        const index = r * row.length + c, inPatch = marked?.(r, c);
        return <td key={c} className={inPatch ? 'vr-marked' : undefined}>{onSelect
          ? <button type="button" aria-pressed={selected === index} aria-label={`${label}, строка ${r + 1}, столбец ${c + 1}, значение ${fmt(value, 4)}${inPatch ? ', выбранный патч' : ''}`} onClick={() => onSelect(index)}>{fmt(value)}</button>
          : <>{fmt(value)}{inPatch && ' ◂'}</>}</td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}
function PixelEditor({ image, onChange, label, marked, min = -1, max = 1 }: { image: Grid; onChange: (image: Grid) => void; label: string; marked?: (r: number, c: number) => boolean; min?: number; max?: number }) {
  const [selected, setSelected] = useState(0);
  const row = Math.floor(selected / 4), column = selected % 4;
  return <div><NumericGrid values={image} label={label} selected={selected} marked={marked} onSelect={setSelected} />
    <Range label={`${label}: пиксель (${row + 1}, ${column + 1})`} value={image[row][column]} min={min} max={max} step={.1} onChange={value => {
      const next = copy(image); next[row][column] = value; onChange(next);
    }} />
  </div>;
}

export function VisionTransformerLab() {
  const [image, setImage] = useState(() => copy(VISION_IMAGE)), [patch, setPatch] = useState(0), [position, setPosition] = useState(1);
  const trace = visionTransformerTrace(image, position), selected = trace.patches[patch];
  const marked = (r: number, c: number) => r >= selected.row && r < selected.row + 2 && c >= selected.column && c < selected.column + 2;
  return <CoreTopicFilm slug="vit" current={{ image, patch, position }} example={{ image: copy(VISION_IMAGE), patch: 0, position: 1 }} restore={value => { setImage(value.image);setPatch(value.patch);setPosition(value.position); }}><section className="vision-routing-lab" aria-label="Лаборатория Vision Transformer">
    <div className="lesson-intro"><span className="eyebrow">ViT · изображение становится последовательностью</span><h3>От пикселей к вниманию между патчами</h3>
      <p>Изображение 4 × 4 делится на четыре патча 2 × 2. Каждый проходит одну и ту же проекцию 4 → 2; затем добавляется позиция и считается одна голова внимания.</p>
      <p>Это ручной прямой проход мини-блока: без обучения, классификатора, CLS-токена и полного стека ViT. Числа показывают смешивание признаков; распознавание объектов здесь не обучено.</p></div>
    <div className="lab-grid"><div className="panel"><h4>1. Измени пиксель и выбери патч</h4>
      <PixelEditor image={image} onChange={setImage} label="Входные пиксели" marked={marked} min={0} max={1} />
      <div className="button-row">{trace.patches.map((item, i) => <button type="button" key={i} aria-pressed={patch === i} onClick={() => setPatch(i)}>Патч {i + 1} · ({item.row + 1}, {item.column + 1})</button>)}</div>
      <p>Подсвечены четыре исходных пикселя выбранного патча. Порядок в векторе: слева направо, сверху вниз.</p>
      <Range label="Масштаб позиционного признака" value={position} min={0} max={2} step={.1} onChange={setPosition} />
      <button type="button" onClick={() => { setImage(copy(VISION_IMAGE)); setPosition(1); setPatch(0); }}>Сбросить ViT</button>
    </div><div className="panel"><h4>2. Общая проекция и позиция</h4>
      <NumericGrid values={trace.flattened} label="P: четыре патча × четыре пикселя" />
      <NumericGrid values={PATCH_PROJECTION} label="Wpatch: 4 × 2, одинаковая для всех патчей" />
      <NumericGrid values={trace.projected} label="E = P Wpatch: 4 × 2" />
      <NumericGrid values={trace.positions} label="Два позиционных признака патча" />
      <NumericGrid values={trace.tokens} label="X = E + позиция: 4 × 2" />
    </div></div>
    <div className="panel"><h4>3. Реальные Q, K, V и attention</h4>
      <p className="formula">Q = X Wq; K = X Wk; V = X Wv; A = softmax(QKᵀ / √2); Y = X + AV.</p>
      <div className="vr-grids"><NumericGrid values={trace.attention.q} label="Q: 4 × 2" /><NumericGrid values={trace.attention.k} label="K: 4 × 2" /><NumericGrid values={trace.attention.v} label="V: 4 × 2" /><NumericGrid values={trace.attention.scaledScores} label="QKᵀ / √2: 4 × 4" /><NumericGrid values={trace.attention.weights} label="A: query-патч → key-патч" marked={r => r === patch} /><NumericGrid values={trace.output} label="Y = X + AV: 4 × 2" /></div>
      <p role="status">Патч {patch + 1} читает патчи 1…4 с весами [{trace.attention.weights[patch].map(value => fmt(value, 4)).join('; ')}]. Сумма = {fmt(trace.attention.weights[patch].reduce((a, b) => a + b, 0), 6)}. Средний выход двух признаков: [{trace.pooled.map(value => fmt(value)).join('; ')}].</p>
      <p>Вес внимания описывает этот расчёт смешивания. Он сам по себе не доказывает причинную важность пикселей. Чтобы проверить изменение выхода, измените вход и сравните числа Y.</p>
      <details><summary>Фиксированные матрицы головы</summary><div className="vr-grids"><NumericGrid values={VISION_Q} label="Wq" /><NumericGrid values={VISION_K} label="Wk" /><NumericGrid values={VISION_V} label="Wv" /></div></details>
    </div>
    <Exercise question="Если поменять один пиксель, что меняется сначала?" options={['Вектор одного патча и его проекция', 'Только позиционный признак', 'Все исходные патчи сразу']} correct={0} explanation="Патчи не пересекаются. Далее через attention изменение одного токена может попасть в выход остальных." />
  </section></CoreTopicFilm>;
}

export function MixtureExpertsLab() {
  const [inputs, setInputs] = useState(() => copy(MOE_INPUT)), [selected, setSelected] = useState(0), [topK, setTopK] = useState<1 | 2>(2), [capacity, setCapacity] = useState(4), [bias, setBias] = useState(0);
  const trace = mixtureExpertsTrace(inputs, topK, capacity, [bias, 0, 0]), token = trace.tokens[selected];
  const requested = trace.requestedLoads.reduce((a, b) => a + b, 0), accepted = trace.loads.reduce((a, b) => a + b, 0);
  return <CoreTopicFilm slug="moe" current={{ inputs, selected, topK, capacity, bias }} example={{ inputs: copy(MOE_INPUT), selected: 0, topK: 2, capacity: 4, bias: 0 }} restore={value => { setInputs(value.inputs);setSelected(value.selected);setTopK(value.topK);setCapacity(value.capacity);setBias(value.bias); }}><section className="vision-routing-lab" aria-label="Лаборатория Mixture of Experts">
    <div className="lesson-intro"><span className="eyebrow">MoE · разреженный FFN</span><h3>Роутер выбирает, какие эксперты считать</h3>
      <p>Четыре токена с двумя признаками идут в роутер 2 → 3. У каждого из трёх экспертов свой FFN 2 → 3 → 2 с ReLU. Меняйте признаки и смотрите, как меняются scores, маршруты и итоговая взвешенная сумма.</p>
      <p>Ручные веса не обучены специализациям. Название «эксперт» здесь означает отдельную сеть, а не подтверждённую компетенцию.</p></div>
    <div className="lab-grid"><div className="panel"><h4>Вход и маршрутизация</h4>
      <NumericGrid values={inputs} label="Признаки токенов" columns={['x₁', 'x₂']} marked={r => r === selected} />
      <div className="button-row">{inputs.map((_, i) => <button type="button" key={i} aria-pressed={selected === i} onClick={() => setSelected(i)}>Токен {i + 1}</button>)}</div>
      {[0, 1].map(d => <Range key={d} label={`Токен ${selected + 1}: x${d + 1}`} value={inputs[selected][d]} min={-2} max={2} step={.1} onChange={value => { const next = copy(inputs); next[selected][d] = value; setInputs(next); }} />)}
      <div className="button-row">{([1, 2] as const).map(k => <button type="button" key={k} aria-pressed={topK === k} onClick={() => setTopK(k)}>Top-{k}</button>)}</div>
      <Range label="Capacity каждого эксперта: число назначений" value={capacity} min={0} max={4} step={1} onChange={setCapacity} />
      <Range label="Bias роутера для эксперта 1" value={bias} min={-2} max={2} step={.1} onChange={setBias} />
      <button type="button" onClick={() => { setInputs(copy(MOE_INPUT)); setTopK(2); setCapacity(4); setBias(0); setSelected(0); }}>Сбросить MoE</button>
    </div><div className="panel"><h4>Scores → softmax → top-k</h4>
      <p className="formula">s = x Wrouter + b; p = softmax(s). Выбор по score; при равенстве побеждает меньший номер эксперта.</p>
      <NumericGrid values={ROUTER_WEIGHTS} label="Wrouter: 2 × 3" />
      <NumericGrid values={trace.scores} label="Scores токенов для экспертов 1…3" marked={r => r === selected} />
      <NumericGrid values={trace.probabilities} label="Вероятности softmax для экспертов 1…3" marked={r => r === selected} />
      <NumericGrid values={[trace.requestedLoads, trace.loads]} label="Загрузка: строка 1 — запрошено, строка 2 — принято" columns={['Э1', 'Э2', 'Э3']} />
      <p role="status">Принято {accepted} из {requested} назначений; отброшено {requested - accepted}. Capacity ограничивает нагрузку в этом батче из четырёх токенов.</p>
    </div></div>
    <div className="panel"><h4>Выбранный токен {selected + 1}: фактические вычисления</h4>
      <p>Токены обрабатываются в порядке 1 → 4. Каждый выбранный маршрут занимает одно место у эксперта. При переполнении маршрут отбрасывается без перенаправления. Вероятности сначала нормируются на top-k, затем заново на принятые маршруты.</p>
      <div className="vr-table-scroll" tabIndex={0} role="region" aria-label="Маршруты выбранного токена"><table className="data-table"><caption>Σ вес × выход FFN</caption><thead><tr><th scope="col">Эксперт</th><th scope="col">Top-k вес</th><th scope="col">Принят?</th><th scope="col">Вес после capacity</th><th scope="col">Выход FFN</th></tr></thead><tbody>{token.routes.map(route => <tr key={route.expert}><th scope="row">{route.expert + 1}</th><td>{fmt(route.selectedWeight, 4)}</td><td>{route.accepted ? 'Да' : 'Переполнение'}</td><td>{fmt(route.weight, 4)}</td><td>{route.computation ? `[${route.computation.output.map(value => fmt(value)).join('; ')}]` : 'Не вычислялся'}</td></tr>)}</tbody></table></div>
      <p role="status">Выход MoE: [{token.output.map(value => fmt(value, 4)).join('; ')}]. {token.fullyDropped ? 'Все маршруты отброшены: вклад MoE равен нулю; residual в этом эксперименте не добавляется.' : `Сумма принятых весов = ${fmt(token.routes.reduce((sum, route) => sum + route.weight, 0), 6)}.`}</p>
      <p>Всего параметров: {trace.totalParameters} = роутер {trace.routerParameters} + 3 × FFN {trace.expertParameters}. Для этого токена реально использовано {token.activeParameters}: роутер 9 + {token.routes.filter(route => route.accepted).length} × 17. При свободной capacity top-1 использует 26, top-2 — 43; это число коэффициентов, не измерение скорости или памяти.</p>
      <NumericGrid values={trace.tokens.map(item => item.output)} label="Выходы всех четырёх токенов" />
      <details><summary>Просмотреть веса и скрытые активации экспертов</summary>{EXPERTS.map((expert, i) => {
        const route = token.routes.find(item => item.expert === i);
        return <div key={i}><h4>Эксперт {i + 1}</h4><div className="vr-grids"><NumericGrid values={expert.first} label={`Э${i + 1}: W₁`} /><NumericGrid values={[expert.hiddenBias]} label={`Э${i + 1}: b₁`} /><NumericGrid values={expert.second} label={`Э${i + 1}: W₂`} /><NumericGrid values={[expert.outputBias]} label={`Э${i + 1}: b₂`} /></div>{route?.computation && <NumericGrid values={[route.computation.preactivation, route.computation.hidden]} label={`Э${i + 1}: до ReLU / после ReLU`} />}</div>;
      })}</details>
    </div>
    <Exercise question="Top-2 и capacity = 0. Каков вклад MoE?" options={['Нулевой вектор', 'Средний выход всех трёх экспертов', 'Выход самого вероятного эксперта']} correct={0} explanation="Оба назначения отброшены. В этом примере нет запасного эксперта или residual-пути; правило переполнения задано явно." />
  </section></CoreTopicFilm>;
}

export function ImageDenoiserLab() {
  const [clean, setClean] = useState(() => copy(VISION_IMAGE)), [noise, setNoise] = useState(() => copy(IMAGE_NOISE)), [time, setTime] = useState(.6), [skip, setSkip] = useState(true);
  const trace = imageDenoiserTrace(clean, noise, time, skip);
  return <CoreTopicFilm slug="unetdit" current={{ clean, noise, time, skip }} example={{ clean: copy(VISION_IMAGE), noise: copy(IMAGE_NOISE), time: .6, skip: true }} restore={value => { setClean(value.clean);setNoise(value.noise);setTime(value.time);setSkip(value.skip); }}><section className="vision-routing-lab" aria-label="Лаборатория U-Net и DiT">
    <div className="lesson-intro"><span className="eyebrow">U-Net → DiT · два предиктора шума</span><h3>Одинаковые xₜ и t, разные пути вычисления ε̂</h3>
      <p>U-Net уменьшает и восстанавливает пространственное разрешение, передавая skip-признаки. DiT превращает картинку в патчи и смешивает их вниманием. Оба получают зашумлённое изображение и время.</p>
      <p>Это ограниченные модели с ручными весами, без обучения и без заявления о генерации изображений. MSE измеряет ошибку текущего предсказания ε̂ относительно известного шума ε, а не качество обученного U-Net или DiT.</p></div>
    <div className="panel"><h4>Построй задачу предсказания шума</h4>
      <Range label="Время шума t" value={time} min={.05} max={1} step={.05} onChange={setTime} />
      <p className="formula">ᾱ(t) = 1 − 0,85t = {fmt(trace.alphaBar, 4)}; xₜ = √ᾱ x₀ + √(1 − ᾱ) ε.</p>
      <div className="vr-grids"><PixelEditor image={clean} onChange={setClean} label="Чистое изображение x₀" min={0} max={1} /><PixelEditor image={noise} onChange={setNoise} label="Известный шум ε: цель" /><NumericGrid values={trace.noisy} label="Общий вход xₜ: 4 × 4" /></div>
      <p>Клик или Enter на пикселе выбирает его; ползунок и точное числовое поле меняют значение. Для изоляции роли t промежуточные формулы ниже показывают его прямой вклад в оба предиктора.</p>
      <button type="button" onClick={() => { setClean(copy(VISION_IMAGE)); setNoise(copy(IMAGE_NOISE)); setTime(.6); setSkip(true); }}>Сбросить U-Net / DiT</button>
    </div>
    <div className="lab-grid"><div className="panel"><h4>U-Net: карта → пирамида → карта</h4>
      <p className="formula">4 × 4 → pool 2 × 2 → pool 1 × 1 → up 2 × 2 → up 4 × 4.</p>
      <p>Encoder: свёртка 3 × 3 с нулевым дополнением, tanh(conv + 0,1t), average pooling. Bottleneck: tanh(0,8·down₁ + 0,15t).</p>
      <button type="button" aria-pressed={skip} onClick={() => setSkip(!skip)}>{skip ? 'Skip-пути включены' : 'Skip-пути выключены'}</button>
      <p>После nearest upsample два канала [up, skip] конкатенируются. Decoder 2 × 2: tanh(0,6up + 0,4skip + 0,1t); decoder 4 × 4: tanh(0,5up + 0,5skip + 0,05t). Readout: ε̂ = 0,6·decoder. Выключение skip обнуляет второй канал обоих concat.</p>
      <div className="vr-grids"><NumericGrid values={trace.unet.encoder4} label="Encoder 4 × 4: skip высокого разрешения" /><NumericGrid values={trace.unet.down2} label="Average pool: 2 × 2" /><NumericGrid values={trace.unet.encoder2} label="Encoder 2 × 2: второй skip" /><NumericGrid values={trace.unet.bottleneck} label="Bottleneck 1 × 1" /></div>
      <details><summary>Посмотреть upsample, concat и decoder</summary><div className="vr-grids"><NumericGrid values={UNET_KERNEL} label="Общее ядро encoder 3 × 3" /><NumericGrid values={trace.unet.down1} label="Average pool: 1 × 1" /><NumericGrid values={trace.unet.up2} label="Upsample 1 → 2" /><NumericGrid values={trace.unet.concat2.flat()} label="Concat 2 × 2: четыре позиции × [up, skip]" columns={['up', 'skip']} /><NumericGrid values={trace.unet.decoder2} label="Decoder 2 × 2" /><NumericGrid values={trace.unet.up4} label="Upsample 2 → 4" /><NumericGrid values={trace.unet.concat4.flat()} label="Concat 4 × 4: 16 позиций × [up, skip]" columns={['up', 'skip']} /><NumericGrid values={trace.unet.decoder4} label="Decoder 4 × 4" /></div></details>
    </div><div className="panel"><h4>DiT: патчи + время → attention → патчи ε̂</h4>
      <p>Общая проекция 4 → 2 и позиция как в ViT выше. Время: e(t) = [sin(πt/2), cos(πt/2) − 1] = [{trace.dit.timeEmbedding.map(value => fmt(value, 4)).join('; ')}]. Xcond = Xpatch + position + 0,4e(t).</p>
      <p>Далее та же немаскированная голова Q/K/V; residual + маленький FFN с tanh. Readout 2 → 4 предсказывает четыре пикселя шума каждого патча. Патчи укладываются обратно на позиции 4 × 4.</p>
      <p>Это миниатюрный DiT-подобный блок с аддитивным временем; в статье DiT применяется более развитое условное управление блоками, включая adaLN.</p>
      <div className="vr-grids"><NumericGrid values={trace.dit.conditioned} label="Xcond: четыре патча × два признака" /><NumericGrid values={trace.dit.attention.weights} label="Attention между патчами: 4 × 4" /><NumericGrid values={trace.dit.patchPredictions} label="Readout: четыре патча × четыре ε̂" /></div>
      <details><summary>Посмотреть матрицы DiT и FFN</summary><div className="vr-grids"><NumericGrid values={PATCH_PROJECTION} label="Wpatch" /><NumericGrid values={trace.dit.projected} label="Проекция входных патчей" /><NumericGrid values={trace.dit.positions} label="Позиции" /><NumericGrid values={VISION_Q} label="Wq" /><NumericGrid values={VISION_K} label="Wk" /><NumericGrid values={VISION_V} label="Wv" /><NumericGrid values={trace.dit.attention.q} label="Q" /><NumericGrid values={trace.dit.attention.k} label="K" /><NumericGrid values={trace.dit.attention.v} label="V" /><NumericGrid values={trace.dit.residual} label="Residual: Xcond + AV" /><NumericGrid values={[[1, 0, .5], [0, 1, -.5]]} label="FFN W₁: 2 × 3" /><NumericGrid values={trace.dit.hidden} label="FFN hidden после tanh" /><NumericGrid values={[[.2, 0], [0, .2], [.1, -.1]]} label="FFN W₂: 3 × 2" /><NumericGrid values={trace.dit.ffn} label="Выход FFN" /><NumericGrid values={trace.dit.outputTokens} label="После residual FFN" /><NumericGrid values={DIT_READOUT} label="Wreadout: 2 × 4" /></div></details>
    </div></div>
    <div className="panel"><h4>Сравни предсказание с известной целью</h4>
      <div className="vr-grids"><NumericGrid values={noise} label="Цель ε" /><NumericGrid values={trace.unet.prediction} label="U-Net: предсказание ε̂" /><NumericGrid values={trace.dit.prediction} label="DiT: предсказание ε̂" /></div>
      <p role="status">MSE U-Net: {fmt(trace.unetMse, 5)}. MSE DiT: {fmt(trace.ditMse, 5)}. MSE = Σ(ε̂ − ε)² / 16.</p>
      <details><summary>Одношаговая оценка чистой картинки x̂₀</summary><p className="formula">x̂₀ = (xₜ − √(1 − ᾱ) ε̂) / √ᾱ. Это алгебраическая оценка по ручному предиктору, без цикла генерации; значения не обрезаются до [0; 1].</p><div className="vr-grids"><NumericGrid values={trace.unetReconstruction} label="U-Net: оценка x̂₀" /><NumericGrid values={trace.ditReconstruction} label="DiT: оценка x̂₀" /></div></details>
    </div>
    <Exercise question="Что именно переносит skip-путь U-Net?" options={['Признаки encoder того же разрешения', 'Дополнительную пространственную ось времени', 'Готовую целевую картинку']} correct={0} explanation="Skip передаёт вычисленные признаки, здесь через concat двух каналов. Их коэффициенты decoder реально входят в предсказание; выключение пути меняет результат." />
  </section></CoreTopicFilm>;
}
