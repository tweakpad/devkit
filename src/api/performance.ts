import type { Scheduler } from '../core/scheduler.js';
import type { GraphModel } from '../graphs/graph-model.js';
import { GraphTicker, type GraphRow } from '../graphs/graph-row.js';
import { frameRateFor } from '../graphs/graph-view.js';
import type { GraphLayout, GraphMarker, GraphParams, GraphSeries } from '../graphs/types.js';
import { FrameMeter, type FrameSample, type FrameSource } from '../perf/frame-meter.js';
import {
  DEFAULT_METRICS,
  FRAME_GRAPH,
  groupMetrics,
  resolveMetric,
  type PerformanceGraphs,
  type PerformanceAdapter,
  type PerformanceMetric,
  type PerformanceMetricDefinition,
  type PerformanceMonitorHandle,
} from '../perf/metrics.js';
import type { PaneContext } from './context.js';
import { createGraphModel, createGraphRow, GraphApi, validateTiming } from './graph.js';

/**
 * Options of `addPerformanceMonitor()`: the graph options except `series`, `pages` and `format`,
 * plus the metrics, their graphs and where frames are measured.
 */
export interface PerformanceParams extends Omit<
  GraphParams,
  'series' | 'label' | 'interval' | 'pages' | 'format'
> {
  /**
   * Name for search and assistive technology, shown in the headers only with `showLabel`.
   * @default 'Performance'
   */
  label?: string;
  /**
   * Show the label and the graph's name at the start of each graph's header.
   * @default false
   */
  showLabel?: boolean;
  /**
   * Metrics in order: built-in ids, built-ins with options changed, or custom definitions.
   * `heap` is left out where the browser cannot measure it.
   * @default ['fps', 'frameTime', 'heap']
   */
  metrics?: readonly PerformanceMetric[];
  /**
   * The whole layout: stacked graphs by name, top to bottom, each listing metric ids in order,
   * e.g. `{ frame: { pages: [['fps', 'frameTime'], ['drawCalls']] }, memory: ['heap'] }`.
   * Metrics not listed are left out, adapters' included; ids that are not available (such as
   * `heap` outside Chromium) are skipped. Default: one graph per metric `graph` name.
   */
  graphs?: PerformanceGraphs;
  /**
   * Layout of every graph that sets none: `'overlay'` puts its metrics on one plot, `'paged'`
   * shows one at a time.
   * @default 'overlay'
   */
  layout?: GraphLayout;
  /** Header markers, shown on the first graph with the adapters' markers. */
  markers?: readonly GraphMarker[];
  /**
   * Measurement window and sample period, in ms.
   * @default 250
   */
  interval?: number;
  /**
   * Milliseconds between readout updates. The last value of a burst is always shown.
   * @default interval
   */
  headerInterval?: number;
  /**
   * Where frames are measured: `'auto'` uses devkit's loop until the first `begin()`, `'raf'`
   * only devkit's loop, `'manual'` only `begin()` and `end()`.
   * @default 'auto'
   */
  source?: FrameSource;
  /** Framework adapters to attach: their metrics, markers and setup. */
  adapters?: readonly PerformanceAdapter[];
}

type Sample = NonNullable<PerformanceMetricDefinition['sample']>;

/** Measures frames once, and samples every metric of every graph once per window. */
export class PerformanceTicker extends GraphTicker {
  readonly samplers = new Map<string, Sample>();
  readonly models: GraphModel[] = [];

  constructor(
    scheduler: Scheduler,
    readonly meter: FrameMeter,
  ) {
    super(scheduler);
  }

  get active(): boolean {
    return true;
  }

  tick(now: number): void {
    if (!this.meter.tick(now)) return;
    const frame = this.meter.sample;
    for (const model of this.models) {
      for (const state of model.series) {
        const sample = this.samplers.get(state.def.id);
        if (sample) state.staged = sample(frame);
        else if (state.def.read) state.staged = state.def.read();
      }
      model.commit(true);
    }
  }

  reset(): void {
    this.meter.reset();
  }
}

export interface PerformanceGraph {
  readonly name: string;
  readonly row: GraphRow;
}

