export type GridMDP = { width: number; height: number; start: number; goal: number; pit: number; gamma: number; slip: number; stepReward: number; goalReward: number; pitReward: number };
export type Transition = { next: number; reward: number; probability: number; terminal: boolean };
export type QTable = number[][];
export const ACTION_NAMES = ['↑ вверх', '→ вправо', '↓ вниз', '← влево'];
export const ACTION_ARROWS = ['↑', '→', '↓', '←'];
export const DEFAULT_MDP: GridMDP = { width: 4, height: 3, start: 8, goal: 3, pit: 7, gamma: .9, slip: .1, stepReward: -.04, goalReward: 1, pitReward: -1 };
export function validateMDP(mdp: GridMDP) {
  if (!Number.isInteger(mdp.width) || !Number.isInteger(mdp.height) || mdp.width < 1 || mdp.height < 1 || mdp.width * mdp.height > 100) throw new RangeError('Размер мира от 1 до 100 клеток');
  const n = mdp.width * mdp.height;
  if ([mdp.start, mdp.goal, mdp.pit].some(s => !Number.isInteger(s) || s < 0 || s >= n) || mdp.goal === mdp.pit || mdp.start === mdp.goal || mdp.start === mdp.pit) throw new RangeError('Начало и два терминала должны быть разными клетками');
  if (!Number.isFinite(mdp.gamma) || mdp.gamma < 0 || mdp.gamma >= 1 || !Number.isFinite(mdp.slip) || mdp.slip < 0 || mdp.slip > 1 || [mdp.stepReward, mdp.goalReward, mdp.pitReward].some(x => !Number.isFinite(x))) throw new RangeError('Неверные параметры MDP');
}
export function isTerminal(mdp: GridMDP, state: number) { return state === mdp.goal || state === mdp.pit; }
export function transitions(mdp: GridMDP, state: number, action: number): Transition[] {
  validateMDP(mdp);
  if (!Number.isInteger(state) || state < 0 || state >= mdp.width * mdp.height || !Number.isInteger(action) || action < 0 || action > 3) throw new RangeError('Некорректные состояние или действие');
  if (isTerminal(mdp, state)) return [{ next: state, reward: 0, probability: 1, terminal: true }];
  const results: Transition[] = [];
  for (const [actual, probability] of [[action, 1 - mdp.slip], [(action + 1) % 4, mdp.slip / 2], [(action + 3) % 4, mdp.slip / 2]]) {
    if (!probability) continue;
    const x = state % mdp.width, y = Math.floor(state / mdp.width);
    const nx = Math.min(mdp.width - 1, Math.max(0, x + [0, 1, 0, -1][actual]));
    const ny = Math.min(mdp.height - 1, Math.max(0, y + [-1, 0, 1, 0][actual]));
    const next = ny * mdp.width + nx;
    const existing = results.find(t => t.next === next);
    if (existing) existing.probability += probability;
    else results.push({ next, probability, terminal: isTerminal(mdp, next), reward: next === mdp.goal ? mdp.goalReward : next === mdp.pit ? mdp.pitReward : mdp.stepReward });
  }
  return results;
}
export function actionValue(mdp: GridMDP, state: number, action: number, values: number[]) {
  if (values.length !== mdp.width * mdp.height || values.some(x => !Number.isFinite(x))) throw new RangeError('Нужна ценность каждой клетки');
  return transitions(mdp, state, action).reduce((sum, t) => sum + t.probability * (t.reward + (t.terminal ? 0 : mdp.gamma * values[t.next])), 0);
}
export function bellmanSweep(mdp: GridMDP, values: number[]) {
  const q = values.map((_, s) => [0, 1, 2, 3].map(a => actionValue(mdp, s, a, values)));
  const updated = q.map(row => Math.max(...row));
  return { values: updated, q, residual: Math.max(...updated.map((v, i) => Math.abs(v - values[i]))) };
}
export function valueIteration(mdp: GridMDP, tolerance = 1e-10, limit = 2000) {
  validateMDP(mdp);
  if (!(tolerance > 0) || !Number.isInteger(limit) || limit < 1 || limit > 10000) throw new RangeError('Некорректный предел итераций');
  let values = Array(mdp.width * mdp.height).fill(0) as number[], iterations = 0;
  for (; iterations < limit; iterations++) {
    const next = bellmanSweep(mdp, values); values = next.values;
    if (next.residual < tolerance) { iterations++; break; }
  }
  const check = bellmanSweep(mdp, values);
  return { values, q: check.q, residual: check.residual, iterations, converged: check.residual < tolerance };
}
export function zeroQ(mdp: GridMDP): QTable { validateMDP(mdp); return Array.from({ length: mdp.width * mdp.height }, () => [0, 0, 0, 0]); }
export function greedyAction(row: number[]) { return row.indexOf(Math.max(...row)); }
export function qUpdate(old: number, reward: number, nextMaximum: number, terminal: boolean, gamma: number, alpha: number) {
  if ([old, reward, nextMaximum, gamma, alpha].some(x => !Number.isFinite(x)) || gamma < 0 || gamma >= 1 || alpha < 0 || alpha > 1) throw new RangeError('Некорректное обновление Q');
  const target = reward + (terminal ? 0 : gamma * nextMaximum), error = target - old;
  return { target, error, updated: old + alpha * error };
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}
export function sampleTransition(mdp: GridMDP, state: number, action: number, uniform: number) {
  if (!Number.isFinite(uniform) || uniform < 0 || uniform >= 1) throw new RangeError('u должно быть в [0,1)');
  const choices = transitions(mdp, state, action);
  let cumulative = 0;
  for (const choice of choices) { cumulative += choice.probability; if (uniform < cumulative) return choice; }
  return choices[choices.length - 1];
}
export type QStep = { state: number; action: number; next: number; reward: number; terminal: boolean; exploratory: boolean; old: number; target: number; error: number; updated: number };
export type Episode = { steps: number; reward: number; discountedReturn: number; outcome: 'goal' | 'pit' | 'truncated'; path: number[]; last: QStep };
export function runQEpisode(mdp: GridMDP, q: QTable, alpha: number, epsilon: number, random: () => number, maxSteps = 80): { q: QTable; episode: Episode } {
  validateMDP(mdp);
  if (q.length !== mdp.width * mdp.height || q.some(row => row.length !== 4 || row.some(x => !Number.isFinite(x))) || !Number.isFinite(epsilon) || epsilon < 0 || epsilon > 1 || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 1000) throw new RangeError('Некорректные Q или параметры эпизода');
  const table = q.map(row => [...row]);
  let state = mdp.start, reward = 0, discountedReturn = 0, last: QStep | undefined;
  const path = [state];
  for (let step = 0; step < maxSteps; step++) {
    const exploratory = random() < epsilon;
    const best = Math.max(...table[state]), ties = table[state].flatMap((v, a) => v === best ? [a] : []);
    const action = exploratory ? Math.min(3, Math.floor(random() * 4)) : ties[Math.min(ties.length - 1, Math.floor(random() * ties.length))];
    const next = sampleTransition(mdp, state, action, random());
    const old = table[state][action], update = qUpdate(old, next.reward, Math.max(...table[next.next]), next.terminal, mdp.gamma, alpha);
    table[state][action] = update.updated;
    last = { state, action, next: next.next, reward: next.reward, terminal: next.terminal, exploratory, old, ...update };
    reward += next.reward; discountedReturn += mdp.gamma ** step * next.reward;
    state = next.next; path.push(state);
    if (next.terminal) return { q: table, episode: { steps: step + 1, reward, discountedReturn, outcome: state === mdp.goal ? 'goal' : 'pit', path, last } };
  }
  // Administrative time limit is not an MDP terminal: the final update above still bootstraps.
  return { q: table, episode: { steps: maxSteps, reward, discountedReturn, outcome: 'truncated', path, last: last! } };
}
export function policyGradientBandit(theta: number, rewards: [number, number], alpha: number) {
  if (![theta, ...rewards, alpha].every(Number.isFinite) || alpha < 0 || alpha > 2) throw new RangeError('Некорректные параметры policy gradient');
  const right = theta >= 0 ? 1 / (1 + Math.exp(-theta)) : Math.exp(theta) / (1 + Math.exp(theta));
  const expected = (1 - right) * rewards[0] + right * rewards[1];
  const gradient = right * (1 - right) * (rewards[1] - rewards[0]);
  return { right, expected, gradient, nextTheta: theta + alpha * gradient };
}
