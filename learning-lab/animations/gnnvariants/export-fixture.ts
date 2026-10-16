import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('gnnvariants'), screenQuestion: "Нулевые scores дают равные веса?", screenResult: "GAT: softmax; SAGE: concat и mean", screenTask: "Обнулите веса attention scores" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
