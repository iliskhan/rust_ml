import { defineConfig } from 'vite';

export default defineConfig({
  // Project Pages uses /rust_ml/; local preview and root hosts use /.
  base: process.env.VITE_BASE_PATH || '/',
});
