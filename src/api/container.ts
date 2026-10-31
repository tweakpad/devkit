import { Binding, type ChangeListener } from '../core/binding.js';
import { TweakFolder } from '../elements/folder.js';
import { TweakTabPage, TweakTabs } from '../elements/tabs.js';
import { GraphMonitor } from '../monitors/graph-monitor.js';
import { TextMonitorView } from '../monitors/text-monitor.js';
import { Chunk, CHUNK_SIZE, type PaneContext, type Row } from './context.js';
import { createControl, type BindingParams, type ControlKind } from './factory.js';
import { ControlRow, GraphMonitorRow, TextMonitorRow } from './rows.js';

export interface MonitorParams {
  label?: string;
  /** `text` shows the value; `graph` plots a number over time. */
  view?: 'text' | 'graph';
  /** Milliseconds between samples. Defaults: text 100, graph 32. */
  interval?: number;
  /** Decimals shown for numbers. Default 2. */
  precision?: number;
  /** Graph range; derived from the samples when omitted. */
  min?: number;
  max?: number;
  /** Graph samples kept. Default 64. */
  bufferSize?: number;
  hidden?: boolean;
}

export interface FolderParams {
  title: string;
  expanded?: boolean;
}

export interface TabsParams {
  pages: { title: string }[];
  selected?: number;
}

interface Disposable {
  dispose(): void;
}

/** Shared by the pane, folders and tab pages: anything rows, folders and tabs can go into. */
export class ContainerApi {
  #chunk: Chunk | null = null;
  readonly #chunks: Chunk[] = [];
  readonly #children: Disposable[] = [];

  constructor(
    protected readonly context: PaneContext,
    protected readonly body: HTMLElement,
  ) {}

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
    this.#addRow(row);
    const api = new BindingApi<T[K]>(
      binding as unknown as Binding<T[K]>,
      row as unknown as ControlRow<T[K]>,
      kind,
      this.context,
    );
    this.#children.push(api);
    return api;
  }

  /** Shows `target[key]` read-only, as text or as a graph over time. */
  addMonitor<T extends object, K extends keyof T & PropertyKey>(
    target: T,
    key: K,
    params: MonitorParams = {},
  ): MonitorApi {
    const label = params.label ?? String(key);
    const precision = params.precision ?? 2;
    let row: TextMonitorRow | GraphMonitorRow;
    if (params.view === 'graph') {
      const monitor = new GraphMonitor(this.context.scheduler, target, key, {
        label,
        min: params.min,
        max: params.max,
        bufferSize: params.bufferSize ?? 64,
        interval: params.interval ?? 32,
        precision,
      });
      row = new GraphMonitorRow(monitor);
    } else {
      const binding = new Binding<unknown>(this.context.scheduler, target, key, {
        interval: params.interval ?? 100,
        readonly: true,
      });
      this.context.bindings.add(binding);
      row = new TextMonitorRow(binding, new TextMonitorView(label, precision));
    }
    if (params.hidden) row.setHidden(true);
    this.#addRow(row);
    const api = new MonitorApi(row, this.context);
    this.#children.push(api);
    return api;
  }

  addFolder(params: FolderParams): FolderApi {
    const element = document.createElement(TweakFolder.tagName) as TweakFolder;
    element.heading = params.title;
    element.open = params.expanded ?? true;
    this.#addBlock(element);
    const folder = new FolderApi(this.context, element);
    this.#children.push(folder);
    return folder;
  }

  addTabs(params: TabsParams): TabsApi {
    const element = document.createElement(TweakTabs.tagName) as TweakTabs;
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
    return tabs;
  }

  /** Removes everything this container holds. */
  dispose(): void {
    for (const child of this.#children) child.dispose();
    this.#children.length = 0;
    for (const chunk of this.#chunks) {
      this.context.unobserve(chunk);
      chunk.element.remove();
    }
    this.#chunks.length = 0;
    this.#chunk = null;
  }

  #addRow(row: Row): void {
    let chunk = this.#chunk;
    if (!chunk || chunk.rows.length >= CHUNK_SIZE) {
      chunk = new Chunk();
      this.#chunk = chunk;
      this.#chunks.push(chunk);
      this.body.append(chunk.element);
      this.context.observe(chunk);
    }
    chunk.add(row);
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
    super(context, element.body);
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
  constructor(
    readonly element: TweakTabs,
    readonly pages: TabPageApi[],
  ) {}

  get selected(): number {
    return this.element.selected;
  }

  set selected(index: number) {
    this.element.select(index);
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
    return this.row.element.hasAttribute('data-disabled');
  }

  set disabled(disabled: boolean) {
    this.row.setDisabled(disabled);
  }

  get hidden(): boolean {
    return this.row.element.hidden === true;
  }

  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
  }

  /** The row element (placeholder until first shown, then the library control's row). */
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
  }
}

/** The handle `addMonitor` returns. */
export class MonitorApi {
  constructor(
    private readonly row: TextMonitorRow | GraphMonitorRow,
    private readonly context: PaneContext,
  ) {}

  get hidden(): boolean {
    return this.row.element.hidden === true;
  }

  set hidden(hidden: boolean) {
    this.row.setHidden(hidden);
  }

  get element(): HTMLElement {
    return this.row.element;
  }

  dispose(): void {
    if (this.row instanceof TextMonitorRow) this.context.bindings.delete(this.row.binding);
    this.row.dispose();
  }
}
