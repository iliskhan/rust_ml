import { createRoot } from 'react-dom/client'
import { useMemo, useState } from 'react'
import { PracticeProgress } from '../src/practice/progress/PracticeProgress'
import { browserPracticeStore } from '../src/practice/local-progress'
import { practiceTopics, practiceRelease } from '../src/practice/all-catalog'
import { createPracticeCloud } from '../src/practice/cloud'
import '../src/styles.css'
const store = browserPracticeStore()
const accountCatalog = {releaseKey: practiceRelease, releaseId: 'server-release', topicIds: {[practiceTopics[0].id]: 'server-topic'}}
function Preview() {
  const [ownerId, setOwner] = useState<string | undefined>()
  const [scenario, setScenario] = useState('none')
  const [pending, setPending] = useState<(() => void) | null>(null)
  const cloud = useMemo(() => {
    if (!ownerId || scenario === 'none') return null
    const values = new Map<string, string>()
    const storage: Storage = {get length(){return values.size},clear(){values.clear()},key(i){return [...values.keys()][i]??null},getItem(key){return values.get(key)??null},setItem(key,value){values.set(key,value)},removeItem(key){values.delete(key)}}
    const url = 'http://localhost:54321'
    storage.setItem(`rustml-auth:${url}`, JSON.stringify({access_token:'test-only',refresh_token:'test-only',expires_at:Date.now()/1000+3600,user:{id:ownerId}}))
    return createPracticeCloud({url,publishableKey:'sb_publishable_preview'}, {storage, fetch: async () => {
      if (scenario === 'pending') await new Promise<void>(resolve => setPending(() => resolve))
      if (scenario === 'error') return Response.json({message:'test-only'},{status:503})
      return Response.json(scenario === 'empty' ? [] : [{user_id:ownerId,release_id:'server-release',topic_id:'server-topic',language:'python',is_primary_language:false,required_total:2,required_passed:1,required_completed:0},{user_id:ownerId,release_id:'server-release',topic_id:'server-topic',language:'rust',is_primary_language:true,required_total:2,required_passed:0,required_completed:0}])
    }})
  },[ownerId,scenario])
  const scope = { releaseId: practiceRelease, exerciseId: practiceTopics[0].exercises[0].id, language: 'python' as const, ownerId }
  return <main style={{maxWidth: 1100, margin: 'auto', padding: 16}}>
    <label>Тестовый владелец<select value={ownerId ?? 'guest'} onChange={e => setOwner(e.target.value === 'guest' ? undefined : e.target.value)}><option value="guest">Гость</option><option value="a">Аккаунт A</option><option value="b">Аккаунт B</option></select></label>
    <label>Сценарий облака<select value={scenario} onChange={e => setScenario(e.target.value)}>{['none','ready','empty','error','pending'].map(value=><option key={value}>{value}</option>)}</select></label>
    {pending && <button onClick={() => {pending();setPending(null)}}>Завершить запрос</button>}
    <button onClick={async () => { const revision = store.read(scope).draft?.revision ?? 0; await store.saveDraft(scope, 'learning progress UI check', revision); await store.recordHelp(scope, 'hint-0'); await store.recordQuiz(scope, 0, true) }}>Сохранить тестовую работу</button>
    <PracticeProgress ownerId={ownerId} store={store} cloud={cloud} accountCatalog={accountCatalog} onOpenExercise={exercise => alert(exercise.scope.exerciseId)} />
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
