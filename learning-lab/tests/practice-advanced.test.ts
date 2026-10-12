import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { advancedPracticeTopics } from '../src/practice/advanced-catalog.ts';
import { activation, activationDerivative, mergeBpePair } from '../src/tokenAdaptationMath.ts';
import { imagePatches } from '../src/visionRoutingMath.ts';
import { memoryStep } from '../src/efficientSequenceMath.ts';
import { speculativeKernel } from '../src/inferenceFrontierMath.ts';
import { splineBasis } from '../src/representationFrontierMath.ts';

const exercises=advancedPracticeTopics.flatMap(t=>t.exercises);
const refs=advancedPracticeTopics.map(t=>t.exercises[0]);
const index=(id:string)=>{
  const n=advancedPracticeTopics.findIndex(t=>t.id===id);
  assert.ok(n>=0,id);return n;
};
type Case={topic:number;values:number[]};
function close(actual:unknown,expected:unknown,atol=1e-12,rtol=1e-10):void {
  if(Array.isArray(expected)){
    assert.ok(Array.isArray(actual));assert.equal(actual.length,expected.length);
    expected.forEach((x,i)=>close(actual[i],x,atol,rtol));return;
  }
  assert.equal(typeof actual,'number');assert.equal(typeof expected,'number');
  assert.ok(Number.isFinite(actual));
  assert.ok(Math.abs((actual as number)-(expected as number))<=atol+rtol*Math.abs(expected as number),`${actual} != ${expected}`);
}
/** Only fixed imported author references are executed. This cannot accept editor source or learner drafts. */
function runReferences(cases:Case[],language:'javascript'|'python'|'rust'='javascript'):number[][] {
  const dir=mkdtempSync(join(tmpdir(),'rustml-advanced-author-'));
  try {
    let command=process.execPath,args:string[];
    if(language==='javascript'){
      const file=join(dir,'references.mjs');
      writeFileSync(file,`const functions=[];\n${refs.map(item=>`{${item.solution.javascript}\nfunctions.push(solve);}`).join('\n')}\nconst cases=${JSON.stringify(cases)}; const before=JSON.stringify(cases); const results=cases.map(c=>functions[c.topic](c.values));if(before!==JSON.stringify(cases))throw Error('mutation');process.stdout.write(JSON.stringify(results));`);
      args=[file];
    } else if(language==='python'){
      command=process.env.PRACTICE_PYTHON??(process.platform==='win32'?'python':'python3');
      const file=join(dir,'references.py');
      writeFileSync(file,`import json\nfunctions=[]\n${refs.map(item=>`scope={}\nexec(${JSON.stringify(item.solution.python)},scope)\nfunctions.append(scope['solve'])`).join('\n')}\ncases=json.loads(${JSON.stringify(JSON.stringify(cases))})\nbefore=json.dumps(cases)\nresults=[functions[c['topic']](c['values']) for c in cases]\nassert before==json.dumps(cases)\nprint(json.dumps(results))\n`);
      args=['-X','utf8',file];
    } else {
      command=process.env.PRACTICE_RUSTC??'rustc';
      const file=join(dir,'references.rs'),binary=join(dir,'references.exe');
      const literal=(v:number)=>Object.is(v,-0)?'-0.0':Number.isInteger(v)?`${v}.0`:String(v);
      writeFileSync(file,`${refs.map((item,i)=>`mod r${i} {${item.solution.rust}}`).join('\n')}\nfn main(){\n${cases.map(c=>`println!("{:?}",r${c.topic}::solve(&[${c.values.map(literal).join(',')}]).unwrap());`).join('\n')}\n}`);
      const compiled=spawnSync(command,[file,'--edition=2021','-o',binary],{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});
      assert.equal(compiled.status,0,compiled.stderr||compiled.error?.message);
      const result=spawnSync(binary,[],{encoding:'utf8',timeout:15000,maxBuffer:16*1024*1024});
      assert.equal(result.status,0,result.stderr||result.error?.message);
      return result.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
    }
    const result=spawnSync(command,args,{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});
    assert.equal(result.status,0,result.stderr||result.error?.message);
    return JSON.parse(result.stdout);
  } finally {rmSync(dir,{recursive:true,force:true});}
}
const fixtures=exercises.flatMap(e=>e.fixtures.map(f=>({topic:index(e.topicId),values:JSON.parse(f.input).values as number[]})));
const fixtureExpected=exercises.flatMap(e=>e.fixtures.map(f=>JSON.parse(f.output)));
const at=(id:string,values:number[]):Case=>({topic:index(id),values});

