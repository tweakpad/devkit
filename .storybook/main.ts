import { unwatchFile, watchFile } from 'node:fs';
import { resolve } from 'node:path';
import type { StorybookConfig } from '@storybook/web-components-vite';
import { literalCode } from '@tweakpad/ui/docs/vite';
import type { Plugin } from 'vite';
import remarkGfm from 'remark-gfm';

/**
 * The Docs pages read their pages and API Reference from `dist/docs.json`, and their type cards
 * from `dist/api-types.json`, which `npm run docs:build` rewrites while Storybook runs: reload the
 * pages with the new data. As in @tweakpad/ui's Storybook.
 */
const docsReload = (): Plugin => ({
  name: 'devkit-docs-reload',
  configureServer(server) {
    const files = ['docs.json', 'api-types.json'].map((name) =>
      resolve(import.meta.dirname, '../dist', name),
    );
    // Polled, not Vite's watcher: that one never reports `dist/`, and `npm run build` deletes and
    // recreates it. The type cards' loader globs its file, so it is invalidated too.
    const loaders = [resolve(import.meta.dirname, 'docs-types.ts')];
    const reload = (file: string) => {
      for (const path of [file, ...loaders])
        for (const module of server.moduleGraph.getModulesByFile(path) ?? [])
          server.moduleGraph.invalidateModule(module);
      server.ws.send({ type: 'full-reload' });
    };
    for (const file of files)
      watchFile(file, { interval: 500 }, (now, before) => {
        if (now.mtimeMs !== before.mtimeMs) reload(file);
      });
    server.httpServer?.once('close', () => {
      for (const file of files) unwatchFile(file);
    });
  },
});

const config: StorybookConfig = {
  // One story file per documentation page (`stories/<section>/<slug>.stories.ts`), plus the
  // canvas-only showcases.
  stories: ['../stories/**/*.stories.ts'],
  addons: [
    {
      name: '@storybook/addon-docs',
      // The documentation pages write their Keyboard tables in Markdown.
      options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: [remarkGfm] } } },
    },
  ],
  framework: {
    name: '@storybook/web-components-vite',
    options: { builder: { viteConfigPath: '.storybook/vite.config.ts' } },
  },
  // Before any script loads, the preview takes the Theme toolbar's scheme (the `theme` global in
  // its URL, else the device), so the page and Storybook's loading screens, which are white by
  // default, do not flash light in the dark scheme. As in @tweakpad/ui's Storybook.
  previewHead: (head) => `${head}
    <script>
      (() => {
        const theme = /(?:^|;)theme:(\\w+)/.exec(new URLSearchParams(location.search).get('globals') ?? '')?.[1];
        const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
        document.documentElement.dataset.sbScheme = dark ? 'dark' : 'light';
      })();
    </script>
    <style>
      html[data-sb-scheme='dark'] :is(.sb-preparing-docs, .sb-preparing-story) {
        background-color: #222325;
      }
      html[data-sb-scheme='dark'] .sb-loader {
        border-color: rgb(255 255 255 / 15%);
        border-top-color: rgb(255 255 255 / 50%);
      }
      html[data-sb-scheme='dark'] :is(.sb-previewBlock, .sb-argstableBlock-body td) {
        background: #1b1c1d;
        border-color: rgb(255 255 255 / 10%);
      }
    </style>`,
  // The documentation pages' example code keeps its indentation through MDX when the literal
  // plugin runs before Storybook's MDX plugin; both run early, so it goes first in the list.
  viteFinal: (config) => ({
    ...config,
    plugins: [literalCode({ frontmatter: 'strip' }), docsReload(), ...(config.plugins ?? [])],
  }),
};

export default config;
