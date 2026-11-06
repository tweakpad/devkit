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
import {
  InlineRow,
  InlineRowApi,
  type InlineApis,
  type InlineItem,
  type InlineRowParams,
  type ValidatedInlineItems,
} from './inline.js';

export interface FolderParams {
  title: string;
  expanded?: boolean;
}

export interface TabPageParams {
  title: string;
  icon?: IconDefinition;
  color?: string;
  hint?: string;
}

export type TabsParams = { selected?: number } & (
  | { orientation?: 'horizontal'; pages: TabPageParams[] }
  | {
      orientation: 'vertical';
      side?: 'auto' | 'left' | 'right';
      placement?: 'inside' | 'outside';
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
  readonly searchNode: SearchScopeNode | SearchGroupNode;
  readonly #inlineEntries: { row: Row; metadata: SearchMetadata }[] = [];

  constructor(
    protected readonly context: PaneContext,
    protected readonly body: HTMLElement,
    setFiltered?: (filtered: boolean) => void,
    private readonly inline = false,
  ) {
    this.searchNode = setFiltered
      ? { kind: 'group', children: this.#searchChildren, hideWhenEmpty: 'searching', setFiltered }
      : { kind: 'scope', children: this.#searchChildren };
  }

  /** Binds `target[key]` to an inline control chosen from its value and `params`. */
  addBinding<T extends object, K extends keyof T & PropertyKey>(
    target: T,
    key: K,
    params: BindingParams = {},
  ): BindingApi<T[K]> {
    const { binding, view, kind } = createControl(this.context, target, key, params);
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
    );
    this.#children.push(api);
    return api;
  }

  /** Adds one action using the library Button. Search matches its name and current title. */
  addButton(params: ButtonParams): ButtonApi {
    const row = new ButtonRow(this.context, params);
    this.#addRow(row, row.metadata);
    const api = new ButtonApi(row, this.context);
    this.#children.push(api);
    return api;
  }

  /** Composes supported controls into one inline row and one complete search boundary. */
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
    const surface = document.createElement('div');
    surface.className = 'inline-row';
    const content = new ContainerApi(this.context, surface, undefined, true);
    try {
      const items = params.items.map((item) => {
        const api =
          item.type === 'button'
            ? content.addButton(item)
            : content.addBinding(item.target, item.key as never, item);
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
      this.#addRow(row, row.metadata);
      const api = new InlineRowApi<T>(row, items as InlineApis<T>, this.context);
      this.#children.push(api);
      return api;
    } catch (error) {
      content.dispose();
      throw error;
    }
  }

  addFolder(params: FolderParams): FolderApi {
    const element = document.createElement(TweakFolder.tagName) as TweakFolder;
    element.heading = params.title;
    element.open = params.expanded ?? true;
    this.#addBlock(element);
    const folder = new FolderApi(this.context, element);
    this.#children.push(folder);
    this.#searchChildren.add(folder.searchNode);
    this.context.refreshSearch?.();
    return folder;
  }

  addTabs(params: TabsParams): TabsApi {
    const vertical = params.orientation === 'vertical';
    if (vertical && !this.supportsVerticalTabs)
      throw new Error('devkit: vertical tabs are supported only at the pane root');
    if (vertical && params.pages.some((page) => !page.icon))
      throw new Error('devkit: vertical tabs require icons');
    const element = document.createElement(TweakTabs.tagName) as TweakTabs;
    element.orientation = params.orientation ?? 'horizontal';
    element.side = vertical ? (params.side ?? 'auto') : 'auto';
    element.placement = vertical ? (params.placement ?? 'outside') : 'outside';
    element.pageOptions = params.pages;
    element.labels = params.pages.map((page) => page.title);
    element.selected = params.selected ?? 0;
    const pages = params.pages.map(() => {
      const page = document.createElement(TweakTabPage.tagName) as TweakTabPage;
      element.append(page);
      return new TabPageApi(this.context, page);
    });
    element.syncPages();
    this.#addBlock(element);
    const tabs = new TabsApi(element, pages);
    this.#children.push(tabs);
    this.#searchChildren.add(tabs.searchNode);
    this.context.refreshSearch?.();
    return tabs;
  }

  /** Filters fields by property name or visible label, returning the number of matches. */
  filter(query: string): number {
    return filterSearchTree(this.searchNode, query);
  }

  /** Removes everything this container holds. */
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

export class FolderApi extends ContainerApi {
  constructor(
    context: PaneContext,
    readonly element: TweakFolder,
  ) {
    super(context, element.body, (filtered) => {
      element.hidden = filtered;
    });
  }

  get title(): string {
    return this.element.heading;
  }

  set title(title: string) {
    this.element.heading = title;
  }

  get expanded(): boolean {
    return this.element.open;
  }

  set expanded(expanded: boolean) {
    this.element.open = expanded;
  }

  override dispose(): void {
    super.dispose();
    this.element.remove();
  }
}

export class TabPageApi extends ContainerApi {
  constructor(
    context: PaneContext,
    readonly element: TweakTabPage,
  ) {
    super(context, element.body);
  }
}

export class TabsApi {
  readonly searchNode: SearchScopeNode;
  constructor(
    readonly element: TweakTabs,
    readonly pages: TabPageApi[],
  ) {
    this.searchNode = { kind: 'scope', children: pages.map((page) => page.searchNode) };
  }

  get selected(): number {
    return this.element.selected;
  }

  set selected(index: number) {
    this.element.select(index);
  }

  filter(query: string): number {
    return filterSearchTree(this.searchNode, query);
  }

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
    readonly kind: ControlKind,
    private readonly context: PaneContext,
  ) {}

  /** The value last shown or set. */
  get value(): T {
    return this.binding.value;
  }

  /** Writes the target and the control. */
  set value(value: T) {
    this.binding.set(value);
  }

  get label(): string {
    return String(this.binding.key);
  }

  get disabled(): boolean {
    return this.row.disabled;
  }

  set disabled(disabled: boolean) {
    this.row.setDisabled(disabled);
  }

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

  /** Re-reads the target now; for bindings with `interval: -1`. */
  refresh(): void {
    this.binding.refresh();
  }

  /** `change`: once per frame at most while the user edits. `finish`: when the edit ends. */
  on(type: 'change' | 'finish', listener: ChangeListener<T>): () => void {
    return this.binding.on(type, listener);
  }

  dispose(): void {
    this.context.bindings.delete(this.binding as Binding<unknown>);
    this.row.dispose();
    this.context.refreshSearch?.();
  }
}
