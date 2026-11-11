# Monitoring through bindings

A monitor is a passive control view selected on a normal binding. It uses `addBinding`,
`BindingParams`, `BindingApi`, `type: 'binding'` in inline rows, and the same search,
visibility, refresh, scheduling and disposal lifecycle as every other binding control.

```ts
pane.addBinding(stats, 'fps', {
  view: 'monitor',
  monitor: { view: 'graph', bufferSize: 64 },
  min: 0,
  max: 144,
  precision: 0,
  interval: 32,
});

const frameTime = pane.addBinding(stats, 'frameMs', {
  view: 'monitor', // Text display is the default monitor presentation.
  precision: 2,
  interval: 100,
});

pane.addRow({
  items: [
    { type: 'binding', target: stats, key: 'frameMs', view: 'monitor', precision: 2 },
    {
      type: 'button',
      title: 'Reset',
      width: 'auto',
      onClick: () => {
        stats.frameMs = 0;
      },
    },
  ],
});
```

## Configuration

Set `BindingParams.view` to `'monitor'`. The optional `monitor` field accepts
`MonitorOptions`:

| Option               | Behavior                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `monitor.view`       | `'text'` (default) displays the value; `'graph'` displays numeric history and its current value.                               |
| `monitor.bufferSize` | Graph history capacity; default 64 samples, minimum capacity 2.                                                                |
| `monitor.color`      | Graph line color, any CSS color; default `--tp-chart-1`.                                                                       |
| `monitor.fill`       | Area under the line: `true` (default, 0.15 opacity), an opacity, or `false`.                                                   |
| `monitor.guides`     | Dashed lines in the binding's units, e.g. `[{ value: 0.8 }]`, or `[{ value: 'average' }]` for the mean of the visible history. |
| `monitor.scale`      | How omitted `min`/`max` fit the data: `'absolute'` (default, includes zero) or `'relative'` (hugs the data).                   |

Use the ordinary binding options for everything else: `label`, `precision` (default 2 for
monitor views), `interval`, `min`, `max`, `hidden` and `disabled`. Text accepts any property
value; graph requires a number. `min` and `max` set the graph range. Omitted bounds fit the
visible history with headroom and change only when the data leaves the range or uses less than
a third of it, so the plot paints incrementally between refits. Number text uses fixed decimal precision; other values
are displayed as text, with an em dash for null/undefined.

`interval` follows the pane's normal binding refresh policy unless explicitly supplied:
frame refresh samples every frame, a numeric interval samples at that cadence, and manual
refresh samples only through the binding's `refresh()` or programmatic writes. Graph
bindings retain equal-valued samples, so a constant value draws a flat history line.
A line requires at least two samples. History is a bounded ring buffer.

## The same binding contract

The return value is `BindingApi<Target[Key]>`. It provides `value`, `refresh()`,
`on('change' | 'finish', listener)`, `hidden`, `disabled`, `element`, `kind` and `dispose()`.
`kind` is `'monitor'`. The view has no user editor and refuses user proposals; application
writes through the handle's `value` still update the original property and use the same
coalesced change/finish events as other binding controls. Automatic source sampling refreshes
the display without synthesizing user change events.

The normal Binding is the only sampler. Monitor renderers receive values through the shared
control-view `write()` lifecycle; they do not read targets, register extra samplers, or run
independent loops. Hidden, collapsed, inactive-tab and off-screen controls stop automatic
sampling. Graph history belongs to the binding's view, not to the mounted element: lazy unmounting
releases the plot, and a remounted graph redraws the retained history. Graphs are drawn by
`<tp-plot>` from `@tweakpad/ui`, the same renderer as [graphs](graphs.md). Disposing a binding
releases its renderer.
Explicit `refresh()` remains available in manual mode, including while a mounted control is hidden.

Monitor bindings do not calculate FPS or any other application metric; they present the
values the application supplies. For live graphs of several series, paging or overlays, use
[`addGraph`](graphs.md); for FPS, frame time and memory measured for you, use
[`addPerformanceMonitor`](performance.md). Inline compositions retain the complete row
when a monitor's metadata matches, following the [search contract](../search-contract.md).

All monitor declarations use the regular binding contract; there is no separate creation
method, handle class, inline item type or monitoring sampler. `MonitorOptions` is exported
from `@tweakpad/devkit` as a view configuration type.
