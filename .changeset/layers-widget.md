---
'@tweakpad/devkit': patch
---

Layer stacks are built on the library's Layers widget (`tp-layers`, `@tweakpad/ui` 0.5.1). The stack keeps its typed states, panels, types, rules, bars and history, and gains the widget's interactions: several layers can be selected with Shift and Control or Command (`LayersApi.selection`, and `selection` on the `select` event), Delete and the `remove` action remove the whole selection, Alt+Arrow keys move it, and a dragged selection moves together. New options: `drop: 'displace'`, `empty`, and a state's `scope: 'selection'`.

Breaking: a layer's `enabled: false` now freezes it as the widget does (dimmed, and not selectable, movable, renamable or removable), replacing the separate `disabled` option and `LayerApi.disabled`, which are removed. A state without `offIcon` shows its control only while on, and faded on hover while off. `TweakLayerRow` and `TweakLayerStates` are removed, and devkit no longer registers `tp-drag-drop-list` or `tp-toggle`.
