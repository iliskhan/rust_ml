import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {denseForward,conv2d,pool2d,rnnForward,lstmForward,gruForward,transformerForward} from '../src/architectures.ts'
import {cnnShiftComparison} from '../src/cnnShiftMath.ts'
import {cnnLossGradient,cnnSgdStep} from '../src/cnnTrainingMath.ts'
import {bptt,trainBptt} from '../src/bpttMath.ts'
import {sinusoidalPosition,residualFfn,normalizationTrace,attentionTrace,projectTokens,SMALL_PROJECTIONS,toyLanguageForward,samplingDistribution,sampleToken} from '../src/transformerMath.ts'
import {headTrainingTrace,headSgdStep} from '../src/transformerHeadMath.ts'
import {tinyTransformerTrace,tinySgdStep,tinyTokenContributions,TINY_GROUPS} from '../src/tinyTransformerMath.ts'
import {trainBpe,applyBpe,ffnTrace,adaptationStep,adaptationDelta,adaptationPredict,adaptationLoss} from '../src/tokenAdaptationMath.ts'
import {visionTransformerTrace,mixtureExpertsTrace,imageDenoiserTrace} from '../src/visionRoutingMath.ts'
import {mlaTrace,tiledAttention,fullAttentionReference,selectiveSsm,memoryComparison,memoryStep} from '../src/efficientSequenceMath.ts'

