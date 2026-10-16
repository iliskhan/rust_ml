import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('ganobjectives'), screenQuestion: "Где сильнее сигнал при logit −5?", screenResult: "Non-sat даёт больший сигнал у −5", screenTask: "Передвиньте logit к нулю" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