test('advanced/frontiers inventory: 26 real units, 78 granular formative exercises and 234 language references',()=>{
  const inventory=JSON.parse(readFileSync(new URL('../docs/practice-topic-inventory.json',import.meta.url),'utf8'));
  const ids=inventory.units.filter((u:{route:string})=>['#advanced','#frontiers'].includes(u.route)).map((u:{id:string})=>u.id);
  assert.deepEqual(advancedPracticeTopics.map(t=>t.id).sort(),ids.sort());
  assert.equal(advancedPracticeTopics.length,26);assert.equal(exercises.length,78);
  assert.equal(new Set(exercises.map(e=>e.id)).size,78);
  for(const topic of advancedPracticeTopics){
    assert.ok(topic.sourceSection && topic.prerequisites.length);
    assert.equal(topic.lessonId,topic.id.startsWith('unit.advanced.')?'advanced':'frontiers');
    assert.deepEqual(topic.exercises.map(e=>e.id),['guided','transfer-a','transfer-b'].map(s=>`${topic.id}.${s}`));
    assert.deepEqual(topic.exercises.map(e=>e.mode),['guided','transfer','transfer']);
    assert.equal(new Set(topic.exercises.map(e=>e.prompt)).size,3);
    assert.equal(new Set(topic.exercises.map(e=>e.quiz.question)).size,3);
    for(const e of topic.exercises){
      assert.deepEqual(e.solution,topic.exercises[0].solution); // variants transfer the same fragment to new inputs
      assert.ok(e.prompt.includes('Покрытый subskill:')&&e.prompt.includes('не реализованы') || e.prompt.includes('не установлены'),e.id);
      assert.ok(e.formula.length>20&&e.hints.length>=2&&e.explanation.length>100);
      assert.equal(new Set(e.quiz.options).size,e.quiz.options.length);
      assert.ok(e.quiz.correctIndex>=0&&e.quiz.correctIndex<e.quiz.options.length);
      for(const lang of ['python','javascript','rust'] as const){
        assert.notEqual(e.starter[lang],e.solution[lang]);
        assert.ok(e.solution[lang].length>150&&!e.solution[lang].includes('todo!')&&!e.solution[lang].includes('NotImplementedError'));
      }
    }
  }
});

for(const language of ['javascript','python','rust'] as const){
  test(`all 234 public fixtures execute trusted ${language} references`,()=>{
    runReferences(fixtures,language).forEach((out,i)=>close(out,fixtureExpected[i]));
  });
}

test('local backward: independent forward finite differences, including residual paths, stop-gradient and freeze conventions',()=>{
  const probes:[string,number[],(v:number[])=>number,[number,number][]][]=[
    ['unit.advanced.full-transformer',[.7,-.4,.2,1.3,-.2],v=>(v[0]+v[3]*Math.tanh(v[1]*v[0]+v[2])-v[4])**2,[[1,2],[2,3],[3,4],[0,5]]],
    ['unit.advanced.swiglu',[-.8,1.7],v=>v[0]/(1+Math.exp(-v[0]))*v[1],[[0,1],[1,2]]],
    ['unit.advanced.lora',[.8,1.3,-.6,.4,2],v=>v[1]*v[0]+v[4]*v[3]*(v[2]*v[0]),[[2,1],[3,2]]],
    ['unit.frontier.dpo',[-.2,-1.1,-.5,-.8,.7],v=>-Math.log(1/(1+Math.exp(-v[4]*((v[0]-v[2])-(v[1]-v[3]))))),[[0,1],[1,2]]],
    ['unit.frontier.vit-training',[1.3,.4,-.2,.6,.1,0],v=>(v[1]*v[0]+v[2]-v[3])**2,[[1,1],[2,2]]],
    ['unit.frontier.moe-training',[.4,1.3,-.6,.2,.8],v=>{const p=Math.exp(v[0])/(Math.exp(v[0])+1),y=p*v[1]+(1-p)*v[2];return (y-v[3])**2+v[4]*(2*(p*p+(1-p)**2)-1);},[[0,4]]],
    ['unit.frontier.ssm-training',[.4,1.7,-.8],v=>{let state=v[1]*v[2];for(let i=0;i<5;i++)state*=Math.tanh(v[0]);return state;},[[0,2],[1,3]]],
    ['unit.frontier.denoiser-training',[1.3,.4,-.5,.8,.7],v=>(v[2]*v[0]+v[3]*v[1]-v[4])**2,[[2,2],[3,3]]],
    ['unit.frontier.jepa',[.3,-.4,.8,.9,.6],v=>(v[0]-v[1])**2/2,[[0,1]]],
  ];
  const outputs=runReferences(probes.map(([id,v])=>at(id,v)));
  for(const language of ['python','rust'] as const)runReferences(probes.map(([id,v])=>at(id,v)),language).forEach((out,i)=>close(out,outputs[i]));
  probes.forEach(([,v,forward,coordinates],i)=>{
    for(const [coordinate,output] of coordinates){
      const plus=[...v],minus=[...v],h=1e-5;plus[coordinate]+=h;minus[coordinate]-=h;
      close(outputs[i][output],(forward(plus)-forward(minus))/(2*h),1e-7,1e-6);
    }
  });
  close(outputs[4].slice(3),[.4,-.2]); // frozen head retains its weights despite nonzero gradient
  close(outputs[8][2],0); // detached target is a deliberate backward convention, not numeric differentiation of target
  assert.ok(outputs[0][5]!==outputs[0][3]*probes[0][1][1]); // direct residual contribution survives
});

