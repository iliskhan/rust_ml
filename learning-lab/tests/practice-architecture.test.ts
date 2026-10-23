import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { architecturePracticeTopics as topics } from '../src/practice/architecture-catalog.ts';

const exercises=topics.flatMap(t=>t.exercises);
const near=(a:number,e:number,tol=1e-9)=>assert.ok(Number.isFinite(a)&&Math.abs(a-e)<=tol*(1+Math.abs(e)),`${a} != ${e}`);
const item=(key:string)=>topics.find(t=>t.id==='unit.architecture.'+key)!.exercises[0];
// Immutable author sources only: no draft, editor, network or learner code enters this harness.
function run(cases:{key:string;values:number[]}[]) {
  const source='const out=[];\n'+cases.map(c=>`{${item(c.key).solution.javascript}\nconst v=${JSON.stringify(c.values)},before=JSON.stringify(v);out.push(solve(v));if(JSON.stringify(v)!==before)throw Error('mutation');}`).join('\n')+'\nconsole.log(JSON.stringify(out));';
  const r=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});
  assert.equal(r.status,0,r.stderr);
  return JSON.parse(r.stdout) as number[][];
}
test('architecture: exactly nine inventory IDs, one guided and two distinct transfer exercises, three languages',()=>{
  const inventory=JSON.parse(readFileSync(new URL('../docs/practice-topic-inventory.json',import.meta.url),'utf8'));
  assert.deepEqual(topics.map(t=>t.id).sort(),inventory.units.filter((u:{route:string})=>u.route==='#architectures').map((u:{id:string})=>u.id).sort());
  for(const topic of topics){
    assert.deepEqual(topic.exercises.map(e=>e.mode),['guided','transfer','transfer']);
    assert.equal(new Set(topic.exercises.map(e=>e.prompt)).size,3);
    assert.equal(new Set(topic.exercises.map(e=>e.fixtures[0].input)).size,3);
    for(const e of topic.exercises){
      assert.deepEqual(e.tolerance,{atol:1e-10,rtol:1e-9});
      assert.ok(e.prompt.includes(`atol=${e.tolerance!.atol.toExponential().replace('e-', 'e−')}, rtol=${e.tolerance!.rtol.toExponential().replace('e-', 'e−')}`));
    }
    for(const e of topic.exercises)for(const lang of ['python','javascript','rust'] as const)assert.ok(e.solution[lang].length>100&&e.starter[lang]!==e.solution[lang]);
  }
});
test('architecture: every published fixture executes against its trusted JS source without input mutation',()=>{
  const source='const out=[];\n'+exercises.map(e=>`{${e.solution.javascript}\nconst v=${JSON.parse(e.fixtures[0].input).values?JSON.stringify(JSON.parse(e.fixtures[0].input).values):'[]'},before=JSON.stringify(v);out.push(solve(v));if(JSON.stringify(v)!==before)throw Error('mutation');}`).join('\n')+'\nconsole.log(JSON.stringify(out));';
  const r=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
  const outputs=JSON.parse(r.stdout) as number[][];
  outputs.forEach((v,i)=>{const expected=JSON.parse(exercises[i].fixtures[0].output) as number[];assert.equal(v.length,expected.length);v.forEach((a,j)=>near(a,expected[j]));});
});
test('BPTT: independent two-step forward central differences include both repeated-weight paths',()=>{
  const cases=[[1,-.5,.3,.7,.8,.2],[0,1,1,.4,-.5,-.2],[1,0,0,1,0,1],[-1,.2,-.4,.3,-.7,.8]];
  const loss=(v:number[])=>{const h=Math.tanh(v[3]*v[0]+v[4]*v[2]);return (Math.tanh(v[3]*v[1]+v[4]*h)-v[5])**2/2;};
  run(cases.map(values=>({key:'bptt',values}))).forEach((out,i)=>{
    const v=cases[i],p=[...v],m=[...v],h=1e-5;p[4]+=h;m[4]-=h;
    near(out[0],loss(v));near(out[1],(loss(p)-loss(m))/(2*h),1e-7);
    if(i<2){const h1=Math.tanh(v[3]*v[0]+v[4]*v[2]),h2=Math.tanh(v[3]*v[1]+v[4]*h1);const lastOnly=(h2-v[5])*(1-h2*h2)*h1;assert.ok(Math.abs(lastOnly-out[1])>1e-3,'last-step-only mutant must fail');}
  });
});
test('CNN and RNN: local derivatives agree with independent forward finite differences',()=>{
  const cnn=[1.2,-.5,.2,-1,.5,.1,.4,-.5,.2,.3,.1],rnn=[.3,-.2,.5,-.7,.1],h=1e-5;
  const out=run([{key:'cnn-training',values:cnn},{key:'rnn',values:rnn}]);
  const cnnLoss=(v:number[])=>{let z=v[8];for(let k=0;k<4;k++)z+=v[k]*v[k+4];return (z-v[9])**2/2;};
  for(const [index,result] of [[4,1],[8,2]]){const p=[...cnn],m=[...cnn];p[index]+=h;m[index]-=h;near(out[0][result],(cnnLoss(p)-cnnLoss(m))/(2*h),1e-7);}
  near(out[0][3],cnn[4]-cnn[10]*out[0][1]);
  const forward=(hp:number)=>Math.tanh(rnn[2]*rnn[0]+rnn[3]*hp+rnn[4]);near(out[1][1],(forward(rnn[1]+h)-forward(rnn[1]-h))/(2*h),1e-7);
});
test('architecture: stride phase counterexample, attention common shift and convex gate mixtures',()=>{
  const result=run([{key:'cnn-shift',values:[0,1,0,0,1,0]},{key:'transformer',values:[0,1,-2,3]},{key:'transformer',values:[1,2,-2,3]},{key:'lstm',values:[2,1,0,0,0]},{key:'gru',values:[-.8,.25,.4,.2,.3,.5]}]);
  assert.deepEqual(result[0],[0,0,0,1]);result[1].forEach((v,i)=>near(v,result[2][i]));near(result[1][0]+result[1][1],1);assert.ok(result[1][2]>=-2&&result[1][2]<=3);
  assert.deepEqual(result[3],[2,0]);assert.ok(result[4][1]>=Math.min(-.8,result[4][0])&&result[4][1]<=Math.max(-.8,result[4][0]));
});
test('architecture JS rejects wrong shape, nonfinite values, sparse arrays and out-of-domain gates',()=>{
  const cases=[['dense','[]'],['dense','[0,0,0,0,NaN]'],['dense','Array(5)'],['dense','[0,0,0,0,true]'],['cnn-training','[1,0,0,0,0,0,0,0,0,0,-.1]'],['lstm','[0,1.1,0,0,0]'],['gru','[0,0,-.1,0,0,0]']];
  const r=spawnSync(process.execPath,['--input-type=module','-e',cases.map(([k,arg])=>`{${item(k).solution.javascript}\nlet ok=false;try{solve(${arg})}catch(e){ok=e instanceof RangeError;}if(!ok)throw Error('accepted ${k}');}`).join('\n')],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
});
test('architecture cross-language trusted source audit', {skip:process.env.PRACTICE_VERIFY_ALL_LANGUAGES!=='1'},()=>{
  const dir=mkdtempSync(join(tmpdir(),'rustml-architecture-author-'));
  const float=(v:number)=>Number.isInteger(v)?`${v}.0`:String(v);
  try{
    const py=join(dir,'audit.py');writeFileSync(py,'import json\noutputs=[]\n'+exercises.map(e=>e.solution.python+'\noutputs.append(solve('+JSON.stringify(JSON.parse(e.fixtures[0].input).values)+'))\n').join('\n')+'\nprint(json.dumps(outputs))');
    const p=spawnSync(process.env.PRACTICE_PYTHON||'python',[py],{encoding:'utf8',timeout:30000,env:{...process.env,PYTHONUTF8:'1'}});assert.equal(p.status,0,p.stderr||p.error?.message);JSON.parse(p.stdout).forEach((v:number[],i:number)=>v.forEach((a,j)=>near(a,JSON.parse(exercises[i].fixtures[0].output)[j])));
    const rs=join(dir,'audit.rs'),exe=join(dir,process.platform==='win32'?'audit.exe':'audit');
    writeFileSync(rs,exercises.map((e,i)=>`mod a${i}{${e.solution.rust}\npub fn verify(){let actual=solve(&[${JSON.parse(e.fixtures[0].input).values.map(float).join(',')}]).unwrap();let expected=[${JSON.parse(e.fixtures[0].output).map(float).join(',')}];assert_eq!(actual.len(),expected.len());for(a,e)in actual.iter().zip(expected){assert!(a.is_finite()&&(a-e).abs()<=1e-9*(1.0+e.abs()));}assert!(solve(&[]).is_err());}}`).join('\n')+`\nfn main(){${exercises.map((_,i)=>`a${i}::verify();`).join('')}}`);
    const c=spawnSync(process.env.PRACTICE_RUSTC||'rustc',['--edition=2021',rs,'-o',exe],{encoding:'utf8',timeout:60000});assert.equal(c.status,0,c.stderr||c.error?.message);
    const r=spawnSync(exe,[],{encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
