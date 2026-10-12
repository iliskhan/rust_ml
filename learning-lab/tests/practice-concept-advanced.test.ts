import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { advancedConceptPracticeTopics as advancedPracticeTopics } from '../src/practice/concept-advanced-catalog.ts';
import { advancedConcepts } from '../src/advancedConcepts.ts';
import { normalLogDensity,normalKL,normalScore,reparameterize,adversarialLosses,discountedReturn } from '../src/advancedConceptMath.ts';

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

test('all 21 exact advancedConcepts IDs have 63 authored guided/A/B math exercises with three languages',()=>{
  const inventory=JSON.parse(readFileSync(new URL('../docs/practice-topic-inventory.json',import.meta.url),'utf8'));
  const ids=inventory.reference_concepts.filter((c:{source:string})=>c.source==='src/advancedConcepts.ts').map((c:{id:string})=>c.id);
  assert.deepEqual(advancedPracticeTopics.map(t=>t.id).sort(),ids.sort());
  assert.equal(advancedPracticeTopics.length,21);assert.equal(exercises.length,63);
  assert.equal(new Set(exercises.map(e=>e.id)).size,63);
  for(const topic of advancedPracticeTopics){
    assert.equal(topic.lessonId,'math');
    const concept=advancedConcepts.find(c=>'concept.'+c.id===topic.id)!;assert.ok(concept);
    assert.deepEqual(topic.prerequisites,concept.prerequisites.map(id=>'concept.'+id));
    assert.deepEqual(topic.exercises.map(e=>e.id),['guided','transfer-a','transfer-b'].map(s=>topic.id+'.'+s));
    assert.deepEqual(topic.exercises.map(e=>e.mode),['guided','transfer','transfer']);
    assert.equal(new Set(topic.exercises.map(e=>e.prompt)).size,3);
    assert.equal(new Set(topic.exercises.map(e=>e.quiz.question)).size,3);
    for(const e of topic.exercises){
      assert.ok(e.prompt.includes('Область subskill:')&&e.formula.length>20&&e.explanation.length>100);
      assert.ok(e.hints.length>=2&&e.fixtures.length===3);
      assert.deepEqual(e.solution,topic.exercises[0].solution);
      assert.equal(new Set(e.quiz.options).size,e.quiz.options.length);
      assert.ok(e.quiz.options[e.quiz.correctIndex]&&e.quiz.explanation.includes(e.quiz.options[e.quiz.correctIndex]));
      for(const lang of ['javascript','python','rust'] as const){assert.notEqual(e.solution[lang],e.starter[lang]);assert.ok(!e.solution[lang].includes('todo!')&&!e.solution[lang].includes('NotImplementedError'));}
    }
  }
});
for(const language of ['javascript','python','rust'] as const){
  test(`all 189 public fixtures execute trusted author ${language} references`,()=>runReferences(fixtures,language).forEach((out,i)=>close(out,fixtureExpected[i])));
}

test('Gaussian mechanisms: source agreement, density normalization quadrature, standardization Jacobian, KL asymmetry and score finite differences',()=>{
  const gaussian=[1.3,-.4,.8],kl=[.7,1.3,-.2,.8];
  const out=runReferences([at('concept.gaussian',gaussian),at('concept.kl-divergence',kl),at('concept.score-function',gaussian),at('concept.gaussian',[(gaussian[0]-gaussian[1])/gaussian[2],0,1]),at('concept.kl-divergence',[kl[2],kl[3],kl[0],kl[1]])]);
  close(out[0],[normalLogDensity(...gaussian as [number,number,number])]);close(out[1],[normalKL(...kl as [number,number,number,number])]);close(out[2],[normalScore(...gaussian as [number,number,number])]);
  close(out[0][0],out[3][0]-Math.log(gaussian[2]));assert.ok(Math.abs(out[1][0]-out[4][0])>.01);
  const h=1e-5;close(out[2][0],(normalLogDensity(gaussian[0]+h,gaussian[1],gaussian[2])-normalLogDensity(gaussian[0]-h,gaussian[1],gaussian[2]))/(2*h),1e-7,1e-6);
  // Independently integrate exp(author log density) over standard Gaussian [-8,8] using Simpson's rule.
  const n=400,step=16/n,grid=Array.from({length:n+1},(_,i)=>at('concept.gaussian',[-8+i*step,0,1]));
  const densities=runReferences(grid).map(o=>Math.exp(o[0]));
  const area=densities.reduce((s,p,i)=>s+p*(i===0||i===n?1:i%2?4:2),0)*step/3;close(area,1,1e-10,1e-10);
  // Independent expectation integral of log(q/p), rather than the Gaussian KL closed form.
  const dx=16*kl[1]/n;
  let integral=0;
  for(let i=0;i<=n;i++){
    const x=kl[0]-8*kl[1]+i*dx,q=Math.exp(-.5*((x-kl[0])/kl[1])**2)/(kl[1]*Math.sqrt(2*Math.PI));
    const p=Math.exp(-.5*((x-kl[2])/kl[3])**2)/(kl[3]*Math.sqrt(2*Math.PI));
    integral+=(i===0||i===n?1:i%2?4:2)*q*Math.log(q/p);
  }
  close(out[1][0],integral*dx/3,1e-10,1e-10);
});

