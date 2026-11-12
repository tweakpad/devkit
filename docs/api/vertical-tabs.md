# Vertical icon tabs

Use `orientation: 'vertical'` with `addTabs()` to place an icon column along one edge of the group, inside the pane. Each page requires a library `IconDefinition` and a title. Optional `color` applies to the icon only; `hint` defaults to the title and opens toward the pane interior on hover or focus.

```ts
import { sunIcon } from '@tweakpad/ui/icons/sun';

const tabs = pane.addTabs({
  orientation: 'vertical',
  side: 'auto',
  pages: [{ title: 'Lighting', icon: sunIcon, color: '#fbbf24' }],
});
tabs.pages[0].addBinding(settings, 'enabled');
tabs.selected = 0;
```

`side` accepts `'auto'` (default), `'left'`, or `'right'`. Auto places the icons on the left of right-anchored panes and on the right of left-anchored panes. Embedded panes use left unless configured with a left anchor or an explicit side.

The icon column takes its width from the group's content area. The selected tab connects to a shared content surface with the active page title; only icon artwork receives the configured color.

Vertical groups can be added only directly to the pane root. They stack independently alongside shared controls and monitors. Their pages can contain sections and horizontal tabs, but sections and tab pages cannot create vertical groups; the API rejects those placements.

Icons, surface fill, border, and controls share the pane's native scroll viewport; no fixed overlays or scroll-position updates are used. Icons scroll with their group and disappear when the pane is collapsed. Reopening preserves selection. Groups reserve enough height for all their icons.

Horizontal tabs keep their existing API and layout. Try `/demo/vertical-tabs.html` for stacked groups, horizontal tabs within pages, pane collapse, and a button to flip the pane edge.

The preview has a constrained pane height and additional layer/channel controls to exercise scrolling.
