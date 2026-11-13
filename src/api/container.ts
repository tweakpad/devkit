import type { IconDefinition } from '@tweakpad/ui';
import type { Binding, ChangeListener } from '../core/binding.js';
import {
  filterSearchTree,
  type SearchGroupNode,
  type SearchMetadata,
  type SearchNode,
  type SearchScopeNode,
} from '../core/search.js';
import { TweakFolder } from '../elements/folder.js';
import { TweakTabPage, TweakTabs } from '../elements/tabs.js';
import { Chunk, CHUNK_SIZE, type PaneContext, type Row } from './context.js';
import { createControl, type BindingParams, type ControlKind } from './factory.js';
import { ControlRow } from './rows.js';
import { ButtonApi, ButtonRow, type ButtonParams } from './buttons.js';
import { createGraph, GraphApi } from './graph.js';
import { LayersApi, type LayersParams } from './layers.js';
import {
  createPerformanceMonitor,
  PerformanceMonitorApi,
  type PerformanceParams,
} from './performance.js';
import type { GraphParams } from '../graphs/types.js';
import {
  InlineRow,
  InlineRowApi,
  type InlineApis,
  type InlineBindingItem,
  type InlineItem,
  type InlineRowParams,
  type ValidatedInlineItems,
} from './inline.js';

/** Options of `addFolder()`. */
export interface FolderParams {
  /** Heading of the folder, and its name in history paths unless `id` is set. */
  title: string;
  /**
   * Whether the folder starts open. A closed folder's bindings sleep until it opens.
   * @default true
   */
  expanded?: boolean;
  /** Stable name in the pane's history paths, in place of the title. */
  id?: string;
}

/** One page of `TabsParams.pages`. */
export interface TabPageParams {
  /**
   * Tab label, and the page's name in history paths unless `id` is set. Vertical tabs show it as
   * the page heading.
   */
  title: string;
  /** Stable name in the pane's history paths, in place of the title. */
  id?: string;
  /** The tab's icon on vertical tabs, which require one; horizontal tabs show the title. */
  icon?: IconDefinition;
  /** Any CSS color for the icon on vertical tabs. */
  color?: string;
  /** Tooltip of the icon on vertical tabs, in place of the title. */
  hint?: string;
}

/**
 * Options of `addTabs()`: the pages, and either a row of text tabs or a column of icon tabs.
 * Vertical tabs go only directly on the pane, and every page needs an icon.
 */
export type TabsParams = {
  /**
   * Index of the page shown first, 0-based.
   * @default 0
   */
  selected?: number;
} & (
  | {
      /**
       * `'horizontal'` shows text tabs above the pages; `'vertical'` shows an icon column along
       * one edge of the group.
       * @default 'horizontal'
       */
      orientation?: 'horizontal';
      /** The pages, in order. Each becomes a `TabPageApi` in `TabsApi.pages`. */
      pages: TabPageParams[];
    }
  | {
      /**
       * `'horizontal'` shows text tabs above the pages; `'vertical'` shows an icon column along
       * one edge of the group.
       * @default 'horizontal'
       */
      orientation: 'vertical';
      /**
       * Edge of the icon column on vertical tabs. `'auto'` takes the left of right-anchored panes
       * and the right of left-anchored panes.
       * @default 'auto'
       */
      side?: 'auto' | 'left' | 'right';
      /** The pages, in order. Each becomes a `TabPageApi` in `TabsApi.pages`. */
      pages: (TabPageParams & { icon: IconDefinition })[];
    }
);

interface Disposable {
  dispose(): void;
}

/** Shared by the pane, folders and tab pages: anything rows, folders and tabs can go into. */
export class ContainerApi {
  protected readonly supportsVerticalTabs: boolean = false;
  #chunk: Chunk | null = null;
  readonly #chunks: Chunk[] = [];
  readonly #children: Disposable[] = [];
  readonly #searchChildren = new Set<SearchNode>();
  /** @internal This container's place in the search tree. */
  readonly searchNode: SearchScopeNode | SearchGroupNode;
  readonly #inlineEntries: { row: Row; metadata: SearchMetadata }[] = [];

