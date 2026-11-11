import { createPlotScheduler, type PlotScheduler } from '@tweakpad/ui/widgets';
import type { Binding } from '../core/binding.js';
import type { ColorPickerMode } from '../controls/color.js';
import type { Job, Scheduler } from '../core/scheduler.js';
import type { SearchGroupNode, SearchMetadata, SearchNode, SearchTarget } from '../core/search.js';

/** A row in a container: one intersection-driven unit of work. */
export interface Row extends SearchTarget {
  readonly element: HTMLElement;
  readonly searchVisible: boolean;
  onEligibilityChange: (() => void) | undefined;
  setVisible(visible: boolean): void;
  setParentDisabled(disabled: boolean): void;
  setParentHidden(hidden: boolean): void;
  dispose(): void;
}

/** A row that owns a library element, which may be created late and dropped again. */
export interface MountableRow extends Row, Job {
  readonly visible: boolean;
  unmount(): void;
}

export const CHUNK_SIZE = 16;

/** Consecutive rows of one container, observed as one intersection target. */
export class Chunk {
  readonly element: HTMLDivElement;
  readonly rows: Row[] = [];
  visible = false;
  readonly #searchChildren = new Set<SearchNode>();
  readonly searchNode: SearchGroupNode;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'chunk';
    this.searchNode = {
      kind: 'group',
      children: this.#searchChildren,
      hideWhenEmpty: 'always',
      setFiltered: (filtered) => {
        this.element.hidden = filtered;
      },
    };
  }

  add(row: Row, metadata: SearchMetadata): void {
    this.rows.push(row);
    this.#searchChildren.add({ kind: 'control', metadata, target: row });
    this.element.append(row.element);
    const n = this.rows.length;
    // A plain property, not a custom property: library controls inside watch custom properties
    // on their ancestors, and must not wake for this.
    this.element.style.containIntrinsicBlockSize = `auto calc(${n} * var(--tp-control-height-md) + ${n - 1} * var(--tweak-row-gap))`;
    if (this.visible) row.setVisible(true);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const row of this.rows) row.setVisible(visible);
  }
}

/**
 * Shared state of one pane: its scheduler, the one IntersectionObserver for all its chunks, and
 * the bound on how many library elements stay mounted.
 */
export class PaneContext {
  readonly bindings = new Set<Binding<unknown>>();
  /** Reapply the pane's search when rows are added or removed. */
  refreshSearch: (() => void) | undefined;
  /** Insertion order is recency: a row moves to the end each time it becomes visible. */
  readonly #mounted = new Set<MountableRow>();
  readonly #chunks = new Map<Element, Chunk>();
  readonly #observer: IntersectionObserver;
  #plotScheduler: PlotScheduler | undefined;

  constructor(
    readonly scheduler: Scheduler,
    /** Library elements kept mounted at most, visible ones excepted. */
    public maxMounted: number,
    /** Default sampling interval for input bindings: 0 every frame, -1 manual. */
    readonly interval: number,
    readonly colorPicker: ColorPickerMode = 'native',
  ) {
    this.#observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          this.#chunks.get(entry.target)?.setVisible(entry.isIntersecting);
      },
      // Mount a little ahead of scrolling into view.
      { rootMargin: '25% 0px' },
    );
  }

  observe(chunk: Chunk): void {
    this.#chunks.set(chunk.element, chunk);
    this.#observer.observe(chunk.element);
  }

  unobserve(chunk: Chunk): void {
    this.#chunks.delete(chunk.element);
    this.#observer.unobserve(chunk.element);
  }

  touch(row: MountableRow): void {
    this.#mounted.delete(row);
    this.#mounted.add(row);
  }

  mounted(row: MountableRow): void {
    this.#mounted.add(row);
    if (this.#mounted.size <= this.maxMounted) return;
    for (const candidate of this.#mounted) {
      if (this.#mounted.size <= this.maxMounted) break;
      if (candidate.visible) continue;
      candidate.unmount();
    }
  }

  forget(row: MountableRow): void {
    this.#mounted.delete(row);
  }

  /**
   * One paint scheduler for every graph of the pane: due plots take turns inside a shared
   * per-frame budget instead of each requesting its own frames.
   */
  get plotScheduler(): PlotScheduler {
    return (this.#plotScheduler ??= createPlotScheduler({ budgetMs: 1, maxPlotsPerFrame: 8 }));
  }

  get mountedCount(): number {
    return this.#mounted.size;
  }

  dispose(): void {
    this.#observer.disconnect();
    this.#chunks.clear();
    this.#mounted.clear();
    for (const binding of this.bindings) binding.dispose();
    this.bindings.clear();
    this.#plotScheduler?.dispose();
    this.#plotScheduler = undefined;
  }
}
