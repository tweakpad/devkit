import type { PlotRenderScheduler, TpPlot } from '@tweakpad/ui/widgets';
import type { GraphModel } from './graph-model.js';
import type { GraphHeaderContext } from './types.js';

export interface GraphViewOptions {
  label: string;
  showLabel: boolean;
  headerInterval: number;
  /** Paint rate cap for the plot, in frames per second. */
  maxFrameRate: number;
  scheduler: PlotRenderScheduler;
  format?: ((context: GraphHeaderContext) => string) | undefined;
}

/** Paint at the sample rate: painting more often than data arrives draws nothing new. */
export function frameRateFor(interval: number | undefined): number {
  if (interval === undefined || interval <= 0) return 30;
  return Math.min(60, Math.max(1, Math.ceil(1000 / interval)));
}

// Stable identities: the plot treats a new object as a configuration change (full redraw).
// The header shows the label; the canvas is painted with the row's own surface and squared off,
// so the plot and its row read as one surface.
const PARTS: TpPlot['partPresentation'] = Object.freeze({
  'plot-label': { styleHook: { display: 'none' } },
  'plot-surface': {
    styleHook: { '--tp-plot-surface': 'var(--tweak-graph-surface)', 'border-radius': '0' },
  },
});
const STRINGS = Object.freeze({ empty: '' });
const Y_DOMAIN = Object.freeze([0, 1] as const);

interface Entry {
  element: HTMLSpanElement;
  text: Text;
  shown: string;
}

interface MarkerNode {
  element: HTMLSpanElement;
  text: Text;
  shown: string;
}

/**
 * The on-screen part of a graph: a header (label, readout, markers, page dots) over a
 * `<tp-plot>` attached to the model's stream. Readouts refresh at most every `headerInterval`
 * and write text nodes only when their text changed; the plot paints on its own scheduler.
 */
