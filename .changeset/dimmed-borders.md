---
'@tweakpad/devkit': patch
---

Every line devkit draws (the pane's edge, the line under its title bar, folder guides, the vertical tab group's outline and layer stack dividers) uses the new `--tweak-border-color`, the library's border dimmed to 25%, so the pane groups its controls without boxing them in. Separators follow it through `--tweak-separator-color`.
