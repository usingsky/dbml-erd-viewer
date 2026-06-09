import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

// External packages: peers plus heavy runtime deps consumers should dedupe.
// CSS imports (e.g. @xyflow/react's stylesheet) are always bundled into our css.
const externalPatterns = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^@xyflow\/react($|\/)/,
  /^@dbml\/core($|\/)/,
  /^@dagrejs\/dagre($|\/)/, // optional peer dep, dynamically imported
  /^elkjs($|\/)/, //          optional peer dep, dynamically imported
  /^html-to-image($|\/)/, //  optional peer dep, dynamically imported
];
const external = (id: string) => !id.endsWith('.css') && externalPatterns.some((re) => re.test(id));

export default defineConfig({
  plugins: [
    react(),
    // bundleTypes rolls all declarations into a single dist/index.d.ts (via api-extractor).
    // tsconfig.build.json sets rootDir: 'src' so the entry lands at dist/index.d.ts.
    dts({ include: ['src'], bundleTypes: true, tsconfigPath: './tsconfig.build.json' }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'DbmlErdViewer',
      fileName: 'dbml-erd-viewer',
      formats: ['es', 'umd'],
    },
    // Vite 8 bundles with Rolldown; `rolldownOptions` is the current key
    // (`rollupOptions` is a deprecated alias).
    rolldownOptions: {
      external,
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'jsxRuntime',
          '@xyflow/react': 'XYFlowReact',
          '@dbml/core': 'DbmlCore',
        },
      },
    },
  },
});
