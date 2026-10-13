import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

// Test-only production server; optional one-shot 503 verifies the real lazy recovery UI.
const root = resolve('dist');
let failOnce = process.argv.find(arg => arg.startsWith('--fail-once='))?.split('=')[1];
createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  if (failOnce && pathname.includes(failOnce) && pathname.endsWith('.js')) {
    console.log(`One-shot failure: ${pathname}`);
    failOnce = undefined;
    response.writeHead(503, { 'Cache-Control': 'no-store' }).end('Test-only chunk load failure');
    return;
  }
  try {
    const bytes = readFileSync(file);
    response.writeHead(200, { 'Content-Type': ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
}).listen(6971, '127.0.0.1', () => console.log(`Production preview :6971; fail once: ${failOnce ?? 'none'}`));
