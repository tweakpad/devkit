# @tweakpad/devkit

## 0.1.0

### Minor Changes

- 4d00ef1: Layer stacks: `addLayers()` adds a list of layers the user selects, reorders by dragging (the whole row or its grip), toggles and, when allowed, renames and removes. Every layer has an `enabled` state that dims its row when off, and `states` adds more, such as visible or locked; a state with an `icon` gets a toggle in each row, and one without is changed from code or a bar action. Rows have the height, padding and spacing of the pane's controls. A layer's `controls` build its own panel, shown while it is selected. `types` lets the user add layers from a menu, `allow` holds the application's rules for adding, moving, renaming and removing, and `header` and `footer` hold bindings, buttons, menus and the built-in add and remove actions. `on()` reports every change with its source, and the pane's history records the order, names, states and panel values, re-creating added layers on reload and restore.

### Patch Changes

- a28d921: Booleans bind to a switch by default. `view: 'checkbox'` keeps a checkbox.
- 4d00ef1: Buttons take an `icon`, shown before the title, and `iconOnly` shows just the icon with the title as its accessible name and tooltip.
- a28d921: Toggling a switch or checkbox and picking from a select now finish their edit: `finish` fires once per change, and version history records it, so `restore()` brings those values back too.
- 3dcef74: Vertical tabs always sit inside the pane: the `placement` option and the outside icon column, with the scroll gutters the pane reserved for it, are removed.
- 0bd7b0e: Ship the documentation: the pages under `docs/<section>/*.mdx` (Pane, Controls, Monitoring, History), in @tweakpad/ui's page format, and `@tweakpad/devkit/docs.json` with each page and its API Reference generated from the package's TypeScript declarations. Showcases and docs render in Storybook (`npm run storybook`).
- 4d00ef1: `TabsApi.on('select', listener)` reports the page the user picks.
- 360955e: Require `@tweakpad/ui` 0.4. Horizontal tabs fill the pane through the library's `full-width` option, vertical tab hints use the Tooltip `wrap` and `max-width` options, and the Tweakpad color picker gains the 0.4 layout with its color palette toggle.
