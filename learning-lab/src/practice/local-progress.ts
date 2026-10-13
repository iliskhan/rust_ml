import type { PracticeLanguage } from './catalog'
import { mergeLearningEvents, newestLanguagePreference, readLanguagePreference, recordLanguagePreference, rememberLanguagePreference, type LearningEvent } from './progress-sync.ts'

export type PracticeScope = { releaseId: string; exerciseId: string; language: PracticeLanguage; ownerId?: string }
export type PracticeDraft = { code: string; revision: number; updatedAt: string }
export type HelpReceipt = { kind: string; openedAt: string }
export type QuizReceipt = { answer: number; correct: boolean; at: string; draftRevision: number; syncId?: string }
export type LocalPracticeRecord = { version: 1; draft: PracticeDraft | null; help: HelpReceipt[]; history: QuizReceipt[]; activityAt?: string }
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
export type PracticeLock = <T>(name: string, action: () => T | Promise<T>) => Promise<T>
const languages: PracticeLanguage[] = ['python', 'javascript', 'rust']
const emptyRecord = (): LocalPracticeRecord => ({ version: 1, draft: null, help: [], history: [] })
// Storage events reach other tabs; this event refreshes summaries in the writing tab.
function notifyPracticeChange(origin?: 'cloud') { if (typeof window !== 'undefined') window.dispatchEvent(origin ? new CustomEvent('rustml-practice-change', { detail: { origin } }) : new Event('rustml-practice-change')) }
// Existing three-part records remain guest data; an account never reads or sends them implicitly.
export const practiceStorageKey = (scope: PracticeScope) => `rustml-practice:v1:${JSON.stringify(scope.ownerId ? [scope.releaseId, scope.exerciseId, scope.language, scope.ownerId] : [scope.releaseId, scope.exerciseId, scope.language])}`
export const primaryLanguageKey = (releaseId: string, ownerId?: string) => `rustml-practice:language:${ownerId ? JSON.stringify([releaseId, ownerId]) : releaseId}`

export class PracticeStorageError extends Error {
  kind: 'corrupt' | 'unavailable' | 'conflict' | 'too-large'
  current?: PracticeDraft
  constructor(kind: PracticeStorageError['kind'], message: string, current?: PracticeDraft) { super(message); this.kind = kind; this.current = current }
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const isRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const validCode = (value: unknown): value is string => typeof value === 'string' && new TextEncoder().encode(value).length <= 65536

function parseRecord(raw: string): LocalPracticeRecord {
  try {
    const value: unknown = JSON.parse(raw)
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.help) || !Array.isArray(value.history)) throw new Error()
    const draft = value.draft
    if (draft !== null && (!isObject(draft) || !validCode(draft.code) || !isRevision(draft.revision) || !validDate(draft.updatedAt))) throw new Error()
    if (!value.help.every(h => isObject(h) && typeof h.kind === 'string' && h.kind.length <= 100 && validDate(h.openedAt))) throw new Error()
    if (!value.history.every(h => isObject(h) && typeof h.answer === 'number' && Number.isSafeInteger(h.answer) && h.answer >= 0 && typeof h.correct === 'boolean' && validDate(h.at) && isRevision(h.draftRevision) && (h.syncId === undefined || typeof h.syncId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(h.syncId)))) throw new Error()
    if (value.activityAt !== undefined && !validDate(value.activityAt)) throw new Error()
    return value as unknown as LocalPracticeRecord
  } catch { throw new PracticeStorageError('corrupt', 'Локальная запись повреждена. Она сохранена без изменений; скачайте свой код и проверьте хранилище браузера.') }
}

async function browserLock<T>(name: string, action: () => T | Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.reject(new PracticeStorageError('unavailable', 'Браузер не поддерживает безопасное сохранение между вкладками. Скачайте код в файл.'))
  return await navigator.locks.request(name, action)
}

/** Local records are formative only. Web Locks serialize CAS across tabs of this origin. */
export class LocalPracticeStore {
  private storage: StorageLike
  private lock: PracticeLock
  private now: () => string
  constructor(storage: StorageLike, lock: PracticeLock = browserLock, now: () => string = () => new Date().toISOString()) { this.storage = storage; this.lock = lock; this.now = now }

  read(scope: PracticeScope): LocalPracticeRecord {
    try {
      const raw = this.storage.getItem(practiceStorageKey(scope))
      return raw === null ? emptyRecord() : parseRecord(raw)
    } catch (error) {
      if (error instanceof PracticeStorageError) throw error
      throw new PracticeStorageError('unavailable', 'Хранилище браузера недоступно. Код остаётся в редакторе; скачайте файл перед уходом.')
    }
  }

