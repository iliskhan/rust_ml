import { useEffect, useState } from 'react'
import { practiceRelease } from './all-catalog'
import { usePracticeAccount } from './PracticeCloudProvider'
import type { PracticeSelection } from './PracticePanel'
import { PracticeProgress } from './progress/PracticeProgress'
import type { AccountProgressCatalog } from './progress/learning-progress'

export function PracticeLearningProgress({ onOpenExercise }: { onOpenExercise: (selection: PracticeSelection) => void }) {
  const account = usePracticeAccount()
  const ownerId = account?.user?.id
  const cloud = account?.cloud
  const [attempt, retry] = useState(0)
  const [metadata, setMetadata] = useState<{ ownerId: string; catalog?: AccountProgressCatalog; error?: string } | null>(null)
  useEffect(() => {
    if (!cloud || !ownerId) { setMetadata(null); return }
    let active = true
    setMetadata({ ownerId })
    void cloud.progressCatalog(practiceRelease).then(catalog => { if (active) setMetadata({ ownerId, catalog }) })
      .catch(error => { if (active) setMetadata({ ownerId, error: error instanceof Error ? error.message : 'Не удалось загрузить каталог тем.' }) })
    return () => { active = false }
  }, [cloud, ownerId, attempt])
  const current = metadata?.ownerId === ownerId ? metadata : null
  return <>
    {cloud && ownerId && !current?.catalog && <p role={current?.error ? 'alert' : 'status'}>
      {current?.error ?? 'Загружаем карту тем аккаунта…'} {current?.error && <button type="button" onClick={() => retry(n => n + 1)}>Повторить загрузку каталога</button>}
    </p>}
    <PracticeProgress ownerId={ownerId} cloud={ownerId ? cloud : null} accountCatalog={current?.catalog} onOpenExercise={onOpenExercise} />
  </>
}
