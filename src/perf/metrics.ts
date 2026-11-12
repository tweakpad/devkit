import { withUnit } from '../graphs/graph-model.js';
import type {
  GraphLayout,
  GraphMarker,
  GraphSeries,
  GraphSeriesSnapshot,
} from '../graphs/types.js';
import type { FrameSample } from './frame-meter.js';

/** A performance graph series, optionally computed from each measured frame window. */
export interface PerformanceMetricDefinition extends GraphSeries {
  /** Called once per window with the frame measurements; wins over `read`. */
  sample?: (frame: Readonly<FrameSample>) => number | null;
  /**
   * The stacked graph this metric joins unless `graphs` places it: `'frame'` for timing and
   * per-frame counts, `'memory'` for resources, or any other name for a graph of its own.
   * @default 'frame'
   */
  graph?: string;
}

/** Graphs of the default monitor, in order. */
export const FRAME_GRAPH = 'frame';
export const MEMORY_GRAPH = 'memory';

/**
 * A metric devkit measures itself: `'fps'` (frames per second), `'frameTime'` (mean ms per frame)
 * or `'heap'` (used JS heap in MB, where the browser exposes it).
 */
export type BuiltinMetricId = 'fps' | 'frameTime' | 'heap';

/** A built-in metric with some of its options changed, e.g. `{ id: 'fps', fill: 0.2 }`. */
export type BuiltinMetricOverride = {
  /** The built-in metric to change. */
  id: BuiltinMetricId;
} & Partial<Omit<PerformanceMetricDefinition, 'id'>>;

/**
 * One metric of a performance monitor: a built-in by id, a built-in with options changed, or a
 * custom metric definition.
 */
export type PerformanceMetric =
  BuiltinMetricId | BuiltinMetricOverride | PerformanceMetricDefinition;

/** One stacked graph: its metric ids, and how they share the graph. Give `metrics` or `pages`. */
export interface PerformanceGraphOptions {
  /** Metric ids in order, overlaid or paged as `layout` says. */
  metrics?: readonly string[];
  /**
   * `'overlay'` puts the metrics on one plot; `'paged'` shows one at a time. Defaults to the
   * monitor's `layout`. Ignored with `pages`.
   */
  layout?: GraphLayout;
  /**
   * Explicit pages of metric ids, e.g. `[['fps', 'frameTime'], ['drawCalls']]`: each page
   * overlays its metrics, and clicking the graph shows the next page.
   */
  pages?: readonly (readonly string[])[];
}

/** Stacked graphs by name, top to bottom: metric ids, or options with them. */
export type PerformanceGraphs = Readonly<
  Record<string, readonly string[] | PerformanceGraphOptions>
>;

/** Plugs a renderer or framework into a performance monitor without devkit depending on it. */
export interface PerformanceAdapter {
  /** Name of the adapter, e.g. the framework it measures. */
  name: string;
  /** Extra series, e.g. GPU memory, draw calls or GPU time. */
  metrics?: readonly PerformanceMetric[];
  /** Header markers, e.g. `{ id: 'backend', read: () => 'WebGPU' }`. */
  markers?: readonly GraphMarker[];
  /** Runs when the adapter is attached; may return a teardown. */
  attach?: (monitor: PerformanceMonitorHandle) => void | (() => void);
}

/** What an adapter's `attach` may use; `PerformanceMonitorApi` implements it. */
export interface PerformanceMonitorHandle {
  /** Marks the start of an application frame. Switches an `'auto'` monitor to the app's loop. */
  begin(): void;
  /** Marks the end of the application frame; frame time becomes the work in between. */
  end(): void;
  /**
   * Reports a metric's latest value, held and recorded with every sample until reported again.
   * Reports for metrics the monitor does not show are ignored.
   */
  report(id: string, value: number | null): void;
  /** Sets a marker on the first graph's header, or removes it with null. */
  setMarker(id: string, text: string | null): void;
}

const round = (value: number | null): string => (value === null ? '—' : String(Math.round(value)));
const fixed = (value: number | null, digits: number): string =>
  value === null ? '—' : value.toFixed(digits);

/**
 * `"60 FPS (58–61)"`: the value, then the lowest and highest in the visible history. Overlaid
 * series show the value alone.
 */
function withRange(text: string, s: GraphSeriesSnapshot, digits: number): string {
  if (s.overlaid || s.min === null || s.max === null) return text;
  const lo = digits ? fixed(s.min, digits) : round(s.min);
  const hi = digits ? fixed(s.max, digits) : round(s.max);
  return `${text} (${lo}–${hi})`;
}

interface MemoryInfo {
  usedJSHeapSize: number;
}

function heapInfo(): MemoryInfo | undefined {
  return (globalThis.performance as Performance & { memory?: MemoryInfo }).memory;
}

