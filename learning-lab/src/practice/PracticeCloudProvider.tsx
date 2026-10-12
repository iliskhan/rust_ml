import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPracticeCloud, PracticeCloudError, type CloudAuthSession, type PracticeCloud } from './cloud';
import { PracticeAccountPanel, type PracticeAccountPanelProps } from './account/PracticeAccountPanel';
import type { SaveCloudDraft, LoadCloudDraft } from './PracticePanel';
import type { PracticeScope } from './local-progress';
import { browserPracticeStore } from './local-progress';
const PracticePanel = lazy(() => import('./PracticePanel').then(module => ({ default: module.PracticePanel })));

type AccountState = Omit<PracticeAccountPanelProps, 'cloudAvailable'> & { cloud: PracticeCloud | null; saveDraft?: SaveCloudDraft; loadDraft?: LoadCloudDraft };
const AccountContext = createContext<AccountState | null>(null);

export function PracticeCloudProvider({ children }: { children: ReactNode }) {
  const [cloud] = useState(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) return null;
    try { return createPracticeCloud({ url, publishableKey }); } catch { return null; }
  });
  const [user, setUser] = useState<CloudAuthSession['user'] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(true);
  const ownerRef = useRef<string | null>(null);
  const cloudDrafts = useRef(new Map<string, { sessionId: string; revision: number; source: string }>());
  const restore = useRef<Promise<CloudAuthSession | null> | null>(null);
  const authEpoch = useRef(0);
  const redirectTo = () => `${window.location.origin}${window.location.pathname}`;
  function applySession(session: CloudAuthSession | null) {
    const next = session?.user ?? null;
    if (ownerRef.current !== (next?.id ?? null)) cloudDrafts.current.clear();
    ownerRef.current = next?.id ?? null;
    setUser(previous => previous?.id === next?.id && previous?.email === next?.email ? previous : next);
  }
  function authError(value: unknown) { setStatus(''); setError(value instanceof Error ? value.message : 'Не удалось подключить аккаунт.'); }
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    let syncing = false;
    async function sync(storageChange = false) {
      if (!cloud || (!storageChange && (syncing || busyRef.current))) return;
      let changed = false;
      try { changed = (cloud.session?.user.id ?? null) !== ownerRef.current; }
      catch (value) { authError(value); applySession(null); return; }
      const epoch = storageChange ? ++authEpoch.current : authEpoch.current;
      if (changed) { applySession(null); busyRef.current = true; setBusy(true); }
      syncing = true;
      try {
        const session = await cloud.restoreSession();
        if (active && epoch === authEpoch.current) {
          applySession(session);
          setError('');
          if (changed) { setConfirmationEmail(null); setStatus(session ? 'Аккаунт подключён.' : 'Вы вышли из аккаунта. Локальная практика доступна.'); }
        }
      } catch (value) {
        if (active && epoch === authEpoch.current) {
          authError(value);
          if (value instanceof PracticeCloudError && ['unauthenticated', 'account_changed', 'invalid_session'].includes(value.code)) applySession(null);
        }
      } finally {
        syncing = false;
        if (active && epoch === authEpoch.current && changed) { busyRef.current = false; setBusy(false); }
      }
    }
    const storageSync = (event: StorageEvent) => {
      if (event.key === null || event.key === cloud.storageKey) {
        // A different tab's auth change also cancels any pending local login.
        busyRef.current = false; setBusy(false);
        void sync(true);
      }
    };
    const foreground = () => { if (document.visibilityState === 'visible') void sync(); };
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      try { if (cloud.session && cloud.session.expires_at < Date.now() / 1000 + 30) void sync(); }
      catch (value) { authError(value); applySession(null); }
    }, 30_000);
    window.addEventListener('storage', storageSync);
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      active = false; window.clearInterval(timer);
      window.removeEventListener('storage', storageSync); window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [cloud]);
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    const epoch = authEpoch.current;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get('code');
    const callbackError = params.has('error') || hashParams.has('error');
    restore.current ??= code ? cloud.completeOAuth(code) : cloud.restoreSession();
    busyRef.current = true; setBusy(true);
    restore.current.then(session => {
      if (!active || epoch !== authEpoch.current) return;
      applySession(session);
      if (callbackError) { setError('Подтверждение или вход не завершены. Запросите новое письмо или повторите вход.'); return; }
      setStatus(session ? 'Аккаунт подключён. Черновики сохраняются в облако по вашей команде.' : 'Войдите, чтобы сохранять черновики в аккаунте.');
    }).catch(value => { if (active && epoch === authEpoch.current) authError(value); })
      .finally(() => {
        if (!active || epoch !== authEpoch.current) return;
        busyRef.current = false; setBusy(false);
        if (code || callbackError) {
          window.history.replaceState(null, '', `${window.location.pathname}#practice`);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      });
    return () => { active = false; };
  }, [cloud]);
  async function signIn() {
    if (!cloud || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setStatus('Открываем вход через GitHub…'); setConfirmationEmail(null);
    const epoch = ++authEpoch.current;
    try { await cloud.signInWithGitHub(redirectTo()); }
    catch (value) { if (epoch === authEpoch.current) { authError(value); busyRef.current = false; setBusy(false); } }
  }
  async function passwordAuth(email: string, password: string, signingUp: boolean) {
    if (!cloud || busyRef.current) return;
    const epoch = ++authEpoch.current;
    busyRef.current = true; setBusy(true); setError(''); setConfirmationEmail(null); setStatus(signingUp ? 'Создаём аккаунт…' : 'Входим…');
    try {
      const session = signingUp ? await cloud.signUpWithPassword(email, password, redirectTo()) : await cloud.signInWithPassword(email, password);
      if (epoch !== authEpoch.current) return;
      applySession(session);
      setConfirmationEmail(session ? null : email.trim());
      setStatus(session ? 'Аккаунт подключён. Черновики сохраняются в облако по вашей команде.' : 'Запрос регистрации принят. Если требуется подтверждение, проверьте email.');
    } catch (value) {
      if (epoch === authEpoch.current) {
        authError(value);
        if (value instanceof PracticeCloudError && value.code === 'email_not_confirmed') setConfirmationEmail(email.trim());
      }
    } finally { if (epoch === authEpoch.current) { busyRef.current = false; setBusy(false); } }
  }
  async function resendConfirmation(email: string) {
    if (!cloud || busyRef.current) return;
    const epoch = ++authEpoch.current;
    busyRef.current = true; setBusy(true); setError(''); setStatus('Запрашиваем новое письмо…');
    try {
      await cloud.resendConfirmation(email, redirectTo());
      if (epoch === authEpoch.current) setStatus('Запрос принят. Используйте ссылку из последнего письма, если оно придёт.');
    } catch (value) { if (epoch === authEpoch.current) authError(value); }
    finally { if (epoch === authEpoch.current) { busyRef.current = false; setBusy(false); } }
  }
  async function signOut() {
    if (!cloud || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setStatus('Выходим…'); setConfirmationEmail(null);
    const epoch = ++authEpoch.current;
    applySession(null);
    try { await cloud.signOut(user?.id); if (epoch === authEpoch.current) setStatus('Вы вышли из аккаунта в этом браузере. Локальная практика доступна.'); }
    catch (value) { if (epoch === authEpoch.current) { setStatus(value instanceof PracticeCloudError && value.code === 'account_changed' ? 'Аккаунт изменился. Обновите страницу, чтобы открыть его черновики.' : 'Локальный выход выполнен; сервер не подтвердил завершение сессии.'); setError(value instanceof Error ? value.message : 'Сервер не подтвердил выход.'); } }
    finally { if (epoch === authEpoch.current) { busyRef.current = false; setBusy(false); } }
  }
  async function saveDraft(scope: PracticeScope, source: string): Promise<string> {
    const epoch = authEpoch.current;
    const assertOwner = () => { if (epoch !== authEpoch.current || !cloud || !user || scope.ownerId !== user.id || cloud.session?.user.id !== user.id) throw new Error('Аккаунт изменился. Откройте его черновик заново; код остаётся в редакторе.'); };
    assertOwner();
    if (!cloud || !user) throw new Error('Сначала войдите в аккаунт.');
    const variants = await cloud.catalog({ releaseKey: scope.releaseId, exerciseKey: scope.exerciseId, language: scope.language });
    assertOwner();
    const variant = variants.find(v => v.language === scope.language && v.practice_exercises.exercise_key === scope.exerciseId && v.practice_releases.release_key === scope.releaseId);
    if (!variant) throw new Error('Это задание ещё не опубликовано в облачном каталоге. Код остаётся в редакторе; скачайте файл.');
    const key = `${user.id}/${variant.id}`;
    let known = cloudDrafts.current.get(key);
    if (!known) {
      const remote = await cloud.startSession(variant.id);
      assertOwner();
      if (remote.draft.source !== variant.starter_code && remote.draft.source !== source) {
        throw new Error('В аккаунте уже есть другой черновик. Ваш код остаётся в редакторе; облачная версия не изменена.');
      }
      known = { sessionId: remote.id, revision: remote.draft.revision, source: remote.draft.source };
      cloudDrafts.current.set(key, known);
    }
    const store = browserPracticeStore();
    for (const receipt of store.read(scope).help) {
      const hint = /^hint-(\d+)$/.exec(receipt.kind);
      await cloud.openHelp(known.sessionId, hint ? `hint:${Number(hint[1]) + 1}` : receipt.kind);
      assertOwner();
    }
    await cloud.chooseLanguage(variant.release_id, store.getPrimaryLanguage(scope.releaseId, user.id));
    assertOwner();
    const revision = await cloud.saveDraft(known.sessionId, known.revision, source);
    assertOwner();
    cloudDrafts.current.set(key, { ...known, revision, source });
    return `Черновик сохранён в аккаунте, версия ${revision}. Код не проверен.`;
  }
  async function loadDraft(scope: PracticeScope): Promise<string> {
    const epoch = authEpoch.current;
    if (!cloud || !user || scope.ownerId !== user.id || cloud.session?.user.id !== user.id) throw new Error('Сначала войдите в аккаунт и откройте его черновик.');
    const variants = await cloud.catalog({ releaseKey: scope.releaseId, exerciseKey: scope.exerciseId, language: scope.language });
    if (epoch !== authEpoch.current || cloud.session?.user.id !== scope.ownerId) throw new Error('Аккаунт изменился; откройте черновик заново.');
    const variant = variants.find(v => v.language === scope.language && v.practice_exercises.exercise_key === scope.exerciseId && v.practice_releases.release_key === scope.releaseId);
    if (!variant) throw new Error('Это задание ещё не опубликовано в облачном каталоге.');
    const remote = await cloud.startSession(variant.id);
    if (epoch !== authEpoch.current || cloud.session?.user.id !== scope.ownerId) throw new Error('Аккаунт изменился; откройте черновик заново.');
    cloudDrafts.current.set(`${user.id}/${variant.id}`, { sessionId: remote.id, revision: remote.draft.revision, source: remote.draft.source });
    return remote.draft.source;
  }
  return <AccountContext.Provider value={{ cloud, user, status, error, confirmationEmail, busy, signIn, signOut, signInWithPassword: (email, password) => passwordAuth(email, password, false), signUpWithPassword: (email, password) => passwordAuth(email, password, true), resendConfirmation, saveDraft: cloud && user ? saveDraft : undefined, loadDraft: cloud && user ? loadDraft : undefined }}>{children}</AccountContext.Provider>;
}

export function PracticeSection({ lessonId, topicId }: { lessonId: string; topicId?: string }) {
  const account = useContext(AccountContext);
  return <Suspense fallback={<p role="status">Загружаем практику…</p>}><PracticePanel key={`${account?.user?.id || 'guest'}/${topicId || lessonId}`} ownerId={account?.user?.id} lessonId={lessonId} topicId={topicId} onSaveCloudDraft={account?.saveDraft} onLoadCloudDraft={account?.loadDraft} /></Suspense>;
}

export function PracticeAccount() {
  const account = useContext(AccountContext);
  if (!account) return null;
  return <PracticeAccountPanel {...account} cloudAvailable={Boolean(account.cloud)} />;
}
