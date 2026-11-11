import type { MountableRow, PaneContext } from '../api/context.js';
import { SearchableRow } from '../api/rows.js';
import type { Sampler, Scheduler } from '../core/scheduler.js';
import type { SearchMetadata } from '../core/search.js';
import type { GraphModel } from './graph-model.js';
import { GraphView, type GraphViewOptions } from './graph-view.js';

/**
 * Per-frame work that feeds graphs, e.g. polling `read()` series or measuring frames. One ticker
 * can feed several graphs; it samples while at least one of them wants it, and only once per
 * frame however many do.
 */
export abstract class GraphTicker implements Sampler {
  slot = -1;
  readonly #users = new Set<object>();

  constructor(private readonly scheduler: Scheduler) {}

  /** Whether there is anything to tick; a graph fed only by `push` has nothing. */
  abstract get active(): boolean;
  /** Called every frame while sampling. */
  abstract tick(now: number): void;
  /** Called when sampling (re)starts, so a pause is not measured as one long frame. */
  abstract reset(): void;

  sample(now: number): void {
    this.tick(now);
  }

  /** A graph starts or stops wanting samples. */
  want(user: object, wanted: boolean): void {
    if (wanted) this.#users.add(user);
    else this.#users.delete(user);
    this.update();
  }

  /** Re-evaluates whether to sample, e.g. after `active` changed. */
  update(): void {
    const sampling = this.#users.size > 0 && this.active;
    if (sampling && this.slot === -1) {
      this.reset();
      this.scheduler.activate(this);
    } else if (!sampling && this.slot !== -1) {
      this.scheduler.deactivate(this);
    }
  }
}

/** Polls `read()` series every `interval` ms and records one frame. */
export class ReadTicker extends GraphTicker {
  #next = -1;
  constructor(
    scheduler: Scheduler,
    private readonly model: GraphModel,
    private readonly interval: number,
  ) {
    super(scheduler);
  }

  get active(): boolean {
    return this.model.series.some((s) => s.def.read);
  }

  tick(now: number): void {
    if (this.#next >= 0 && now < this.#next) return;
    // No catch-up: after a stall the next sample is one interval from now.
    this.#next =
      this.#next < 0 || now - this.#next > this.interval
        ? now + this.interval
        : this.#next + this.interval;
    for (const state of this.model.series) {
      const read = state.def.read;
      if (read) state.staged = read();
    }
    this.model.commit(true);
  }

  reset(): void {
    this.#next = -1;
  }
}

/**
 * A graph row: lazily mounted like a control row, sampling only while visible (unless told
 * otherwise). The model and its history survive unmounting; a remounted plot redraws it.
 */
export class GraphRow extends SearchableRow implements MountableRow {
  queued = false;
  readonly metadata: SearchMetadata;
  #view: GraphView | null = null;
  #mounted = false;

  constructor(
    private readonly context: PaneContext,
    readonly model: GraphModel,
    private readonly viewOptions: Omit<GraphViewOptions, 'scheduler'>,
    readonly ticker: GraphTicker | null,
    private readonly sampleWhileHidden: boolean,
  ) {
    super(document.createElement('div'));
    this.metadata = {
      name: viewOptions.label,
      get label() {
        return [viewOptions.label, ...model.series.map((s) => s.def.label)].join(' ');
      },
    };
    model.onFrame = () => this.#view?.refresh();
    model.onLayout = () => {
      this.#view?.applyLayout();
      this.#updateSampling();
    };
    this.#renderPlaceholder();
  }

  get isMounted(): boolean {
    return this.#mounted;
  }

  get view(): GraphView | null {
    return this.#view;
  }

  /** True when values come from a ticker, so pushed values are held until the next sample. */
  get sampled(): boolean {
    return this.ticker?.active ?? false;
  }

  run(): void {
    if (this.disposed || this.#mounted || !this.visible) return;
    const view = new GraphView(this.model, {
      ...this.viewOptions,
      scheduler: this.context.plotScheduler,
    });
    this.surface.className = 'row';
    this.surface.replaceChildren(view.element);
    this.#view = view;
    this.#mounted = true;
    view.setDisabled(this.effectiveDisabled);
    view.setVisible(this.visible);
    this.context.mounted(this);
  }

  unmount(): void {
    if (!this.#mounted) return;
    this.#mounted = false;
    this.#view?.dispose();
    this.#view = null;
    this.context.forget(this);
    this.#renderPlaceholder();
  }

  override dispose(): void {
    this.ticker?.want(this, false);
    this.unmount();
    this.model.dispose();
    super.dispose();
  }

  protected override syncDisabled(disabled: boolean): void {
    this.#view?.setDisabled(disabled);
    this.element.toggleAttribute('data-disabled', disabled);
  }

  protected override syncVisibility(visible: boolean): void {
    this.#view?.setVisible(visible);
    this.#updateSampling();
    if (!visible) return;
    if (this.#mounted) this.context.touch(this);
    else this.context.scheduler.enqueueJob(this);
  }

  #updateSampling(): void {
    this.ticker?.want(
      this,
      !this.disposed && (this.visible || (this.sampleWhileHidden && !this.hidden)),
    );
  }

  #renderPlaceholder(): void {
    // Same box as the mounted graph, so mounting does not shift the rows below.
    this.surface.className = 'row monitor graph placeholder';
    const head = document.createElement('div');
    head.className = 'head';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = this.viewOptions.label;
    head.append(label);
    const body = document.createElement('div');
    body.className = 'plot-placeholder';
    this.surface.replaceChildren(head, body);
  }
}
