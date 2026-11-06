import { sharedScheduler, type FrameStats, type Scheduler } from '../core/scheduler.js';
import { registerElements } from '../controls/register.js';
import { TweakPane, type PaneAnchor } from '../elements/pane.js';
import { ContainerApi } from './container.js';
import { PaneContext } from './context.js';

export interface PaneOptions {
  title?: string;
  /** Where the pane goes. Omitted: a floating pane on the document body. */
  container?: HTMLElement;
  /** Floating panes sit fixed over the page; set false to flow inside `container`. */
  floating?: boolean;
  anchor?: PaneAnchor;
  expanded?: boolean;
  /** Floating panes can be dragged by their title bar. Default true. */
  movable?: boolean;
  /**
   * How input bindings follow their objects: `'frame'` checks every frame (default), a number
   * checks every that many ms, `'manual'` only on `refresh()`.
   */
  refresh?: 'frame' | 'manual' | number;
  /** Library controls kept mounted while off screen before the least recent ones go. Default 300. */
  maxMounted?: number;
  /** A scheduler of its own (e.g. a separate frame budget); by default all panes share one. */
  scheduler?: Scheduler;
}

/**
 * A tweak pane: bind object properties to inline controls and monitors.
 *
 * ```ts
 * const pane = new Pane({ title: 'Scene' });
 * const camera = pane.addFolder({ title: 'Camera' });
 * camera.addBinding(params, 'fov', { min: 10, max: 120, step: 1 });
 * pane.addMonitor(stats, 'fps', { view: 'graph', min: 0, max: 120 });
 * ```
 */
export class Pane extends ContainerApi {
  readonly element: TweakPane;

  constructor(options: PaneOptions = {}) {
    registerElements();
    const refresh = options.refresh ?? 'frame';
    const interval = refresh === 'frame' ? 0 : refresh === 'manual' ? -1 : Math.max(0, refresh);
    const context = new PaneContext(
      options.scheduler ?? sharedScheduler(),
      options.maxMounted ?? 300,
      interval,
    );
    const element = document.createElement(TweakPane.tagName) as TweakPane;
    super(context, element.body);
    this.element = element;
    element.setAttribute('appearance', 'flat');
    element.setAttribute('density', 'compact');
    element.heading = options.title ?? '';
    element.floating = options.floating ?? !options.container;
    element.anchor = options.anchor ?? 'top-right';
    element.expanded = options.expanded ?? true;
    element.movable = options.movable ?? true;
    (options.container ?? document.body).append(element);
  }

  get title(): string {
    return this.element.heading;
  }

  set title(title: string) {
    this.element.heading = title;
  }

  get expanded(): boolean {
    return this.element.expanded;
  }

  set expanded(expanded: boolean) {
    this.element.expanded = expanded;
  }

  /** Re-reads every binding of this pane now. */
  refresh(): void {
    for (const binding of this.context.bindings) binding.refresh();
  }

  /** Counters of the last frame of this pane's scheduler. */
  get stats(): Readonly<FrameStats> & { mounted: number } {
    return { ...this.context.scheduler.stats, mounted: this.context.mountedCount };
  }

  override dispose(): void {
    super.dispose();
    this.context.dispose();
    this.element.remove();
  }
}
