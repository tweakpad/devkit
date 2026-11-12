import type { PlotRenderScheduler } from '@tweakpad/ui/widgets';
import type { ControlView } from './library-view.js';
import { GraphMonitorView } from '../monitors/graph-monitor.js';
import { TextMonitorView } from '../monitors/text-monitor.js';
import type { GraphGuide } from '../graphs/types.js';

/**
 * How a `view: 'monitor'` binding is shown, its `monitor` option. The graph options apply only
 * with `view: 'graph'`.
 */
export interface MonitorOptions {
  /**
   * `'text'` shows the value; `'graph'` draws the history of a numeric value with its latest
   * value.
   * @default 'text'
   */
  view?: 'text' | 'graph';
  /**
   * Samples the graph keeps, at least 2.
   * @default 64
   */
  bufferSize?: number;
  /**
   * Graph line color, any CSS color.
   * @default var(--tp-chart-1)
   */
  color?: string;
  /**
   * Area under the graph line: `true`, an opacity, or `false`. `true` uses an opacity of 0.15.
   * @default true
   */
  fill?: boolean | number;
  /** Horizontal reference lines in the binding's units, drawn dashed in front of the data. */
  guides?: readonly GraphGuide[];
  /**
   * How omitted `min`/`max` fit the graph to the data: `'absolute'` includes zero, `'relative'`
   * hugs the data.
   * @default 'absolute'
   */
  scale?: 'absolute' | 'relative';
}

export interface MonitorGraphContext {
  /** Paint rate cap for the plot. */
  maxFrameRate: number;
  scheduler: () => PlotRenderScheduler;
}

/** A passive binding control using exactly the normal mount/write/visibility lifecycle. */
export class MonitorView implements ControlView<unknown> {
  readonly heavy = false;
  #text: TextMonitorView | null = null;
  #element: HTMLElement | null = null;
  #visible = false;
  /** Created once: the graph keeps its history across mounts. */
  readonly #graph: GraphMonitorView | null;

  constructor(
    private readonly label: string,
    options: MonitorOptions,
    private readonly precision: number,
    min: number | undefined,
    max: number | undefined,
    graph: MonitorGraphContext,
  ) {
    this.#graph =
      options.view === 'graph'
        ? new GraphMonitorView({
            label,
            precision,
            min,
            max,
            bufferSize: options.bufferSize ?? 64,
            color: options.color,
            fill: options.fill,
            guides: options.guides,
            scale: options.scale,
            maxFrameRate: graph.maxFrameRate,
            scheduler: graph.scheduler,
          })
        : null;
  }

  mount(row: HTMLElement, disabled: boolean): void {
    if (this.#graph) {
      this.#element = this.#graph.mount();
    } else {
      this.#text = new TextMonitorView(this.label, this.precision);
      this.#element = this.#text.element;
    }
    row.replaceChildren(this.#element);
    this.setDisabled(disabled);
    this.setVisible(this.#visible);
  }

  write(value: unknown): void {
    if (this.#graph) this.#graph.write(value);
    else this.#text?.write(value);
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.#graph?.setVisible(visible);
  }

  setDisabled(disabled: boolean): void {
    if (this.#graph) this.#graph.setDisabled(disabled);
    else this.#element?.toggleAttribute('data-disabled', disabled);
  }

  unmount(): void {
    this.#graph?.unmount();
    this.#element?.remove();
    this.#element = null;
    this.#text = null;
  }
}
