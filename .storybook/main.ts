import type { StorybookConfig } from '@storybook/web-components-vite';
import { literalCode } from '@tweakpad/ui/docs/vite';
import remarkGfm from 'remark-gfm';

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
    plugins: [literalCode({ frontmatter: 'strip' }), ...(config.plugins ?? [])],
  }),
};

export default config;
