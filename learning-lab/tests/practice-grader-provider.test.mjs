import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createVercelProvider, nonRetryingMutations, pinSession } from '../grader/vercel-provider.mjs'
import { Sandbox } from '@vercel/sandbox'
import { buildExecution } from '../grader/execution.mjs'

const runtime={language:'javascript',image:'vercel/sandbox/universal@sha256:'+'a'.repeat(64),caseTimeoutMs:45000}
const scope={attemptId:'10000000-0000-4000-8000-000000000001',jobId:'20000000-0000-4000-8000-000000000001',leaseGeneration:1}
const execution=buildExecution('function solve(x){return x}',{language:'javascript',protocol:1,adapter:'rustml-public-values-v1',entrypoint:'solve'},{id:'case1',input:{x:2}})
const raw='{"protocol":1,"case_id":"case1","value":2}'
function fixture(options={}) {
  const state={creates:[],commands:[],stops:0,deletes:0,deleteOptions:[],reads:0,writes:[],stats:0,failCleanup:false}
  const user={async mkDir(path){assert.equal(path,'/home/rustml/work')},async writeFiles(files){state.writes=files},async runCommand(command){
    state.commands.push(command)
    const index=state.commands.length-1
    const logs=()=>Object.assign((async function*(){for(const data of options.logs??[])yield {stream:'stdout',data}})(),{close(){}})
    return {logs,async wait({signal}){
      if(options.abort){await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('secret SDK context')),{once:true}))}
      return {exitCode:options.exit?.[index]??0}
    }}
  }}
  const readFile=async()=>{state.reads++;return Readable.from(options.resultChunks??[Buffer.from(raw)])}
  const sandbox={name:'mock-sandbox',persistent:false,image:runtime.image,
    currentSession(){return {vcpus:options.vcpus??1,memory:2048,networkPolicy:{mode:'deny-all'},sessionId:'mock-session',sourceSnapshotId:options.snapshotId,runCommand:user.runCommand,mkDir:user.mkDir,writeFiles:user.writeFiles,readFile,readFileToBuffer:()=>{throw Error('must not read whole file')}}},
    async createUser(name){assert.equal(name,'rustml');if(options.userError)throw Error('private provider token');return user},
    asUser(name){assert.equal(name,'root');return {async runCommand(command,args){assert.ok(['/usr/bin/pkill','/usr/bin/pgrep','/usr/bin/chmod'].includes(command));return {exitCode:command==='/usr/bin/pgrep'?1:0}}}},
    fs:{async lstat(path){state.stats++;if(options.missing){const error=Error('missing');error.code='ENOENT';throw error}return {isDirectory:()=>!options.directorySymlink,isFile:()=>!options.notRegular,isSymbolicLink:()=>path.endsWith('/work')?!!options.directorySymlink:!!options.symlink,nlink:options.hardlink?2:1,size:options.size??Buffer.byteLength(raw)}}},
    readFile,
    async stop(){state.stops++;if(state.failCleanup)throw Error('stop failed')},async delete(params){state.deletes++;state.deleteOptions.push(params);if(state.failCleanup)throw Error('delete failed')},
  }
  const provider=createVercelProvider({createSandbox:async params=>{state.creates.push(params);if(options.createDelay)await new Promise(resolve=>setTimeout(resolve,10));if(options.createError)throw Error('secret provision error');return sandbox},getSandbox:async()=>{if(options.recoverCreate)return sandbox;throw Error('not found')}})
  const run=(changes={})=>provider.executeCase({execution,runtime,scope,deadline:Date.now()+45000,...changes})
  return {state,provider,run,sandbox}
}

