import { getDeadline } from '@vercel/functions'
import { createRecoveryHandler, recoverQueue } from '../grader/recovery.mjs'
import { workerRuntime } from '../grader/server-runtime.mjs'

const handle = createRecoveryHandler({ secret: process.env.CRON_SECRET,
  recover: ({ signal }) => {
    const { db, runAttempt: rawSupervisor } = workerRuntime()
    return recoverQueue({ db, runExactAttempt: rawSupervisor, signal,
      deadline: Math.min(Date.now() + 240000, (getDeadline()?.getTime() ?? Date.now() + 300000) - 20000) })
  } })
export default { fetch: request => handle(request) }
