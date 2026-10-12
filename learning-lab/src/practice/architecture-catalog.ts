import type { PracticeExercise, PracticeTopic } from './catalog';

type Skill = {
  key: string; title: string; inputs: string; formula: string; boundary: string;
  bodies: [string, string, string]; guards?: [string, string, string];
  cases: { values: number[]; result: number[]; context: string }[];
  questions: [string, string[], number, string][];
};
const skills: Skill[] = [
  {
    key: 'dense', title: 'Один нейрон Dense с tanh', inputs: '[x₀,x₁,w₀,w₁,b]',
    formula: 'z=w₀x₀+w₁x₁+b; a=tanh(z)', boundary: 'Один нейрон с двумя входами; это часть слоя, без обучения MLP.',
    bodies: ['x0,x1,w0,w1,b=values\nz=w0*x0+w1*x1+b\nreturn [z,math.tanh(z)]', 'const [x0,x1,w0,w1,b]=values;\nconst z=w0*x0+w1*x1+b;\nreturn [z,Math.tanh(z)];', 'let z=values[2]*values[0]+values[3]*values[1]+values[4];\nOk(vec![z,z.tanh()])'],
    cases: [
      { values: [1,2,.5,-.25,0], result: [0,0], context: 'Положительный и отрицательный вклады взаимно компенсируются.' },
      { values: [1,-1,1,1,.5], result: [.5,.46211715726000974], context: 'После компенсации входов остаётся bias.' },
      { values: [0,0,2,-1,-1], result: [-1,-.7615941559557649], context: 'При нулевых входах ответ определяет bias.' },
    ],
    questions: [
      ['Зачем после суммы нужна tanh?', ['Добавляет нелинейность','Переставляет веса','Считает loss'],0,'Несколько аффинных слоёв без нелинейности сводятся к одному аффинному преобразованию.'],
      ['Если x₀+x₁=0 и оба веса равны 1, чему равно z?', ['Всегда 0','Bias b','tanh(b)'],1,'Сумма вкладов равна 0, но bias прибавляется отдельно.'],
      ['Можно ли назвать весь MLP обученным после вычисления a?', ['Да','Только при a=1','Нет: веса ещё не обновлялись'],2,'Forward вычисляет ответ; обучение дополнительно требует loss, backward и обновления параметров.'],
    ],
  },
  {
    key: 'cnn', title: 'Окно свёртки 2×2', inputs: '[x₀,x₁,x₂,x₃,k₀,k₁,k₂,k₃,b] в порядке строк',
    formula: 'z=Σᵢ₌₀³xᵢkᵢ+b; a=max(0,z)', boundary: 'Одно окно valid cross-correlation, kernel не разворачивается; не полный проход изображения.',
    bodies: ['z=sum(values[i]*values[i+4] for i in range(4))+values[8]\nreturn [z,max(0.0,z)]','const z=values.slice(0,4).reduce((s,x,i)=>s+x*values[i+4],values[8]);\nreturn [z,Math.max(0,z)];','let z=(0..4).map(|i| values[i]*values[i+4]).sum::<f64>()+values[8];\nOk(vec![z,z.max(0.0)])'],
    cases: [
      { values: [1,2,3,4,1,0,0,-1,1], result: [-2,0], context: 'Kernel сравнивает два угла, затем ReLU обнуляет отрицательную сумму.' },
      { values: [1,0,0,0,.5,-.5,1,2,0], result: [.5,.5], context: 'Импульс выбирает коэффициент соответствующего элемента kernel.' },
      { values: [0,0,0,0,1,-1,2,-2,1], result: [1,1], context: 'Пустое по значениям окно сохраняет вклад bias.' },
    ],
    questions: [
      ['Нужно ли здесь переворачивать kernel?', ['Да','Нет: используем ML cross-correlation','Только при ReLU'],1,'Позиции входа и kernel сопоставляются напрямую.'],
      ['Какие веса используются в следующем окне того же фильтра?', ['Новый независимый набор','Те же коэффициенты kernel','Только bias'],1,'Разделение параметров отличает свёртку от независимых Dense-связей каждой позиции.'],
      ['Почему на нулевом входе ответ может быть ненулевым?', ['Из-за padding','Из-за порядка осей','Из-за bias'],2,'Каждый произведённый вклад равен нулю; остаётся bias.'],
    ],
  },
  {
    key: 'cnn-training', title: 'Градиент одного коэффициента фильтра', inputs: '[x₀,x₁,x₂,x₃,k₀,k₁,k₂,k₃,b,y,η], η∈[0,1]',
    formula: 'z=Σxᵢkᵢ+b; L=½(z−y)²; ∂L/∂k₀=(z−y)x₀; ∂L/∂b=z−y', boundary: 'Одна линейная позиция фильтра без ReLU. Для общего фильтра по многим окнам вклады градиента складываются.',
    guards: ['if not 0 <= values[10] <= 1: raise ValueError("eta")','if(values[10]<0||values[10]>1) throw new RangeError("eta");','if !(0.0..=1.0).contains(&values[10]) { return Err("eta"); }'],
    bodies: ['z=sum(values[i]*values[i+4] for i in range(4))+values[8]\ne=z-values[9]\ng=e*values[0]\nreturn [0.5*e*e,g,e,values[4]-values[10]*g]','const z=values.slice(0,4).reduce((s,x,i)=>s+x*values[i+4],values[8]);\nconst e=z-values[9],g=e*values[0];\nreturn [0.5*e*e,g,e,values[4]-values[10]*g];','let z=(0..4).map(|i| values[i]*values[i+4]).sum::<f64>()+values[8];\nlet e=z-values[9]; let g=e*values[0];\nOk(vec![0.5*e*e,g,e,values[4]-values[10]*g])'],
    cases: [
      { values: [1,2,0,-1,.5,0,1,-.5,0,0,.1], result: [.5,1,1,.4], context: 'Верните [loss,dk₀,db,new_k₀] для одного SGD-шагa.' },
      { values: [0,1,0,0,.5,1,0,0,0,1,.1], result: [0,0,0,.5], context: 'При точном ответе loss и градиенты нулевые.' },
      { values: [0,0,0,0,.5,0,0,0,2,0,.1], result: [2,0,2,.5], context: 'Нулевой x₀ обнуляет dk₀, но gradient bias остаётся ненулевым.' },
    ],
    questions: [
      ['Если один k₀ применяется к нескольким окнам, как получить общий градиент?', ['Сложить вклады всех окон','Взять только последнее окно','Обнулить при повторном использовании'],0,'Один параметр участвует в нескольких путях графа; правило цепочки суммирует вклады.'],
      ['Что меняет backward?', ['Сразу kernel','Вычисляет производные','Переставляет пиксели'],1,'Обновление весов — отдельный SGD-шаг.'],
      ['Почему dk₀=0 при x₀=0 и ненулевой ошибке?', ['Ошибка обязательно 0','Bias выключен','Локальная производная z по k₀ равна x₀'],2,'db может быть ненулевым, даже если вклад данного коэффициента не влияет на z.'],
    ],
  },
  {
    key: 'cnn-shift', title: 'Stride и фаза сдвига', inputs: '[x₀,x₁,x₂,x₃,k₀,k₁]',
    formula: 'y=[k₀x₀+k₁x₁,k₀x₂+k₁x₃]; shift(x)=[0,x₀,x₁,x₂]', boundary: 'Одномерная численная аналогия stride=2 с нулевым левым краем; показывает фазу отбора, не доказывает свойства полной 2D-сети.',
    bodies: ['x0,x1,x2,x3,k0,k1=values\nreturn [k0*x0+k1*x1,k0*x2+k1*x3,k1*x0,k0*x1+k1*x2]','const [x0,x1,x2,x3,k0,k1]=values;\nreturn [k0*x0+k1*x1,k0*x2+k1*x3,k1*x0,k0*x1+k1*x2];','let [x0,x1,x2,x3,k0,k1]=[values[0],values[1],values[2],values[3],values[4],values[5]];\nOk(vec![k0*x0+k1*x1,k0*x2+k1*x3,k1*x0,k0*x1+k1*x2])'],
    cases: [
      { values: [1,2,3,4,1,1], result: [3,7,1,5], context: 'Верните два выхода до сдвига и два после сдвига на один элемент.' },
      { values: [0,1,0,0,1,0], result: [0,0,0,1], context: 'Импульс в нечётной позиции появляется после изменения фазы отбора.' },
      { values: [0,0,0,0,1,-1], result: [0,0,0,0], context: 'Нулевой вход остаётся нулевым при любой фазе.' },
    ],
    questions: [
      ['Почему сдвиг на 1 входную позицию не обязан стать целым сдвигом выхода при stride=2?', ['Меняется фаза выбранных окон','Все веса обучаются заново','Числа становятся случайными'],0,'Шаг выхода охватывает две входные позиции; нечётный сдвиг меняет набор пар.'],
      ['Что делает нулевая граница?', ['Гарантирует инвариантность','Вводит новое значение на краю','Не влияет ни на один выход'],1,'После сдвига край заполнен 0; это отдельный эффект границы.'],
      ['Можно ли по нулевому примеру доказать эквивариантность для всех сигналов?', ['Да','Если kernel длинный','Нет'],2,'Один вырожденный пример не доказывает общее свойство.'],
    ],
  },
  {
    key: 'rnn', title: 'Один шаг рекуррентного состояния', inputs: '[x,h_prev,w_x,w_h,b]',
    formula: 'h=tanh(w_x x+w_h h_prev+b); ∂h/∂h_prev=w_h(1−h²)', boundary: 'Один скалярный шаг tanh RNN и локальная производная, без полного BPTT.',
    bodies: ['x,hp,wx,wh,b=values\nh=math.tanh(wx*x+wh*hp+b)\nreturn [h,wh*(1-h*h)]','const [x,hp,wx,wh,b]=values;\nconst h=Math.tanh(wx*x+wh*hp+b);\nreturn [h,wh*(1-h*h)];','let h=(values[2]*values[0]+values[3]*values[1]+values[4]).tanh();\nOk(vec![h,values[3]*(1.0-h*h)])'],
    cases: [
      { values: [0,0,1,.5,0], result: [0,.5], context: 'Нулевая сумма даёт h=0, но влияние прошлого состояния может быть ненулевым.' },
      { values: [1,0,1,0,0], result: [.7615941559557649,0], context: 'При w_h=0 текущий ответ не зависит от предыдущего состояния.' },
      { values: [0,1,0,-1,0], result: [-.7615941559557649,-.41997434161402614], context: 'Отрицательный recurrent weight меняет знак локальной производной.' },
    ],
    questions: [
      ['Какие параметры использует следующий шаг той же RNN?', ['Новые независимые','Те же w_x,w_h,b','Только w_x'],1,'Повторение одних параметров по времени даёт общие градиенты.'],
      ['При w_h=0 есть зависимость h от h_prev?', ['Нет','Всегда есть','Только при x=0'],0,'У предыдущего состояния коэффициент 0.'],
      ['Производная tanh равна чему?', ['h','1+h²','1−h²'],2,'Здесь h уже равно tanh(z).'],
    ],
  },
  {
    key: 'bptt', title: 'Сумма путей BPTT на двух шагах', inputs: '[x₁,x₂,h₀,w_x,w_h,y]',
    formula: 'h₁=tanh(w_x x₁+w_h h₀); h₂=tanh(w_x x₂+w_h h₁); L=½(h₂−y)²', boundary: 'Два шага скалярной RNN без bias; выход [loss,dL/dw_h]. Это гранулярный backward, не всё обучение последовательности.',
    bodies: ['x1,x2,h0,wx,wh,y=values\nh1=math.tanh(wx*x1+wh*h0)\nh2=math.tanh(wx*x2+wh*h1)\ng2=(h2-y)*(1-h2*h2)\ng1=g2*wh*(1-h1*h1)\nreturn [0.5*(h2-y)**2,g2*h1+g1*h0]','const [x1,x2,h0,wx,wh,y]=values;\nconst h1=Math.tanh(wx*x1+wh*h0),h2=Math.tanh(wx*x2+wh*h1);\nconst g2=(h2-y)*(1-h2*h2),g1=g2*wh*(1-h1*h1);\nreturn [0.5*(h2-y)**2,g2*h1+g1*h0];','let h1=(values[3]*values[0]+values[4]*values[2]).tanh();\nlet h2=(values[3]*values[1]+values[4]*h1).tanh();\nlet g2=(h2-values[5])*(1.0-h2*h2);\nlet g1=g2*values[4]*(1.0-h1*h1);\nOk(vec![0.5*(h2-values[5]).powi(2),g2*h1+g1*values[2]])'],
    cases: [
      { values: [1,-.5,.3,.7,.8,.2], result: [0.0005703371735605483,0.02699490178745669], context: 'Ненулевое h₀ открывает оба пути влияния w_h; верните [loss,dL/dw_h].' },
      { values: [0,1,1,.4,-.5,-.2], result: [0.2878740742887685,-0.44637010366140717], context: 'Отрицательный recurrent weight меняет оба шага и знак внутреннего пути.' },
      { values: [1,0,0,1,0,1], result: [.5,-.7615941559557649], context: 'В точке w_h=0 будущий шаг ещё имеет ненулевую производную по w_h, потому что h₁≠0.' },
    ],
    questions: [
      ['Сколько вкладов содержит dL/dw_h для двух шагов?', ['Только последний','Вклад прямого второго применения и путь через h₁','Всегда два одинаковых числа'],1,'Параметр используется повторно; суммируются производные по обоим применениям.'],
      ['Как проверить общий градиент независимо?', ['Прибавить к loss','Сравнить с h₂','Пересчитать два forward при w_h±δ'],2,'Центральная разность не использует analytic backward.'],
      ['Нулевая производная в одном примере доказывает отсутствие проблем с исчезающим градиентом?', ['Нет','Да','Если loss положительный'],0,'Градиент зависит от конкретного входа и цепочки локальных производных.'],
    ],
  },
  {
    key: 'lstm', title: 'Запись и сохранение LSTM cell', inputs: '[c_prev,f,i,o,g]; f,i,o∈[0,1], g∈[−1,1]',
    formula: 'c=f c_prev+i g; h=o tanh(c)', boundary: 'Ворота уже вычислены. Нужно соединить их значения; нет вычисления четырёх affine-проекций и обучения LSTM.',
    guards: ['if any(not 0 <= v <= 1 for v in values[1:4]) or abs(values[4]) > 1: raise ValueError("gates")','if(values.slice(1,4).some(v=>v<0||v>1)||Math.abs(values[4])>1) throw new RangeError("gates");','if values[1..4].iter().any(|v| !(0.0..=1.0).contains(v)) || values[4].abs()>1.0 { return Err("gates"); }'],
    bodies: ['cp,f,i,o,g=values\nc=f*cp+i*g\nreturn [c,o*math.tanh(c)]','const [cp,f,i,o,g]=values;\nconst c=f*cp+i*g;\nreturn [c,o*Math.tanh(c)];','let c=values[1]*values[0]+values[2]*values[4];\nOk(vec![c,values[3]*c.tanh()])'],
    cases: [
      { values: [1,1,0,1,-1], result: [1,.7615941559557649], context: 'Закрытый input gate сохраняет старую cell при f=1.' },
      { values: [1,0,1,1,-1], result: [-1,-.7615941559557649], context: 'Forget gate удаляет старую cell, input записывает новое значение.' },
      { values: [2,1,0,0,0], result: [2,0], context: 'Output gate закрывает h, но cell может оставаться ненулевой.' },
    ],
    questions: [
      ['При i=0 какой вклад нового кандидата g?', ['g','Нулевой','c_prev'],1,'Запись равна i·g.'],
      ['Какие значения различаются в LSTM?', ['Только два индекса','Две одинаковые копии','Cell c и выход h'],2,'h дополнительно зависит от output gate и tanh(c).'],
      ['Если o=0, обязательно ли c=0?', ['Нет','Да','Только при f=1'],0,'Output gate ограничивает вывод состояния, а не непосредственно его хранение.'],
    ],
  },
  {
    key: 'gru', title: 'Reset-before GRU', inputs: '[h_prev,z,r,x,w_x,w_h]; z,r∈[0,1]',
    formula: 'g=tanh(w_x x+w_h r h_prev); h=z h_prev+(1−z)g', boundary: 'Reset-before и update как доля сохранения прошлого, согласовано с учебником; bias=0, нет обучения GRU.',
    guards: ['if any(not 0 <= v <= 1 for v in values[1:3]): raise ValueError("gates")','if(values.slice(1,3).some(v=>v<0||v>1)) throw new RangeError("gates");','if values[1..3].iter().any(|v| !(0.0..=1.0).contains(v)) { return Err("gates"); }'],
    bodies: ['hp,z,r,x,wx,wh=values\ng=math.tanh(wx*x+wh*r*hp)\nreturn [g,z*hp+(1-z)*g]','const [hp,z,r,x,wx,wh]=values;\nconst g=Math.tanh(wx*x+wh*r*hp);\nreturn [g,z*hp+(1-z)*g];','let g=(values[4]*values[3]+values[5]*values[2]*values[0]).tanh();\nOk(vec![g,values[1]*values[0]+(1.0-values[1])*g])'],
    cases: [
      { values: [1,1,0,0,1,1], result: [0,1], context: 'При z=1 сохраняется h_prev, даже если кандидат равен 0.' },
      { values: [1,0,0,1,1,1], result: [.7615941559557649,.7615941559557649], context: 'r=0 убирает recurrent вклад кандидата; z=0 полностью записывает кандидата.' },
      { values: [-1,.5,1,0,0,1], result: [-.7615941559557649,-.8807970779778824], context: 'Промежуточный z смешивает два отрицательных значения.' },
    ],
    questions: [
      ['В принятой формуле при z=1 что получается?', ['h_prev','Кандидат g','0'],0,'Здесь z — доля сохранения прошлого. В другой convention роли z и 1−z могут быть поменяны.'],
      ['При r=0 что пропадает из кандидата?', ['Вход x','Bias всех слоёв','Вклад прошлого h_prev'],2,'Это свойство reset-before формулы с bias=0.'],
      ['При 0≤z≤1 где лежит h относительно h_prev и g?', ['За пределами обоих','Между ними','Всегда 0'],1,'h — выпуклая комбинация двух скалярных значений.'],
    ],
  },
  {
    key: 'transformer', title: 'Attention как смесь двух значений', inputs: '[s₀,s₁,v₀,v₁]; scores уже вычислены',
    formula: 'm=max(s₀,s₁); pᵢ=exp(sᵢ−m)/Σⱼexp(sⱼ−m); context=Σpᵢvᵢ', boundary: 'Одна строка attention для двух ключей и скалярных V; нет всего Transformer-блока, маски и проекций.',
    bodies: ['s0,s1,v0,v1=values\nm=max(s0,s1)\ne0,e1=math.exp(s0-m),math.exp(s1-m)\np0,p1=e0/(e0+e1),e1/(e0+e1)\nreturn [p0,p1,p0*v0+p1*v1]','const [s0,s1,v0,v1]=values;\nconst m=Math.max(s0,s1),e0=Math.exp(s0-m),e1=Math.exp(s1-m);\nconst p0=e0/(e0+e1),p1=e1/(e0+e1);\nreturn [p0,p1,p0*v0+p1*v1];','let m=values[0].max(values[1]);\nlet e0=(values[0]-m).exp(); let e1=(values[1]-m).exp();\nlet p0=e0/(e0+e1); let p1=e1/(e0+e1);\nOk(vec![p0,p1,p0*values[2]+p1*values[3]])'],
    cases: [
      { values: [0,0,1,3], result: [.5,.5,2], context: 'Равные scores дают равные веса.' },
      { values: [1,1,-2,2], result: [.5,.5,0], context: 'Общий сдвиг scores не меняет смесь.' },
      { values: [0,Math.log(3),0,4], result: [.25,.75,3], context: 'Разность log(3) даёт отношение весов 1:3.' },
    ],
    questions: [
      ['Что смешивается после softmax?', ['Значения V','Индексы токенов','Число голов'],0,'Q/K определяют scores и веса, V передаёт содержимое смеси.'],
      ['Общий сдвиг scores на одно число меняет p?', ['Всегда','Нет','Только в encoder'],1,'Общий множитель exp(c) сокращается между числителем и знаменателем.'],
      ['Если вероятности неотрицательны и сумма 1, где лежит scalar context?', ['Всегда вне V','Всегда 1','Между минимальным и максимальным V'],2,'Это взвешенное среднее скалярных значений.'],
    ],
  },
];

