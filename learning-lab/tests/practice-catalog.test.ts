import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { practiceTopics, practiceRelease, type PracticeExercise } from '../src/practice/catalog.ts';

const exercises = practiceTopics.flatMap(topic => topic.exercises);
const exercise = (id: string) => {
  const found = exercises.find(item => item.id === id);
  assert.ok(found, id);
  return found;
};
function close(actual: unknown, expected: unknown, atol = 1e-12, rtol = 1e-10) {
  if (typeof expected === 'boolean' || typeof expected === 'string') {
    assert.equal(actual,expected);
  } else if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number');
    assert.ok(Number.isFinite(actual as number), `non-finite: ${actual}`);
    assert.ok(Math.abs((actual as number) - expected) <= atol + rtol * Math.abs(expected), `${actual} != ${expected}`);
  } else if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual));
    assert.equal(actual.length, expected.length);
    expected.forEach((value, i) => close(actual[i], value, atol, rtol));
  } else {
    assert.ok(expected !== null && typeof expected === 'object');
    assert.ok(actual !== null && typeof actual === 'object');
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
    for (const key of Object.keys(expected)) close((actual as Record<string,unknown>)[key], (expected as Record<string,unknown>)[key], atol, rtol);
  }
}
type ReferenceCase = { item: PracticeExercise; input: Record<string,unknown> };
// Only immutable author solutions imported above are executed in a local child process.
// This harness accepts neither editor/draft content nor external source; it is not a learner runner.
function authorJavascript(cases: ReferenceCase[]) {
  const program = `const outputs=[];\n${cases.map(({item,input}) => {
    const name = item.solution.javascript.match(/^function (\w+)/)?.[1];
    assert.ok(name);
    return `{ ${item.solution.javascript}\nconst input=${JSON.stringify(input)};const before=JSON.stringify(input);const result=${name}(...Object.values(input));if(before!==JSON.stringify(input))throw new Error("input mutation");outputs.push(result); }`;
  }).join('\n')}\nprocess.stdout.write(JSON.stringify(outputs));`;
  const directory=mkdtempSync(join(tmpdir(),'rustml-author-js-'));
  try {
    const source=join(directory,'reference.mjs');
    writeFileSync(source,program);
    const result = spawnSync(process.execPath, [source], {encoding:'utf8',timeout:15000});
    assert.equal(result.status,0,result.stderr || result.error?.message);
    return JSON.parse(result.stdout) as unknown[];
  } finally { rmSync(directory,{recursive:true,force:true}); }
}
const fixtureCases: ReferenceCase[] = exercises.flatMap(item => item.fixtures.map(f => ({item,input:JSON.parse(f.input)})));
const fixtureExpected = exercises.flatMap(item => item.fixtures.map(f => JSON.parse(f.output)));
const isFiniteDifference = (item: PracticeExercise) => item.topicId === 'unit.backprop.check';

test('catalog: semantic identity, actual inventory/lesson locations, complete three-language content', () => {
  assert.equal(practiceRelease,'2026-10-v1');
  const inventory = JSON.parse(readFileSync(new URL('../docs/practice-topic-inventory.json',import.meta.url),'utf8'));
  const ids: string[] = [...inventory.units,...inventory.reference_concepts].map((item:{id:string})=>item.id);
  assert.equal(new Set(practiceTopics.map(t=>t.id)).size,practiceTopics.length);
  assert.equal(new Set(exercises.map(e=>e.id)).size,exercises.length);
  for (const topic of practiceTopics) {
    assert.ok(ids.includes(topic.id) || ids.some(id=>topic.id.startsWith(id+'.')),topic.id);
    assert.ok(['neuron','loss','backprop','optimizers','network','transformer','math'].includes(topic.lessonId));
    assert.ok(topic.sourceSection && topic.prerequisites.length);
    for (const item of topic.exercises) {
      assert.equal(item.topicId,topic.id);
      assert.ok(item.prompt.length>100 && item.formula.length>5 && item.explanation.length>30,item.id);
      assert.ok(item.hints.length && item.fixtures.length);
      assert.ok(item.quiz.correctIndex>=0 && item.quiz.correctIndex<item.quiz.options.length);
      assert.equal(new Set(item.quiz.options).size,item.quiz.options.length);
      for (const language of ['python','javascript','rust'] as const) {
        assert.ok(item.starter[language].length>40 && item.solution[language].length>60,item.id+language);
        assert.notEqual(item.starter[language],item.solution[language]);
        assert.ok(!item.solution[language].includes('todo!') && !item.solution[language].includes('NotImplementedError'));
      }
    }
  }
  for (const id of ['unit.transformer.attention.softmax','unit.backprop.shared','unit.optimizer.sgd']) {
    const topic = practiceTopics.find(t=>t.id===id)!;
    assert.deepEqual(topic.exercises.map(e=>[e.id,e.mode]),[[id+'.guided','guided'],[id+'.transfer-a','transfer'],[id+'.transfer-b','transfer']]);
    assert.notEqual(topic.exercises[1].prompt,topic.exercises[2].prompt);
    assert.notEqual(topic.exercises[1].quiz.question,topic.exercises[2].quiz.question);
  }
});