export interface CreatedPerformanceMonitor {
  graphs: PerformanceGraph[];
  ticker: PerformanceTicker;
  /** Ids each creation-time adapter contributed, for detaching it later. */
  adapterMetrics: string[][];
}

function toSeries(metric: PerformanceMetricDefinition): GraphSeries {
  const { sample, graph, ...series } = metric;
  void sample;
  void graph;
  return series;
}

/** Builds the rows behind `addPerformanceMonitor`: one per graph, all fed by one ticker. */
export function createPerformanceMonitor(
  context: PaneContext,
  params: PerformanceParams,
): CreatedPerformanceMonitor {
  validateTiming(params.interval, params.headerInterval);
  const interval = params.interval ?? 250;
  const resolve = (list: readonly PerformanceMetric[]) =>
    list.map(resolveMetric).filter((metric) => metric !== null);
  const own = resolve(params.metrics ?? DEFAULT_METRICS);
  const fromAdapters = (params.adapters ?? []).map((adapter) => resolve(adapter.metrics ?? []));
  const metrics = [...own, ...fromAdapters.flat()];
  const groups = groupMetrics(metrics, params.graphs);
  if (groups.length === 0)
    throw new RangeError('devkit: a performance monitor needs at least one measurable metric');

  const ticker = new PerformanceTicker(
    context.scheduler,
    new FrameMeter(interval, params.source ?? 'auto'),
  );
  for (const { metrics: group } of groups)
    for (const metric of group) if (metric.sample) ticker.samplers.set(metric.id, metric.sample);
  const markers = [
    ...(params.markers ?? []),
    ...(params.adapters ?? []).flatMap((adapter) => adapter.markers ?? []),
  ];
  const label = params.label ?? 'Performance';
  const graphs = groups.map(({ name, metrics: group, layout, pages }, index): PerformanceGraph => {
    const model = createGraphModel(group.map(toSeries), {
      bufferSize: params.bufferSize,
      layout: layout ?? params.layout ?? 'overlay',
      pages,
      markers: index === 0 ? markers : undefined,
    });
    ticker.models.push(model);
    const row = createGraphRow(
      context,
      model,
      {
        label: `${label}: ${name}`,
        showLabel: params.showLabel ?? false,
        headerInterval: params.headerInterval ?? interval,
        maxFrameRate: frameRateFor(interval),
        sampleWhileHidden: params.sampleWhileHidden ?? false,
        format: undefined,
      },
      ticker,
    );
    if (params.disabled) row.setDisabled(true);
    if (params.hidden) row.setHidden(true);
    return { name, row };
  });
  return {
    graphs,
    ticker,
    adapterMetrics: fromAdapters.map((list) => list.map((metric) => metric.id)),
  };
}

/**
 * The handle `addPerformanceMonitor` returns: stacked graphs fed by one frame meter, plus the
 * hooks to measure an application loop and to plug in framework-specific metrics and markers.
 */
export class PerformanceMonitorApi implements PerformanceMonitorHandle {
  readonly #graphs: { name: string; row: GraphRow; api: GraphApi }[];
  readonly #ticker: PerformanceTicker;
  readonly #context: PaneContext;
  readonly #detachers = new Set<() => void>();
  #disposing = false;

