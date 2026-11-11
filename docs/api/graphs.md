# Graphs

`addGraph` adds a live graph of one or more numeric series to a pane, folder or tab page.
It is not specific to performance: anything that produces numbers over time can feed it. The
[performance monitor](performance.md) is built on it, and so is the
[graph view of monitor bindings](monitoring.md).

```ts
// Sampled: devkit calls read() every `interval` ms while the graph is visible.
pane.addGraph({
  label: 'Oscillators',
  layout: 'overlay',
  interval: 33,
  series: [
    { id: 'sine', label: 'Sine', min: -1, max: 1, read: () => Math.sin(clock.t) },
    { id: 'square', label: 'Square', min: -1, max: 1, read: () => square(clock.t) },
  ],
});

// Pushed: the application records a frame whenever it has values.
const network = pane.addGraph({
  label: 'Network',
  series: [
    { id: 'requests', label: 'Requests', unit: 'req/s', precision: 0 },
    { id: 'latency', label: 'Latency', unit: 'ms', guides: [{ value: 100, label: 'SLO' }] },
  ],
  markers: [{ id: 'region', text: 'eu-west' }],
});
socket.on('stats', (s) => network.push({ requests: s.rps, latency: s.p95 }));
```

## Layouts

| Layout              | Behavior                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `'paged'` (default) | One series per page. Click the graph, or press Enter or Space on it, to show the next page.                                                 |
| `'overlay'`         | Every series in one plot, each in its own color, with each value in the readout shown in its line's color and its unit attached (`16.7ms`). |
| `pages: [[…], …]`   | Explicit groups of series ids; overrides `layout`. Series not listed get pages of their own.                                                |

All pages share one history, so switching pages never loses data. `api.page` reads or sets the
page, `api.pageCount` counts them, and `api.on('page', listener)` reports changes.

Every series has its own range, so series in different units (FPS, milliseconds, megabytes)
overlay meaningfully: each is drawn against its own `min`/`max`.

## Series

| Option       | Behavior                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`         | Stable, unique id; `push`, `setRange` and `pages` address series by it.                                                                                                                                      |
| `label`      | Name in search, page titles and tooltips.                                                                                                                                                                    |
| `unit`       | Shown after the value in the readout.                                                                                                                                                                        |
| `precision`  | Readout decimals; default 2.                                                                                                                                                                                 |
| `min`, `max` | Fixed bounds. Omitted bounds fit the visible data with headroom, on round steps, as `scale` says.                                                                                                            |
| `scale`      | `'absolute'` (default): the range includes zero, so lines show true magnitude, while the far bound still fits the data. `'relative'`: both bounds hug the visible data, so small variations fill the height. |
| `color`      | Any CSS color; default `--tp-chart-1` … `--tp-chart-5` by series order.                                                                                                                                      |
| `fill`       | Area under the line: `true` (default), an opacity, or `false`. Series on one plot share an opacity of 0.15, so overlapping fills stay as light as one.                                                       |
| `guides`     | Dashed horizontal lines in front of the data: `{ value, label?, color? }`. `value` is a number in the series' units, or `'average'` for the mean of the visible history, drawn in the series' color.         |
| `read`       | Polled every `interval` ms while the graph is visible.                                                                                                                                                       |
| `format`     | Readout text from a snapshot `{ value, min, max, label, unit, color, overlaid }`; `overlaid` is true when the series shares its plot, to keep the text short.                                                |

## Graph options

| Option               | Behavior                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `label`              | Search and accessible name; shown in the header unless `showLabel: false`.                    |
| `bufferSize`         | Samples kept per series; default 120, at least 2.                                             |
| `interval`           | Milliseconds between `read()` samples; default 100.                                           |
| `headerInterval`     | Milliseconds between readout updates; default 250. The last value of a burst is always shown. |
| `sampleWhileHidden`  | Keep sampling while hidden, collapsed or scrolled away; default false.                        |
| `markers`            | Header text at the end: `{ id, text }` or `{ id, read }` (polled with the readout).           |
| `format`             | One readout text for the whole graph from `{ page, series }`.                                 |
| `hidden`, `disabled` | As for every row. A disabled graph keeps recording but cannot change pages.                   |

## Feeding values

- **`read()` series.** devkit samples them on its frame loop every `interval` ms, only while
  the graph is visible (or always, with `sampleWhileHidden`). Hidden graphs cost nothing.
- **`push(values)`.** On a graph without `read()` series, every call records one frame;
  series left out of the call get a gap. On a sampled graph, pushed values are held and
  recorded with every following sample until pushed again, which suits values that arrive
  asynchronously.

## Handle

`GraphApi`: `element`, `label`, `hidden`, `disabled`, `page`, `pageCount`, `push(values)`,
`setMarker(id, text | null, { title? })`, `setRange(id, { min?, max? })`, `addSeries(series)`,
`removeSeries(id)`, `clear()`, `on('page', listener)` and `dispose()`.

## Performance

Graphs are drawn by `<tp-plot>` from `@tweakpad/ui` in its `push` mode, and stay on its
incremental path, where each paint shifts the cached pixels and draws only the new columns:

- Each graph keeps one bounded plot stream. Values are normalized to their series' range on
  the way in, so the plot's y domain is fixed at 0–1 even when series use different units.
- A fitted range is refitted only when data leaves it or uses less than a third of it; each
  refit renormalizes the history once (one full redraw). Paging, adding series and `setRange`
  also redraw once; ordinary samples never do. Guides outside a series' range are hidden.
- An average guide moves only once it has drifted about a pixel, at most at the readout rate;
  guides sit outside the cached history, so moving one repaints only the guide layer.
- Series, guide and configuration objects are built once per layout, so the plot never sees a
  new configuration between layout changes.
- Every graph of a pane paints through one shared plot scheduler (1 ms budget, 8 plots per
  frame), at a rate capped by its sample rate.
- Readouts refresh at most every `headerInterval` and write text nodes only when the text
  changed. Sampling allocates nothing per frame on devkit's side.
- Graphs mount lazily and unmount with the pane's mount LRU like controls; history lives
  outside the element, so a remounted graph redraws what it had.
