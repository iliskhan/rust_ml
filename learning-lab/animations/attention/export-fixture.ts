import { writeFileSync } from 'node:fs';
import { attentionTrace, projectTokens, SMALL_INPUT, SMALL_PROJECTIONS } from '../../src/transformerMath.ts';

const options = { causal: true, scale: true, temperature: 1 };
const q = projectTokens(SMALL_INPUT, SMALL_PROJECTIONS.q);
const k = projectTokens(SMALL_INPUT, SMALL_PROJECTIONS.k);
const v = projectTokens(SMALL_INPUT, SMALL_PROJECTIONS.v);
const trace = attentionTrace(q, k, v, options);
const allowed = trace.scores.map(row => row.map(score => Number.isFinite(score)));
const fixture = {
  tokens: ['кот', 'ест', 'рыбу'],
  queryIndex: 1,
  input: SMALL_INPUT,
  projections: SMALL_PROJECTIONS,
  options: { ...options, padding: false },
  maskedScoreEncoding: 'null means -Infinity (forbidden key), never zero',
  allowed,
  trace: { ...trace, scores: trace.scores.map(row => row.map(score => Number.isFinite(score) ? score : null)) },
};
writeFileSync(new URL('./fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('Exported attention fixture from projectTokens + attentionTrace. Masked scores are null, with explicit allowed flags.');
