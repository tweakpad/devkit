# Version history

A pane can keep versions of its control values, so a setup survives reloads and earlier setups
can be restored. History is off unless the `history` option is set; when it is off, nothing
listens and nothing touches storage.

```ts
const pane = new Pane({ title: 'Scene', history: true });
pane.addBinding(params, 'speed', { min: 0, max: 10 }); // gets its stored value, if any

pane.history!.advance('before lighting pass'); // freeze this setup, keep editing a copy
pane.history!.restore(1);                      // bring an earlier setup back
```

## How it works

- **The working version.** The last version takes every finished edit: a released drag, an
  Enter or blur in a text field, a pick, or `api.value = x`. Each edit updates the version's
  values and is logged with the value it replaced, so undo can later be built on the log.
- **Frozen versions.** `advance()` freezes the working version and continues in a copy of it.
  Frozen versions never change.
- **Sessions.** A session is the time between two reloads. Versions are made per session, never
  per edit:
  - `'manual'` (default): sessions keep adding to the same working version until `advance()`.
  - `'auto'`: when the page loads, the previous session becomes a version of its own.
- **No duplicates.** `advance()` returns the newest frozen version instead of making a new one
  when the values are the same. An auto reload makes a version only if the previous session
  edited something and ended on different values. Sessions without edits, with reverted edits,
  or that only gained new controls make no version.
- **Values only.** Folder, tab and pane UI state is not stored.

## Options

`history: true` uses all the defaults. `history: { ... }` sets any of them.

| `HistoryOptions` property | Type | Behavior |
| --- | --- | --- |
| `key` | `string` | Storage namespace, stored as `devkit:history:<key>`. Defaults to the pane title, else `'pane'`. Give panes with the same title different keys. |
| `storage` | `'local' \| 'memory' \| HistoryStorage` | Defaults to `'local'`. |
| `mode` | `'manual' \| 'auto'` | Defaults to `'manual'`. |
| `limit` | `number` | Frozen versions kept. The oldest go first. Defaults to 50. |
| `maxChanges` | `number` | Changes logged per version. The oldest go first. Defaults to 200. |

**Storage options:**

- **`'local'`** (`localStorage`) survives reloads. Where `localStorage` is blocked, such as in
  sandboxed frames or some private modes, the history falls back to memory with a warning.
- **`'memory'`** is ephemeral. It survives disposing and recreating a pane on the same page
  (HMR), but a reload loses it, so `'auto'` mode keeps a single version there.
- **Your own storage:** pass any synchronous `{ read(key), write(key, data), remove(key) }` as a
  `HistoryStorage`.

**Saving:**

- Writes happen at most every 500 ms. They are also flushed when the page is hidden or closed
  (`pagehide`, `visibilitychange`), on `history.save()` and on `pane.dispose()`.
- When storage is full, the history first drops the logs of frozen versions, then the older half
  of the frozen versions, and warns.
- Two tabs with the same key overwrite each other: the last write wins.

## Control identity

Values are stored by **path**: the folder and tab page names from the root, then the property key.
For example, `Lighting/Sun/intensity`.

- Names are escaped like a JSON pointer: `~` becomes `~0` and `/` becomes `~1`.
- Inline-row controls take the path of the row's container.
- **Stable names.** Set `id` on a binding, folder or tab page to use it instead of the key or
  title. Its stored values then survive renames, and two bindings of the same key in one
  container stay apart.
- **Duplicate paths.** Without an `id`, the later binding gets `#2`, `#3` and so on, in the order
  they are added, plus a one-time warning.
- **What is tracked.** Editable bindings only. Monitors and buttons are not tracked, and
  `history: false` on a binding leaves it out.

```ts
const sun = pane.addFolder({ title: 'Sun light', id: 'sun' });
sun.addBinding(light, 'intensity', { id: 'power' }); // path: sun/power
sun.addBinding(debug, 'seed', { history: false });   // never stored
```

## Loading when controls change

Loading is best effort and never fails because the controls changed. When a control is added,
its stored value is applied if it still fits, and otherwise the control keeps its code value.

- **No change event.** A stored value is applied without announcing a change, like a code
  default. The control first appears with it.
- **Late controls.** A control added later, after async setup or behind a condition, still gets
  its value.
- **Judged by value, not by control type.** A slider that became a number field keeps its value,
  and so does a pick that became a slider.

| Stored | Control | Result |
| --- | --- | --- |
| number | slider, number | Applied, clamped to the control's `min`/`max`. |
| boolean | checkbox, switch | Applied. |
| string | text | Applied. |
| color string | color | Applied when it parses as a color. `{r, g, b}` objects take `#rrggbb` only. |
| pick | select | Matched by value first, then by label, so renumbered options still match. |
| anything else | any | Skipped: the control keeps its code value. |

- **Renamed or removed controls.** Their stored values are kept but never applied. A control
  that comes back under the same path gets its value again. `prune()` drops values that no
  control has now.
- **Version records.** The working version records every tracked control's value, so a frozen
  version is a whole setup, not just the edited fields.

## The `pane.history` handle

`pane.history` is a `HistoryApi`, or `null` when the option is off.

| Member | Behavior |
| --- | --- |
| `versions` | All versions, oldest first. The last one is the working version. |
| `current` | The working version. |
| `version(id)` | One version, or `undefined`. |
| `advance(label?)` | Freezes the working version and returns it. Returns the newest frozen version instead when the values are identical. |
| `restore(id)` | Applies a version's values to the controls, announcing each change so your app reacts, and records them in the working version as one group. |
| `rename(id, label)` | Sets a version's label. |
| `delete(id)` | Deletes a frozen version. |
| `diff(from, to?)` | `{ added, removed, changed }` between two versions. `to` defaults to the working version. |
| `export()` | The whole history as a JSON-safe `HistoryDocument`. |
| `import(doc)` | Replaces the history with a document or its JSON text, and applies its working version. |
| `prune()` | Drops stored values without a control. Returns how many. |
| `clear()` | Drops every version. A new working version starts from the controls' values. |
| `save()` | Writes pending changes now. |
| `enabled` | While `false`, edits are neither recorded nor saved. |
| `on('change', fn)` | One finished edit or restored value: `{ path, from?, to, at, source, group? }`. |
| `on('version', fn)` | The version list or a label changed. |
| `key`, `mode` | The storage key and mode in use. |

`HistoryVersion` is `{ id, label?, created, updated, frozen, values, changes }`. Times are epoch
milliseconds. `values` maps paths to plain values. A pick whose value is not a JSON primitive is
reported by its label.

## Stored format

```json
{
  "format": 1,
  "versions": [
    {
      "id": 1, "label": "before lighting pass", "created": 1762870000000, "updated": 1762870100000,
      "frozen": true,
      "values": { "sun/power": 3, "Quality": { "v": "high", "l": "High" } },
      "changes": [{ "p": "sun/power", "f": 1, "t": 3, "at": 1762870100000 }]
    }
  ]
}
```

**Values:** a value is a JSON primitive. A pick is stored as `{ v, l }`: its value, or `null` when
the value is not a JSON primitive, plus its label.

**Changes:** a change is `{ p: path, f?: from, t: to, at }`. Restored values add
`s: 'restore'` and a shared group number `g`.

**Reading stored data is lenient:**

- Text that is not valid JSON starts a new history.
- Malformed versions, values and changes are dropped one by one.
- A history written by a newer devkit (a higher `format`) is left untouched. The session then
  runs without saving, so newer data is never overwritten.

`HistoryApi` and the `History*`/`Stored*` types are exported from `@tweakpad/devkit`.
