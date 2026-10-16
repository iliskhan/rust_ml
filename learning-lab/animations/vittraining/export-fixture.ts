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
const initial=A.initialArchitectureParameters('vit'),trained=run('vit',80,.12),sample=A.visionTrainingData('validation')[0],a=A.vitTrainingTrace(initial,sample),b=A.vitTrainingTrace(trained.parameters,sample);
const state={rate:.12,example:0,run:trained,error:''},before=[a.tokens],after=[b.tokens],data={initial,a,b,sample};
const headers=['Патч','z1 до','z2 до','z1 после','z2 после'],rows=b.tokens.map((p,i)=>[i,...a.tokens[i],...p]);
const lesson={"media": "vittraining", "title": "ViT: обучаются все группы", "label": "ViT: обучаются все группы", "description": "Все сорок параметров получают градиент cross entropy.", "target": "vittraining-controls", "jumpLabel": "Перейти к лаборатории", "chapters": [{"title": "Устройство", "start": 0, "frame": 4}, {"title": "Ваш прогноз", "start": 6, "frame": 9}, {"title": "Проверка", "start": 12, "frame": 22}, {"title": "Сравнение", "start": 26, "frame": 30}, {"title": "Лаборатория", "start": 34, "frame": 37}], "question": {"question": "Обучается только classifier?", "options": ["Нет", "Да"], "correct": 0, "explanation": "Нет, меняются patch-проекция, Q/K/V, FFN и голова.", "time": 9}, "practice": {"question": "Новая validation-картинка участвует в SGD?", "options": ["Нет", "Да"], "correct": 0, "explanation": "Нет, она проверяет обучение на отдельном шуме."}, "transcript": ["Все сорок параметров получают градиент cross entropy.", "Обучается только classifier?", "Нет, меняются patch-проекция, Q/K/V, FFN и голова.", "Две реальные компоненты патча. Малая ViT без CLS и LayerNorm.", "Примените числа ролика, измените условие, проверьте новый случай и верните настройки."], "note": "Две реальные компоненты патча. Малая ViT без CLS и LayerNorm."};
const points=[...before.flat(),...after.flat()];const extent=(j:number)=>{const values=points.map(p=>p[j]),lo=Math.min(...values),hi=Math.max(...values),pad=Math.max(.1,(hi-lo)*.12);return [lo-pad,hi+pad]};
const fixture={version:1,duration:40,chapters:[0,6,12,26,34],keyframes:[4,9,22,30,37],predictionAt:9,answerAt:12,posterAt:30,state,data,geometry:{before,after,axisX:"z1 патча",axisY:"z2 патча",xRange:extent(0),yRange:extent(1)},lesson:{...lesson,table:{caption:'Числа фиксированного опыта',headers,rows}}};
writeFileSync(new URL('./fixture.json',import.meta.url),JSON.stringify(fixture,null,2)+'\n');
console.log('Exported vittraining');
