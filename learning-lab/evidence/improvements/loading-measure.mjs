import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

// Run from learning-lab after `pnpm build --manifest`, in the same mode for both measurements.
const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const entry = Object.keys(manifest).find(key => manifest[key].isEntry);
const initial = new Set();
function visit(key) {
  if (initial.has(key)) return;
  initial.add(key);
  for (const dependency of manifest[key].imports ?? []) visit(dependency);
}
visit(entry);
const chunks = Object.entries(manifest).filter(([, item]) => item.file.endsWith('.js')).map(([key, item]) => {
  const bytes = readFileSync(`dist/${item.file}`);
  return { key, file: item.file, initial: initial.has(key), bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex'), imports: item.imports ?? [], dynamicImports: item.dynamicImports ?? [] };
});
const firstEntry = chunks.filter(chunk => chunk.initial).reduce((sum, chunk) => ({ bytes: sum.bytes + chunk.bytes, gzipBytes: sum.gzipBytes + chunk.gzipBytes }), { bytes: 0, gzipBytes: 0 });
const result = { measuredAt: new Date().toISOString(), mode: 'production; default env; base /; pnpm build --manifest', firstEntry, chunks };
writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(firstEntry));
