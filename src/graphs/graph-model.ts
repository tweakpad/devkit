import type { PlotGuide, PlotSeries, PlotStream } from '@tweakpad/ui/widgets';
import { formatValue } from '../monitors/text-monitor.js';
import { Scale } from './scale.js';
import type { GraphLayout, GraphMarker, GraphSeries, GraphSeriesSnapshot } from './types.js';

/** Creates the plot stream; injected so the model has no DOM or library-element dependency. */
export type StreamFactory = (seriesIds: readonly string[], capacity: number) => PlotStream;

/** The fill opacity of one plot, shared by the series on it. */
const DEFAULT_FILL = 0.15;
const GUIDE_DASH = Object.freeze([3, 3]);
/** An average guide moves once it has drifted this share of the plot height (about a pixel). */
const AVERAGE_STEP = 0.01;

/** `"16.7 ms"`, or `"16.7ms"` when overlaid, where readouts share one line. */
export function withUnit(value: string, unit: string, overlaid: boolean): string {
  if (!unit) return value;
  return overlaid ? `${value}${unit}` : `${value} ${unit}`;
}

/** One series: its raw history (NaN marks a gap), range, and readout snapshot. */
export class SeriesState implements GraphSeriesSnapshot {
  readonly scale: Scale;
  readonly color: string;
  readonly unit: string;
  raw: Float32Array;
  value: number | null = null;
  min: number | null = null;
  max: number | null = null;
  /** Mean of the visible history. */
  mean: number | null = null;
  /** Where this series' average guides were last drawn, normalized; NaN before. */
  averageAt = NaN;
  overlaid = false;
  /** The value the next frame records; undefined records a gap. */
  staged: number | null | undefined = undefined;

  constructor(
    readonly def: GraphSeries,
    index: number,
    capacity: number,
  ) {
    this.scale = new Scale({ min: def.min, max: def.max, mode: def.scale });
    this.color = def.color ?? `var(--tp-chart-${(index % 5) + 1})`;
    this.unit = def.unit ?? '';
    this.raw = new Float32Array(capacity).fill(NaN);
  }

  get id(): string {
    return this.def.id;
  }

  get label(): string {
    return this.def.label;
  }

  /** The default readout: value with precision, then the unit. */
  format(): string {
    if (this.def.format) return this.def.format(this);
    return withUnit(formatValue(this.value, this.def.precision ?? 2), this.unit, this.overlaid);
  }
}

/** A page's plot configuration. Arrays are built once per layout so the plot sees stable identities. */
export interface GraphPage {
  readonly series: readonly SeriesState[];
  readonly plotSeries: readonly PlotSeries[];
  /** Replaced (never mutated) when an average guide moves. */
  guides: readonly PlotGuide[];
  readonly title: string;
}

export interface GraphModelOptions {
  capacity: number;
  layout: GraphLayout;
  pages?: readonly (readonly string[])[] | undefined;
  markers?: readonly GraphMarker[] | undefined;
  createStream: StreamFactory;
}

export function validateSeries(series: readonly GraphSeries[]): void {
  const ids = new Set<string>();
  for (const s of series) {
    if (!s.id || !s.label) throw new TypeError('devkit: graph series need an id and a label');
    if (ids.has(s.id)) throw new TypeError(`devkit: duplicate graph series id ${s.id}`);
    ids.add(s.id);
  }
}

/**
 * A graph's data, independent of whether it is on screen: raw ring buffers, per-series ranges,
 * and the plot stream holding the same history normalized to 0..1. Normalizing per series lets
 * series in different units share one plot with a fixed y domain, which keeps incremental paints.
 *
 * Lives as long as the graph; views come and go (lazy mounting, LRU unmounting) and reattach.
 */
export class GraphModel {
  readonly capacity: number;
  readonly series: SeriesState[] = [];
  readonly markers = new Map<string, GraphMarker>();
  stream: PlotStream;
  pages: GraphPage[] = [];
  /** Bumped when the stream, pages or markers are replaced; views reapply on change. */
  layoutRevision = 0;
  /** Bumped when only guides moved; views reassign the page's guides. */
  guidesRevision = 0;
  /** After every recorded frame. */
  onFrame: (() => void) | undefined;
  /** After a layout change (stream, pages, markers). */
  onLayout: (() => void) | undefined;

  readonly #byId = new Map<string, SeriesState>();
  readonly #layout: GraphLayout;
  readonly #explicitPages: readonly (readonly string[])[] | undefined;
  readonly #createStream: StreamFactory;
  readonly #pageListeners = new Set<(page: number) => void>();
  /** Reused for every stream frame: no allocation per sample on our side. */
  #frame: Record<string, number | null> = {};
  #head = 0;
  #count = 0;
  #page = 0;
  #disposed = false;

