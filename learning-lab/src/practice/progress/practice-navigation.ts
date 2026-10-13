import type { PracticeTopic } from '../all-catalog.ts'
import type { LearningProgress } from './learning-progress.ts'

/** Search public catalog text only; selecting a result never changes a draft. */
export function findPracticeTopics(topics: readonly PracticeTopic[], query: string, labels: Readonly<Record<string, string>>) {
  const words = query.trim().toLocaleLowerCase('ru-RU').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return topics.flatMap(topic => {
    const exercise = topic.exercises.find(exercise => {
      const text = `${labels[topic.lessonId] ?? topic.lessonId} ${topic.title} ${exercise.title}`.toLocaleLowerCase('ru-RU')
      return words.every(word => text.includes(word))
    })
    return exercise ? [{ topic, exercise }] : []
  })
}

/** Most recent recorded work across languages of this already scoped owner/release. */
export function latestPracticeWork(progress: LearningProgress) {
  return progress.languages.flatMap(row => row.continueWith ? [row.continueWith] : [])
    .sort((a, b) => Date.parse(b.lastActivityAt!) - Date.parse(a.lastActivityAt!))[0] ?? null
}
