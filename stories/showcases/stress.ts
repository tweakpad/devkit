import { Pane, type FolderApi, type PaneAnchor } from '@tweakpad/devkit';

export interface StressArgs {
  anchor: PaneAnchor;
}

const TOTAL = 1000;
const PER_FOLDER = 50;
const CHANGED_PER_FRAME = 30;
const MODES = ['linear', 'ease', 'spring', 'step'];

/**
 * 1000 bindings in 20 folders across 2 tabs, while the application changes 30 scattered values
 * every frame. A second pane, Meter, shows what it costs.
 *
 * While the story is open, `measure(ms?)` on the preview window records frame intervals, main
 * thread work and scheduler time and returns their summary; `setMutate`, `setPattern` and
 * `setBudget` change the run.
 */
export function stress(_host: HTMLElement, { anchor }: StressArgs): () => void {
  type Value = number | boolean | string;
  const state: Record<string, Value> = {};
  const keys: string[] = [];
  const kinds: ('slider' | 'number' | 'boolean' | 'select' | 'color')[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const key = `p${i}`;
    keys.push(key);
    const r = i % 10;
    const kind =
      r < 6 ? 'slider' : r === 6 ? 'number' : r === 7 ? 'boolean' : r === 8 ? 'select' : 'color';
    kinds.push(kind);
    state[key] =
      kind === 'boolean' ? false : kind === 'select' ? 'linear' : kind === 'color' ? '#336699' : 0;
  }

  const pane = new Pane({ title: 'Stress', anchor });
  const tabs = pane.addTabs({ pages: [{ title: 'A' }, { title: 'B' }] });
  const folders: FolderApi[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (i % PER_FOLDER === 0) {
      const page = tabs.pages[(i / PER_FOLDER) % 2 === 0 ? 0 : 1]!;
      folders.push(page.addFolder({ title: `Group ${i / PER_FOLDER + 1}`, expanded: i === 0 }));
    }
    const folder = folders[folders.length - 1]!;
    const key = keys[i]!;
    switch (kinds[i]) {
      case 'slider':
        folder.addBinding(state, key, { label: `Value ${i}`, min: 0, max: 100, step: 0.1 });
        break;
      case 'number':
        folder.addBinding(state, key, { label: `Number ${i}`, step: 0.01 });
        break;
      case 'boolean':
        folder.addBinding(state, key, { label: `Flag ${i}` });
        break;
      case 'select':
        folder.addBinding(state, key, { label: `Mode ${i}`, options: MODES });
        break;
      case 'color':
        folder.addBinding(state, key, { label: `Color ${i}` });
        break;
    }
  }

  // A second pane: what the stress costs, and the run's switches.
  const run = { mutate: true };
  const meter = { schedulerMs: 0, active: 0, mounted: 0, deferred: 0, heavy: 0 };
  const opposite: Record<PaneAnchor, PaneAnchor> = {
    'top-right': 'bottom-left',
    'top-left': 'bottom-right',
    'bottom-right': 'top-left',
    'bottom-left': 'top-right',
  };
  const monitor = new Pane({ title: 'Meter', anchor: opposite[anchor], refresh: 'frame' });
  // FPS and devkit's own frame cost, overlaid in one plot.
  monitor.addPerformanceMonitor({
    layout: 'overlay',
    metrics: [
      'fps',
      {
        id: 'scheduler',
        label: 'Scheduler',
        unit: 'ms',
        precision: 2,
        min: 0,
        read: () => pane.stats.duration,
      },
    ],
  });
  monitor.addBinding(meter, 'schedulerMs', {
    view: 'monitor',
    label: 'Scheduler (ms/frame)',
    precision: 3,
  });
  monitor.addBinding(meter, 'active', { view: 'monitor', label: 'Active bindings', precision: 0 });
  monitor.addBinding(meter, 'mounted', {
    view: 'monitor',
    label: 'Mounted controls',
    precision: 0,
  });
  monitor.addBinding(meter, 'heavy', {
    view: 'monitor',
    label: 'Control writes / frame',
    precision: 0,
  });
  monitor.addBinding(meter, 'deferred', {
    view: 'monitor',
    label: 'Deferred writes',
    precision: 0,
  });
  monitor.addBinding(run, 'mutate', { label: 'App mutation' });
  monitor.addRow({
    name: 'folders',
    label: 'Folders',
    items: [
      {
        type: 'button',
        title: 'Expand all',
        onClick: () => folders.forEach((f) => (f.expanded = true)),
      },
      {
        type: 'button',
        title: 'Collapse all',
        onClick: () => folders.forEach((f) => (f.expanded = false)),
      },
    ],
  });

  // The "application": a render loop touching 30 scattered values per frame.
  /** `spread`: 30 values across all 1000 per frame. `visible`: the first 30 rows, all on screen. */
  let pattern: 'spread' | 'visible' = 'spread';
  let frame = 0;
  let recording = false;
  const dts: number[] = [];
  const schedulerTimes: number[] = [];
  const workTimes: number[] = [];
  // Main-thread work of a frame: from the frame's rAF timestamp to the first task after rendering
  // (a MessageChannel message posted in rAF is delivered after style, layout and paint).
  const probe = new MessageChannel();
  let frameStart = 0;
  probe.port1.onmessage = () => {
    if (recording) workTimes.push(performance.now() - frameStart);
  };
  let last = performance.now();
  let request = 0;
  const loop = (now: number) => {
    const dt = now - last;
    last = now;
    if (recording) {
      dts.push(dt);
      schedulerTimes.push(pane.stats.duration);
      frameStart = now;
      probe.port2.postMessage(0);
    }
    if (run.mutate) {
      const stride = Math.floor(TOTAL / CHANGED_PER_FRAME);
      for (let k = 0; k < CHANGED_PER_FRAME; k++) {
        const i = pattern === 'visible' ? k : (k * stride + frame) % TOTAL;
        const key = keys[i]!;
        switch (kinds[i]) {
          case 'slider':
            state[key] = 50 + 50 * Math.sin(now / 500 + i);
            break;
          case 'number':
            state[key] = Math.round(1000 * Math.cos(now / 700 + i)) / 100;
            break;
          case 'boolean':
            state[key] = Math.sin(now / 300 + i) > 0;
            break;
          case 'select':
            state[key] = MODES[(frame + i) % 4]!;
            break;
          case 'color': {
            const h = Math.floor(128 + 127 * Math.sin(now / 400 + i));
            state[key] = `#${h.toString(16).padStart(2, '0')}6699`;
            break;
          }
        }
      }
    }
    frame++;
    const s = pane.stats;
    meter.schedulerMs = s.duration;
    meter.active = s.active;
    meter.mounted = s.mounted;
    meter.deferred = s.deferredWrites;
    meter.heavy = s.heavyWrites;
    request = requestAnimationFrame(loop);
  };
  request = requestAnimationFrame(loop);

  /** Records frame intervals and scheduler time for `ms`, then summarizes. */
  const measure = async (ms = 3000) => {
    dts.length = 0;
    schedulerTimes.length = 0;
    workTimes.length = 0;
    recording = true;
    await new Promise((resolve) => setTimeout(resolve, ms));
    recording = false;
    const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
    const avg = (a: number[]) => a.reduce((sum, v) => sum + v, 0) / a.length;
    const p = (a: number[], q: number) => sorted(a)[Math.floor(a.length * q)]!;
    const round = (v: number) => Math.round(v * 100) / 100;
    return {
      frames: dts.length,
      dtAvg: round(avg(dts)),
      dtP95: round(p(dts, 0.95)),
      dtMax: round(Math.max(...dts)),
      workAvg: round(avg(workTimes)),
      workP95: round(p(workTimes, 0.95)),
      workMax: round(Math.max(...workTimes)),
      schedulerAvg: round(avg(schedulerTimes)),
      schedulerP95: round(p(schedulerTimes, 0.95)),
      schedulerMax: round(Math.max(...schedulerTimes)),
      ...pane.stats,
    };
  };
  const tools = {
    pane,
    folders,
    tabs,
    measure,
    state,
    setMutate: (value: boolean) => (run.mutate = value),
    setPattern: (value: 'spread' | 'visible') => (pattern = value),
    setBudget: (ms: number) =>
      ((
        pane as unknown as { context: { scheduler: { budget: number } } }
      ).context.scheduler.budget = ms),
  };
  Object.assign(window, tools);

  return () => {
    cancelAnimationFrame(request);
    probe.port1.close();
    for (const name of Object.keys(tools))
      delete (window as unknown as Record<string, unknown>)[name];
    monitor.dispose();
    pane.dispose();
  };
}
