import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    // Keep one Lit runtime, including when @tweakpad/ui is linked locally for development.
    dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'],
  },
  server: {
    fs: { allow: [resolve(root, '..')] },
  },
  build: {
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    lib: {
      entry: { index: resolve(root, 'src/index.ts') },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['lit', /^lit\//, /^@lit\//, '@tweakpad/ui', /^@tweakpad\/ui\//],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
});