  constructor(
    created: CreatedPerformanceMonitor,
    context: PaneContext,
    adapters: readonly PerformanceAdapter[] = [],
  ) {
    this.#context = context;
    this.#ticker = created.ticker;
    this.#graphs = created.graphs.map(({ name, row }) => ({
      name,
      row,
      api: new GraphApi(row, context),
    }));
    adapters.forEach((adapter, index) =>
      this.#attach(adapter, created.adapterMetrics[index] ?? []),
    );
  }

  /** The stacked graphs, top to bottom. */
  get graphs(): readonly GraphApi[] {
    return this.#graphs.map((graph) => graph.api);
  }

  /** Graph names, top to bottom, e.g. `['frame', 'memory']`. */
  get graphNames(): readonly string[] {
    return this.#graphs.map((graph) => graph.name);
  }

  /** One graph by name. */
  graph(name: string): GraphApi | undefined {
    return this.#graphs.find((graph) => graph.name === name)?.api;
  }

  /** Whether every graph is hidden; setting it hides or shows them all. */
  get hidden(): boolean {
    return this.#graphs.every((graph) => graph.row.hidden);
  }

  set hidden(hidden: boolean) {
    for (const graph of this.#graphs) graph.row.setHidden(hidden);
    this.#context.refreshSearch?.();
  }

  /** Whether every graph is disabled; setting it disables or enables them all. */
  get disabled(): boolean {
    return this.#graphs.every((graph) => graph.row.disabled);
  }

  set disabled(disabled: boolean) {
    for (const graph of this.#graphs) graph.row.setDisabled(disabled);
  }

  /** The latest measurement window. */
  get meter(): Readonly<FrameSample> {
    return this.#ticker.meter.sample;
  }

  /** Where frames are measured now: devkit's loop, or `begin()`/`end()`. */
  get mode(): 'raf' | 'manual' {
    return this.#ticker.meter.mode;
  }

  /** Marks the start of an application frame. Switches an `'auto'` monitor to the app's loop. */
  begin(): void {
    this.#ticker.meter.begin();
  }

  /** Marks the end of the application frame; frame time becomes the work in between. */
  end(): void {
    this.#ticker.meter.end();
  }

  /**
   * Reports a metric's latest value, e.g. from an async GPU timer query. It is held and recorded
   * with every sample until reported again. Reports for metrics the monitor does not show (left
   * out by `graphs`, or not measurable here) are ignored, so adapters can report unconditionally.
   */
  report(id: string, value: number | null): void {
    this.#modelOf(id)?.stage(id, value);
  }

  /** Sets a marker on the first graph's header, or removes it with null. */
  setMarker(id: string, text: string | null): void {
    this.#graphs[0]!.api.setMarker(id, text);
  }

  /**
   * Adds a metric to the graph its `graph` names (default `'frame'`), or to the last graph when
   * there is no such graph. Returns its id, or null for a built-in this browser cannot measure.
   */
  addMetric(metric: PerformanceMetric): string | null {
    const definition = resolveMetric(metric);
    if (!definition) return null;
    if (this.#modelOf(definition.id))
      throw new TypeError(`devkit: duplicate metric id ${definition.id}`);
    const name = definition.graph ?? FRAME_GRAPH;
    const graph = this.#graphs.find((g) => g.name === name) ?? this.#graphs.at(-1)!;
    graph.row.model.addSeries(toSeries(definition));
    if (definition.sample) this.#ticker.samplers.set(definition.id, definition.sample);
    return definition.id;
  }

  /** Removes a metric. A graph left without metrics is hidden. */
  removeMetric(id: string): void {
    const graph = this.#graphs.find((g) => g.row.model.get(id));
    if (!graph) return;
    this.#ticker.samplers.delete(id);
    if (graph.row.model.series.length > 1) graph.row.model.removeSeries(id);
    else graph.row.setHidden(true);
    this.#context.refreshSearch?.();
  }

  /** Attaches an adapter's metrics, markers and setup. Returns a function that detaches it. */
  use(adapter: PerformanceAdapter): () => void {
    const ids: string[] = [];
    for (const metric of adapter.metrics ?? []) {
      const id = this.addMetric(metric);
      if (id) ids.push(id);
    }
    for (const marker of adapter.markers ?? [])
      this.#graphs[0]!.row.model.setMarker(marker.id, marker);
    return this.#attach(adapter, ids);
  }

  /** Detaches every adapter, running its teardown, and removes the graphs. */
  dispose(): void {
    this.#disposing = true;
    for (const detach of [...this.#detachers]) detach();
    for (const graph of this.#graphs) graph.row.dispose();
    this.#context.refreshSearch?.();
  }

  #attach(adapter: PerformanceAdapter, ids: readonly string[]): () => void {
    const teardown = adapter.attach?.(this);
    const detach = (): void => {
      if (!this.#detachers.delete(detach)) return;
      if (typeof teardown === 'function') teardown();
      if (this.#disposing) return;
      for (const id of ids) this.removeMetric(id);
      for (const marker of adapter.markers ?? []) this.setMarker(marker.id, null);
    };
    this.#detachers.add(detach);
    return detach;
  }

  #modelOf(id: string): GraphModel | undefined {
    return this.#graphs.find((graph) => graph.row.model.get(id))?.row.model;
  }
}
