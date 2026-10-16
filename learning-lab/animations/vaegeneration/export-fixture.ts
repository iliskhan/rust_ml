import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('vaegeneration'), screenQuestion: "Нужен вход x для генерации?", screenResult: "Prior → decoder → среднее наблюдения", screenTask: "Измените prior z и шум наблюдения" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