const slugs=["dense","cnnforward","cnntraining","recurrent","bptt","transformerforward","embeddings","transformerblock","crossmask","sampling","outputtraining","tinytraining","bpe","swiglu","lora","vit","moe","mla","exactsoftmax","ssm","unetdit"] as const
const load=(slug:string)=>JSON.parse(readFileSync(new URL('../animations/'+slug+'/fixture.json',import.meta.url),'utf8'))
const near=(a:number,b:number,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`)
// Fixtures use JSON transport: -0 becomes 0 and masked -Infinity becomes null.
const same=(a:unknown,b:unknown)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)))
const maxError=(a:number[][],b:number[][])=>Math.max(...a.flatMap((r,i)=>r.map((x,j)=>Math.abs(x-b[i][j]))))
test('21 dedicated films: continuous captions, delayed reveal, numeric alternatives',()=>{
 for(const slug of slugs){
  const f=load(slug)
  same(f.chapters,[0,6,12,26,34]);same(f.frames,[4,9,22,30,37])
  assert.equal(f.duration,40);assert.equal(f.predictionAt,9);assert.equal(f.answerAt,12);assert.equal(f.posterAt,30)
  assert.equal(f.lesson.media,slug);assert.equal(f.lesson.question.time,9);assert.ok(f.lesson.practice.question.includes('Новый случай'))
  assert.ok(f.lesson.table.rows.length>=5);assert.ok(f.lesson.transcript.length>=5)
  assert.ok(f.lesson.transcript.every((line:unknown)=>typeof line==='string' && line.length>0))
  const scene=readFileSync(new URL('../animations/'+slug+'/'+slug+'.py',import.meta.url),'utf8')
  assert.ok(!scene.includes('text(undefined'),slug+' has an unresolved question string')
  const captions=readFileSync(new URL('../public/animations/'+slug+'/captions.ru.vtt',import.meta.url),'utf8')
  const ranges=[...captions.matchAll(/00:00:(\d{2})\.(\d{3}) --> 00:00:(\d{2})\.(\d{3})/g)].map(m=>[+m[1]+ +m[2]/1000,+m[3]+ +m[4]/1000])
  assert.equal(ranges[0][0],0);assert.equal(ranges.at(-1)![1],40)
  ranges.slice(1).forEach((r,i)=>assert.equal(r[0],ranges[i][1]))
  const audio=JSON.parse(readFileSync(new URL('../animations/'+slug+'/narration.ru.json',import.meta.url),'utf8'))
  assert.ok(audio.segments.every((s:{text?:unknown})=>typeof s.text==='string' && s.text.length>0))
  same(audio.segments.map((s:{start:number;end:number})=>[s.start,s.end]),[[0,5.7],[6,8.8],[12,18],[18.5,25.7],[26,33.5],[34,39.7]])
 }
})
test('dense replay: both nonlinear and affine paths',()=>{
 const n=load('dense').numerical
 same(denseForward(n.input,n.layers,'tanh'),n.trace);same(denseForward(n.input,n.layers,'linear'),n.linear)
 const scale=(x:number)=>denseForward([x,-.4],n.layers,'linear').at(-1)!.output
 scale(.9).forEach((v:number,i:number)=>near(v,(scale(.7)[i]+scale(1.1)[i])/2))
})
test('CNN forward: sliding window, pooling and shifted comparison replay',()=>{
 const n=load('cnnforward').numerical
 same(conv2d([n.input],[[n.filter]],{stride:1,padding:0,dilation:1}),n.trace)
 same(pool2d(n.trace.output[0],2,'max'),n.pool);same(cnnShiftComparison(n.input,1,1,1),n.shift)
 assert.equal(n.trace.output[0][0][0],3);assert.equal(n.trace.output[0][0][2],0)
})
test('CNN training: nine window contributions and numerical derivative',()=>{
 const n=load('cnntraining').numerical,t=cnnLossGradient(n.input,n.target,n.parameters)
 same(t,n.before);same(cnnSgdStep(n.input,n.target,n.parameters,n.rate),n.step)
 near(t.weightGradient[1][2],t.windows.reduce((s,w)=>s+w.weightContributions[1][2],0))
 const epsilon=1e-5,plus=structuredClone(n.parameters),minus=structuredClone(n.parameters)
 plus.weights[1][2]+=epsilon;minus.weights[1][2]-=epsilon
 near(t.weightGradient[1][2],(cnnLossGradient(n.input,n.target,plus).loss-cnnLossGradient(n.input,n.target,minus).loss)/(2*epsilon),1e-8)
 assert.ok(n.step.after.loss<t.loss)
})
test('RNN/LSTM/GRU replay: shared weights do not force shared states',()=>{
 const n=load('recurrent').numerical
 same(rnnForward(n.input,n.base),n.rnn);same(lstmForward(n.input,n.lstmWeights),n.lstm);same(gruForward(n.input,n.gruWeights),n.gru)
 assert.notEqual(n.rnn[0].h,n.rnn[1].h)
 n.lstm.forEach((s:any)=>{near(s.c,s.retained+s.written);near(s.h,s.o*Math.tanh(s.c))})
 n.gru.forEach((s:any)=>near(s.h,s.retained+s.written))
})
test('BPTT replay: Wh sums all steps and matches finite difference',()=>{
 const n=load('bptt').numerical,t=bptt(n.input,n.weights,n.target,n.h0)
 same(t,n.trace);same(trainBptt(n.input,n.weights,n.target,n.h0,n.eta),n.step)
 near(t.gradients.wh,t.steps.reduce((s,r)=>s+r.dWh,0))
 const epsilon=1e-5
 near(t.gradients.wh,(bptt(n.input,{...n.weights,wh:n.weights.wh+epsilon},n.target,n.h0).loss-bptt(n.input,{...n.weights,wh:n.weights.wh-epsilon},n.target,n.h0).loss)/(2*epsilon),1e-8)
})
test('transformer family: full forward and mask change',()=>{
 const n=load('transformerforward').numerical
 // Non-finite masked scores are serialized as null in JSON.
 const json=(x:unknown)=>JSON.parse(JSON.stringify(x))
 same(json(transformerForward(n.options)),n.trace);same(json(transformerForward({...n.options,mode:'decoder'})),n.decoder)
 assert.notDeepEqual(n.trace.output[1],n.decoder.output[1])
})
test('embedding lookup and position replay: same ID is same row',()=>{
 const n=load('embeddings').numerical
 same(n.ids.map((id:number)=>n.embeddings[id]),n.lookup)
 same(n.ids.map((_:number,i:number)=>sinusoidalPosition(i,2)),n.positions)
 same(n.lookup.map((r:number[],i:number)=>r.map((v,d)=>v+n.positions[i][d])),n.positioned)
 same(n.lookup[0],n.lookup[2]);assert.notDeepEqual(n.positioned[0],n.positioned[2])
})
test('residual/norm replay: shift invariance belongs to LayerNorm, not RMSNorm',()=>{
 const n=load('transformerblock').numerical
 same(residualFfn(n.input,'layer','pre',true),n.pre);same(residualFfn(n.input,'layer','post',true),n.post)
 const shifted=n.input.map((v:number)=>v+2)
 normalizationTrace(shifted,'layer').output.forEach((v,i)=>near(v,n.layer.output[i]))
 assert.notDeepEqual(normalizationTrace(shifted,'rms').output,n.rms.output)
})
test('cross mask replay: future weights zero; rectangular source remains available',()=>{
 const n=load('crossmask').numerical
 const calc=(x:number[][],causal:boolean)=>JSON.parse(JSON.stringify(attentionTrace(projectTokens(x,SMALL_PROJECTIONS.q),projectTokens(n.encoder,SMALL_PROJECTIONS.k),projectTokens(n.encoder,SMALL_PROJECTIONS.v),{causal})))
 same(calc(n.encoder,false),n.bidirectional);same(calc(n.encoder,true),n.causal);same(calc(n.decoder,false),n.cross)
 same(n.causal.weights[0],[1,0,0]);assert.equal(n.cross.weights.length,2);assert.equal(n.cross.weights[0].length,3)
 n.cross.weights.forEach((r:number[])=>near(r.reduce((s,v)=>s+v,0),1))
})
test('sampling replay and shifted teacher targets; changing u does not update model',()=>{
 const n=load('sampling').numerical
 same(toyLanguageForward(n.ids),n.forward);same(samplingDistribution(n.logits,n.temperature,n.topK,n.topP),n.distribution)
 assert.equal(sampleToken(n.distribution.filtered,n.uniform),n.chosen)
 same(toyLanguageForward(n.teacherInput),n.teacher)
 same(n.targets.slice(0,-1),n.teacherInput.slice(1))
 sampleToken(n.distribution.filtered,.99);same(toyLanguageForward(n.ids),n.forward)
})
test('output head replay: analytic gradient and frozen hidden states',()=>{
 const n=load('outputtraining').numerical
 same(headTrainingTrace(n.batch.hidden,n.batch.targets,n.parameters),n.trace);same(headSgdStep(n.batch.hidden,n.batch.targets,n.parameters,n.rate),n.step)
 const eps=1e-5,plus=structuredClone(n.parameters),minus=structuredClone(n.parameters)
 plus.weights[0][2]+=eps;minus.weights[0][2]-=eps
 near(n.trace.dWeights[0][2],(headTrainingTrace(n.batch.hidden,n.batch.targets,plus).loss-headTrainingTrace(n.batch.hidden,n.batch.targets,minus).loss)/(2*eps),1e-8)
 assert.ok(n.step.after.loss<n.trace.loss)
})
test('tiny full training replay: embeddings and Q receive true loss gradients',()=>{
 const n=load('tinytraining').numerical
 same(tinyTransformerTrace(n.parameters,n.sequence),n.trace);same(tinySgdStep(n.parameters,n.sequence,n.rate),n.next)
 for(const name of ['E','Wq']){
  const g=TINY_GROUPS.find(g=>g.name===name)!,index=g.offset,eps=1e-5,plus=[...n.parameters],minus=[...n.parameters]
  plus[index]+=eps;minus[index]-=eps
  near(n.trace.gradients[index],(tinyTransformerTrace(plus,n.sequence).loss-tinyTransformerTrace(minus,n.sequence).loss)/(2*eps),1e-7)
  near(tinyTokenContributions(n.parameters,n.sequence,index).reduce((s,v)=>s+v,0),n.trace.gradients[index])
 }
 assert.ok(n.after.loss<n.trace.loss)
})
test('BPE replay preserves text and keeps out-of-alphabet symbol explicit',()=>{
 const n=load('bpe').numerical
 same(trainBpe(n.corpus,n.mergeCount),n.model);same(applyBpe(n.text,n.model),n.encoded)
 assert.equal(n.encoded.decoded,n.text);assert.ok(n.encoded.unknown.includes('🦊'))
 const rules=JSON.stringify(n.model.steps);applyBpe('новый текст',n.model);assert.equal(JSON.stringify(n.model.steps),rules)
})
test('SwiGLU replay: product and local derivative',()=>{
 const n=load('swiglu').numerical
 same(ffnTrace(n.input,'swiglu'),n.trace);same(ffnTrace(n.input,'relu'),n.relu);same(ffnTrace(n.input,'gelu'),n.gelu)
 n.trace.rows.forEach((r:any)=>near(r.product,r.up*r.activated))
 const eps=1e-5,plus=[...n.input],minus=[...n.input];plus[0]+=eps;minus[0]-=eps
 ffnTrace(plus,'swiglu').output.forEach((v,i)=>near((v-ffnTrace(minus,'swiglu').output[i])/(2*eps),n.trace.derivative[i],1e-8))
})
test('LoRA replay: frozen base and actual rank-one correction',()=>{
 const n=load('lora').numerical
 same(adaptationStep(n.initial,n.data.train,'lora',n.rate),n.next);same(adaptationDelta(n.next),n.delta)
 same(n.next.w,n.initial.w);same(n.next.a,n.initial.a);assert.notDeepEqual(n.next.b,n.initial.b)
 near(adaptationLoss(n.next,n.data.train,'lora'),n.afterLoss)
 near(n.delta[0][0]*n.delta[1][1]-n.delta[0][1]*n.delta[1][0],0)
 same(adaptationPredict(n.next,n.x,'lora'),load('lora').lanes[2].values)
})
test('ViT replay: real pixel patches, projection and mean pooling',()=>{
 const n=load('vit').numerical
 same(visionTransformerTrace(n.image,n.positionStrength),n.trace);same(visionTransformerTrace(n.image,0),n.without)
 same(n.trace.flattened[0],[n.image[0][0],n.image[0][1],n.image[1][0],n.image[1][1]])
 n.trace.pooled.forEach((v:number,d:number)=>near(v,n.trace.output.reduce((s:number,r:number[])=>s+r[d],0)/4))
})
test('MoE replay: capacity removes routes and surviving mass is one',()=>{
 const n=load('moe').numerical
 same(mixtureExpertsTrace(n.inputs,n.topK,n.capacity),n.trace);same(mixtureExpertsTrace(n.inputs,n.topK,1),n.limited)
 n.limited.tokens.forEach((t:any)=>near(t.routes.reduce((s:number,r:any)=>s+r.weight,0),t.fullyDropped?0:1))
 assert.ok(n.limited.tokens.some((t:any)=>t.routes.some((r:any)=>!r.accepted)))
})
test('MLA replay: absorbed projection and explicit cache accounting',()=>{
 const n=load('mla').numerical
 same(mlaTrace(n.n,n.position,n.scale),n.trace)
 n.trace.heads.forEach((h:any)=>h.output.forEach((v:number,i:number)=>near(v,h.absorbedOutput[i])))
 assert.equal(n.trace.cache.latentScalars,4*(n.position+1));assert.equal(n.trace.cache.expandedScalars,12*(n.position+1))
})
test('exact softmax replay: varying tile sizes preserves every output',()=>{
 const n=load('exactsoftmax').numerical,{q,k,v}=n.input
 same(tiledAttention(q,k,v,n.block,n.causal,n.row),n.trace);same(fullAttentionReference(q,k,v,n.causal),n.reference)
 for(const size of [1,2,3,8]) assert.ok(maxError(tiledAttention(q,k,v,size,n.causal,n.row).output,n.reference.output)<1e-12)
})
test('SSM and delta replay: decay before addressed error and exact replacement new case',()=>{
 const n=load('ssm').numerical
 same(selectiveSsm(n.tokens,n.delta,n.selectivity),n.ssm);same(memoryComparison(n.tokens,n.retention,n.beta,n.selectivity),n.memory)
 n.ssm.forEach((s:any)=>s.state.forEach((v:number,i:number)=>near(v,s.decay[i]*s.previous[i]+s.write[i])))
 const previous=[[2,9],[3,8]],changed=memoryStep(previous,[1,0],[4,5],1,1,true)
 same(changed.state,[[4,9],[5,8]])
})
test('U-Net/DiT replay: same noise input; skip changes numerical forward',()=>{
 const n=load('unetdit').numerical
 same(imageDenoiserTrace(n.clean,n.noise,n.time,n.skip),n.trace);same(imageDenoiserTrace(n.clean,n.noise,n.time,false),n.without)
 assert.notDeepEqual(n.trace.unet.prediction,n.without.unet.prediction);same(n.trace.dit.prediction,n.without.dit.prediction)
 near(n.trace.noisy[0][0],Math.sqrt(n.trace.alphaBar)*n.clean[0][0]+Math.sqrt(1-n.trace.alphaBar)*n.noise[0][0])
})