test('existing mechanisms agree: BPE non-overlap, SiLU derivative, ViT order, addressed memory, speculative law and spline basis',()=>{
  const cases=[at('unit.advanced.bpe',[1,1,9,1,1,1]),at('unit.advanced.swiglu',[-1.2,2]),at('unit.advanced.vit',Array.from({length:16},(_,i)=>i)),at('unit.advanced.ssm',[2,3,1,-1,.8,.6]),at('unit.frontier.speculative',[.7,.2]),at('unit.frontier.kan',[-.25,2,4,8])];
  const out=runReferences(cases);
  close(out[0],mergeBpePair(['1','1','1'],{left:'1',right:'1'}).map(t=>t==='11'?9:Number(t)));
  close(out[1],[activation(-1.2,'swiglu')*2,activationDerivative(-1.2,'swiglu')*2,activation(-1.2,'swiglu')]);
  close(out[2],imagePatches(Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>r*4+c))).flatMap(patch=>patch.pixels));
  const step=memoryStep([[2,3]],[0,1],[-1],.8,.6,true);
  close(out[3],[...step.state[0],step.error[0]]);
  const spec=speculativeKernel([.7,.3],[.2,.8]);
  close(out[4],[...spec.acceptance,...spec.residual,spec.rejected,...spec.exact]);
  const basis=splineBasis(-.25,3);close(out[5],[basis.reduce((s,x,i)=>s+x*[2,4,8][i],0),...basis]);
});

test('online recurrence: many keys agrees with independently normalized full exponentials and order permutations',()=>{
  const id='unit.advanced.online-attention';
  for(const pairs of [[[0,2],[Math.log(2),4],[-1,-3]],[[1000,2],[999,4],[998,-3]],[[0,2],[0,4],[0,-3]]]){
    let state=[0,0,0];
    for(const [score,value] of pairs){const result=runReferences([at(id,[...state,score,value])])[0];state=result.slice(0,3);}
    // Ratio-based oracle never uses the online m/l/u recurrence.
    const expected=pairs.reduce((s,[score,value])=>s+value/pairs.reduce((z,[other])=>z+Math.exp(other-score),0),0);
    close(state[2]/state[1],expected);
    let reversed=[0,0,0];
    for(const [score,value] of [...pairs].reverse())reversed=runReferences([at(id,[...reversed,score,value])])[0].slice(0,3);
    close(reversed[2]/reversed[1],expected);
  }
});

