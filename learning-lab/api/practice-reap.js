import { createReaperHandler } from '../grader/reaper.mjs'

const handle = createReaperHandler({ secret: process.env.CRON_SECRET })
export default { fetch: request => handle(request) }
