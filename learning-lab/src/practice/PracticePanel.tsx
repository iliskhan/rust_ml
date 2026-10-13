import { useEffect, useId, useRef, useState } from 'react'
import { getConcept } from '../concepts'
import { ConceptLink } from '../learning-context'
import { practiceRelease, practiceTopics, type PracticeExercise, type PracticeLanguage } from './all-catalog'
import { browserPracticeStore, primaryLanguageKey, PracticeStorageError, type LocalPracticeStore, type LocalPracticeRecord, type PracticeScope } from './local-progress'
import './practice.css'

const languageLabels: Record<PracticeLanguage, string> = { python: 'Python', javascript: 'JavaScript', rust: 'Rust' }
const extensions: Record<PracticeLanguage, string> = { python: 'py', javascript: 'js', rust: 'rs' }
export type SaveCloudDraft = (scope: PracticeScope, source: string, revision: number) => Promise<string | void>
export type LoadCloudDraft = (scope: PracticeScope) => Promise<string>
export type PracticeSelection = { topicId: string; scope: PracticeScope }
export type ChooseCloudLanguage = (scope: PracticeScope) => Promise<void>
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Не удалось сохранить данные. Скачайте код в файл.'
// Unsaved edits survive route/language changes during this page session, including storage failure.
const pendingEdits = new Map<string, string>()
const scopeKey = (scope: PracticeScope) => JSON.stringify(scope)
const blankRecord = (): LocalPracticeRecord => ({ version: 1, draft: null, help: [], history: [] })
const prerequisiteTitle = (key: string) => practiceTopics.find(topic => topic.id === key)?.title ?? getConcept(key.replace(/^concept\./, ''))?.title ?? ({ 'concept.chain-rule': 'Правило цепочки', 'concept.partial-derivative': 'Частная производная' } as Record<string, string>)[key] ?? 'Основание из объяснения темы'

