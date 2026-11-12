import { strictEquals, type Equals } from './equality.js';
import type { Notifier, Sampler, Scheduler, Writer } from './scheduler.js';

/** Converts between the raw property value and the binding's value (e.g. a color object to a packed number). */
export interface ValueCodec<T> {
  read(raw: unknown): T;
  /** Writes `value` into the target. Return a replacement to assign, or undefined when written in place. */
  write(value: T, current: unknown): unknown;
}

/** What a binding draws into. Views are attached only while their row is on screen. */
export interface BindingView<T> {
  readonly heavy: boolean;
  write(value: T): void;
}

/** What `change` and `finish` listeners of a binding receive. */
export interface ChangeEvent<T> {
  /** The binding's value. */
  value: T;
  /**
   * True for the final change of an interaction (release, Enter, blur) and for a value set from
   * code: the changes `finish` listeners receive.
   */
  last: boolean;
}

/** A listener of a binding's `change` or `finish` event. */
export type ChangeListener<T> = (event: ChangeEvent<T>) => void;

export interface BindingOptions<T> {
  equals?: Equals<T>;
  codec?: ValueCodec<T>;
  /** Milliseconds between samples; 0 samples every frame, -1 only on refresh(). */
  interval?: number;
  /** Refuses user proposals; programmatic set/refresh still use the normal binding contract. */
  readonly?: boolean;
}

/**
 * One property of one object, shown by at most one view.
 *
 * Model → view: while active, the scheduler samples the property each frame (or each
 * `interval`) and queues a write only when it differs from the last shown value.
 * View → model: `propose()` writes the property synchronously, so the application sees a drag
 * at pointer rate, and coalesces `change` listeners to once per frame.
 */
export class Binding<T> implements Sampler, Writer {
  slot = -1;
  queued = false;
  readonly notifier: Notifier;

  readonly target: Record<PropertyKey, unknown>;
  readonly key: PropertyKey;
  readonly readonly: boolean;
  /** Last value shown (or proposed). */
  value: T;
  interval: number;

  #view: BindingView<T> | null = null;
  #equals: Equals<T>;
  #codec: ValueCodec<T> | undefined;
  #scheduler: Scheduler;
  #due = 0;
  #locks = 0;
  #pendingChange = false;
  #pendingLast = false;
  #listeners: ChangeListener<T>[] = [];
  #finishListeners: ChangeListener<T>[] = [];
  #visible = false;
  #disposed = false;

  constructor(
    scheduler: Scheduler,
    target: object,
    key: PropertyKey,
    options: BindingOptions<T> = {},
  ) {
    this.#scheduler = scheduler;
    this.target = target as Record<PropertyKey, unknown>;
    this.key = key;
    this.#equals = options.equals ?? (strictEquals as Equals<T>);
    this.#codec = options.codec;
    this.interval = options.interval ?? 0;
    this.readonly = options.readonly ?? false;
    this.value = this.read();
    // A separate notifier object keeps the write and notify queue flags apart.
    const notifier: Notifier = {
      queued: false,
      notify: () => this.#notify(),
    };
    this.notifier = notifier;
  }

  get heavy(): boolean {
    return this.#view?.heavy ?? false;
  }

  get view(): BindingView<T> | null {
    return this.#view;
  }

  get locked(): boolean {
    return this.#locks > 0;
  }

  read(): T {
    const raw = this.target[this.key];
    return this.#codec ? this.#codec.read(raw) : (raw as T);
  }

  /** Attaches the view that shows this binding and writes the current value to it. */
  attach(view: BindingView<T>): void {
    this.#view = view;
    this.value = this.read();
    view.write(this.value);
  }

  detach(): void {
    this.#view = null;
  }

  /** Whether the row is on screen. Visible bindings are sampled; hidden ones cost nothing. */
  setVisible(visible: boolean): void {
    if (this.#disposed || visible === this.#visible) return;
    this.#visible = visible;
    this.#updateActivation();
  }

  /** Re-reads the property now and queues a write when it changed. */
  refresh(): void {
    const next = this.read();
    if (this.#equals(next, this.value)) return;
    this.value = next;
    if (this.#view) this.#scheduler.enqueueWrite(this);
  }

  sample(now: number): void {
    if (this.#locks > 0) return;
    if (this.interval > 0) {
      if (now < this.#due) return;
      this.#due = now + this.interval;
    }
    const next = this.read();
    if (this.#equals(next, this.value)) return;
    this.value = next;
    if (this.#view) this.#scheduler.enqueueWrite(this);
  }

  write(): void {
    this.#view?.write(this.value);
  }

  /**
   * A value from the view (a drag step, a keystroke, a pick). Written to the target at once;
   * listeners hear about it once per frame.
   */
  propose(value: T, last = false): void {
    if (this.readonly || this.#disposed) return;
    this.value = value;
    this.#assign(value);
    this.#pendingChange = true;
    if (last) this.#pendingLast = true;
    this.#scheduler.enqueueNotify(this.notifier);
  }

  /** A programmatic value: written to the target and the view, and announced as a final change. */
  set(value: T): void {
    if (this.#disposed) return;
    this.value = value;
    this.#assign(value);
    this.#pendingChange = true;
    this.#pendingLast = true;
    this.#scheduler.enqueueNotify(this.notifier);
    if (this.#view) this.#scheduler.enqueueWrite(this);
  }

  /** A value applied without announcing it, like a code default (e.g. restored from history). */
  load(value: T): void {
    if (this.#disposed) return;
    this.value = value;
    this.#assign(value);
    if (this.#view) this.#scheduler.enqueueWrite(this);
  }

  /** The interaction finished (release, Enter, blur): fires `finish` with the current value. */
  commit(): void {
    if (this.#disposed) return;
    this.#pendingLast = true;
    this.#pendingChange = true;
    this.#scheduler.enqueueNotify(this.notifier);
  }

  /**
   * Holds off sampling while the user interacts, so an application writing the same property
   * every frame does not pull the control away from the pointer. Returns the release function.
   */
  lock(): () => void {
    this.#locks++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#locks--;
      // Show whatever the application holds now that the user let go.
      if (this.#locks === 0) this.refresh();
    };
  }

  on(type: 'change' | 'finish', listener: ChangeListener<T>): () => void {
    const list = type === 'change' ? this.#listeners : this.#finishListeners;
    list.push(listener);
    return () => {
      const index = list.indexOf(listener);
      if (index !== -1) list.splice(index, 1);
    };
  }

  dispose(): void {
    this.#disposed = true;
    this.#scheduler.deactivate(this);
    this.#view = null;
    this.#listeners.length = 0;
    this.#finishListeners.length = 0;
  }

  setInterval(interval: number): void {
    this.interval = interval;
    this.#due = 0;
    this.#updateActivation();
  }

  #updateActivation(): void {
    if (this.#visible && this.interval >= 0) this.#scheduler.activate(this);
    else this.#scheduler.deactivate(this);
  }

  #assign(value: T): void {
    if (!this.#codec) {
      this.target[this.key] = value;
      return;
    }
    const replacement = this.#codec.write(value, this.target[this.key]);
    if (replacement !== undefined) this.target[this.key] = replacement;
  }

  #notify(): void {
    if (!this.#pendingChange) return;
    const last = this.#pendingLast;
    this.#pendingChange = false;
    this.#pendingLast = false;
    const event: ChangeEvent<T> = { value: this.value, last };
    for (const listener of this.#listeners) listener(event);
    if (last) for (const listener of this.#finishListeners) listener(event);
  }
}
