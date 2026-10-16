import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('gandiversity'), screenQuestion: "Один хороший образец — успех?", screenResult: "Почти постоянный G пропускает режим", screenTask: "Сравните два старта генератора" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