export function PracticePanel({ lessonId, topicId: chapterTopic, ownerId, initialSelection, onSaveCloudDraft, onLoadCloudDraft, onChooseCloudLanguage }: { lessonId: string; topicId?: string; ownerId?: string; initialSelection?: PracticeSelection; onSaveCloudDraft?: SaveCloudDraft; onLoadCloudDraft?: LoadCloudDraft; onChooseCloudLanguage?: ChooseCloudLanguage }) {
  const id = useId()
  const [store] = useState(browserPracticeStore)
  const topics = practiceTopics.filter(topic => topic.lessonId === lessonId && (!chapterTopic || topic.id === chapterTopic || topic.id.startsWith(chapterTopic + '.') || topic.id.startsWith(chapterTopic + '-')))
  const selected = initialSelection && initialSelection.scope.ownerId === ownerId && initialSelection.scope.releaseId === practiceRelease ? initialSelection : undefined
  const [topicId, setTopicId] = useState(selected?.topicId ?? '')
  const [exerciseId, setExerciseId] = useState(selected?.scope.exerciseId ?? '')
  const [preference] = useState(() => {
    try { return { language: store.getPrimaryLanguage(practiceRelease, ownerId), error: '' } }
    catch (error) { return { language: 'python' as PracticeLanguage, error: errorMessage(error) } }
  })
  const [primary, setPrimary] = useState(preference.language)
  const [language, setLanguage] = useState(selected?.scope.language ?? preference.language)
  const [notice, setNotice] = useState(preference.error)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const syncPrimary = () => {
      try { setPrimary(store.getPrimaryLanguage(practiceRelease, ownerId)) }
      catch (error) { setNotice(errorMessage(error)) }
    }
    const syncStorage = (event: StorageEvent) => { if (event.key === null || event.key === primaryLanguageKey(practiceRelease, ownerId)) syncPrimary() }
    window.addEventListener('rustml-practice-language', syncPrimary)
    window.addEventListener('storage', syncStorage)
    return () => { window.removeEventListener('rustml-practice-language', syncPrimary); window.removeEventListener('storage', syncStorage) }
  }, [store, ownerId])
  const topic = topics.find(t => t.id === topicId) ?? topics[0]
  const exercise = topic?.exercises.find(e => e.id === exerciseId) ?? topic?.exercises[0]

  return <section className="practice-panel panel" id={`${id}-practice`} aria-labelledby={`${id}-title`}>
    <span className="eyebrow">Практика · {practiceRelease}</span>
    <h2 id={`${id}-title`}>Напишите свой фрагмент</h2>
    <p>Черновики, подсказки и самопроверки сохраняются на этом устройстве. Подтверждённое освоение требует отдельной серверной проверки кода.</p>
    {!topic || !exercise ? <p className="note">Для этого урока в текущем выпуске ещё нет практики. Чтение урока доступно без ограничений.</p> : <>
      <div className="practice-selectors">
        <label htmlFor={`${id}-topic`}>Тема<select id={`${id}-topic`} value={topic.id} disabled={saving} onChange={event => { setTopicId(event.target.value); setExerciseId('') }}>{topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
        <label htmlFor={`${id}-exercise`}>Задание<select id={`${id}-exercise`} value={exercise.id} disabled={saving} onChange={event => setExerciseId(event.target.value)}>{topic.exercises.map(e => <option key={e.id} value={e.id}>{e.mode === 'transfer' ? 'Перенос · ' : ''}{e.title}</option>)}</select></label>
        <label htmlFor={`${id}-language`}>Язык черновика<select id={`${id}-language`} value={language} disabled={saving} onChange={event => setLanguage(event.target.value as PracticeLanguage)}>{Object.entries(languageLabels).map(([key, title]) => <option value={key} key={key}>{title}{key === primary ? ' · основной' : ''}</option>)}</select></label>
      </div>
      <div className="button-row"><button type="button" disabled={(language === primary && !onChooseCloudLanguage) || saving} onClick={async () => {
        setSaving(true)
        try {
          await store.setPrimaryLanguage(practiceRelease, language, ownerId); setPrimary(language); window.dispatchEvent(new Event('rustml-practice-language'))
          if (onChooseCloudLanguage) {
            try { await onChooseCloudLanguage({ releaseId: practiceRelease, exerciseId: exercise.id, language, ownerId }) }
            catch (error) { setNotice(`Основной язык на этом устройстве: ${languageLabels[language]}. Аккаунт не подтвердил смену: ${errorMessage(error)}`); return }
          }
          setNotice(`Основной язык${onChooseCloudLanguage ? ' на этом устройстве и в аккаунте' : ' на этом устройстве'}: ${languageLabels[language]}. История других языков сохранена.`)
        } catch (error) { setNotice(errorMessage(error)) }
        finally { setSaving(false) }
      }}>Сделать {languageLabels[language]} основным</button></div>
      <p className="note">Основной маршрут: {languageLabels[primary]}. Работа на других языках сохраняется отдельно. Смена языка открывает его собственный черновик.</p>
      {topic.sourceSection && <p>{topic.id.startsWith('concept.') ? <ConceptLink concept={topic.id.slice(8)}>Разобрать основание: {topic.title}</ConceptLink> : <a href={`#${lessonId}`}>Вернуться к объяснению: {topic.title}</a>}</p>}
      <p className="note">Предпосылки: {topic.prerequisites.map(prerequisiteTitle).join(', ') || 'достаточно текущего объяснения'}.</p>
      <PracticeEditor key={`${ownerId || 'guest'}/${practiceRelease}/${exercise.id}/${language}`} exercise={exercise} scope={{ releaseId: practiceRelease, exerciseId: exercise.id, language, ownerId }} store={store} autoFocus={Boolean(selected)} onSaving={setSaving} onSaveCloudDraft={onSaveCloudDraft} onLoadCloudDraft={onLoadCloudDraft} />
    </>}
    {notice && <p role="status" aria-live="polite" className="practice-notice">{notice}</p>}
  </section>
}