  private write(scope: PracticeScope, update: (record: LocalPracticeRecord) => LocalPracticeRecord | Promise<LocalPracticeRecord>, origin?: 'cloud'): Promise<LocalPracticeRecord> {
    return this.lock(practiceStorageKey(scope), async () => {
      const candidate = update(this.read(scope))
      const next = candidate instanceof Promise ? await candidate : candidate
      try { this.storage.setItem(practiceStorageKey(scope), JSON.stringify(next)) }
      catch { throw new PracticeStorageError('unavailable', 'Черновик не сохранён: хранилище недоступно или заполнено. Скачайте файл перед уходом.') }
      notifyPracticeChange(origin)
      return next
    })
  }

  async saveDraft(scope: PracticeScope, code: string, expectedRevision: number): Promise<PracticeDraft> {
    if (!validCode(code)) throw new PracticeStorageError('too-large', 'Размер кода превышает 64 КиБ. Скачайте файл; сократите фрагмент для сохранения.')
    if (!isRevision(expectedRevision) || expectedRevision === Number.MAX_SAFE_INTEGER) throw new PracticeStorageError('conflict', 'Некорректная версия черновика.')
    const next = await this.write(scope, record => {
      if ((record.draft?.revision ?? 0) !== expectedRevision) throw new PracticeStorageError('conflict', 'В другой вкладке сохранена новая версия. Ваш код остаётся в редакторе; сравните обе версии.', record.draft ?? undefined)
      if (record.draft?.code === code) return record
      return { ...record, draft: { code, revision: expectedRevision + 1, updatedAt: this.now() } }
    })
    return next.draft!
  }

  recordHelp(scope: PracticeScope, kind: string): Promise<LocalPracticeRecord> {
    if (!kind || kind.length > 100) return Promise.reject(new Error('Некорректный ключ помощи'))
    return this.write(scope, record => record.help.some(h => h.kind === kind) ? record : { ...record, help: [...record.help, { kind, openedAt: this.now() }] })
  }

  recordQuiz(scope: PracticeScope, answer: number, correct: boolean): Promise<LocalPracticeRecord> {
    if (!Number.isSafeInteger(answer) || answer < 0 || typeof correct !== 'boolean') return Promise.reject(new Error('Некорректный ответ'))
    return this.write(scope, record => ({ ...record, history: [...record.history, { answer, correct, at: this.now(), draftRevision: record.draft?.revision ?? 0, syncId: crypto.randomUUID() }].slice(-100) }))
  }

  mergeLearning(scope: PracticeScope, events: readonly LearningEvent[]): Promise<LocalPracticeRecord> {
    return this.write(scope, record => mergeLearningEvents(record, scope, events), 'cloud')
  }

  touchActivity(scope: PracticeScope): Promise<LocalPracticeRecord> {
    return this.write(scope, record => ({ ...record, activityAt: this.now() }))
  }

  async mergePrimaryLanguage(releaseId: string, ownerId: string, events: readonly LearningEvent[]): Promise<PracticeLanguage | null> {
    if (!ownerId) throw new Error('Для синхронизации нужен аккаунт.')
    return this.lock(primaryLanguageKey(releaseId, ownerId), () => {
      const local = readLanguagePreference(this.storage, releaseId, ownerId)
      const newest = newestLanguagePreference([...events, ...(local ? [local] : [])])
      if (!newest) return null
      rememberLanguagePreference(this.storage, releaseId, ownerId, newest)
      notifyPracticeChange('cloud')
      return newest.language
    })
  }

  getPrimaryLanguage(releaseId: string, ownerId?: string): PracticeLanguage {
    try {
      // Account preferences have one atomic source; the old key remains a read-only fallback.
      const preference = ownerId && readLanguagePreference(this.storage, releaseId, ownerId)
      if (preference) return preference.language
      const raw = this.storage.getItem(primaryLanguageKey(releaseId, ownerId))
      if (raw === null) return 'python'
      if (languages.includes(raw as PracticeLanguage)) return raw as PracticeLanguage
      throw new PracticeStorageError('corrupt', 'Настройка языка повреждена. Временно показан Python; сохранённая настройка не изменена.')
    } catch (error) {
      if (error instanceof PracticeStorageError) throw error
      throw new PracticeStorageError('unavailable', 'Не удалось прочитать основной язык.')
    }
  }

  async setPrimaryLanguage(releaseId: string, language: PracticeLanguage, ownerId?: string): Promise<void> {
    if (!languages.includes(language)) throw new Error('Неизвестный язык')
    await this.lock(primaryLanguageKey(releaseId, ownerId), () => {
      try {
        if (ownerId) recordLanguagePreference(this.storage, releaseId, ownerId, language, this.now())
        else this.storage.setItem(primaryLanguageKey(releaseId), language)
      }
      catch { throw new PracticeStorageError('unavailable', 'Основной язык не сохранён: хранилище недоступно или заполнено.') }
      notifyPracticeChange()
    })
  }
}

export function browserPracticeStore(): LocalPracticeStore {
  // Access may itself throw in privacy mode; defer it until a store operation.
  return new LocalPracticeStore({ getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) })
}
