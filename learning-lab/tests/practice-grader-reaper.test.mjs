import test from 'node:test'
import assert from 'node:assert/strict'
import { Sandbox } from '@vercel/sandbox'
import { createReaper, createReaperHandler } from '../grader/reaper.mjs'

const clock=Date.UTC(2026,9,13,20),old=clock-11*60*1000
const tags={rustml_attempt:'10000000-0000-4000-8000-000000000001',rustml_job:'20000000-0000-4000-8000-000000000001',rustml_generation:'1'}
const item=(index=1,changes={})=>({name:`rustml-case-30000000-0000-4000-8000-${String(index).padStart(12,'0')}`,persistent:false,createdAt:old,updatedAt:old,tags,...changes})
const page=(sandboxes,next=null)=>({sandboxes,pagination:{count:sandboxes.length,next}})
function fixture(pages,options={}) {
  const state={lists:[],gets:[],stops:[],deletes:[]}
  const list=async params=>{state.lists.push(params);return pages[state.lists.length-1]}
  const get=async params=>{
    state.gets.push(params)
    const candidate=pages.flatMap(p=>p.sandboxes).find(c=>c.name===params.name)
    return {...candidate,createdAt:new Date(candidate.createdAt),updatedAt:new Date(candidate.updatedAt),...(options.changed??{}),currentSession:()=>({createdAt:new Date(options.sessionCreated??old)}),
      async stop(params){state.stops.push(params);if(options.stopFailure)throw Error('secret provider stop context')},
      async delete(params){state.deletes.push(params);if(options.deleteFailure)throw Error('secret provider delete context')},
      resume(){throw Error('must never resume')},snapshot(){throw Error('must never snapshot')},runCommand(){throw Error('must never execute')},
    }
  }
  return {state,reap:createReaper({list,get,now:()=>clock,...options.limits})}
}

test('only fully owned old ephemeral cases are stopped/deleted; no snapshots or credentials escape aggregate result',async()=>{
  const candidates=[item(),item(2,{name:'rustml-preparation-trusted'}),item(3,{persistent:true}),item(4,{createdAt:clock-600000}),item(5,{updatedAt:clock-1000}),item(6,{tags:{...tags,rustml_job:'invalid'}}),item(7,{tags:{...tags,rustml_generation:'0'}}),item(8,{tags:{...tags,rustml_generation:'9007199254740992'}}),item(10,{tags:undefined}),item(11,{createdAt:'2026-10-13'}),item(12,{name:'rustml-case-not-a-uuid'}),item(13,{tags:{...tags,rustml_generation:'01'}})]
  const f=fixture([page(candidates)]),result=await f.reap()
  assert.equal(result.deleted,1);assert.equal(result.skipped,candidates.length-1);assert.equal(result.status,'complete')
  assert.equal(f.state.gets.length,1);assert.equal(f.state.gets[0].resume,false)
  assert.deepEqual(Object.keys(f.state.deletes[0]).sort(),['deleteOrphanSnapshots','signal'])
  assert.equal(f.state.deletes[0].deleteOrphanSnapshots,false)
  assert.notEqual(f.state.stops[0].signal,f.state.deletes[0].signal)
  assert.ok(!JSON.stringify(result).includes(tags.rustml_attempt))
})
test('raw SDK pagination uses name prefix/sort/limit/cursor and does not auto-collect every page',async()=>{
  const f=fixture([page([item(1)],'page2'),page([item(2)])])
  const result=await f.reap()
  assert.equal(result.pages,2);assert.equal(result.deleted,2)
  assert.equal(f.state.lists[0].namePrefix,'rustml-case-');assert.equal(f.state.lists[0].sortBy,'name');assert.equal(f.state.lists[0].limit,100)
  assert.equal(f.state.lists[1].cursor,'page2')
})
test('owned case snapshot references are preserved while deleting only the ephemeral sandbox',async()=>{
  const f=fixture([page([item(9,{currentSnapshotId:'trusted-preparation-snapshot'})])])
  assert.equal((await f.reap()).deleted,1)
  assert.equal(f.state.deletes[0].deleteOrphanSnapshots,false)
  // The fixture's snapshot/resume/runCommand methods throw if invoked.
})
test('ownership metadata is rechecked after get and a recent session protects an old sandbox',async()=>{
  for(const options of [{changed:{persistent:true}},{changed:{tags:{...tags,rustml_job:'40000000-0000-4000-8000-000000000004'}}},{sessionCreated:clock-1000}]){
    const f=fixture([page([item()])],options),result=await f.reap()
    assert.equal(result.deleted,0);assert.equal(f.state.stops.length,0);assert.equal(result.skipped,1)
  }
})
test('stop/delete failures are safely counted and delete still attempts owned resource after stop failure',async()=>{
  for(const options of [{stopFailure:true},{deleteFailure:true},{stopFailure:true,deleteFailure:true}]){
    const f=fixture([page([item()])],options),result=await f.reap()
    assert.equal(result.status,'partial');assert.ok(result.failed>0);assert.equal(f.state.stops.length,1);assert.equal(f.state.deletes.length,1)
    assert.ok(!JSON.stringify(result).includes('secret'))
  }
})
test('page and deletion caps return a partial factual snapshot',async()=>{
  const count=fixture([page([item(1),item(2)])],{limits:{maxCount:1}})
  assert.equal((await count.reap()).truncated,true);assert.equal(count.state.deletes.length,1)
  const pages=fixture([page([item(1)],'next')],{limits:{maxPages:1}})
  assert.equal((await pages.reap()).truncated,true);assert.equal(pages.state.lists.length,1)
})
test('hung operations are bounded even when a dependency ignores its AbortSignal',async()=>{
  const reap=createReaper({list:()=>new Promise(()=>{}),get:()=>{throw Error('must not get')},operationMs:20,maxRunMs:100})
  const start=Date.now(),result=await reap()
  assert.equal(result.status,'partial');assert.equal(result.timedOut,true);assert.equal(result.failed,1);assert.ok(Date.now()-start<1000)
})
test('an external abort prevents subsequent list/get/stop/delete calls',async()=>{
  const f=fixture([page([item()])]),control=new AbortController();control.abort()
  const result=await f.reap({signal:control.signal})
  assert.equal(result.status,'partial');assert.equal(f.state.lists.length,0);assert.equal(f.state.gets.length,0)
})
test('installed SDK3.7 list raw numeric metadata and pagination are accepted without external traffic',async()=>{
  let requests=0
  const candidate={...item(),currentSessionId:'session-mock',status:'stopped'}
  const list=options=>Sandbox.list({...options,token:'test-token',teamId:'test-team',projectId:'test-project',fetch:async()=>{requests++;return new Response(JSON.stringify(page([candidate])),{headers:{'content-type':'application/json'}})}})
  const f=fixture([page([candidate])])
  const reap=createReaper({list,get:async options=>{f.state.gets.push(options);return {...candidate,createdAt:new Date(old),updatedAt:new Date(old),stop:async()=>{},delete:async()=>{},currentSession:()=>({createdAt:new Date(old)})}},now:()=>clock})
  assert.equal((await reap()).deleted,1);assert.equal(requests,1);assert.equal(f.state.gets[0].resume,false)
})

