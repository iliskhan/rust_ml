import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('gnnadjacency'), screenQuestion: "Индекс узла — координата?", screenResult: "Признаки отдельно от схемы связей", screenTask: "Удалите ребро C—D" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
