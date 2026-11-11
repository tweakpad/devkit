import type { PlotRenderScheduler } from '@tweakpad/ui/widgets';
import { GraphModel } from '../graphs/graph-model.js';
import { GraphView } from '../graphs/graph-view.js';
import { createIndexStream } from '../graphs/stream.js';
import type { GraphGuide } from '../graphs/types.js';

export interface GraphOptions {
  label: string;
  min?: number | undefined;
  max?: number | undefined;
  /** Samples kept; one sample per interval. */
  bufferSize: number;
  precision: number;
  color?: string | undefined;
  fill?: boolean | number | undefined;
  guides?: readonly GraphGuide[] | undefined;
  scale?: 'absolute' | 'relative' | undefined;
  maxFrameRate: number;
  scheduler: () => PlotRenderScheduler;
}

/**
 * The graph view of a monitor binding: a one-series graph fed by the binding's samples. The
 * history lives in the model, so it survives the view being unmounted and mounted again.
 */
export class GraphMonitorView {
  readonly #options: GraphOptions;
  readonly #model: GraphModel;
  #view: GraphView | null = null;

  constructor(options: GraphOptions) {
    this.#options = options;
    this.#model = new GraphModel(
      [
        {
          id: 'value',
          label: options.label,
          precision: options.precision,
          ...(options.min !== undefined ? { min: options.min } : {}),
          ...(options.max !== undefined ? { max: options.max } : {}),
          ...(options.color !== undefined ? { color: options.color } : {}),
          ...(options.fill !== undefined ? { fill: options.fill } : {}),
          ...(options.guides !== undefined ? { guides: options.guides } : {}),
          ...(options.scale !== undefined ? { scale: options.scale } : {}),
        },
      ],
      {
        capacity: Math.max(2, options.bufferSize),
        layout: 'paged',
        createStream: createIndexStream,
      },
    );
    this.#model.onFrame = () => this.#view?.refresh();
    this.#model.onLayout = () => this.#view?.applyLayout();
  }

  /** Creates the on-screen graph; the model's history is drawn at once. */
  mount(): HTMLElement {
    this.#view ??= new GraphView(this.#model, {
      label: this.#options.label,
      showLabel: true,
      headerInterval: 100,
      maxFrameRate: this.#options.maxFrameRate,
      scheduler: this.#options.scheduler(),
    });
    return this.#view.element;
  }

  write(value: unknown): void {
    const sample = Number(value);
    this.#model.stage('value', Number.isFinite(sample) ? sample : null);
    this.#model.commit();
  }

  setVisible(visible: boolean): void {
    this.#view?.setVisible(visible);
  }

  setDisabled(disabled: boolean): void {
    this.#view?.setDisabled(disabled);
  }

  /** Drops the view; the history stays for the next mount. */
  unmount(): void {
    this.#view?.dispose();
    this.#view = null;
  }
}
