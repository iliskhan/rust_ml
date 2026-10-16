import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('ganforward'), screenQuestion: "Прямой проход меняет веса?", screenResult: "Две сети: G создаёт, D оценивает", screenTask: "Поменяйте z без обучения" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