export class GraphView {
  readonly element: HTMLDivElement;
  readonly #model: GraphModel;
  readonly #options: GraphViewOptions;
  readonly #plot: TpPlot;
  readonly #readout: HTMLSpanElement;
  readonly #markers: HTMLSpanElement;
  readonly #dots: HTMLSpanElement;
  #entries: Entry[] = [];
  readonly #markerNodes = new Map<string, MarkerNode>();
  #layoutRevision = -1;
  #guidesRevision = -1;
  #visible = false;
  #disabled = false;
  #lastHeader = -Infinity;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #dirty = true;
  readonly #context: { page: number; series: GraphHeaderContext['series'] } = {
    page: 0,
    series: [],
  };
  readonly #unsubscribePage: () => void;

  constructor(model: GraphModel, options: GraphViewOptions) {
    this.#model = model;
    this.#options = options;

    const row = document.createElement('div');
    row.className = 'row monitor graph';
    const head = document.createElement('div');
    head.className = 'head';
    if (options.showLabel) {
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = options.label;
      head.append(label);
    }
    this.#readout = document.createElement('span');
    this.#readout.className = 'value readout';
    this.#markers = document.createElement('span');
    this.#markers.className = 'markers';
    this.#dots = document.createElement('span');
    this.#dots.className = 'pages';
    this.#dots.setAttribute('aria-hidden', 'true');
    head.append(this.#readout, this.#markers, this.#dots);

    const plot = document.createElement('tp-plot') as TpPlot;
    plot.label = options.label;
    plot.partPresentation = PARTS;
    plot.strings = STRINGS;
    plot.mode = 'push';
    plot.yDomain = Y_DOMAIN;
    plot.window = model.capacity - 1;
    plot.background = 'solid';
    plot.maxFrameRate = options.maxFrameRate;
    plot.scheduler = options.scheduler;
    this.#plot = plot;

    row.append(head, plot);
    this.element = row;
    row.addEventListener('click', this.#onClick);
    row.addEventListener('keydown', this.#onKey);
    this.#unsubscribePage = model.onPage(() => this.#applyPage());
    this.applyLayout();
  }

  get plot(): TpPlot {
    return this.#plot;
  }

  /** Reapplies stream, page and markers if the model's layout changed since last time. */
  applyLayout(): void {
    const model = this.#model;
    if (this.#layoutRevision === model.layoutRevision) return;
    this.#layoutRevision = model.layoutRevision;
    if (this.#plot.stream !== model.stream) this.#plot.stream = model.stream;
    this.#syncMarkers();
    this.#applyPage();
  }

  setVisible(visible: boolean): void {
    if (visible === this.#visible) return;
    this.#visible = visible;
    if (visible) this.refresh(true);
  }

  setDisabled(disabled: boolean): void {
    this.#disabled = disabled;
    this.element.toggleAttribute('data-disabled', disabled);
    this.#syncInteractive();
  }

  /** A frame was recorded: refresh the readout, throttled to `headerInterval`. */
  refresh(force = false): void {
    this.#dirty = true;
    if (!this.#visible) return;
    const now = performance.now();
    const wait = this.#lastHeader + this.#options.headerInterval - now;
    if (!force && wait > 0) {
      // Trailing refresh so the last value of a burst is always shown.
      this.#timer ??= setTimeout(() => {
        this.#timer = undefined;
        if (this.#dirty) this.refresh(true);
      }, wait);
      return;
    }
    this.#lastHeader = now;
    this.#dirty = false;
    this.#writeHeader();
  }

  dispose(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#unsubscribePage();
    this.element.removeEventListener('click', this.#onClick);
    this.element.removeEventListener('keydown', this.#onKey);
    this.element.remove();
  }

  #applyPage(): void {
    const model = this.#model;
    const page = model.currentPage;
    const plot = this.#plot;
    if (plot.series !== page.plotSeries) plot.series = page.plotSeries;
    if (plot.guides !== page.guides) plot.guides = page.guides;
    this.#guidesRevision = model.guidesRevision;
    this.#context.page = model.page;
    this.#context.series = page.series;
    this.#buildEntries();
    this.#syncDots();
    this.#syncInteractive();
    this.refresh(true);
  }

  #buildEntries(): void {
    const series = this.#model.currentPage.series;
    const single = this.#options.format !== undefined;
    const count = single ? 1 : series.length;
    const nodes: Node[] = [];
    this.#entries = [];
    for (let i = 0; i < count; i++) {
      const entry = document.createElement('span');
      entry.className = 'entry';
      if (!single && series.length > 1) {
        // Overlaid: the value takes its line's color; the label is in the tooltip.
        entry.style.color = series[i]!.color;
        entry.title = series[i]!.label;
      }
      const text = document.createTextNode('');
      entry.append(text);
      this.#entries.push({ element: entry, text, shown: '' });
      nodes.push(entry);
    }
    this.#readout.replaceChildren(...nodes);
  }

  #writeHeader(): void {
    const model = this.#model;
    // Moved average guides follow at the readout's pace; only the guide layer repaints.
    if (this.#guidesRevision !== model.guidesRevision) {
      this.#guidesRevision = model.guidesRevision;
      this.#plot.guides = model.currentPage.guides;
    }
    const series = model.currentPage.series;
    if (this.#options.format) {
      this.#write(this.#entries[0], this.#options.format(this.#context));
    } else {
      for (let i = 0; i < series.length; i++) this.#write(this.#entries[i], series[i]!.format());
    }
    for (const [id, node] of this.#markerNodes) {
      const marker = model.markers.get(id);
      const text = (marker?.read ? marker.read() : marker?.text) ?? '';
      if (text === node.shown) continue;
      node.shown = text;
      node.text.data = text;
      node.element.hidden = text === '';
    }
  }

  #write(entry: Entry | undefined, text: string): void {
    if (!entry || entry.shown === text) return;
    entry.shown = text;
    entry.text.data = text;
  }

  #syncMarkers(): void {
    const markers = this.#model.markers;
    for (const [id, node] of this.#markerNodes)
      if (!markers.has(id)) {
        node.element.remove();
        this.#markerNodes.delete(id);
      }
    for (const [id, marker] of markers) {
      let node = this.#markerNodes.get(id);
      if (!node) {
        const element = document.createElement('span');
        element.className = 'marker';
        element.hidden = true;
        const text = document.createTextNode('');
        element.append(text);
        node = { element, text, shown: '' };
        this.#markerNodes.set(id, node);
      }
      // Fixed text may have changed under the same id.
      node.shown = '\0';
      if (marker.title) node.element.title = marker.title;
      else node.element.removeAttribute('title');
      this.#markers.append(node.element);
    }
  }

  #syncDots(): void {
    const pages = this.#model.pages.length;
    if (pages < 2) {
      this.#dots.replaceChildren();
      return;
    }
    if (this.#dots.childElementCount !== pages) {
      const dots: HTMLElement[] = [];
      for (let i = 0; i < pages; i++) {
        const dot = document.createElement('i');
        dot.className = 'dot';
        dots.push(dot);
      }
      this.#dots.replaceChildren(...dots);
    }
    const active = this.#model.page;
    for (let i = 0; i < pages; i++)
      this.#dots.children[i]!.toggleAttribute('data-active', i === active);
  }

  #syncInteractive(): void {
    const model = this.#model;
    const row = this.element;
    if (model.pages.length < 2) {
      row.removeAttribute('role');
      row.removeAttribute('tabindex');
      row.removeAttribute('aria-label');
      row.removeAttribute('aria-disabled');
      return;
    }
    const next = model.pages[(model.page + 1) % model.pages.length]!;
    row.setAttribute('role', 'button');
    row.setAttribute(
      'aria-label',
      `${this.#options.label}: ${model.currentPage.title}. Show ${next.title}`,
    );
    if (this.#disabled) {
      row.removeAttribute('tabindex');
      row.setAttribute('aria-disabled', 'true');
    } else {
      row.tabIndex = 0;
      row.removeAttribute('aria-disabled');
    }
  }

  #next(): void {
    if (this.#disabled || this.#model.pages.length < 2) return;
    this.#model.page = this.#model.page + 1;
  }

  #onClick = (): void => this.#next();

  #onKey = (event: KeyboardEvent): void => {
    if (event.target !== this.element || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    this.#next();
  };
}
