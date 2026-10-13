import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PracticeCloudProvider, usePracticeAccount } from '../../src/practice/PracticeCloudProvider'
import { PracticeWorkspace } from '../../src/practice/PracticeWorkspace'
import '../../src/styles.css'

function FixtureControls() {
  const account = usePracticeAccount()
  const [status, setStatus] = useState('')
  const control = (action: string) => fetch(`http://127.0.0.1:5232/fixture/${action}`, { method: 'POST' })
  async function race() {
    const cloud = account?.cloud
    if (!cloud || !account.user) return
    await control('arm'); window.dispatchEvent(new Event('focus'))
    for (let i = 0; i < 50; i++) {
      if ((await (await fetch('http://127.0.0.1:5232/fixture/stats')).json()).held) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    localStorage.setItem(cloud.storageKey, JSON.stringify({ ...cloud.session, expires_at: 1 }))
    await cloud.progress(); await control('release'); setStatus('Поздний 401 отправлен после обновления токена.')
  }
  return <section className="panel"><p>Локальный стенд. Все аккаунты, токены и серверные числа — тестовые.</p>
    <button disabled={!account?.user} onClick={() => void race()}>Проверить поздний 401</button>
    <button disabled={!account?.user} onClick={() => void control('revoke').then(() => window.dispatchEvent(new Event('focus')))}>Отозвать тестовую сессию</button>
    <button disabled={!account?.cloud} onClick={() => { localStorage.setItem(account!.cloud!.storageKey, '{broken'); window.dispatchEvent(new Event('focus')) }}>Повредить тестовую сессию</button>
    <p role="status">{status}</p>
  </section>
}
createRoot(document.getElementById('root')!).render(<PracticeCloudProvider><main><FixtureControls /><PracticeWorkspace /></main></PracticeCloudProvider>)
