---
'@tweakpad/devkit': minor
---

Layer stacks: `addLayers()` adds a list of layers the user selects, reorders by dragging (the whole row or its grip), toggles and, when allowed, renames and removes. Every layer has an `enabled` state that dims its row when off, and `states` adds more, such as visible or locked; a state with an `icon` gets a toggle in each row, and one without is changed from code or a bar action. Rows have the height, padding and spacing of the pane's controls. A layer's `controls` build its own panel, shown while it is selected. `types` lets the user add layers from a menu, `allow` holds the application's rules for adding, moving, renaming and removing, and `header` and `footer` hold bindings, buttons, menus and the built-in add and remove actions. `on()` reports every change with its source, and the pane's history records the order, names, states and panel values, re-creating added layers on reload and restore.
