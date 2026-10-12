import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generativePracticeTopics as topics } from '../src/practice/generative-catalog.ts';
import type { PracticeExercise } from '../src/practice/catalog.ts';

const exercises = topics.flatMap(t=>t.exercises);
type Args = Record<string, number | number[]>;
type Case = { item: PracticeExercise; input: Args };
const item = (id: string) => {
  const found = topics.find(t=>t.id===`unit.${id}`)?.exercises[0];
  assert.ok(found,id); return found;
};
function close(a: unknown, e: unknown, tolerance=1e-10) {
  if (Array.isArray(e)) {
    assert.ok(Array.isArray(a)); assert.equal(a.length,e.length);
    e.forEach((v,i)=>close(a[i],v,tolerance)); return;
  }
  assert.equal(typeof a,'number'); assert.equal(typeof e,'number');
  assert.ok(Number.isFinite(a),`nonfinite ${a}`);
  assert.ok(Math.abs((a as number)-(e as number))<=1e-12+tolerance*Math.abs(e as number),`${a} != ${e}`);
}
// Execute only immutable, imported author solutions. No learner draft is accepted here.
function authorJs(cases: Case[]): number[][] {
  const directory=mkdtempSync(join(tmpdir(),'rustml-generative-author-'));
  try {
    const source=join(directory,'author.mjs');
    writeFileSync(source,'const outputs=[];\n'+cases.map(({item,input})=>{
      const name=item.solution.javascript.match(/^function (\w+)/)![1];
      return `{${item.solution.javascript}\nconst args=${JSON.stringify(input)};const before=JSON.stringify(args);outputs.push(${name}(...Object.values(args)));if(before!==JSON.stringify(args))throw Error("mutated input");}`;
    }).join('\n')+'\nprocess.stdout.write(JSON.stringify(outputs));');
    const result=spawnSync(process.execPath,[source],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr||result.error?.message);
    return JSON.parse(result.stdout);
  } finally {rmSync(directory,{recursive:true,force:true});}
}
const fixtureCases: Case[]=exercises.flatMap(item=>item.fixtures.map(f=>({item,input:JSON.parse(f.input) as Args})));
const fixtureExpected=exercises.flatMap(item=>item.fixtures.map(f=>JSON.parse(f.output)));

test('generative inventory: all 25 units have real scoped guided and transfer A/B in three languages',()=>{
  const inventory=JSON.parse(readFileSync(new URL('../docs/practice-topic-inventory.json',import.meta.url),'utf8'));
  const expected=inventory.units.filter((u:{route:string})=>['#vae','#gan','#diffusion','#gnn','#rl'].includes(u.route)).map((u:{id:string})=>u.id).sort();
  assert.equal(topics.length,25);assert.equal(exercises.length,75);
  assert.deepEqual(topics.map(t=>t.id).sort(),expected);
  assert.equal(new Set(exercises.map(e=>e.id)).size,75);
  for (const topic of topics) {
    assert.ok(topic.prerequisites.length);assert.ok(topic.sourceSection);
    assert.deepEqual(topic.exercises.map(e=>e.mode),['guided','transfer','transfer']);
    assert.equal(new Set(topic.exercises.map(e=>e.prompt)).size,3);
    assert.equal(new Set(topic.exercises.map(e=>e.quiz.question)).size,3);
    assert.equal(new Set(topic.exercises.map(e=>e.fixtures[0].input)).size,3);
    for(const e of topic.exercises){
      assert.equal(e.topicId,topic.id);assert.ok(e.prompt.length>180 && e.explanation.length>50);
      assert.ok(e.formula.length>10 && e.hints.length>=2 && e.fixtures.length>=1);
      assert.equal(new Set(e.quiz.options).size,3);
      assert.ok(e.quiz.correctIndex>=0 && e.quiz.correctIndex<3);
      for (const language of ['python','javascript','rust'] as const){
        assert.notEqual(e.starter[language],e.solution[language]);
        assert.ok(e.solution[language].length>150);
        assert.ok(!e.solution[language].includes('todo!') && !e.solution[language].includes('NotImplementedError'));
      }
    }
  }
});
test('all 75 public author JavaScript fixtures execute without input mutation',()=>{
  authorJs(fixtureCases).forEach((value,i)=>close(value,fixtureExpected[i]));
});