const MB = 1024 * 1024;

/** Built-ins mark the average of their visible history. */
const AVERAGE = Object.freeze([{ value: 'average' as const }]);

const builtins: Record<BuiltinMetricId, () => PerformanceMetricDefinition | null> = {
  fps: () => ({
    id: 'fps',
    label: 'FPS',
    unit: 'FPS',
    precision: 0,
    graph: FRAME_GRAPH,
    guides: AVERAGE,
    sample: (frame) => frame.fps,
    format: (s) => withRange(withUnit(round(s.value), 'FPS', s.overlaid), s, 0),
  }),
  frameTime: () => ({
    id: 'frameTime',
    label: 'Frame time',
    unit: 'ms',
    precision: 1,
    graph: FRAME_GRAPH,
    guides: AVERAGE,
    sample: (frame) => (frame.frames > 0 ? frame.frameTime : null),
    format: (s) => withRange(withUnit(fixed(s.value, 1), 'ms', s.overlaid), s, 1),
  }),
  heap: () => {
    // Chromium only; elsewhere the metric is left out.
    if (!heapInfo()) return null;
    return {
      id: 'heap',
      label: 'Memory',
      unit: 'MB',
      precision: 0,
      graph: MEMORY_GRAPH,
      guides: AVERAGE,
      read: () => {
        const info = heapInfo();
        return info ? info.usedJSHeapSize / MB : null;
      },
      format: (s) => withRange(withUnit(round(s.value), 'MB', s.overlaid), s, 0),
    };
  },
};

export const DEFAULT_METRICS: readonly BuiltinMetricId[] = Object.freeze([
  'fps',
  'frameTime',
  'heap',
]);

/** A metric definition, or null for a built-in the browser cannot measure. */
export function resolveMetric(metric: PerformanceMetric): PerformanceMetricDefinition | null {
  if (typeof metric !== 'string') {
    // An object with a built-in id changes that built-in; any other object is a custom metric.
    if (!Object.hasOwn(builtins, metric.id)) {
      if (!metric.label) throw new TypeError(`devkit: metric ${metric.id} needs a label`);
      return metric as PerformanceMetricDefinition;
    }
    const builtin = builtins[metric.id as BuiltinMetricId]();
    return builtin && { ...builtin, ...metric };
  }
  if (!Object.hasOwn(builtins, metric))
    throw new RangeError(`devkit: unknown built-in metric ${String(metric)}`);
  return builtins[metric]();
}

export interface MetricGroup {
  name: string;
  metrics: PerformanceMetricDefinition[];
  layout: GraphLayout | undefined;
  /** Explicit pages, limited to the metrics placed in this graph. */
  pages: string[][] | undefined;
}

/**
 * Groups metrics into named graphs. With `graphs`, that is the whole layout: listed ids in order,
 * unavailable ones skipped, unlisted metrics left out. Without it, each metric joins the graph its
 * own `graph` names (default `'frame'`), in order of first appearance.
 */
export function groupMetrics(
  metrics: readonly PerformanceMetricDefinition[],
  graphs: PerformanceGraphs | undefined,
): MetricGroup[] {
  const byId = new Map<string, PerformanceMetricDefinition>();
  for (const metric of metrics) {
    if (byId.has(metric.id)) throw new TypeError(`devkit: duplicate metric id ${metric.id}`);
    byId.set(metric.id, metric);
  }
  const groups: MetricGroup[] = [];
  if (graphs) {
    const placed = new Set<string>();
    for (const [name, spec] of Object.entries(graphs)) {
      const options: PerformanceGraphOptions = Array.isArray(spec)
        ? { metrics: spec as readonly string[] }
        : (spec as PerformanceGraphOptions);
      if (!options.metrics === !options.pages)
        throw new TypeError(`devkit: graph ${name} needs either metrics or pages`);
      const group: PerformanceMetricDefinition[] = [];
      const take = (ids: readonly string[]): string[] =>
        ids.filter((id) => {
          const metric = byId.get(id);
          if (!metric || placed.has(id)) return false;
          placed.add(id);
          group.push(metric);
          return true;
        });
      const pages = options.pages?.map(take).filter((page) => page.length > 0);
      if (options.metrics) take(options.metrics);
      groups.push({ name, metrics: group, layout: options.layout, pages });
    }
  } else {
    for (const metric of metrics) {
      const name = metric.graph ?? FRAME_GRAPH;
      let group = groups.find((g) => g.name === name);
      if (!group) groups.push((group = { name, metrics: [], layout: undefined, pages: undefined }));
      group.metrics.push(metric);
    }
  }
  return groups.filter((group) => group.metrics.length > 0);
}
