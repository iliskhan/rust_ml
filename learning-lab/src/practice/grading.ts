import { PracticeCloudError, type CloudAttempt, type PracticeCloud } from './cloud.ts'
import type { PracticeScope } from './local-progress.ts'

export type GradingSnapshot = { sessionId: string; variantId: string; releaseId: string; revision: number }
export type GradeCode = (scope: PracticeScope, source: string, signal: AbortSignal, update: (message: string) => void) => Promise<CloudAttempt>
type Pending = GradingSnapshot & { owner: string; key: string; sourceHash: string; attemptId?: string; finished?: boolean; terminalStatus?: 'graded' | 'error' }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const invalid = () => new PracticeCloudError('Ответ проверки не соответствует сохранённой отправке. Код в редакторе не изменён.', 'invalid_attempt')
export function validateGradeAttempt(attempt: CloudAttempt, pending: Pending): CloudAttempt {
  if (!attempt || !uuid(attempt.id) || (pending.attemptId && attempt.id !== pending.attemptId) || attempt.user_id !== pending.owner ||
    attempt.session_id !== pending.sessionId || attempt.variant_id !== pending.variantId || attempt.release_id !== pending.releaseId ||
    attempt.draft_revision !== pending.revision || attempt.source_sha256 !== pending.sourceHash ||
    !['queued', 'running', 'graded', 'error'].includes(attempt.status) || !['none', 'hint', 'solution'].includes(attempt.assistance) ||
    !Number.isSafeInteger(attempt.expected_tests) || attempt.expected_tests < 1 ||
    (attempt.status === 'graded' && (!['pass', 'fail'].includes(attempt.verdict ?? '') || !Number.isSafeInteger(attempt.passed_tests) ||
      attempt.passed_tests! < 0 || attempt.passed_tests! > attempt.expected_tests ||
      (attempt.verdict === 'pass' && (attempt.passed_tests !== attempt.expected_tests || attempt.error_kind !== null))))) throw invalid()
  return attempt
}
export function gradeMessage(attempt: CloudAttempt) {
  if (attempt.status === 'queued') return 'Отправлено. Ожидаем серверную проверку.'
  if (attempt.status === 'running') return 'Сервер проверяет открытые примеры.'
  if (attempt.status === 'error') return 'Проверка временно недоступна. Код сохранён; отправьте его ещё раз.'
  return `Облачная версия ${attempt.draft_revision}. Открытые примеры: ${attempt.passed_tests}/${attempt.expected_tests}. ${attempt.verdict === 'pass' ? 'Проверка пройдена.' : 'Есть несовпадения или ошибка исполнения.'} ${attempt.assistance === 'none' ? 'Без открытой помощи.' : 'С открытой помощью; самостоятельное подтверждение не выдано.'}`
}
function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(new Error('Проверка продолжается на сервере.')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve() }, milliseconds)
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
  })
}

