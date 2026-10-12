# Независимая математическая проверка inference labs

После review P3 теста self-comparison закрыт: изменяется собственный входной токен
позиции и проверяется неизменность её logits. Итоговый suite 331/331 PASS.
Исходное наблюдение ниже оставлено как история; финальная приёмка — README.md.

2026-10-12 15:10 MSK (12:10 UTC). Checkout `C:/Users/lomaster/.codex/worktrees/6209/rust_ml`; HEAD `035866823921e15656c87484f092d508dc194f6c`; проверены новые, ещё не закоммиченные файлы. Bundled Node v24.19.0. Проверяющий исходники не менял; browser/full build не выполнялись.

| Файл | SHA256 проверенной версии |
|---|---|
| `learning-lab/src/inferenceFrontierMath.ts` | `0C42A81BEB349125165B269144FA567EB4D4DE0EEF522B0FAA80AB7427107E50` |
| `learning-lab/src/InferenceFrontierLabs.tsx` | `45F3A65356C000E24872442D1F67C4BA2A65E1D52E4C72D826773448752152E2` |
| `learning-lab/tests/inferenceFrontierMath.test.ts` | `069316A624978F060748DE06B2BA883862283CB13C1677F63752E161FB5F62BD` |

Результат: **ошибок P1/P2 в проверенной математике и доступных UI-диапазонах не обнаружено**. Обычный `node --test tests/inferenceFrontierMath.test.ts` из `learning-lab` также проходит: 9/9, ≈0,56 с. Ниже — независимые пробы сверх этого набора.

## DPO

- Для 100 различных logits/reference/β независимо рассчитана цель из `log softmax`-вероятностей: среднее `log(1+exp(−β·[logπw−logπl−logπref,w+logπref,l]))`. Максимальное отличие от `dpoTrace`: `1.7763568394002505e−15`.
- Производная пары: `−β·sigmoid(−margin)` для preferred и противоположный знак для rejected, затем деление на число пар. Реализованное `exp(−softplus(margin))` равно `sigmoid(−margin)` и устойчиво к большим margin. Сумма производных logits нулевая.
- Reference не обновляется. KL вычислен как `Σπ(logπ−logπref)` через устойчивые log-softmax, а не log округлённых/обнулённых вероятностей.
- Повторение 10 000 SGD-шагов для всех трёх preferred и β∈{0,1;0,5;2} оставляет конечные loss/KL. UI верно объясняет, что β не задаёт жёсткий лимит KL на каждом шаге; согласие с метками не является проверкой истины.

## Квантизация и адаптер

- Проверены **240** комбинаций: bits∈{2,3,4,8}, scope∈{tensor,channel}, scheme∈{symmetric,affine}, outlier∈{0,2;4;8}, clip∈{0,2;0,4;1;4;8}. После 100 шагов адаптации — 0 неконечных результатов и 0 случаев, когда итоговая train MSE больше исходной.
- Per-channel действительно означает выходные строки W. Affine zero-point целый, обе схемы выполняют saturation и clipping до восстановленной матрицы. Симметричная схема явно показывает диапазон −qmax…qmax (один код двоичного контейнера не используется); это допустимая симметричная сетка.
- Поправка имеет форму `B(3×1) A(1×4)` и семь обучаемых параметров; база Ŵ не меняется. Цель — MSE реальных выходов Wx на шести входах, отдельные два входа используются для held-out проверки. Нет обещания, что rank 1 исправит всю ошибку.
- Оценка памяти относится к упакованным квантизованным весам и scale/zero-point. UI явно отделяет её от фактического JavaScript-хранения и не называет равномерную сетку NF4/полной QLoRA.

## Speculative decoding, включая блоки

- Для каждого принятого токена масса равна `q·min(1,p/q)=min(p,q)`; масса отказа восполняет `max(p−q,0)`. Нулевой support q корректно не порождает предложение этого токена.
- При первом отказе оставшиеся draft-токены отбрасываются; correction считается по текущему принятому префиксу. При полном принятии bonus берётся из target после последнего принятого токена.
- Независимый Monte Carlo: 70 000 цепочек длины пять на каждую комбинацию fidelity∈{0;0,4;1} и blockLength∈{1,3,5}; продолжение после короткого отказа запускало новый блок из фактического выходного префикса. Seeds блоков подавались из независимого воспроизводимого xorshift-потока. Всего 3 150 000 условных переходов.
- Максимальные абсолютные ошибки эмпирических условных вероятностей по девяти комбинациям: `0.002290, 0.002507, 0.002273, 0.002684, 0.001945, 0.002855, 0.003490, 0.002262, 0.003247`. Это статистическая проверка target-распределения, не доказательство ускорения. UI корректно не заявляет измеренный speedup и честно показывает последовательный учебный расчёт target.

## Long context

- Независимо построены 2×2 матрицы поворота R(0,1·position) и вычислен `R(query)q · R(key)k` для length∈{4,7,32}, всех положений target и обоих типов ключа. Максимальное отличие от RoPE score-content: `2.220446049250313e−16`; знак синусного distractor score верен.
- Позиция query равна length, позиции ключей 0…length−1. Маска `length−i≤window` действительно удаляет дальние ключи до softmax; закрытый target имеет вероятность 0 и бесконечную CE. Никакой выученный strength не возвращает удалённый путь.
- Повторение 10 000 шагов обучения для каждого механизма и trainLength∈{4,8} остаётся конечным. Сравнение длин ограничено одной retrieval-головой и конкретной частотой; UI не переносит наблюдение на все RoPE/ALiBi-модели. Он также отделяет argmax accuracy от уверенности.

