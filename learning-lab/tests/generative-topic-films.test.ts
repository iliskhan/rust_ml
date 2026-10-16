import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFixture, filmCopy, numericalCases, type FilmSlug } from '../animations/vaeposterior/catalog.ts';
import * as v from '../src/vaeGanMath.ts';
import * as d from '../src/diffusionMath.ts';
import * as g from '../src/gnnMath.ts';
import * as r from '../src/rlMath.ts';
import * as p from '../src/policyVarianceMath.ts';

const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
const cases = numericalCases();

test('22 exported film traces replay current mathematics; chapters, narration and captions share 40 seconds', () => {
  assert.equal(Object.keys(filmCopy).length, 22);
  for (const slug of Object.keys(filmCopy) as FilmSlug[]) {
    const exported = JSON.parse(readFileSync(new URL(`../animations/${slug}/fixture.json`, import.meta.url), 'utf8'));
    const { screenQuestion, screenResult, screenTask, ...payload } = exported;
    assert.deepEqual(payload, JSON.parse(JSON.stringify(buildFixture(slug))), `${slug}: stale mathematical fixture`);
    assert.ok(screenQuestion && screenResult && screenTask);
    assert.equal(payload.duration, 40); assert.equal(payload.answerAt, 12); assert.equal(payload.lesson.question.time, 9);
    assert.deepEqual(payload.lesson.chapters.map((c: { start:number }) => c.start), [0,6,12,26,34]);
    assert.deepEqual(payload.lesson.chapters.map((c: { frame:number }) => c.frame), [4,9,22,30,37]);
    assert.ok(payload.lesson.question.explanation && payload.lesson.practice.explanation);
    assert.notEqual(payload.lesson.question.question, payload.lesson.practice.question);
    const narration = JSON.parse(readFileSync(new URL(`../animations/${slug}/narration.ru.json`, import.meta.url), 'utf8'));
    assert.equal(narration.duration, 40);
    assert.deepEqual(narration.segments.map((s: {start:number;end:number}) => [s.start,s.end]), [[0,5.7],[6,8.8],[12,18],[18.5,25.7],[26,33.5],[34,39.7]]);
    assert.ok(narration.segments.every((s: {text:string}) => s.text.split(/\s+/u).length <= 16), `${slug}: narration must fit`);
    const captions = readFileSync(new URL(`../public/animations/${slug}/captions.ru.vtt`, import.meta.url), 'utf8');
    const times = [...captions.matchAll(/00:00:(\d+\.\d+) --> 00:00:(\d+\.\d+)/g)].map(m => [Number(m[1]),Number(m[2])]);
    assert.deepEqual(times, [[0,6],[6,12],[12,18.5],[18.5,26],[26,34],[34,40]], `${slug}: caption gap`);
  }
});

test('VAE: exact negative ELBO bounds marginal NLL; sampled objective has the reparameterized gradient', () => {
  const { trace, expected, marginal, inputs } = cases.vaeelbo;
  assert.ok(expected.loss >= marginal);
  assert.notEqual(trace.loss, expected.loss);
  close(trace.loss, trace.nll + trace.kl);
  const h=1e-5;
  inputs.parameters.forEach((_, i) => {
    const plus=[...inputs.parameters],minus=[...inputs.parameters];plus[i]+=h;minus[i]-=h;
    close(trace.gradient[i],(v.vaeTrace(plus,inputs.x,inputs.epsilon).loss-v.vaeTrace(minus,inputs.x,inputs.epsilon).loss)/(2*h),1e-7);
  });
  const posterior = cases.vaeposterior;
  close(posterior.trace.z, posterior.trace.mu + posterior.trace.sd * posterior.inputs.epsilon);
  const changedNoise = v.vaeTrace(posterior.inputs.parameters, posterior.inputs.x, -1);
  close(changedNoise.mu, posterior.trace.mu); close(changedNoise.sd, posterior.trace.sd);
  assert.notEqual(changedNoise.z, posterior.trace.z);
  assert.notDeepEqual(cases.vaetraining.before, cases.vaetraining.after);
});

