import { Sandbox } from '@vercel/sandbox'
import { randomUUID } from 'node:crypto'

const USER = 'rustml'
const WORKSPACE = '/home/rustml/work'
const RESULT = `${WORKSPACE}/result.json`
const RESULT_LIMIT = 65536, LOG_LIMIT = 16384, CLEANUP_MS = 4000
const environment = { PATH:'/usr/local/bin:/usr/bin:/bin', HOME:'/home/rustml', TMPDIR:WORKSPACE, LANG:'C.UTF-8' }
const commands = {
  javascript: { files:['solution.mjs','input.json','run.mjs'], compile:['node','--check','solution.mjs'], run:['node','run.mjs'] },
  python: { files:['solution.py','input.json','run.py'], run:['python3','-I','run.py'] },
  rust: { files:['run.rs'], compile:['rustc','--edition=2021','run.rs','-o','solution'], run:['./solution'] },
}
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const ownership = scope => JSON.stringify([scope?.attemptId,scope?.jobId,scope?.leaseGeneration])
class CaseError extends Error { constructor(category) { super(category); this.category=category } }

/** SDK3.7 retries mutations by default. AbortError/400 prevent a second create/run request. */
export function nonRetryingMutations(fetchImpl=globalThis.fetch) {
  return async (url,options={})=>{
    if(!['POST','PATCH','PUT','DELETE'].includes(String(options.method??'GET').toUpperCase()))return fetchImpl(url,options)
    try {
      const response=await fetchImpl(url,options)
      if(response.status===429 || response.status>=500){await response.body?.cancel();return new Response('{"error":{"code":"provider_mutation_failed"}}',{status:400,headers:{'content-type':'application/json'}})}
      return response
    } catch { throw new DOMException('provider_mutation_unknown','AbortError') }
  }
}
/** Pin all command/file operations to the original Session; Sandbox wrappers auto-resume on stopped errors. */
export function pinSession(sandbox) {
  const session=sandbox.currentSession()
  for(const method of ['runCommand','mkDir','writeFiles','readFile','readFileToBuffer']) {
    if(typeof session[method]!=='function')throw new CaseError('infrastructure')
    sandbox[method]=session[method].bind(session)
  }
}

function validate(execution, runtime, deadline, scope) {
  const format = commands[runtime?.language]
  if (!format || typeof runtime.image !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*@sha256:[a-f0-9]{64}$/.test(runtime.image)
    || runtime.snapshotId!==undefined && (typeof runtime.snapshotId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(runtime.snapshotId))
    || !Number.isSafeInteger(runtime.caseTimeoutMs) || runtime.caseTimeoutMs <= 0 || runtime.caseTimeoutMs >= 60000
    || !Number.isFinite(deadline) || !scope?.attemptId || !scope.jobId || !Number.isSafeInteger(scope.leaseGeneration)
    || execution?.result_file !== 'result.json' || !equal(execution.run,format.run) || !equal(execution.compile,format.compile)
    || !execution.files || !equal(Object.keys(execution.files).sort(),[...format.files].sort())
    || Object.values(execution.files).some(value => typeof value !== 'string' || Buffer.byteLength(value)>131072)
    || Object.values(execution.files).reduce((n,value)=>n+Buffer.byteLength(value),0)>262144) throw new CaseError('infrastructure')
}

