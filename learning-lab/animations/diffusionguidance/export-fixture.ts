import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('diffusionguidance'), screenQuestion: "Что получается при s=1?", screenResult: "При s=1 получаем условный прогноз", screenTask: "Сравните s=0,1,2" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