test('all public fixtures: trusted JavaScript references, numerical tolerances, no input mutation', () => {
  authorJavascript(fixtureCases).forEach((actual,i)=>close(actual,fixtureExpected[i],isFiniteDifference(fixtureCases[i].item)?1e-7:1e-12,isFiniteDifference(fixtureCases[i].item)?1e-6:1e-10));
});

// Independent oracle uses pairwise exponential ratios, not max-shift normalization.
function softmaxOracle(z: number[]) {
  return z.map(zi=>1/z.reduce((total,zj)=>total+Math.exp(zj-zi),0));
}
test('softmax: independent ratio oracle, common shift, permutation, unequal logits and legal underflow', () => {
  const item=exercise('unit.transformer.attention.softmax.guided');
  const arrays=[[0,0],[1,2,3],[-10000,10000],[-3,0,2,1],[1000,1001],[-1000],[-0.5,1.2,0.3]];
  const outputs=authorJavascript(arrays.flatMap(z=>[{item,input:{logits:z}},{item,input:{logits:z.map(x=>x+(z.includes(10000)?0:1))}},{item,input:{logits:[...z].reverse()}}])) as number[][];
  arrays.forEach((z,i)=>{
    // ±10000 endpoints must stay inside contract, so their shift case is separate below.
    close(outputs[i*3],softmaxOracle(z));
    close(outputs[i*3+1],outputs[i*3]);
    close(outputs[i*3+2],[...outputs[i*3]].reverse());
    close(outputs[i*3].reduce((sum,p)=>sum+p,0),1);
    assert.ok(outputs[i*3].every(p=>p>=0));
  });
});

function forward(input: Record<string,unknown>, kind: 'base'|'a'|'b') {
  const x=input.x as number,w=input.w as number,b=input.b as number;
  // Evaluate the original expression independently of analytic gradients.
  const q=w*x+b;
  return q*q+(kind==='a'?2:1)*q+(kind==='b'?w*x:0);
}
function finiteDifference(input: Record<string,unknown>, kind: 'base'|'a'|'b') {
  const h=1e-5;
  return Object.fromEntries(['x','w','b'].map(key=>{
    const value=input[key] as number;
    return ['d'+key,(forward({...input,[key]:value+h},kind)-forward({...input,[key]:value-h},kind))/(2*h)];
  }));
}
test('shared node: independent forward finite differences for base and both transfer graphs', () => {
  const inputs=[{x:2,w:3,b:1},{x:1,w:-1,b:0.5},{x:0,w:2,b:1},{x:-1.25,w:0,b:2},{x:0.3,w:-2,b:0.1}];
  for (const [suffix,kind] of [['guided','base'],['transfer-a','a'],['transfer-b','b']] as const) {
    const item=exercise('unit.backprop.shared.'+suffix);
    const outputs=authorJavascript(inputs.map(input=>({item,input}))) as Record<string,number>[];
    outputs.forEach((actual,i)=>{
      close(actual.q,inputs[i].w*inputs[i].x+inputs[i].b);
      close(actual.loss,forward(inputs[i],kind));
      const numerical=finiteDifference(inputs[i],kind);
      for(const key of ['dx','dw','db'])close(actual[key],numerical[key],1e-7,1e-6);
    });
  }
});