test('GAN: alternating updates freeze the other network; intentionally collapsed start loses diversity', () => {
  const { inputs, dStep, gStep } = cases.gantraining;
  assert.deepEqual(inputs.model.generator,dStep.state.generator);
  assert.notDeepEqual(inputs.model.discriminator,dStep.state.discriminator);
  assert.deepEqual(dStep.state.discriminator,gStep.state.discriminator);
  assert.notDeepEqual(dStep.state.generator,gStep.state.generator);
  const variance=(x:number[])=> { const mean=x.reduce((a,b)=>a+b,0)/x.length;return x.reduce((a,b)=>a+(b-mean)**2,0)/x.length; };
  assert.ok(variance(cases.gandiversity.collapse.generated)<variance(cases.gandiversity.regular.generated)*.001);
  assert.equal(cases.gandiversity.collapse.leftFraction,1);
  assert.ok(Math.abs(cases.ganobjectives.before[0])>100*Math.abs(cases.ganobjectives.before[1]));
});

test('Diffusion: learned predictor, exact conditional mean, realized noise and sampling noise stay distinct', () => {
  const schedule=cases.diffusionforward.schedule;
  close(d.forwardNoise(1.5, 5, 0, schedule),1.5);
  const { xt,predicted,reverse,deterministic }=cases.diffusionreverse;
  close(reverse.next,reverse.mean+reverse.noise);
  close(reverse.mean,deterministic.next);
  assert.notEqual(predicted,-.8);
  assert.notEqual(predicted,d.optimalEpsilon(xt,24,schedule));
  close(d.ddpmStep(xt,predicted,1,schedule,100).noise,0);
  const input=cases.diffusionsampling.inputs,model=cases.diffusionsampling.training.model;
  const predict=(x:number,t:number)=>d.predictEpsilon(model,x,t,schedule);
  assert.deepEqual(d.sampleTrajectory(predict,schedule,'ddim',input.initial,999,input.evaluations),cases.diffusionsampling.ddim);
  assert.equal(cases.diffusionsampling.ddim.length,17);assert.equal(cases.diffusionsampling.ddpm.length,65);
  close(cases.diffusionguidance.guidance.guided,cases.diffusionguidance.guidance.conditional);
  assert.ok(cases.diffusiontraining.updated.history.at(-1)!.y<cases.diffusiontraining.training.history[0].y);
});

test('GNN: message sums, masked labels, equivariance and degree-normalized smoothing', () => {
  const {inputs,graph}=cases.gnnmessage;
  close(graph.aggregate[2][0],graph.normalized[2].reduce((sum,w,i)=>sum+w*inputs.features[i][0],0));
  assert.ok(Math.abs(graph.normalized[2].reduce((a,b)=>a+b,0)-1)>.01);
  assert.ok(cases.gnndepth.permutation.error<1e-12);
  assert.ok(cases.gnndepth.smoothed.dispersions[30]<cases.gnndepth.smoothed.dispersions[0]);
  const labels=[...g.GRAPH_LABELS];labels[1]=1-labels[1];
  const altered=g.gcnLossAndGradient(inputs.adjacency,inputs.features,labels,g.GRAPH_TRAIN,inputs.weights);
  assert.deepEqual(altered.gradient,cases.gnntraining.graphStep.before.gradient);
  close(cases.gnnvariants.attention.attention.reduce((a,b)=>a+b,0),1);
  cases.gnnvariants.uniform.attention.forEach(w=>close(w,.25));
});

test('RL: transition mass, Bellman propagation, terminal vs truncation and baseline moments', () => {
  close(cases.rltransition.choices.reduce((sum,t)=>sum+t.probability,0),1);
  assert.ok(cases.rlbellman.sweep.values[2]>0);assert.ok(cases.rlbellman.sweep2.values[1]>0);
  assert.ok(cases.rlbellman.solution.residual<1e-10);
  close(cases.rlqlearning.q.target,-.04+.9*.8);close(cases.rlqlearning.terminal.target,-.04);
  assert.equal(cases.rlqlearning.episode.episode.outcome,'truncated');
  assert.equal(cases.rlqlearning.episode.episode.last.terminal,false);
  const table=r.zeroQ(r.DEFAULT_MDP).map(row=>row.map(()=>.8));
  const truncated=r.runQEpisode(r.DEFAULT_MDP,table,.2,0,r.seededRandom(73),1);
  close(truncated.episode.last.target,-.04+.9*.8);
  close(cases.rlpolicy.raw.mean,cases.rlpolicy.adjusted.mean);
  close(cases.rlpolicy.raw.mean,.35);assert.ok(cases.rlpolicy.adjusted.variance<1e-28);
  const a=p.policyGradientMoments(.7,[-.2,.9],.1,4),b=p.policyGradientMoments(.7,[-.2,.9],.1,16);
  close(a.meanVariance,4*b.meanVariance);
  const bad=p.policyGradientMoments(0,[-.4,1],10,16);
  assert.ok(bad.meanVariance>cases.rlpolicy.raw.meanVariance);
});
