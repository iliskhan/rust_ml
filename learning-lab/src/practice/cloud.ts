export type CloudLanguage = 'python' | 'javascript' | 'rust'
export type CloudConfig = { url: string; publishableKey: string }
export type CloudAuthSession = { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string } }
export type CloudDraft = { session_id: string; source: string; revision: number; origin: string; updated_at: string }
export type CloudSession = { id: string; variant_id: string; release_id: string; draft: CloudDraft }
export type CloudVariant = { id: string; exercise_id: string; release_id: string; language: CloudLanguage; starter_code: string; practice_exercises: { exercise_key: string }; practice_releases: { release_key: string } }
export type CloudProgress = { user_id: string; release_id: string; topic_id: string; language: CloudLanguage; is_primary_language: boolean; required_total: number; required_completed: number; required_passed: number }
export class PracticeCloudError extends Error {
  readonly code: string
  readonly status: number
  constructor(message: string, code: string, status = 0) { super(message); this.name = 'PracticeCloudError'; this.code = code; this.status = status }
}

export function validateCloudConfig(config: CloudConfig): CloudConfig {
  const url = new URL(config.url)
  const local = ['localhost', '127.0.0.1'].includes(url.hostname)
  if ((!local && !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new PracticeCloudError('Нужен HTTPS-адрес проекта Supabase.', 'invalid_config')
  }
  const key = config.publishableKey.trim()
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
  if (key.split('.').length === 3) {
    try { publicKey = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' } catch { publicKey = false }
  }
  if (!publicKey) throw new PracticeCloudError('Используйте только publishable или anon key. Серверные ключи запрещены.', 'invalid_key')
  return { url: url.origin, publishableKey: key }
}

export function createPracticeCloud(config: CloudConfig, options: { fetch?: typeof fetch; storage?: Storage } = {}) {
  const { url, publishableKey } = validateCloudConfig(config)
  const requestFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const storage = options.storage ?? globalThis.localStorage
  const storageKey = `rustml-auth:${url}`
  let session: CloudAuthSession | null = null
  let refreshInFlight: Promise<void> | null = null
  let authGeneration = 0
  const readSession = (): CloudAuthSession | null => {
    try {
      const raw = storage.getItem(storageKey)
      if (!raw) return null
      const value = JSON.parse(raw)
      if (typeof value.access_token !== 'string' || !value.access_token || typeof value.refresh_token !== 'string' || !value.refresh_token || !Number.isFinite(value.expires_at) || typeof value.user?.id !== 'string' || !value.user.id) throw new Error()
      return value
    } catch { throw new PracticeCloudError('Не удалось прочитать сессию браузера. Начните вход заново; код остаётся в редакторе.', 'invalid_session') }
  }
  const changedAccount = () => new PracticeCloudError('Аккаунт изменился в другой вкладке. Откройте его черновик заново; код остаётся в редакторе.', 'account_changed', 401)
  const beginSignIn = () => ({ generation: ++authGeneration, stored: storage.getItem(storageKey), verifier: storage.getItem(`${storageKey}:pkce`) })
  const assertSignIn = (pending: ReturnType<typeof beginSignIn>) => {
    if (pending.generation !== authGeneration || pending.stored !== storage.getItem(storageKey) || pending.verifier !== storage.getItem(`${storageKey}:pkce`)) throw changedAccount()
  }
  const persist = (value: CloudAuthSession | null) => {
    if (value) {
      const encoded = JSON.stringify(value)
      if (storage.getItem(storageKey) !== encoded) storage.setItem(storageKey, encoded)
    } else storage.removeItem(storageKey)
    session = value
    return value
  }
  const acceptSession = (value: CloudAuthSession & { expires_in?: number }) => {
    if (typeof value?.access_token !== 'string' || !value.access_token || typeof value.refresh_token !== 'string' || !value.refresh_token || typeof value.user?.id !== 'string' || !value.user.id) throw new PracticeCloudError('Сервер не вернул сессию.', 'invalid_session')
    const expiresAt = value.expires_at ?? Math.floor(Date.now() / 1000) + (value.expires_in ?? 3600)
    if (!Number.isFinite(expiresAt)) throw new PracticeCloudError('Сервер не вернул срок сессии.', 'invalid_session')
    return persist({ access_token: value.access_token, refresh_token: value.refresh_token,
      expires_at: expiresAt, user: { id: value.user.id, ...(typeof value.user.email === 'string' ? { email: value.user.email } : {}) } })!
  }
  async function request<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
    let owner: string | undefined
    const generation = authGeneration
    if (authenticated) {
      const previousOwner = session?.user.id
      session = readSession()
      if (previousOwner && previousOwner !== session?.user.id) throw changedAccount()
      if (!session) throw new PracticeCloudError('Сначала войдите в аккаунт.', 'unauthenticated', 401)
      owner = session.user.id
      if (session.expires_at < Date.now() / 1000 + 30) {
        const refreshing = session
        refreshInFlight ??= request<CloudAuthSession>('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token })
        }).then(value => {
          const current = readSession()
          if (generation !== authGeneration || current?.user.id !== refreshing.user.id || current.refresh_token !== refreshing.refresh_token) throw changedAccount()
          if (value.user?.id !== refreshing.user.id) throw new PracticeCloudError('Сервер вернул другую сессию. Войдите снова.', 'invalid_session')
          acceptSession(value)
        }).catch(error => { if (error instanceof PracticeCloudError && error.code === 'unauthenticated' && generation === authGeneration && readSession()?.refresh_token === refreshing.refresh_token) persist(null); throw error }).finally(() => { refreshInFlight = null })
        await refreshInFlight
        if (generation !== authGeneration || readSession()?.user.id !== owner) throw changedAccount()
      }
    }
    const headers: Record<string, string> = { apikey: publishableKey, 'Content-Type': 'application/json' }
    if (authenticated && session) headers.Authorization = `Bearer ${session.access_token}`
    const requestToken = session?.access_token
    let response: Response
    try { response = await requestFetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } }) }
    catch { throw new PracticeCloudError(path.startsWith('/auth/') ? 'Сеть недоступна. Повторите подключение позже.' : 'Сеть недоступна. Код остаётся в редакторе; скачайте файл.', 'network_error') }
    if (authenticated && (generation !== authGeneration || readSession()?.user.id !== owner)) throw changedAccount()
    const body = await response.json().catch(() => null)
    if (authenticated && (generation !== authGeneration || readSession()?.user.id !== owner)) throw changedAccount()
    if (!response.ok) {
      // Only map known server codes. Raw SQL/Auth bodies can contain sensitive context.
      const hint = typeof body?.message === 'string' ? body.message : ''
      const authCode = path.startsWith('/auth/') ? body?.code ?? body?.error_code : undefined
      const authMessages: Record<string, string> = {
        invalid_credentials: 'Неверный email или пароль.',
        email_not_confirmed: 'Подтвердите email по ссылке в письме, затем войдите снова.',
        weak_password: 'Пароль не соответствует требованиям проекта. Выберите более длинный и надёжный пароль.',
        signup_disabled: 'Регистрация в этом проекте пока отключена.',
        email_provider_disabled: 'Вход по email в этом проекте пока отключён.',
        over_email_send_rate_limit: 'Лимит писем достигнут. Повторите позже.',
        over_request_rate_limit: 'Слишком много запросов. Повторите позже.',
        otp_expired: 'Ссылка или код подтверждения истекли. Запросите новое письмо.',
        flow_state_not_found: 'Ссылка входа недействительна. Начните вход заново.',
        flow_state_expired: 'Ссылка входа истекла. Начните вход заново.',
      }
      if (typeof authCode === 'string' && authMessages[authCode]) throw new PracticeCloudError(authMessages[authCode], authCode, response.status)
      const expired = response.status < 500 && response.status !== 429 && (response.status === 401 || ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found', 'session_expired', 'bad_jwt'].includes(authCode))
      if (expired && path === '/auth/v1/user' && generation === authGeneration && readSession()?.access_token === requestToken) persist(null)
      if (expired && path.startsWith('/auth/')) throw new PracticeCloudError('Сессия истекла. Войдите снова.', 'unauthenticated', response.status)
      const code = hint.includes('draft_conflict') ? 'draft_conflict' : hint.includes('grading_unavailable') ? 'grading_unavailable' : response.status === 401 ? 'unauthenticated' : 'cloud_error'
      const message = code === 'draft_conflict' ? 'Облачный черновик уже изменился. Загрузите его перед сохранением.' :
        code === 'grading_unavailable' ? 'Серверная проверка пока недоступна.' : code === 'unauthenticated' ? 'Сессия истекла. Войдите снова.' :
        response.status === 429 ? 'Слишком много запросов. Повторите позже.' : 'Облачный запрос не выполнен. Проверьте настройки Supabase и повторите.'
      throw new PracticeCloudError(message, code, code === 'draft_conflict' ? 409 : response.status)
    }
    return body as T
  }
  const redirectUrl = (redirectTo: string) => {
    const redirect = new URL(redirectTo)
    if (redirect.origin !== globalThis.location.origin || redirect.search || redirect.hash || redirect.username || redirect.password) throw new PracticeCloudError('Redirect должен вести на текущий сайт без параметров.', 'invalid_redirect')
    return redirect.href
  }
  async function preparePKCE(pending: ReturnType<typeof beginSignIn>, redirectTo: string) {
    const redirect = redirectUrl(redirectTo)
    const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    assertSignIn(pending)
    storage.setItem(`${storageKey}:pkce`, verifier)
    pending.verifier = verifier
    return { redirect, challenge }
  }
  const passwordCredentials = (email: string, password: string) => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !trimmedEmail.includes('@') || !password) throw new PracticeCloudError('Укажите email и пароль.', 'invalid_credentials')
    return { email: trimmedEmail, password }
  }
  async function confirmationRequest(email: string, password: string | undefined, redirectTo: string) {
    const credentials = password === undefined ? { email: email.trim(), type: 'signup' } : passwordCredentials(email, password)
    if (!credentials.email || !credentials.email.includes('@')) throw new PracticeCloudError('Укажите email.', 'invalid_credentials')
    const pending = beginSignIn()
    const { redirect, challenge } = await preparePKCE(pending, redirectTo)
    try {
      const value = await request<CloudAuthSession | CloudAuthSession['user']>(`/auth/v1/${password === undefined ? 'resend' : 'signup'}?${new URLSearchParams({ redirect_to: redirect })}`, {
        method: 'POST', body: JSON.stringify({ ...credentials, code_challenge: challenge, code_challenge_method: 's256' })
      })
      assertSignIn(pending)
      if (password === undefined) return null
      if (value && 'access_token' in value) {
        const accepted = acceptSession(value)
        storage.removeItem(`${storageKey}:pkce`)
        return accepted
      }
      if (!value || typeof value.id !== 'string' || !value.id) throw new PracticeCloudError('Сервер не вернул результат регистрации.', 'invalid_session')
      return null
    } catch (error) {
      if (pending.generation === authGeneration && pending.verifier === storage.getItem(`${storageKey}:pkce`)) storage.removeItem(`${storageKey}:pkce`)
      throw error
    }
  }
  const rpc = <T>(name: string, body: object) => request<T>(`/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }, true)
  async function getSession(id: string): Promise<CloudSession> {
    const [rows, drafts] = await Promise.all([
      request<Omit<CloudSession, 'draft'>[]>(`/rest/v1/practice_sessions?id=eq.${encodeURIComponent(id)}&select=id,variant_id,release_id`, {}, true),
      request<CloudDraft[]>(`/rest/v1/practice_drafts?session_id=eq.${encodeURIComponent(id)}&select=session_id,source,revision,origin,updated_at`, {}, true)
    ])
    if (!rows[0] || !drafts[0]) throw new PracticeCloudError('Черновик не найден в вашем аккаунте.', 'not_found', 404)
    return { ...rows[0], draft: drafts[0] }
  }
  return {
    // UI snapshots stay readable; restoreSession and authenticated requests report storage errors.
    get session() { try { session = readSession() } catch { session = null } return session },
    storageKey,
    async restoreSession(): Promise<CloudAuthSession | null> {
      session = readSession()
      if (!session) return null
      const user = await request<CloudAuthSession['user']>('/auth/v1/user', {}, true)
      const current = readSession()
      if (!current || current.user.id !== user?.id) throw changedAccount()
      return persist({ ...current, user: { id: user.id, ...(typeof user.email === 'string' ? { email: user.email } : {}) } })
    },
    async signInWithPassword(email: string, password: string) {
      const credentials = passwordCredentials(email, password)
      const pending = beginSignIn()
      const value = await request<CloudAuthSession>('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify(credentials) })
      assertSignIn(pending)
      const accepted = acceptSession(value)
      storage.removeItem(`${storageKey}:pkce`)
      return accepted
    },
    signUpWithPassword(email: string, password: string, redirectTo: string) { return confirmationRequest(email, password, redirectTo) },
    async resendConfirmation(email: string, redirectTo: string) { await confirmationRequest(email, undefined, redirectTo) },
    sendEmailCode(email: string) { return request('/auth/v1/otp', { method: 'POST', body: JSON.stringify({ email, create_user: true }) }) },
    async verifyEmailCode(email: string, token: string) {
      const pending = beginSignIn()
      const value = await request<CloudAuthSession>('/auth/v1/verify', { method: 'POST', body: JSON.stringify({ email, token, type: 'email' }) })
      assertSignIn(pending)
      return acceptSession(value)
    },
    async signInWithGitHub(redirectTo: string) {
      const pending = beginSignIn()
      const { redirect, challenge } = await preparePKCE(pending, redirectTo)
      const query = new URLSearchParams({ provider: 'github', redirect_to: redirect, code_challenge: challenge, code_challenge_method: 's256' })
      globalThis.location.assign(`${url}/auth/v1/authorize?${query}`)
    },
    async completeOAuth(code: string) {
      const pending = beginSignIn()
      const verifier = storage.getItem(`${storageKey}:pkce`)
      if (!verifier) throw new PracticeCloudError('Откройте ссылку в браузере, где начали вход, или вернитесь в учебник и начните вход заново.', 'missing_verifier')
      const response = await request<CloudAuthSession>('/auth/v1/token?grant_type=pkce', { method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: verifier }) })
      assertSignIn(pending)
      if (storage.getItem(`${storageKey}:pkce`) !== verifier) throw changedAccount()
      const value = acceptSession(response)
      storage.removeItem(`${storageKey}:pkce`)
      return value
    },
    async signOut(expectedOwner?: string) {
      ++authGeneration
      const current = readSession()
      if ((expectedOwner ?? session?.user.id) !== current?.user.id) { session = current; throw changedAccount() }
      storage.removeItem(`${storageKey}:pkce`)
      persist(null)
      if (current) await request('/auth/v1/logout?scope=local', { method: 'POST', headers: { Authorization: `Bearer ${current.access_token}` } })
    },
    async catalog(filter?: { releaseKey: string; exerciseKey: string; language: CloudLanguage }) {
      const query = new URLSearchParams({
        select: `id,exercise_id,release_id,language,starter_code,practice_exercises${filter ? '!inner' : ''}(exercise_key),practice_releases${filter ? '!inner' : ''}(release_key)`,
        order: 'id.asc', limit: '500',
      })
      if (filter) {
        query.set('practice_releases.release_key', `eq.${filter.releaseKey}`)
        query.set('practice_exercises.exercise_key', `eq.${filter.exerciseKey}`)
        query.set('language', `eq.${filter.language}`)
      }
      const rows: CloudVariant[] = []
      for (let offset = 0; ; offset += 500) {
        query.set('offset', String(offset))
        const page = await request<CloudVariant[]>(`/rest/v1/practice_variants?${query}`)
        rows.push(...page)
        if (page.length < 500) return rows
      }
    },
    async progressCatalog(releaseKey: string) {
      const query = new URLSearchParams({ select: 'id,topic_key,release_id,practice_releases!inner(release_key)',
        'practice_releases.release_key': `eq.${releaseKey}`, order: 'id.asc', limit: '500' })
      const topicIds: Record<string, string> = Object.create(null), ids = new Set<string>()
      let releaseId: string | undefined
      for (let offset = 0; ; offset += 500) {
        query.set('offset', String(offset))
        const page = await request<{ id: string; topic_key: string; release_id: string; practice_releases: { release_key: string } }[]>(`/rest/v1/practice_topics?${query}`)
        if (!Array.isArray(page)) throw new PracticeCloudError('Некорректный каталог тем.', 'invalid_catalog')
        for (const row of page) {
          if (!row || typeof row.id !== 'string' || !row.id || typeof row.topic_key !== 'string' || !row.topic_key ||
            typeof row.release_id !== 'string' || !row.release_id || row.practice_releases?.release_key !== releaseKey ||
            (releaseId && row.release_id !== releaseId) || Object.hasOwn(topicIds, row.topic_key) || ids.has(row.id)) {
            throw new PracticeCloudError('Некорректный каталог тем.', 'invalid_catalog')
          }
          releaseId = row.release_id; topicIds[row.topic_key] = row.id; ids.add(row.id)
        }
        if (page.length < 500) break
      }
      if (!releaseId) throw new PracticeCloudError('Выпуск практики ещё не опубликован в облачном каталоге.', 'catalog_unavailable')
      return { releaseKey, releaseId, topicIds }
    },
    async startSession(variantId: string) { return getSession(await rpc<string>('practice_start', { p_variant: variantId })) },
    getSession,
    saveDraft(id: string, revision: number, source: string, origin: 'editor' | 'guest_import' = 'editor') {
      return rpc<number>('practice_save_draft', { p_session: id, p_revision: revision, p_source: source, p_origin: origin })
    },
    openHelp(id: string, key: string) { return rpc<string>('practice_open_help', { p_session: id, p_key: key }) },
    progress() { return request<CloudProgress[]>('/rest/v1/practice_topic_progress?select=*', {}, true) },
    chooseLanguage(releaseId: string, language: CloudLanguage) { return rpc<null>('practice_choose_language', { p_release: releaseId, p_language: language }) },
  }
}
export type PracticeCloud = ReturnType<typeof createPracticeCloud>
