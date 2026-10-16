import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('rltransition'), screenQuestion: "Команда всегда исполняется точно?", screenResult: "Вероятности исходов суммируются в 1", screenTask: "Измените slip" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
