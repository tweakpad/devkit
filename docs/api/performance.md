# Performance monitor

`addPerformanceMonitor` adds ready-made [graphs](graphs.md) that measure frames themselves:

```ts
const monitor = pane.addPerformanceMonitor();
```

That is all it takes. The monitor stacks two graphs fed by one frame meter:

- **frame**: FPS and frame time, overlaid, each value in its line's color with its unit attached
  (`60FPS 16.7ms`);
- **memory**: the JS heap, `55 MB (53–56)`: the latest value, then the lowest and highest in
  the visible history (shown when a metric has its graph to itself).

Every metric is drawn against its own range, fitted to the visible data. By default the range
includes zero (`scale: 'absolute'`), so 120 draw calls varying by ±3 reads as a steady line;
`scale: 'relative'` hugs the data instead, for metrics where small variations matter:
`{ id: 'frameTime', scale: 'relative' }`.

## Default metrics

| Id          | Measures                                | Graph    |
| ----------- | --------------------------------------- | -------- |
| `fps`       | Frames per second over each window      | `frame`  |
| `frameTime` | Mean milliseconds per frame             | `frame`  |
| `heap`      | Used JS heap, MB (`performance.memory`) | `memory` |

`heap` is left out where the browser does not expose it (Chromium only), and so is the memory
graph when nothing else goes in it. Each built-in marks the average of its visible history with
a dashed line in its color; add a fixed line, such as a frame budget, with
`{ id: 'frameTime', guides: [{ value: 'average' }, { value: 1000 / 60, label: '60 Hz' }] }`.
Choose and order metrics with `metrics: ['fps', 'frameTime']`.

## Graphs

Without `graphs`, each metric joins the graph its `graph` names: `'frame'` (the default) for
timing and per-frame counts such as draw calls, `'memory'` for resources such as GPU memory or
triangle counts, or any other name for a graph of its own. Graphs stack in the order their
names first appear.

`graphs` is the whole layout, top to bottom. Each entry is a graph: a list of metric ids, or
options with them. Use it to choose metrics, order them, combine them, or give any metric a
graph of its own:

```ts
pane.addPerformanceMonitor({
  adapters: [rendererAdapter],
  graphs: {
    frame: ['fps', 'frameTime'],
    calls: { metrics: ['drawCalls'], layout: 'paged' },
    memory: ['gpuMemory', 'triangles'],
  },
});
```

- Metrics not listed are left out, adapters' included; reports for them are ignored.
- Ids that are not available, such as `heap` outside Chromium, are skipped, and a graph left
  with no metrics is not shown.
- A graph's `layout` overrides the monitor's `layout` (default `'overlay'`): `'paged'` shows
  one metric at a time; click to show the next.
- A graph's `pages` mixes both: each page overlays its metrics, and clicking shows the next
  page. Unavailable ids are skipped and pages left empty are dropped.

```ts
pane.addPerformanceMonitor({
  adapters: [rendererAdapter],
  graphs: {
    frame: { pages: [['fps', 'frameTime'], ['drawCalls']] },
    memory: ['heap', 'gpuMemory', 'triangles'],
  },
});
```

## Changing built-in metrics

A built-in can be listed as an object with its id and the options to change. The rest of its
definition is kept:

```ts
pane.addPerformanceMonitor({
  metrics: [
    { id: 'fps', fill: 0.2, color: '#22d3ee' },
    { id: 'frameTime', min: 0, max: 33.4 }, // a fixed range instead of a fitted one
    'heap',
  ],
});
```

