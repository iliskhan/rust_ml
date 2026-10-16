import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { activate, activationDerivative, mse, bceProbability, bceLogit } from '../src/math.ts'
import { createBoundaryExperiment, advanceBoundaryExperiment, initialBoundarySettings, saveBoundaryRun } from '../src/boundaryExperiment.ts'
import { boundaryMetrics, predictBoundary } from '../src/boundaryNetworkMath.ts'
import type { TopicFilm } from '../src/TopicAnimation.tsx'

const root = dirname(fileURLToPath(import.meta.url))
const fmt = (value: number) => Number(value.toFixed(6))
function lesson(media: string, title: string, description: string, target: string, question: TopicFilm['question'], practice: TopicFilm['practice'], transcript: string[], table: TopicFilm['table'], note: string): TopicFilm {
  return {media,title,label:title,description,target,jumpLabel:'Проверить свои числа в лаборатории ↓',chapters:['Величины и пример','Сначала ваш прогноз','Разобрать механизм','Сравнить результаты','Теперь ваш опыт'].map((title,i)=>({title,start:[0,6,12,26,34][i],frame:[4,9,22,30,37][i]})),question,practice,transcript,table,note}
}
function write(name: string, data: object, speech: string[]) {
  const directory = join(root,name); mkdirSync(directory,{recursive:true})
  writeFileSync(join(directory,'fixture.json'),JSON.stringify(data,null,2)+'\n')
  const windows=[[0,5.7],[6,8.8],[12,18],[18.5,25.7],[26,33.5],[34,39.7]]
  writeFileSync(join(directory,'narration.ru.json'),JSON.stringify({voice:'Microsoft Irina Desktop - Russian',duration:40,segments:speech.map((text,i)=>({start:windows[i][0],end:windows[i][1],text}))},null,2)+'\n')
}
const kinds=['relu','sigmoid','tanh'] as const
const curves=kinds.map(kind=>({kind,points:Array.from({length:25},(_,i)=>{const z=-3+i/4;return [z,activate(z,kind)]}),slopes:[0,3].map(z=>activationDerivative(z,kind))}))
write('activations',{duration:40,curves,example:{x1:1,x2:2,w1:1,w2:-1,bias:1,kind:'sigmoid'},lesson:lesson('activations','Активация и её чувствительность','Сравниваем ReLU, sigmoid и tanh на одних z. Двигаем точку от z=0 до z=3; числа — выход и локальный наклон.','neuron-activation',
  {time:9,question:'Где у sigmoid больше локальный наклон: при z=0 или z=3?',options:['При z=0','При z=3','Наклоны одинаковые'],correct:0,explanation:'σ′(z)=σ(z)(1−σ(z)). В нуле наклон 0.25, при z=3 — примерно0.04518: насыщение ослабляет локальную чувствительность.'},
  {question:'Новый случай: sigmoid получила z=−4. Наклон ближе к0 или к0.25?',options:['К0','К0.25','Он отрицательный'],correct:0,explanation:'Оба хвоста sigmoid насыщаются. Производная положительная, но мала: σ(−4)(1−σ(−4))≈0.01766.'},
  ['Ось z — число до активации, ось a — её выход. Это функции, а не пространственное размещение нейронов.','Один и тот же z проходит через три разные функции. Точки двигаются по отрезкам показанного графика.','У sigmoid и tanh хвосты насыщаются. У ReLU положительная ветвь имеет наклон1, отрицательная0; в нуле обычной производной нет.'],
  {caption:'Локальные наклоны при одних входах',headers:['Функция','Производная при0','Производная при3'],rows:curves.map(c=>[c.kind,...c.slopes.map(fmt)])},
  'Применение ставит z=0 и sigmoid в существующем нейроне. Смените смещение до3 и сравните выход и производную. В нуле ReLU лаборатория использует convention0.' )},[
  'Один вход можно пропустить через три разные активации.','Где сигмоида чувствительнее?',
  'Точка движется по графику от нуля к трём.','Сигмоида насыщается: выход приближается к единице, а наклон уменьшается.',
  'При нуле наклон четверть. При трёх он заметно меньше.','Измените смещение своего нейрона и сравните активации.'
])
const targets=[1,2,3], before=[.5,2.5,2], after=[.5,2.5,3]
write('mse',{duration:40,targets,before,after,initial:mse(before,targets),final:mse(after,targets),lesson:lesson('mse','MSE: от промаха к общему числу','Три цели[1;2;3], прогноз[0.5;2.5;2]. Меняем только третий прогноз с2 на3.','loss-mse-controls',
  {time:9,question:'Если исправить только третий прогноз, MSE станет нулём?',options:['Нет','Да','MSE станет отрицательной'],correct:0,explanation:'У первых двух прогнозов остаются квадраты ошибок0.25 и0.25. Итоговая MSE=(0.25+0.25+0)/3=1/6.'},
  {question:'Новый случай: ошибки прогнозов[−1;1]. Чему равна MSE?',options:['1','0','2'],correct:0,explanation:'Знаки не сокращают квадраты: (1+1)/2=1. Средняя ошибка со знаком была бы0, но это другая величина.'},
  ['Сначала находим отклонение каждого прогноза от своей цели. Знак показывает сторону промаха.','Квадраты делают оба направления неотрицательными; среднее делит сумму на число примеров.','Исправление одного прогноза убирает только его вклад. Производная2(ŷ−y)/n указывает локальное изменение по этому прогнозу.'],
  {caption:'Изменился только третий прогноз',headers:['i','Цель','До','После','Квадрат до','Квадрат после'],rows:targets.map((t,i)=>[i+1,t,before[i],after[i],mse(before,targets).terms[i],mse(after,targets).terms[i]])},
  'Применение восстанавливает исходные три прогноза. Изменяйте ŷ₃; остальные лаборатории и BCE не затрагиваются.' )},[
  'Квадраты трёх промахов складываем и делим на три.','Ошибка станет нулевой?',
  'Третий прогноз приближаем к его цели.','У первых двух прогнозов остаются свои ошибки.',
  'Средняя потеря уменьшилась с половины до одной шестой.','Измените третий прогноз в лаборатории и проверьте число.'
])
const probabilities=[.2,.8], losses=probabilities.map(p=>bceProbability(p,1)), logits=probabilities.map(p=>Math.log(p/(1-p)))
write('bce',{duration:40,probabilities,losses,logits,logitLosses:logits.map(z=>bceLogit(z,1)),curve:Array.from({length:19},(_,i)=>{const p=(i+1)/20;return [p,bceProbability(p,1).loss]}),lesson:lesson('bce','BCE: уверенность и истинный класс','Истинный класс1. Вероятность меняется с0.2 до0.8; соответствующий логит — log(p/(1−p)).','loss-bce-controls',
  {time:9,question:'Для истинного класса1 какая вероятность даёт меньшую BCE?',options:['0.8','0.2','Потери одинаковые'],correct:0,explanation:'При y=1 потеря равна−ln(p): для0.8 примерно0.22314, для0.2 примерно1.60944. Это сравнение уверенности, не только попадания через порог.'},
  {question:'Новый случай: истинный класс0, p=0.9. Какое направление уменьшает BCE?',options:['Уменьшить p','Увеличить p','Любое: класс уже верный'],correct:0,explanation:'При y=0 считаем−ln(1−p); высокая вероятность класса1 здесь уверенно неверна. Уменьшение p снижает потерю.'},
  ['При метке1 BCE=−ln(p); при метке0 BCE=−ln(1−p). Вероятность относится к классу1 в обоих случаях.','Логит z — число до sigmoid. BCE по логиту вычисляет ту же потерю, но производная берётся по другой переменной.','Для logits dL/dz=p−y. Для вероятностей dL/dp=(p−y)/(p(1−p)); нельзя смешивать эти два градиента.'],
  {caption:'Две формы одной потери при y=1',headers:['p','Логит z','BCE','dL/dp','dL/dz'],rows:probabilities.map((p,i)=>[p,fmt(logits[i]),fmt(losses[i].loss),fmt(losses[i].grad),fmt(bceLogit(logits[i],1).grad)])},
  'Применение выбирает p=0.2,y=1 в режиме вероятностей. Переключите на логит и задайте соответствующее z, чтобы сравнить обе формы.' )},[
  'Вероятность класса один сравниваем с истинной меткой один.','Какая уверенность лучше?',
  'Точка движется к большей вероятности правильного класса.','Потеря уменьшается. Логит и вероятность описывают тот же прогноз.',
  'Значения потери совпадают, но градиенты по разным переменным различаются.','Смените истинный класс и проверьте направление изменения.'
])
const settings={...initialBoundarySettings,batchSize:24,batchSeed:42,lambda:.01}
let experiment=createBoundaryExperiment(settings)
const states=[0,50,200,400].map((step,index)=>{if(index)experiment=advanceBoundaryExperiment(experiment,step-[0,50,200,400][index-1]);return {step,params:experiment.optimizer.params,metrics:{train:boundaryMetrics(experiment.optimizer.params,settings.config,experiment.dataset.train),validation:boundaryMetrics(experiment.optimizer.params,settings.config,experiment.dataset.validation)},grid:Array.from({length:13},(_,y)=>Array.from({length:13},(_,x)=>[x/12,y/12,predictBoundary(experiment.optimizer.params,settings.config,[x/12,y/12])]))}})
write('boundary',{duration:40,settings,initialRun:saveBoundaryRun(createBoundaryExperiment(settings),.5,[.5,.5]),dataset:experiment.dataset,states,lesson:lesson('boundary','Граница решений и новая проверка','Полумесяцы, seed42, сеть2→8tanh→8tanh→1sigmoid, Adamη0.02, batch24, L2λ0.01. Число шагов фиксировано заранее:400.','boundary-experiment',
  {time:9,question:'Успех на обучающих точках гарантирует успех на новых?',options:['Нет','Да','Да, если есть скрытый слой'],correct:0,explanation:'Обучение меняет веса по train. Отдельная validation-выборка показывает поведение на других синтетических точках. Даже хороший результат на ней не является гарантией для любых данных.'},
  {question:'Новый случай: порог многократно выбирали по validation. Осталась ли она независимой итоговой проверкой?',options:['Нет','Да','Да, если веса заморожены'],correct:0,explanation:'Выбор порога использовал сведения из validation. Для новой независимой итоговой оценки нужны отдельные данные, которые не участвовали в этом выборе.'},
  ['Цвет фона — решение по p≥0.5. Вероятность вычисляется текущими весами; порог не обучает сеть.','Круги — train, кольца — validation. Оси — два входных признака; скрытые координаты не выдаются за физические измерения.','Обновления используют пакеты24 из96train-примеров; validation32 в градиенты не входит. L2 штрафует веса, а не bias.','Показан один заранее заданный опыт. Его результат не доказывает универсальное качество модели.'],
  {caption:'BCE и точность отдельно по выборкам',headers:['Шаг','BCE train','BCE validation','Верно train/96','Верно validation/32'],rows:states.map(s=>[s.step,fmt(s.metrics.train.loss),fmt(s.metrics.validation.loss),s.metrics.train.correct,s.metrics.validation.correct])},
  'Применение сохраняет ваш текущий опыт, ставит исходные настройки ролика и шаг0. СлотыA/B сохраняются. Возврат восстанавливает веса, историю, порог и пробу на паузе.' )},[
  'Сеть строит границу по двум входным признакам.','Новые точки тоже верны?',
  'Веса меняются только по обучающим точкам.','После обновлений граница решений меняет форму.',
  'Проверочные точки сравниваем отдельно. Их не использовали в градиентах.','Повторите фиксированный опыт и сравните две ошибки.'
])
