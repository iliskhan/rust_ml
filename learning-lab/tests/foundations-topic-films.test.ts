import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { activate,activationDerivative,mse,bceProbability,bceLogit } from '../src/math.ts'
import { createBoundaryExperiment,advanceBoundaryExperiment,saveBoundaryRun,type BoundarySettings } from '../src/boundaryExperiment.ts'
import { predictBoundary,boundaryMetrics } from '../src/boundaryNetworkMath.ts'
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`../animations/${name}/fixture.json`,import.meta.url),'utf8'))
test('activation curves and local slopes use the laboratory functions',()=>{
  const f=fixture('activations');for(const c of f.curves){for(const [z,a] of c.points)assert.equal(a,activate(z,c.kind));assert.deepEqual(c.slopes,[0,3].map(z=>activationDerivative(z,c.kind)))}
  assert.equal(activationDerivative(0,'relu'),0);assert.ok(activationDerivative(0,'sigmoid')>activationDerivative(3,'sigmoid'))
})
test('MSE keeps the two untouched residuals after changing only the third prediction',()=>{
  const f=fixture('mse');assert.deepEqual(f.initial,mse(f.before,f.targets));assert.deepEqual(f.final,mse(f.after,f.targets));assert.equal(f.initial.loss,.5);assert.equal(f.final.loss,1/6);assert.deepEqual(f.before.slice(0,2),f.after.slice(0,2))
})
test('probability BCE and logits give the same value with different input gradients',()=>{
  const f=fixture('bce');for(let i=0;i<f.probabilities.length;i++){const p=f.probabilities[i],z=f.logits[i];assert.deepEqual(f.losses[i],bceProbability(p,1));assert.deepEqual(f.logitLosses[i],bceLogit(z,1));assert.ok(Math.abs(f.losses[i].loss-f.logitLosses[i].loss)<1e-14);assert.ok(Math.abs(f.losses[i].grad*p*(1-p)-f.logitLosses[i].grad)<1e-14)}
})
test('boundary replay separates training from held-out metrics and preserves the initial saved run',()=>{
  const f=fixture('boundary');let run=createBoundaryExperiment(f.settings as BoundarySettings);assert.deepEqual(f.initialRun,saveBoundaryRun(run,.5,[.5,.5]));assert.equal(run.dataset.train.length,96);assert.equal(run.dataset.validation.length,32)
  for(const s of f.states){run=advanceBoundaryExperiment(run,s.step-run.optimizer.step);assert.equal(run.optimizer.step,s.step);assert.deepEqual(run.optimizer.params,s.params);assert.deepEqual(s.metrics.train,boundaryMetrics(run.optimizer.params,run.settings.config,run.dataset.train));assert.deepEqual(s.metrics.validation,boundaryMetrics(run.optimizer.params,run.settings.config,run.dataset.validation));for(const row of s.grid)for(const [x,y,p] of row)assert.equal(p,predictBoundary(run.optimizer.params,run.settings.config,[x,y]))}
})
