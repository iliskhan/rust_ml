import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('rlqlearning'), screenQuestion: "Лимит времени — терминал?", screenResult: "Только терминал обнуляет bootstrap", screenTask: "Сравните terminal=false и true" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
