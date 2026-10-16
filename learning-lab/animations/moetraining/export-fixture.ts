import { writeFileSync } from 'node:fs';
import * as R from '../../src/representationFrontierMath.ts';
import * as F from '../../src/flowGeometryMath.ts';
import * as I from '../../src/inferenceFrontierMath.ts';
import * as A from '../../src/architectureTrainingMath.ts';
function run(family:A.TrainingFamily,count:number,rate:number) {
 let parameters=A.initialArchitectureParameters(family);
 const train=A.visionTrainingData('train'),memory=A.ssmTrainingData('train'),noise=A.denoisingTrainingData('train');
 const loss=(split:'train'|'validation')=>family==='vit'?A.evaluateVit(parameters,A.visionTrainingData(split)).loss:family==='moe'?A.moeTrainingTrace(parameters,A.moeTrainingData(split),0,false).mse:family==='ssm'?A.evaluateSsm(parameters,A.ssmTrainingData(split)):A.evaluateDenoiser(family,parameters,A.denoisingTrainingData(split));
 const history=[{step:0,train:loss('train'),validation:loss('validation')}];
 for(let step=0;step<count;step++){const gradient=family==='vit'?A.meanArchitectureGradients(train.map(s=>A.vitTrainingTrace(parameters,s))):family==='moe'?A.moeTrainingTrace(parameters,A.moeTrainingData('train'),.05).gradients:family==='ssm'?A.meanArchitectureGradients(memory.map(s=>A.ssmTrainingTrace(parameters,s))):A.meanArchitectureGradients(Array.from({length:4},(_,i)=>A.denoiserTrainingTrace(family,parameters,noise[(step*4+i)%noise.length])));parameters=A.architectureSgd(parameters,gradient,rate);if((step+1)%4===0||step+1===count)history.push({step:step+1,train:loss('train'),validation:loss('validation')});}
 return {parameters,steps:count,history};
}
const initial=A.initialArchitectureParameters('moe'),trained=run('moe',200,.12),samples=A.moeTrainingData('validation'),a=A.moeTrainingTrace(initial,samples),b=A.moeTrainingTrace(trained.parameters,samples);
const state={rate:.12,balance:.05,run:trained,error:''},before=[0,1].map(j=>samples.map((s,i)=>[s.x,a.rows[i].experts[j]])),after=[0,1].map(j=>samples.map((s,i)=>[s.x,b.rows[i].experts[j]])),data={initial,a,b,samples};
const headers=['x','p1','p2','expert1','expert2','mixture','target'],rows=samples.map((s,i)=>[s.x,...b.rows[i].probabilities,...b.rows[i].experts,b.rows[i].output,s.target]);
const lesson={"media": "moetraining", "title": "MoE: специализация экспертов", "label": "MoE: специализация экспертов", "description": "Два эксперта и router учатся приближать модуль входа.", "target": "moetraining-controls", "jumpLabel": "Перейти к лаборатории", "chapters": [{"title": "Устройство", "start": 0, "frame": 4}, {"title": "Ваш прогноз", "start": 6, "frame": 9}, {"title": "Проверка", "start": 12, "frame": 22}, {"title": "Сравнение", "start": 26, "frame": 30}, {"title": "Лаборатория", "start": 34, "frame": 37}], "question": {"question": "Баланс заменяет MSE?", "options": ["Нет", "Да"], "correct": 0, "explanation": "Нет, равные нагрузки не гарантируют правильный ответ.", "time": 9}, "practice": {"question": "Замена мягкой смеси top-1 обязана сохранить выход?", "options": ["Нет", "Да"], "correct": 0, "explanation": "Нет, обучали взвешенную сумму двух экспертов."}, "transcript": ["Два эксперта и router учатся приближать модуль входа.", "Баланс заменяет MSE?", "Нет, равные нагрузки не гарантируют правильный ответ.", "Оба эксперта вычисляются; capacity/drop и sparse-экономия здесь отсутствуют.", "Примените числа ролика, измените условие, проверьте новый случай и верните настройки."], "note": "Оба эксперта вычисляются; capacity/drop и sparse-экономия здесь отсутствуют."};
const points=[...before.flat(),...after.flat()];const extent=(j:number)=>{const values=points.map(p=>p[j]),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max(.1,(hi-lo)*.12);return [lo-pad,hi+pad]};
const fixture={version:1,duration:40,chapters:[0,6,12,26,34],keyframes:[4,9,22,30,37],predictionAt:9,answerAt:12,posterAt:30,state,data,geometry:{before,after,axisX:"Вход x",axisY:"Выход эксперта",xRange:extent(0),yRange:extent(1)},lesson:{...lesson,table:{caption:'Числа фиксированного опыта',headers,rows}}};
writeFileSync(new URL('./fixture.json',import.meta.url),JSON.stringify(fixture,null,2)+'\n');
console.log('Exported moetraining');
