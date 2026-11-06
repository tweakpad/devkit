# Inline row API

`Pane`, `FolderApi`, and `TabPageApi` support `addRow({ items, ...options })`. A row composes
supported controls using declarative configuration; it owns layout, visibility, search,
disabled state and disposal. Item declarations use the existing binding, monitor and button
APIs. No custom DOM, CSS or search registration is needed.

## Slider with Reset

```ts
const speed = pane.addRow({
  name: 'speed-control',
  items: [
    { type: 'binding', target: params, key: 'speed', label: 'Speed', min: 0, max: 4, step: 0.01 },
    { type: 'button', title: 'Reset', width: 'auto', onClick: () => { params.speed = 0.6; } },
  ],
});

speed.items[0].value = 1.2;           // BindingApi<number>
speed.items[1].title = 'Reset speed'; // ButtonApi
```

The binding uses the available space and Reset uses its intrinsic width. Writes, proposals,
change listeners, refresh scheduling and lazy mounting use the same binding implementation
as `addBinding`. Use `refresh: 'frame'` on the pane (the default) for controls to follow object
mutations automatically, or call the binding handle's `refresh()` in manual mode.

## Two inline buttons

```ts
const playback = pane.addRow({
  name: 'playback',
  items: [
    { type: 'button', title: 'Pause', onClick: () => { params.paused = true; } },
    { type: 'button', title: 'Resume', onClick: () => { params.paused = false; } },
  ],
});
playback.items[1].disabled = true;
```

Both examples use the same row primitive. A row may mix sliders, inputs, selects, checkboxes,
switches, colors, monitors and buttons in any order. Binding controls are inferred from the
value and options, or selected with `view`, exactly as in `addBinding`.

## Configuration

| `InlineRowParams` property | Behavior |
| --- | --- |
| `items` | Required readonly array of item declarations, in display order. Must contain at least one item. |
| `name` | Optional stable searchable identity for the complete row. |
| `label` | Optional additional search label; it does not add visible chrome. |
| `hidden` | Defaults to `false`. Hides the complete composition without overwriting individual item flags. |
| `disabled` | Defaults to `false`. Disables editable items without overwriting their individual disabled flags. |

Each item declares `type` and accepts these fields:

| `type` | Fields | Returned item handle |
| --- | --- | --- |
| `'binding'` | `target`, `key`, and all `BindingParams` fields, flattened into the declaration | `BindingApi<Target[Key]>` |
| `'monitor'` | `target`, `key`, and all `MonitorParams` fields, flattened into the declaration | `MonitorApi` |
| `'button'` | All `ButtonParams` fields, including required `title` and `onClick` | `ButtonApi` |

Every item also accepts `width`. A positive finite number specifies its relative share of
remaining space (default `1`). `'auto'` uses the item's intrinsic width, useful for auxiliary
actions such as Reset. Items share the pane's standard spacing. Structural folders and tabs
remain containers outside inline rows.

Invalid empty rows, nonpositive/nonfinite width shares, and missing target keys throw before
adding a row. TypeScript checks each key against its target and preserves the item handle tuple.
The item list is fixed at creation; replace a row by disposing it and declaring another.

## Handle and lifecycle

`InlineRowApi` exposes readonly `items` (handles in declaration order), readonly `element`
(the complete visibility shell), writable `hidden` and `disabled`, and `dispose()`.
The item handles are the same APIs returned by individual `addBinding`, `addMonitor`, and
`addButton` calls, including change subscriptions, refresh and disposal where applicable.

Disabling a row composes with each item's authored disabled flag. Re-enabling it preserves
individually disabled items, including changes made while the row was disabled. Monitors
remain read-only. Hiding a row preserves item flags and stops visible binding/monitor work;
normal scheduling resumes when it becomes visible. If all items are hidden or disposed,
the row removes its empty surface. Row disposal releases every item's resources and callbacks;
container disposal also disposes rows.

## Search ownership

A row is one atomic composition. Its explicit name/label and every eligible item's authored
name/label participate in matching. A match on any item retains the complete row: searching
for Speed or Reset keeps the slider and its Reset action together. Search never matches live
values, scrapes DOM text, or mounts controls to determine a result. Explicitly hidden or
disposed items do not supply search terms. An empty row contributes zero results.

To search controls independently, declare separate rows/controls. Search preserves the selected
tab and folder expansion, and hides empty parent panels using eligible composition counts.

Exports: `InlineRowApi`, `InlineRowParams`, `InlineItem`, `InlineBindingItem`,
`InlineMonitorItem`, and `InlineButtonItem` from `@tweakpad/devkit`.
