import type { PracticeLanguage, PracticeTopic } from './catalog.ts'
import type { LocalPracticeRecord, LocalPracticeStore, PracticeScope, StorageLike } from './local-progress.ts'

export type LearningEvent = {
  event_id: string; exercise_key: string | null; language: PracticeLanguage
  kind: 'quiz' | 'help' | 'activity' | 'language'; occurred_at: string
  payload: { answer: number; correct: boolean; draftRevision: number } | { kind: string } | Record<string, never>
}
export type CloudLearningEvent = LearningEvent & { user_id: string; release_id: string; sequence: number }
export type SyncedLearningRecord = LocalPracticeRecord & { activityAt?: string }
type SyncedQuiz = LocalPracticeRecord['history'][number] & { syncId?: string }
const languages: PracticeLanguage[] = ['python', 'javascript', 'rust']
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const instant = (value: string) => new Date(value).toISOString()
export const languagePreferenceKey = (release: string, owner: string) => `rustml-practice:learning-language:v1:${JSON.stringify([release, owner])}`

function validEvent(v: unknown): v is LearningEvent {
  if (!object(v) || typeof v.event_id !== 'string' || !uuid.test(v.event_id) || !languages.includes(v.language as PracticeLanguage)
    || !date(v.occurred_at) || !object(v.payload)) return false
  const payload = v.payload
  if (v.kind === 'language') return v.exercise_key === null && Object.keys(payload).length === 0
  if (typeof v.exercise_key !== 'string' || !v.exercise_key) return false
  if (v.kind === 'quiz') return Object.keys(payload).length === 3 && integer(payload.answer) && typeof payload.correct === 'boolean' && integer(payload.draftRevision)
  if (v.kind === 'help') return Object.keys(payload).length === 1 && typeof payload.kind === 'string' && payload.kind.length > 0 && payload.kind.length <= 100
  return v.kind === 'activity' && Object.keys(payload).length === 0
}

/** A malformed or cross-account reply must never be applied to the local account. */
export function validateLearningEvents(raw: unknown, owner: string, release: string): CloudLearningEvent[] {
  if (!Array.isArray(raw)) throw new Error('Некорректный ответ синхронизации прогресса.')
  const ids = new Set<string>(), sequences = new Set<number>()
  for (const row of raw) {
    if (!validEvent(row) || (row as CloudLearningEvent).user_id !== owner || (row as CloudLearningEvent).release_id !== release
      || !integer((row as CloudLearningEvent).sequence) || (row as CloudLearningEvent).sequence === 0
      || ids.has(row.event_id) || sequences.has((row as CloudLearningEvent).sequence)) throw new Error('Некорректный ответ синхронизации прогресса.')
    ids.add(row.event_id); sequences.add((row as CloudLearningEvent).sequence)
  }
  return raw
}

