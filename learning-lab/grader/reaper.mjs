import { Sandbox } from '@vercel/sandbox'
import { createHash, timingSafeEqual } from 'node:crypto'

const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const uuid=new RegExp(`^${UUID}$`,'i'), caseName=new RegExp(`^rustml-case-${UUID}$`,'i')
const ageMs=10*60*1000, pageSize=50
const timestamp=value=>value instanceof Date?value.getTime():typeof value==='number'?value:NaN
function owned(value,cutoff) {
  const tags=value?.tags, created=timestamp(value?.createdAt), updated=timestamp(value?.updatedAt)
  return caseName.test(value?.name??'') && value.persistent===false
    && Number.isFinite(created) && created>0 && created<cutoff && Number.isFinite(updated) && updated>0 && updated<cutoff
    && typeof tags?.rustml_attempt==='string' && uuid.test(tags.rustml_attempt)
    && typeof tags?.rustml_job==='string' && uuid.test(tags.rustml_job)
    && typeof tags?.rustml_generation==='string' && /^[1-9]\d*$/.test(tags.rustml_generation)
    && Number.isSafeInteger(Number(tags.rustml_generation))
}

/** Project OIDC SDK context scopes list/get. Only old, fully tagged ephemeral case resources qualify. */
export function createReaper({list=options=>Sandbox.list(options),get=options=>Sandbox.get(options),now=Date.now,
  maxPages=5,maxCount=20,maxRunMs=20000,operationMs=1500}={}) {
  if(![maxPages,maxCount,maxRunMs,operationMs].every(Number.isSafeInteger) || maxPages<1 || maxPages>10
    || maxCount<1 || maxCount>50 || maxRunMs<1 || maxRunMs>30000 || operationMs<1 || operationMs>5000)throw Error('invalid_reaper_limits')
  return async function reap({signal}={}) {
    const result={status:'complete',pages:0,scanned:0,eligible:0,attempted:0,stopped:0,deleted:0,skipped:0,failed:0,timedOut:false,truncated:false}
    const cutoff=now()-ageMs, controller=new AbortController(), seenNames=new Set(),seenCursors=new Set()
    const durationTimer=setTimeout(()=>{result.timedOut=true;controller.abort()},maxRunMs)
    const runSignal=AbortSignal.any([controller.signal,...(signal?[signal]:[])])
    async function bounded(action) {
      if(runSignal.aborted)throw Error('reaper_stopped')
      const local=new AbortController(), combined=AbortSignal.any([runSignal,local.signal])
      let timer,aborted
      try {
        return await Promise.race([Promise.resolve().then(()=>action(combined)),new Promise((_,reject)=>{
          aborted=()=>reject(Error('reaper_operation_aborted'))
          combined.addEventListener('abort',aborted,{once:true})
          timer=setTimeout(()=>{result.timedOut=true;local.abort()},operationMs)
        })])
      } finally {clearTimeout(timer);combined.removeEventListener('abort',aborted)}
    }
    let cursor
    try {
      while(result.pages<maxPages && result.attempted<maxCount && !runSignal.aborted) {
        let page
        try {page=await bounded(current=>list({namePrefix:'rustml-case-',sortBy:'name',sortOrder:'asc',limit:pageSize,...(cursor?{cursor}:{}),signal:current}))}
        catch {result.failed++;break}
        if(!Array.isArray(page?.sandboxes) || !page.pagination || !(page.pagination.next===null || typeof page.pagination.next==='string' && page.pagination.next.length>0)) {result.failed++;break}
        result.pages++
        for(const candidate of page.sandboxes.slice(0,pageSize)) {
          if(runSignal.aborted || result.attempted>=maxCount){result.truncated=true;break}
          result.scanned++
          if(!owned(candidate,cutoff) || seenNames.has(candidate.name)){result.skipped++;continue}
          seenNames.add(candidate.name);result.eligible++
          let sandbox
          try {sandbox=await bounded(current=>get({name:candidate.name,resume:false,signal:current}))}
          catch {result.failed++;continue}
          if(!owned(sandbox,cutoff) || sandbox.name!==candidate.name || ['rustml_attempt','rustml_job','rustml_generation'].some(key=>sandbox.tags[key]!==candidate.tags[key])) {result.skipped++;continue}
          // A recently started session of an old named sandbox is also protected; metadata access never resumes it.
          let session
          try {session=sandbox.currentSession()}catch {}
          if(session && !(Number.isFinite(timestamp(session.createdAt)) && timestamp(session.createdAt)<cutoff)){result.skipped++;continue}
          result.attempted++
          try {await bounded(current=>sandbox.stop({signal:current}));result.stopped++}catch {result.failed++}
          if(runSignal.aborted){result.truncated=true;break}
          try {await bounded(current=>sandbox.delete({signal:current,deleteOrphanSnapshots:false}));result.deleted++}catch {result.failed++}
        }
        if(page.sandboxes.length>pageSize){result.truncated=true;break}
        const next=page.pagination.next
        if(next===null)break
        if(seenCursors.has(next)){result.failed++;break}
        seenCursors.add(next);cursor=next
        if(result.pages>=maxPages || result.attempted>=maxCount)result.truncated=true
      }
    } catch {result.failed++}
    finally {clearTimeout(durationTimer)}
    if(runSignal.aborted || result.failed || result.truncated || result.timedOut)result.status='partial'
    return result
  }
}

/** Await the bounded sweep in the authenticated cron request; no detached/untracked work. */
export function createReaperHandler({secret,reap=createReaper()}={}) {
  const counts=['pages','scanned','eligible','attempted','stopped','deleted','skipped','failed']
  const reply=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...extra}})
  return async request=>{
    if(request.method!=='GET')return reply({code:'method_not_allowed'},405,{Allow:'GET'})
    if(typeof secret!=='string' || secret.length<32 || secret.length>1024)return reply({code:'reaper_unavailable'},503)
    const header=request.headers.get('authorization')??''
    const supplied=header.startsWith('Bearer ')?header.slice(7):''
    if(!supplied || supplied.length>1024 || !timingSafeEqual(createHash('sha256').update(supplied).digest(),createHash('sha256').update(secret).digest()))return reply({code:'forbidden'},403)
    try {
      const raw=await reap({signal:request.signal})
      if(!raw || !['complete','partial'].includes(raw.status) || typeof raw.timedOut!=='boolean' || typeof raw.truncated!=='boolean'
        || counts.some(key=>!Number.isSafeInteger(raw[key]) || raw[key]<0))return reply({code:'reaper_unavailable'},503)
      return reply({status:raw.status,...Object.fromEntries(counts.map(key=>[key,raw[key]])),timedOut:raw.timedOut,truncated:raw.truncated})
    }catch{return reply({code:'reaper_unavailable'},503)}
  }
}
