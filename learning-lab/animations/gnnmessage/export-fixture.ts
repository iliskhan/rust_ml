import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('gnnmessage'), screenQuestion: "Нужны степени обоих концов?", screenResult: "Каждый сосед даёт взвешенный вклад", screenTask: "Выключите self-loop" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