test('probability primitives: Bayes weighted masses, latent-axis sums, likelihood duplication and exact ELBO posterior KL gap',()=>{
  const q=.6,joint=[.12,.28],prior=.3,l=[.8,.2];
  const o=runReferences([at('concept.bayes-rule',[prior,...l]),at('concept.latent-variable',[.1,.2,.3,.4]),at('concept.likelihood',[.2,1.3,-1,.5,2]),at('concept.likelihood',[.2,1.3,-1,.5,2,-1,.5,2]),at('concept.elbo',[...joint,q]),at('concept.elbo',[...joint,joint[0]/(joint[0]+joint[1])])]);
  const evidence=prior*l[0]+(1-prior)*l[1];close(o[0],[prior*l[0]/evidence,(1-prior)*l[1]/evidence,evidence]);
  close(o[1],[.3,.7]);close(o[3][0],2*o[2][0]);
  const posterior=joint[0]/(joint[0]+joint[1]),posteriorKL=q*Math.log(q/posterior)+(1-q)*Math.log((1-q)/(1-posterior));
  close(o[4][2],posteriorKL);assert.ok(o[4][0]<=o[4][1]);close(o[5][2],0);
  const mean=runReferences([at('concept.conditional-expectation',[.1,.3,-1,3]),at('concept.conditional-expectation',[.4,.2,-1,3])]);
  const total=mean.reduce((s,m)=>s+m[0]*m[1],0);
  close(total,(.1+.4)*(-1)+(.3+.2)*3); // law of total expectation across two disjoint X rows
});

test('pathwise and policy derivatives: fixed randomness finite differences and stable non-saturating GAN objectives',()=>{
  const reparam=[.3,-.7,-1.2],policy=[.4,2,-1,3],fake=.7;
  const o=runReferences([at('concept.reparameterization',reparam),at('concept.policy-gradient',policy),at('concept.adversarial-game',[.4,fake])]);
  const rp=reparameterize(...reparam as [number,number,number]);close(o[0],[rp.z,rp.dMu,rp.dLogVariance]);
  const h=1e-5;
  close(o[0][2],((reparam[0]+Math.exp((reparam[1]+h)/2)*reparam[2])-(reparam[0]+Math.exp((reparam[1]-h)/2)*reparam[2]))/(2*h),1e-7,1e-6);
  const reward=(theta:number)=>{const weights=[Math.exp(theta),1],z=weights[0]+weights[1];return (weights[0]*policy[1]+weights[1]*policy[2])/z;};
  close(o[1][2],(reward(policy[0]+h)-reward(policy[0]-h))/(2*h),1e-7,1e-6);close(o[1][2],o[1][3]);
  const g=adversarialLosses(fake);close(o[2][1],g.nonSaturating);close(o[2][2],g.nonSaturatingGradient);
  const generator=(f:number)=>-Math.log(Math.exp(f)/(1+Math.exp(f)));
  close(o[2][2],(generator(fake+h)-generator(fake-h))/(2*h),1e-7,1e-6);
  for(const language of ['python','rust'] as const)runReferences([at('concept.reparameterization',reparam),at('concept.policy-gradient',policy),at('concept.adversarial-game',[.4,fake])],language).forEach((out,i)=>close(out,o[i]));
  assert.throws(()=>close(o[0][2],Math.exp(reparam[1]/2)*reparam[2])); // omitted 1/2 chain rule
  assert.throws(()=>close(o[2][2],1/(1+Math.exp(-fake)))); // D fake gradient substituted for G
});

