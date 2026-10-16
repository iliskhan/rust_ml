import { writeFileSync } from 'node:fs';
import { buildFixture } from '../vaeposterior/catalog.ts';
const fixture = { ...buildFixture('diffusionsampling'), screenQuestion: "DDIM — это DDPM без шума?", screenResult: "Другая формула; можно пропускать t", screenTask: "Сравните 64 и 16 вызовов" };
writeFileSync(new URL('./fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