test('geometry and rendering: xyz rotations/translations/reflections, conserved center and homogeneous split',()=>{
  const source=[.3,-.7,.2,1.1,.5,-.4,.6],id='unit.frontier.egnn';
  const rotate=(v:number[])=>[-v[1],v[0],v[2]];
  const transform=(v:number[])=>rotate(v).map((x,i)=>x+[2,-1,.7][i]);
  const transformed=[...transform(source.slice(0,3)),...transform(source.slice(3,6)),source[6]];
  const reflected=[...source.slice(0,6).map((x,i)=>i%3===0?-x:x),source[6]];
  const out=runReferences([at(id,source),at(id,transformed),at(id,reflected)]);
  close(out[1],[...transform(out[0].slice(0,3)),...transform(out[0].slice(3,6)),out[0][6]]);
  close(out[2],[...out[0].slice(0,6).map((x,i)=>i%3===0?-x:x),out[0][6]]);
  close([0,1,2].map(i=>out[0][i]+out[0][i+3]),[0,1,2].map(i=>source[i]+source[i+3]));
  const rendered=runReferences([at('unit.frontier.neural-fields',[.7,.6,.3,.7,.4,.3,.8]),at('unit.frontier.neural-fields',[.7,1,.3,0,0,0,.8])]);
  close(rendered[0],rendered[1]);
  close(rendered[0],[.3*(1-Math.exp(-.7))+.8*Math.exp(-.7),1-Math.exp(-.7),Math.exp(-.7)]);
});

test('remaining formula properties: symmetric CE, flow endpoints, patch effect, quantization error, masks, frozen EMA and training targets',()=>{
  const matrix=[.7,-.3,.2,1.1];
  const cases=[at('unit.frontier.clip',matrix),at('unit.frontier.clip',[matrix[3],matrix[2],matrix[1],matrix[0]]),at('unit.frontier.flow',[2,-3,.4]),at('unit.frontier.interpretability',[2,3,1,-2,1,0]),at('unit.frontier.quantization',[-1.25,.5,0]),at('unit.frontier.masked-text',[.5,.25,1,1]),at('unit.frontier.jepa',[0,0,2,100,1]),at('unit.advanced.mla',[2,3,1,-1,4,2,7]),at('unit.advanced.denoisers',[2,3,0,100,100]),at('unit.frontier.long-context',[0,100,4,3,0])];
  const o=runReferences(cases);
  // Independent CE oracle works directly with class probability ratios at moderate logits.
  const ce=(positive:number,negative:number)=>Math.log(1+Math.exp(negative-positive));
  close(o[0],[(ce(.7,-.3)+ce(1.1,.2)+ce(.7,.2)+ce(1.1,-.3))/4]);close(o[0],o[1]);
  close(o[2],[0,-5]);close(o[3],[1*2-2*3,1*2-2*0,6]);close(o[4],[-2,-1,.25]);
  close(o[5],[(-Math.log(.5)-Math.log(.25))/2,2]);close(o[6],[0,0,0,2]);close(o[7],[-1,-4,-2,7,14]);close(o[8],[2,3,2]);close(o[9],[1,0]);
  const ssm=runReferences([at('unit.frontier.ssm-training',[Math.atanh(.5),2,1])])[0];
  assert.throws(()=>close(ssm[2],5*2*.5**4)); // omitted tanh chain rule
  const denoise=runReferences([at('unit.frontier.denoiser-training',[2,1,2,1,0])])[0];
  assert.throws(()=>close(denoise[1],denoise[4]**2)); // display-clipped loss mutant
  const router=runReferences([at('unit.frontier.moe-training',[Math.log(3),2,2,0,1])])[0];
  assert.ok(router[2]>0&&router[1]===4&&router[4]!==0); // balance can move while data MSE stays fixed
});

