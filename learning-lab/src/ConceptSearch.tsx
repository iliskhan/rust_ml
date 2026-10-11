import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useLearning } from './learning-context';
import { searchConcepts } from './searchConcepts';
import './concept-search.css';

export function ConceptSearch({ open, onOpenChange, lessonId }: {
  open: boolean; onOpenChange: (open: boolean) => void; lessonId: string;
}) {
  const { openConcept, navigation } = useLearning();
  const [query, setQuery] = useState('');
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const scroll = useRef(0);
  const fromLesson = useRef(lessonId);
  const overflow = useRef('');
  const found = searchConcepts(query);

  function show() {
    if (document.querySelector('dialog[open]')) return;
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : button.current;
    onOpenChange(true);
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k'
        && !document.querySelector('dialog[open]')) {
        event.preventDefault();
        origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : button.current;
        onOpenChange(true);
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [onOpenChange]);

  useLayoutEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) {
      scroll.current = window.scrollY;
      fromLesson.current = lessonId;
      overflow.current = document.body.style.overflow;
      element.showModal();
      document.body.style.overflow = 'hidden';
      input.current?.focus({ preventScroll: true });
    } else if (!open && element.open) {
      element.close();
      document.body.style.overflow = overflow.current;
      if (fromLesson.current === lessonId) {
        const target = origin.current?.isConnected ? origin.current : button.current;
        target?.focus({ preventScroll: true });
        window.scrollTo({ top: scroll.current, behavior: 'instant' });
      }
    }
  }, [open, lessonId]);

  useLayoutEffect(() => () => {
    if (dialog.current?.open) document.body.style.overflow = overflow.current;
  }, []);

  function choose(conceptId: string) {
    const target = origin.current?.isConnected ? origin.current : button.current;
    if (!target) return;
    onOpenChange(false);
    openConcept(conceptId, target);
  }

  return <>
    <button ref={button} type="button" className="concept-search-trigger" onClick={show}
      aria-haspopup="dialog" aria-keyshortcuts="Control+k Meta+k" disabled={navigation.path.length > 0}>
      Найти понятие <kbd aria-hidden="true">Ctrl K</kbd>
    </button>
    <dialog ref={dialog} className="concept-search-dialog" aria-labelledby={`${id}-title`}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onOpenChange(false); } }}
      onCancel={event => { event.preventDefault(); onOpenChange(false); }}
      onClose={() => onOpenChange(false)}>
      <div className="concept-search-header"><h2 id={`${id}-title`}>Найти понятие</h2>
        <button type="button" onClick={() => onOpenChange(false)}>Закрыть поиск</button></div>
      <p id={`${id}-help`}>Разбор откроется поверх этого урока. Ваши числа останутся на месте; обучение на паузе.</p>
      <label htmlFor={`${id}-query`}>Название или смысл понятия</label>
      <input ref={input} id={`${id}-query`} type="search" value={query} onChange={event => setQuery(event.target.value)}
        aria-describedby={`${id}-help`} autoComplete="off" placeholder="Например, градиент или softmax" />
      <p role="status" className="concept-search-count">Найдено: {found.length}</p>
      {found.length ? <ul className="concept-search-results">{found.map(concept => <li key={concept.id}>
        <button type="button" onClick={() => choose(concept.id)}><strong>{concept.title.split(':')[0]}</strong>
          <span>{concept.idea}</span></button>
      </li>)}</ul> : <p>Ничего не найдено. Попробуйте более короткое слово, например «градиент».</p>}
    </dialog>
  </>;
}
