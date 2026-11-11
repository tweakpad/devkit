/**
 * A horizontal reference line: a fixed value in the series' own units (e.g. a 16.7 ms frame
 * budget), or `'average'`, the mean of the visible history, which follows the data.
 */
export interface GraphGuide {
  value: number | 'average';
  label?: string;
  /** Any CSS color. Default: the series' color for an average, else the plot's guide color. */
  color?: string;
}

/** One line of a graph. */
export interface GraphSeries {
  /** Stable id, unique within the graph; `push` and `setRange` address series by it. */
  id: string;
  label: string;
  /** Shown after the value, e.g. `'ms'`. */
  unit?: string;
  /** Decimals in the readout. Default 2. */
  precision?: number;
  /** Fixed lower bound. Omitted: fitted to the visible data (never below 0 for positive data). */
  min?: number;
  /** Fixed upper bound. Omitted: fitted to the visible data, with headroom. */
  max?: number;
  /**
   * How omitted bounds fit the data. `'absolute'` (default): the range includes zero, so lines
   * show true magnitude. `'relative'`: both bounds hug the visible data, so small variations fill
   * the height, for metrics where the change matters more than the size.
   */
  scale?: 'absolute' | 'relative';
  /** Any CSS color. Default: a chart token (`--tp-chart-1`…`5`) by series order. */
  color?: string;
  /**
   * Area under the line: `true`, an opacity, or `false`. Default `true`: the series on one plot
   * share an opacity of 0.15, so overlapping fills stay as light as a single one.
   */
  fill?: boolean | number;
  guides?: readonly GraphGuide[];
  /** Polled every `interval` while the graph is visible. Series without it take `push` values. */
  read?: () => number | null;
  /** Readout text. Default: the value with `precision` decimals and the unit. */
  format?: (series: GraphSeriesSnapshot) => string;
}

/**
 * A series' state for readouts. Objects are reused between calls: read them inside the
 * callback, never keep them.
 */
export interface GraphSeriesSnapshot {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly color: string;
  /** The latest sample; null before the first one, or for a gap. */
  readonly value: number | null;
  /** Lowest and highest sample in the visible history. */
  readonly min: number | null;
  readonly max: number | null;
  /** True when the series shares its plot with others; readouts should then stay short. */
  readonly overlaid: boolean;
}

/** Context for a whole-graph readout `format`. */
export interface GraphHeaderContext {
  readonly page: number;
  /** The series on the current page. */
  readonly series: readonly GraphSeriesSnapshot[];
}

/** Text at the end of the header, e.g. a renderer backend (`'WebGPU'`). */
export interface GraphMarker {
  id: string;
  /** Fixed text. */
  text?: string;
  /** Polled whenever the readout refreshes; returning null or '' hides the marker. */
  read?: () => string | null | undefined;
  /** Tooltip. */
  title?: string;
}

export type GraphLayout = 'paged' | 'overlay';

export interface GraphParams {
  /** Name for search and assistive technology, and the header label unless `showLabel` is false. */
  label: string;
  series: readonly GraphSeries[];
  /**
   * `'paged'` (default): one series per page; click the graph to show the next.
   * `'overlay'`: every series on one plot, each in its own color.
   */
  layout?: GraphLayout;
  /** Explicit pages of series ids; overrides `layout`. Unlisted series get pages of their own. */
  pages?: readonly (readonly string[])[];
  /** Samples kept per series. Default 120, at least 2. */
  bufferSize?: number;
  /** Milliseconds between samples for `read()` series. Default 100. */
  interval?: number;
  /** Milliseconds between readout updates. Default 250. */
  headerInterval?: number;
  /** Keep sampling `read()` series while the graph is hidden or scrolled away. Default false. */
  sampleWhileHidden?: boolean;
  /** Show `label` at the start of the header. Default true. */
  showLabel?: boolean;
  markers?: readonly GraphMarker[];
  /** Replaces the readout of every page with one text. */
  format?: (context: GraphHeaderContext) => string;
  hidden?: boolean;
  disabled?: boolean;
}
