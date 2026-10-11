import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MDP, transitions, bellmanSweep, valueIteration, qUpdate, zeroQ, runQEpisode, seededRandom, sampleTransition, policyGradientBandit } from '../src/rlMath.ts';
const close = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
test('slip probabilities sum to one, wall outcomes merge, rewards paid on terminal entry only', () => {
  const mdp = {...DEFAULT_MDP,slip:.2};
  const row = transitions(mdp,0,0);
  assert.equal(row.length,2); close(row.find(t=>t.next===0)!.probability,.9); close(row.find(t=>t.next===1)!.probability,.1);
  for(let s=0;s<12;s++) for(let a=0;a<4;a++) close(transitions(mdp,s,a).reduce((sum,t)=>sum+t.probability,0),1);
  assert.deepEqual(transitions({...mdp,slip:0},2,1),[{next:3,reward:1,probability:1,terminal:true}]);
  assert.deepEqual(transitions(mdp,3,2),[{next:3,reward:0,probability:1,terminal:true}]);
});
test('Bellman values equal the hand-calculated deterministic shortest-path solution', () => {
  const mdp = {...DEFAULT_MDP,slip:0,stepReward:0,gamma:.9};
  const result = valueIteration(mdp);
  close(result.values[2],1); close(result.values[1],.9); close(result.values[0],.81);
  close(result.values[8],.9**4); close(result.values[3],0); close(result.values[7],0);
  assert.equal(result.converged,true); close(result.residual,0);
  const myopic = valueIteration({...mdp,gamma:0}); close(myopic.values[2],1); close(myopic.values[8],0);
});
test('Bellman sweep is synchronous and terminal bootstrap ignores arbitrary terminal values', () => {
  const mdp={...DEFAULT_MDP,slip:0,stepReward:0};
  const values=Array(12).fill(0); values[3]=900;
  const first=bellmanSweep(mdp,values);
  close(first.values[2],1); close(first.values[1],0); close(first.values[3],0);
  const second=bellmanSweep(mdp,first.values); close(second.values[1],.9);
});
test('stochastic Bellman solution matches a one-state linear equation including wall self-transitions', () => {
  const mdp={...DEFAULT_MDP,width:3,height:1,start:1,goal:2,pit:0,gamma:.8,slip:.2,stepReward:-.1};
  // Moving right: .8*1 + .2*(-.1 + .8*V); hence .84*V=.78.
  const solution=valueIteration(mdp);
  close(solution.values[1],.78/.84); close(solution.q[1][1],solution.values[1]);
});
test('positive step rewards may favor continuing and bounded solving reports unconverged honestly', () => {
  const mdp={...DEFAULT_MDP,slip:0,stepReward:.1,gamma:.99};
  const early=valueIteration(mdp,1e-10,1); assert.equal(early.converged,false); assert.equal(early.iterations,1);
  const solution=valueIteration(mdp,1e-10,3000); close(solution.values[mdp.start],10,1e-8);
});
test('Q update agrees with manual arithmetic and masks true terminals only', () => {
  const regular=qUpdate(.2,-.04,.8,false,.9,.25);
  close(regular.target,.68); close(regular.error,.48); close(regular.updated,.32);
  close(qUpdate(.2,1,100,true,.9,.25).updated,.4);
  const mdp={...DEFAULT_MDP,slip:0}; const table=zeroQ(mdp); table[mdp.start][0]=2; table[4][0]=3;
  const result=runQEpisode(mdp,table,.25,0,()=>.5,1);
  assert.equal(result.episode.outcome,'truncated'); close(result.episode.last.target,-.04+.9*3);
  close(table[mdp.start][0],2); // input is not mutated
});
test('seeded episodes are reproducible and tabular Q learns a useful deterministic policy', () => {
  const mdp={...DEFAULT_MDP,slip:0};
  function train(){ const random=seededRandom(42); let q=zeroQ(mdp); let wins=0; for(let i=0;i<1000;i++){const result=runQEpisode(mdp,q,.2,.2,random);q=result.q;if(result.episode.outcome==='goal')wins++;}return {q,wins}; }
  const a=train(),b=train(); assert.deepEqual(a,b); assert.ok(a.wins>800);
  const evaluation=runQEpisode(mdp,a.q,0,0,seededRandom(7)); assert.equal(evaluation.episode.outcome,'goal'); assert.equal(evaluation.episode.steps,5);
});
test('sampling boundaries, gamma/slip/alpha validation and exact policy gradient', () => {
  const mdp={...DEFAULT_MDP,slip:.2}; assert.equal(sampleTransition(mdp,8,0,0).next,4);
  assert.throws(()=>sampleTransition(mdp,8,0,1),RangeError);
  assert.throws(()=>valueIteration({...mdp,gamma:1}),RangeError);
  assert.throws(()=>valueIteration({...mdp,slip:-.1}),RangeError);
  assert.throws(()=>qUpdate(0,0,0,false,.9,2),RangeError);
  const pg=policyGradientBandit(0,[-1,1],.5); close(pg.right,.5); close(pg.expected,0); close(pg.gradient,.5); close(pg.nextTheta,.25);
  const h=1e-5,theta=.7;
  close(policyGradientBandit(theta,[-.4,1],.1).gradient,(policyGradientBandit(theta+h,[-.4,1],.1).expected-policyGradientBandit(theta-h,[-.4,1],.1).expected)/(2*h),1e-8);
});
