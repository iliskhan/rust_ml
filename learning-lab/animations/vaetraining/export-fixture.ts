import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('vaetraining'), screenQuestion: "Обновится только decoder?", screenResult: "Градиент меняет все шесть параметров", screenTask: "Выполните один шаг обучения" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