async function stableId(parts: unknown[]): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(parts)))
  const hex = [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

/** Enumerates only an explicit owner's authored catalog; guest records are never uploaded implicitly. */
export async function collectLearningEvents(store: LocalPracticeStore, topics: readonly PracticeTopic[], release: string, owner: string, storage?: StorageLike): Promise<LearningEvent[]> {
  if (!owner) throw new Error('Для синхронизации нужен аккаунт.')
  const events: LearningEvent[] = []
  for (const topic of topics) for (const exercise of topic.exercises) for (const language of languages) {
    const scope = { releaseId: release, exerciseId: exercise.id, language, ownerId: owner }
    const record = store.read(scope) as SyncedLearningRecord
    const base = { exercise_key: exercise.id, language }
    const duplicates = new Map<string, number>()
    for (const quiz of record.history as SyncedQuiz[]) {
      const payload = { answer: quiz.answer, correct: quiz.correct, draftRevision: quiz.draftRevision }
      const fingerprint = JSON.stringify([instant(quiz.at), payload]), index = duplicates.get(fingerprint) ?? 0
      duplicates.set(fingerprint, index + 1)
      events.push({ ...base, event_id: quiz.syncId ?? await stableId([owner, release, exercise.id, language, 'quiz', fingerprint, index]), kind: 'quiz', occurred_at: instant(quiz.at), payload })
    }
    for (const help of record.help) events.push({ ...base, event_id: await stableId([owner, release, exercise.id, language, 'help', help.kind, instant(help.openedAt)]), kind: 'help', occurred_at: instant(help.openedAt), payload: { kind: help.kind } })
    const activityAt = [record.activityAt, record.draft?.updatedAt].filter((v): v is string => !!v).sort((a, b) => Date.parse(b) - Date.parse(a))[0]
    if (activityAt) {
      // Minute precision bounds draft activity growth while quiz/help receipts retain exact timestamps.
      const minute = new Date(Math.floor(Date.parse(activityAt) / 60000) * 60000).toISOString()
      events.push({ ...base, event_id: await stableId([owner, release, exercise.id, language, 'activity', minute]), kind: 'activity', occurred_at: minute, payload: {} })
    }
  }
  const preference = storage && readLanguagePreference(storage, release, owner)
  if (preference) events.push(preference)
  return events
}

/** Union by immutable receipt identity. The editor draft stays local and uses its separate cloud CAS. */
export async function mergeLearningEvents(record: LocalPracticeRecord, scope: PracticeScope, events: readonly LearningEvent[]): Promise<SyncedLearningRecord> {
  if (!scope.ownerId) throw new Error('Для синхронизации нужен аккаунт.')
  const matching = events.filter(e => e.exercise_key === scope.exerciseId && e.language === scope.language)
  if (!matching.every(validEvent)) throw new Error('Некорректные события прогресса.')
  const history = new Map<string, SyncedQuiz>()
  const duplicates = new Map<string, number>()
  for (const quiz of record.history as SyncedQuiz[]) {
    const payload = { answer: quiz.answer, correct: quiz.correct, draftRevision: quiz.draftRevision }
    const fingerprint = JSON.stringify([instant(quiz.at), payload]), index = duplicates.get(fingerprint) ?? 0
    duplicates.set(fingerprint, index + 1)
    const id = quiz.syncId ?? await stableId([scope.ownerId, scope.releaseId, scope.exerciseId, scope.language, 'quiz', fingerprint, index])
    history.set(id, { ...quiz, at: instant(quiz.at), syncId: id })
  }
  const help = new Map(record.help.map(h => [h.kind, h]))
  const activity = [(record as SyncedLearningRecord).activityAt].filter((v): v is string => !!v)
  for (const event of matching) {
    if (event.kind === 'quiz') {
      const payload = event.payload as { answer: number; correct: boolean; draftRevision: number }
      const quiz = { ...payload, at: instant(event.occurred_at), syncId: event.event_id }
      const prior = history.get(event.event_id)
      if (prior && (Date.parse(prior.at) !== Date.parse(quiz.at) || prior.answer !== quiz.answer || prior.correct !== quiz.correct || prior.draftRevision !== quiz.draftRevision)) throw new Error('Конфликт события прогресса.')
      history.set(event.event_id, quiz)
    } else if (event.kind === 'help') {
      const kind = (event.payload as { kind: string }).kind, prior = help.get(kind)
      if (!prior || Date.parse(event.occurred_at) < Date.parse(prior.openedAt)) help.set(kind, { kind, openedAt: instant(event.occurred_at) })
    } else if (event.kind === 'activity') activity.push(instant(event.occurred_at))
  }
  const activityAt = activity.sort((a, b) => Date.parse(b) - Date.parse(a))[0]
  return { ...record, help: [...help.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
    history: [...history.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.syncId!.localeCompare(b.syncId!)).slice(-100),
    ...(activityAt ? { activityAt } : {}) }
}

// Cloud rows carry owner/cursor metadata which the upload contract does not accept.
function learningEventFields({ event_id, exercise_key, language, kind, occurred_at, payload }: LearningEvent): LearningEvent {
  return { event_id, exercise_key, language, kind, occurred_at, payload }
}

export function readLanguagePreference(storage: StorageLike, release: string, owner: string): LearningEvent | null {
  const raw = storage.getItem(languagePreferenceKey(release, owner))
  if (raw === null) return null
  const event: unknown = JSON.parse(raw)
  if (!validEvent(event) || event.kind !== 'language') throw new Error('Настройка синхронизации языка повреждена.')
  return learningEventFields(event)
}
export function rememberLanguagePreference(storage: StorageLike, release: string, owner: string, event: LearningEvent): void {
  if (!owner || !validEvent(event) || event.kind !== 'language') throw new Error('Некорректная настройка языка.')
  storage.setItem(languagePreferenceKey(release, owner), JSON.stringify(learningEventFields(event)))
}
export function recordLanguagePreference(storage: StorageLike, release: string, owner: string, language: PracticeLanguage, at = new Date().toISOString()): LearningEvent {
  const event: LearningEvent = { event_id: crypto.randomUUID(), exercise_key: null, language, kind: 'language', occurred_at: at, payload: {} }
  rememberLanguagePreference(storage, release, owner, event)
  return event
}
/** Preference conflicts use occurrence time then UUID, so retries and device order give the same result. */
export function newestLanguagePreference(events: readonly LearningEvent[]): LearningEvent | null {
  const preferences = events.filter(e => e.kind === 'language')
  if (!preferences.every(validEvent)) throw new Error('Некорректная настройка языка.')
  return preferences.sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at) || b.event_id.localeCompare(a.event_id))[0] ?? null
}