function authoredCode(skill: Skill): Pick<PracticeExercise, 'starter' | 'solution'> {
  const count = skill.cases[0].values.length;
  const pyGuard = `if not isinstance(values,list) or len(values)!=${count} or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>4 for v in values): raise ValueError("input")`;
  const jsGuard = `if(!Array.isArray(values)||values.length!==${count}||Array.from(values).some(v=>typeof v!=="number"||!Number.isFinite(v)||Math.abs(v)>4)) throw new RangeError("input");`;
  const rsGuard = `if values.len()!=${count} || values.iter().any(|v| !v.is_finite() || v.abs()>4.0) { return Err("input"); }`;
  const python = (body: string) => `import math\n\ndef solve(values: list[float]) -> list[float]:\n${body.split('\n').map(s => '    '+s).join('\n')}\n`;
  const javascript = (body: string) => `function solve(values) {\n${body.split('\n').map(s => '  '+s).join('\n')}\n}\n`;
  const rust = (body: string) => `pub fn solve(values: &[f64]) -> Result<Vec<f64>, &'static str> {\n${body.split('\n').map(s => '    '+s).join('\n')}\n}\n`;
  return {
    starter: { python: python('raise NotImplementedError("Реализуйте формулу")'), javascript: javascript('throw new Error("Реализуйте формулу");'), rust: rust('todo!("Реализуйте формулу")') },
    solution: { python: python([pyGuard,skill.guards?.[0],skill.bodies[0]].filter(Boolean).join('\n')), javascript: javascript([jsGuard,skill.guards?.[1],skill.bodies[1]].filter(Boolean).join('\n')), rust: rust([rsGuard,skill.guards?.[2],skill.bodies[2]].filter(Boolean).join('\n')) },
  };
}

