import type { Binding } from '../core/binding.js';
import type { LibraryView } from '../controls/library-view.js';
import type { TextMonitorView } from '../monitors/text-monitor.js';
import type { GraphMonitor } from '../monitors/graph-monitor.js';
import type { MountableRow, PaneContext, Row } from './context.js';

/**
 * The devkit-owned visibility boundary of one complete control. Renderers own only `surface`
 * and its descendants; their layout rules cannot compete with the search shell's hiding rule.
 */
export abstract class SearchableRow implements Row {
  readonly element: HTMLDivElement;
  #hidden = false;
  #filtered = false;
  #visible = false;
  #disposed = false;

  constructor(protected readonly surface: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'search-item';
    this.element.append(surface);
  }

  get hidden(): boolean {
    return this.#hidden;
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /** Search eligibility does not depend on mounting, intersection, tabs or folder expansion. */
  get searchVisible(): boolean {
    return !this.#hidden && !this.#filtered && !this.#disposed;
  }

  get visible(): boolean {
    return this.#visible && this.searchVisible;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.syncVisibility(this.visible);
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    this.#sync();
  }

  setFiltered(filtered: boolean): void {
    this.#filtered = filtered;
    this.#sync();
  }

  dispose(): void {
    this.#disposed = true;
    this.element.remove();
  }

  protected abstract syncVisibility(visible: boolean): void;

  #sync(): void {
    this.element.hidden = !this.searchVisible;
    this.syncVisibility(this.visible);
  }
}

/** A bound control, mounted within budget when its row first becomes visible. */
export class ControlRow<T> extends SearchableRow implements MountableRow {
  queued = false;
  #mounted = false;
  #disabled = false;

  constructor(
    private readonly context: PaneContext,
    readonly binding: Binding<T>,
    readonly view: LibraryView<T>,
    private readonly label: string,
  ) {
    super(document.createElement('div'));
    this.#renderPlaceholder();
  }

  get isMounted(): boolean {
    return this.#mounted;
  }

  setDisabled(disabled: boolean): void {
    this.#disabled = disabled;
    this.view.setDisabled(disabled);
    this.element.toggleAttribute('data-disabled', disabled);
  }

  /** Scheduler job: create the library element inside the stable visibility boundary. */
  run(): void {
    if (this.disposed || this.#mounted || !this.visible) return;
    this.binding.value = this.binding.read();
    this.surface.className = 'row';
    this.view.mount(this.surface, this.#disabled);
    this.binding.attach(this.view);
    this.#mounted = true;
    this.context.mounted(this);
  }

  unmount(): void {
    if (!this.#mounted) return;
    this.#mounted = false;
    this.binding.detach();
    this.view.unmount();
    this.context.forget(this);
    this.#renderPlaceholder();
  }

  override dispose(): void {
    this.unmount();
    this.binding.dispose();
    super.dispose();
  }

  protected override syncVisibility(visible: boolean): void {
    this.binding.setVisible(visible);
    if (!visible) return;
    if (this.#mounted) this.context.touch(this);
    else this.context.scheduler.enqueueJob(this);
  }

  #renderPlaceholder(): void {
    this.surface.className = 'row placeholder';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = this.label;
    this.surface.replaceChildren(label);
  }
}

/** A text monitor: cheap DOM, sampled only while its complete row is on screen. */
export class TextMonitorRow extends SearchableRow {
  constructor(
    readonly binding: Binding<unknown>,
    readonly view: TextMonitorView,
  ) {
    super(view.element);
    binding.attach(view);
  }

  protected override syncVisibility(visible: boolean): void {
    this.binding.setVisible(visible);
  }

  override dispose(): void {
    this.binding.dispose();
    super.dispose();
  }
}

/** A graph monitor: samples all the time, draws only while its complete row is on screen. */
export class GraphMonitorRow extends SearchableRow {
  constructor(readonly monitor: GraphMonitor) {
    super(monitor.element);
  }

  protected override syncVisibility(visible: boolean): void {
    this.monitor.setVisible(visible);
  }

  override dispose(): void {
    this.monitor.dispose();
    super.dispose();
  }
}
