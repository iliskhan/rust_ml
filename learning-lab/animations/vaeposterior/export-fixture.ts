import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('vaeposterior'), screenQuestion: "Центр сдвинется вместе с ε?", screenResult: "ε выбирает z; μ и σ заданы энкодером", screenTask: "Измените ε; сравните μ и z" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
