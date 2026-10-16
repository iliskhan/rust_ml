import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('diffusionreverse'), screenQuestion: "z=0 отменит обратный шаг?", screenResult: "Следующее x = среднее + шум шага", screenTask: "Измените z при прежнем прогнозе" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
