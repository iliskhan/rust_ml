import { useLayoutEffect, useRef } from 'react';
import { ConceptLesson } from './ConceptLesson';
import { getConcept } from './concepts';
import { LearningActivity, useLearning } from './learning-context';
import { SnapshotAnalysis } from './SnapshotAnalysis';

export function KnowledgeExplorer({ lessonTitle }: { lessonTitle: string }) {
  const { navigation, snapshot, frames, positions, focusTargets, returnFocus, close, back, jump } = useLearning();
  const dialog = useRef<HTMLDialogElement>(null);
  const breadcrumbs = useRef<HTMLElement>(null);
  const originScroll = useRef(0);
  const originLesson = useRef(lessonTitle);
  const originalOverflow = useRef('');
  const current = navigation.path.at(-1);
  const isOpen = !!current;

  useLayoutEffect(() => {
    const element = dialog.current!;
    if (isOpen && !element.open) {
      originScroll.current = window.scrollY;
      originLesson.current = lessonTitle;
      originalOverflow.current = document.body.style.overflow;
      element.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!isOpen && element.open) {
      element.close();
      document.body.style.overflow = originalOverflow.current;
      // A hash route change restores its own position; do not overwrite it with the previous lesson.
      if (originLesson.current === lessonTitle) {
        if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
        window.scrollTo({ top: originScroll.current, behavior: 'instant' });
      }
    }
  }, [isOpen, returnFocus, lessonTitle]);

  useLayoutEffect(() => {
    if (!current) return;
    if (breadcrumbs.current) breadcrumbs.current.scrollLeft = breadcrumbs.current.scrollWidth;
    const frame = frames.current.get(current);
    if (!frame) return;
    const target = focusTargets.current.get(current);
    const focus = target?.isConnected && frame.contains(target) ? target : frame.querySelector<HTMLElement>('h2');
    focus?.focus({ preventScroll: true });
    frame.scrollTop = positions.current.get(current) ?? 0;
    // ResizeObserver may resize a previously hidden chart after the frame becomes visible.
    let afterResize = 0;
    const restore = requestAnimationFrame(() => {
      afterResize = requestAnimationFrame(() => { frame.scrollTop = positions.current.get(current) ?? 0; });
    });
    return () => { cancelAnimationFrame(restore); cancelAnimationFrame(afterResize); };
  }, [current, frames, positions, focusTargets]);

  useLayoutEffect(() => () => {
    if (dialog.current?.open) document.body.style.overflow = originalOverflow.current;
  }, []);

  return <dialog ref={dialog} className="knowledge-explorer" aria-labelledby={current ? `concept-heading-${current}` : undefined}
    onCancel={event => { event.preventDefault(); close(); }} onClose={event => { if (!event.currentTarget.open && navigation.path.length) close(); }}>
    <header className="explorer-header">
      <div className="explorer-topline"><div><span className="eyebrow">Разобраться в основе</span><span className="explorer-origin">Из урока «{lessonTitle}»</span></div><button type="button" className="explorer-close" onClick={close}>Вернуться к уроку <span aria-hidden="true">×</span></button></div>
      <nav ref={breadcrumbs} className="explorer-breadcrumbs" aria-label="Путь разбора понятия"><ol>
        <li><button type="button" onClick={close}>Урок</button></li>
        {navigation.path.map((id, index) => { const title = getConcept(id)?.title ?? id; const short = title.split(':')[0]; return <li key={id}>{index === navigation.path.length - 1 ? <span aria-current="page" title={title}>{short}</span> : <button type="button" title={title} onClick={() => jump(index)}>{short}</button>}</li>; })}
      </ol></nav>
      <div className="explorer-toolbar">{navigation.path.length > 1 && <button type="button" onClick={back}>← На один уровень назад</button>}<span>Уровень {navigation.path.length} · настройки сохранены</span></div>
      <p className="explorer-message" role="status">{navigation.message}</p>
    </header>
    <div className="explorer-viewport">{navigation.visited.map(id => <section key={id} ref={element => { if (element) frames.current.set(id, element); else frames.current.delete(id); }} hidden={id !== current} className="explorer-frame" aria-labelledby={`concept-heading-${id}`}>
      <LearningActivity active={id === current}>
        <div className="explorer-title"><h2 id={`concept-heading-${id}`} tabIndex={-1}>{getConcept(id)?.title ?? id}</h2><p>Нажмите на незнакомое понятие, чтобы разобрать его глубже. Этот шаг останется на месте.</p></div>
        {snapshot && (id === snapshot.kind ? <><SnapshotAnalysis snapshot={snapshot} /><h3 className="snapshot-independent">Самостоятельный пример понятия</h3></> : <p className="snapshot-preserved">Числа из «{snapshot.origin}» сохранены. Вернитесь по пути к «{getConcept(snapshot.kind)?.title.split(':')[0]}», чтобы продолжить их разбор.</p>)}
        <ConceptLesson id={id} />
      </LearningActivity>
    </section>)}</div>
    <div className="explorer-footer" tabIndex={0} role="region" aria-label="Подсказки к разбору понятия"><span>Настройки сохраняются в этой вкладке до перезагрузки.</span><span><kbd>Esc</kbd> — к уроку</span></div>
  </dialog>;
}