test('SGD: coordinate rule, fixed-gradient composition, actual quadratic steps and growth case', () => {
  const item=exercise('unit.optimizer.sgd.guided');
  const inputs=[{theta:[2,1],grad:[2,8],eta:.1},{theta:[2,1],grad:[2,8],eta:.3},{theta:[-3,2,1],grad:[0,-2,4],eta:0},{theta:[2,-1],grad:[6,-12],eta:.1},{theta:[2,-1],grad:[6,-12],eta:.2}];
  const outputs=authorJavascript(inputs.map(input=>({item,input}))) as number[][];
  outputs.forEach((actual,i)=>close(actual,inputs[i].theta.map((t,j)=>t-inputs[i].eta*inputs[i].grad[j])));
  const loss=(xy:number[],lambda:number[])=>xy.reduce((sum,v,i)=>sum+lambda[i]*v*v/2,0);
  close(loss([2,1],[1,8]),6);close(loss(outputs[0],[1,8]),1.78);close(loss(outputs[1],[1,8]),8.82);
  close(loss(outputs[3],[3,12]),3.18);close(loss(outputs[4],[3,12]),12.72);
  const second=authorJavascript([{item,input:{theta:outputs[0],grad:[2,8],eta:.2}},{item,input:{theta:outputs[3],grad:outputs[3].map((v,i)=>v*[3,12][i]),eta:.1}}]) as number[][];
  close(second[0],outputs[1]);close(second[1],[.98,-.04]);close(loss(second[1],[3,12]),1.4502);
});

test('fixtures independent: dot/affine, batch axes, reduction, stable logit BCE, momentum convention', () => {
  close(2*3-1*4,2);
  close([1,2].reduce((sum,x,i)=>sum+x*[2,-1][i],0)+3,3);
  close([[1,2],[-1,0]].map(row=>[[2,3],[-1,4],[0,2]].map((w,j)=>row[0]*w[0]+row[1]*w[1]+[1,-2,3][j])),[[9,5,7],[-1,-1,3]]);
  close((1*1+2*2)/2,2.5);
  // Probability-domain calculation at moderate logit, independent of stable logit formula.
  close(-Math.log(1/(1+Math.exp(-Math.log(3)))),Math.log(4/3));
  close(.9*2+1.8,3.6);close(1.8-.1*3.6,1.44);
});

test('representative mutations are rejected by independent criteria', () => {
  const z=[1000,1001];
  const naive=z.map(Math.exp),sum=naive.reduce((a,b)=>a+b,0);
  assert.ok(naive.map(v=>v/sum).some(v=>!Number.isFinite(v)));
  assert.throws(()=>close([.5,.5],softmaxOracle([1,2]))); // Uniform mutant passes sum=1, fails values.
  assert.throws(()=>close([1000/2001,1001/2001],softmaxOracle(z))); // Divide logits, not exp.
  const input={x:2,w:3,b:1},q=7,fd=finiteDifference(input,'base');
  for(const bad of [2*q*3,(2*q)*1*3,(2*input.x+1)*3,(2*q+1)*input.x])assert.throws(()=>close(bad,fd.dx,1e-7,1e-6));
  assert.throws(()=>close([2+.1*2,1+.1*8],[1.8,.2]));
  assert.throws(()=>close([2-2,1-8],[1.8,.2]));
  assert.throws(()=>close([1+.1*2],[3.2]));
});

