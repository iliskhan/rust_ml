import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('diffusiontraining'), screenQuestion: "Сеть знает реализованный ε?", screenResult: "MSE обучает предсказывать ε из xₜ,t", screenTask: "Сравните ошибку до и после обучения" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