test('sample summary and forward noise: pairwise variance oracle, constant shift and cumulative products',()=>{
  const samples=[-2,.3,1.5,4],shift=7;
  const o=runReferences([at('concept.monte-carlo',samples),at('concept.monte-carlo',samples.map(x=>x+shift)),at('concept.monte-carlo',[3]),at('concept.noise-schedule',[.2,.3,.4])]);
  // Sum of all pairwise squared differences divided by 2n(n−1) equals sample variance.
  const variance=samples.reduce((s,x)=>s+samples.reduce((t,y)=>t+(x-y)**2,0),0)/(2*samples.length*(samples.length-1));
  close(o[0],[samples.reduce((s,x)=>s+x,0)/samples.length,variance,Math.sqrt(variance/samples.length),1]);
  close(o[1],[o[0][0]+shift,...o[0].slice(1)]);close(o[2],[3,0,0,0]);close(o[3],[.8,.56,.336]);
  o[3].forEach((alpha,i)=>{close(Math.sqrt(alpha)**2+Math.sqrt(1-alpha)**2,1);if(i)assert.ok(alpha<o[3][i-1]);});
});

test('graph conventions: neighbours, incoming adjacency, simultaneous update and node permutation equivariance',()=>{
  const o=runReferences([at('concept.graph',[1,0,1,1]),at('concept.adjacency-matrix',[0,2,1]),at('concept.message-passing',[1,1,0,1,1,0,2,3,5])]);
  close(o[0],[0,2]);close(o[1],[0,0,0,0,0,0,1,0,0]);close(o[2],[8,5,2]);
  const A=[[0,1,1],[0,0,1],[1,0,0]],features=[2,3,5],perm=[2,0,1];
  const remapped=perm.map(i=>perm.map(j=>A[i][j])),h=perm.map(i=>features[i]);
  const input=[remapped[0][1],remapped[0][2],remapped[1][0],remapped[1][2],remapped[2][0],remapped[2][1],...h];
  close(runReferences([at('concept.message-passing',input)])[0],perm.map(i=>o[2][i]));
  assert.throws(()=>close([8,5,8],o[2])); // in-place propagation altered the last old-state read
});

test('Markov/RL: distribution conservation, two steps, finite return shift, terminal reward, policy ties and Bellman contraction',()=>{
  const o=runReferences([at('concept.markov-chain',[.25,.8,.4]),at('concept.discounted-return',[.6,1,-2,3]),at('concept.discounted-return',[.6,3,0,5]),at('concept.policy',[2,2,0,.3]),at('concept.q-value',[.75,2,0,10,100,.9,0,1]),at('concept.q-value',[.75,2,0,10,100,.9,1,1]),at('concept.bellman-equation',[.3,-.7,1,-2,.2,.8,.6]),at('concept.bellman-equation',[.8,-.2,1,-2,.2,.8,.6])]);
  close(o[0],[.5,.5]);close(o[0][0]+o[0][1],1);
  const second=runReferences([at('concept.markov-chain',[o[0][0],.8,.4])])[0];close(second,[.6,.4]);
  close(o[1][0],discountedReturn([1,-2,3],.6).value);close(o[2][0]-o[1][0],2*(1+.6+.6**2));
  close(o[3],[.45,.45,.1]);close(o[4],[8.25]);close(o[5],[1.5]);
  const difference=Math.max(...o[6].map((v,i)=>Math.abs(v-o[7][i])));assert.ok(difference<=.6*.5+1e-12);
  const reverse=runReferences([at('concept.bellman-equation',[-.7,.3,.8,.2,-2,1,.6])])[0];close(reverse,[...o[6]].reverse());
  assert.throws(()=>close([o[6][0],Math.max(.2+.6*o[6][0],.8+.6*(-.7))],o[6])); // asynchronous sweep mutant
});

