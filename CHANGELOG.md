# @tweakpad/devkit

## 0.0.3

### Patch Changes

- a4a06b7: Every line devkit draws (the pane's edge, the line under its title bar, folder guides, the vertical tab group's outline and layer stack dividers) uses the new `--tweak-border-color`, the library's border dimmed to 25%, so the pane groups its controls without boxing them in. Separators follow it through `--tweak-separator-color`.
- 06b934f: Layer stacks are built on the library's Layers widget (`tp-layers`, `@tweakpad/ui` 0.5.2). The stack keeps its typed states, panels, types, rules, bars and history, and gains the widget's interactions: several layers can be selected with Shift and Control or Command (`LayersApi.selection`, and `selection` on the `select` event), Delete and the `remove` action remove the whole selection, Alt+Arrow keys move it, and a dragged selection moves together. New options: `drop: 'displace'`, `empty`, and a state's `scope: 'selection'`.

  Breaking: a layer's `enabled: false` now freezes it as the widget does (dimmed, and not selectable, movable, renamable or removable), replacing the separate `disabled` option and `LayerApi.disabled`, which are removed. A state without `offIcon` shows its control only while on, and faded on hover while off. `TweakLayerRow` and `TweakLayerStates` are removed, and devkit no longer registers `tp-drag-drop-list` or `tp-toggle`.

- a4a06b7: Separators: `addSeparator()` draws the library's Separator between rows, as a faint rule at half the width, centered, with section spacing around it, on panes, folders, tab pages and layer panels; it hides while the pane is searched.

## 0.0.2

### Patch Changes

- a28d921: Booleans bind to a switch by default. `view: 'checkbox'` keeps a checkbox.
- 4d00ef1: Buttons take an `icon`, shown before the title, and `iconOnly` shows just the icon with the title as its accessible name and tooltip.
- a28d921: Toggling a switch or checkbox and picking from a select now finish their edit: `finish` fires once per change, and version history records it, so `restore()` brings those values back too.
- 3dcef74: Vertical tabs always sit inside the pane: the `placement` option and the outside icon column, with the scroll gutters the pane reserved for it, are removed.
- 4d00ef1: Layer stacks: `addLayers()` adds a list of layers the user selects, reorders by dragging (the whole row or its grip), toggles and, when allowed, renames and removes. Every layer has an `enabled` state that dims its row when off, and `states` adds more, such as visible or locked; a state with an `icon` gets a toggle in each row, and one without is changed from code or a bar action. Rows have the height, padding and spacing of the pane's controls. A layer's `controls` build its own panel, shown while it is selected. `types` lets the user add layers from a menu, `allow` holds the application's rules for adding, moving, renaming and removing, and `header` and `footer` hold bindings, buttons, menus and the built-in add and remove actions. `on()` reports every change with its source, and the pane's history records the order, names, states and panel values, re-creating added layers on reload and restore.
- 0bd7b0e: Ship the documentation: the pages under `docs/<section>/*.mdx` (Pane, Controls, Monitoring, History), in @tweakpad/ui's page format, and `@tweakpad/devkit/docs.json` with each page and its API Reference generated from the package's TypeScript declarations. Showcases and docs render in Storybook (`npm run storybook`).
- 4d00ef1: `TabsApi.on('select', listener)` reports the page the user picks.
- 360955e: Require `@tweakpad/ui` 0.4. Horizontal tabs fill the pane through the library's `full-width` option, vertical tab hints use the Tooltip `wrap` and `max-width` options, and the Tweakpad color picker gains the 0.4 layout with its color palette toggle.