## Masked objective и восстановление

- Цель независимо перечислена по четырём truth-строкам, 15 непустым маскам и каждой скрытой позиции: **128 CE-слагаемых**. Независимая loss `1.3852763451128145`, значение реализации полностью совпадает.
- Независимо проверено: изменение собственного видимого токена позиции между А/Б/В/Г не меняет её probability row (max diff 0), поскольку self-position не используется. Скрытый truth используется только как target CE, не как вход.
- При восстановлении выбираются только MASK-позиции. Несколько позиций получают ответы из одного старого контекста, а не из ранее заполненных внутри этого же шага позиций. Видимые подсказки сохраняются.
- После 100 шагов обучения greedy all-MASK при count=1 дал `[1,2,3,0]` за четыре шага; count=2 — тот же согласованный цикл за два; count=4 дал `[1,1,0,0]` за один шаг. Последний результат соответствует честному предупреждению UI о конфликте параллельных независимых предсказаний. Это denoising-опыт, не заявленная реализация continuous-time LLaDA objective.

## Неблокирующая рекомендация P3

В тесте `masked-denoiser gradient checks every coefficient without target leakage` сравнение `maskedPrediction(...)` с самим собой не проверяет leakage. Заменить эту строку проверкой неизменности output-row при изменении собственного токена; отдельно проверить, что изменение другого видимого токена может изменить эту строку. Математика сейчас проходит независимую такую проверку, поэтому это укрепление теста, а не обнаруженная утечка.

Комментарий `Uniform over the 15 nonempty masks and their masked positions` следует читать как равномерное усреднение всех `(mask, masked-position)` слагаемых; маски с большим числом скрытых позиций дают больше слагаемых. UI уже точно говорит «средняя CE по всем скрытым позициям». Если хочется устранить неоднозначность комментария, написать `Mean over all masked-position losses across the 15 nonempty masks`.

## Воспроизведение основных независимых проб

Код выполнялся stdin через bundled Node `--input-type=module`, рабочая папка `learning-lab`, без сохранения дополнительных исходников. Минимальная повторяемая часть:

```js
import { quantizeWeights, quantizationWeights, initialQuantAdapter,
  quantAdapterTrace, trainQuantAdapter, contextTrace, maskedPrediction,
  initialMaskedModel, speculativeBlock, SPEC_TARGET }
  from './src/inferenceFrontierMath.ts';
let cases=0, bad=0, increases=0;
for(const bits of [2,3,4,8]) for(const scope of ['tensor','channel'])
for(const scheme of ['symmetric','affine']) for(const outlier of [.2,4,8])
for(const clip of [.2,.4,1,4,8]) {
  const target=quantizationWeights(outlier);
  const base=quantizeWeights(target,bits,scope,clip,scheme).restored;
  const initial=initialQuantAdapter();
  const before=quantAdapterTrace(initial,target,base).loss;
  const trained=trainQuantAdapter(initial,target,base,100).parameters;
  const after=quantAdapterTrace(trained,target,base).loss;
  cases++; bad+=Number(!Number.isFinite(after)); increases+=Number(after>before+1e-9);
}
console.log({cases,bad,increases}); // 240, 0, 0
const rotate=([x,y],a)=>[x*Math.cos(a)-y*Math.sin(a),x*Math.sin(a)+y*Math.cos(a)];
let error=0;
for(const n of [4,7,32]) for(let d=1;d<=n;d++) {
  const tr=contextTrace(2.3,n,d,'rope',n), q=rotate([1,0],.1*n);
  tr.content.forEach((value,i)=>{
    const k=rotate(i===tr.target?[1,0]:[0,1],.1*i);
    error=Math.max(error,Math.abs(value-q[0]*k[0]-q[1]*k[1]));
  });
}
console.log({ropeError:error}); // floating-point rounding only
const params=initialMaskedModel();
for(let pos=0;pos<4;pos++) {
  const input=[0,1,2,3], before=maskedPrediction(params,input).probabilities[pos];
  for(let token=0;token<4;token++) {
    input[pos]=token;
    console.assert(before.every((v,i)=>v===maskedPrediction(params,input).probabilities[pos][i]));
  }
}
let state=12384971;
const uniform=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
for(const fidelity of [0,.4,1]) for(const length of [1,3,5]) {
  const counts=Array.from({length:4},()=>[0,0,0,0]);
  for(let run=0;run<70000;run++) {
    let previous=run%4, written=0;
    while(written<5) {
      const block=speculativeBlock(previous,length,fidelity,Math.floor(uniform()*4294967296));
      for(const token of block.output) {
        if(written===5) break;
        counts[previous][token]++; previous=token; written++;
      }
    }
  }
  const maxError=Math.max(...counts.flatMap((row,i)=>{
    const n=row.reduce((a,b)=>a+b,0);
    return row.map((c,j)=>Math.abs(c/n-SPEC_TARGET[i][j]));
  }));
  console.log({fidelity,length,maxError});
}
```

Последующие изменения этих файлов требуют повторить затронутые проверки. Визуальный UX и фактический desktop/mobile layout относятся к браузерной проверке root.