/** Ephemeral microVM adapter. Mocks verify orchestration, never provider isolation. */
export function createVercelProvider({ createSandbox = options => Sandbox.create(options), getSandbox = options => Sandbox.get(options), fetch:fetchImpl=globalThis.fetch, now = Date.now } = {}) {
  const active = new Map()
  const removals = new WeakMap()
  async function remove(sandbox) {
    if(removals.has(sandbox))return removals.get(sandbox)
    const pending=(async()=>{
      let stopped=false, deleted=false
      try { await sandbox.stop({signal:AbortSignal.timeout(CLEANUP_MS)}); stopped=true } catch {}
      try { await sandbox.delete({deleteOrphanSnapshots:true,signal:AbortSignal.timeout(CLEANUP_MS)}); deleted=true } catch {}
      if(!stopped || !deleted)removals.delete(sandbox)
      return stopped && deleted
    })()
    removals.set(sandbox,pending)
    return pending
  }
  async function stopAttempt(scope) {
    const owned = active.get(ownership(scope))
    if (!owned) return
    const results = await Promise.all([...owned].map(async sandbox => {
      const clean = await remove(sandbox)
      if (clean) owned.delete(sandbox)
      return clean
    }))
    if (!owned.size) active.delete(ownership(scope))
    if (results.some(clean=>!clean)) throw new CaseError('infrastructure')
  }
  async function executeCase({execution,runtime,scope,deadline,signal,onCreated}) {
    let sandbox, control, name, result={error:'infrastructure'}
    try {
      validate(execution,runtime,deadline,scope)
      const remaining = Math.min(45000,runtime.caseTimeoutMs,deadline-now()-CLEANUP_MS*2)
      if (remaining<=0 || signal?.aborted) throw new CaseError('infrastructure')
      control = AbortSignal.any([AbortSignal.timeout(Math.floor(remaining)),...(signal?[signal]:[])])
      name=`rustml-case-${randomUUID()}`
      sandbox = await createSandbox({name,...(runtime.snapshotId?{source:{type:'snapshot',snapshotId:runtime.snapshotId}}:{image:runtime.image}),resources:{vcpus:1},timeout:Math.floor(remaining),networkPolicy:'deny-all',persistent:false,ports:[],env:{},tags:{rustml_attempt:scope.attemptId,rustml_job:scope.jobId,rustml_generation:String(scope.leaseGeneration)},signal:control,fetch:nonRetryingMutations(fetchImpl)})
      const owned = active.get(ownership(scope)) ?? new Set(); owned.add(sandbox); active.set(ownership(scope),owned)
      const policy=sandbox.currentSession().networkPolicy
      const pinned=runtime.snapshotId?sandbox.currentSession().sourceSnapshotId===runtime.snapshotId:sandbox.image?.endsWith(runtime.image.slice(runtime.image.indexOf('@')))
      if (sandbox.persistent !== false || !pinned
        || sandbox.currentSession().vcpus !== 1 || sandbox.currentSession().memory !== 2048
        || !(policy==='deny-all' || policy?.mode==='deny-all')) throw new CaseError('infrastructure')
      await onCreated?.({name:sandbox.name,sessionId:sandbox.currentSession().sessionId,scope})
      control.throwIfAborted()
      pinSession(sandbox)
      const user = await sandbox.createUser(USER,{signal:control})
      await user.mkDir(WORKSPACE,{signal:control})
      await user.writeFiles(Object.entries(execution.files).map(([path,content])=>({path:`${WORKSPACE}/${path}`,content,mode:0o600})),{signal:control})
      const root = sandbox.asUser('root')
      let logsSize=0
      async function command(argv, category) {
        const cpuSeconds=runtime.language==='rust'?15:5
        // V8 reserves a large virtual address cage; physical RAM is capped by the 2GB microVM.
        const addressSpace=runtime.language==='javascript'?8589934592:1073741824
        const child = await user.runCommand({
          cmd:'/usr/bin/setpriv',args:['--no-new-privs','/usr/bin/prlimit',`--cpu=${cpuSeconds}:${cpuSeconds}`, `--as=${addressSpace}:${addressSpace}`,'--nproc=32:32','--nofile=64:64','--fsize=16777216:16777216','--core=0:0','--','/usr/bin/env','-i',...Object.entries(environment).map(([key,value])=>`${key}=${value}`),...argv],
          cwd:WORKSPACE,env:{},detached:true,timeoutMs:Math.max(1,Math.floor(Math.min(remaining,deadline-now()-CLEANUP_MS*2))),signal:control,
        })
        // Consume incremental logs; never call stdout()/stderr()/output() which collect all output.
        const logs = child.logs({signal:control})
        const readLogs = (async()=>{for await(const log of logs){logsSize+=Buffer.byteLength(log.data);if(logsSize>LOG_LIMIT)throw new CaseError('output_limit')}})()
        try {
          const [finished] = await Promise.all([child.wait({signal:control}),readLogs])
          if(finished.exitCode!==0)throw new CaseError(category)
        } finally { logs.close?.() }
      }
      if(execution.compile)await command(execution.compile,'compile_error')
      await command(execution.run,'runtime_error')
      // Kill all descendants before inspecting paths. no-new-privs prevents a UID escape via setuid/sudo.
      const killed = await root.runCommand('/usr/bin/pkill',['-KILL','-u',USER],{signal:control,timeoutMs:1000})
      if(![0,1].includes(killed.exitCode))throw new CaseError('infrastructure')
      const survivors = await root.runCommand('/usr/bin/pgrep',['-u',USER],{signal:control,timeoutMs:1000})
      if(survivors.exitCode!==1)throw new CaseError('infrastructure')
      // The user cannot replace /home/rustml itself because /home is root-owned.
      const homePermission=await root.runCommand('/usr/bin/chmod',['0755','/home/rustml'],{signal:control,timeoutMs:1000})
      if(homePermission.exitCode!==0)throw new CaseError('infrastructure')
      let directory,stat
      try {
        directory=await sandbox.fs.lstat(WORKSPACE,{signal:control})
        if(!directory.isDirectory() || directory.isSymbolicLink())throw new CaseError('runtime_error')
        const directoryPermission=await root.runCommand('/usr/bin/chmod',['0755',WORKSPACE],{signal:control,timeoutMs:1000})
        if(directoryPermission.exitCode!==0)throw new CaseError('runtime_error')
        stat=await sandbox.fs.lstat(RESULT,{signal:control})
      } catch(error){if(error.code==='ENOENT')throw new CaseError('runtime_error');throw error}
      if(!stat.isFile() || stat.isSymbolicLink() || stat.nlink!==1)throw new CaseError('runtime_error')
      if(stat.size>RESULT_LIMIT)throw new CaseError('output_limit')
      // SDK HTTP reader runs as the agent; restore read permission after terminating every learner process.
      const permission = await root.runCommand('/usr/bin/chmod',['0644',RESULT],{signal:control,timeoutMs:1000})
      if(permission.exitCode!==0)throw new CaseError('runtime_error')
      const stream = await sandbox.readFile({path:RESULT},{signal:control})
      if(!stream)throw new CaseError('runtime_error')
      const chunks=[]; let bytes=0
      try { for await(const chunk of stream){const data=Buffer.from(chunk);bytes+=data.length;if(bytes>RESULT_LIMIT)throw new CaseError('output_limit');chunks.push(data)} }
      finally { stream.destroy?.() }
      try {result={raw:new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes))}}
      catch {throw new CaseError('runtime_error')}
    } catch(error) {
      // Shared SDK/deadline abort does not prove learner CPU/OOM; never turn transport uncertainty into a failed grade.
      result={error:error instanceof CaseError?error.category:'infrastructure'}
    } finally {
      // Unknown POST outcome: lookup only the preallocated name owned by this case, never create/resume again.
      if(!sandbox && name){try {sandbox=await getSandbox({name,resume:false,signal:AbortSignal.timeout(CLEANUP_MS),fetch:nonRetryingMutations(fetchImpl)})}catch{}}
      if(sandbox){
        const clean=await remove(sandbox)
        if(clean){const owned=active.get(ownership(scope));owned?.delete(sandbox);if(owned && !owned.size)active.delete(ownership(scope))}
        else result={error:'infrastructure'}
      }
    }
    return result
  }
  return {executeCase,stopAttempt}
}