test('cron handler refuses unauthorized/misconfigured/method requests before any sweep',async()=>{
  const secret='test-only-cron-secret-'+'x'.repeat(32)
  let calls=0
  const reap=async()=>{calls++;throw Error('must not mutate')}
  const handler=createReaperHandler({secret,reap})
  for(const authorization of ['',`Bearer ${secret}wrong`,`Basic ${secret}`]){
    const response=await handler(new Request('https://example.test/reap',{headers:{authorization}}))
    assert.equal(response.status,403)
  }
  const wrongMethod=await handler(new Request('https://example.test/reap',{method:'POST',headers:{authorization:`Bearer ${secret}`}}))
  assert.equal(wrongMethod.status,405);assert.equal(wrongMethod.headers.get('allow'),'GET')
  const unconfigured=createReaperHandler({secret:'too-short',reap})
  assert.equal((await unconfigured(new Request('https://example.test/reap'))).status,503)
  assert.equal(calls,0)
})
test('authorized cron awaits sweep and returns only safe aggregate counts',async()=>{
  const secret='test-only-cron-secret-'+'x'.repeat(32),f=fixture([page([item()])])
  let complete=false
  const handler=createReaperHandler({secret,reap:async options=>{await new Promise(resolve=>setTimeout(resolve,10));complete=true;return {...await f.reap(options),rawSdkError:'secret-never-rendered'}}})
  const response=await handler(new Request('https://example.test/reap',{headers:{authorization:`Bearer ${secret}`}}))
  const result=await response.json()
  assert.equal(response.status,200);assert.equal(complete,true);assert.equal(result.deleted,1);assert.equal(result.status,'complete')
  assert.equal('rawSdkError' in result,false);assert.equal(response.headers.get('cache-control'),'no-store')
})
test('SDK failures and malformed sweep reports never expose raw error/secret bodies',async()=>{
  const secret='test-only-cron-secret-'+'x'.repeat(32)
  for(const reap of [async()=>{throw Error('private SDK token '+secret)},async()=>({status:'complete',raw:secret})]){
    const handler=createReaperHandler({secret,reap}),response=await handler(new Request('https://example.test/reap',{headers:{authorization:`Bearer ${secret}`}}))
    assert.equal(response.status,503);assert.deepEqual(await response.json(),{code:'reaper_unavailable'})
  }
})