test('all three language references reject malformed inputs plus all constrained domains',()=>{
  const invalid:Case[]=[
    at('unit.advanced.bpe',[1,1,1,1]),at('unit.advanced.bpe',[1,2,9,1.5]),at('unit.advanced.lora',[1,1,1,1,-1]),at('unit.advanced.moe',[.5,.5,.5,1,1,1,1]),at('unit.advanced.moe',[.5,.5,0,1,1,1,.5]),at('unit.advanced.mla',[1,1,1,1,1,1,0]),at('unit.advanced.online-attention',[0,0,1,1,1]),at('unit.advanced.online-attention',[0,-1,0,1,1]),at('unit.advanced.ssm',[1,1,2,1,1,1]),at('unit.advanced.ssm',[1,1,0,1,2,1]),at('unit.advanced.denoisers',[1,1,2,1,1]),
    at('unit.frontier.flow',[0,1,-1]),at('unit.frontier.interpretability',[1,1,1,1,2,0]),at('unit.frontier.egnn',[0,0,0,1,1,1,2]),at('unit.frontier.neural-fields',[-1,1,1,1,1,1,1]),at('unit.frontier.neural-fields',[1,1,2,1,1,1,1]),at('unit.frontier.dpo',[1,0,0,0,1]),at('unit.frontier.dpo',[-1,-1,-1,-1,-1]),at('unit.frontier.quantization',[1,0,0]),at('unit.frontier.quantization',[1,1,.5]),at('unit.frontier.speculative',[1.1,.5]),at('unit.frontier.long-context',[0,0,0,1,1]),at('unit.frontier.long-context',[0,0,1,1.5,1]),at('unit.frontier.jepa',[0,0,0,0,2]),at('unit.frontier.masked-text',[0,.5,1,0]),at('unit.frontier.masked-text',[.5,.5,.5,0]),at('unit.frontier.kan',[2,1,1,1]),at('unit.frontier.vit-training',[1,1,1,1,2,1]),at('unit.frontier.moe-training',[0,1,1,1,-1]),at('unit.frontier.denoiser-training',[1,2,1,1,1]),
  ];
  const dir=mkdtempSync(join(tmpdir(),'rustml-author-domain-'));
  try {
    const file=join(dir,'invalid.mjs');
    writeFileSync(file,`const f=[];${refs.map(e=>`{${e.solution.javascript}f.push(solve);}`).join('\n')}\nfunction reject(fn,arg){let yes=false;try{fn(arg);}catch(e){yes=e instanceof RangeError;}if(!yes)throw Error('accepted invalid input '+JSON.stringify(arg));}\nfor(const fn of f){reject(fn,[]);reject(fn,null);reject(fn,[NaN]);reject(fn,[Infinity]);}\nconst cases=${JSON.stringify(invalid)};for(const c of cases)reject(f[c.topic],c.values);\n${fixtures.map(c=>`reject(f[${c.topic}],${JSON.stringify(c.values.map((x,i)=>i===0?1001:x))});`).join('\n')}`);
    const result=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);
    const python=process.env.PRACTICE_PYTHON??(process.platform==='win32'?'python':'python3');
    const pyfile=join(dir,'invalid.py');
    writeFileSync(pyfile,`import math\nfunctions=[]\n${refs.map(e=>`scope={}\nexec(${JSON.stringify(e.solution.python)},scope)\nfunctions.append(scope['solve'])`).join('\n')}\ndef reject(fn,arg):\n    try:\n        fn(arg)\n    except ValueError:\n        return\n    raise AssertionError('accepted invalid input')\nfor fn in functions:\n    for arg in [[],None,[float('nan')],[float('inf')],[True]]:\n        reject(fn,arg)\ncases=${JSON.stringify(invalid)}\nfor case in cases:\n    reject(functions[case['topic']],case['values'])\n`);
    const pyresult=spawnSync(python,['-X','utf8',pyfile],{encoding:'utf8',timeout:15000});assert.equal(pyresult.status,0,pyresult.stderr);
    const rustc=process.env.PRACTICE_RUSTC??'rustc';
    const rsfile=join(dir,'invalid.rs'),binary=join(dir,'invalid.exe');
    const rsNumber=(v:number)=>Number.isInteger(v)?`${v}.0`:String(v);
    writeFileSync(rsfile,`${refs.map((e,i)=>`mod r${i}{${e.solution.rust}}`).join('\n')}\nfn main(){\n${refs.map((_,i)=>`assert!(r${i}::solve(&[]).is_err());assert!(r${i}::solve(&[f64::NAN]).is_err());assert!(r${i}::solve(&[f64::INFINITY]).is_err());`).join('\n')}\n${invalid.map(c=>`assert!(r${c.topic}::solve(&[${c.values.map(rsNumber).join(',')}]).is_err());`).join('\n')}\n}`);
    const compiled=spawnSync(rustc,[rsfile,'--edition=2021','-o',binary],{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});assert.equal(compiled.status,0,compiled.stderr);
    const rsresult=spawnSync(binary,[],{encoding:'utf8',timeout:15000});assert.equal(rsresult.status,0,rsresult.stderr);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('MoE ties include signed zero consistently in all three languages',()=>{
  const cases=[at('unit.advanced.moe',[-0,0,1,2,4,8,1]),at('unit.advanced.moe',[0,-0,1,2,4,8,1])];
  for(const language of ['javascript','python','rust'] as const)runReferences(cases,language).forEach(out=>close(out,[8,2,0]));
});