test('VAE: reparameterization derivatives and four-parameter loss finite differences at fixed noise',()=>{
  const inputs=[{mu:.3,log_var:-.4,w:1.2,b:-.2,x:.7,epsilon:-.8,beta:.5},{mu:-.2,log_var:.7,w:-.4,b:.1,x:-.3,epsilon:.6,beta:0}];
  const actual=authorJs(inputs.map(input=>({item:item('vae.train'),input})));
  // Direct Gaussian log-density and density-ratio expectation, not author backward.
  const loss=(v:typeof inputs[number])=>{
    const variance=Math.exp(v.log_var),z=v.mu+Math.sqrt(variance)*v.epsilon;
    const nll=(v.x-(v.w*z+v.b))**2/2;
    const kl=Math.log(1/Math.sqrt(variance))+(variance+v.mu*v.mu-1)/2;
    return nll+v.beta*kl;
  };
  inputs.forEach((input,i)=>{
    close(actual[i][0],loss(input));
    for(const [j,key] of (['mu','log_var','w','b'] as const).entries()){
      const h=1e-5;
      const derivative=(loss({...input,[key]:input[key]+h})-loss({...input,[key]:input[key]-h}))/(2*h);
      close(actual[i][j+1],derivative,1e-6);
    }
  });
  const pairs=authorJs([{item:item('vae.compute'),input:{mu:.7,log_var:.2,epsilon:-1.5}},{item:item('vae.compute'),input:{mu:0,log_var:1e-8,epsilon:0}}]);
  const h=1e-5, sample=(mu:number,logVar:number)=>mu+Math.sqrt(Math.exp(logVar))*(-1.5);
  close(pairs[0][2],(sample(.7+h,.2)-sample(.7-h,.2))/(2*h),1e-6);
  close(pairs[0][3],(sample(.7,.2+h)-sample(.7,.2-h))/(2*h),1e-6);
  assert.ok(pairs[1][1]>=0);
});
test('posterior moments: exact finite mixture moments via symmetric within-component samples',()=>{
  const mu=[-2,.5,1],sigma=[.5,1,2];
  const reference=mu.flatMap((m,i)=>[m-sigma[i],m+sigma[i]]);
  const mean=reference.reduce((a,b)=>a+b,0)/reference.length;
  const variance=reference.reduce((a,v)=>a+(v-mean)**2,0)/reference.length;
  close(authorJs([{item:item('vae.limits'),input:{mu,sigma}}])[0],[mean,variance]);
});
test('GAN: frozen-D gradient finite differences; D-before-G schedule, no update at zero rate',()=>{
  const input={z:-.7,g:.3,b:-.2,d:1.4,c:.1};
  const loss=(v:typeof input)=>-Math.log(1/(1+Math.exp(-(v.d*(v.g*v.z+v.b)+v.c))));
  const output=authorJs([{item:item('gan.gradients'),input}])[0];close(output[0],loss(input));
  for(const [i,key] of (['g','b'] as const).entries()){
    const h=1e-5;
    close(output[i+1],(loss({...input,[key]:input[key]+h})-loss({...input,[key]:input[key]-h}))/(2*h),1e-6);
  }
  const p=[.2,-.1,.3,.4],real=.8,z=-.5,eta=.03;
  // Independent finite differences of D probability-domain BCE give expected new D.
  const sigmoid=(a:number)=>1/(1+Math.exp(-a));
  const dl=(d:number,c:number)=>-Math.log(sigmoid(d*real+c))-Math.log(1-sigmoid(d*(p[0]*z+p[1])+c));
  const h=1e-5;
  const dn=p[2]-eta*(dl(p[2]+h,p[3])-dl(p[2]-h,p[3]))/(2*h);
  const cn=p[3]-eta*(dl(p[2],p[3]+h)-dl(p[2],p[3]-h))/(2*h);
  const gl=(g:number,b:number)=>-Math.log(sigmoid(dn*(g*z+b)+cn));
  const gn=p[0]-eta*(gl(p[0]+h,p[1])-gl(p[0]-h,p[1]))/(2*h);
  const bn=p[1]-eta*(gl(p[0],p[1]+h)-gl(p[0],p[1]-h))/(2*h);
  const actual=authorJs([{item:item('gan.train'),input:{parameters:p,real,z,eta_d:eta,eta_g:eta}},{item:item('gan.train'),input:{parameters:p,real,z,eta_d:0,eta_g:0}}]);
  close(actual[0],[gn,bn,dn,cn],1e-6);close(actual[1],p);
});
test('GAN region coverage and critic shift: nontrivial independent criteria reject mean-only and sigmoid mutants',()=>{
  const outputs=authorJs([
    {item:item('gan.diversity'),input:{samples:[-1.5,-.5,.5,1.5,8]}},
    {item:item('gan.variants'),input:{real_scores:[2,5],fake_scores:[-3,1,2]}},
    {item:item('gan.variants'),input:{real_scores:[12,15],fake_scores:[7,11,12]}},
  ]);
  close(outputs[0].slice(0,3),[2,2,1]);
  close(outputs[1],[-3.5,0]);close(outputs[2],[-3.5,-10]);
  assert.notEqual(outputs[1][0],.5); // probability-domain clamp cannot reproduce unrestricted critic.
});
test('diffusion: posterior coefficients oracle, final-step recovery, DDIM skip composition and CFG affine identity',()=>{
  const beta=.2,previous_bar=.6,bar=.48,x0=.7,epsilon=-.3,xt=Math.sqrt(bar)*x0+Math.sqrt(1-bar)*epsilon;
  const output=authorJs([{item:item('diffusion.step'),input:{beta,previous_bar,xt,epsilon,noise:0}}])[0];
  const expectedMean=Math.sqrt(previous_bar)*beta/(1-bar)*x0+Math.sqrt(1-beta)*(1-previous_bar)/(1-bar)*xt;
  close(output,[expectedMean,beta*(1-previous_bar)/(1-bar),expectedMean]);
  const final=authorJs([{item:item('diffusion.step'),input:{beta:.2,previous_bar:1,xt:Math.sqrt(.8)*x0+Math.sqrt(.2)*epsilon,epsilon,noise:99}}])[0];
  close(final,[x0,0,x0]);
  const first=authorJs([{item:item('diffusion.generation'),input:{bar:.2,earlier_bar:.6,xt:1.3,epsilon:.4}}])[0];
  const second=authorJs([{item:item('diffusion.generation'),input:{bar:.6,earlier_bar:1,xt:first[1],epsilon:.4}},{item:item('diffusion.generation'),input:{bar:.2,earlier_bar:1,xt:1.3,epsilon:.4}}]);
  close(second[0],second[1]);
  const cfg=authorJs([{item:item('diffusion.condition'),input:{unconditional:[-2,1],conditional:[3,-4],scale:2.5}}])[0];
  close(cfg,[-2,1].map((u,i)=>(1-2.5)*u+2.5*[3,-4][i]));
});
test('noise gradient: independent finite differences of mean squared distance',()=>{
  const predicted=[-.2,1.4,.8],epsilon=[.5,-.1,.8];
  const output=authorJs([{item:item('diffusion.training'),input:{predicted,epsilon}}])[0];
  const loss=(v:number[])=>v.reduce((sum,p,i)=>sum+(p-epsilon[i])**2,0)/v.length;
  close(output[0],loss(predicted));
  predicted.forEach((_,i)=>{const plus=[...predicted],minus=[...predicted],h=1e-5;plus[i]+=h;minus[i]-=h;close(output[i+1],(loss(plus)-loss(minus))/(2*h),1e-6);});
});
test('GNN: relabeling equivariance, sqrt-degree invariant and held-out label independence',()=>{
  const adjacency=[0,1,0,1,0,1,0,1,0],features=[.3,-1,2],permutation=[2,0,1];
  const permuted=permutation.flatMap(i=>permutation.map(j=>adjacency[i*3+j]));
  const [a,b,fixed]=authorJs([
    {item:item('gnn.message'),input:{adjacency,features}},
    {item:item('gnn.message'),input:{adjacency:permuted,features:permutation.map(i=>features[i])}},
    {item:item('gnn.depth'),input:{adjacency,features:[Math.sqrt(2),Math.sqrt(3),Math.sqrt(2)],steps:20}},
  ]);
  close(b,permutation.map(i=>a[i]));close(fixed,[Math.sqrt(2),Math.sqrt(3),Math.sqrt(2)]);
  const logits=[.2,-.7,1.1],mask=[1,0,1];
  const ce=authorJs([{item:item('gnn.train'),input:{logits,labels:[1,0,0],mask}},{item:item('gnn.train'),input:{logits,labels:[1,1,0],mask}}]);
  close(ce[0],ce[1]);
  const loss=(v:number[])=>-(Math.log(1/(1+Math.exp(-v[0])))+Math.log(1-1/(1+Math.exp(-v[2]))))/2;
  close(ce[0][0],loss(logits));
  logits.forEach((_,i)=>{const plus=[...logits],minus=[...logits],h=1e-5;plus[i]+=h;minus[i]-=h;close(ce[0][i+1],(loss(plus)-loss(minus))/(2*h),1e-6);});
});
test('RL: terminal vs truncation, baseline exact expectation and variance, signed PPO clip',()=>{
  const transition={old:2,reward:1,next_max:4,gamma:.5,eta:.25};
  const q=authorJs([0,1].flatMap(terminated=>[0,1].map(truncated=>({item:item('rl.q-learning'),input:{...transition,terminated,truncated}}))));
  close(q,[[3,2.25],[3,2.25],[1,1.75],[1,1.75]]);
  const banditInputs=[-2,0,1].flatMap(theta=>[-3,0,1,8].map(baseline=>({theta,left_reward:-1,right_reward:3,baseline})));
  const results=authorJs(banditInputs.map(input=>({item:item('rl.policy'),input})));
  banditInputs.forEach((v,i)=>{
    const h=1e-5,j=(theta:number)=>-1+4/(1+Math.exp(-theta));
    close(results[i][2],(j(v.theta+h)-j(v.theta-h))/(2*h),1e-6);
    close(results[i][3],results[i][2]);assert.ok(results[i][4]>=0);
  });
  const terms=authorJs([{item:item('rl.families'),input:{ratio:1.5,advantage:-2,epsilon:.2}},{item:item('rl.families'),input:{ratio:.5,advantage:2,epsilon:.2}}]);
  close(terms,[[-3],[1]]); // Always-clip mutant would produce [-2.4,1.6].
  const rewards=[2,-3,4,-1],gamma=.7;
  close(authorJs([{item:item('rl.environment'),input:{rewards,gamma}}])[0],[rewards.reduce((total,r,t)=>total+r*gamma**t,0)]);
});