test('all three languages reject malformed and constrained-domain inputs',()=>{
  const invalid:Case[]=[
    at('concept.gaussian',[0,0,0]),at('concept.kl-divergence',[0,0,0,1]),at('concept.latent-variable',[.1,.2,.3,.3]),at('concept.likelihood',[0,-1]),at('concept.bayes-rule',[.5,0,0]),at('concept.elbo',[.5,.6,.5]),at('concept.elbo',[.1,.2,0]),at('concept.reparameterization',[0,21,0]),at('concept.conditional-expectation',[0,0,1,2]),at('concept.noise-schedule',[.2,1]),at('concept.score-function',[0,0,-1]),at('concept.graph',[1,.5,0,1]),at('concept.adjacency-matrix',[0,3,1]),at('concept.message-passing',[2,0,0,0,0,0,1,2,3]),at('concept.markov-chain',[1.1,.5,.5]),at('concept.discounted-return',[-1,1]),at('concept.policy',[1,2,3,2]),at('concept.q-value',[.5,1,2,3,4,.9,.5,0]),at('concept.bellman-equation',[0,0,0,0,0,0,2]),
  ];
  const dir=mkdtempSync(join(tmpdir(),'rustml-author-concept-domain-'));
  try{
    const jsfile=join(dir,'invalid.mjs');
    writeFileSync(jsfile,`const f=[];${refs.map(e=>`{${e.solution.javascript}f.push(solve);}`).join('\n')}\nfunction reject(fn,arg){try{fn(arg);}catch(e){if(e instanceof RangeError)return;throw e;}throw Error('invalid accepted');}\nfor(const fn of f)for(const v of [[],null,[NaN],[Infinity],[true]])reject(fn,v);\nfor(const c of ${JSON.stringify(invalid)})reject(f[c.topic],c.values);\n${fixtures.map(c=>`for(const bad of [NaN,Infinity,1001,true]){const v=${JSON.stringify(c.values)};v[0]=bad;reject(f[${c.topic}],v);}`).join('\n')}`);
    const jsresult=spawnSync(process.execPath,[jsfile],{encoding:'utf8',timeout:15000});assert.equal(jsresult.status,0,jsresult.stderr);
    const pyfile=join(dir,'invalid.py');
    writeFileSync(pyfile,`import math\nf=[]\n${refs.map(e=>`s={}\nexec(${JSON.stringify(e.solution.python)},s)\nf.append(s['solve'])`).join('\n')}\ndef reject(fn,arg):\n    try:\n        fn(arg)\n    except ValueError:\n        return\n    raise AssertionError('invalid accepted')\nfor fn in f:\n    for v in [[],None,[float('nan')],[float('inf')],[True]]:\n        reject(fn,v)\nfor c in ${JSON.stringify(invalid)}:\n    reject(f[c['topic']],c['values'])\n${fixtures.map(c=>`for bad in [float('nan'),float('inf'),1001,True]:\n    v=${JSON.stringify(c.values)}\n    v[0]=bad\n    reject(f[${c.topic}],v)`).join('\n')}\n`);
    const python=process.env.PRACTICE_PYTHON??(process.platform==='win32'?'python':'python3');
    const pyresult=spawnSync(python,['-X','utf8',pyfile],{encoding:'utf8',timeout:15000});assert.equal(pyresult.status,0,pyresult.stderr);
    const rsfile=join(dir,'invalid.rs'),binary=join(dir,'invalid.exe'),num=(v:number)=>Number.isInteger(v)?`${v}.0`:String(v);
    writeFileSync(rsfile,`${refs.map((e,i)=>`mod r${i}{${e.solution.rust}}`).join('\n')}\nfn main(){${refs.map((_,i)=>`assert!(r${i}::solve(&[]).is_err());assert!(r${i}::solve(&[f64::NAN]).is_err());assert!(r${i}::solve(&[f64::INFINITY]).is_err());`).join('\n')}\n${invalid.map(c=>`assert!(r${c.topic}::solve(&[${c.values.map(num).join(',')}]).is_err());`).join('\n')}\n${fixtures.map(c=>`for bad in [f64::NAN,f64::INFINITY,1001.0] {let mut v=vec![${c.values.map(num).join(',')}];v[0]=bad;assert!(r${c.topic}::solve(&v).is_err());}`).join('\n')}}`);
    const rustc=process.env.PRACTICE_RUSTC??'rustc';
    const compiled=spawnSync(rustc,[rsfile,'--edition=2021','-o',binary],{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024});assert.equal(compiled.status,0,compiled.stderr);
    const rsresult=spawnSync(binary,[],{encoding:'utf8',timeout:15000});assert.equal(rsresult.status,0,rsresult.stderr);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