  constructor(
    protected readonly context: PaneContext,
    protected readonly body: HTMLElement,
    setFiltered?: (filtered: boolean) => void,
    private readonly inline = false,
    /** Where this container sits in history paths: folder and tab page names from the root. */
    protected readonly path: readonly string[] = [],
  ) {
    this.searchNode = setFiltered
      ? { kind: 'group', children: this.#searchChildren, hideWhenEmpty: 'searching', setFiltered }
      : { kind: 'scope', children: this.#searchChildren };
  }

  /**
   * Binds `target[key]` to a control chosen from its value and `params`, and returns its handle.
   * Throws for a value no control can show, such as an object that is not a color.
   */
  addBinding<T extends object, K extends keyof T & PropertyKey>(
    target: T,
    key: K,
    params: BindingParams = {},
  ): BindingApi<T[K]> {
    const { binding, view, kind, descriptor } = createControl(this.context, target, key, params);
    const history = this.context.history;
    const leaf = params.id ?? (typeof key === 'symbol' ? undefined : String(key));
    // Applies a stored value before the row exists, so the control first shows it.
    const untrack =
      history && descriptor && leaf !== undefined && params.history !== false
        ? history.track(this.path, leaf, {
            descriptor,
            read: () => binding.value,
            load: (value) => binding.load(value),
            set: (value) => binding.set(value),
            onFinish: (listener) => binding.on('finish', (event) => listener(event.value)),
          })
        : undefined;
    const row = new ControlRow(this.context, binding, view, params.label ?? String(key));
    if (params.disabled) row.setDisabled(true);
    if (params.hidden) row.setHidden(true);
    this.context.bindings.add(binding);
    this.#addRow(row, { name: String(key), label: params.label ?? String(key) });
    const api = new BindingApi<T[K]>(
      binding as unknown as Binding<T[K]>,
      row as unknown as ControlRow<T[K]>,
      kind,
      this.context,
      untrack,
    );
    this.#children.push(api);
    return api;
  }

  /** Adds a button that calls `onClick` when pressed. Search matches its name and current title. */
  addButton(params: ButtonParams): ButtonApi {
    const row = new ButtonRow(this.context, params);
    this.#addRow(row, row.metadata);
    const api = new ButtonApi(row, this.context);
    this.#children.push(api);
    return api;
  }

  /**
   * Adds a live graph of one or more numeric series, fed by their `read()` functions or by
   * `push()`. Several series are paged (click to cycle) or overlaid in one plot.
   */
  addGraph(params: GraphParams): GraphApi {
    const row = createGraph(this.context, params);
    if (params.disabled) row.setDisabled(true);
    if (params.hidden) row.setHidden(true);
    this.#addRow(row, row.metadata);
    const api = new GraphApi(row, this.context);
    this.#children.push(api);
    return api;
  }

  /**
   * Adds a performance monitor: stacked graphs fed by one frame meter. By default a frame graph
   * (FPS, frame time) and, where measurable, a memory graph (JS heap). Frames are measured by
   * devkit or around the application loop with `begin()`/`end()`; adapters add framework-specific
   * metrics and markers, and `graphs` regroups everything.
   */
  addPerformanceMonitor(params: PerformanceParams = {}): PerformanceMonitorApi {
    const created = createPerformanceMonitor(this.context, params);
    for (const { row } of created.graphs) this.#addRow(row, row.metadata);
    const api = new PerformanceMonitorApi(created, this.context, params.adapters);
    this.#children.push(api);
    return api;
  }

  /**
   * Adds bindings and buttons side by side in one row, searched and hidden as one control.
   * `items` of the returned handle are their handles, in order. Throws for an empty row.
   */
  addRow<const T extends readonly InlineItem[]>(
    params: InlineRowParams<T> & { items: ValidatedInlineItems<T> },
  ): InlineRowApi<T> {
    if (params.items.length === 0)
      throw new RangeError('devkit: an inline row needs at least one item');
    for (const item of params.items) {
      if (
        item.width !== undefined &&
        item.width !== 'auto' &&
        (!Number.isFinite(item.width) || item.width <= 0)
      )
        throw new RangeError('devkit: row item width must be auto or a positive finite share');
      if (item.type !== 'button' && !(item.key in item.target))
        throw new TypeError(`devkit: row binding key ${String(item.key)} does not exist`);
    }
    const { row, items } = ContainerApi.inlineRow(this.context, this.path, params);
    this.#addRow(row, row.metadata);
    const api = new InlineRowApi<T>(row, items as InlineApis<T>, this.context);
    this.#children.push(api);
    return api;
  }

  /**
   * @internal Builds an inline row of `items` without placing it: `addRow`, and the bars of a
   * layer stack, whose `build` makes the items a row does not know and returns their handles.
   */
  static inlineRow<I extends { type: string; width?: number | 'auto' }>(
    context: PaneContext,
    path: readonly string[],
    params: Omit<InlineRowParams, 'items'> & { items: readonly I[] },
    build?: (
      item: I,
      content: ContainerApi,
      add: (row: Row, metadata: SearchMetadata) => void,
    ) => { readonly element: HTMLElement } | undefined,
  ): { row: InlineRow; items: { readonly element: HTMLElement }[] } {
    const surface = document.createElement('div');
    surface.className = 'inline-row';
    const content = new ContainerApi(context, surface, undefined, true, path);
    try {
      const items = params.items.map((item) => {
        const api =
          build?.(item, content, (row, metadata) => content.#addRow(row, metadata)) ??
          (item.type === 'button'
            ? content.addButton(item as unknown as ButtonParams)
            : content.addBinding(
                (item as unknown as InlineBindingItem).target,
                (item as unknown as InlineBindingItem).key as never,
                item as unknown as InlineBindingItem,
              ));
        api.element.style.flex = item.width === 'auto' ? '0 0 auto' : `${item.width ?? 1} 1 0`;
        return api;
      });
      const row = new InlineRow(
        surface,
        {
          entries: content.#inlineEntries,
          setVisible: (visible) => {
            for (const { row } of content.#inlineEntries) row.setVisible(visible);
          },
          setParentDisabled: (disabled) => {
            for (const { row } of content.#inlineEntries) row.setParentDisabled(disabled);
          },
          dispose: () => content.dispose(),
        },
        params,
      );
      return { row, items };
    } catch (error) {
      content.dispose();
      throw error;
    }
  }

  /** Adds a folder of controls under a heading the user can collapse, and returns it. */
  addFolder(params: FolderParams): FolderApi {
    const element = document.createElement(TweakFolder.tagName) as TweakFolder;
    element.heading = params.title;
    element.open = params.expanded ?? true;
    this.#addBlock(element);
    const folder = new FolderApi(this.context, element, [...this.path, params.id ?? params.title]);
    this.#children.push(folder);
    this.#searchChildren.add(folder.searchNode);
    this.context.refreshSearch?.();
    return folder;
  }

  /**
   * Adds a group of tab pages, one shown at a time, and returns it. Vertical tabs throw anywhere
   * but directly on the pane, or when a page has no icon.
   */
  addTabs(params: TabsParams): TabsApi {
    const vertical = params.orientation === 'vertical';
    if (vertical && !this.supportsVerticalTabs)
      throw new Error('devkit: vertical tabs are supported only at the pane root');
    if (vertical && params.pages.some((page) => !page.icon))
      throw new Error('devkit: vertical tabs require icons');
    const element = document.createElement(TweakTabs.tagName) as TweakTabs;
    element.orientation = params.orientation ?? 'horizontal';
    element.side = vertical ? (params.side ?? 'auto') : 'auto';
    element.pageOptions = params.pages;
    element.labels = params.pages.map((page) => page.title);
    element.selected = params.selected ?? 0;
    const pages = params.pages.map((params) => {
      const page = document.createElement(TweakTabPage.tagName) as TweakTabPage;
      element.append(page);
      return new TabPageApi(this.context, page, [...this.path, params.id ?? params.title]);
    });
    element.syncPages();
    this.#addBlock(element);
    const tabs = new TabsApi(element, pages);
    this.#children.push(tabs);
    this.#searchChildren.add(tabs.searchNode);
    this.context.refreshSearch?.();
    return tabs;
  }

  /**
   * Adds a stack of layers the user can select, reorder, toggle and, as allowed, rename, remove
   * and add from `types`. Each layer may have a panel of controls, shown while it is selected.
   */
  addLayers<const S extends string = never, D = unknown, const T extends string = never>(
    params: LayersParams<S, D, T>,
  ): LayersApi<S, D, T> {
    if (this.inline) throw new Error('devkit: layers cannot go in a row');
    const layers = new LayersApi<S, D, T>(this.context, params, this.path);
    this.#addBlock(layers.element);
    this.#children.push(layers);
    this.#searchChildren.add(layers.searchNode);
    this.context.refreshSearch?.();
    return layers;
  }

  /**
   * @internal The pane's search: filters fields by property name or label, returning the number
   * of matches.
   */
  filter(query: string): number {
    return filterSearchTree(this.searchNode, query);
  }

  /** Removes everything this container holds and stops its work. */
  dispose(): void {
    for (const child of this.#children) child.dispose();
    this.#children.length = 0;
    this.#searchChildren.clear();
    this.#inlineEntries.length = 0;
    for (const chunk of this.#chunks) {
      this.context.unobserve(chunk);
      chunk.element.remove();
    }
    this.#chunks.length = 0;
    this.#chunk = null;
  }

  #addRow(row: Row, metadata: SearchMetadata): void {
    if (this.inline) {
      this.#inlineEntries.push({ row, metadata });
      this.body.append(row.element);
      return;
    }
    let chunk = this.#chunk;
    if (!chunk || chunk.rows.length >= CHUNK_SIZE) {
      chunk = new Chunk();
      this.#chunk = chunk;
      this.#chunks.push(chunk);
      this.#searchChildren.add(chunk.searchNode);
      this.body.append(chunk.element);
      this.context.observe(chunk);
    }
    chunk.add(row, metadata);
    this.context.refreshSearch?.();
  }

  #addBlock(element: HTMLElement): void {
    // A folder or tabs ends the current chunk, so rows after it start a new one below it.
    this.#chunk = null;
    this.body.append(element);
  }
}

/** A folder of controls, as `addFolder` returns it. It takes controls like the pane. */
export class FolderApi extends ContainerApi {
  constructor(
    context: PaneContext,
    /** The folder's `<tweak-folder>` element. */
    readonly element: TweakFolder,
    path: readonly string[] = [],
  ) {
    super(
      context,
      element.body,
      (filtered) => {
        element.hidden = filtered;
      },
      false,
      path,
    );
  }

  /** Heading of the folder. Changing it leaves its history paths as they were. */
  get title(): string {
    return this.element.heading;
  }

  set title(title: string) {
    this.element.heading = title;
  }

  /** Whether the folder is open. A closed folder's bindings sleep until it opens. */
  get expanded(): boolean {
    return this.element.open;
  }

  set expanded(expanded: boolean) {
    this.element.open = expanded;
  }

  /** Removes the folder and everything in it. */
  override dispose(): void {
    super.dispose();
    this.element.remove();
  }
}

/** One page of a tab group, from `TabsApi.pages`. It takes controls like the pane. */
export class TabPageApi extends ContainerApi {
  constructor(
    context: PaneContext,
    /** The page's `<tweak-tab-page>` element. */
    readonly element: TweakTabPage,
    path: readonly string[] = [],
  ) {
    super(context, element.body, undefined, false, path);
  }
}

/** A group of tab pages, as `addTabs` returns it. */
export class TabsApi {
  /** @internal This group's place in the search tree. */
  readonly searchNode: SearchScopeNode;
  constructor(
    /** The group's `<tweak-tabs>` element. */
    readonly element: TweakTabs,
    /** The pages, in the order `pages` declared them. */
    readonly pages: TabPageApi[],
  ) {
    this.searchNode = { kind: 'scope', children: pages.map((page) => page.searchNode) };
  }

  /** Index of the page shown, 0-based. Setting it clamps the index to the pages. */
  get selected(): number {
    return this.element.selected;
  }

  set selected(index: number) {
    this.element.select(index);
  }

  /** @internal Filters the pages' fields, returning the number of matches. */
  filter(query: string): number {
    return filterSearchTree(this.searchNode, query);
  }

  /**
   * Listens for the user picking a page. Returns a function that removes the listener. Setting
   * `selected` fires nothing.
   * @event select - Fires when the user picks a page, with its 0-based index.
   */
  on(type: 'select', listener: (index: number) => void): () => void {
    void type;
    // Tabs nested in a page bubble their own picks through this element.
    const handle = (event: Event) => {
      if (event.target === this.element)
        listener((event as CustomEvent<{ index: number }>).detail.index);
    };
    this.element.addEventListener('tweak-select', handle);
    return () => this.element.removeEventListener('tweak-select', handle);
  }

  /** Removes the tab group and everything in its pages. */
  dispose(): void {
    for (const page of this.pages) page.dispose();
    this.element.remove();
  }
}

/** The handle `addBinding` returns. */
export class BindingApi<T> {
  constructor(
    private readonly binding: Binding<T>,
    private readonly row: ControlRow<T>,
    /** The control in use, as `view` chose it or inferred from the value. */
    readonly kind: ControlKind,
    private readonly context: PaneContext,
    private readonly untrack?: () => void,
  ) {}

  /**
   * The value last shown or set. Setting it writes the target and the control, and fires
   * `change` and `finish` as a finished edit.
   */
  get value(): T {
    return this.binding.value;
  }

  set value(value: T) {
    this.binding.set(value);
  }

  /** The bound property key, as text. */
  get label(): string {
    return String(this.binding.key);
  }

  /** Whether the control is shown dimmed and ignores input. */
  get disabled(): boolean {
    return this.row.disabled;
  }

  set disabled(disabled: boolean) {
    this.row.setDisabled(disabled);
  }

  /** Whether the control is hidden. A hidden binding stops sampling and is left out of search. */
  get hidden(): boolean {
    return this.row.hidden;
  }

  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
    this.context.refreshSearch?.();
  }

  /** The stable visibility shell containing the complete control or its placeholder. */
  get element(): HTMLElement {
    return this.row.element;
  }

  /** Re-reads the target now and shows its value; for bindings that only refresh manually. */
  refresh(): void {
    this.binding.refresh();
  }

  /**
   * Listens for edits of the value. Returns a function that removes the listener. Changes the
   * application makes to the object itself fire nothing.
   * @event change - Fires at most once per frame while the user edits, and when `value` is set,
   * with `{ value, last }`.
   * @event finish - Fires when an edit ends (release, Enter, blur) or `value` is set, with
   * `{ value, last: true }`.
   */
  on(type: 'change' | 'finish', listener: ChangeListener<T>): () => void {
    return this.binding.on(type, listener);
  }

  /** Removes the control and stops sampling the property and recording it in the history. */
  dispose(): void {
    this.untrack?.();
    this.context.bindings.delete(this.binding as Binding<unknown>);
    this.row.dispose();
    this.context.refreshSearch?.();
  }
}
