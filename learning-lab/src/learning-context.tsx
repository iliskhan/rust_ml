import { createContext, useContext, useReducer, useRef, useState, type ReactNode, type RefObject } from 'react';
import { getConcept } from './concepts';
import { initialNavigation, learningNavigation, type LearningNavigation } from './learning-navigation';
import { copyMathSnapshot, type MathSnapshot } from './mathSnapshot';

type LearningContextValue = {
  navigation: LearningNavigation;
  openConcept: (id: string, trigger: HTMLElement) => void;
  openSnapshot: (snapshot: MathSnapshot, trigger: HTMLElement) => void;
  snapshot: MathSnapshot | null;
  back: () => void;
  jump: (index: number) => void;
  close: () => void;
  frames: RefObject<Map<string, HTMLElement>>;
  positions: RefObject<Map<string, number>>;
  focusTargets: RefObject<Map<string, HTMLElement>>;
  returnFocus: RefObject<HTMLElement | null>;
};

const LearningContext = createContext<LearningContextValue | null>(null);
const LearningActiveContext = createContext(true);

export function LearningProvider({ children }: { children: ReactNode }) {
  const [navigation, dispatch] = useReducer(learningNavigation, initialNavigation);
  const [snapshot, setSnapshot] = useState<MathSnapshot | null>(null);
  const frames = useRef(new Map<string, HTMLElement>());
  const positions = useRef(new Map<string, number>());
  const focusTargets = useRef(new Map<string, HTMLElement>());
  const returnFocus = useRef<HTMLElement | null>(null);

  function rememberCurrent() {
    const id = navigation.path.at(-1);
    if (!id) return;
    const frame = frames.current.get(id);
    if (frame) positions.current.set(id, frame.scrollTop);
    if (document.activeElement instanceof HTMLElement && frame?.contains(document.activeElement)) {
      focusTargets.current.set(id, document.activeElement);
    }
  }

  const value: LearningContextValue = {
    navigation, snapshot, frames, positions, focusTargets, returnFocus,
    openConcept(id, trigger) {
      if (!getConcept(id)) return;
      rememberCurrent();
      if (!navigation.path.length) { returnFocus.current = trigger; setSnapshot(null); }
      else focusTargets.current.set(navigation.path.at(-1)!, trigger);
      dispatch({ type: 'open', id });
    },
    openSnapshot(source, trigger) {
      const captured = copyMathSnapshot(source);
      rememberCurrent();
      if (!navigation.path.length) returnFocus.current = trigger;
      else focusTargets.current.set(navigation.path.at(-1)!, trigger);
      setSnapshot(captured);
      positions.current.set(captured.kind, 0);
      focusTargets.current.delete(captured.kind);
      dispatch({ type: 'open', id: captured.kind });
    },
    back() { rememberCurrent(); if (navigation.path.length <= 1) setSnapshot(null); dispatch({ type: 'back' }); },
    jump(index) { rememberCurrent(); dispatch({ type: 'jump', index }); },
    close() { rememberCurrent(); setSnapshot(null); dispatch({ type: 'close' }); },
  };
  return <LearningContext.Provider value={value}>{children}</LearningContext.Provider>;
}

export function useLearning() {
  const value = useContext(LearningContext);
  if (!value) throw new Error('LearningProvider is required');
  return value;
}

export function LearningActivity({ active, children }: { active: boolean; children: ReactNode }) {
  const parentActive = useContext(LearningActiveContext);
  return <LearningActiveContext.Provider value={parentActive && active}>{children}</LearningActiveContext.Provider>;
}

export function useLearningActive() { return useContext(LearningActiveContext); }

export function ConceptLink({ concept, children }: { concept: string; children?: ReactNode }) {
  const context = useContext(LearningContext);
  const entry = getConcept(concept);
  if (!context || !entry) return <span>{children ?? entry?.title ?? concept}</span>;
  return <button type="button" className="concept-link" aria-haspopup="dialog" title={`Разобрать понятие: ${entry.title}`} onClick={event => context.openConcept(concept, event.currentTarget)}>{children ?? entry.title}<span className="concept-link-mark" aria-hidden="true">↗</span></button>;
}

export function AnalyzeNumbers({ snapshot, children }: { snapshot: MathSnapshot; children?: ReactNode }) {
  const context = useContext(LearningContext);
  const [error, setError] = useState('');
  if (!context) return null;
  return <><button type="button" className="analyze-numbers" aria-label="Разобрать мои числа" aria-haspopup="dialog" title={`${snapshot.origin}: ${snapshot.detail}`} onClick={event => {
    try { context.openSnapshot(snapshot, event.currentTarget); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось разобрать эти числа.'); }
  }}>{children ?? 'Разобрать мои числа'} <span aria-hidden="true">↗</span></button>{error && <p role="alert">{error}</p>}</>;
}
