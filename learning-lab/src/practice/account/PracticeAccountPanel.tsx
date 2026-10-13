import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import './PracticeAccountPanel.css';

export type PracticeAccountPanelProps = {
  cloudAvailable: boolean;
  emailAuthAvailable?: boolean;
  user: { id: string; email?: string } | null;
  busy: boolean;
  status: string;
  error: string;
  confirmationEmail: string | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function PracticeAccountPanel({ cloudAvailable, emailAuthAvailable = true, user, busy, status, error, confirmationEmail, signInWithPassword, signUpWithPassword, resendConfirmation, signIn, signOut }: PracticeAccountPanelProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [showConfirmation, setShowConfirmation] = useState(true);
  const emailInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const signingUp = mode === 'sign-up';
  useEffect(() => { if (!showConfirmation) emailInput.current?.focus(); }, [showConfirmation]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    (form.elements.namedItem('password') as HTMLInputElement).value = '';
    data.delete('password');
    setShowConfirmation(true);
    await (signingUp ? signUpWithPassword(email, password) : signInWithPassword(email, password));
  }

  return <section className="panel practice-account" aria-labelledby="practice-account-title">
    <h2 id="practice-account-title">Ваши черновики и аккаунт</h2>
    <p>Без входа задания, черновики, открытая помощь и история вопросов сохраняются в этом браузере. Аккаунт позволяет вручную сохранить код в облаке.</p>
    <p>Гостевые и личные черновики хранятся отдельно. Чтобы перенести гостевой код, скачайте его перед входом и вставьте в выбранный личный черновик.</p>
    {!cloudAvailable ? <p className="note">Облачное сохранение на этом сайте ещё не настроено. Локальная практика доступна; скачайте код, чтобы перенести его на другое устройство.</p> : <>
      <div className="practice-account-auth" aria-busy={busy}>
        {user ? <>
          <p>Вы вошли: {user.email || 'аккаунт GitHub'}</p>
          <div className="button-row"><button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Выходим…' : 'Выйти из аккаунта'}</button></div>
        </> : emailAuthAvailable && confirmationEmail && showConfirmation ? <div className="practice-account-confirmation">
          <h3>Подтвердите email</h3>
          <p>Если регистрация для {confirmationEmail} требует подтверждения, откройте ссылку из письма, затем войдите. Проверьте также папку «Спам».</p>
          <p>Откройте письмо в этом же браузере. Если подтвердили email на другом устройстве, вернитесь сюда и войдите с email и паролем.</p>
          <p className="note">Запрос принят, но это не подтверждает наличие аккаунта или доставку письма.</p>
          <div className="button-row">
            <button type="button" disabled={busy} onClick={() => void resendConfirmation(confirmationEmail)}>{busy ? 'Отправляем…' : 'Запросить письмо повторно'}</button>
            <button type="button" disabled={busy} onClick={() => { setMode('sign-in'); setShowConfirmation(false); }}>Вернуться ко входу</button>
          </div>
        </div> : <>
          {emailAuthAvailable && <>
          <div className="button-row" role="group" aria-label="Вход или регистрация">
            <button type="button" aria-pressed={!signingUp} disabled={busy} onClick={() => setMode('sign-in')}>Войти</button>
            <button type="button" aria-pressed={signingUp} disabled={busy} onClick={() => setMode('sign-up')}>Создать аккаунт</button>
          </div>
          <form className="practice-account-form" onSubmit={event => void submit(event)}>
            <fieldset disabled={busy}>
              <legend>{signingUp ? 'Регистрация по email' : 'Вход по email'}</legend>
              <label htmlFor={`${id}-email`}>Email</label>
              <input ref={emailInput} id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} autoCapitalize="none" spellCheck={false} />
              <label htmlFor={`${id}-password`}>Пароль</label>
              <input key={mode} id={`${id}-password`} name="password" type="password" autoComplete={signingUp ? 'new-password' : 'current-password'} required minLength={signingUp ? 6 : undefined} aria-describedby={signingUp ? `${id}-password-hint` : undefined} />
              {signingUp && <p id={`${id}-password-hint`} className="note">Не менее 6 символов. Для входа может потребоваться подтверждение email.</p>}
              <button className="primary" type="submit" disabled={busy}>{busy ? signingUp ? 'Создаём…' : 'Входим…' : signingUp ? 'Создать аккаунт по email' : 'Войти по email'}</button>
            </fieldset>
          </form>
          <p className="practice-account-alternative">Или используйте GitHub:</p>
          </>}
          {!emailAuthAvailable && <p>Вход через GitHub. При первом входе аккаунт создаётся автоматически; отдельный пароль для учебника не нужен.</p>}
          <div className="button-row"><button className={emailAuthAvailable ? undefined : 'primary'} type="button" disabled={busy} onClick={() => void signIn()}>Войти через GitHub</button></div>
        </>}
      </div>
      {error && <p className="practice-account-error" role="alert">{error}</p>}
      <p className="practice-account-status" role="status" aria-atomic="true">{status}</p>
    </>}
    <p className="note">Серверная оценка кода пока недоступна. Локальная самопроверка не подтверждает освоение темы на сервере.</p>
  </section>;
}
