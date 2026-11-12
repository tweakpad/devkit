import { definePreview } from '@storybook/web-components-vite';
import addonDocs from '@storybook/addon-docs';
import { html } from 'lit';
import { ref } from 'lit/directives/ref.js';
import '@tweakpad/ui/styles.css';
import DocumentationPage from './docs-page.mdx';
import { ThemedDocsContainer } from './docs-container.mdx';
import { applyTheme, themePreference } from './docs-theme.js';
import './docs.css';
import { installPreviewModules, mountPreview } from '../scripts/docs/preview-runtime.mjs';
import type { DevkitDocPage } from '../stories/docs.js';
import { cleanUp, onCleanUp, previewDevkit, releasePanes } from '../stories/runtime.js';

/** Hosts whose hero is mounted, so a repeated ref callback does not mount it twice. */
const mountedHosts = new WeakSet<Element>();

// The scripts of documentation previews import the package as an application does; here they read
// the checkout's sources, with a `Pane` that is disposed with its preview.
const icons = import.meta.glob('/node_modules/@tweakpad/ui/dist/icons/*.js');
installPreviewModules(
  {
    '@tweakpad/devkit': () => Promise.resolve(previewDevkit),
    lit: () => import('lit'),
  },
  (name: string) =>
    icons[`/node_modules/@tweakpad/ui/dist/icons/${name}.js`]?.() as Promise<unknown>,
);

const preview = definePreview({
  addons: [addonDocs()],
  // Every story file gets a Docs page; opt out per story with `tags: ['!autodocs']`.
  tags: ['autodocs'],
  globalTypes: {
    theme: {
      description: 'Color scheme of the Docs pages and stories; System follows the device',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'system', title: 'System' },
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'system' },
  // What a story builds (panes, frame loops, timers) is torn down when Storybook re-renders it or
  // leaves it.
  beforeEach: (context) => () => cleanUp(context.id),
  decorators: [
    // A documented page's Default story is its main use case: it renders the page's hero, whose
    // code is the story's source.
    (story, context) => {
      const doc = (context.parameters.docs as { devkit?: DevkitDocPage } | undefined)?.devkit;
      const hero = doc?.page.hero;
      if (!hero || context.name !== 'Default') return story();
      return html`<div
        class="devkit-docs-preview"
        data-align=${hero.align ?? 'center'}
        data-devkit-preview
        ${ref((host) => {
          if (!host || mountedHosts.has(host)) return;
          mountedHosts.add(host);
          const mounted = mountPreview(host as HTMLElement, hero, releasePanes);
          onCleanUp(context.id, () => mounted.dispose());
        })}
      ></div>`;
    },
    // The Theme toolbar applies to the preview document. Last in the list, this decorator is the
    // outermost, so it runs for every story.
    (story, context) => {
      applyTheme(themePreference(context.globals));
      return story();
    },
  ],
  parameters: {
    options: {
      // Sidebar sections in reading order: the documentation pages, then the showcases.
      storySort: {
        order: [
          'Pane',
          ['Pane', 'Vertical tabs'],
          'Controls',
          ['Bindings', 'Buttons', 'Colors', 'Rows'],
          'Monitoring',
          ['Monitors', 'Graphs', 'Performance monitor'],
          'History',
          'Showcases',
          ['Playground', 'Vertical tabs', 'Graphs', 'Grouping', 'Stress'],
        ],
      },
    },
    docs: {
      page: DocumentationPage,
      // Every Docs page takes the Theme toolbar's scheme (System by default), Storybook's blocks
      // and the previews alike.
      container: ThemedDocsContainer,
      // Code samples are dark in both schemes, as every preview's source is.
      source: { format: false, dark: true },
    },
    layout: 'padded',
  },
});

export default preview;