test('provider creates a pinned ephemeral 1CPU/2GB deny-all VM and only fixed unprivileged argv/files',async()=>{
  const f=fixture()
  assert.deepEqual(await f.run(),{raw})
  const created=f.state.creates[0]
  assert.equal(created.image,runtime.image);assert.equal(created.persistent,false);assert.equal(created.networkPolicy,'deny-all')
  assert.deepEqual(created.resources,{vcpus:1});assert.deepEqual(created.ports,[]);assert.deepEqual(created.env,{})
  assert.ok(created.timeout<=45000 && created.timeout<60000)
  assert.equal('source' in created,false);assert.equal('mounts' in created,false)
  assert.ok(f.state.writes.every(file=>file.path.startsWith('/home/rustml/work/') && file.mode===0o600))
  assert.equal(f.state.commands.length,2)
  for(const cmd of f.state.commands){assert.equal(cmd.cmd,'/usr/bin/setpriv');assert.equal(cmd.args[0],'--no-new-privs');assert.ok(cmd.args.includes('--nproc=32:32'));assert.ok(cmd.args.includes('--nofile=64:64'));assert.ok(cmd.args.includes('-i'));assert.equal(cmd.cwd,'/home/rustml/work');assert.equal(cmd.detached,true);assert.equal('sudo' in cmd,false)}
  assert.equal(f.state.stops,1);assert.equal(f.state.deletes,1)
})
test('unsafe image tags, client file paths/commands and exhausted deadlines fail before creating a VM',async()=>{
  for(const change of [{runtime:{...runtime,image:'vercel/sandbox/universal:latest'}},{runtime:{...runtime,caseTimeoutMs:60000}},{execution:{...execution,result_file:'../secret'}},{execution:{...execution,run:['bash','-c','bad']}},{execution:{...execution,files:{'../secret':'bad'}}},{deadline:Date.now()}]){
    const f=fixture();assert.deepEqual(await f.run(change),{error:'infrastructure'});assert.equal(f.state.creates.length,0)
  }
})
test('compile/run nonzero results use safe learner categories and always clean the VM',async()=>{
  for(const [exit,error] of [[[1,0],'compile_error'],[[0,1],'runtime_error']]){const f=fixture({exit});assert.deepEqual(await f.run(),{error});assert.equal(f.state.stops,1);assert.equal(f.state.deletes,1)}
})
test('incremental combined stdout/stderr overflow stops without reading a result',async()=>{
  const f=fixture({logs:['a'.repeat(8192),'b'.repeat(8193)]})
  assert.deepEqual(await f.run(),{error:'output_limit'});assert.equal(f.state.reads,0);assert.equal(f.state.stops,1)
})
test('result must be regular, not a symlink, and bounded before streaming starts',async()=>{
  for(const [options,error] of [[{symlink:true},'runtime_error'],[{directorySymlink:true},'runtime_error'],[{hardlink:true},'runtime_error'],[{missing:true},'runtime_error'],[{notRegular:true},'runtime_error'],[{size:65537},'output_limit']]){const f=fixture(options);assert.deepEqual(await f.run(),{error});assert.equal(f.state.reads,0);assert.equal(f.state.deletes,1)}
})
test('result streaming independently enforces 64KiB without whole-file SDK reads',async()=>{
  const f=fixture({size:1,resultChunks:[Buffer.alloc(32768),Buffer.alloc(32769)]})
  assert.deepEqual(await f.run(),{error:'output_limit'});assert.equal(f.state.reads,1);assert.equal(f.state.stops,1)
})
test('invalid UTF-8 is a malformed learner result rather than silent replacement text',async()=>{
  const f=fixture({resultChunks:[Buffer.from([0xff])]})
  assert.deepEqual(await f.run(),{error:'runtime_error'});assert.equal(f.state.deletes,1)
})
test('external lease abort does not classify a learner failure and still cleans the VM',async()=>{
  const f=fixture({abort:true}),control=new AbortController()
  const pending=f.run({signal:control.signal});setTimeout(()=>control.abort(),10)
  assert.deepEqual(await pending,{error:'infrastructure'});assert.equal(f.state.stops,1);assert.equal(f.state.deletes,1)
})
test('provisioning/setup/metadata failures redact SDK context and retain honest infrastructure status',async()=>{
  for(const options of [{createError:true},{userError:true},{vcpus:2}]){const f=fixture(options);assert.deepEqual(await f.run(),{error:'infrastructure'});if(!options.createError){assert.equal(f.state.stops,1);assert.equal(f.state.deletes,1)}}
})
test('failed cleanup prevents success; stopAttempt retries only its own scope',async()=>{
  const f=fixture();f.state.failCleanup=true
  assert.deepEqual(await f.run(),{error:'infrastructure'})
  await f.provider.stopAttempt({...scope,leaseGeneration:2});assert.equal(f.state.stops,1)
  f.state.failCleanup=false;await f.provider.stopAttempt(scope)
  assert.equal(f.state.stops,2);assert.equal(f.state.deletes,2)
  await f.provider.stopAttempt(scope);assert.equal(f.state.stops,2)
})

