import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('diffusionforward'), screenQuestion: "Есть ли шум при t=0?", screenResult: "Шум расширяет плотность всех данных", screenTask: "Меняйте ε при фиксированном t" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
