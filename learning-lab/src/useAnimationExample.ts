import { useRef, useState } from 'react'
import { saveAnimationSettings } from './animationInteraction'

export type AnimationExampleControls = { onApply: () => void; onRestore: () => void; canRestore: boolean }

export function useAnimationExample<T>(current: T, update: (value: T) => void, example: NoInfer<T>): AnimationExampleControls {
  const saved = useRef<T | null>(null)
  const [canRestore, setCanRestore] = useState(false)
  return {
    canRestore,
    onApply() {
      saved.current = saveAnimationSettings(saved.current, current)
      setCanRestore(true)
      update(structuredClone(example))
    },
    onRestore() {
      if (saved.current === null) return
      update(structuredClone(saved.current))
      saved.current = null
      setCanRestore(false)
    },
  }
}
