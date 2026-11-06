import type { ControlView } from './library-view.js';
import { GraphMonitorView } from '../monitors/graph-monitor.js';
import { TextMonitorView } from '../monitors/text-monitor.js';

export interface MonitorOptions {
  /** Text is the default; graph draws numeric history supplied by the binding. */
  view?: 'text' | 'graph';
  /** Graph history capacity. Default 64, at least 2. */
  bufferSize?: number;
}

/** A passive binding control using exactly the normal mount/write/visibility lifecycle. */
export class MonitorView implements ControlView<unknown> {
  readonly heavy = false;
  #renderer: TextMonitorView | GraphMonitorView | null = null;
  #visible = false;

  constructor(
    private readonly label: string,
    private readonly options: MonitorOptions,
    private readonly precision: number,
    private readonly min: number | undefined,
    private readonly max: number | undefined,
  ) {}

  mount(row: HTMLElement, disabled: boolean): void {
    this.#renderer =
      this.options.view === 'graph'
        ? new GraphMonitorView({
            label: this.label,
            precision: this.precision,
            min: this.min,
            max: this.max,
            bufferSize: this.options.bufferSize ?? 64,
          })
        : new TextMonitorView(this.label, this.precision);
    row.replaceChildren(this.#renderer.element);
    this.setDisabled(disabled);
    this.setVisible(this.#visible);
  }

  write(value: unknown): void {
    this.#renderer?.write(value);
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    if (this.#renderer instanceof GraphMonitorView) this.#renderer.setVisible(visible);
  }

  setDisabled(disabled: boolean): void {
    this.#renderer?.element.toggleAttribute('data-disabled', disabled);
  }

  unmount(): void {
    if (this.#renderer instanceof GraphMonitorView) this.#renderer.dispose();
    this.#renderer?.element.remove();
    this.#renderer = null;
  }
}