test('anchor invalid-domain references reject empty, nonfinite, shape and eta errors', () => {
  const cases=[
    {item:exercise('unit.transformer.attention.softmax.guided'),args:'[]'},
    {item:exercise('unit.transformer.attention.softmax.guided'),args:'[Infinity]'},
    {item:exercise('unit.transformer.attention.softmax.guided'),args:'[NaN]'},
    {item:exercise('unit.backprop.shared.guided'),args:'1,Infinity,0'},
    {item:exercise('unit.optimizer.sgd.guided'),args:'[1],[1,2],.1'},
    {item:exercise('unit.optimizer.sgd.guided'),args:'[],[],.1'},
    {item:exercise('unit.optimizer.sgd.guided'),args:'[1],[2],-1'},
  ];
  const source=cases.map(({item,args})=>`{${item.solution.javascript}\nlet rejected=false;try{${item.solution.javascript.match(/^function (\w+)/)![1]}(${args});}catch(e){rejected=e instanceof RangeError;}if(!rejected)throw Error("domain accepted");}`).join('\n');
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
});

test('all 23 assigned source units have distinct guided and A/B code checkpoints',()=>{
  const inventory=JSON.parse(readFileSync(new URL('../docs/practice-topic-inventory.json',import.meta.url),'utf8'));
  const units=inventory.units.filter((u:{route:string})=>['#neuron','#loss','#backprop','#optimizers','#network','#transformer'].includes(u.route));
  assert.equal(units.length,23);
  for(const unit of units){
    const topic=practiceTopics.find(t=>t.id===unit.id);
    assert.ok(topic,unit.id);
    for(const suffix of ['guided','transfer-a','transfer-b']){
      assert.ok(topic.exercises.some(e=>e.id===`${unit.id}.${suffix}`),unit.id+suffix);
    }
  }
});

test('MSE/BCE gradients independently agree with central differences of published loss',()=>{
  const mse=exercise('unit.loss.mse.transfer-b'),bce=exercise('unit.loss.bce.transfer-b');
  const p=[-.3,2.1,1],targets=[.2,-1,1.4];
  const actual=authorJavascript([{item:mse,input:{predictions:p,targets}},{item:bce,input:{z:-2.3,y:1}},{item:bce,input:{z:1.7,y:0}}]);
  const loss=(pred:number[])=>pred.reduce((s,v,i)=>s+(v-targets[i])**2,0)/pred.length;
  const h=1e-5;
  const expected=p.map((v,i)=>{const plus=[...p],minus=[...p];plus[i]=v+h;minus[i]=v-h;return(loss(plus)-loss(minus))/(2*h);});
  close(actual[0],expected,1e-7,1e-6);
  const probabilityLoss=(z:number,y:number)=>{const prob=1/(1+Math.exp(-z));return-y*Math.log(prob)-(1-y)*Math.log1p(-prob);};
  for(const [i,z,y] of [[1,-2.3,1],[2,1.7,0]])close(actual[i],(probabilityLoss(z+h,y)-probabilityLoss(z-h,y))/(2*h),1e-7,1e-6);
});

test('XOR: independent forward and finite differences of all 17 params before any update',()=>{
  const item=exercise('unit.network.xor.guided');
  const params=Array.from({length:17},(_,i)=>(i-8)*.07),xy=[.3,-.8],target=1;
  const forward=(p:number[])=>{
    let z=p[16];
    for(let j=0;j<4;j++)z+=p[12+j]*Math.tanh(p[2*j]*xy[0]+p[2*j+1]*xy[1]+p[8+j]);
    const probability=1/(1+Math.exp(-z));
    return-Math.log(probability);
  };
  const actual=authorJavascript([{item,input:{params,xy,target}}])[0] as number[];
  close(actual[0],forward(params));
  const h=1e-5;
  for(let i=0;i<17;i++){
    const plus=[...params],minus=[...params];plus[i]+=h;minus[i]-=h;
    close(actual[i+1],(forward(plus)-forward(minus))/(2*h),1e-7,1e-6);
  }
  assert.throws(()=>close(actual.slice(1).map(()=>0),actual.slice(1))); // Zero-gradient mutant.
});

