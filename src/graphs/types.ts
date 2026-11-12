/**
 * A horizontal reference line: a fixed value in the series' own units (e.g. a 16.7 ms frame
 * budget), or `'average'`, the mean of the visible history, which follows the data.
 */
export interface GraphGuide {
  /** A number in the series' units, or `'average'` for the mean of the visible history. */
  value: number | 'average';
  /** Text drawn with the line. */
  label?: string;
  /** Any CSS color. Default: the series' color for an average, else the plot's guide color. */
  color?: string;
}

/** One line of a graph. */
export interface GraphSeries {
  /** Stable id, unique within the graph; `push` and `setRange` address series by it. */
  id: string;
  /** Name of the series in search, page titles and tooltips. */
  label: string;
  /** Shown after the value, e.g. `'ms'`. */
  unit?: string;
  /**
   * Decimals in the readout.
   * @default 2
   */
  precision?: number;
  /** Fixed lower bound. Omitted: fitted to the visible data (never below 0 for positive data). */
  min?: number;
  /** Fixed upper bound. Omitted: fitted to the visible data, with headroom. */
  max?: number;
  /**
   * How omitted bounds fit the data. `'absolute'`: the range includes zero, so lines show true
   * magnitude. `'relative'`: both bounds hug the visible data, so small variations fill the
   * height, for metrics where the change matters more than the size.
   * @default 'absolute'
   */
  scale?: 'absolute' | 'relative';
  /** Any CSS color. Default: a chart token (`--tp-chart-1`…`5`) by series order. */
  color?: string;
  /**
   * Area under the line: `true`, an opacity, or `false`. With `true`, the series on one plot
   * share an opacity of 0.15, so overlapping fills stay as light as a single one.
   * @default true
   */
  fill?: boolean | number;
  /** Horizontal reference lines, drawn dashed in front of the data. */
  guides?: readonly GraphGuide[];
  /** Polled every `interval` while the graph is visible. Series without it take `push` values. */
  read?: () => number | null;
  /**
   * Readout text from the series' snapshot. Omitted: the value with `precision` decimals and the
   * unit.
   */
  format?: (series: GraphSeriesSnapshot) => string;
}

/**
 * A series' state for readouts. Objects are reused between calls: read them inside the
 * callback, never keep them.
 */
export interface GraphSeriesSnapshot {
  /** The series' id. */
  readonly id: string;
  /** The series' label. */
  readonly label: string;
  /** The series' unit; empty when it has none. */
  readonly unit: string;
  /** The series' line color, a CSS color. */
  readonly color: string;
  /** The latest sample; null before the first one, or for a gap. */
  readonly value: number | null;
  /** Lowest sample in the visible history; null before the first one. */
  readonly min: number | null;
  /** Highest sample in the visible history; null before the first one. */
  readonly max: number | null;
  /** True when the series shares its plot with others; readouts should then stay short. */
  readonly overlaid: boolean;
}

/** Context for a whole-graph readout `format`. */
export interface GraphHeaderContext {
  /** Index of the page shown, 0-based. */
  readonly page: number;
  /** The series on the current page. */
  readonly series: readonly GraphSeriesSnapshot[];
}

/** Text at the end of the header, e.g. a renderer backend (`'WebGPU'`). */
export interface GraphMarker {
  /** Stable id, unique among the graph's markers; `setMarker` addresses markers by it. */
  id: string;
  /** Fixed text. */
  text?: string;
  /** Polled whenever the readout refreshes; returning null or '' hides the marker. */
  read?: () => string | null | undefined;
  /** Tooltip of the marker. */
  title?: string;
}

/** How a graph shows several series: `'paged'` one per page, `'overlay'` all on one plot. */
export type GraphLayout = 'paged' | 'overlay';

/** Options of `addGraph()`. */
export interface GraphParams {
  /** Name for search and assistive technology, and the header label unless `showLabel` is false. */
  label: string;
  /** The series, in order; at least one, each with a unique `id`. */
  series: readonly GraphSeries[];
  /**
   * `'paged'`: one series per page; click the graph to show the next. `'overlay'`: every series
   * on one plot, each in its own color.
   * @default 'paged'
   */
  layout?: GraphLayout;
  /** Explicit pages of series ids; overrides `layout`. Unlisted series get pages of their own. */
  pages?: readonly (readonly string[])[];
  /**
   * Samples kept per series, at least 2.
   * @default 120
   */
  bufferSize?: number;
  /**
   * Milliseconds between samples for `read()` series.
   * @default 100
   */
  interval?: number;
  /**
   * Milliseconds between readout updates. The last value of a burst is always shown.
   * @default 250
   */
  headerInterval?: number;
  /**
   * Keep sampling `read()` series while the graph is hidden, collapsed or scrolled away.
   * @default false
   */
  sampleWhileHidden?: boolean;
  /**
   * Show `label` at the start of the header.
   * @default true
   */
  showLabel?: boolean;
  /** Text at the end of the header: fixed, or polled with the readout. */
  markers?: readonly GraphMarker[];
  /** Replaces the readout of every page with one text. */
  format?: (context: GraphHeaderContext) => string;
  /**
   * Starts the graph hidden, which also leaves it out of search.
   * @default false
   */
  hidden?: boolean;
  /**
   * Starts the graph disabled: dimmed, still recording, and not changing pages.
   * @default false
   */
  disabled?: boolean;
}
