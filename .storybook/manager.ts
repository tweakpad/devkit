import { addons } from 'storybook/manager-api';
import { create, themes } from 'storybook/theming';

// Storybook's own UI follows the device's color scheme, as the Docs pages do by default (the Theme
// toolbar's System). The area behind the preview frame shows until the preview paints, and
// Storybook draws it white in both themes: it takes the scheme the preview loads in.
const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
const theme = /(?:^|;)theme:(\w+)/.exec(
  new URLSearchParams(location.search).get('globals') ?? '',
)?.[1];
const previewDark = theme === 'dark' || (theme !== 'light' && systemDark);
addons.setConfig({
  theme: create({
    ...(systemDark ? themes.dark : themes.normal),
    brandTitle: 'Tweakpad devkit',
    fontCode: "'Cascadia Mono', ui-monospace, sfmono-regular, menlo, monaco, consolas, monospace",
    ...(previewDark ? { appPreviewBg: '#222325' } : {}),
  }),
});
