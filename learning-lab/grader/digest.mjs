import { createHash } from 'node:crypto'

// This digest covers the executable grading manifest, never the help-only v1 bundle.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
}
export const sha256 = value => createHash('sha256').update(value).digest('hex')