// Durable IDs/revision/hash are scoped to account/project/exercise/language.
// A lost POST response retries its key and frozen revision, never saves a new draft.
export function createGrading({ cloud, storage, locks = globalThis.navigator?.locks, pollMs = 2000, deadlineMs = 240000 }: {
  cloud: PracticeCloud; storage: Storage; locks?: Pick<LockManager, 'request'>; pollMs?: number; deadlineMs?: number
}) {
  const storageKey = (scope: PracticeScope) => `${cloud.storageKey}:grading:${JSON.stringify([scope.ownerId, scope.releaseId, scope.exerciseId, scope.language])}`
  const read = (scope: PracticeScope): Pending | null => {
    const raw = storage.getItem(storageKey(scope))
    if (!raw) return null
    let value: Pending
    try { value = JSON.parse(raw) } catch { throw invalid() }
    if (!value || value.owner !== scope.ownerId || !uuid(value.key) || !uuid(value.sessionId) || !uuid(value.variantId) || !uuid(value.releaseId) ||
      !Number.isSafeInteger(value.revision) || value.revision < 0 || !/^[0-9a-f]{64}$/.test(value.sourceHash) ||
      (value.attemptId !== undefined && !uuid(value.attemptId))) throw invalid()
    return value
  }
  return {
    hasPending(scope: PracticeScope) { const value = read(scope); return Boolean(value && !value.finished) },
    async run(scope: PracticeScope, source: string, prepare: (signal: AbortSignal) => Promise<GradingSnapshot>, signal: AbortSignal,
      update: (message: string) => void): Promise<CloudAttempt> {
      const owner = scope.ownerId
      // One budget covers hashing, waiting for another tab, preparing CAS and polling.
      const deadline = Date.now() + deadlineMs
      const runSignal = AbortSignal.any([signal, AbortSignal.timeout(deadlineMs)])
      const ask = <T,>(promise: Promise<T>) => new Promise<T>((resolve, reject) => {
        const aborted = () => reject(new PracticeCloudError('Проверка продолжается. Повторите получение результата.', 'grading_pending'))
        runSignal.addEventListener('abort', aborted, { once: true })
        promise.then(resolve, reject).finally(() => runSignal.removeEventListener('abort', aborted))
        if (runSignal.aborted) aborted()
      })
      const assertCurrent = () => {
        if (runSignal.aborted) throw new Error('Проверка продолжается на сервере.')
        if (!owner || cloud.session?.user.id !== owner) throw new PracticeCloudError('Аккаунт изменился. Откройте его отправку заново.', 'account_changed')
      }
      assertCurrent()
      const hash = [...new Uint8Array(await ask(crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      assertCurrent()
      if (!locks) throw new PracticeCloudError('Браузер не поддерживает безопасное согласование отправок между вкладками. Скачайте код.', 'grading_lock_unavailable')
      const lock = <T,>(callback: () => T | PromiseLike<T>) => ask(locks.request(`${storageKey(scope)}:prepare`, { signal: runSignal }, async () => { assertCurrent(); return callback() }))
      const pending = await lock(async () => {
        assertCurrent()
        let current = read(scope)
        if (!current || (current.finished && (current.sourceHash !== hash || current.terminalStatus === 'error'))) {
          const saved = await ask(prepare(runSignal)); assertCurrent()
          current = { ...saved, owner: owner!, key: crypto.randomUUID(), sourceHash: hash }
          // Persistence must succeed BEFORE network submission.
          storage.setItem(storageKey(scope), JSON.stringify(current))
        }
        return current
      })
      const save = () => lock(async () => {
        assertCurrent()
        if (read(scope)?.key !== pending.key) throw new PracticeCloudError('В другой вкладке уже создана новая отправка. Откройте её результат заново.', 'grading_changed')
        storage.setItem(storageKey(scope), JSON.stringify(pending))
      })
      let resumedAt = 0
      while (Date.now() < deadline) {
        assertCurrent()
        let attempt = await ask(cloud.gradeAttempt(pending.attemptId ? { id: pending.attemptId } : { key: pending.key }, runSignal))
        assertCurrent()
        if (!attempt && !pending.attemptId) {
          let response: { attempt_id: string; status: string }
          try { response = await ask(cloud.gradeSubmit(pending.sessionId, pending.key, pending.revision, runSignal)) }
          catch (error) {
            if (error instanceof PracticeCloudError && ['draft_conflict', 'submission_limit', 'grading_budget_exhausted', 'grading_capacity', 'grading_unavailable', 'invalid_submission'].includes(error.code)) {
              await lock(async () => { if (read(scope)?.key === pending.key) storage.removeItem(storageKey(scope)) })
            }
            throw error
          }
          assertCurrent()
          if (!uuid(response.attempt_id)) throw invalid()
          pending.attemptId = response.attempt_id; await save()
          attempt = await ask(cloud.gradeAttempt({ id: pending.attemptId }, runSignal)); assertCurrent()
        }
        if (!attempt) throw invalid()
        validateGradeAttempt(attempt, pending)
        pending.attemptId = attempt.id; await save()
        update(gradeMessage(attempt))
        if (attempt.status === 'graded' || attempt.status === 'error') {
          pending.finished = true; pending.terminalStatus = attempt.status; await save()
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('rustml-practice-grade', { detail: { ownerId: owner } }))
          return attempt
        }
        if (Date.now() - resumedAt >= 30000) {
          const response = await ask(cloud.gradeResume(attempt.id, runSignal)); assertCurrent()
          if (response.attempt_id !== attempt.id) throw invalid()
          resumedAt = Date.now()
        }
        await pause(Math.min(pollMs, Math.max(1, deadline - Date.now())), runSignal)
      }
      throw new PracticeCloudError('Проверка продолжается. Нажмите повторно, чтобы получить результат той же отправки.', 'grading_pending')
    },
  }
}
