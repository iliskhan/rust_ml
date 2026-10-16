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
const initial=A.initialArchitectureParameters('ssm'),trained=run('ssm',100,.15),sample=A.ssmTrainingData('validation')[0],a=A.ssmTrainingTrace(initial,sample),b=A.ssmTrainingTrace(trained.parameters,sample);
const state={rate:.15,example:0,run:trained,error:''},before=[0,1,2].map(j=>a.states.map((s,i)=>[i,s[j]])),after=[0,1,2].map(j=>b.states.map((s,i)=>[i,s[j]])),data={initial,a,b,sample};
const headers=['t','x','h0','h1','h2','y'],rows=b.states.map((s,i)=>[i,sample.input[i],...s,b.outputs[i]]);
const lesson={"media": "ssmtraining", "title": "SSM: научиться помнить", "label": "SSM: научиться помнить", "description": "Первый вход содержит сигнал; пять следующих входов содержат помехи.", "target": "ssmtraining-controls", "jumpLabel": "Перейти к лаборатории", "chapters": [{"title": "Устройство", "start": 0, "frame": 4}, {"title": "Ваш прогноз", "start": 6, "frame": 9}, {"title": "Проверка", "start": 12, "frame": 22}, {"title": "Сравнение", "start": 26, "frame": 30}, {"title": "Лаборатория", "start": 34, "frame": 37}], "question": {"question": "Градиент касается только последнего перехода?", "options": ["Нет", "Да"], "correct": 0, "explanation": "Нет, он проходит через всю рекурсию памяти.", "time": 9}, "practice": {"question": "При A=0 сохраняется вклад прошлого состояния?", "options": ["Нет", "Да"], "correct": 0, "explanation": "Нет, член A на прошлое состояние исчезает."}, "transcript": ["Первый вход содержит сигнал; пять следующих входов содержат помехи.", "Градиент касается только последнего перехода?", "Нет, он проходит через всю рекурсию памяти.", "Время — индекс, не физическая координата; все три компоненты приведены в таблице.", "Примените числа ролика, измените условие, проверьте новый случай и верните настройки."], "note": "Время — индекс, не физическая координата; все три компоненты приведены в таблице."};
const points=[...before.flat(),...after.flat()];const extent=(j:number)=>{const values=points.map(p=>p[j]),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max(.1,(hi-lo)*.12);return [lo-pad,hi+pad]};
const fixture={version:1,duration:40,chapters:[0,6,12,26,34],keyframes:[4,9,22,30,37],predictionAt:9,answerAt:12,posterAt:30,state,data,geometry:{before,after,axisX:"Время t, индекс",axisY:"Компоненты состояния h",xRange:extent(0),yRange:extent(1)},lesson:{...lesson,table:{caption:'Числа фиксированного опыта',headers,rows}}};
writeFileSync(new URL('./fixture.json',import.meta.url),JSON.stringify(fixture,null,2)+'\n');
console.log('Exported ssmtraining');
