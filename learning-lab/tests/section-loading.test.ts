import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('a failed section keeps a reload recovery path and does not clear storage', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false } });
  const originalWindow = globalThis.window;
  let reloads = 0;
  try {
    const { SectionBoundary, SectionLoadError } = await server.ssrLoadModule('/src/SectionBoundary.tsx');
    const boundary = new SectionBoundary({ title: 'Нейрон', children: createElement('p', null, 'lesson') });
    assert.match(renderToStaticMarkup(boundary.render()), /lesson/);
    boundary.state = SectionBoundary.getDerivedStateFromError(new Error('chunk unavailable'));
    const error = renderToStaticMarkup(boundary.render());
    assert.match(error, /role="alert"/);
    assert.match(error, /Обновить страницу и повторить/);
    assert.match(error, /Сохранённые черновики и прогресс останутся/);
    assert.match(error, /Настройки опытов.*сбросятся/);
    globalThis.window = { location: { reload: () => reloads++ } } as unknown as Window & typeof globalThis;
    const panel = SectionLoadError({ title: 'Нейрон' });
    panel.props.children.at(-1).props.onClick();
    assert.equal(reloads, 1);
    const closedExplorer = new SectionBoundary({ title: 'Понятие', children: null, fallback: null });
    closedExplorer.state = { failed: true };
    assert.equal(closedExplorer.render(), null);
  } finally { globalThis.window = originalWindow; await server.close(); }
});
