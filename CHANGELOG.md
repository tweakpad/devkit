# @tweakpad/devkit

## 0.0.5

### Patch Changes

- 5f5ba9e: Graphs no longer clip their lines at the top and bottom edges: a value at a series' bound keeps its whole stroke inside the plot, in graphs, monitor graphs and the performance monitor.
- da7d334: Stats: `addStats()` adds a condensed block of live values in titled groups, for many numbers at a glance.

  - **Fitting:** values always come first. Each column shows its labels while two thirds of them show at least two thirds of their text beside their own value, so one long label or value fades instead of hiding the others; otherwise the column hides its labels and moves its values to its start, never mixing the two. Groups sit side by side in as many columns as have room for their labels, and stack into fewer as the block narrows, never going back to side by side at a narrower width; values are cut only when nothing else is left. Each column decides in CSS, from one width worked out once per column. A label not shown in full shows on hover (a tooltip shows only labels, never values) and stays readable to screen readers. With labels hidden, the block is one tab stop with arrow keys between values, and values align to the start of their column.
  - **Guides:** a titled group's stats hang from a guide line drawn as a folder's, with a dot level with each label (`guides: false` leaves it out).
  - **Values:** a stat can show several values (`parts`) with formats (`number`, `integer`, `compact`, `bytes`, `percent` or a function) and units.
  - **Change chevrons:** `trend` takes a preset (`'ticker'`, `'steady'`, `'flash'`, `'tint'`) or options, which can start from one (`{ preset: 'steady', better: 'lower' }`). It shows the direction of change, green up and red down as a ticker does (`'lower'` swaps the colors), after the value (`side: 'start'` puts it before), as an arrow by default (`icon: 'arrow-diagonal'`, `'chevron'` or `'triangle'` for the others, `false` for none); `color` colors the value too, or alone, held in step with the icon or as a flash on each change; `fade` fades them in and out; the colors are the library's success and destructive tokens; values in the same group keep its slot, so they line up. It counts in samples: by default it follows every change and clears when a sample brings none; `samples` compares averages of the last readings and shows a chevron only when their difference stands out from the readings' own noise (`deviations` standard errors, 3 by default), so noise shows none and more samples steady it further; `threshold` (a number or a percentage) hides changes too small to matter. The value always shows at once.
  - **Monitors:** text monitors take the same option, `monitor: { trend }`.
  - **Matrix layout:** `layout: 'matrix'` writes shared labels once, as rows, with a column for each group.
  - **Sampling:** values are read a few times a second, and only while the block is visible. Each value keeps room for its widest text, so the layout never jitters, and a changed value lays out only its own box.

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
