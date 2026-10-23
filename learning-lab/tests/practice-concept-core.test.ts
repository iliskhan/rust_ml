import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { conceptCoreTopics } from '../src/practice/concept-core-catalog.ts';
import type { PracticeExercise } from '../src/practice/catalog.ts';

const all=conceptCoreTopics.flatMap(t=>t.exercises);
const fixtures=all.flatMap(e=>e.fixtures.map(f=>({e,input:JSON.parse(f.input),expected:JSON.parse(f.output)})));
const by=(id:string,suffix='guided')=>all.find(e=>e.id===`concept.${id}.${suffix}`)!;
const standardizerCases=[
  {e:by('train-validation-test'),input:{train:[0,1e-13]},expected:[5e-14,1e-12]},
  {e:by('train-validation-test'),input:{train:[0,2e-12]},expected:[1e-12,1e-12]},
  {e:by('train-validation-test'),input:{train:[7,7]},expected:[7,1]},
  {e:by('train-validation-test','transfer-a'),input:{x:0,mean:5e-14,scale:1e-12},expected:-.05},
  {e:by('train-validation-test','transfer-a'),input:{x:1e-13,mean:5e-14,scale:1e-12},expected:.05},
];
fixtures.push(...standardizerCases);
const invalid=([
  ['function',{x:101}],['slope',{x:2,h:0}],['limit',{x:2,hs:[0]}],
  ['derivative',{x:1,delta:2}],['partial-derivative',{point:[1,2],axis:2,h:.1}],
  ['gradient',{point:[1,2],direction:[1,1]}],['chain-rule',{x:1,a:101,b:0,c:0}],
  ['vector',{a:[1],b:[1,2]}],['matrix',{a:[[1,2],[1]],b:[[1],[1]]}],
  ['tensor',{shape:[2,0],indices:[0,0]}],['probability',{weights:[0,0]}],
  ['expectation',{p:[.2,.3],values:[1,2]}],['variance',{p:[-.5,1.5],values:[1,2]}],
  ['exponential',{values:[]}],['logarithm',{probabilities:[0]}],['entropy',{p:[.2,.3]}],
  ['softmax',{z:[1,2],temperature:0}],['normalization',{x:[1,2],gamma:[1],beta:[0,0],eps:.1}],
  ['loss',{predictions:[1,2],targets:[1]}],['cross-entropy',{z:[1,2],target:2}],
  ['learning-rate',{theta:1,gradient:1,eta:4}],['backpropagation',{x:5,w:1,target:0}],
  ['train-validation-test',{train:[]}],['overfitting',{train_losses:[-1],heldout_losses:[1]}],
  ['regularization',{weights:[1],strength:-.1}],['initialization',{fan_in:2,fan_out:3,kind:'other'}],
  ['batches-epochs',{n:5,batch_size:0}],['adamw',{theta:[1,2],adaptive:[1],eta:.1,strength:.1}],
  ['evaluation',{p:[.5],labels:[2],threshold:.5}],
] as [string,Record<string,unknown>][]).map(([id,input])=>({e:by(id),input,expectError:true}));
invalid.push({e:by('train-validation-test','transfer-a'),input:{x:1,mean:1,scale:0},expectError:true});
invalid.push({e:by('batches-epochs','transfer-b'),input:{means:[1],counts:[0]},expectError:true});
invalid.push({e:by('function'),input:{x:NaN},expectError:true});
function close(a:unknown,e:unknown,atol=1e-12,rtol=1e-10):void{
  if(typeof e==='number'){assert.equal(typeof a,'number');assert.ok(Number.isFinite(a as number));assert.ok(Math.abs((a as number)-e)<=atol+rtol*Math.abs(e),`${a} != ${e}`);}
  else if(typeof e==='boolean'||typeof e==='string'||e===null)assert.equal(a,e);
  else if(Array.isArray(e)){assert.ok(Array.isArray(a));assert.equal(a.length,e.length);e.forEach((v,i)=>close(a[i],v,atol,rtol));}
  else{assert.ok(a&&typeof a==='object');assert.deepEqual(Object.keys(a).sort(),Object.keys(e as object).sort());for(const[k,v]of Object.entries(e as object))close((a as Record<string,unknown>)[k],v,atol,rtol);}
}
function authorJS(cases:{e:PracticeExercise,input:Record<string,unknown>,expectError?:boolean}[]):unknown[]{
  const dir=mkdtempSync(join(tmpdir(),'rustml-concept-author-js-'));
  try{
    const source=join(dir,'author.mjs');
    // Immutable author snippets only: neither this file nor the child process reads learner drafts.
    writeFileSync(source,'const out=[];\n'+cases.map(({e,input,expectError})=>`{${e.solution.javascript}\nconst input=${JSON.stringify(input)};const before=JSON.stringify(input);${expectError?`let rejected=false;try{${e.solution.javascript.match(/^function (\w+)/)![1]}(...Object.values(input));}catch(error){if(!(error instanceof RangeError))throw error;rejected=true;}out.push(rejected);`:`out.push(${e.solution.javascript.match(/^function (\w+)/)![1]}(...Object.values(input)));`}if(before!==JSON.stringify(input))throw Error("input mutation");}`).join('\n')+'\nprocess.stdout.write(JSON.stringify(out));');
    const r=spawnSync(process.execPath,[source],{encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr||r.error?.message);return JSON.parse(r.stdout);
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test('concept core identities, granular authored content, three language variants, guided/A/B',()=>{
  const inventory=JSON.parse(readFileSync(new URL('../docs/practice-topic-inventory.json',import.meta.url),'utf8'));
  const expected=inventory.reference_concepts.filter((c:{source:string,id:string})=>c.source==='src/concepts.ts'&&c.id!=='concept.dot-product').map((c:{id:string})=>c.id);
  assert.equal(new Set(conceptCoreTopics.map(t=>t.id)).size,conceptCoreTopics.length);
  assert.equal(conceptCoreTopics.length,29);
  assert.deepEqual(conceptCoreTopics.map(t=>t.id).sort(),expected.sort());
  for(const t of conceptCoreTopics){
    assert.equal(t.lessonId,'math');assert.equal(t.sourceSection,`src/concepts.ts · ${t.id.slice(8)}`);
    assert.deepEqual(t.exercises.map(e=>e.id),['guided','transfer-a','transfer-b'].map(s=>t.id+'.'+s));
    for(const e of t.exercises){assert.ok(e.prompt.length>100&&e.formula.length>5&&e.explanation.length>25);assert.ok(e.hints.length&&e.fixtures.length);assert.ok(e.quiz.correctIndex<e.quiz.options.length&&e.quiz.correctIndex>=0);for(const lang of ['python','javascript','rust']as const){assert.notEqual(e.starter[lang],e.solution[lang]);assert.ok(!e.solution[lang].includes('todo!')&&!e.solution[lang].includes('NotImplementedError'));}}
  }
});
test('all public concept fixtures execute trusted authored JavaScript and preserve input',()=>authorJS(fixtures).forEach((a,i)=>close(a,fixtures[i].expected)));
test('authored JavaScript rejects invalid domains and dimensions in every kernel',()=>authorJS(invalid).forEach(v=>assert.equal(v,true)));

test('train fit produces transform-compatible parameters for tiny nonzero and constant variance',()=>{
  const result=authorJS(standardizerCases);
  result.forEach((value,index)=>close(value,standardizerCases[index].expected));
  const [mean,scale]=result[0] as number[];
  assert.ok(scale>=1e-12);
  const applied=authorJS([0,1e-13].map(x=>({e:by('train-validation-test','transfer-a'),input:{x,mean,scale}})));
  close(applied,[-.05,.05]);
  assert.match(by('train-validation-test').contractNote!,/scale=max\(1e−12,√variance\)/);
});

test('independent calculus and moment identities, finite differences, matrix and tensor oracles',()=>{
  const by=(id:string)=>all.find(e=>e.id===`concept.${id}.guided`)!;
  const results=authorJS([
    {e:by('chain-rule'),input:{x:.3,a:-2,b:.7,c:1.2}},
    {e:by('gradient'),input:{point:[.5,-.3],direction:[.6,.8]}},
    {e:by('variance'),input:{p:[.2,.3,.5],values:[-1,2,4]}},
    {e:by('matrix'),input:{a:[[2,-1,3]],b:[[1,2],[3,1],[-2,0]]}},
    {e:by('tensor'),input:{shape:[2,3,4],indices:[1,1,2]}},
  ]);
  const x=.3,h=1e-5,f=(v:number)=>(-2*v+.7)**2+1.2*v;
  close(results[0],(f(x+h)-f(x-h))/(2*h),1e-7,1e-6);
  const loss=(point:number[])=>(point[0]**2+8*point[1]**2)/2,point=[.5,-.3],dir=[.6,.8];
  const directional=(loss(point.map((a,i)=>a+h*dir[i]))-loss(point.map((a,i)=>a-h*dir[i])))/(2*h);
  close((results[1]as number[])[2],directional,1e-7,1e-6);
  const p=[.2,.3,.5],v=[-1,2,4],mean=p.reduce((s,a,i)=>s+a*v[i],0);
  close(results[2],p.reduce((s,a,i)=>s+a*v[i]**2,0)-mean**2);
  close(results[3],[[-7,3]]);close(results[4],[24,18]);
});
test('independent probability properties reject uniform softmax, missing normalization and wrong moment reduction',()=>{
  const by=(id:string)=>all.find(e=>e.id===`concept.${id}.guided`)!;
  const results=authorJS([{e:by('softmax'),input:{z:[1,2,3],temperature:1}},{e:by('entropy'),input:{p:[.25,.75]}},{e:by('probability'),input:{weights:[2,6]}}]);
  const z=[1,2,3],oracle=z.map(zi=>1/z.reduce((s,zj)=>s+Math.exp(zj-zi),0));
  close(results[0],oracle);assert.throws(()=>close([1/3,1/3,1/3],oracle));
  close(results[1],-.25*Math.log(.25)-.75*Math.log(.75));close(results[2],[.25,.75]);
  assert.throws(()=>close([2,6],[.25,.75]));
});

test('new calculus kernels agree with independent finite differences and probability oracle',()=>{
  const h=1e-5,x=.3,w=-.7,target=.4,z=[.2,-.3,.8],label=1,weights=[.4,-.7,1.2],strength=.3;
  const cases=[{e:by('backpropagation'),input:{x,w,target}},
    ...z.flatMap((_,j)=>[-h,h].map(delta=>({e:by('cross-entropy'),input:{z:z.map((a,i)=>a+(i===j?delta:0)),target:label}}))),
    {e:by('regularization'),input:{weights,strength}},
    {e:by('normalization'),input:{x:[-2,1,4],gamma:[2,1,.5],beta:[1,-1,0],eps:.25}},
    {e:by('normalization'),input:{x:[8,11,14],gamma:[2,1,.5],beta:[1,-1,0],eps:.25}},
    {e:by('loss'),input:{predictions:[-2,1,4],targets:[0,0,0]}},
  ];
  const r=authorJS(cases),loss=(xx:number,ww:number)=>{const q=xx*ww;return(q*q+q-target)**2/2;};
  close((r[0]as number[])[3],(loss(x+h,w)-loss(x-h,w))/(2*h),1e-7,1e-6);
  close((r[0]as number[])[4],(loss(x,w+h)-loss(x,w-h))/(2*h),1e-7,1e-6);
  const p=z.map(zi=>1/z.reduce((s,zj)=>s+Math.exp(zj-zi),0));
  z.forEach((_,j)=>close(((r[2+2*j]as number)-(r[1+2*j]as number))/(2*h),p[j]-(j===label?1:0),1e-7,1e-6));
  const penalty=(v:number[])=>strength*v.reduce((s,a)=>s+a*a,0)/2,l2=r[7]as number[];
  weights.forEach((_,j)=>close(l2[j+1],(penalty(weights.map((a,i)=>a+(i===j?h:0)))-penalty(weights.map((a,i)=>a-(i===j?h:0))))/(2*h),1e-7,1e-6));
  close(r[8],[1-6/2.5,-1,.6]);close(r[9],r[8]);close(r[10],7);
});

test('elementary derivative, coordinate and quadratic step identities are independent of fixtures',()=>{
  const x=-1.7,h=.125,delta=.2,point=[.4,-.3];
  const r=authorJS([
    {e:by('slope'),input:{x,h}},
    {e:by('limit'),input:{x,hs:[h,h/2,h/4]}},
    {e:by('derivative'),input:{x,delta}},
    {e:by('partial-derivative'),input:{point,axis:0,h:1e-4}},
    {e:by('partial-derivative'),input:{point,axis:1,h:1e-4}},
    ...[0,.2,1,1.8,2,2.4].map(eta=>({e:by('learning-rate'),input:{theta:3,gradient:3,eta}})),
  ]);
  close(r[0],2*x+h);close(r[1],[h,h/2,h/4],1e-10);
  close(r[2],[2*x,2*x*delta,2*x*delta+delta**2]);close(r[3],point[0],1e-7);close(r[4],8*point[1],1e-7);
  [0,.2,1,1.8,2,2.4].forEach((eta,j)=>{const after=r[j+5]as number;close(after,3*(1-eta));const beforeLoss=4.5,afterLoss=after**2/2;if(eta>0&&eta<2)assert.ok(afterLoss<beforeLoss);if(eta>2)assert.ok(afterLoss>beforeLoss);});
});

test('train-only statistics, epoch tail weights, initialization and separate AdamW decay',()=>{
  const r=authorJS([
    {e:by('train-validation-test'),input:{train:[-2,0,2]}},
    {e:by('train-validation-test','transfer-a'),input:{x:100,mean:0,scale:Math.sqrt(8/3)}},
    {e:by('train-validation-test','transfer-a'),input:{x:-100,mean:0,scale:Math.sqrt(8/3)}},
    {e:by('train-validation-test'),input:{train:[-2,0,2]}},
    {e:by('batches-epochs'),input:{n:7,batch_size:3}},
    {e:by('batches-epochs','transfer-b'),input:{means:[2,5,11],counts:[3,3,1]}},
    {e:by('initialization'),input:{fan_in:50,fan_out:150,kind:'xavier'}},
    {e:by('initialization'),input:{fan_in:50,fan_out:150,kind:'he'}},
    {e:by('adamw'),input:{theta:[3,-2],adaptive:[.4,-.7],eta:.2,strength:.3}},
    {e:by('overfitting'),input:{train_losses:[1,3,2],heldout_losses:[4,6]}},
  ]);
  close(r[0],[0,Math.sqrt(8/3)]);close(r[3],r[0]);close(r[1],100/Math.sqrt(8/3));close(r[2],-100/Math.sqrt(8/3));
  const partitions=r[4]as number[][];assert.deepEqual(partitions.flat(),[0,1,2,3,4,5,6]);assert.equal(partitions.length,3);
  close(r[5],[2,2,2,5,5,5,11].reduce((a,b)=>a+b)/7);
  assert.throws(()=>close((2+5+11)/3,r[5]));
  close(r[6],[.01,.1]);close(r[7],[.04,.2]);close(r[8],[2.74,-1.74]);close(r[9],[2,5,3]);
  // With zero data gradient, first-step Adam plus L2 scales the combined gradient.
  // Its update is different from the authored separate multiplicative weight decay.
  const separate=3*(1-.2*.3),coupled=3-.2*(.3*3)/(Math.abs(.3*3)+1e-8);
  assert.ok(Math.abs(separate-coupled)>.01);
});

test('typed undefined metrics and threshold equality have independent confusion oracles',()=>{
  const inputs=[{p:[.5,.4,.9,.1],labels:[1,1,0,0],threshold:.5},
    {p:[0,0,0],labels:[0,0,1],threshold:.5},
    {p:[.8,.2],labels:[0,0],threshold:.5}];
  const result=authorJS(inputs.map(input=>({e:by('evaluation'),input})));
  inputs.forEach(({p,labels,threshold},j)=>{
    const predicted=p.map(v=>Number(v>=threshold));
    const tp=labels.filter((y,i)=>y===1&&predicted[i]===1).length;
    const fp=labels.filter((y,i)=>y===0&&predicted[i]===1).length;
    const fn=labels.filter((y,i)=>y===1&&predicted[i]===0).length;
    const tn=labels.filter((y,i)=>y===0&&predicted[i]===0).length;
    close(result[j],{accuracy:(tp+tn)/p.length,precisionDefined:tp+fp!==0,precision:tp+fp?tp/(tp+fp):0,recallDefined:tp+fn!==0,recall:tp+fn?tp/(tp+fn):0,counts:[tp,fp,fn,tn]});
  });
});

test('author Python/Rust fixture audit (opt-in)',{skip:process.env.PRACTICE_VERIFY_ALL_LANGUAGES!=='1'},()=>{
  const dir=mkdtempSync(join(tmpdir(),'rustml-concept-authors-'));
  try{
    const py=join(dir,'authors.py');
    writeFileSync(py,'import json\noutputs=[]\n'+fixtures.map(({e,input})=>e.solution.python+`\ndata=json.loads(${JSON.stringify(JSON.stringify(input))})\noutputs.append(${e.solution.python.match(/def (\w+)/)![1]}(*data.values()))`).join('\n')+'\n'+invalid.map(({e,input})=>e.solution.python+`\ndata=json.loads(${JSON.stringify(JSON.stringify(input))})\ntry:\n    ${e.solution.python.match(/def (\w+)/)![1]}(*data.values())\n    raise AssertionError("invalid domain accepted")\nexcept ValueError:\n    pass\n`).join('\n')+'\n'+by('function').solution.python+'\ntry:\n    quadratic(True)\n    raise AssertionError("bool accepted as number")\nexcept ValueError:\n    pass\nprint(json.dumps(outputs))');
    const python=spawnSync(process.env.PRACTICE_PYTHON||'python',[py],{encoding:'utf8',timeout:30000,env:{...process.env,PYTHONUTF8:'1'}});assert.equal(python.status,0,python.stderr||python.error?.message);const pyResult=JSON.parse(python.stdout)as unknown[];assert.equal(pyResult.length,fixtures.length);pyResult.forEach((a,i)=>{close(a,fixtures[i].expected);if(fixtures[i].e.topicId==='concept.train-validation-test'&&Array.isArray(a))assert.ok((a as number[])[1]>=1e-12);});
    const literal=(v:unknown,type?:string):string=>{
      if(typeof v==='string')return JSON.stringify(v);if(typeof v==='boolean')return String(v);
      if(Array.isArray(v)){if(type==='&[usize]')return'&['+v.map(a=>`${a}usize`).join(',')+']';if(v.some(Array.isArray))return'&vec!['+v.map(row=>'vec!['+(row as unknown[]).map(a=>literal(a)).join(',')+']').join(',')+']';return'&['+v.map(a=>literal(a)).join(',')+']';}
      if(type==='usize'||type==='u32')return String(v)+type;
      assert.equal(typeof v,'number');if(Number.isNaN(v))return'f64::NAN';return Object.is(v,-0)?'-0.0':Number.isInteger(v)?`${v}.0`:String(v);
    };
    const checks=(path:string,v:unknown):string=>{
      if(typeof v==='number')return`check(${path} as f64,${literal(v)});`;if(typeof v==='boolean')return`assert_eq!(${path},${v});`;
      if(Array.isArray(v))return`assert_eq!(${path}.len(),${v.length});`+v.map((a,i)=>checks(`${path}[${i}]`,a)).join('');
      return Object.entries(v as object).map(([k,a])=>checks(path+'.'+k,a)).join('');
    };
    const modules=all.map((e,i)=>{
      const name=e.solution.rust.match(/pub fn (\w+)/)![1],types=e.solution.rust.match(/pub fn \w+\(([^)]*)\)/)![1].split(',').map(p=>p.trim().split(':').slice(1).join(':').trim());
      return`mod m${i}{use super::check;${e.solution.rust}\npub fn verify(){${fixtures.filter(c=>c.e.id===e.id).map(({input,expected})=>`let v=${name}(${Object.values(input).map((a,j)=>literal(a,types[j])).join(',')}).unwrap();${checks('v',expected)}${e.topicId==='concept.train-validation-test'&&Array.isArray(expected)?'assert!(v[1]>=1e-12);':''}`).join('\n')}\n${invalid.filter(c=>c.e.id===e.id).map(({input})=>`assert!(${name}(${Object.values(input).map((a,j)=>literal(a,types[j])).join(',')}).is_err());`).join('\n')}}}`;
    }).join('\n');
    const rs=join(dir,'authors.rs'),exe=join(dir,process.platform==='win32'?'authors.exe':'authors');
    writeFileSync(rs,'fn check(a:f64,e:f64){assert!(a.is_finite());assert!((a-e).abs()<=1e-12+1e-10*e.abs(),"{} != {}",a,e);}\n'+modules+'\nfn main(){'+all.map((_,i)=>`m${i}::verify();`).join('')+'}');
    const compile=spawnSync(process.env.PRACTICE_RUSTC||'rustc',['--edition=2021',rs,'-o',exe],{encoding:'utf8',timeout:60000});assert.equal(compile.status,0,compile.stderr||compile.error?.message);
    const run=spawnSync(exe,[],{encoding:'utf8',timeout:15000});assert.equal(run.status,0,run.stderr||run.error?.message);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
