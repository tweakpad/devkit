import type { Binding, BindingView } from '../core/binding.js';

/** The slice of a Lit-based library element the views drive. */
export interface LibraryElement extends HTMLElement {
  value?: unknown;
  checked?: boolean;
  disabled?: boolean;
  readonly hasUpdated?: boolean;
  readonly isUpdatePending?: boolean;
}

interface ValueChangeDetail {
  value: unknown;
}

/**
 * A binding shown by one @tweakpad/ui inline control, in controlled mode: the element's value is
 * set before its first update, and each proposal it makes is echoed back synchronously, as the
 * library's controlled contract requires.
 *
 * Writes run the element's update synchronously, so the scheduler's frame budget measures the
 * real cost (the library's update runs presentation work every time) instead of deferring it to
 * a microtask after the budget check.
 */
export abstract class LibraryView<T> implements BindingView<T> {
  readonly heavy = true;
  protected el: LibraryElement | null = null;
  #releaseLock: (() => void) | null = null;

  constructor(
    protected readonly binding: Binding<T>,
    protected readonly label: string,
  ) {}

  get element(): LibraryElement | null {
    return this.el;
  }

  /** Builds the element with its static configuration and the initial (controlled) value. */
  protected abstract create(value: T): LibraryElement;

  /** Applies a value to the element. */
  protected abstract apply(el: LibraryElement, value: T): void;

  /** The element's proposal as the binding's value; undefined when not a value yet (e.g. "-"). */
  protected abstract parse(proposal: unknown): T | undefined;

  /** Echoes a proposal back to the element (controlled mode). */
  protected echo(el: LibraryElement, proposal: unknown): void {
    el.value = proposal;
  }

  /** Text-entry controls hold the binding still while focused, so typing is never overwritten. */
  protected get locksWhileFocused(): boolean {
    return false;
  }

  mount(row: HTMLElement, disabled: boolean): void {
    const el = this.create(this.binding.value);
    el.dir = 'ltr';
    if (disabled) el.disabled = true;
    el.addEventListener('tp-value-change', this.#onValueChange);
    el.addEventListener('tp-value-commit', this.#onCommit);
    el.addEventListener('change', this.#onCommit);
    el.addEventListener('pointerdown', this.#onPointerDown);
    if (this.locksWhileFocused) {
      el.addEventListener('focusin', this.#onFocusIn);
      el.addEventListener('focusout', this.#onFocusOut);
    }
    this.el = el;
    row.replaceChildren(el);
    // Run the first render now, inside the job, so the scheduler's budget sees its cost.
    if (el.isUpdatePending) (el as unknown as { performUpdate(): void }).performUpdate();
  }

  unmount(): void {
    const el = this.el;
    if (!el) return;
    el.removeEventListener('tp-value-change', this.#onValueChange);
    el.removeEventListener('tp-value-commit', this.#onCommit);
    el.removeEventListener('change', this.#onCommit);
    el.removeEventListener('pointerdown', this.#onPointerDown);
    el.removeEventListener('focusin', this.#onFocusIn);
    el.removeEventListener('focusout', this.#onFocusOut);
    this.#release();
    el.remove();
    this.el = null;
  }

  setDisabled(disabled: boolean): void {
    if (this.el) this.el.disabled = disabled;
  }

  write(value: T): void {
    const el = this.el;
    if (!el) return;
    this.apply(el, value);
    if (el.hasUpdated && el.isUpdatePending)
      (el as unknown as { performUpdate(): void }).performUpdate();
  }

  #onValueChange = (event: Event): void => {
    const el = this.el;
    if (!el || event.target !== el) return;
    const proposal = (event as CustomEvent<ValueChangeDetail>).detail.value;
    if (this.binding.readonly) {
      (event as CustomEvent).preventDefault();
      return;
    }
    this.echo(el, proposal);
    const value = this.parse(proposal);
    if (value !== undefined) this.binding.propose(value);
  };

  #onCommit = (event: Event): void => {
    if (event.target !== this.el && event.type !== 'change') return;
    this.binding.commit();
  };

  #onPointerDown = (): void => {
    if (this.#releaseLock) return;
    this.#releaseLock = this.binding.lock();
    window.addEventListener('pointerup', this.#onPointerUp, true);
    window.addEventListener('pointercancel', this.#onPointerUp, true);
  };

  #onPointerUp = (): void => {
    window.removeEventListener('pointerup', this.#onPointerUp, true);
    window.removeEventListener('pointercancel', this.#onPointerUp, true);
    if (this.el?.matches(':focus-within') && this.locksWhileFocused) return;
    this.#release();
  };

  #onFocusIn = (): void => {
    this.#releaseLock ??= this.binding.lock();
  };

  #onFocusOut = (): void => {
    this.#release();
  };

  #release(): void {
    const release = this.#releaseLock;
    this.#releaseLock = null;
    release?.();
  }
}
