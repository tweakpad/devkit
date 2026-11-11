import '@tweakpad/ui/styles.css';
import { Pane, type PerformanceAdapter } from '../src/index.js';

/**
 * The three graph layers:
 * 1. `addGraph`: any live numbers, paged or overlaid.
 * 2. `addPerformanceMonitor`: FPS, frame time and memory with no setup.
 * 3. Adapters: framework-specific metrics and markers plugged into the monitor.
 */

// A stand-in for a renderer such as three.js or Pixi: what an adapter would read from.
const renderer = {
  backend: 'WebGPU' as 'WebGPU' | 'WebGL',
  info: { calls: 120, triangles: 1_240_000, textureBytes: 96 * 1024 * 1024 },
};
// A scene that changes a little every frame, like a real one.
setInterval(() => {
  renderer.info.calls = 118 + Math.round(Math.random() * 6);
  renderer.info.triangles = 1_240_000 + Math.round(Math.random() * 8_000);
}, 100);

/** `1.24M`, `86.0K`, `412`. */
function compact(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

/**
 * With three.js this would read `renderer.backend.isWebGPUBackend` and `renderer.info`;
 * devkit itself never imports a framework. Each metric names the graph it belongs to.
 */
const rendererAdapter: PerformanceAdapter = {
  name: 'demo-renderer',
  markers: [{ id: 'backend', read: () => renderer.backend, title: 'Rendering backend' }],
  metrics: [
    {
      id: 'drawCalls',
      label: 'Draw calls',
      unit: 'calls',
      precision: 0,
      graph: 'frame',
      read: () => renderer.info.calls,
    },
    {
      id: 'gpuMemory',
      label: 'GPU memory',
      unit: 'MB',
      precision: 0,
      graph: 'memory',
      read: () => renderer.info.textureBytes / (1024 * 1024),
    },
    {
      id: 'triangles',
      label: 'Triangles',
      graph: 'memory',
      read: () => renderer.info.triangles,
      format: (s) => compact(s.value),
    },
  ],
};

const pane = new Pane({ title: 'Graphs' });

// 2 + 3: the default monitor with a renderer adapter. Without `graphs`, each metric joins the
// graph it names; here `graphs` lays them out explicitly: FPS and frame time overlaid on the
// first page of the top graph, draw calls on its second page (click to switch), memory below.
const monitor = pane.addPerformanceMonitor({
  adapters: [rendererAdapter],
  graphs: {
    frame: { pages: [['fps', 'frameTime'], ['drawCalls']] },
    memory: ['heap', 'gpuMemory', 'triangles'],
  },
});
pane.addButton({
  title: 'Switch backend',
  onClick: () => {
    renderer.backend = renderer.backend === 'WebGPU' ? 'WebGL' : 'WebGPU';
  },
});
pane.addButton({
  title: 'Upload 64 MB of textures',
  onClick: () => {
    renderer.info.textureBytes += 64 * 1024 * 1024;
  },
});

// 1: generic graphs. An overlay of two signals sampled through read().
let phase = 0;
const signals = pane.addFolder({ title: 'Signals' });
signals.addGraph({
  label: 'Oscillators',
  layout: 'overlay',
  interval: 33,
  series: [
    {
      id: 'sine',
      label: 'Sine',
      min: -1,
      max: 1,
      read: () => Math.sin((phase += 0.08)),
    },
    {
      id: 'square',
      label: 'Square',
      min: -1,
      max: 1,
      read: () => (Math.sin(phase * 0.25) > 0 ? 0.6 : -0.6),
    },
  ],
});

// Push-fed and paged: values arrive from the application whenever it has them.
const network = signals.addGraph({
  label: 'Network',
  series: [
    { id: 'requests', label: 'Requests', unit: 'req/s', precision: 0 },
    {
      id: 'latency',
      label: 'Latency',
      unit: 'ms',
      precision: 0,
      guides: [{ value: 100, label: 'SLO' }],
    },
  ],
  markers: [{ id: 'region', text: 'eu-west' }],
});
setInterval(() => {
  network.push({
    requests: 40 + Math.random() * 30,
    latency: 60 + Math.random() * 60,
  });
}, 200);

// The binding graph monitor, now drawn by the same plot.
const state = { load: 0.5 };
setInterval(() => {
  state.load = Math.min(1, Math.max(0, state.load + (Math.random() - 0.5) * 0.2));
}, 100);
signals.addBinding(state, 'load', {
  label: 'Load (binding)',
  view: 'monitor',
  monitor: { view: 'graph', guides: [{ value: 0.8 }] },
  min: 0,
  max: 1,
  interval: 100,
});

Object.assign(window, { pane, monitor, network, renderer });
