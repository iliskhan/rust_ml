import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('gnntraining'), screenQuestion: "Все метки входят в loss?", screenResult: "Учебные метки только A,C,D,F", screenTask: "Сделайте шаг и проверьте CE" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
