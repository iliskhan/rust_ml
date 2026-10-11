import './learning-ux.css';

export function focusLessonSection(id: string) {
  const target = document.getElementById(id);
  target?.focus({ preventScroll: true });
  target?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

export function LessonOutline({ items }: { items: { id: string; label: string }[] }) {
  return <nav className="lesson-outline" aria-label="В этом уроке"><span>В этом уроке</span>{items.map(item => <button key={item.id} type="button" onClick={() => focusLessonSection(item.id)}>{item.label}</button>)}</nav>;
}