test('fixed Session operations never invoke an auto-resuming Sandbox wrapper',async()=>{
  let original=0,direct=0
  const session=Object.fromEntries(['runCommand','mkDir','writeFiles','readFile','readFileToBuffer'].map(method=>[method,async()=>{direct++;throw Error('stopped original session')}]))
  const sandbox={currentSession:()=>session,...Object.fromEntries(Object.keys(session).map(method=>[method,async()=>{original++}]))}
  pinSession(sandbox)
  for(const method of Object.keys(session))await assert.rejects(sandbox[method](),/stopped original session/)
  assert.equal(original,0);assert.equal(direct,5)
})
test('actual installed SDK create performs one POST on network loss or 503, without automatic retries',async()=>{
  for(const failure of ['network','503']){
    let requests=0
    const fetch=nonRetryingMutations(async()=>{requests++;if(failure==='network')throw Error('response lost after acceptance');return new Response('{}',{status:503})})
    await assert.rejects(Sandbox.create({name:'mock-owned-create',image:runtime.image,persistent:false,networkPolicy:'deny-all',resources:{vcpus:1},token:'test-api-token',teamId:'test-team',projectId:'test-project',fetch}))
    assert.equal(requests,1)
  }
})
test('unknown creation response is recovered only by owned name with resume disabled, then cleaned',async()=>{
  const f=fixture({createError:true,recoverCreate:true})
  assert.deepEqual(await f.run(),{error:'infrastructure'});assert.equal(f.state.creates.length,1);assert.equal(f.state.stops,1);assert.equal(f.state.deletes,1)
})
test('a late creation response after lease loss is cleaned before any learner execution',async()=>{
  const f=fixture({createDelay:true}),control=new AbortController()
  const pending=f.run({signal:control.signal});control.abort()
  assert.deepEqual(await pending,{error:'infrastructure'});assert.equal(f.state.commands.length,0);assert.equal(f.state.stops,1);assert.equal(f.state.deletes,1)
})

test('stalled result transport after successful execution remains infrastructure, not learner time-limit',async()=>{
  const f=fixture()
  const session=f.sandbox.currentSession()
  session.readFile=async (_file,{signal})=>Readable.from((async function*(){await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('transport stalled')),{once:true}));yield Buffer.from(raw)})())
  f.sandbox.currentSession=()=>session
  assert.deepEqual(await f.run({deadline:Date.now()+8100,runtime:{...runtime,caseTimeoutMs:100}}),{error:'infrastructure'})
  assert.equal(f.state.stops,1);assert.equal(f.state.deletes,1)
})
test('trusted prepared snapshot is mutually exclusive with image and verified against original Session',async()=>{
  const snapshotId='snp_trusted_rust_001'
  const f=fixture({snapshotId});f.sandbox.image=undefined
  assert.deepEqual(await f.run({runtime:{...runtime,snapshotId}}),{raw})
  assert.deepEqual(f.state.creates[0].source,{type:'snapshot',snapshotId})
  assert.equal('image' in f.state.creates[0],false)
  assert.equal(f.state.creates[0].persistent,false);assert.equal(f.state.stops,1);assert.equal(f.state.deletes,1)
  const mismatch=fixture({snapshotId:'snp_wrong'})
  assert.deepEqual(await mismatch.run({runtime:{...runtime,snapshotId}}),{error:'infrastructure'})
  assert.equal(mismatch.state.commands.length,0);assert.equal(mismatch.state.deletes,1)
})

test('normal, recovered unknown-create and retried cleanup always preserve pinned source snapshots',async()=>{
  const snapshotId='snp_reusable_toolchain_001'
  for(const options of [{},{createError:true,recoverCreate:true},{retryCleanup:true}]){
    const f=fixture({snapshotId,...options})
    if(options.retryCleanup)f.state.failCleanup=true
    const result=await f.run({runtime:{...runtime,snapshotId}})
    assert.deepEqual(result,options.createError || options.retryCleanup?{error:'infrastructure'}:{raw})
    if(options.retryCleanup){f.state.failCleanup=false;await f.provider.stopAttempt(scope)}
    assert.ok(f.state.deleteOptions.length>0)
    assert.ok(f.state.deleteOptions.every(params=>params.deleteOrphanSnapshots===false))
    assert.equal(f.state.creates[0].persistent,false)
    assert.deepEqual(f.state.creates[0].source,{type:'snapshot',snapshotId})
  }
})
