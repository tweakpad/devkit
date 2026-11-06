# @tweakpad/devkit

A tweak panel for tuning live values, built on the `variant="inline"` controls of
[`@tweakpad/ui`](https://github.com/tweakpad/ui). It uses no UI framework: devkit owns its own
state, bindings and scheduling.

Panes use the library's flat appearance, inherited by their controls, folders and monitors.

The search icon at the left of the centered title toggles a search bar. Typing filters fields
and monitors by property name or label across all tabs and folders. Tabs stay available;
folders with no matching fields are hidden. Selected tabs and folder expansion stay unchanged.
**Clear** or **Esc** clears and closes search. Fields explicitly hidden through the API stay hidden.

Composed controls follow the [search ownership contract](docs/search-contract.md): explicit
metadata, one visibility boundary per complete field, and eligible descendant counts for groups.

```ts
import '@tweakpad/ui/styles.css';
import { Pane } from '@tweakpad/devkit';

const pane = new Pane({ title: 'Scene' });
const tabs = pane.addTabs({ pages: [{ title: 'Camera' }, { title: 'Stats' }] });
const camera = tabs.pages[0].addFolder({ title: 'Lens' });
camera.addBinding(params, 'fov', { min: 10, max: 120, step: 1 }).on('change', (e) => {});
camera.addBinding(params, 'mode', { options: { Orbit: 'orbit', Fly: 'fly' } });
camera.addBinding(params, 'tint', { color: { type: 'float' } }); // {r,g,b} in 0–1
tabs.pages[1].addMonitor(stats, 'fps', { view: 'graph', min: 0, max: 144 });
```

## Controls

The control is inferred from the value; `view` overrides the inference.

| Value                          | Control                                                 |
| ------------------------------ | ------------------------------------------------------- |
| number with `min` and `max`    | `tp-slider` inline                                      |
| number                         | `tp-input type=number` inline (stepper)                 |
| boolean                        | `tp-checkbox` inline (`view: 'switch'` for `tp-switch`) |
| any value with `options`       | `tp-select` inline, non-modal                           |
| CSS color string, or `{r,g,b}` | `tp-color-input` inline                                 |
| string                         | `tp-input` inline                                       |

Monitors are devkit's own lightweight rows: `text` writes a single Text node, and `graph` is
a canvas fed from a Float32Array ring buffer.

Color bindings accept `color: { picker: 'native' | 'tweakpad' }`. Set
`new Pane({ colorPicker: 'tweakpad' })` to change the pane default; individual bindings can
override it. Native is the default. See [color picker configuration](docs/api/colors.md)
for formats, alpha, RGB objects and mixed inline rows.

Actions use `addButton({ title, onClick })`. Compose any supported controls with `addRow`:

```ts
const actions = pane.addFolder({ title: 'Actions' });
actions.addButton({
  title: 'Reset scene',
  onClick: () => {
    params.speed = 0.6;
    params.paused = false;
  },
});
actions.addRow({
  name: 'playback',
  items: [
    { type: 'button', title: 'Pause', onClick: () => { params.paused = true; } },
    { type: 'button', title: 'Resume', onClick: () => { params.paused = false; } },
  ],
});
```

Rows are supported on panes, folders and tab pages. The same declaration can mix a slider
with an intrinsic-width Reset button, inputs, monitors or other bindings. Each row shares one
complete search boundary. See the [inline row API](docs/api/rows.md) and
[button API](docs/api/buttons.md) for configuration, typed item handles, state and disposal.

## Architecture

```
src/core/      framework-free: Binding, Scheduler, equality, ring queue (unit tested)
src/controls/  views wrapping library inline elements in controlled mode
src/monitors/  text and graph monitors
src/elements/  tweak-pane, tweak-folder, tweak-tabs, tweak-tab-page (Lit, chrome only)
src/api/       the public imperative API, rows, chunks, visibility, mount LRU
```

- **One scheduler for the page.** Each frame it reads the _active_ bindings with plain
  `obj[key]` reads (no Proxy, no accessors injected into your objects), compares each against
  the last value shown, and writes only what changed. Numbers are compared at display
  resolution. The frame loop allocates nothing and reads no layout.
- **Only on-screen rows cost anything.** Rows are grouped into chunks of 16, each observed by
  one IntersectionObserver per pane. A collapsed folder, a hidden tab page or a scrolled-away
  chunk puts its bindings to sleep. Closed content uses `content-visibility: hidden`, so
  reopening it keeps the library elements' styles.
- **Library elements are created late, and only within budget.** A row starts as a placeholder
  painted like an inline control. The first time it becomes visible, a budgeted job creates the
  element. At most `maxMounted` elements (default 300) stay mounted while off screen; the least
  recently seen are dropped first.
- **Writes are budgeted.** Writes to library elements (each a full Lit update) share a frame
  budget (`scheduler.budget`, default 2 ms). Leftover writes carry over and stay coalesced, so a
  late write always shows the latest value. Monitor writes are cheap and always flush.
- **UI → object.** The target is written synchronously on every proposal, so your app sees a
  drag at pointer rate. `change` listeners fire at most once per frame, and `finish` fires on
  commit. While the user drags or types, the binding is locked so your app's own writes don't
  pull the control away from them.
- **The library's observers stay asleep.** Panes move through a CSSOM rule, never the `style`
  attribute, and state changes on ancestors use attributes the library does not observe
  (`hidden`, `open`) instead of `class` or `style`.

## Measurements (2026-10-31, Vite dev, Lit dev mode, M-series Mac, 60 Hz)

`demo/stress.html` has 1000 bindings in 20 folders across 2 tabs. The app mutates 30 values
per frame. "Work" is main-thread time per frame, measured from the rAF timestamp to the first
task after rendering.

| Scenario                                                | Scheduler    | Work avg / p95 | FPS                  |
| ------------------------------------------------------- | ------------ | -------------- | -------------------- |
| Nothing visible changing                                | 0.05–0.07 ms | 0.7 / 1.6 ms   | 60                   |
| 30 changes spread over 1000 (~1 visible)                | 0.9 ms       | 3.5 / 5.0 ms   | 60                   |
| Worst case: all 30 changes on visible rows, budget 2 ms | 2.1 ms       | 6.6 / 7.7 ms   | 60 (each row ~14 Hz) |
| Same, budget 8 ms (no deferral)                         | 6.2 ms       | 19 / 32 ms     | drops                |

The remaining cost belongs to the library elements. The library cost spike
(`demo/spike-library.html`) measured 110–290 µs per `.value` update, and 0.2–3.3 ms to mount
each element. Profiling put about 35–50% of each update in `PresentationController.refresh()`,
which runs after every update even when only the value changed. The rendering after each update
is roughly as expensive again. The evidence and proposed fixes for `@tweakpad/ui` are in
[docs/issues/ui-inline-control-update-cost.md](docs/issues/ui-inline-control-update-cost.md),
reproducible with `demo/library-proof.html` (run Vite with `NODE_ENV=production`).

## Development

```sh
npm install        # installs the published @tweakpad/ui dependency
npm run dev        # playground at /, stress at /demo/stress.html, spike at /demo/spike-library.html
NODE_ENV=production npx vite   # production Lit, for /demo/library-proof.html
npm test           # core unit tests
npm run lint && npm run typecheck && npm run build
```
