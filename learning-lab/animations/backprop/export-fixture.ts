import { writeFileSync } from 'node:fs';
import { sharedGraph } from '../../src/math.ts';

const inputs = { x: 2, w: 3, target: 2 };
const fixture = { inputs, ...sharedGraph(inputs.x, inputs.w, inputs.target) };
writeFileSync(new URL('./fixture.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log('Exported backprop fixture from sharedGraph.');
