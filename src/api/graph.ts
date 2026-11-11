import { GraphModel } from '../graphs/graph-model.js';
import { createIndexStream } from '../graphs/stream.js';
import { frameRateFor } from '../graphs/graph-view.js';
import { GraphRow, ReadTicker, type GraphTicker } from '../graphs/graph-row.js';
import type { GraphMarker, GraphParams, GraphSeries } from '../graphs/types.js';
import type { PaneContext } from './context.js';

export interface GraphSetup {
  label: string;
  showLabel: boolean;
  headerInterval: number;
  maxFrameRate: number;
  sampleWhileHidden: boolean;
  format: GraphParams['format'];
}

export function validateTiming(
  interval: number | undefined,
  headerInterval: number | undefined,
): void {
  if (interval !== undefined && !(interval > 0 && Number.isFinite(interval)))
    throw new RangeError('devkit: graph interval must be a positive number of ms');
  if (headerInterval !== undefined && !(headerInterval >= 0 && Number.isFinite(headerInterval)))
    throw new RangeError('devkit: graph headerInterval must be a nonnegative number of ms');
}

export function createGraphModel(
  series: readonly GraphSeries[],
  params: {
    bufferSize?: number | undefined;
    layout?: GraphParams['layout'] | undefined;
    pages?: GraphParams['pages'] | undefined;
    markers?: GraphParams['markers'] | undefined;
  },
): GraphModel {
  return new GraphModel(series, {
    capacity: params.bufferSize ?? 120,
    layout: params.layout ?? 'paged',
    pages: params.pages,
    markers: params.markers,
    createStream: createIndexStream,
  });
}

export function createGraphRow(
  context: PaneContext,
  model: GraphModel,
  setup: GraphSetup,
  ticker: GraphTicker | null,
): GraphRow {
  return new GraphRow(
    context,
    model,
    {
      label: setup.label,
      showLabel: setup.showLabel,
      headerInterval: setup.headerInterval,
      maxFrameRate: setup.maxFrameRate,
      format: setup.format,
    },
    ticker,
    setup.sampleWhileHidden,
  );
}

/** Builds the row behind `addGraph`. */
export function createGraph(context: PaneContext, params: GraphParams): GraphRow {
  validateTiming(params.interval, params.headerInterval);
  const model = createGraphModel(params.series, params);
  const interval = params.interval ?? 100;
  const hasReaders = params.series.some((s) => s.read);
  return createGraphRow(
    context,
    model,
    {
      label: params.label,
      showLabel: params.showLabel ?? true,
      headerInterval: params.headerInterval ?? 250,
      maxFrameRate: frameRateFor(
        hasReaders || params.interval !== undefined ? interval : undefined,
      ),
      sampleWhileHidden: params.sampleWhileHidden ?? false,
      format: params.format,
    },
    new ReadTicker(context.scheduler, model, interval),
  );
}

/** The handle `addGraph` returns. */
export class GraphApi {
  constructor(
    protected readonly row: GraphRow,
    protected readonly context: PaneContext,
  ) {}

  /** The stable visibility shell containing the graph or its placeholder. */
  get element(): HTMLElement {
    return this.row.element;
  }

  get label(): string {
    return this.row.metadata.name;
  }

  get hidden(): boolean {
    return this.row.hidden;
  }

  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
    this.context.refreshSearch?.();
  }

  get disabled(): boolean {
    return this.row.disabled;
  }

  /** Disabled graphs keep recording but are dimmed and cannot change pages. */
  set disabled(disabled: boolean) {
    this.row.setDisabled(disabled);
  }

  /** The page shown, 0-based; setting wraps around. */
  get page(): number {
    return this.row.model.page;
  }

  set page(page: number) {
    this.row.model.page = page;
  }

  get pageCount(): number {
    return this.row.model.pages.length;
  }

  /**
   * Records values by series id. On a graph with `read()` series (or a performance monitor) the
   * values are held and recorded with the next sample; otherwise each call records one frame,
   * and series left out get a gap.
   */
  push(values: Readonly<Record<string, number | null | undefined>>): void {
    const model = this.row.model;
    model.stageAll(values);
    if (!this.row.sampled) model.commit();
  }

  /** Sets a header marker's text, or removes it with null. */
  setMarker(id: string, text: string | null, options: Omit<GraphMarker, 'id' | 'text'> = {}): void {
    this.row.model.setMarker(id, text === null ? null : { ...options, id, text });
  }

  /** Fixes or frees a series' bounds; omitted bounds become automatic. */
  setRange(id: string, range: { min?: number; max?: number }): void {
    this.row.model.setRange(id, range);
  }

  addSeries(series: GraphSeries): void {
    this.row.model.addSeries(series);
  }

  removeSeries(id: string): void {
    this.row.model.removeSeries(id);
  }

  /** Drops the history and resets automatic ranges. */
  clear(): void {
    this.row.model.clear();
  }

  on(type: 'page', listener: (page: number) => void): () => void {
    void type;
    return this.row.model.onPage(listener);
  }

  dispose(): void {
    this.row.dispose();
    this.context.refreshSearch?.();
  }
}
