import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('rlbellman'), screenQuestion: "Нужны ли выборочные эпизоды?", screenResult: "Ценность цели распространяется назад", screenTask: "Сделайте два прохода Беллмана" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