Any [series option](graphs.md#series) works the same way on built-ins and custom metrics:
`fill` (`true`, an opacity, or `false`; on by default, sharing 0.15 opacity per plot),
`color`, `min`/`max`, `scale`, `guides`, `precision` and `format`.

## Where frames are measured

- **devkit's loop (default).** Without any setup the monitor measures the frames the browser
  actually presents, from devkit's own frame loop. Frame time is the interval between frames.
- **Your loop.** Call `begin()` and `end()` around your frame. From the first `begin()` on,
  FPS counts your frames and frame time becomes the work between `begin()` and `end()`. If your
  loop stops, FPS falls to 0.

```ts
function frame() {
  monitor.begin();
  renderer.render(scene, camera);
  monitor.end();
  requestAnimationFrame(frame);
}
```

`source: 'raf'` ignores `begin()`; `source: 'manual'` uses only `begin()`/`end()`. The latest
window is available as `monitor.meter` (`fps`, `frameTime`, `frameTimeMax`, `frames`, `now`),
and `monitor.mode` reports `'raf'` or `'manual'`.

## Options

Everything from [graph options](graphs.md#graph-options) except `series`, `pages` and `format`, plus:

| Option     | Behavior                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| `label`    | Search and accessible name; default `'Performance'`; hidden unless `showLabel`. |
| `metrics`  | Built-in ids, built-in overrides and custom metric definitions, in order.       |
| `interval` | Measurement window and sample period, ms; default 250.                          |
| `source`   | `'auto'` (default), `'raf'` or `'manual'`.                                      |
| `adapters` | Framework adapters to attach.                                                   |
| `graphs`   | The whole layout: stacked graphs by name, each with its metric ids in order.    |
| `layout`   | Default for every graph: `'overlay'` (default) or `'paged'`.                    |
| `markers`  | Header markers, shown on the first graph, as are adapters' markers.             |

The defaults keep 120 samples: 30 seconds of history.

## Handle

`PerformanceMonitorApi`:

- `graphs` (top to bottom), `graphNames` and `graph(name)`: each a regular `GraphApi`, e.g.
  `monitor.graph('memory').hidden = true`.
- `begin()`, `end()`, `meter`, `mode`: frame measurement.
- `report(id, value)`, `addMetric(metric)`, `removeMetric(id)`, `use(adapter)`,
  `setMarker(id, text)`: metrics and markers. A metric added later joins the graph its `graph`
  names, or the last graph when there is no such graph; a graph left without metrics is hidden.
- `hidden`, `disabled`, `dispose()`: all graphs at once.

## Custom metrics

A metric is a [graph series](graphs.md#series) with an optional `graph` and an optional
`sample(frame)`, called once per window with the frame measurements:

```ts
monitor.addMetric({
  id: 'budget',
  label: 'Budget used',
  unit: '%',
  precision: 0,
  max: 100,
  graph: 'frame',
  sample: (frame) => (frame.frameTime / (1000 / 60)) * 100,
});
```

Metrics can also `read()` a value each window, or receive values with `monitor.report(id, value)`.
Reported values are held until reported again, which suits results that arrive asynchronously,
such as GPU timer queries.

## Adapters

devkit never imports a rendering framework, and browsers expose no GPU memory API. An adapter
connects what only your framework knows: GPU memory, draw calls, GPU time and backend markers.

```ts
interface PerformanceAdapter {
  name: string;
  metrics?: PerformanceMetric[];
  markers?: GraphMarker[];
  attach?(monitor): void | (() => void); // optional teardown
}
```

Pass adapters in `adapters` or attach them later with `monitor.use(adapter)`, which returns a
function that detaches the adapter's metrics, markers and teardown.

### three.js

```ts
const threeAdapter = (renderer: THREE.WebGLRenderer | WebGPURenderer): PerformanceAdapter => ({
  name: 'three',
  markers: [
    {
      id: 'backend',
      title: 'Rendering backend',
      read: () =>
        'isWebGPURenderer' in renderer && renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL',
    },
  ],
  metrics: [
    {
      id: 'drawCalls',
      label: 'Draw calls',
      unit: 'calls',
      precision: 0,
      read: () => renderer.info.render.calls,
    },
    {
      id: 'triangles',
      label: 'Triangles',
      precision: 0,
      graph: 'memory',
      read: () => renderer.info.render.triangles,
    },
    {
      id: 'textures',
      label: 'Textures',
      precision: 0,
      graph: 'memory',
      read: () => renderer.info.memory.textures,
    },
  ],
});

pane.addPerformanceMonitor({ adapters: [threeAdapter(renderer)] });
```

`renderer.info.memory` counts resources; where your renderer version or your own allocation
tracking reports bytes, add a `gpuMemory` metric that reads them in MB. Renderers that reset
`info.render` every frame should be read after rendering, e.g. with `monitor.report` from your
loop, or set `renderer.info.autoReset = false` and reset it yourself.

### Pixi

```ts
const pixiAdapter = (app: Application): PerformanceAdapter => ({
  name: 'pixi',
  markers: [
    { id: 'backend', read: () => (app.renderer.type === RendererType.WEBGPU ? 'WebGPU' : 'WebGL') },
  ],
  metrics: [
    {
      id: 'textures',
      label: 'Textures',
      precision: 0,
      graph: 'memory',
      read: () => app.renderer.texture.managedTextures.length,
    },
  ],
});
```

Check the property names against the version you use; the adapter is the only place that
knows them.

## Cost

The monitor samples only while visible (unless `sampleWhileHidden`). Per frame it does a few
arithmetic operations on numbers; once per window it reads each metric and records one frame
into the plot, which paints incrementally. `begin()` and `end()` are always cheap, whether or
not the monitor is visible.
