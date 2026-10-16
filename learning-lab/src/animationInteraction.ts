/** Seeking is exploration: only uninterrupted playback crosses a question. */
export function crossesAnimationQuestion(previous: number, current: number, checkpoint: number, playing: boolean, seeking: boolean) {
  return playing && !seeking && previous < checkpoint && current >= checkpoint
}

/** Reapplying a film must keep the original, independently editable lab snapshot. */
export function saveAnimationSettings<T>(saved: T | null, current: T): T {
  return saved === null ? structuredClone(current) : saved
}