test('logistic batch with L2: numerical gradient and permutation use one fixed parameter snapshot',()=>{
  const item=exercise('unit.network.boundary.guided');
  const theta=[.3,-.2],x=[-.5,1,2],y=[0,1,0],eta=.01,l2=.3;
  const loss=(p:number[])=>x.reduce((s,a,i)=>{const probability=1/(1+Math.exp(-(p[0]*a+p[1])));return s+(-y[i]*Math.log(probability)-(1-y[i])*Math.log1p(-probability))/x.length;},l2*theta[0]**2/2);
  // Penalty recomputed at the perturbed point; bias has no penalty.
  const fullLoss=(p:number[])=>loss(p)-l2*theta[0]**2/2+l2*p[0]**2/2;
  const h=1e-5;
  const numerical=theta.map((v,i)=>{const plus=[...theta],minus=[...theta];plus[i]=v+h;minus[i]=v-h;return(fullLoss(plus)-fullLoss(minus))/(2*h);});
  const results=authorJavascript([{item,input:{theta,x,y,eta,l2}},{item,input:{theta,x:[...x].reverse(),y:[...y].reverse(),eta,l2}}]);
  close(results[0],theta.map((v,i)=>v-eta*numerical[i]),1e-7,1e-6);close(results[1],results[0]);
});

test('head gradients: independent probability-domain CE finite differences, frozen features unchanged',()=>{
  const item=exercise('unit.transformer.generation.head-gradient-guided'),features=[.4,-.7],weights=[[.2,.3],[-.1,.5],[.7,-.2]],target=1;
  const actual=authorJavascript([{item,input:{features,weights,target}}])[0] as number[][];
  const loss=(w:number[][])=>{
    const logits=w.map(row=>row[0]*features[0]+row[1]*features[1]);
    const exponents=logits.map(Math.exp);
    return-Math.log(exponents[target]/exponents.reduce((s,a)=>s+a,0));
  };
  const h=1e-5;
  for(let j=0;j<3;j++)for(let i=0;i<2;i++){
    const plus=weights.map(row=>[...row]),minus=weights.map(row=>[...row]);plus[j][i]+=h;minus[j][i]-=h;
    close(actual[j][i],(loss(plus)-loss(minus))/(2*h),1e-7,1e-6);
  }
  for(let i=0;i<2;i++)close(actual.reduce((s,row)=>s+row[i],0),0);
});

test('attention mask, RoPE, normalization, cache and deterministic sampling numerical properties',()=>{
  const attention=exercise('unit.transformer.attention.guided'),rope=exercise('unit.transformer.positions.guided');
  const ln=exercise('unit.transformer.block.guided'),rms=exercise('unit.transformer.block.transfer-a');
  const cache=exercise('unit.transformer.cache.guided'),sampling=exercise('unit.transformer.generation.guided');
  const outputs=authorJavascript([
    {item:attention,input:{query:[2],keys:[[100],[1]],values:[[90],[7]],allowed:[false,true]}},
    {item:rope,input:{x:[2,-3,1,4],pos:7,base:10000}},
    {item:ln,input:{x:[-1,2,3],eps:.1}},{item:ln,input:{x:[99,102,103],eps:.1}},
    {item:rms,input:{x:[-1,2,3],eps:.1}},{item:rms,input:{x:[99,102,103],eps:.1}},
    {item:cache,input:{keys:[[1,2]],values:[[3]],new_key:[4,5],new_value:[6],pos:1}},
    {item:sampling,input:{logits:[0,Math.log(2),Math.log(3)],temperature:1,top_k:2,top_p:.5}},
  ]);
  close(outputs[0],{weights:[0,1],out:[7]});
  const rotated=outputs[1] as number[];close(rotated.reduce((s,a)=>s+a*a,0),30);
  close(outputs[2],outputs[3]);assert.throws(()=>close(outputs[4],outputs[5]));
  close(outputs[6],{keys:[[1,2],[4,5]],values:[[3],[6]]});
  close(outputs[7],[0,0,1]); // top-k weights are [3/5,2/5]; first alone crosses .5.
});

