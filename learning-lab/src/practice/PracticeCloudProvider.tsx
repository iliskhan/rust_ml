import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPracticeCloud, type CloudAuthSession, type PracticeCloud } from './cloud';
import type { SaveCloudDraft, LoadCloudDraft } from './PracticePanel';
import type { PracticeScope } from './local-progress';
import { browserPracticeStore } from './local-progress';
const PracticePanel = lazy(() => import('./PracticePanel').then(module => ({ default: module.PracticePanel })));

type AccountState = { cloud: PracticeCloud | null; user: CloudAuthSession['user'] | null; status: string; busy: boolean; signIn: () => Promise<void>; signOut: () => Promise<void>; saveDraft?: SaveCloudDraft; loadDraft?: LoadCloudDraft };
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
  const [busy, setBusy] = useState(false);
  const cloudDrafts = useRef(new Map<string, { sessionId: string; revision: number; source: string }>());
  const restore = useRef<Promise<CloudAuthSession | null> | null>(null);
  const authEpoch = useRef(0);
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    const sync = (event: StorageEvent) => {
      if (event.key !== null && event.key !== cloud.storageKey) return;
      const epoch = ++authEpoch.current;
      setUser(null); cloudDrafts.current.clear(); setBusy(true);
      void cloud.restoreSession().then(session => {
        if (active && authEpoch.current === epoch) setUser(session?.user ?? null);
      }).catch(error => { if (active && authEpoch.current === epoch) setStatus(error instanceof Error ? error.message : 'Аккаунт изменился.'); })
        .finally(() => { if (active && authEpoch.current === epoch) setBusy(false); });
    };
    window.addEventListener('storage', sync);
    return () => { active = false; window.removeEventListener('storage', sync); };
  }, [cloud]);
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    const epoch = authEpoch.current;
    const code = new URLSearchParams(window.location.search).get('code');
    restore.current ??= code ? cloud.completeOAuth(code) : cloud.restoreSession();
    setBusy(true);
    restore.current.then(session => {
      if (!active || epoch !== authEpoch.current) return;
      setUser(session?.user ?? null);
      setStatus(session ? 'Аккаунт подключён. Черновики сохраняются в облако по вашей команде.' : 'Войдите, чтобы сохранять черновики в аккаунте.');
    }).catch(error => { if (active && epoch === authEpoch.current) setStatus(error instanceof Error ? error.message : 'Не удалось подключить аккаунт.'); })
      .finally(() => {
        if (!active || epoch !== authEpoch.current) return;
        setBusy(false);
        if (code) {
          window.history.replaceState(null, '', `${window.location.pathname}#practice`);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      });
    return () => { active = false; };
  }, [cloud]);
  async function signIn() {
    if (!cloud) return;
    setBusy(true);
    const epoch = ++authEpoch.current;
    try { await cloud.signInWithGitHub(`${window.location.origin}${window.location.pathname}`); }
    catch (error) { if (epoch === authEpoch.current) { setStatus(error instanceof Error ? error.message : 'Вход не выполнен.'); setBusy(false); } }
  }
  async function signOut() {
    if (!cloud) return;
    setBusy(true);
    const epoch = ++authEpoch.current;
    try { await cloud.signOut(); }
    catch (error) { if (epoch === authEpoch.current) setStatus(error instanceof Error ? error.message : 'Сервер не подтвердил выход.'); }
    finally { if (epoch === authEpoch.current) { setUser(null); cloudDrafts.current.clear(); setBusy(false); } }
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
  return <AccountContext.Provider value={{ cloud, user, status, busy, signIn, signOut, saveDraft: cloud && user ? saveDraft : undefined, loadDraft: cloud && user ? loadDraft : undefined }}>{children}</AccountContext.Provider>;
}

export function PracticeSection({ lessonId, topicId }: { lessonId: string; topicId?: string }) {
  const account = useContext(AccountContext);
  return <Suspense fallback={<p role="status">Загружаем практику…</p>}><PracticePanel key={`${account?.user?.id || 'guest'}/${topicId || lessonId}`} ownerId={account?.user?.id} lessonId={lessonId} topicId={topicId} onSaveCloudDraft={account?.saveDraft} onLoadCloudDraft={account?.loadDraft} /></Suspense>;
}

export function PracticeAccount() {
  const account = useContext(AccountContext);
  return <section className="panel practice-account" aria-labelledby="practice-account-title">
    <h2 id="practice-account-title">Ваши черновики и аккаунт</h2>
    <p>Без входа задания, черновики, открытая помощь и история вопросов сохраняются в этом браузере. Аккаунт позволяет вручную сохранить код в облаке.</p>
    <p>Гостевые и личные черновики хранятся отдельно. Чтобы перенести гостевой код, скачайте его перед входом и вставьте в выбранный личный черновик.</p>
    {!account?.cloud ? <p className="note">Облачное сохранение на этом сайте ещё не настроено. Локальная практика доступна; скачайте код, чтобы перенести его на другое устройство.</p> : <>
      {account.user ? <p>Вы вошли: {account.user.email || 'аккаунт GitHub'}</p> : <p>Войдите через GitHub для сохранения в аккаунте.</p>}
      <button type="button" disabled={account.busy} onClick={() => void (account.user ? account.signOut() : account.signIn())}>{account.busy ? 'Подключаем…' : account.user ? 'Выйти из аккаунта' : 'Войти через GitHub'}</button>
      <p role="status">{account.status}</p>
    </>}
    <p className="note">Серверная оценка кода пока недоступна. Локальная самопроверка не подтверждает освоение темы на сервере.</p>
  </section>;
}
