import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import type { PracticeAccountPanelProps } from '../src/practice/account/PracticeAccountPanel'

test('GitHub-only deployment renders its primary login, retains guest practice and default email UI', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false },
    define: {
      'import.meta.env.VITE_PRACTICE_AUTH_PROVIDER': JSON.stringify('github'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://practice.supabase.co'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_test'),
    },
  })
  try {
    const { PracticeCloudProvider, PracticeAccount } = await server.ssrLoadModule('/src/practice/PracticeCloudProvider.tsx')
    const { PracticeAccountPanel } = await server.ssrLoadModule('/src/practice/account/PracticeAccountPanel.tsx')
    const github = renderToStaticMarkup(createElement(PracticeCloudProvider, null, createElement(PracticeAccount)))
    assert.match(github, /class="primary"[^>]*>Войти через GitHub/)
    assert.match(github, /При первом входе аккаунт создаётся автоматически/)
    assert.match(github, /Без входа задания/)
    assert.doesNotMatch(github, /type="email"|type="password"|Создать аккаунт|Подтвердите email/)

    const props: PracticeAccountPanelProps = {
      cloudAvailable: true, user: null, busy: false, status: '', error: '', confirmationEmail: null,
      signIn: async () => {}, signOut: async () => {}, signInWithPassword: async () => {},
      signUpWithPassword: async () => {}, resendConfirmation: async () => {},
    }
    const email = renderToStaticMarkup(createElement(PracticeAccountPanel, props))
    assert.match(email, /type="email"/)
    assert.match(email, /type="password"/)
    assert.match(email, /Создать аккаунт/)
    assert.match(email, /Войти через GitHub/)

    const pending = renderToStaticMarkup(createElement(PracticeAccountPanel, { ...props, emailAuthAvailable: false, busy: true, confirmationEmail: 'a@example.com' }))
    assert.doesNotMatch(pending, /Подтвердите email|type="email"|Запросить письмо/)
    assert.match(pending, /class="primary"[^>]*disabled=""[^>]*>Войти через GitHub/)
    const signedIn = renderToStaticMarkup(createElement(PracticeAccountPanel, { ...props, emailAuthAvailable: false, user: { id: 'github-user' } }))
    assert.match(signedIn, /Вы вошли: аккаунт GitHub/)
    assert.match(signedIn, /Выйти из аккаунта/)
    assert.doesNotMatch(signedIn, /Войти через GitHub|type="email"/)
  } finally { await server.close() }
})