function PracticeEditor({ exercise, scope, store, autoFocus, onSaving, onSaveCloudDraft, onLoadCloudDraft }: { exercise: PracticeExercise; scope: PracticeScope; store: LocalPracticeStore; autoFocus: boolean; onSaving: (saving: boolean) => void; onSaveCloudDraft?: SaveCloudDraft; onLoadCloudDraft?: LoadCloudDraft }) {
  const id = useId()
  const [initial] = useState(() => {
    try { return { record: store.read(scope), error: '' } }
    catch (error) { return { record: blankRecord(), error: errorMessage(error) } }
  })
  const [record, setRecord] = useState(initial.record)
  const [code, setCode] = useState(() => pendingEdits.get(scopeKey(scope)) ?? initial.record.draft?.code ?? exercise.starter[scope.language])
  const [status, setStatus] = useState(initial.error || (pendingEdits.has(scopeKey(scope)) ? 'Есть несохранённый код из этой сессии. Сохраните или скачайте файл.' : initial.record.draft ? `Черновик сохранён · версия ${initial.record.draft.revision}` : 'Стартовый фрагмент. Дополните свою функцию.'))
  const [busy, setBusy] = useState(false)
  const revision = useRef(initial.record.draft?.revision ?? 0)
  const queue = useRef(Promise.resolve())
  const blocked = useRef(Boolean(initial.error))
  const [conflict, setConflict] = useState<PracticeStorageError | null>(null)
  const [answer, setAnswer] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [visibleHelp, setVisibleHelp] = useState<string[]>(initial.record.help.map(h => h.kind))
  const [historyOpen, setHistoryOpen] = useState(false)
  const [cloudCode, setCloudCode] = useState<string | null>(null)

  function persist(nextCode: string) {
    pendingEdits.set(scopeKey(scope), nextCode)
    if (blocked.current) return
    setBusy(true); onSaving(true); setStatus('Сохраняем черновик на этом устройстве…')
    queue.current = queue.current.then(async () => {
      if (blocked.current) return
      try {
        const draft = await store.saveDraft(scope, nextCode, revision.current)
        revision.current = draft.revision
        setRecord(store.read(scope))
        if (pendingEdits.get(scopeKey(scope)) === nextCode) {
          pendingEdits.delete(scopeKey(scope)); setStatus(`Черновик сохранён · версия ${draft.revision}`)
        }
      } catch (error) {
        blocked.current = true; setStatus(errorMessage(error))
        if (error instanceof PracticeStorageError && error.kind === 'conflict') setConflict(error)
      }
    })
    const current = queue.current
    void current.then(() => { if (queue.current === current) { setBusy(false); onSaving(false) } })
  }

  function download(source = code, suffix = '') {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${exercise.id}${suffix}.${extensions[scope.language]}`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function openHelp(kind: string) {
    try { const next = await store.recordHelp(scope, kind); setRecord(next); setVisibleHelp(current => [...new Set([...current, kind])]) }
    catch (error) {
      setStatus(`${errorMessage(error)} Помощь доступна для чтения, но её запись на этом устройстве не подтверждена.`)
      setVisibleHelp(current => [...new Set([...current, kind])])
    }
  }

  return <div className="practice-editor">
    <h3>{exercise.title}</h3>
    <p className="practice-mode">{exercise.mode === 'transfer' ? 'Перенос на новые условия. История помощи у этого варианта отдельная.' : 'Разберите правило и напишите небольшой фрагмент.'}</p>
    <div className="practice-workspace">
      <div className="practice-statement">
        <p>{exercise.prompt}</p><div className="formula">{exercise.formula}</div>
        <table className="data-table"><caption>Открытые примеры для ручного разбора; код здесь не запускается</caption><thead><tr><th scope="col">Вход</th><th scope="col">Ожидаемый результат</th></tr></thead><tbody>{exercise.fixtures.map((f, i) => <tr key={i}><td><code>{f.input}</code></td><td><code>{f.output}</code></td></tr>)}</tbody></table>
      </div>
      <div className="practice-code">
        <label htmlFor={`${id}-code`}>Ваш код · {languageLabels[scope.language]}</label>
        <textarea id={`${id}-code`} autoFocus={autoFocus} value={code} spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" rows={16} aria-describedby={`${id}-save ${id}-execution`} onChange={event => { setCode(event.target.value); persist(event.target.value) }} />
        <p id={`${id}-save`} role="status" aria-live="polite" aria-atomic="true" className="practice-save">{status}</p>
        <div className="button-row">
          <button type="button" onClick={() => download()}>Скачать .{extensions[scope.language]}</button>
          <button type="button" disabled={busy || Boolean(conflict)} onClick={() => { blocked.current = false; persist(code) }}>Сохранить черновик</button>
          <button type="button" disabled={!onSaveCloudDraft || busy || Boolean(conflict)} onClick={async () => {
            if (!onSaveCloudDraft) return
            setBusy(true); onSaving(true)
            try { const message = await onSaveCloudDraft(scope, code, revision.current); setStatus(message || 'Черновик сохранён в аккаунте. Код не проверен.') }
            catch (error) { setStatus(errorMessage(error)) }
            finally { setBusy(false); onSaving(false) }
          }}>Сохранить в аккаунте</button>
          <button type="button" disabled={!onLoadCloudDraft || busy} onClick={async () => {
            if (!onLoadCloudDraft) return
            setBusy(true); onSaving(true)
            try { setCloudCode(await onLoadCloudDraft(scope)); setStatus('Облачный черновик открыт для сравнения. Код в редакторе не изменён.') }
            catch (error) { setStatus(errorMessage(error)) }
            finally { setBusy(false); onSaving(false) }
          }}>Открыть облачный черновик</button>
          <button type="button" disabled aria-describedby={`${id}-execution`}>Проверить код на сервере</button>
        </div>
        <p id={`${id}-execution`} className="note">Серверный исполнитель ещё не подключён. Вопрос ниже — самопроверка понимания; он не запускает и не оценивает ваш код.{!onSaveCloudDraft && ' Для сохранения в аккаунте войдите в настроенный сервис.'}</p>
        {cloudCode !== null && <div className="practice-conflict">
          <label htmlFor={`${id}-cloud`}>Облачная версия · только для чтения</label>
          <textarea id={`${id}-cloud`} readOnly value={cloudCode} rows={8} wrap="off" />
          <p>Перед заменой скачайте свой локальный код. Можно скопировать нужные строки облачной версии и объединить их в основном редакторе.</p>
          <div className="button-row"><button type="button" onClick={() => download()}>Скачать мой локальный код</button><button type="button" onClick={() => download(cloudCode, '-cloud')}>Скачать облачный код</button><button type="button" disabled={busy || Boolean(conflict)} onClick={() => { setCode(cloudCode); persist(cloudCode) }}>Заменить локальный код облачным и сохранить</button><button type="button" onClick={() => setCloudCode(null)}>Закрыть сравнение</button></div>
        </div>}
        {conflict && <div className="practice-conflict" role="alert">
          <p>Конфликт версий. Ваш код сохранён в редакторе, а другая версия показана ниже. Скачайте обе или объедините их вручную.</p>
          <label htmlFor={`${id}-conflict`}>Версия из другой вкладки · {conflict.current?.revision ?? 0}</label>
          <textarea id={`${id}-conflict`} readOnly value={conflict.current?.code ?? ''} rows={8} wrap="off" />
          <div className="button-row"><button type="button" onClick={() => download(conflict.current?.code ?? '', '-other')}>Скачать другую версию</button><button type="button" onClick={() => {
            revision.current = conflict.current?.revision ?? 0; blocked.current = false; setConflict(null); persist(code)
          }}>Сохранить мой объединённый код поверх версии {conflict.current?.revision ?? 0}</button></div>
        </div>}
      </div>
    </div>
    <section className="practice-help" aria-labelledby={`${id}-help`}>
      <h4 id={`${id}-help`}>Помощь по шагам</h4>
      <p className="note">Открытие подсказки или решения записывается для этого задания и языка. Перезагрузка страницы не очищает сохранённую помощь.</p>
      {exercise.hints.map((hint, index) => <div key={index}><button type="button" disabled={visibleHelp.includes(`hint-${index}`) || (index > 0 && !visibleHelp.includes(`hint-${index - 1}`))} onClick={() => void openHelp(`hint-${index}`)}>Подсказка {index + 1}{visibleHelp.includes(`hint-${index}`) ? ' · открыта' : ''}</button>{visibleHelp.includes(`hint-${index}`) && <p>{hint}</p>}</div>)}
      <div className="button-row"><button type="button" disabled={visibleHelp.includes('explanation')} onClick={() => void openHelp('explanation')}>Открыть разбор</button><button type="button" disabled={visibleHelp.includes('solution')} onClick={() => void openHelp('solution')}>Открыть полное решение</button></div>
      {visibleHelp.includes('explanation') && <p>{exercise.explanation}</p>}
      {visibleHelp.includes('solution') && <><label htmlFor={`${id}-solution`}>Эталон для разбора · {languageLabels[scope.language]}</label><textarea id={`${id}-solution`} readOnly value={exercise.solution[scope.language]} rows={10} wrap="off" /></>}
      <p className="note">Помощь: {visibleHelp.length ? 'открыта в этом варианте' : initial.error ? 'историю не удалось прочитать' : 'ещё не открывалась в этой сессии'}. Локальная запись не подтверждает самостоятельное освоение.</p>
    </section>
    <fieldset className="practice-quiz"><legend>Самопроверка понимания</legend><p>{exercise.quiz.question}</p>{exercise.quiz.options.map((option, index) => <label key={index}><input type="radio" name={`${id}-quiz`} checked={answer === index} onChange={() => { setAnswer(index); setFeedback('') }} />{option}</label>)}
      <button type="button" disabled={answer === null} onClick={async () => {
        if (answer === null) return
        const correct = answer === exercise.quiz.correctIndex
        setFeedback(`${correct ? 'Ответ совпал с учебным разбором.' : 'Попробуйте объяснить правило ещё раз.'} ${exercise.quiz.explanation}`)
        try { setRecord(await store.recordQuiz(scope, answer, correct)) }
        catch (error) { setStatus(errorMessage(error)) }
      }}>Проверить понимание</button><p role="status" aria-live="polite">{feedback}</p>
    </fieldset>
    <button type="button" aria-expanded={historyOpen} aria-controls={`${id}-history`} onClick={() => setHistoryOpen(!historyOpen)}>История на этом устройстве · {record.history.length} самопроверок</button>
    <div id={`${id}-history`} hidden={!historyOpen} className="practice-history"><p>Это ответы на вопрос, а не проверки кода и не подтверждённые достижения. Последние 100 записей хранятся отдельно для каждого языка и версии практики.</p>{record.history.length ? <ol>{[...record.history].reverse().map((entry, i) => <li key={i}>{new Date(entry.at).toLocaleString('ru-RU')} · {languageLabels[scope.language]} · {entry.correct ? 'ответ совпал' : 'нужно повторить'} · версия черновика {entry.draftRevision}</li>)}</ol> : <p>Самопроверок пока нет.</p>}</div>
    <table className="data-table"><caption>Локальная работа по языкам · только это задание, без зачёта освоения</caption><thead><tr><th scope="col">Язык</th><th scope="col">Черновик</th><th scope="col">Самопроверки понимания</th></tr></thead><tbody>{(Object.keys(languageLabels) as PracticeLanguage[]).map(language => {
      try {
        const local = language === scope.language ? record : store.read({ ...scope, language })
        return <tr key={language}><th scope="row">{languageLabels[language]}</th><td>{local.draft ? `версия ${local.draft.revision}` : 'не сохранён'}</td><td>{local.history.filter(h => h.correct).length} ответов совпало · {local.history.length} записей</td></tr>
      } catch { return <tr key={language}><th scope="row">{languageLabels[language]}</th><td colSpan={2}>Локальная история недоступна</td></tr> }
    })}</tbody></table>
    <p className="note">Подтверждённое освоение: данных серверной проверки пока нет. Чтение следующих тем доступно.</p>
  </div>
}
