import { sharedScheduler, type FrameStats, type Scheduler } from '../core/scheduler.js';
import { registerElements } from '../controls/register.js';
import { TweakPane, type PaneAnchor } from '../elements/pane.js';
import { ContainerApi } from './container.js';
import { PaneContext } from './context.js';
import type { ColorPickerMode } from '../controls/color.js';
import type { HistoryOptions } from '../history/types.js';
import { createHistory, HistoryApi } from './history.js';

/** Options of `new Pane()`. Every option is optional. */
export interface PaneOptions {
  /**
   * Color picker that color bindings open, including those in inline rows. A binding's
   * `color.picker` overrides it.
   * @default 'native'
   */
  colorPicker?: ColorPickerMode;
  /** Text in the title bar. Also names the pane's stored history unless `history.key` is set. */
  title?: string;
  /**
   * Element the pane is appended to. Omitted, the pane floats over the document body.
   * @default document.body
   */
  container?: HTMLElement;
  /**
   * Whether the pane sits fixed over the page instead of flowing inside `container`. A pane
   * floats unless it is given a `container`.
   */
  floating?: boolean;
  /**
   * Corner of the viewport a floating pane sits in. It also decides which side vertical tabs
   * take when their `side` is `'auto'`.
   * @default 'top-right'
   */
  anchor?: PaneAnchor;
  /**
   * Whether the pane starts open; false collapses it to its title bar.
   * @default true
   */
  expanded?: boolean;
  /**
   * Whether a floating pane can be dragged by its title bar.
   * @default true
   */
  movable?: boolean;
  /**
   * How bindings follow their objects: `'frame'` checks every frame, a number checks every that
   * many milliseconds, and `'manual'` only on `refresh()`. A binding's own `interval` overrides it.
   * @default 'frame'
   */
  refresh?: 'frame' | 'manual' | number;
  /**
   * Library controls kept mounted while off screen. Beyond it, the least recently seen are
   * unmounted first and remount when they come back into view.
   * @default 300
   */
  maxMounted?: number;
  /** A scheduler of its own, e.g. for a separate frame budget. Omitted, all panes share one. */
  scheduler?: Scheduler;
  /**
   * Keeps versions of the control values. `true` stores them in `localStorage` under the pane
   * title, in one working version until `history.advance()`; an object sets the options. Off,
   * it costs nothing.
   * @default false
   */
  history?: boolean | HistoryOptions;
}

/**
 * A tweak pane: bind object properties to inline controls and monitors.
 *
 * ```ts
 * const pane = new Pane({ title: 'Scene' });
 * const camera = pane.addFolder({ title: 'Camera' });
 * camera.addBinding(params, 'fov', { min: 10, max: 120, step: 1 });
 * pane.addBinding(stats, 'fps', { view: 'monitor', monitor: { view: 'graph' }, min: 0, max: 120 });
 * ```
 */
export class Pane extends ContainerApi {
  protected override readonly supportsVerticalTabs = true;
  /** The pane's `<tweak-pane>` element. */
  readonly element: TweakPane;
  /** Versions of the control values; null unless the `history` option is set. */
  readonly history: HistoryApi | null;

  /**
   * Creates a pane and appends it to `container`, or to the document body as a floating pane.
   */
  constructor(options: PaneOptions = {}) {
    registerElements();
    const refresh = options.refresh ?? 'frame';
    const interval = refresh === 'frame' ? 0 : refresh === 'manual' ? -1 : Math.max(0, refresh);
    // Read before any control exists, so each one starts with its stored value.
    const history = createHistory(options.history, options.title);
    const context = new PaneContext(
      options.scheduler ?? sharedScheduler(),
      options.maxMounted ?? 300,
      interval,
      options.colorPicker ?? 'native',
      history,
    );
    const element = document.createElement(TweakPane.tagName) as TweakPane;
    super(context, element.body);
    this.element = element;
    this.history = history && new HistoryApi(history);
    context.refreshSearch = () => {
      if (element.searchQuery.trim()) this.#onSearch();
    };
    element.addEventListener('tweak-search', this.#onSearch);
    element.setAttribute('appearance', 'flat');
    element.setAttribute('density', 'compact');
    element.heading = options.title ?? '';
    element.floating = options.floating ?? !options.container;
    element.anchor = options.anchor ?? 'top-right';
    element.expanded = options.expanded ?? true;
    element.movable = options.movable ?? true;
    (options.container ?? document.body).append(element);
  }

  /** Text in the title bar. */
  get title(): string {
    return this.element.heading;
  }

  set title(title: string) {
    this.element.heading = title;
  }

  /** Whether the pane is open; false collapses it to its title bar. */
  get expanded(): boolean {
    return this.element.expanded;
  }

  set expanded(expanded: boolean) {
    this.element.expanded = expanded;
  }

  /** Re-reads every binding of this pane now, e.g. after a change with `refresh: 'manual'`. */
  refresh(): void {
    for (const binding of this.context.bindings) binding.refresh();
  }

  /** Counters of the last frame of this pane's scheduler, and how many controls are mounted. */
  get stats(): Readonly<FrameStats> & { mounted: number } {
    return { ...this.context.scheduler.stats, mounted: this.context.mountedCount };
  }

  /** Removes the pane and everything in it, stops its work, and saves and closes its history. */
  override dispose(): void {
    this.element.removeEventListener('tweak-search', this.#onSearch);
    this.context.refreshSearch = undefined;
    super.dispose();
    this.history?.dispose();
    this.context.dispose();
    this.element.remove();
  }

  #onSearch = (): void => {
    this.element.searchMatches = this.filter(this.element.searchQuery);
  };
}