/** Pull remains available after an upload failure; cursors advance only after durable local merges. */
export async function syncLearningProgress(options: {
  cloud: { syncLearning: (release: string, events: readonly LearningEvent[], after: number) => Promise<unknown> }
  store: LocalPracticeStore; storage: StorageLike; topics: readonly PracticeTopic[]
  releaseKey: string; releaseId: string; ownerId: string; assertOwner?: () => void; uploaded?: Set<string>
}): Promise<{ received: number; uploadError?: string }> {
  const { cloud, store, storage, topics, releaseKey, releaseId, ownerId, assertOwner = () => {} } = options
  if (!ownerId) throw new Error('Для синхронизации нужен аккаунт.')
  const cursorKey = `rustml-practice:learning-cursor:v1:${JSON.stringify([releaseId, ownerId])}`
  assertOwner()
  const rawCursor = storage.getItem(cursorKey)
  let cursor = rawCursor === null ? 0 : Number(rawCursor)
  if (!integer(cursor) || rawCursor !== null && (!rawCursor || !/^\d+$/.test(rawCursor))) throw new Error('Состояние синхронизации прогресса повреждено.')
  const events = (await collectLearningEvents(store, topics, releaseKey, ownerId, storage)).filter(e => !options.uploaded?.has(e.event_id))
  const exerciseIds = new Set(topics.flatMap(t => t.exercises.map(e => e.id)))
  let received = 0
  const mergePage = async (raw: unknown) => {
    assertOwner()
    const page = validateLearningEvents(raw, ownerId, releaseId)
    let previous = cursor
    const groups = new Map<string, CloudLearningEvent[]>()
    for (const event of page) {
      if (event.sequence <= previous) throw new Error('Нарушен порядок синхронизации прогресса.')
      previous = event.sequence
      if (event.exercise_key !== null && exerciseIds.has(event.exercise_key)) {
        const key = JSON.stringify([event.exercise_key, event.language])
        const group = groups.get(key) ?? []; group.push(event); groups.set(key, group)
      }
    }
    for (const group of groups.values()) {
      assertOwner()
      await store.mergeLearning({ releaseId: releaseKey, exerciseId: group[0].exercise_key!, language: group[0].language, ownerId }, group)
    }
    assertOwner()
    await store.mergePrimaryLanguage(releaseKey, ownerId, page)
    assertOwner()
    if (page.length) { storage.setItem(cursorKey, String(previous)); cursor = previous }
    for (const event of page) options.uploaded?.add(event.event_id)
    received += page.length
    return page.length
  }
  // Every invocation retries all retained receipts, including a request whose response was lost.
  let uploadError: string | undefined
  for (let offset = 0; offset < events.length; offset += 500) {
    assertOwner()
    const batch = events.slice(offset, offset + 500)
    let raw: unknown
    try { raw = await cloud.syncLearning(releaseId, batch, cursor) }
    catch (error) {
      assertOwner()
      uploadError = error instanceof Error ? error.message : 'Не удалось отправить новые события.'
      break
    }
    await mergePage(raw)
    for (const event of batch) options.uploaded?.add(event.event_id)
  }
  let count: number
  do {
    assertOwner()
    count = await mergePage(await cloud.syncLearning(releaseId, [], cursor))
  } while (count === 500)
  return { received, ...(uploadError ? { uploadError } : {}) }
}
