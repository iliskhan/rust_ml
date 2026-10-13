import { useEffect, useRef, useState } from 'react'
import type { PracticeCloud } from './cloud'
import { practiceRelease, practiceTopics } from './all-catalog'
import { browserPracticeStore } from './local-progress'
import { syncLearningProgress } from './progress-sync'

type SyncState = { owner?: string; busy: boolean; message: string; error: boolean }

/** Local writes remain usable offline; every retry sends immutable receipt IDs. */
export function useLearningSync(cloud: PracticeCloud | null, owner?: string) {
  const [state, setState] = useState<SyncState>({ busy: false, message: '', error: false })
  const trigger = useRef<() => void>(() => {})
  useEffect(() => {
    if (!cloud || !owner) { trigger.current = () => {}; return }
    const client = cloud, accountId = owner
    const uploaded = new Set<string>()
    let active = true, running = false, dirty = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let releaseId: string | undefined
    const store = browserPracticeStore()
    const storage = { getItem: (key: string) => window.localStorage.getItem(key), setItem: (key: string, value: string) => window.localStorage.setItem(key, value) }
    const assertOwner = () => {
      if (!active || client.session?.user.id !== accountId) throw new Error('Аккаунт изменился. Синхронизация будет продолжена после входа.')
    }
    const publish = (next: Omit<SyncState, 'owner'>) => { if (active) setState({ owner, ...next }) }
    async function run() {
      if (!active) return
      if (running) { dirty = true; return }
      clearTimeout(timer)
      if (!navigator.onLine) { publish({ busy: false, error: false, message: 'Нет сети. Прогресс сохранён на устройстве и отправится при подключении.' }); return }
      running = true; dirty = false
      publish({ busy: true, error: false, message: 'Синхронизируем историю, помощь и основной язык…' })
      try {
        assertOwner()
        releaseId ??= (await client.progressCatalog(practiceRelease)).releaseId
        assertOwner()
        await syncLearningProgress({ cloud: client, store, storage, topics: practiceTopics, releaseKey: practiceRelease, releaseId, ownerId: accountId, assertOwner, uploaded })
        assertOwner()
        publish({ busy: false, error: false, message: 'Прогресс синхронизирован между устройствами. Код сохраняйте кнопкой «Сохранить в аккаунте».' })
      } catch (error) {
        publish({ busy: false, error: true, message: `Прогресс пока сохранён на устройстве. ${error instanceof Error ? error.message : 'Повторите синхронизацию.'}` })
      } finally {
        running = false
        if (active && dirty) timer = setTimeout(() => void run(), 750)
      }
    }
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail?.origin === 'cloud') return
      dirty = true; clearTimeout(timer)
      timer = setTimeout(() => void run(), 750)
    }
    const foreground = () => { if (document.visibilityState === 'visible') void run() }
    const storageChanged = (event: StorageEvent) => { if (event.key === null || event.key.startsWith('rustml-practice:')) changed(event) }
    trigger.current = () => void run()
    void run()
    const poll = setInterval(foreground, 30_000)
    window.addEventListener('rustml-practice-change', changed)
    window.addEventListener('storage', storageChanged)
    window.addEventListener('online', foreground)
    window.addEventListener('focus', foreground)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      active = false; clearTimeout(timer); clearInterval(poll); trigger.current = () => {}
      window.removeEventListener('rustml-practice-change', changed); window.removeEventListener('storage', storageChanged)
      window.removeEventListener('online', foreground); window.removeEventListener('focus', foreground)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [cloud, owner])
  return { learningSync: state.owner === owner && owner ? state : { busy: false, message: '', error: false }, syncLearningNow: () => trigger.current() }
}