// Extra author audit: set PRACTICE_VERIFY_ALL_LANGUAGES=1 to verify Python and Rust references.
// Runtimes can be pinned via PRACTICE_PYTHON / PRACTICE_RUSTC, never via lesson input.
test('cross-language author fixture audit (opt-in toolchain check)', {skip:process.env.PRACTICE_VERIFY_ALL_LANGUAGES!=='1'}, () => {
  const python=process.env.PRACTICE_PYTHON || 'python';
  const rustc=process.env.PRACTICE_RUSTC || 'rustc';
  const pyProgram='import json\noutputs=[]\n'+fixtureCases.map(({item,input})=>{
    const name=item.solution.python.match(/def (\w+)/)![1];
    return item.solution.python+`\ninputs=json.loads(${JSON.stringify(JSON.stringify(input))})\noutputs.append(${name}(*inputs.values()))\n`;
  }).join('\n')+'\nprint(json.dumps(outputs))';
  const directory=mkdtempSync(join(tmpdir(),'rustml-author-reference-'));
  const rustValue=(value:unknown):string=>{
    if(Array.isArray(value))return value.some(Array.isArray)?`&vec![${value.map(row=>`vec![${(row as number[]).map(rustValue).join(',')}]`).join(',')}]`:`&[${value.map(rustValue).join(',')}]`;
    if(typeof value==='string')return JSON.stringify(value);
    if(typeof value==='boolean')return String(value);
    assert.equal(typeof value,'number');
    if(Object.is(value,-0))return '-0.0';
    return Number.isInteger(value)?`${value}.0`:String(value);
  };
  const modules=exercises.map((item,index)=>{
    const name=item.solution.rust.match(/pub fn (\w+)/)![1];
    const parameterTypes=item.solution.rust.match(/pub fn \w+\(([^)]*)\)/)![1].split(',').map(parameter=>parameter.trim().split(':').slice(1).join(':').trim());
    const checks=item.fixtures.map(f=>{
      const expected=JSON.parse(f.output);
      const call=`${name}(${Object.values(JSON.parse(f.input)).map((v,i)=>['u32','usize','i32'].includes(parameterTypes[i])?`${v}${parameterTypes[i]}`:parameterTypes[i]==='&[usize]'?`&[${(v as number[]).map(n=>`${n}usize`).join(',')}]`:rustValue(v)).join(',')}).unwrap()`;
      const tolerance=isFiniteDifference(item)?'1e-7,1e-6':'1e-12,1e-10';
      const checks=(path:string,value:unknown):string=>{
        if(typeof value==='number')return `check(${path} as f64,${rustValue(value)},${tolerance});`;
        if(typeof value==='boolean')return `assert_eq!(${path},${value});`;
        if(Array.isArray(value))return `assert_eq!(${path}.len(),${value.length});${value.map((v,i)=>checks(`${path}[${i}]`,v)).join('')}`;
        return Object.entries(value as Record<string,unknown>).map(([k,v])=>checks(`${path}.${k}`,v)).join('');
      };
      return `let value=${call};${checks('value',expected)}`;
    }).join('\n');
    return `mod author_${index} {use super::check;${item.solution.rust}\npub fn verify(){${checks}}}`;
  }).join('\n');
  const source=join(directory,'references.rs'),binary=join(directory,process.platform==='win32'?'references.exe':'references');
  try{
    const pySource=join(directory,'references.py');
    writeFileSync(pySource,pyProgram);
    const py=spawnSync(python,[pySource],{encoding:'utf8',timeout:30000,env:{...process.env,PYTHONUTF8:'1'}});
    assert.equal(py.status,0,py.stderr || py.error?.message);
    (JSON.parse(py.stdout) as unknown[]).forEach((actual,i)=>close(actual,fixtureExpected[i],isFiniteDifference(fixtureCases[i].item)?1e-7:1e-12,isFiniteDifference(fixtureCases[i].item)?1e-6:1e-10));
    writeFileSync(source,`fn check(a:f64,e:f64,atol:f64,rtol:f64){assert!(a.is_finite());assert!((a-e).abs()<=atol+rtol*e.abs(),"{} != {}",a,e);}\n${modules}\nfn main(){${exercises.map((_,i)=>`author_${i}::verify();`).join('')}}`);
    const compilation=spawnSync(rustc,['--edition=2021',source,'-o',binary],{encoding:'utf8',timeout:60000});
    assert.equal(compilation.status,0,compilation.stderr);
    assert.ok(existsSync(binary));
    const run=spawnSync(binary,[],{encoding:'utf8',timeout:15000});
    assert.equal(run.status,0,run.stderr);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
