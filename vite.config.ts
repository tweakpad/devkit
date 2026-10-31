import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    // @tweakpad/ui is linked from ../library, which carries its own node_modules/lit.
    // A second Lit copy would break element upgrades and double the runtime, so force one.
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
