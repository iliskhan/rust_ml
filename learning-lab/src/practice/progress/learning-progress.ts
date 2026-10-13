import type { PracticeLanguage, PracticeTopic } from '../catalog.ts'
import type { LocalPracticeStore, PracticeScope } from '../local-progress.ts'

export const progressLanguages: PracticeLanguage[] = ['python', 'javascript', 'rust']
export const progressLanguageLabels: Record<PracticeLanguage, string> = { python: 'Python', javascript: 'JavaScript', rust: 'Rust' }
export type ExerciseLearningProgress = {
  scope: PracticeScope; topicId: string; title: string; hasDraft: boolean; helpKinds: string[]
  quizAttempts: number; latestQuizCorrect: boolean | null; lastActivityAt: string | null; error: string | null
}
export type LearningCounts = {
  exercisesTotal: number; drafts: number; helped: number; quizExercises: number
  latestCorrect: number; quizAttempts: number; unreadable: number
}
export type TopicLearningProgress = { id: string; lessonId: string; title: string; exercises: ExerciseLearningProgress[]; counts: LearningCounts }
export type LanguageLearningProgress = { language: PracticeLanguage; topics: TopicLearningProgress[]; counts: LearningCounts; topicsStarted: number; continueWith: ExerciseLearningProgress | null }
export type LearningProgress = { releaseId: string; ownerId?: string; primaryLanguage: PracticeLanguage; primaryError: string | null; languages: LanguageLearningProgress[] }

const message = (error: unknown) => error instanceof Error ? error.message : 'Не удалось прочитать локальную запись.'
const latest = (dates: string[]) => dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
export function countLearningExercises(exercises: ExerciseLearningProgress[]): LearningCounts {
  return {
    exercisesTotal: exercises.length,
    drafts: exercises.filter(e => e.hasDraft).length,
    helped: exercises.filter(e => e.helpKinds.length > 0).length,
    quizExercises: exercises.filter(e => e.quizAttempts > 0).length,
    latestCorrect: exercises.filter(e => e.latestQuizCorrect === true).length,
    quizAttempts: exercises.reduce((sum, e) => sum + e.quizAttempts, 0),
    unreadable: exercises.filter(e => e.error !== null).length,
  }
}

/** Counts only this catalog/release/owner; reading never writes or migrates records. */
export function readLearningProgress(store: LocalPracticeStore, topics: readonly PracticeTopic[], releaseId: string, ownerId?: string): LearningProgress {
  let primaryLanguage: PracticeLanguage = 'python', primaryError: string | null = null
  try { primaryLanguage = store.getPrimaryLanguage(releaseId, ownerId) } catch (error) { primaryError = message(error) }
  const languages = progressLanguages.map(language => {
    const topicProgress = topics.map(topic => {
      const exercises = topic.exercises.map(exercise => {
        const scope = { releaseId, exerciseId: exercise.id, language, ownerId }
        const base: ExerciseLearningProgress = { scope, topicId: topic.id, title: exercise.title, hasDraft: false, helpKinds: [], quizAttempts: 0, latestQuizCorrect: null, lastActivityAt: null, error: null }
        try {
          const record = store.read(scope)
          return { ...base, hasDraft: record.draft !== null, helpKinds: record.help.map(h => h.kind), quizAttempts: record.history.length,
            latestQuizCorrect: record.history.at(-1)?.correct ?? null,
            lastActivityAt: latest([...(record.draft ? [record.draft.updatedAt] : []), ...record.help.map(h => h.openedAt), ...record.history.map(h => h.at)]) }
        } catch (error) { return { ...base, error: message(error) } }
      })
      return { id: topic.id, lessonId: topic.lessonId, title: topic.title, exercises, counts: countLearningExercises(exercises) }
    })
    const exercises = topicProgress.flatMap(t => t.exercises)
    return { language, topics: topicProgress, counts: countLearningExercises(exercises),
      topicsStarted: topicProgress.filter(t => t.exercises.some(e => e.lastActivityAt !== null)).length,
      continueWith: exercises.filter(e => e.lastActivityAt !== null).sort((a, b) => Date.parse(b.lastActivityAt!) - Date.parse(a.lastActivityAt!))[0] ?? null }
  })
  return { releaseId, ownerId, primaryLanguage, primaryError, languages }
}

/** Public metadata must come from the selected release's authorized/public catalog, never guessed UUIDs. */
export type AccountProgressCatalog = { releaseKey: string; releaseId: string; topicIds: Readonly<Record<string, string>> }
export type AccountTopicProgress = { topicId: string; language: PracticeLanguage; isPrimary: boolean; total: number; completed: number; passed: number }
export function readAccountProgress(rows: readonly unknown[], catalog: AccountProgressCatalog, ownerId: string): AccountTopicProgress[] {
  const topics = new Map(Object.entries(catalog.topicIds).map(([key, id]) => [id, key]))
  const seen = new Set<string>()
  const result: AccountTopicProgress[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw new Error('Некорректный ответ прогресса аккаунта.')
    const value = row as Record<string, unknown>
    if (value.user_id !== ownerId || value.release_id !== catalog.releaseId || typeof value.topic_id !== 'string' || !topics.has(value.topic_id)) continue
    const { language, required_total: total, required_completed: completed, required_passed: passed } = value
    if (!progressLanguages.includes(language as PracticeLanguage) || typeof value.is_primary_language !== 'boolean' ||
      ![total, completed, passed].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0) ||
      (completed as number) > (passed as number) || (passed as number) > (total as number)) throw new Error('Некорректные числа прогресса аккаунта.')
    const topicId = topics.get(value.topic_id)!
    const key = `${topicId}/${language}`
    if (seen.has(key)) throw new Error('Сервер вернул повторную запись прогресса темы.')
    seen.add(key)
    result.push({ topicId, language: language as PracticeLanguage, isPrimary: value.is_primary_language, total: total as number, completed: completed as number, passed: passed as number })
  }
  return result
}
