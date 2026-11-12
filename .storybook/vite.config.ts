import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname, '..');

// Storybook's own Vite configuration. The package's `vite.config.ts` builds the library (library
// mode, externals, preserved modules), which a Storybook build must not inherit.
export default defineConfig({
  resolve: {
    // Stories and documentation previews import the package as an application does; here it is
    // the source of the checkout.
    alias: { '@tweakpad/devkit': resolve(root, 'src/index.ts') },
    // Keep one Lit runtime, including when @tweakpad/ui is linked locally for development.
    dedupe: ['lit', 'lit-html', 'lit-element', '@lit/reactive-element'],
  },
  server: {
    fs: { allow: [resolve(root, '..')] },
  },
  build: {
    // @tweakpad/ui's CSS target: an older one lowers light-dark() and breaks scoped color schemes.
    cssTarget: ['chrome123', 'edge123', 'firefox120', 'safari17.5'],
  },
});
