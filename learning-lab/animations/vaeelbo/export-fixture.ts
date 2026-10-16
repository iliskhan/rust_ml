import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('vaeelbo'), screenQuestion: "Один ε — это точный ELBO?", screenResult: "Среднее NLL + KL ≥ точное −log p(x)", screenTask: "Сравните один ε и точное среднее" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
