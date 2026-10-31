import type { Binding } from '../core/binding.js';
import type { LibraryView } from '../controls/library-view.js';
import type { TextMonitorView } from '../monitors/text-monitor.js';
import type { GraphMonitor } from '../monitors/graph-monitor.js';
import type { MountableRow, PaneContext, Row } from './context.js';

/**
 * A bound control. Until it first scrolls into view it is a placeholder painted like an inline
 * control (label only); the library element is created by a budgeted job, so opening a folder of
 * fifty rows spreads its cost over a few frames instead of one long task.
 */
export class ControlRow<T> implements MountableRow {
  queued = false;
  readonly element: HTMLDivElement;
  #visible = false;
  #mounted = false;
  #hidden = false;
  #disabled = false;
  #disposed = false;

  constructor(
    private readonly context: PaneContext,
    readonly binding: Binding<T>,
    readonly view: LibraryView<T>,
    private readonly label: string,
  ) {
    this.element = document.createElement('div');
    this.#renderPlaceholder();
  }

  get visible(): boolean {
    return this.#visible && !this.#hidden;
  }

  get isMounted(): boolean {
    return this.#mounted;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.#sync();
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    this.element.hidden = hidden;
    this.#sync();
  }

  setDisabled(disabled: boolean): void {
    this.#disabled = disabled;
    this.view.setDisabled(disabled);
    this.element.toggleAttribute('data-disabled', disabled);
  }

  /** Scheduler job: create the library element. */
  run(): void {
    if (this.#disposed || this.#mounted || !this.visible) return;
    this.binding.value = this.binding.read();
    // Restyle the row before the element is inside it: the element watches its ancestors' class.
    this.element.className = 'row';
    this.view.mount(this.element, this.#disabled);
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

  dispose(): void {
    this.#disposed = true;
    this.unmount();
    this.binding.dispose();
    this.element.remove();
  }

  #sync(): void {
    const visible = this.visible;
    this.binding.setVisible(visible);
    if (!visible) return;
    if (this.#mounted) this.context.touch(this);
    else this.context.scheduler.enqueueJob(this);
  }

  #renderPlaceholder(): void {
    this.element.className = 'row placeholder';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = this.label;
    this.element.replaceChildren(label);
  }
}

/** A text monitor: cheap DOM, built at once, sampled only while on screen. */
export class TextMonitorRow implements Row {
  readonly element: HTMLElement;
  #hidden = false;
  #visible = false;

  constructor(
    readonly binding: Binding<unknown>,
    readonly view: TextMonitorView,
  ) {
    this.element = view.element;
    binding.attach(view);
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.binding.setVisible(visible && !this.#hidden);
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    this.element.hidden = hidden;
    this.setVisible(this.#visible);
  }

  dispose(): void {
    this.binding.dispose();
    this.element.remove();
  }
}

/** A graph monitor: samples all the time, draws only while on screen. */
export class GraphMonitorRow implements Row {
  readonly element: HTMLElement;
  #hidden = false;
  #visible = false;

  constructor(readonly monitor: GraphMonitor) {
    this.element = monitor.element;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.monitor.setVisible(visible && !this.#hidden);
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden;
    this.element.hidden = hidden;
    this.setVisible(this.#visible);
  }

  dispose(): void {
    this.monitor.dispose();
    this.element.remove();
  }
}
