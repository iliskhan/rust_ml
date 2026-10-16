import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('gnndepth'), screenQuestion: "Переименование меняет ответ?", screenResult: "Разброс /√degree уменьшается", screenTask: "Сравните 0 и 30 смешиваний" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
