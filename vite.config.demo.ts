import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// App build for the GitHub Pages playground (NOT the library build). Bundles everything —
// including the optional deps (dagre/elk/html-to-image) — so every feature works on the
// static page. `base` matches the project Pages path: https://usingsky.github.io/dbml-erd-viewer/
export default defineConfig({
  base: '/dbml-erd-viewer/',
  plugins: [react()],
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
  },
});
