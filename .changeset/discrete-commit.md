---
'@tweakpad/devkit': patch
---

Toggling a switch or checkbox and picking from a select now finish their edit: `finish` fires once per change, and version history records it, so `restore()` brings those values back too.