const invalidDomain: Record<string, Args> = {
  'vae.idea':{mu:0,log_var:21}, 'vae.compute':{mu:0,log_var:-21,epsilon:0},
  'vae.train':{mu:0,log_var:0,w:1,b:0,x:0,epsilon:0,beta:-1},
  'vae.generate':{z:0,w:1,b:0,sigma:0,epsilon:0},'vae.limits':{mu:[0],sigma:[0]},
  'gan.game':{z:10001,g:0,b:0,d:0,c:0},'gan.gradients':{z:0,g:0,b:0,d:0,c:10001},
  'gan.train':{parameters:[0,0,0],real:0,z:0,eta_d:.1,eta_g:.1},
  'gan.diversity':{samples:[]},'gan.variants':{real_scores:[],fake_scores:[0]},
  'diffusion.noise':{betas:[1],x0:0,epsilon:0},'diffusion.training':{predicted:[1],epsilon:[]},
  'diffusion.step':{beta:1e-20,previous_bar:1,xt:0,epsilon:0,noise:0},
  'diffusion.generation':{bar:.5,earlier_bar:.25,xt:0,epsilon:0},
  'diffusion.condition':{unconditional:[1],conditional:[2],scale:-1},
  'gnn.graph':{adjacency:[0,1,0,0]},'gnn.message':{adjacency:[0],features:[]},
  'gnn.train':{logits:[0],labels:[1],mask:[0]},
  'gnn.depth':{adjacency:[0],features:[1],steps:.5},'gnn.variants':{self_feature:10001,neighbors:[]},
  'rl.environment':{rewards:[0],gamma:1.1},
  'rl.bellman':{probabilities:[.2,.2,1,0],rewards:[0,0,0,0],next_values:[0,0,0,0],terminal:[0,0,0,0],gamma:.9},
  'rl.q-learning':{old:0,reward:0,next_max:0,gamma:.9,eta:.1,terminated:2,truncated:0},
  'rl.policy':{theta:0,left_reward:0,right_reward:10001,baseline:0},
  'rl.families':{ratio:0,advantage:1,epsilon:.2},
};
const invalidCases: Case[]=topics.flatMap(topic=>{
  const base=JSON.parse(topic.exercises[0].fixtures[0].input) as Args;
  const first=Object.keys(base)[0];
  return [{item:topic.exercises[0],input:invalidDomain[topic.id.slice(5)]},
    {item:topic.exercises[0],input:{...base,[first]:Array.isArray(base[first])?[NaN]:NaN}}];
});
function literal(v: number|number[],language:'python'|'javascript'|'rust'): string {
  if (Array.isArray(v)) return `${language==='rust'?'&':''}[${v.map(x=>literal(x,language)).join(',')}]`;
  if (Number.isNaN(v)) return language==='rust'?'f64::NAN':language==='python'?'float("nan")':'NaN';
  return language==='rust' && Number.isInteger(v)?`${v}.0`:String(v);
}
test('all 25 author references reject nonfinite inputs and a topic-specific invalid domain',()=>{
  const directory=mkdtempSync(join(tmpdir(),'rustml-generative-invalid-'));
  try {
    const source=join(directory,'invalid.mjs');
    writeFileSync(source,invalidCases.map(({item,input})=>{
      const name=item.solution.javascript.match(/^function (\w+)/)![1];
      return `{${item.solution.javascript}\nlet ok=false;try {${name}(${Object.values(input).map(v=>literal(v,'javascript')).join(',')});}catch(error){ok=error instanceof RangeError;}if(!ok)throw Error(${JSON.stringify(item.id)});}`;
    }).join('\n'));
    const result=spawnSync(process.execPath,[source],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr||result.error?.message);
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('all Python and Rust fixtures and invalid domains (opt-in installed toolchains)',{skip:process.env.PRACTICE_VERIFY_ALL_LANGUAGES!=='1'},()=>{
  const directory=mkdtempSync(join(tmpdir(),'rustml-generative-languages-'));
  try {
    const pySource=join(directory,'references.py');
    const py='import json\noutputs=[]\n'+fixtureCases.map(({item,input})=>{
      const name=item.solution.python.match(/def (\w+)/)![1];
      return item.solution.python+`\noutputs.append(${name}(${Object.values(input).map(v=>literal(v,'python')).join(',')}))\n`;
    }).join('\n')+invalidCases.map(({item,input})=>{
      const name=item.solution.python.match(/def (\w+)/)![1];
      return item.solution.python+`\ntry:\n    ${name}(${Object.values(input).map(v=>literal(v,'python')).join(',')})\nexcept ValueError:\n    pass\nelse:\n    raise AssertionError(${JSON.stringify(item.id)})\n`;
    }).join('\n')+'\nprint(json.dumps(outputs))';
    writeFileSync(pySource,py);
    const pyResult=spawnSync(process.env.PRACTICE_PYTHON||'python',['-X','utf8',pySource],{encoding:'utf8',timeout:30000});
    assert.equal(pyResult.status,0,pyResult.stderr||pyResult.error?.message);
    (JSON.parse(pyResult.stdout) as unknown[]).forEach((value,i)=>close(value,fixtureExpected[i]));
    const modules=exercises.map((item,i)=>{
      const name=item.solution.rust.match(/pub fn (\w+)/)![1];
      const fixtures=item.fixtures.map(f=>{
        const input=JSON.parse(f.input) as Args,expected=JSON.parse(f.output) as number[];
        return `let actual=${name}(${Object.values(input).map(v=>literal(v,'rust')).join(',')}).unwrap(); let expected=${literal(expected,'rust')}; assert_eq!(actual.len(),expected.len()); for (a,e) in actual.iter().zip(expected){assert!(a.is_finite() && (a-e).abs()<=1e-12+1e-10*e.abs(),"${item.id}: {} != {}",a,e);}`;
      }).join('\n');
      const invalid=invalidCases.filter(c=>c.item.topicId===item.topicId).map(({input})=>`assert!(${name}(${Object.values(input).map(v=>literal(v,'rust')).join(',')}).is_err(),"${item.id} invalid domain accepted");`).join('\n');
      return `mod author_${i}{${item.solution.rust}\npub fn check(){${fixtures}\n${invalid}}}`;
    }).join('\n');
    const rsSource=join(directory,'references.rs'),binary=join(directory,process.platform==='win32'?'references.exe':'references');
    writeFileSync(rsSource,modules+`\nfn main(){${exercises.map((_,i)=>`author_${i}::check();`).join('')}}`);
    const compilation=spawnSync(process.env.PRACTICE_RUSTC||'rustc',['--edition=2021',rsSource,'-o',binary],{encoding:'utf8',timeout:60000});
    assert.equal(compilation.status,0,compilation.stderr||compilation.error?.message);
    const run=spawnSync(binary,[],{encoding:'utf8',timeout:15000});
    assert.equal(run.status,0,run.stderr||run.error?.message);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
