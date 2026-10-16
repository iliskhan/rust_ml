import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('rlpolicy'), screenQuestion: "Baseline изменит точное среднее?", screenResult: "Среднее прежнее; разброс изменился", screenTask: "Измените baseline и N" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