  constructor(series: readonly GraphSeries[], options: GraphModelOptions) {
    if (series.length === 0) throw new RangeError('devkit: a graph needs at least one series');
    validateSeries(series);
    if (!Number.isSafeInteger(options.capacity) || options.capacity < 2)
      throw new RangeError('devkit: graph bufferSize must be an integer of at least 2');
    this.capacity = options.capacity;
    this.#layout = options.layout;
    this.#explicitPages = options.pages;
    this.#createStream = options.createStream;
    for (const def of series) this.#addState(def);
    for (const marker of options.markers ?? []) this.markers.set(marker.id, marker);
    this.stream = this.#newStream();
    this.#buildPages();
  }

  get count(): number {
    return this.#count;
  }

  get page(): number {
    return this.#page;
  }

  set page(page: number) {
    const count = this.pages.length;
    const next = ((Math.trunc(page) % count) + count) % count;
    if (next === this.#page) return;
    this.#page = next;
    for (const listener of this.#pageListeners) listener(next);
  }

  get currentPage(): GraphPage {
    return this.pages[this.#page]!;
  }

  onPage(listener: (page: number) => void): () => void {
    this.#pageListeners.add(listener);
    return () => this.#pageListeners.delete(listener);
  }

  get(id: string): SeriesState | undefined {
    return this.#byId.get(id);
  }

  /** Stages a value for the next frame. It stays staged (held) until replaced or committed. */
  stage(id: string, value: number | null): void {
    const state = this.#byId.get(id);
    if (!state) throw new RangeError(`devkit: unknown graph series ${id}`);
    state.staged = value;
  }

  /** Stages every given value; unknown ids throw before anything is staged. */
  stageAll(values: Readonly<Record<string, number | null | undefined>>): void {
    for (const id in values)
      if (!this.#byId.has(id)) throw new RangeError(`devkit: unknown graph series ${id}`);
    for (const id in values) this.#byId.get(id)!.staged = values[id] ?? null;
  }

  /**
   * Records one frame from the staged values. `hold` keeps them staged for the next frame (for
   * sampled graphs, where pushed values persist until replaced); otherwise unstaged series gap.
   */
  commit(hold = false): void {
    if (this.#disposed) return;
    const slot = this.#head;
    for (const state of this.series) {
      const value = state.staged;
      const sample = typeof value === 'number' && Number.isFinite(value) ? value : NaN;
      state.raw[slot] = sample;
      state.value = Number.isNaN(sample) ? null : sample;
      if (!hold) state.staged = undefined;
    }
    this.#head = (slot + 1) % this.capacity;
    if (this.#count < this.capacity) this.#count++;
    let refit = false;
    for (const state of this.series) {
      this.measure(state);
      if (state.min !== null && state.scale.fit(state.min, state.max!)) refit = true;
    }
    if (refit) {
      // A range was refitted: renormalize the whole history once (one full redraw).
      this.#replay(this.stream);
      this.#buildPages();
      this.#changedLayout();
    } else {
      const frame = this.#frame;
      for (const state of this.series) {
        const sample = state.raw[slot]!;
        frame[state.def.id] = Number.isNaN(sample) ? null : state.scale.normalize(sample);
      }
      this.stream.push(frame);
      this.#moveAverages();
    }
    this.onFrame?.();
  }

  /** Lowest and highest samples in the history, written into the series' snapshot. */
  measure(state: SeriesState): void {
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    let samples = 0;
    const raw = state.raw;
    const capacity = this.capacity;
    for (let i = 0, slot = (this.#head - this.#count + capacity) % capacity; i < this.#count; i++) {
      const v = raw[slot]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      if (!Number.isNaN(v)) {
        sum += v;
        samples++;
      }
      if (++slot === capacity) slot = 0;
    }
    state.min = lo === Infinity ? null : lo;
    state.max = hi === -Infinity ? null : hi;
    state.mean = samples ? sum / samples : null;
  }

  /** Changes a series' fixed bounds; history is renormalized. */
  setRange(id: string, range: { min?: number | undefined; max?: number | undefined }): void {
    const state = this.#byId.get(id);
    if (!state) throw new RangeError(`devkit: unknown graph series ${id}`);
    state.scale.configure({ min: range.min, max: range.max, mode: state.scale.options.mode });
    this.measure(state);
    if (state.min !== null) state.scale.fit(state.min, state.max!);
    this.#replay(this.stream);
    this.#buildPages();
    this.#changedLayout();
  }

  addSeries(def: GraphSeries): void {
    if (this.#byId.has(def.id)) throw new TypeError(`devkit: duplicate graph series id ${def.id}`);
    validateSeries([def]);
    this.#addState(def);
    this.#replaceStream();
  }

  removeSeries(id: string): void {
    const state = this.#byId.get(id);
    if (!state) return;
    if (this.series.length === 1) throw new RangeError('devkit: a graph needs at least one series');
    this.series.splice(this.series.indexOf(state), 1);
    this.#byId.delete(id);
    delete this.#frame[id];
    this.#replaceStream();
  }

  setMarker(id: string, marker: GraphMarker | null): void {
    if (marker) this.markers.set(id, marker);
    else if (!this.markers.delete(id)) return;
    this.#changedLayout();
  }

  /** Drops the history and resets automatic ranges. */
  clear(): void {
    this.#head = 0;
    this.#count = 0;
    for (const state of this.series) {
      state.raw.fill(NaN);
      state.value = state.min = state.max = null;
      state.scale.reset();
    }
    this.stream.clear();
    this.#buildPages();
    this.#changedLayout();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.stream.dispose();
    this.#pageListeners.clear();
    this.onFrame = this.onLayout = undefined;
  }

  #addState(def: GraphSeries): void {
    const state = new SeriesState(def, this.series.length, this.capacity);
    // A series added later starts with gaps for the frames before it.
    this.series.push(state);
    this.#byId.set(def.id, state);
  }

  #newStream(): PlotStream {
    return this.#createStream(
      this.series.map((s) => s.def.id),
      this.capacity,
    );
  }

  /** The stream's series are fixed, so a series change replaces it; history carries over. */
  #replaceStream(): void {
    const previous = this.stream;
    this.#frame = {};
    this.stream = this.#newStream();
    this.#replay(this.stream);
    this.#buildPages();
    this.#changedLayout();
    previous.dispose();
  }

  /** Rewrites the stream from the raw history with current ranges. */
  #replay(stream: PlotStream): void {
    stream.clear();
    const frame = this.#frame;
    const capacity = this.capacity;
    for (let i = 0, slot = (this.#head - this.#count + capacity) % capacity; i < this.#count; i++) {
      for (const state of this.series) {
        const sample = state.raw[slot]!;
        frame[state.def.id] = Number.isNaN(sample) ? null : state.scale.normalize(sample);
      }
      stream.push(frame);
      if (++slot === capacity) slot = 0;
    }
  }

  #buildPages(): void {
    const groups: SeriesState[][] = [];
    const placed = new Set<SeriesState>();
    for (const ids of this.#explicitPages ?? []) {
      const group = ids.map((id) => this.#byId.get(id)).filter((s) => s !== undefined);
      if (group.length === 0) continue;
      for (const state of group) placed.add(state);
      groups.push(group);
    }
    const rest = this.series.filter((s) => !placed.has(s));
    if (this.#layout === 'overlay' && !this.#explicitPages) {
      if (rest.length) groups.push(rest);
    } else {
      for (const state of rest) groups.push([state]);
    }
    this.pages = groups.map((group) => this.#makePage(group));
    if (this.#page >= this.pages.length) this.#page = 0;
  }

  /** Rebuilds guides when an average guide has drifted about a pixel; history is untouched. */
  #moveAverages(): void {
    let moved = false;
    for (const state of this.series) {
      if (!state.def.guides?.some((g) => g.value === 'average') || state.mean === null) continue;
      if (!(Math.abs(state.scale.normalize(state.mean) - state.averageAt) < AVERAGE_STEP))
        moved = true;
    }
    if (!moved) return;
    for (const page of this.pages) page.guides = this.#guides(page.series);
    this.guidesRevision++;
  }

  #makePage(group: readonly SeriesState[]): GraphPage {
    const alone = group.length === 1;
    for (const state of group) state.overlaid = !alone;
    const plotSeries = group.map((state): PlotSeries => {
      const fill = state.def.fill ?? true;
      const opacity = fill === true ? DEFAULT_FILL / group.length : fill === false ? 0 : fill;
      return {
        id: state.def.id,
        label: state.def.label,
        color: state.color,
        lineWidth: 1.5,
        ...(opacity > 0 ? { fill: { baseline: state.scale.baseline, opacity } } : {}),
      };
    });
    return {
      series: group,
      plotSeries,
      guides: this.#guides(group),
      title: group.map((s) => s.def.label).join(', '),
    };
  }

  /**
   * Guides in front of lines and fills. Fixed ones outside a series' current range are left out
   * rather than pinned to an edge; averages follow the visible history in the series' color.
   */
  #guides(group: readonly SeriesState[]): PlotGuide[] {
    return group.flatMap((state) =>
      (state.def.guides ?? []).flatMap((guide, index): PlotGuide[] => {
        const average = guide.value === 'average';
        const value = average ? state.mean : (guide.value as number);
        if (value === null || !state.scale.contains(value)) return [];
        const at = state.scale.normalize(value);
        if (average) state.averageAt = at;
        return [
          {
            id: `${state.def.id}:${index}`,
            axis: 'y',
            value: at,
            dash: GUIDE_DASH,
            layer: 'front',
            ...(guide.label ? { label: guide.label } : {}),
            ...(guide.color ? { color: guide.color } : average ? { color: state.color } : {}),
          },
        ];
      }),
    );
  }

  #changedLayout(): void {
    this.layoutRevision++;
    this.onLayout?.();
  }
}
