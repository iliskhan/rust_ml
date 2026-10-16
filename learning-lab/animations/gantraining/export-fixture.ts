import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('gantraining'), screenQuestion: "Шаг D меняет веса G?", screenResult: "D обновляется отдельно от G", screenTask: "Выполните D, затем G" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
