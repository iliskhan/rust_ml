import { Component, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

export function SectionLoadError({ title }: { title: string }) {
  return <section className="panel" role="alert">
    <h2>Не удалось открыть раздел «{title}»</h2>
    <p>Проверьте подключение и обновите страницу, чтобы загрузить раздел заново. Можно также выбрать другой раздел в меню.</p>
    <p>Сохранённые черновики и прогресс останутся на устройстве. Настройки опытов в этой вкладке после обновления сбросятся.</p>
    <button type="button" className="primary" onClick={() => window.location.reload()}>Обновить страницу и повторить</button>
  </section>;
}

export class SectionBoundary extends Component<{ title: string; children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? (this.props.fallback !== undefined ? this.props.fallback : <SectionLoadError title={this.props.title} />) : this.props.children; }
}

/** Keep Escape, close and return focus usable while the explorer chunk is unavailable. */
export function ExplorerLoading({ children, close, returnFocus }: { children: ReactNode; close: () => void; returnFocus: RefObject<HTMLElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    };
  }, [returnFocus]);
  return <dialog ref={dialog} className="knowledge-explorer" aria-label="Разбор понятия"
    onCancel={event => { event.preventDefault(); close(); }}>
    <div className="explorer-header"><button type="button" className="explorer-close" onClick={close}>Вернуться к уроку ×</button></div>
    <div className="explorer-viewport"><div className="explorer-frame">{children}</div></div>
  </dialog>;
}
