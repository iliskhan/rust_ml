export const MAX_CONCEPT_DEPTH = 8;

export type LearningNavigation = {
  path: string[];
  visited: string[];
  message: string;
};

export type LearningAction =
  | { type: 'open'; id: string }
  | { type: 'back' }
  | { type: 'jump'; index: number }
  | { type: 'close' };

export const initialNavigation: LearningNavigation = { path: [], visited: [], message: '' };

// Keep visited concepts mounted after popping a branch: their experiments belong to the reader.
export function learningNavigation(state: LearningNavigation, action: LearningAction): LearningNavigation {
  if (action.type === 'close') return { ...state, path: [], message: '' };
  if (action.type === 'back') return { ...state, path: state.path.slice(0, -1), message: '' };
  if (action.type === 'jump') {
    if (action.index < 0 || action.index >= state.path.length || !Number.isInteger(action.index)) return state;
    return { ...state, path: state.path.slice(0, action.index + 1), message: '' };
  }
  const existing = state.path.indexOf(action.id);
  if (existing >= 0) {
    return { ...state, path: state.path.slice(0, existing + 1), message: existing === state.path.length - 1 ? 'Это понятие уже открыто.' : 'Вернулись к уже открытому понятию. Его настройки сохранены.' };
  }
  if (state.path.length >= MAX_CONCEPT_DEPTH) {
    return { ...state, message: `В одном пути можно открыть до ${MAX_CONCEPT_DEPTH} понятий. Вернитесь к любому шагу в пути и продолжите оттуда — настройки всех открытых экспериментов сохранятся.` };
  }
  return {
    path: [...state.path, action.id],
    visited: state.visited.includes(action.id) ? state.visited : [...state.visited, action.id],
    message: '',
  };
}