export const architecturePracticeTopics: PracticeTopic[] = skills.map(skill => {
  const topicId = 'unit.architecture.'+skill.key;
  const code = authoredCode(skill);
  return {
    id: topicId, lessonId: 'architectures', title: skill.title, sourceSection: skill.title,
    prerequisites: ['unit.neuron.affine'],
    exercises: skill.cases.map((example,index) => {
      const question = skill.questions[index];
      return {
        id: `${topicId}.${index===0?'guided':index===1?'transfer-a':'transfer-b'}`, topicId,
        title: `${index===0?'Вычисление':index===1?'Перенос A':'Перенос B'} · ${skill.title}`,
        mode: index===0?'guided':'transfer', formula: skill.formula,
        prompt: `Напишите solve(values). Вход: ${skill.inputs}. Все числа конечны, |v|≤4, форма точно как в примере; вход не изменять. Отклоняйте неверную форму и значения (ValueError/RangeError/Err). ${example.context} ${skill.boundary} Сравнение atol=1e−10, rtol=1e−9.`,
        hints: ['Назовите каждый элемент входа по порядку, указанному в условии.',skill.formula],
        explanation: `${example.context} Для входа ${JSON.stringify(example.values)} ожидается ${JSON.stringify(example.result)}. ${skill.boundary}`,
        ...code, fixtures: [{ input: JSON.stringify({values:example.values}), output: JSON.stringify(example.result) }],
        quiz: {question:question[0],options:question[1],correctIndex:question[2],explanation:question[3]},
      };
    }),
  };
});
